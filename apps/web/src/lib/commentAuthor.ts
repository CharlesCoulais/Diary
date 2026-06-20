/**
 * Nom d'affichage d'un auteur de commentaire — source unique partagée par les
 * deux surfaces de fil (`AnnotatedReader` et `CommentThread`).
 */
export function commentAuthorName(
  a: { displayName?: string | null; email: string } | undefined,
): string {
  if (!a) return '?';
  return a.displayName || a.email.split('@')[0] || a.email;
}
