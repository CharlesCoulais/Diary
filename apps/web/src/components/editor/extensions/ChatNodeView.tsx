import { useMemo, useRef, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { parseChatBody, detectAndReformat } from '../../../lib/parseChat';
import { ChatDisplay, PLATFORM_LABEL, parseAliases, serializeAliases } from '../../ChatDisplay';
import { uploadImage } from '../../../lib/imageUpload';

export function ChatNodeView({ node, updateAttributes, editor }: NodeViewProps) {
  const { platform, title, raw, me, aliases } = node.attrs as { platform: string; title: string; raw: string; me: string; aliases: string };
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(raw);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftPlatform, setDraftPlatform] = useState(platform);
  const [draftMe, setDraftMe] = useState(me);
  const [draftAliases, setDraftAliases] = useState<Map<string, string>>(() => parseAliases(aliases));
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const draftMessages = useMemo(() => parseChatBody(draft), [draft]);
  const detectedAuthors = useMemo(() => {
    const set = new Set<string>();
    for (const m of draftMessages) set.add(m.author);
    return Array.from(set);
  }, [draftMessages]);

  const insertAtCursor = (text: string) => {
    const ta = textareaRef.current;
    if (!ta) { setDraft(draft + (draft.endsWith('\n') || !draft ? '' : '\n') + text); return; }
    const { selectionStart, selectionEnd } = ta;
    const before = draft.slice(0, selectionStart);
    const after = draft.slice(selectionEnd);
    // Insère sur sa propre ligne : on s'assure d'avoir un \n avant si nécessaire
    const prefix = before && !before.endsWith('\n') ? '\n' : '';
    const next = before + prefix + text + (after.startsWith('\n') ? '' : '\n') + after;
    setDraft(next);
    // Restaure le focus + place le curseur après l'insertion
    requestAnimationFrame(() => {
      ta.focus();
      const pos = (before + prefix + text).length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (list.length === 0) return;
    setUploading(true);
    try {
      for (const file of list) {
        try {
          const url = await uploadImage(file);
          insertAtCursor(`![](${url})`);
        } catch (e) {
          console.error('[chat] upload image échoué', e);
        }
      }
    } finally {
      setUploading(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // Images dans le presse-papier (capture d'écran, partage natif)
    const imageFiles = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length > 0) {
      e.preventDefault();
      void uploadFiles(imageFiles);
      return;
    }
    const text = e.clipboardData.getData('text/plain');
    const reformatted = detectAndReformat(text);
    if (reformatted) {
      e.preventDefault();
      const target = e.currentTarget;
      const { selectionStart, selectionEnd } = target;
      const next = draft.slice(0, selectionStart) + reformatted + draft.slice(selectionEnd);
      setDraft(next);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    e.preventDefault();
    void uploadFiles(files);
  };

  const save = () => {
    updateAttributes({
      raw: draft,
      title: draftTitle,
      platform: draftPlatform,
      me: draftMe,
      aliases: serializeAliases(draftAliases),
    });
    setEditing(false);
  };
  const cancel = () => {
    setDraft(raw);
    setDraftTitle(title);
    setDraftPlatform(platform);
    setDraftMe(me);
    setDraftAliases(parseAliases(aliases));
    setEditing(false);
  };

  const swapMoiToi = () => {
    // Swap toutes les occurrences "Moi" ↔ "Toi" dans les headers de message.
    // Utile sur les imports SMS où l'alternance auto est tombée à l'envers.
    const lines = draft.split('\n');
    const next = lines.map((line) => {
      const m = line.match(/^\[([^\]]*)\]\s+(Moi|Toi)\s*$/);
      if (!m) return line;
      const swapped = m[2] === 'Moi' ? 'Toi' : 'Moi';
      return `[${m[1]}] ${swapped}`;
    });
    setDraft(next.join('\n'));
  };

  const hasMoiToiAlternation = useMemo(
    () => draftMessages.some((m) => m.author === 'Moi') && draftMessages.some((m) => m.author === 'Toi'),
    [draftMessages],
  );

  const setAlias = (author: string, label: string) => {
    setDraftAliases((prev) => {
      const next = new Map(prev);
      if (label.trim() === '' || label.trim() === author) next.delete(author);
      else next.set(author, label.trim());
      return next;
    });
  };

  const isReadOnly = !editor.isEditable;

  if (!editing) {
    return (
      <NodeViewWrapper>
        <ChatDisplay
          platform={platform}
          title={title}
          me={me}
          aliases={aliases}
          raw={raw}
          trailingAction={
            <div className="flex items-center gap-1" contentEditable={false}>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-xs text-text-muted/60 hover:text-text-primary transition-colors px-1.5 py-0.5 rounded"
                  title="Éditer la conversation"
                >
                  ✎
                </button>
              )}
              <span
                className="branch-drag-handle"
                data-drag-handle
                contentEditable={false}
                onClick={(e) => e.stopPropagation()}
                title="Déplacer le bloc"
              >
                <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
                  <circle cx="3" cy="2.5" r="1.2"/><circle cx="7" cy="2.5" r="1.2"/>
                  <circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/>
                  <circle cx="3" cy="11.5" r="1.2"/><circle cx="7" cy="11.5" r="1.2"/>
                </svg>
              </span>
            </div>
          }
        />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper>
      <div
        className="my-3 rounded-2xl border border-text-muted/15 bg-bg-elevated overflow-hidden"
        style={{ fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-end px-3 pt-2" contentEditable={false}>
          <span
            className="branch-drag-handle"
            data-drag-handle
            contentEditable={false}
            onClick={(e) => e.stopPropagation()}
            title="Déplacer le bloc"
          >
            <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
              <circle cx="3" cy="2.5" r="1.2"/><circle cx="7" cy="2.5" r="1.2"/>
              <circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/>
              <circle cx="3" cy="11.5" r="1.2"/><circle cx="7" cy="11.5" r="1.2"/>
            </svg>
          </span>
        </div>
        <div className="p-3 flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-text-muted/60">Plateforme</label>
              <select
                value={draftPlatform}
                onChange={(e) => setDraftPlatform(e.target.value)}
                className="w-full bg-bg-primary rounded-lg px-2 py-1 text-xs text-text-primary border border-text-muted/15 outline-none focus:border-accent/40"
              >
                {Object.entries(PLATFORM_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-text-muted/60">Avec</label>
              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="Alice, le groupe famille…"
                className="w-full bg-bg-primary rounded-lg px-2 py-1 text-xs text-text-primary border border-text-muted/15 outline-none focus:border-accent/40"
              />
            </div>
          </div>

          {detectedAuthors.length > 0 && (
            <div>
              <label className="text-[11px] text-text-muted/60">Qui est moi ?</label>
              <select
                value={draftMe}
                onChange={(e) => setDraftMe(e.target.value)}
                className="w-full bg-bg-primary rounded-lg px-2 py-1 text-xs text-text-primary border border-text-muted/15 outline-none focus:border-accent/40"
              >
                <option value="">— Personne (utiliser Moi/Me/Toi) —</option>
                {detectedAuthors.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          )}

          {detectedAuthors.filter((a) => a !== draftMe).length > 0 && (
            <div>
              <label className="text-[11px] text-text-muted/60">Renommer les participants (optionnel)</label>
              <div className="flex flex-col gap-1.5 mt-1">
                {detectedAuthors.filter((a) => a !== draftMe).map((a) => (
                  <div key={a} className="flex items-center gap-2">
                    <span className="text-xs text-text-muted shrink-0 min-w-0 truncate" style={{ maxWidth: '40%' }}>{a}</span>
                    <span className="text-text-muted/55 text-xs">→</span>
                    <input
                      value={draftAliases.get(a) ?? ''}
                      onChange={(e) => setAlias(a, e.target.value)}
                      placeholder={`Garder "${a}"`}
                      className="flex-1 bg-bg-primary rounded-lg px-2 py-1 text-xs text-text-primary border border-text-muted/15 outline-none focus:border-accent/40"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-baseline justify-between mb-1">
              <label className="text-[11px] text-text-muted/60">Conversation (brut)</label>
              <div className="flex items-center gap-2">
                {hasMoiToiAlternation && (
                  <button
                    type="button"
                    onClick={swapMoiToi}
                    className="text-[11px] text-text-muted/70 hover:text-accent transition-colors flex items-center gap-1 px-1.5 py-0.5 rounded"
                    title="Inverser tous les Moi ↔ Toi (utile sur les imports SMS où l'alternance auto est à l'envers)"
                  >
                    ⇆ Moi/Toi
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) void uploadFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="text-[11px] text-text-muted/70 hover:text-accent transition-colors flex items-center gap-1 px-1.5 py-0.5 rounded disabled:opacity-50"
                  title="Ajouter une image au curseur"
                >
                  {uploading ? (
                    <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  )}
                  <span>Image</span>
                </button>
              </div>
            </div>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onPaste={handlePaste}
              onDrop={handleDrop}
              onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
              rows={10}
              spellCheck={false}
              className="w-full bg-bg-primary rounded-lg px-3 py-2 text-xs font-mono text-text-primary border border-text-muted/15 outline-none focus:border-accent/40 resize-y"
              placeholder={`[14/05 14:32] Alice\nSalut comment vas-tu ?\n❤️ Moi\n\n[14/05 14:33] Moi\nÇa va bien et toi ?`}
            />
            <p className="text-[11px] text-text-muted/50 mt-1">
              Coller ou glisser une image l'upload automatiquement. Le collage WhatsApp / Slack / Discord est auto-converti. Réactions : ligne <code>emoji auteur · auteur</code>.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={cancel} className="text-xs text-text-muted/70 hover:text-text-primary px-2 py-1">
              Annuler
            </button>
            <button type="button" onClick={save} className="px-3 py-1 rounded-lg text-xs font-medium bg-accent/15 text-accent hover:bg-accent/25 transition-colors">
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </NodeViewWrapper>
  );
}
