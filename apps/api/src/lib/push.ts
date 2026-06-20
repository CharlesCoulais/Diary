import webpush from 'web-push';
import type { PrismaClient } from '@prisma/client';
import { emitToUser } from './events.js';
import { isWithinSchedule } from './pushSchedule.js';

export const VAPID_PUBLIC  = (process.env.VAPID_PUBLIC_KEY  ?? '').trim();
const        VAPID_PRIVATE = (process.env.VAPID_PRIVATE_KEY ?? '').trim();
const        VAPID_EMAIL   = (process.env.VAPID_EMAIL       ?? 'mailto:denaosu@gmail.com').trim();

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try {
    webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
  } catch (e) {
    console.error('[VAPID] setVapidDetails failed:', e);
  }
} else {
  console.warn('[VAPID] missing env vars — push notifications disabled.');
}

export function displayName(user: { displayName: string | null; email: string }): string {
  return user.displayName ?? user.email.split('@')[0] ?? 'Quelqu\'un';
}

/** Préférence de notif push à respecter avant l'envoi. */
export type OwnerPushPref =
  | 'notifyOwnerComments'
  | 'notifyOwnerReactions'
  | 'notifyOwnerTaskChanges'
  | 'notifyOwnerRequests'
  | 'notifyOwnerSecurity'
  | 'notifyOwnerReadGate'         // owner : réponses des confidents au verrou
  | 'notifyOnReadGateDecision'    // guest : décisions de l'owner sur ma réponse
  | 'notifyOnCapsuleUnlock'       // owner + guest : capsule temporelle ouverte
  | 'notifyMessages';

/** Type de notification — sert à exclure certains types des modes silencieux/discret. */
export type PushKind = 'comment' | 'reaction' | 'task' | 'request' | 'entry' | 'message' | 'security' | 'readGate' | 'capsule';

export async function sendPushToUser(
  db: PrismaClient,
  userId: string,
  payload: { title: string; body: string; url?: string; timestamp?: number; icon?: string },
  options?: { respectPref?: OwnerPushPref; kind?: PushKind },
): Promise<void> {
  // Événement temps réel in-app (SSE) — émis avant la vérification de
  // préférence : désactiver le push OS ne doit pas figer le rafraîchissement
  // in-app (cloche, fil…).
  emitToUser(userId, 'notification');

  // Une seule lecture : préférences de notif discrète (+ champ respectPref) +
  // métadonnées de rôle pour appliquer la pause push owner→guest.
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      invitedById: true,
      pushDiscreet: true,
      pushDiscreetTitle: true,
      pushDiscreetBody: true,
      pushDiscreetIcon: true,
      pushDiscreetScheduled: true,
      pushDiscreetSchedule: true,
      pushSilent: true,
      pushSilentSchedule: true,
      pushImportantKinds: true,
      timezone: true,
      // Quand on envoie à un guest, on cherche aussi `pauseGuestPush` de
      // son owner (relation `invitedBy`). Inutile mais inoffensif si user
      // est un owner — Prisma renverra `invitedBy: null`.
      invitedBy: { select: { pauseGuestPush: true } },
      ...(options?.respectPref ? { [options.respectPref]: true } : {}),
    } as never,
  }) as null | {
    role: 'OWNER' | 'GUEST';
    invitedById: string | null;
    pushDiscreet: boolean;
    pushDiscreetTitle: string | null;
    pushDiscreetBody: string | null;
    pushDiscreetIcon: string | null;
    pushDiscreetScheduled: boolean;
    pushDiscreetSchedule: unknown;
    pushSilent: boolean;
    pushSilentSchedule: unknown;
    pushImportantKinds: string[];
    timezone: string | null;
    invitedBy: { pauseGuestPush: boolean } | null;
    [k: string]: unknown;
  };

  // Pause push owner→guest : si le destinataire est un confident et que son
  // owner a activé `pauseGuestPush`, on skip le push OS. L'événement SSE
  // in-app a déjà été émis plus haut → la cloche du confident reste à jour,
  // c'est juste qu'aucune notif ne sonne sur son téléphone.
  if (user?.role === 'GUEST' && user.invitedBy?.pauseGuestPush) {
    return;
  }

  if (options?.respectPref) {
    if (user && user[options.respectPref] === false) {
      return;
    }
  }

  // Type « important » (ex. connexion à un nouvel appareil) : contourne les
  // modes silencieux et discret — toujours délivré, en clair.
  const important = !!options?.kind
    && Array.isArray(user?.pushImportantKinds)
    && user.pushImportantKinds.includes(options.kind);

  // Mode silencieux (prioritaire) : pendant ses plages, aucune notification
  // push n'est envoyée. L'événement SSE in-app a déjà été émis plus haut —
  // la cloche reste donc à jour.
  if (!important && user?.pushSilent && isWithinSchedule(user.pushSilentSchedule, user.timezone)) {
    return;
  }

  // Mode discret : on remplace titre/texte/icône avant l'envoi — le contenu
  // réel n'est jamais transmis à l'appareil. Si un horaire est configuré, le
  // mode ne s'applique que pendant les plages définies.
  const discreetActive = !important && !!user?.pushDiscreet && (
    !user.pushDiscreetScheduled
    || isWithinSchedule(user.pushDiscreetSchedule, user.timezone)
  );
  let outgoing = payload;
  if (discreetActive && user) {
    outgoing = {
      ...payload,
      title: user.pushDiscreetTitle?.trim() || 'Rappel',
      body: user.pushDiscreetBody?.trim() || 'Nouvelle activité',
      icon: user.pushDiscreetIcon ? `/notif-icons/${user.pushDiscreetIcon}.svg` : undefined,
    };
  }

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.warn(`[push] skip user=${userId} — VAPID not configured`);
    return;
  }
  const subs = await db.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) {
    console.warn(`[push] skip user=${userId} — no push subscription registered`);
    return;
  }
  // timestamp en ms — l'OS l'affiche dans la notif (heure d'émission côté serveur,
  // plus précise que l'heure de réception côté client en cas de push différé).
  const json = JSON.stringify({ ...outgoing, url: outgoing.url ?? '/', timestamp: outgoing.timestamp ?? Date.now() });
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          json,
          // TTL 24h : si le device est hors-ligne/dormant, le push service
          // le délivrera à la prochaine reconnexion (vs perdu après 60 s).
          // urgency normal au lieu de high — high réveille moins souvent les
          // devices Android/iOS car réservé aux contenus critiques.
          { urgency: 'normal', TTL: 24 * 60 * 60 },
        );
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        const msg = e instanceof Error ? e.message : String(e);
        if (code === 410 || code === 404) {
          console.warn(`[push] subscription expirée (${code}) pour user=${userId} — supprimée`);
          await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => null);
        } else {
          console.error(`[push] échec envoi pour user=${userId} (status=${code ?? '?'}): ${msg}`);
        }
      }
    }),
  );
}
