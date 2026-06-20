import { EventEmitter } from 'node:events';
import type { PrismaClient } from '@prisma/client';
import { canRead } from './permissions.js';

/**
 * Bus d'événements in-process pour le temps réel (SSE).
 *
 * Chaque événement est ciblé sur un utilisateur précis (le nom d'événement de
 * l'EventEmitter est son `userId`). Une connexion SSE s'abonne à son propre
 * `userId` et reçoit les événements qui la concernent. Le payload est un objet
 * JSON `{ kind, ... }` — la plupart des événements n'ont que `kind` (signal de
 * rafraîchissement), `typing` porte en plus `entryId` + `by`.
 *
 * In-process = suffisant tant que l'API tourne sur une seule instance (cas
 * Railway par défaut). Pour scaler en multi-replica, il faudrait remplacer cet
 * EventEmitter par un pub/sub partagé (Redis).
 */
export type ServerEventKind =
  | 'notification' // cloche
  | 'comment'      // fil de commentaires
  | 'reaction'     // réactions emoji
  | 'rating'       // favoris / nul d'une entrée
  | 'quiz'         // réponse de quiz (note QUIZZ)
  | 'entry'        // timeline (nouvelle/édition d'entrée)
  | 'topicRequest' // boîte à demandes
  | 'task'         // tâches
  | 'dailyLog'     // suivi quotidien
  | 'coupleDay'    // baromètre du couple
  | 'directMessage' // messagerie directe owner ↔ confident
  | 'presence'      // un membre du cercle vient de passer en ligne / hors ligne
  | 'sync';        // données Dexie de l'owner modifiées → re-pull (multi-appareils)

export type ServerEvent =
  | { kind: ServerEventKind }
  | { kind: 'typing'; entryId: string; by: string }
  | { kind: 'dmTyping'; conversationId: string; by: string };

const emitter = new EventEmitter();
// Une connexion SSE = un listener. On peut en avoir beaucoup (plusieurs
// onglets / appareils) → pas de limite, sinon warning Node intempestif.
emitter.setMaxListeners(0);

/**
 * Compteur de connexions SSE actives par utilisateur. Un user a ≥1 connexion
 * ⇒ « en ligne ». Le compteur monte/descend selon les ouvertures/fermetures
 * d'onglet / appareil. In-memory uniquement — single-instance only.
 */
const activeConnections = new Map<string, number>();

export function isUserOnline(userId: string): boolean {
  return (activeConnections.get(userId) ?? 0) > 0;
}

/**
 * Marque une nouvelle connexion SSE. Retourne `true` si l'utilisateur vient
 * de **passer en ligne** (transition 0→1), pour décider d'émettre `presence`
 * à son cercle. Les connexions suivantes (autres onglets) n'émettent rien.
 */
export function markUserOnline(userId: string): boolean {
  const n = activeConnections.get(userId) ?? 0;
  activeConnections.set(userId, n + 1);
  return n === 0;
}

/**
 * Décrémente le compteur. Retourne `true` si l'utilisateur vient de **passer
 * hors ligne** (dernier onglet fermé) — déclenche `presence` au cercle.
 */
export function markUserOffline(userId: string): boolean {
  const n = activeConnections.get(userId) ?? 0;
  if (n <= 1) {
    activeConnections.delete(userId);
    return n === 1; // transition 1→0 ; n===0 = double-close, on n'émet pas
  }
  activeConnections.set(userId, n - 1);
  return false;
}

function emitEvent(userId: string | null | undefined, event: ServerEvent): void {
  if (!userId) return;
  emitter.emit(userId, event);
}

/** Émet un événement temps réel vers un utilisateur précis. Best-effort. */
export function emitToUser(userId: string | null | undefined, kind: ServerEventKind): void {
  emitEvent(userId, { kind });
}

/**
 * Abonne une connexion SSE aux événements d'un utilisateur.
 * Retourne la fonction de désabonnement (à appeler à la fermeture).
 */
export function subscribeUser(
  userId: string,
  listener: (event: ServerEvent) => void,
): () => void {
  emitter.on(userId, listener);
  return () => emitter.off(userId, listener);
}

/**
 * Émet `kind` vers toute l'audience d'une entrée : son auteur (l'owner) ET
 * chaque confident qui peut la lire. Sert au temps réel des commentaires et
 * réactions — tous ceux qui voient le fil sont rafraîchis, quel que soit
 * l'auteur de l'action et indépendamment des préférences de notification.
 */
export async function emitToEntryAudience(
  db: PrismaClient,
  entry: Parameters<typeof canRead>[1],
  kind: ServerEventKind,
): Promise<void> {
  emitToUser(entry.authorId, kind);
  const guests = await db.user.findMany({
    where: { role: 'GUEST', invitedById: entry.authorId, revokedAt: null },
    select: { id: true, role: true, guestAccess: true, guestCanComment: true },
  });
  for (const g of guests) {
    if (canRead({ id: g.id, role: g.role, guestAccess: g.guestAccess, guestCanComment: g.guestCanComment }, entry)) {
      emitToUser(g.id, kind);
    }
  }
}

/**
 * Diffuse l'indicateur « est en train d'écrire » à l'audience d'une entrée
 * (auteur + confidents qui peuvent la lire), sauf l'émetteur lui-même.
 */
export async function emitTypingToEntryAudience(
  db: PrismaClient,
  entry: Parameters<typeof canRead>[1],
  entryId: string,
  by: string,
  typistUserId: string,
): Promise<void> {
  const event: ServerEvent = { kind: 'typing', entryId, by };
  if (entry.authorId !== typistUserId) emitEvent(entry.authorId, event);
  const guests = await db.user.findMany({
    where: { role: 'GUEST', invitedById: entry.authorId, revokedAt: null },
    select: { id: true, role: true, guestAccess: true, guestCanComment: true },
  });
  for (const g of guests) {
    if (g.id === typistUserId) continue;
    if (canRead({ id: g.id, role: g.role, guestAccess: g.guestAccess, guestCanComment: g.guestCanComment }, entry)) {
      emitEvent(g.id, event);
    }
  }
}

/**
 * Diffuse l'indicateur « est en train d'écrire » d'une conversation directe
 * vers l'autre participant uniquement. Éphémère, aucune écriture en base.
 */
export function emitDmTyping(
  recipientId: string | null | undefined,
  conversationId: string,
  by: string,
): void {
  emitEvent(recipientId, { kind: 'dmTyping', conversationId, by });
}

/**
 * Émet `kind` vers le « cercle » d'un owner : lui-même + tous ses confidents.
 * `exceptUserId` exclut l'auteur de l'action (qui a déjà la donnée à jour) — ou
 * l'owner lui-même quand l'événement le concerne déjà par ailleurs.
 */
export async function emitToOwnerCircle(
  db: PrismaClient,
  ownerId: string,
  kind: ServerEventKind,
  exceptUserId?: string,
): Promise<void> {
  if (ownerId !== exceptUserId) emitToUser(ownerId, kind);
  const guests = await db.user.findMany({
    where: { role: 'GUEST', invitedById: ownerId, revokedAt: null },
    select: { id: true },
  });
  for (const g of guests) {
    if (g.id !== exceptUserId) emitToUser(g.id, kind);
  }
}
