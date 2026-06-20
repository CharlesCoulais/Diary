import { useRef, useState } from 'react';
import { trpc } from '../lib/trpc';
import { commentAuthorName as authorName } from '../lib/commentAuthor';
import { useCommentMutations } from '../lib/useCommentMutations';
import { CommentInput } from './CommentInput';
import { CommentComposer } from './CommentComposer';
import { CommentContent } from './CommentContent';
import { CommentMedia } from './CommentMedia';

interface Author {
  id: string;
  displayName: string | null;
  email: string;
  role: string;
}

interface Comment {
  id: string;
  content: string;
  gifUrl?: string | null;
  image?: { id: string } | null;
  parentId: string | null;
  createdAt: string | Date;
  updatedAt?: string | Date;
  deletedAt: string | Date | null;
  version?: number; // concurrence optimiste : version connue par le client
  author: Author;
}

// formatTime → formatTimestamp consolidé dans `lib/dateHelpers.ts`.
import { formatTimestamp as formatTime } from '../lib/dateHelpers';

function CommentBubble({
  comment,
  onReply,
  onDelete,
  onEdit,
  currentUserId,
  isOwner,
}: {
  comment: Comment;
  onReply?: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, content: string, expectedVersion?: number) => void;
  currentUserId: string;
  isOwner: boolean;
}) {
  const isMine = comment.author.id === currentUserId;
  const deleted = !!comment.deletedAt;
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const startEdit = () => { setEditText(comment.content); setEditing(true); };
  const cancelEdit = () => setEditing(false);
  const saveEdit = () => {
    if (!editText.trim()) return;
    onEdit(comment.id, editText.trim(), comment.version);
    setEditing(false);
  };

  return (
    <div className={`flex flex-col gap-0.5 ${isMine ? 'items-end' : 'items-start'}`}>
      {/* Nom coloré par rôle (accent = moi, coral = l'autre) + « Moi » — même
          convention que la bulle d'AnnotatedReader (FEED-09 : distinction
          owner/confident cohérente entre toutes les surfaces de commentaires). */}
      <div className={`flex items-baseline gap-2 px-1 ${isMine ? 'flex-row-reverse' : ''}`}>
        <span className="text-[11px] font-semibold" style={{ color: isMine ? 'var(--color-accent)' : 'var(--color-guest)' }}>
          {isMine ? 'Moi' : authorName(comment.author)}
        </span>
        <span className="text-[11px] text-text-muted/50">
          {formatTime(comment.createdAt)}
          {comment.updatedAt && new Date(comment.updatedAt).getTime() - new Date(comment.createdAt).getTime() > 5000 && (
            <span className="italic ml-1" title="Édité">· modifié</span>
          )}
        </span>
      </div>
      {editing ? (
        <div className="w-full flex flex-col gap-1.5">
          <CommentInput
            value={editText}
            onChange={setEditText}
            onSubmit={saveEdit}
            placeholder="Modifier le commentaire…"
            size="lg"
            enableMentions
          />
          <button
            type="button"
            onClick={cancelEdit}
            className="text-[11px] text-text-muted/60 hover:text-text-muted self-end pr-1"
          >
            Annuler
          </button>
        </div>
      ) : null}
      <div className={`group flex items-end gap-1.5 max-w-[85%] ${editing ? 'hidden' : ''}`}>
        {!isMine && (
          <span className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-[11px] text-accent shrink-0 mb-0.5">
            {authorName(comment.author as Author | undefined).charAt(0).toUpperCase()}
          </span>
        )}
        <div
          className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
            isMine
              ? 'bg-accent/15 text-text-primary rounded-br-sm'
              : 'bg-bg-primary text-text-primary rounded-bl-sm'
          } ${deleted ? 'opacity-40 italic' : ''}`}
        >
          {deleted ? 'Message supprimé' : (
            <>
              {comment.content && <CommentContent content={comment.content} />}
              <CommentMedia image={comment.image} gifUrl={comment.gifUrl} />
            </>
          )}
        </div>
        {!deleted && !editing && (
          <div className={`flex gap-1 mb-1 transition-opacity duration-150 ${isMine || isOwner ? 'opacity-60 sm:opacity-30 group-hover:opacity-100' : 'opacity-40 sm:opacity-0 group-hover:opacity-100'}`}>
            {confirmingDelete ? (
              <>
                <button type="button" onClick={() => onDelete(comment.id)} className="text-[11px] text-danger font-medium">Oui</button>
                <button type="button" onClick={() => setConfirmingDelete(false)} className="text-[11px] text-text-muted hover:text-text-primary">Non</button>
              </>
            ) : (
              <>
                {onReply && !isMine && (
                  <button type="button" onClick={() => onReply(comment.id)} className="text-[11px] text-text-muted hover:text-accent transition-colors" title="Répondre" aria-label="Répondre">↩</button>
                )}
                {isMine && (
                  <button type="button" onClick={startEdit} className="text-[11px] text-text-muted hover:text-accent transition-colors" title="Modifier" aria-label="Modifier">✎</button>
                )}
                {(isMine || isOwner) && (
                  <button type="button" onClick={() => setConfirmingDelete(true)} className="text-[11px] text-text-muted hover:text-danger transition-colors" title="Supprimer" aria-label="Supprimer">✕</button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function CommentThread({
  entryId,
  commentsLocked,
}: {
  entryId: string;
  commentsLocked: boolean;
}) {
  const { data: me } = trpc.auth.me.useQuery();
  const { data: comments = [], isLoading } = trpc.comments.list.useQuery({ entryId });
  // Surface sans compteur local (capsule scellée / carte secrète) → syncLocalCount off.
  const { addComment, editComment, deleteComment } = useCommentMutations(entryId);

  const [replyTo, setReplyTo] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  if (!me) return null;
  const isOwner = me.role === 'OWNER';

  const roots = comments.filter((c) => !c.parentId);
  const repliesOf = (parentId: string) => comments.filter((c) => c.parentId === parentId);

  const handleReply = (commentId: string) => {
    setReplyTo(commentId);
    inputRef.current?.focus();
  };

  const replyTarget = replyTo ? (comments.find((c) => c.id === replyTo) ?? null) : null;

  return (
    <div className="mt-4 pt-4 border-t border-text-muted/10 flex flex-col gap-3">
      {isLoading && (
        <p className="text-xs text-text-muted/50 text-center">Chargement…</p>
      )}

      {roots.length === 0 && !isLoading && (
        <p className="text-xs text-text-muted/55 text-center italic">Pas encore de commentaire</p>
      )}

      {roots.map((root) => (
        <div key={root.id} className="flex flex-col gap-1.5">
          <CommentBubble
            comment={root}
            onReply={isOwner ? handleReply : undefined}
            onDelete={(id) => deleteComment.mutate({ commentId: id })}
            onEdit={(id, content, expectedVersion) => editComment.mutate({ commentId: id, content, expectedVersion })}
            currentUserId={me.id}
            isOwner={isOwner}
          />
          {repliesOf(root.id).map((reply) => (
            <div key={reply.id} className="ml-8">
              <CommentBubble
                comment={reply}
                onDelete={(id) => deleteComment.mutate({ commentId: id })}
                onEdit={(id, content, expectedVersion) => editComment.mutate({ commentId: id, content, expectedVersion })}
                currentUserId={me.id}
                isOwner={isOwner}
              />
            </div>
          ))}
        </div>
      ))}

      {!commentsLocked && (
        <div className="flex flex-col gap-1.5">
          {replyTarget && (
            <div className="flex items-center gap-2 text-xs text-text-muted bg-bg-primary rounded-lg px-3 py-1.5">
              <span className="truncate flex-1">↩ {authorName(replyTarget.author)} : {replyTarget.content.slice(0, 60)}</span>
              <button type="button" onClick={() => setReplyTo(null)} className="shrink-0 hover:text-danger">✕</button>
            </div>
          )}
          <CommentComposer
            entryId={entryId}
            disabled={addComment.isPending}
            textareaRef={inputRef}
            onSend={({ content, image, gifUrl }) => {
              addComment.mutate({
                entryId,
                content: content || undefined,
                image,
                gifUrl,
                parentId: replyTo ?? undefined,
              });
              setReplyTo(null);
            }}
          />
        </div>
      )}
      {commentsLocked && (
        <p className="text-xs text-text-muted/55 text-center italic">Commentaires verrouillés</p>
      )}
    </div>
  );
}
