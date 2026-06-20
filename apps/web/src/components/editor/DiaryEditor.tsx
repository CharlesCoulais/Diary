import { useEffect, useImperativeHandle, useRef, useState, forwardRef, useCallback } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { DOMParser as PMDOMParser, Slice, Fragment } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { ResizableImage } from './extensions/ResizableImage';
import { Markdown } from 'tiptap-markdown';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { TableKit } from '@tiptap/extension-table';
import { createLowlight, common } from 'lowlight';
import { EditorToolbar } from './EditorToolbar';
import { Branch } from './extensions/Branch';
import { BranchAnchor } from './extensions/BranchAnchor';
import { EditBlock } from './extensions/EditBlock';
import { Chat } from './extensions/Chat';
import { Mermaid } from './extensions/Mermaid';
import { HeadingFold } from './extensions/HeadingFold';
import { PreservingParagraph } from './extensions/PreservingParagraph';
import { AudioNode } from './extensions/AudioNode';
import { VideoNode } from './extensions/VideoNode';
import { FontFamily } from './extensions/FontFamily';
import { FontSize } from './extensions/FontSize';
import { Color } from './extensions/Color';
import { SpoilerShortcut } from './extensions/SpoilerShortcut';
import { Mention, setMentionItems } from './extensions/Mention';
import { uploadImage } from '../../lib/imageUpload';
import { uploadAudio } from '../../lib/audioUpload';
import { uploadVideo } from '../../lib/videoUpload';
import { useOwnerDisplayPrefs } from '../../lib/displayPrefs';
import { notifyDialog } from '../../lib/dialog';
import { buildPasteHtml } from '../../lib/pasteMarkdown';
import { scaledFontSize } from '../../lib/fonts';
import { trpc } from '../../lib/trpc';

const lowlight = createLowlight(common);

// Re-apply branchAnchor marks to anchor text after loading from markdown
// (the mark is not serialized, so we restore it by searching for the anchorText)
function reapplyBranchAnchors(editor: Editor) {
  const { doc, schema, tr } = editor.state;
  const markType = schema.marks['branchAnchor'];
  if (!markType) return;

  const anchorsToApply: string[] = [];
  doc.forEach((node) => {
    if (node.type.name === 'branch' || node.type.name === 'editBlock') {
      const at = node.attrs.anchorText as string | null;
      if (at && at.trim()) anchorsToApply.push(at.trim());
    }
  });

  if (anchorsToApply.length === 0) return;

  const transaction = tr;
  let changed = false;

  // On cherche l'ancre dans le texte CONCATÉNÉ de chaque bloc (textblock), pas
  // par nœud texte : une ancre qui couvre du code inline / gras / italique est
  // découpée par ProseMirror en plusieurs nœuds texte, donc `node.text.indexOf`
  // échouait. `node.textContent` reconstitue le texte complet du bloc ; les
  // marques n'occupent pas de position, donc l'offset dans textContent = offset
  // de position (pos + 1 pour entrer dans le textblock).
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    const text = node.textContent;
    if (!text) return;
    for (const anchor of anchorsToApply) {
      let idx = text.indexOf(anchor);
      while (idx !== -1) {
        const from = pos + 1 + idx;
        const to = from + anchor.length;
        if (!doc.rangeHasMark(from, to, markType)) {
          transaction.addMark(from, to, markType.create());
          changed = true;
        }
        idx = text.indexOf(anchor, idx + anchor.length);
      }
    }
  });

  if (changed) editor.view.dispatch(transaction);
}

/** Ancêtre scrollable le plus proche (conteneur overflow-y de la modale). */
function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * Garde le curseur visible en édition, en tenant compte sur mobile :
 *  - de la hauteur du **clavier** (via `visualViewport`) — sinon le curseur se
 *    retrouve sous le clavier ;
 *  - de la **barre d'outils** sticky (en haut ou en bas) qui recouvre une partie
 *    du conteneur.
 * Le `scrollIntoView` natif ignore ces deux contraintes (il cale le curseur au
 * bord du conteneur, donc derrière le clavier ou la toolbar). On scrolle donc le
 * conteneur manuellement pour garder le curseur dans la bande réellement visible.
 */
function scrollCaretIntoView(editor: Editor): void {
  try {
    const view = editor.view;
    if (!view.hasFocus()) return;
    const caret = view.coordsAtPos(view.state.selection.from); // {top,bottom,left,right} viewport

    const scroller = getScrollParent(view.dom as HTMLElement);
    if (!scroller) {
      (view.dom as HTMLElement).scrollIntoView?.({ block: 'nearest' });
      return;
    }
    const sRect = scroller.getBoundingClientRect();
    const vv = window.visualViewport;
    const vpTop = vv ? vv.offsetTop : 0;
    const vpBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;

    const bottomBar = scroller.querySelector<HTMLElement>('[data-editor-toolbar="bottom"]');
    const topBar = scroller.querySelector<HTMLElement>('[data-editor-toolbar="top"]');
    const margin = 12;

    // Bas réellement visible : au-dessus du clavier, du bas du conteneur, et — si
    // la toolbar basse est visible — au-dessus d'elle.
    const barTop = bottomBar ? bottomBar.getBoundingClientRect().top : Infinity;
    const visibleBottom = Math.min(vpBottom, sRect.bottom, barTop) - margin;
    // Haut visible : sous le haut du viewport/conteneur et la toolbar haute.
    const barBottom = topBar ? topBar.getBoundingClientRect().bottom : -Infinity;
    const visibleTop = Math.max(vpTop, sRect.top, barBottom) + margin;

    if (caret.bottom > visibleBottom) {
      scroller.scrollTop += caret.bottom - visibleBottom;
    } else if (caret.top < visibleTop) {
      scroller.scrollTop -= visibleTop - caret.top;
    }
  } catch {
    /* position pas encore dans le DOM — on ignore */
  }
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface DiaryEditorHandle {
  insertAtEnd: (text: string) => void;
}

interface DiaryEditorProps {
  initialContent: string;
  onChange?: (md: string) => void;
  saveStatus?: SaveStatus;
  placeholder?: string;
  readOnly?: boolean;
  autoFocus?: boolean;
  fontFamily?: string;
  fontSize?: string;
  /** Clé de la police de la note — sert à ajuster la taille (scriptes fines). */
  fontKey?: string | null;
  onFontSizeChange?: (v: string | null) => void;
  entryId?: string;
}

const STATUS_LABEL: Record<SaveStatus, string | null> = {
  idle: null,
  saving: 'Enregistrement…',
  saved: 'Enregistré',
  error: "Échec de l'enregistrement",
};

const STATUS_CLASS: Record<SaveStatus, string> = {
  idle: '',
  saving: 'text-text-muted',
  saved: 'text-success',
  error: 'text-danger',
};

/**
 * Indicateur d'enregistrement, rendu dans la barre d'outils pendant l'édition
 * (toujours visible, là où l'autrice regarde). `aria-live="polite"` pour les
 * lecteurs d'écran. L'état d'erreur est rendu **non ratable** (pastille danger
 * + icône) : sur un journal, savoir que ses mots sont sauvés est un contrat de
 * confiance — un simple glyphe gris ne suffit pas.
 */
function SaveStatusBadge({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;
  const isError = status === 'error';
  return (
    <span
      role="status"
      aria-live="polite"
      className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-medium whitespace-nowrap transition-opacity duration-200 ${STATUS_CLASS[status]} ${isError ? 'px-1.5 py-0.5 rounded-md bg-danger/12' : ''}`}
    >
      {status === 'saving' && (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      )}
      {status === 'saved' && (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {isError && (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      )}
      {STATUS_LABEL[status]}
    </span>
  );
}

export const DiaryEditor = forwardRef<DiaryEditorHandle, DiaryEditorProps>(function DiaryEditor({
  initialContent,
  onChange,
  saveStatus = 'idle',
  placeholder = 'Écris ta journée…',
  readOnly = false,
  autoFocus = false,
  fontFamily,
  fontSize,
  fontKey,
  onFontSizeChange,
  entryId,
}: DiaryEditorProps, ref) {
  const [ownerPrefs, updateOwnerPrefs] = useOwnerDisplayPrefs();
  const toolbarPosition = ownerPrefs.toolbarPosition ?? 'top';
  const toggleToolbarPosition = () => updateOwnerPrefs({ toolbarPosition: toolbarPosition === 'top' ? 'bottom' : 'top' });

  const [videoUploadProgress, setVideoUploadProgress] = useState<number | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const entryIdRef = useRef(entryId);
  entryIdRef.current = entryId;
  const editorInstanceRef = useRef<Editor | null>(null);

  // Personnes mentionnables (@) — alimente le plugin Suggestion via un getter
  // stable (registre module-level), réévalué à chaque frappe sur la liste à jour.
  const { data: mentionables } = trpc.guests.listMentionable.useQuery(undefined, { staleTime: 5 * 60_000 });
  const mentionablesRef = useRef(mentionables);
  mentionablesRef.current = mentionables;
  useEffect(() => {
    setMentionItems(() =>
      (mentionablesRef.current ?? []).map((u) => ({
        id: u.id,
        label: u.displayName || u.email.split('@')[0] || u.email,
        sub: u.displayName ? u.email.split('@')[0] : undefined,
      })),
    );
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, paragraph: false }),
      PreservingParagraph,
      CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }),
      Branch,
      BranchAnchor,
      EditBlock,
      Chat,
      Mermaid,
      HeadingFold,
      AudioNode,
      VideoNode,
      FontFamily,
      FontSize,
      Color,
      SpoilerShortcut,
      Mention,
      ResizableImage,
      TableKit,
      Markdown.extend({
        addExtensions() {
          return (this.parent?.() ?? []).map((e) =>
            e.name === 'link' ? e.configure({ openOnClick: false, autolink: true }) : e,
          );
        },
      }).configure({ html: true, tightLists: true, bulletListMarker: '-', transformPastedText: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: initialContent,
    editable: !readOnly,
    autofocus: autoFocus,
    onCreate: ({ editor }) => {
      editorInstanceRef.current = editor;
      reapplyBranchAnchors(editor);
    },
    onUpdate: ({ editor }) => {
      if (onChangeRef.current) {
        const storage = editor.storage as unknown as { markdown: { getMarkdown(): string } };
        const md = storage.markdown.getMarkdown();
        onChangeRef.current(md);
      }
      // Garde le curseur visible (clavier + toolbar pris en compte). rAF pour
      // mesurer après que le layout est stabilisé.
      requestAnimationFrame(() => scrollCaretIntoView(editor));
    },
    onSelectionUpdate: ({ editor }) => {
      // Déplacement du curseur (tap, flèches) → le re-garder au-dessus du clavier.
      requestAnimationFrame(() => scrollCaretIntoView(editor));
    },
    editorProps: {
      attributes: {
        class:
          'outline-none text-text-primary leading-relaxed ' +
          'min-h-[120px] prose prose-warm max-w-none',
        spellcheck: 'true',
      },
      handleClick(view, _pos, event) {
        const target = event.target as HTMLElement;
        if (!target.closest('.branch-anchor-icon')) return false;

        const domPos = view.posAtDOM(target.closest('.branch-anchor-mark') ?? target, 0);
        const doc = view.state.doc;
        let found: { typeName: string; pos: number } | null = null;

        doc.nodesBetween(domPos, doc.content.size, (node, pos) => {
          if ((node.type.name === 'branch' || node.type.name === 'editBlock') && found === null) {
            found = { typeName: node.type.name, pos };
          }
        });

        if (found !== null) {
          const f = found as { typeName: string; pos: number };
          if (f.typeName === 'editBlock') {
            window.dispatchEvent(new CustomEvent('editBlock:scrollTo', { detail: { pos: f.pos } }));
          } else {
            window.dispatchEvent(new CustomEvent('branch:scrollTo', { detail: { branchPos: f.pos } }));
          }
        }
        return true;
      },
      handleDrop(_view, event) {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
          f.type.startsWith('image/'),
        );
        if (!files.length) return false;
        event.preventDefault();
        void handleImageFiles(files);
        return true;
      },
      handlePaste(_view, event) {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) =>
          f.type.startsWith('image/'),
        );
        if (files.length) {
          event.preventDefault();
          void handleImageFiles(files);
          return true;
        }
        // Collage texte multi-lignes : on reconstruit les paragraphes depuis le
        // texte brut (cf. buildPasteHtml) — y compris quand le presse-papier
        // contient aussi du HTML (où ProseMirror écraserait les sauts de ligne).
        // Le collage d'une seule ligne garde le comportement par défaut (insertion
        // inline + markdown via tiptap-markdown).
        const text = (event.clipboardData?.getData('text/plain') ?? '').replace(/\r\n?/g, '\n');
        if (!text.includes('\n')) return false;
        const editor = editorInstanceRef.current;
        if (!editor) return false;
        const html = buildPasteHtml(editor, text);
        if (!html) return false;
        const view = editor.view;
        // On insère SANS passer par insertContent/insertContentAt de
        // tiptap-markdown (qui re-parsent en mode inline et fusionneraient tout
        // sur une ligne). On parse le HTML en un DOC complet (robuste, ne lève
        // pas sur du contenu bloc, contrairement à parseSlice), puis on insère
        // son contenu comme une slice à ouverture 0 → blocs insérés tels quels,
        // jamais fusionnés.
        try {
          const dom = new window.DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
          const doc = PMDOMParser.fromSchema(editor.schema).parse(dom, { preserveWhitespace: 'full' });
          event.preventDefault();
          view.dispatch(view.state.tr.replaceSelection(new Slice(doc.content, 0, 0)).scrollIntoView());
          return true;
        } catch {
          // Dernier recours : insérer le texte ligne par ligne en paragraphes,
          // SANS retomber sur le collage markdown par défaut (qui fusionne tout
          // en inline = « tout sur une ligne »).
          try {
            const paraType = editor.schema.nodes.paragraph;
            if (!paraType) return false;
            const nodes = text
              .split('\n')
              .filter((l) => l.trim() !== '')
              .map((l) => paraType.create(null, editor.schema.text(l)));
            if (nodes.length === 0) return false;
            event.preventDefault();
            view.dispatch(view.state.tr.replaceSelection(new Slice(Fragment.fromArray(nodes), 0, 0)).scrollIntoView());
            return true;
          } catch {
            return false;
          }
        }
      },
    },
  });

  const editorRef = useRef(editor);
  editorRef.current = editor;

  useImperativeHandle(ref, () => ({
    insertAtEnd(text: string) {
      const ed = editorRef.current;
      if (!ed) return;
      ed.chain().focus().command(({ tr, dispatch, state }) => {
        if (dispatch) {
          tr.insertText('\n' + text, state.doc.content.size - 1);
          dispatch(tr);
        }
        return true;
      }).run();
    },
  }), []);

  // Upload image séquentiellement (un fichier à la fois), comme l'audio :
  // préserve l'ordre d'insertion et ne sature pas la bande passante. Une seule
  // erreur agrégée à la fin si des fichiers ont échoué.
  //
  // Insertion à une position EXPLICITE qu'on avance après chaque image, plutôt
  // que via `setImage`/`replaceSelectionWith` : ce dernier laissait, après
  // insertion d'un bloc image, une NodeSelection SUR l'image. L'image suivante
  // remplaçait alors la précédente (une sur deux « zappée »). En insérant à
  // `pos` puis en avançant `pos += node.nodeSize`, chaque image se pose APRÈS la
  // précédente, dans l'ordre, sans rien écraser.
  async function handleImageFiles(files: File[]) {
    const ed0 = editorRef.current;
    if (!ed0) return;
    const failures: { name: string; reason: string }[] = [];
    // Point de départ : juste après le bloc top-level contenant le curseur
    // (ou la fin du document si pas de sélection exploitable).
    const sel = ed0.state.selection;
    let insertPos = sel.$from.depth > 0 ? sel.$from.after(1) : ed0.state.doc.content.size;
    for (const file of files) {
      try {
        const src = await uploadImage(file, entryIdRef.current);
        const ed = editorRef.current;
        if (!ed) break;
        // Clamp : le document a pu changer entre deux uploads.
        insertPos = Math.min(insertPos, ed.state.doc.content.size);
        const node = ed.state.schema.nodes['image']!.create({ src });
        ed.view.dispatch(ed.state.tr.insert(insertPos, node));
        insertPos += node.nodeSize;
      } catch (err) {
        console.error('[image upload]', file.name, err);
        failures.push({
          name: file.name,
          reason: err instanceof Error ? err.message : 'erreur inconnue',
        });
      }
    }
    // Place le curseur après la dernière image insérée.
    const edEnd = editorRef.current;
    if (edEnd && failures.length < files.length) {
      const pos = Math.min(insertPos, edEnd.state.doc.content.size);
      edEnd.chain().focus().setTextSelection(pos).run();
    }
    if (failures.length > 0) {
      await notifyDialog({
        title: failures.length === 1
          ? "Impossible d'uploader l'image"
          : `${failures.length} images n'ont pas pu être uploadées`,
        message: failures.map((f) => `${f.name} — ${f.reason}`).join('\n'),
        tone: 'danger',
      });
    }
  }

  // Upload audio séquentiellement (un fichier à la fois) pour ne pas saturer
  // la bande passante et préserver l'ordre d'insertion choisi par l'utilisateur.
  // Si un fichier échoue, on continue avec les suivants — on notifie une
  // seule erreur agrégée à la fin pour ne pas spammer l'UI.
  async function handleAudioFiles(files: File[]) {
    const ed = editorRef.current;
    if (!ed) return;
    const failures: { name: string; reason: string }[] = [];
    for (const file of files) {
      try {
        const { src, filename } = await uploadAudio(file, entryIdRef.current);
        ed.chain().focus().insertAudio(src, filename).run();
      } catch (err) {
        console.error('[audio upload]', file.name, err);
        failures.push({
          name: file.name,
          reason: err instanceof Error ? err.message : 'erreur inconnue',
        });
      }
    }
    if (failures.length > 0) {
      await notifyDialog({
        title: failures.length === 1
          ? "Impossible d'uploader l'audio"
          : `${failures.length} fichiers n'ont pas pu être uploadés`,
        message: failures.map((f) => `${f.name} — ${f.reason}`).join('\n'),
        tone: 'danger',
      });
    }
  }

  // Upload vidéo disponible uniquement si un stockage est configuré côté serveur
  // (R2 en prod, disque en dev). Sinon on masque le bouton « insérer une vidéo ».
  const videoUploadEnabled =
    trpc.system.config.useQuery(undefined, { staleTime: Infinity }).data?.videoUpload ?? false;

  const handleVideoFile = useCallback(async (file: File) => {
    const ed = editorRef.current;
    if (!ed) return;
    try {
      setVideoUploadProgress(0);
      const { src, filename } = await uploadVideo(file, {
        entryId: entryIdRef.current,
        onProgress: (p) => setVideoUploadProgress(p),
      });
      ed.chain().focus().insertVideo(src, filename).run();
    } catch (err) {
      await notifyDialog({
        title: "Impossible d'uploader la vidéo",
        message: err instanceof Error ? err.message : 'erreur inconnue',
        tone: 'danger',
      });
    } finally {
      setVideoUploadProgress(null);
    }
  }, []);

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  return (
    // `min-w-0` impératif sur cette chaîne flex : sans ça, le toolbar (qui a
    // `overflow-x-auto` en interne) impose sa largeur naturelle (~600px avec
    // ses 19 boutons) à l'éditeur entier → tout sort de l'écran sur mobile.
    <div
      className={readOnly ? '' : 'flex-1 flex flex-col min-w-0'}
      style={{ fontFamily: fontFamily ?? 'Lora, Georgia, serif, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"', fontSize: scaledFontSize(fontKey, fontSize ?? '17px') }}
    >
      {!readOnly && editor && toolbarPosition === 'top' && (
        <div data-editor-toolbar="top" className="sticky -top-px z-20 bg-bg-elevated -mx-6 px-6 py-1 border-b border-text-muted/10 min-w-0 overflow-hidden">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex-1 min-w-0">
              <EditorToolbar
                editor={editor}
                fontSize={fontSize}
                onFontSizeChange={onFontSizeChange}
                onImageInsert={handleImageFiles}
                onAudioInsert={handleAudioFiles}
                onVideoInsert={videoUploadEnabled ? handleVideoFile : undefined}
                toolbarPosition={toolbarPosition}
                onTogglePosition={toggleToolbarPosition}
              />
            </div>
            <SaveStatusBadge status={saveStatus} />
          </div>
          {videoUploadProgress !== null && (
            <div className="video-upload-progress-bar" style={{ width: `${videoUploadProgress}%` }} />
          )}
        </div>
      )}
      <EditorContent editor={editor} className="flex-1 min-w-0" />
      {!readOnly && editor && toolbarPosition === 'bottom' && (
        <div data-editor-toolbar="bottom" className="sticky bottom-0 z-20 bg-bg-elevated -mx-6 px-6 py-1 border-t border-text-muted/10 min-w-0 overflow-hidden">
          {videoUploadProgress !== null && (
            <div className="video-upload-progress-bar" style={{ width: `${videoUploadProgress}%` }} />
          )}
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex-1 min-w-0">
              <EditorToolbar
                editor={editor}
                fontSize={fontSize}
                onFontSizeChange={onFontSizeChange}
                onImageInsert={handleImageFiles}
                onAudioInsert={handleAudioFiles}
                onVideoInsert={videoUploadEnabled ? handleVideoFile : undefined}
                toolbarPosition={toolbarPosition}
                onTogglePosition={toggleToolbarPosition}
              />
            </div>
            <SaveStatusBadge status={saveStatus} />
          </div>
        </div>
      )}
    </div>
  );
});
