import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { trpc } from '../lib/trpc';
import { showToast } from '../lib/toast';
import { CommentInput } from './CommentInput';
import { CommentContent } from './CommentContent';
import { ImageLightbox } from './ImageLightbox';
import { ReactionPill } from './EmojiReactionBar';
import { EmojiPicker } from './EmojiPicker';
import { GifPicker } from './GifPicker';
import { compressImage } from '../lib/imageUpload';
import { prepareVideo, type VideoMime } from '../lib/videoUpload';
import { useBackButtonClose } from '../hooks/useBackButtonClose';

interface Conversation {
  conversationId: string;
  otherName: string;
  otherUserId?: string;
  otherAvatarImageId?: string | null;
  otherOnline?: boolean;
  lastMessage: string | null;
  lastAt: string | Date | null;
  unreadCount: number;
}

interface AggregatedReaction {
  emoji: string;
  count: number;
  userIds: string[];
  users: { id: string; displayName: string | null; email: string }[];
}

interface Sender {
  id: string;
  displayName: string | null;
  email: string;
  role: string;
}

interface ReplyPreview {
  id: string;
  content: string;
  deletedAt: string | Date | null;
  senderId: string;
  gifUrl: string | null;
  sender: Sender;
  image: { id: string } | null;
  video: { id: string } | null;
}

interface Message {
  id: string;
  content: string;
  senderId: string;
  recipientId: string;
  createdAt: string | Date;
  editedAt: string | Date | null;
  readAt: string | Date | null;
  gifUrl: string | null;
  reactions: AggregatedReaction[];
  image: { id: string } | null;
  video: { id: string } | null;
  replyTo: ReplyPreview | null;
  version?: number; // concurrence optimiste : version connue par le client
}

type ImageMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

type PendingMedia =
  | { kind: 'image'; data: string; mimeType: ImageMime; size: number; previewUrl: string }
  | { kind: 'video'; data: string; mimeType: VideoMime; filename: string; size: number }
  | { kind: 'gif'; url: string };

// formatTime → formatTimestamp consolidé dans `lib/dateHelpers.ts`.
import { formatTimestamp as formatTime } from '../lib/dateHelpers';

function senderName(s: Sender): string {
  return s.displayName || s.email.split('@')[0] || s.email;
}

/** Aperçu textuel d'un message (pour la citation / le bandeau de réponse). */
function messagePreview(m: { content: string; gifUrl: string | null; image: { id: string } | null; video: { id: string } | null }): string {
  if (m.content) return m.content;
  if (m.image) return '📷 Photo';
  if (m.video) return '🎬 Vidéo';
  if (m.gifUrl) return 'GIF';
  return '';
}

function MessageBubble({
  message,
  isMine,
  currentUserId,
  onEdit,
  onDelete,
  onReply,
  onToggleReaction,
  onOpenImage,
  onJumpTo,
  onMediaLoad,
}: {
  message: Message;
  isMine: boolean;
  currentUserId: string;
  onEdit: (id: string, content: string, expectedVersion?: number) => void;
  onDelete: (id: string) => void;
  onReply: (m: Message) => void;
  onToggleReaction: (id: string, emoji: string) => void;
  onOpenImage: (url: string) => void;
  onJumpTo: (id: string) => void;
  onMediaLoad: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerBtnRef = useRef<HTMLButtonElement>(null);

  const startEdit = () => { setEditText(message.content); setEditing(true); };
  const saveEdit = () => {
    if (!editText.trim()) return;
    onEdit(message.id, editText.trim(), message.version);
    setEditing(false);
  };

  const imageUrl = message.image ? `/images/${message.image.id}` : message.gifUrl;
  const videoUrl = message.video ? `/videos/${message.video.id}` : null;
  const reply = message.replyTo;

  return (
    <div id={`dm-${message.id}`} className={`flex flex-col gap-0.5 ${isMine ? 'items-end' : 'items-start'}`}>
      {editing && (
        <div className="w-full flex flex-col gap-1.5">
          <CommentInput
            value={editText}
            onChange={setEditText}
            onSubmit={saveEdit}
            placeholder="Modifier le message…"
            size="lg"
          />
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-[11px] text-text-muted/60 hover:text-text-muted self-end pr-1"
          >
            Annuler
          </button>
        </div>
      )}
      <div className={`group flex items-end gap-1.5 max-w-[85%] ${editing ? 'hidden' : ''}`}>
        <div
          className={`rounded-2xl overflow-hidden text-sm leading-relaxed ${reply ? 'min-w-[170px]' : ''} ${
            isMine
              ? 'bg-accent/15 text-text-primary rounded-br-sm'
              : 'bg-bg-primary text-text-primary rounded-bl-sm'
          }`}
        >
          <>
              {reply && (
                <button
                  type="button"
                  onClick={() => onJumpTo(reply.id)}
                  className="flex items-stretch gap-2 w-full text-left px-2 pt-2"
                >
                  <span className="w-[3px] rounded-full bg-accent/60 shrink-0" />
                  {reply.image && (
                    <img src={`/images/${reply.image.id}`} alt="" className="w-9 h-9 rounded object-cover shrink-0" />
                  )}
                  {!reply.image && reply.gifUrl && (
                    <img src={reply.gifUrl} alt="" className="w-9 h-9 rounded object-cover shrink-0" />
                  )}
                  {!reply.image && !reply.gifUrl && reply.video && (
                    <span className="w-9 h-9 rounded bg-black/10 flex items-center justify-center text-sm shrink-0">🎬</span>
                  )}
                  <span className="min-w-0 flex-1 py-0.5">
                    <span className="block text-[11px] font-medium text-accent truncate">{senderName(reply.sender)}</span>
                    <span className="block text-[11px] text-text-muted/70 truncate">
                      {reply.deletedAt ? 'Message supprimé' : messagePreview(reply)}
                    </span>
                  </span>
                </button>
              )}
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt=""
                  onClick={() => onOpenImage(imageUrl)}
                  onLoad={onMediaLoad}
                  className="block max-w-full max-h-[280px] object-cover cursor-pointer"
                />
              )}
              {videoUrl && (
                <video src={videoUrl} controls onLoadedData={onMediaLoad} className="block max-w-full max-h-[280px]" />
              )}
              {message.content && (
                <div className="px-3 py-2">
                  <CommentContent content={message.content} />
                </div>
              )}
          </>
        </div>
        {!editing && (
          <div className="flex items-center gap-1 mb-1 opacity-60 [@media(hover:hover)]:opacity-30 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity duration-150">
            {confirmingDelete ? (
              <>
                <button type="button" onClick={() => onDelete(message.id)} className="text-[11px] text-danger font-medium">Oui</button>
                <button type="button" onClick={() => setConfirmingDelete(false)} className="text-[11px] text-text-muted hover:text-text-primary">Non</button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => onReply(message)} className="text-[12px] text-text-muted hover:text-accent transition-colors" title="Répondre">↩</button>
                <div className="relative">
                  <button
                    ref={pickerBtnRef}
                    type="button"
                    onClick={() => setPickerOpen((v) => !v)}
                    className="text-[12px] text-text-muted hover:text-accent transition-colors"
                    title="Réagir"
                  >
                    ☺
                  </button>
                  {pickerOpen && (
                    <EmojiPicker
                      triggerRef={pickerBtnRef}
                      onSelect={(emoji) => { onToggleReaction(message.id, emoji); setPickerOpen(false); }}
                      onClose={() => setPickerOpen(false)}
                    />
                  )}
                </div>
                {isMine && message.content && (
                  <button type="button" onClick={startEdit} className="text-[11px] text-text-muted hover:text-accent transition-colors" title="Modifier">✎</button>
                )}
                {isMine && (
                  <button type="button" onClick={() => setConfirmingDelete(true)} className="text-[11px] text-text-muted hover:text-danger transition-colors" title="Supprimer">✕</button>
                )}
              </>
            )}
          </div>
        )}
      </div>
      {message.reactions.length > 0 && (
        <div className="flex flex-wrap gap-1 px-1">
          {message.reactions.map((r) => (
            <ReactionPill
              key={r.emoji}
              reaction={r}
              currentUserId={currentUserId}
              onToggle={() => onToggleReaction(message.id, r.emoji)}
              size="compact"
            />
          ))}
        </div>
      )}
      <span className="text-[11px] text-text-muted/50 px-1">
        {formatTime(message.createdAt)}
        {message.editedAt && <span className="italic ml-1" title="Modifié">· modifié</span>}
      </span>
    </div>
  );
}

function ConversationView({ conversationId }: { conversationId: string }) {
  const utils = trpc.useUtils();
  const { data: me } = trpc.auth.me.useQuery();
  const { data: messages = [], isLoading } = trpc.directMessages.list.useQuery({ conversationId });
  const [text, setText] = useState('');
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [attachMenu, setAttachMenu] = useState(false);
  const [gifPicker, setGifPicker] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(0);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };
  const isNearBottom = () => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 400;
  };
  const handleMediaLoad = () => {
    if (isNearBottom()) requestAnimationFrame(scrollToBottom);
  };

  const refresh = () => {
    utils.directMessages.list.invalidate({ conversationId });
    utils.directMessages.conversations.invalidate();
    utils.directMessages.unreadCount.invalidate();
  };

  const sendMessage = trpc.directMessages.send.useMutation({ onSuccess: refresh });
  const editMessage = trpc.directMessages.edit.useMutation({
    onSuccess: refresh,
    onError: (error) => {
      // Concurrence optimiste : le message a changé ailleurs entre-temps.
      if (error.data?.code === 'CONFLICT') {
        refresh(); // recharge la dernière version
        showToast({ message: error.message, tone: 'warning' });
      }
    },
  });
  const deleteMessage = trpc.directMessages.delete.useMutation({ onSuccess: refresh });
  const toggleReaction = trpc.directMessages.toggleReaction.useMutation({ onSuccess: refresh });
  const markRead = trpc.directMessages.markRead.useMutation({
    onSuccess: () => {
      utils.directMessages.conversations.invalidate();
      utils.directMessages.unreadCount.invalidate();
    },
  });

  // Marque comme lus les messages reçus dès qu'ils apparaissent.
  useEffect(() => {
    if (me && messages.some((m) => m.senderId !== me.id && !m.readAt)) {
      markRead.mutate({ conversationId });
    }
  }, [messages, me, conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Défilement automatique : toujours à l'ouverture (premier chargement),
  // puis à chaque nouveau message si on est déjà en bas de la conversation.
  useEffect(() => {
    const prev = prevLenRef.current;
    prevLenRef.current = messages.length;
    if (messages.length === 0) return;
    if (prev === 0 || isNearBottom()) {
      requestAnimationFrame(scrollToBottom);
    }
  }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMediaError(null);
    compressImage(file)
      .then(({ data, mimeType, size }) => {
        setPendingMedia({
          kind: 'image',
          data,
          mimeType: mimeType as ImageMime,
          size,
          previewUrl: `data:${mimeType};base64,${data}`,
        });
      })
      .catch(() => setMediaError("Impossible de charger cette image."));
  };

  const handleVideoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMediaError(null);
    prepareVideo(file)
      .then((v) => setPendingMedia({ kind: 'video', ...v }))
      .catch((err: Error) => setMediaError(err.message));
  };

  const handleSend = () => {
    const content = text.trim();
    if (!content && !pendingMedia) return;
    sendMessage.mutate({
      conversationId,
      content: content || undefined,
      replyToId: replyTarget?.id,
      image: pendingMedia?.kind === 'image'
        ? { data: pendingMedia.data, mimeType: pendingMedia.mimeType, size: pendingMedia.size }
        : undefined,
      video: pendingMedia?.kind === 'video'
        ? { data: pendingMedia.data, mimeType: pendingMedia.mimeType, filename: pendingMedia.filename, size: pendingMedia.size }
        : undefined,
      gifUrl: pendingMedia?.kind === 'gif' ? pendingMedia.url : undefined,
    });
    setText('');
    setPendingMedia(null);
    setReplyTarget(null);
  };

  const handleReply = (m: Message) => {
    setReplyTarget(m);
    inputRef.current?.focus();
  };

  const jumpTo = (id: string) => {
    document.getElementById(`dm-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  if (!me) return null;

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-soft px-4 py-3 flex flex-col gap-3 min-h-[200px]">
        {isLoading && (
          <p className="text-xs text-text-muted/50 text-center">Chargement…</p>
        )}
        {!isLoading && messages.length === 0 && (
          <p className="text-xs text-text-muted/55 text-center italic">Pas encore de message — écris le premier.</p>
        )}
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            isMine={m.senderId === me.id}
            currentUserId={me.id}
            onEdit={(id, content, expectedVersion) => editMessage.mutate({ messageId: id, content, expectedVersion })}
            onDelete={(id) => deleteMessage.mutate({ messageId: id })}
            onReply={handleReply}
            onToggleReaction={(id, emoji) => toggleReaction.mutate({ messageId: id, emoji })}
            onOpenImage={setLightbox}
            onJumpTo={jumpTo}
            onMediaLoad={handleMediaLoad}
          />
        ))}
      </div>

      <div className="px-4 pt-2 pb-3 border-t border-text-muted/10">
        {mediaError && (
          <p className="text-xs text-danger/90 pb-1.5">{mediaError}</p>
        )}
        {replyTarget && (
          <div className="flex items-center gap-2 text-xs text-text-muted bg-bg-primary rounded-lg px-3 py-1.5 mb-1.5">
            <span className="truncate flex-1">
              ↩ {messagePreview(replyTarget).slice(0, 70)}
            </span>
            <button type="button" onClick={() => setReplyTarget(null)} className="shrink-0 hover:text-danger">✕</button>
          </div>
        )}
        {pendingMedia && (
          <div className="flex items-center gap-2 bg-bg-primary rounded-lg p-1.5 mb-1.5">
            {pendingMedia.kind === 'image' && (
              <img src={pendingMedia.previewUrl} alt="" className="w-12 h-12 rounded object-cover" />
            )}
            {pendingMedia.kind === 'gif' && (
              <img src={pendingMedia.url} alt="" className="w-12 h-12 rounded object-cover" />
            )}
            {pendingMedia.kind === 'video' && (
              <span className="text-xs text-text-muted truncate flex-1">🎬 {pendingMedia.filename}</span>
            )}
            <span className="flex-1 text-xs text-text-muted/60">
              {pendingMedia.kind === 'image' ? 'Image prête' : pendingMedia.kind === 'gif' ? 'GIF prêt' : 'Vidéo prête'}
            </span>
            <button type="button" onClick={() => setPendingMedia(null)} className="shrink-0 text-text-muted/60 hover:text-danger px-1">✕</button>
          </div>
        )}

        <div className="flex items-end gap-1.5 relative">
          {/* Bouton pièce jointe — hauteur 40px pour matcher le minHeight de la
              textarea, et l'icône reste alignée avec la ligne d'écriture (bas du
              pill) quand le composer s'étend en multi-ligne. */}
          <div className="relative h-10 shrink-0 flex items-center">
            <button
              type="button"
              onClick={() => { setAttachMenu((v) => !v); setGifPicker(false); }}
              className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full text-text-muted hover:text-accent hover:bg-text-muted/10 transition-colors"
              title="Joindre un média"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            {attachMenu && (
              <div className="absolute bottom-full left-0 mb-2 z-50 bg-bg-elevated border border-text-muted/15 rounded-xl shadow-xl py-1 w-36">
                <button type="button" onClick={() => { imageInputRef.current?.click(); setAttachMenu(false); }} className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-bg-primary/60">📷 Photo</button>
                <button type="button" onClick={() => { videoInputRef.current?.click(); setAttachMenu(false); }} className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-bg-primary/60">🎬 Vidéo</button>
                <button type="button" onClick={() => { setGifPicker(true); setAttachMenu(false); }} className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-bg-primary/60">🔍 GIF</button>
              </div>
            )}
          </div>

          <div className="flex-1">
            <CommentInput
              value={text}
              onChange={setText}
              onSubmit={handleSend}
              disabled={sendMessage.isPending}
              submitEnabled={!!text.trim() || !!pendingMedia}
              textareaRef={inputRef}
              dmConversationId={conversationId}
              placeholder="Écrire un message… (Ctrl+Entrée pour envoyer)"
            />
          </div>

          {gifPicker && (
            <GifPicker
              onSelect={(url) => { setPendingMedia({ kind: 'gif', url }); setGifPicker(false); }}
              onClose={() => setGifPicker(false)}
            />
          )}
        </div>

        <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
        <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoFile} />
      </div>

      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </>
  );
}

/**
 * Panneau de messagerie directe (feuille basse). Ouvert depuis le `ChatFab`.
 *
 * Affiche toujours la liste des conversations en premier (choix explicite du
 * destinataire), sauf deep-link depuis une notification push.
 */
export function ChatPanel({
  conversations,
  initialConversationId,
  onClose,
}: {
  conversations: Conversation[];
  initialConversationId: string | null;
  onClose: () => void;
}) {
  useBackButtonClose(true, onClose);

  const initial =
    initialConversationId && conversations.some((c) => c.conversationId === initialConversationId)
      ? initialConversationId
      : null;

  const [selected, setSelected] = useState<string | null>(initial);
  // Réduit en bulle flottante (desktop uniquement). État volontairement
  // **non-persisté** : à chaque réouverture depuis le sidebar, on repart en mode
  // panneau. Sinon une réduction de la veille bloque l'ouverture suivante.
  const [minimized, setMinimized] = useState(false);
  const current = conversations.find((c) => c.conversationId === selected);
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  // Si bulle ouverte alors qu'on n'a qu'une conversation, on saute l'écran "liste"
  // au prochain agrandissement → on tape direct dans la dernière conversation.
  const bubbleConversation = conversations.length === 1 ? conversations[0]! : null;
  const expandFromBubble = () => {
    if (bubbleConversation && !selected) setSelected(bubbleConversation.conversationId);
    setMinimized(false);
  };

  // ── Mode bulle (desktop + mobile) ──────────────────────────────────────────
  // Mobile : la bulle remplace la ChatFab (qui se masque quand `open` est true
  // dans ChatFab.tsx — voir le `!open && ...`) et flotte au-dessus du BottomNav
  // via `--chatfab-bottom`. Permet de garder la conversation ouverte sans tout
  // re-sélectionner après une navigation.
  if (minimized) {
    // Affiche l'initiale du correspondant si solo, sinon l'icône chat.
    const initial = bubbleConversation
      ? bubbleConversation.otherName.charAt(0).toUpperCase()
      : null;
    // Portal vers `document.body` : indispensable pour échapper au stacking
    // context du sidebar desktop (`z-30` sur le wrapper dans `App.tsx`), qui
    // sinon cape le `z-[55]` de la bulle en dessous du BackToTop (z-40).
    return createPortal(
      <button
        type="button"
        onClick={expandFromBubble}
        aria-label="Ouvrir la messagerie"
        title={bubbleConversation ? `Reprendre la conversation avec ${bubbleConversation.otherName}` : 'Ouvrir la messagerie'}
        style={{ bottom: 'var(--chatfab-bottom)' }}
        className="group fixed right-4 lg:right-[calc(100vw-var(--right-col-x,100vw)+1rem)] z-[55] inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-bg-elevated border border-text-muted/15 shadow-2xl hover:bg-accent/8 hover:border-accent/30 transition-all"
      >
        <span className="relative shrink-0">
          <span className="block w-10 h-10 rounded-full overflow-hidden bg-accent/15 text-accent font-semibold text-sm flex items-center justify-center">
            {bubbleConversation?.otherAvatarImageId ? (
              <img src={`/images/${bubbleConversation.otherAvatarImageId}`} alt="" className="w-full h-full object-cover" />
            ) : initial ?? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8A8.38 8.38 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
              </svg>
            )}
          </span>
          {/* Pastille "en ligne" — vert, en bas-droite, bordure pour se détacher. Posée
              en dehors du wrapper overflow-hidden pour ne pas être clippée par l'avatar. */}
          {bubbleConversation?.otherOnline && (
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-success border-2 border-bg-elevated" title="En ligne" />
          )}
          {totalUnread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[11px] font-bold flex items-center justify-center border-2 border-bg-elevated leading-none">
              {totalUnread > 9 ? '9+' : totalUnread}
            </span>
          )}
        </span>
        <span className="text-xs font-medium text-text-primary max-w-[140px] truncate">
          {bubbleConversation ? bubbleConversation.otherName : 'Messages'}
        </span>
      </button>,
      document.body,
    );
  }

  // Portal vers `document.body` : voir commentaire sur la bulle. Empêche le
  // sidebar `z-30` (App.tsx) de caper notre `z-[55]` sous le BackToTop.
  return createPortal(
    <>
      {/*
        Backdrop : seulement sur mobile (bottom sheet plein écran). Sur desktop,
        le chat flotte en bas-droite sans bloquer l'app — l'utilisateur peut
        continuer à scroller son journal en parallèle (UX type Messenger).
      */}
      <div className="fixed inset-0 z-40 bg-bg-primary/60 backdrop-blur-sm lg:hidden" onClick={onClose} />
      <div
        // z-[55] : passe au-dessus du BackToTop (z-40). Sur desktop, le chat
        // se positionne dans la colonne de gauche (juste à gauche du panneau
        // droit s'il existe) via `--right-col-x` géré par RightColumnTracker.
        // Si pas de panneau droit, fallback sur `right: 1rem` (right-4 classique).
        // Le calc s'applique uniquement à `lg:` — sur mobile, inset-x-0 reste.
        className="
          fixed z-[55] flex flex-col bg-bg-elevated shadow-2xl
          inset-x-0 bottom-0 max-h-[85dvh] rounded-t-3xl
          lg:inset-x-auto lg:bottom-4 lg:top-auto lg:w-[400px] lg:h-[600px] lg:max-h-[calc(100dvh-4rem)] lg:rounded-2xl lg:border lg:border-text-muted/10
          lg:right-[calc(100vw-var(--right-col-x,100vw)+1rem)]
        "
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-text-muted/10 lg:rounded-t-2xl">
          {selected && (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-text-muted hover:text-text-primary transition-colors"
              title="Toutes les conversations"
            >
              ←
            </button>
          )}
          {/* Avatar du correspondant dans le header (uniquement quand une conversation est ouverte) */}
          {selected && current && (
            <span className="relative shrink-0">
              <span className="block w-7 h-7 rounded-full overflow-hidden bg-accent/20 text-xs text-accent flex items-center justify-center">
                {current.otherAvatarImageId ? (
                  <img src={`/images/${current.otherAvatarImageId}`} alt="" className="w-full h-full object-cover" />
                ) : (
                  current.otherName.charAt(0).toUpperCase()
                )}
              </span>
              {current.otherOnline && (
                <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-success border-[1.5px] border-bg-elevated" />
              )}
            </span>
          )}
          <h2 className="flex-1 text-sm font-semibold text-text-primary flex items-center gap-2 min-w-0">
            <span className="truncate">{selected && current ? current.otherName : 'Messages'}</span>
            {selected && current?.otherOnline && (
              <span className="inline-flex items-center gap-1 text-[11px] font-normal text-success/80 shrink-0">
                en ligne
              </span>
            )}
          </h2>
          {/* Réduire en bulle — disponible mobile + desktop, pour garder la
              conversation ouverte sans devoir re-sélectionner le correspondant. */}
          <button
            type="button"
            onClick={() => setMinimized(true)}
            aria-label="Réduire en bulle"
            title="Réduire"
            className="inline-flex text-text-muted/60 hover:text-text-primary transition-colors p-1 -m-1"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted/60 hover:text-danger transition-colors"
            title="Fermer"
          >
            ✕
          </button>
        </div>

        {selected ? (
          <ConversationView conversationId={selected} />
        ) : (
          <div className="overflow-y-auto scrollbar-soft py-2">
            {conversations.map((c) => (
              <button
                key={c.conversationId}
                type="button"
                onClick={() => setSelected(c.conversationId)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-bg-primary/60 transition-colors text-left"
              >
                {/* Wrapper externe sans overflow → pastille en ligne non clippée.
                    Wrapper interne avec overflow-hidden → image arrondie propre. */}
                <span className="relative shrink-0">
                  <span className="block w-9 h-9 rounded-full overflow-hidden bg-accent/20 text-sm text-accent flex items-center justify-center">
                    {c.otherAvatarImageId ? (
                      <img src={`/images/${c.otherAvatarImageId}`} alt="" className="w-full h-full object-cover" />
                    ) : (
                      c.otherName.charAt(0).toUpperCase()
                    )}
                  </span>
                  {c.otherOnline && (
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-success border-2 border-bg-elevated" title="En ligne" />
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-text-primary">{c.otherName}</span>
                  <span className="block text-xs text-text-muted/60 truncate">
                    {c.lastMessage ?? 'Pas encore de message'}
                  </span>
                </span>
                {c.unreadCount > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[11px] font-bold flex items-center justify-center">
                    {c.unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}
