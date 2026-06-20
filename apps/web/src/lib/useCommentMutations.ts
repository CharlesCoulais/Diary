import { trpc } from './trpc';
import { showToast } from './toast';
import { db } from './db/schema';

/**
 * Mutations de commentaires partagées par les deux surfaces de fil
 * (`AnnotatedReader` et `CommentThread`) : `add` / `edit` / `delete` avec
 * l'invalidation et le **toast de concurrence optimiste (`CONFLICT`)** qui
 * doivent rester identiques des deux côtés.
 *
 * `syncLocalCount` (côté owner / surfaces qui affichent un compteur en carte) :
 * invalide aussi `comments.count` et met à jour `Entry.commentsCount` dans
 * IndexedDB pour un retour immédiat. Les surfaces sans compteur local
 * (capsules scellées, cartes secrètes) le laissent à `false`.
 */
export function useCommentMutations(entryId: string, opts?: { syncLocalCount?: boolean }) {
  const syncLocalCount = opts?.syncLocalCount ?? false;
  const utils = trpc.useUtils();

  const bumpLocalCount = (delta: 1 | -1) => {
    if (!syncLocalCount) return;
    utils.comments.count.invalidate({ entryId });
    void db.entries.where('id').equals(entryId).modify((e) => {
      e.commentsCount = delta === 1
        ? (e.commentsCount ?? 0) + 1
        : Math.max(0, (e.commentsCount ?? 1) - 1);
    });
  };

  const addComment = trpc.comments.add.useMutation({
    onSuccess: () => {
      utils.comments.list.invalidate({ entryId });
      bumpLocalCount(1);
    },
  });

  const editComment = trpc.comments.edit.useMutation({
    onSuccess: () => utils.comments.list.invalidate({ entryId }),
    onError: (error) => {
      // Concurrence optimiste : le commentaire a changé ailleurs entre-temps.
      if (error.data?.code === 'CONFLICT') {
        void utils.comments.list.invalidate({ entryId }); // recharge la dernière version
        showToast({ message: error.message, tone: 'warning' });
      }
    },
  });

  const deleteComment = trpc.comments.delete.useMutation({
    onSuccess: () => {
      utils.comments.list.invalidate({ entryId });
      bumpLocalCount(-1);
    },
  });

  return { addComment, editComment, deleteComment };
}
