import type { GuestAccess, UserRole } from '@prisma/client';

type PermUser = {
  id: string;
  role: UserRole;
  guestAccess: GuestAccess | null;
  guestCanComment: boolean;
};

type PermEntry = {
  authorId: string;
  visibility: 'PRIVATE' | 'SHARED_ALL' | 'SHARED_SPECIFIC';
  commentsLocked: boolean;
  isSecret?: boolean;
  shares: Array<{ receiverId: string; canComment: boolean }>;
};

/**
 * Résout l'owner dont on lit les récaps mensuels selon le viewer : l'owner lit
 * les siens, un confident CONFIDANT lit ceux de l'owner qui l'a invité. Les
 * autres guests (ALL/SPECIFIC) n'ont pas accès aux récaps (jugés intimes) → null.
 *
 * ⚠️ Choix assumé (juin 2026) : le récap exposé au CONFIDANT inclut le résumé des
 * notes secret/adulte. La garantie « secret invisible au confident » NE s'applique
 * PAS au récap mensuel (contrairement à `canRead`, qui refuse les notes secret).
 */
export function recapOwnerIdFor(
  user: { id: string; role: string; guestAccess?: string | null; invitedById?: string | null },
): string | null {
  if (user.role === 'GUEST') {
    if (user.guestAccess !== 'CONFIDANT' || !user.invitedById) return null;
    return user.invitedById;
  }
  return user.id;
}

export function canRead(
  user: PermUser,
  entry: Pick<PermEntry, 'authorId' | 'visibility' | 'shares' | 'isSecret'>,
): boolean {
  if (user.role === 'OWNER') return user.id === entry.authorId;
  // Boîte de Pandore — personne d'autre que le propriétaire ne peut lire
  if (entry.isSecret) return false;
  if (user.guestAccess === 'CONFIDANT') return true;
  if (entry.visibility === 'PRIVATE') return false;
  if (entry.visibility === 'SHARED_ALL') return user.guestAccess === 'ALL';
  return entry.shares.some((s) => s.receiverId === user.id);
}

/**
 * Canal latéral d'interaction (commentaires + réactions emoji) — plus permissif que `canRead`.
 * Un confident peut commenter / réagir même sur une note secrète : c'est un soutien
 * symbolique qui ne révèle pas le contenu (les commentaires sont une conversation séparée).
 */
export function canInteract(
  user: PermUser,
  entry: Pick<PermEntry, 'authorId' | 'visibility' | 'shares' | 'isSecret'>,
): boolean {
  if (user.role === 'OWNER') return user.id === entry.authorId;
  if (user.guestAccess === 'CONFIDANT') return true; // y compris notes secrètes
  return canRead(user, entry);
}

export function canComment(user: PermUser, entry: PermEntry): boolean {
  if (!canInteract(user, entry)) return false;
  if (entry.commentsLocked) return false;
  if (user.role === 'OWNER') return true;
  if (user.guestAccess === 'CONFIDANT') return true;
  if (user.guestCanComment) return true;
  const share = entry.shares.find((s) => s.receiverId === user.id);
  return share?.canComment ?? false;
}
