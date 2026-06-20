/**
 * Délai de grâce pendant lequel un brouillon reste invisible aux guests, même si
 * la visibilité l'autoriserait — laisse à l'owner le temps d'écrire/réécrire sans
 * être observé en direct.
 */
export const DRAFT_GRACE_MS = 48 * 60 * 60 * 1000;

/**
 * `true` si le brouillon est encore dans la fenêtre de grâce — i.e. invisible
 * aux guests même si la visibilité l'autoriserait. Utilisé côté UI pour décider
 * si un minuteur de publication différée a du sens.
 */
export function isDraftStillHidden(createdAt: Date | string, isDraft: boolean): boolean {
  if (!isDraft) return false;
  const ts = typeof createdAt === 'string' ? new Date(createdAt).getTime() : createdAt.getTime();
  return Date.now() - ts < DRAFT_GRACE_MS;
}
