import { trpc } from './trpc';

/**
 * Compte les fils « à répondre » = ceux où je ne suis pas le dernier auteur et
 * le fil n'est pas résolu (todo qui persiste jusqu'à ma réponse ou la clôture,
 * cf. BUG-04). Dédupliqué par (entryId, anchorText) **exactement comme
 * `CommentsActivity`** pour que les badges de nav restent cohérents avec les
 * compteurs de la page Fil. Source unique — ne pas re-dupliquer cette logique.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function countToReply(items: any[] | undefined, currentUserId: string): number {
  if (!items || !currentUserId) return 0;
  const seen = new Set<string>();
  let n = 0;
  for (const item of items) {
    const key = `${item.entry.id}::${item.anchorText ?? '__general__'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (item.entry.commentsResolved) continue;
    if (item.author?.id === currentUserId) continue;
    n++;
  }
  return n;
}

/**
 * Hook partagé par toutes les surfaces de nav (BottomNav, sidebar, top bars) :
 * interroge `comments.activity` (options de cache cohérentes, partage le même
 * cache React Query que la page Fil) et renvoie le nombre de fils « à répondre ».
 */
export function useFilToReplyCount(enabled = true): number {
  const { data: me } = trpc.auth.me.useQuery(undefined, { staleTime: 60_000 });
  const { data } = trpc.comments.activity.useQuery(undefined, {
    enabled,
    staleTime: 30_000,
    refetchInterval: 180_000,
  });
  return countToReply(data, me?.id ?? '');
}
