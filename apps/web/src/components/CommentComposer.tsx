import { useRef, useState } from 'react';
import { CommentInput } from './CommentInput';
import { GifPicker } from './GifPicker';
import { compressImage } from '../lib/imageUpload';
import { useDropdownAlign } from '../lib/useDropdownAlign';

type ImageMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

type PendingMedia =
  | { kind: 'image'; data: string; mimeType: ImageMime; size: number; previewUrl: string }
  | { kind: 'gif'; url: string };

export interface CommentSendPayload {
  content: string;
  image?: { data: string; mimeType: ImageMime; size: number };
  gifUrl?: string;
}

/**
 * Composer de commentaire avec support des médias : texte + image jointe
 * ou GIF (fichier ou recherche Giphy). Gère son propre état texte/média et
 * se vide après envoi. Utilisé pour la création d'un commentaire (pas l'édition).
 */
export function CommentComposer({
  entryId,
  placeholder,
  size = 'sm',
  disabled,
  textareaRef,
  onSend,
}: {
  entryId: string;
  placeholder?: string;
  size?: 'sm' | 'lg';
  disabled?: boolean;
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  onSend: (payload: CommentSendPayload) => void;
}) {
  const [text, setText] = useState('');
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [attachMenu, setAttachMenu] = useState(false);
  const [gifPicker, setGifPicker] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const { panelRef: attachPanelRef, panelStyle: attachPanelStyle } = useDropdownAlign<HTMLDivElement>(attachMenu);

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMediaError(null);
    compressImage(file)
      .then(({ data, mimeType, size: s }) => {
        setPendingMedia({
          kind: 'image',
          data,
          mimeType: mimeType as ImageMime,
          size: s,
          previewUrl: `data:${mimeType};base64,${data}`,
        });
      })
      .catch((err: Error) => setMediaError(err.message || "Impossible de charger cette image."));
  };

  const handleSend = () => {
    const content = text.trim();
    if (!content && !pendingMedia) return;
    onSend({
      content,
      image: pendingMedia?.kind === 'image'
        ? { data: pendingMedia.data, mimeType: pendingMedia.mimeType, size: pendingMedia.size }
        : undefined,
      gifUrl: pendingMedia?.kind === 'gif' ? pendingMedia.url : undefined,
    });
    setText('');
    setPendingMedia(null);
  };

  // (spoiler — bouton ◐ dans la toolbar de CommentInput, géré via TOOLS)

  return (
    <div className="flex flex-col gap-1.5">
      {mediaError && <p className="text-xs text-danger/90">{mediaError}</p>}

      {pendingMedia && (
        <div className="flex items-center gap-2 bg-bg-primary rounded-lg p-1.5">
          <img
            src={pendingMedia.kind === 'image' ? pendingMedia.previewUrl : pendingMedia.url}
            alt=""
            className="w-12 h-12 rounded object-cover"
          />
          <span className="flex-1 text-xs text-text-muted/60">
            {pendingMedia.kind === 'image' ? 'Image prête' : 'GIF prêt'}
          </span>
          <button type="button" onClick={() => setPendingMedia(null)} className="shrink-0 text-text-muted/60 hover:text-danger px-1">✕</button>
        </div>
      )}

      <div className="flex items-center gap-1.5 relative">
        <div className="relative">
          <button
            type="button"
            onClick={() => { setAttachMenu((v) => !v); setGifPicker(false); }}
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full text-text-muted hover:text-accent hover:bg-text-muted/10 transition-colors"
            title="Joindre un média"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          {attachMenu && (
            <div ref={attachPanelRef} style={attachPanelStyle} className="absolute bottom-full left-0 mb-2 z-50 bg-bg-elevated border border-text-muted/15 rounded-xl shadow-xl py-1 w-36">
              <button type="button" onClick={() => { imageInputRef.current?.click(); setAttachMenu(false); }} className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-bg-primary/60">📷 Image</button>
              <button type="button" onClick={() => { setGifPicker(true); setAttachMenu(false); }} className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-bg-primary/60">🔍 GIF</button>
            </div>
          )}
        </div>

        <div className="flex-1">
          <CommentInput
            value={text}
            onChange={setText}
            onSubmit={handleSend}
            disabled={disabled}
            submitEnabled={!!text.trim() || !!pendingMedia}
            placeholder={placeholder}
            size={size}
            entryId={entryId}
            textareaRef={textareaRef}
            enableMentions
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
    </div>
  );
}
