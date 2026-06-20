import type { PrismaClient } from '@prisma/client';
import { canRead, canInteract } from './permissions.js';
import { sendPushToUser, displayName } from './push.js';

/**
 * Token de mention sérialisé dans le markdown (notes ET commentaires) :
 *   [@Prénom](mention:userId)
 * Dégrade proprement en « @Prénom » partout où le markdown est juste strippé
 * (preview, recherche, export). L'id est une réf stable (cuid).
 */
const MENTION_RE = /\[@[^\]\n]+\]\(mention:([\w-]+)\)/g;

/** Extrait la liste (dédupliquée) des userId mentionnés dans un contenu markdown. */
export function extractMentionIds(content: string | null | undefined): string[] {
  if (!content) return [];
  const ids = new Set<string>();
  MENTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_RE.exec(content)) !== null) {
    if (m[1]) ids.add(m[1]);
  }
  return [...ids];
}

const ENTRY_PERM_SELECT = {
  id: true,
  authorId: true,
  visibility: true,
  isSecret: true,
  commentsLocked: true,
  shares: { select: { receiverId: true, canComment: true } },
} as const;

type Actor = { id: string; displayName: string | null; email: string };

/**
 * Cœur partagé : pour chaque personne mentionnée encore active, vérifie l'accès
 * (porte fournie par l'appelant : `canRead` pour une note, `canInteract` pour un
 * commentaire — le fil de commentaires est un canal partagé visible même sur une
 * note secrète), puis crée la notif + push. Idempotent : ne re-notifie jamais
 * deux fois la même personne pour la même note/le même commentaire (re-sync,
 * édition…). On ne se notifie jamais soi-même.
 *
 * ⚠️ Décision (juin 2026) : une mention dans une note que la personne n'a pas le
 * droit de lire (note secrète, ou note non partagée avec elle) ne déclenche
 * AUCUNE notif — cohérent avec « secret invisible au confident ».
 */
async function notify(
  db: PrismaClient,
  actor: Actor,
  mentionedIds: string[],
  channel: 'note' | 'comment',
  entryFields: {
    id: string;
    authorId: string;
    visibility: 'PRIVATE' | 'SHARED_ALL' | 'SHARED_SPECIFIC';
    isSecret: boolean;
    commentsLocked: boolean;
    shares: Array<{ receiverId: string; canComment: boolean }>;
  },
  commentId?: string,
): Promise<void> {
  const targets = mentionedIds.filter((id) => id !== actor.id);
  if (targets.length === 0) return;

  const users = await db.user.findMany({
    where: { id: { in: targets }, revokedAt: null },
    select: { id: true, role: true, guestAccess: true, guestCanComment: true },
  });

  for (const u of users) {
    const permUser = { id: u.id, role: u.role, guestAccess: u.guestAccess, guestCanComment: u.guestCanComment };
    const allowed = channel === 'comment'
      ? canInteract(permUser, entryFields)
      : canRead(permUser, entryFields);
    if (!allowed) continue;

    // Idempotence : une seule notif de mention par (personne, note|commentaire).
    const existing = await db.notification.findFirst({
      where: commentId
        ? { userId: u.id, type: 'MENTION_NEW', commentId }
        : { userId: u.id, type: 'MENTION_NEW', entryId: entryFields.id, commentId: null },
      select: { id: true },
    }).catch(() => null);
    if (existing) continue;

    await db.notification.create({
      data: {
        userId: u.id,
        type: 'MENTION_NEW',
        entryId: entryFields.id,
        commentId: commentId ?? null,
      },
    }).catch(() => null);

    void sendPushToUser(db, u.id, {
      title: `${displayName(actor)} t'a mentionné·e ✦`,
      body: channel === 'comment' ? 'dans un commentaire' : 'dans une note',
      url: `/?entryId=${entryFields.id}${commentId ? `&commentId=${commentId}` : ''}`,
    }, { kind: 'comment' }).catch(() => null);
  }
}

/** Mentions dans le contenu d'une note. Porte d'accès = `canRead` (visibilité du contenu). */
export async function notifyEntryMentions(
  db: PrismaClient,
  actor: Actor,
  entryId: string,
  content: string | null | undefined,
): Promise<void> {
  const ids = extractMentionIds(content);
  if (ids.length === 0) return;
  const entry = await db.entry.findUnique({ where: { id: entryId }, select: ENTRY_PERM_SELECT });
  if (!entry) return;
  await notify(db, actor, ids, 'note', entry);
}

/** Mentions dans un commentaire. Porte d'accès = `canInteract` (canal latéral partagé). */
export async function notifyCommentMentions(
  db: PrismaClient,
  actor: Actor,
  comment: { id: string; entryId: string },
  content: string | null | undefined,
): Promise<void> {
  const ids = extractMentionIds(content);
  if (ids.length === 0) return;
  const entry = await db.entry.findUnique({ where: { id: comment.entryId }, select: ENTRY_PERM_SELECT });
  if (!entry) return;
  await notify(db, actor, ids, 'comment', entry, comment.id);
}
