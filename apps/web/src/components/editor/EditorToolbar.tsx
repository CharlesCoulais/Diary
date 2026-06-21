import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { DIARY_FONTS, loadFont, getFontsByMood, MOOD_DESCRIPTIONS, getFontScale, type DiaryFont } from '../../lib/fonts';
import { trpc } from '../../lib/trpc';
import { promptDialog, notifyDialog } from '../../lib/dialog';
import { applyReflowToEditor } from '../../lib/reflowMarkdown';
import { getWorkRange, getMarkdownForRange, replaceRangeWithMarkdown } from '../../lib/pasteMarkdown';
import { SpellCheckButton } from '../SpellCheckButton';
import { HScroll } from '../HScroll';

interface ToolbarButtonProps {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}

function Btn({ active, disabled, onClick, title, children }: ToolbarButtonProps) {
  const startPos = useRef<{ x: number; y: number } | null>(null);

  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onPointerDown={(e) => {
        e.preventDefault(); // empêche le blur de l'éditeur sans déclencher l'action
        startPos.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        if (!startPos.current || disabled) return;
        const moved =
          Math.abs(e.clientX - startPos.current.x) > 6 ||
          Math.abs(e.clientY - startPos.current.y) > 6;
        startPos.current = null;
        if (!moved) onClick();
      }}
      onPointerLeave={() => { startPos.current = null; }}
      className={
        'flex items-center justify-center w-7 h-7 [@media(pointer:coarse)]:w-[40px] [@media(pointer:coarse)]:h-[40px] rounded text-sm transition-colors duration-100 ' +
        (active
          ? 'bg-accent/15 text-accent'
          : 'text-text-muted hover:text-text-primary hover:bg-text-muted/10') +
        (disabled ? ' opacity-30 pointer-events-none' : '')
      }
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-text-muted/15 mx-0.5" />;
}

/**
 * Enveloppe la sélection courante avec `||...||` pour en faire un spoiler.
 *
 * On reste sur du texte brut (pas de mark Tiptap dédié) parce que :
 *  - La pipeline de rendu (AnnotatedReader.preprocessMarkdownToHtml, comment
 *    tokenizer, previewRuns) traite déjà `||...||` partout en aval.
 *  - Un mark Tiptap demanderait de gérer la sérialisation markdown
 *    bidirectionnelle (open/close) et de détecter le parsing inverse —
 *    overhead non nécessaire pour ce besoin.
 *
 * Comportement :
 *  - Sélection vide → insère `||spoiler||` et place le curseur dans le mot
 *    pour le retaper aussitôt.
 *  - Sélection non vide → wrap par `||...||`. Si déjà wrappée, unwrap.
 */
function wrapSpoiler(editor: Editor) {
  const { from, to, empty } = editor.state.selection;
  if (empty) {
    const placeholder = 'spoiler';
    editor.chain().focus().insertContent(`||${placeholder}||`).run();
    // Sélectionne le mot 'spoiler' pour que l'utilisateur puisse le retaper.
    const newFrom = from + 2;
    const newTo = newFrom + placeholder.length;
    editor.commands.setTextSelection({ from: newFrom, to: newTo });
    return;
  }
  const selected = editor.state.doc.textBetween(from, to, '\n');
  // Toggle off si déjà entouré par || dans la sélection.
  const unwrapMatch = selected.match(/^\|\|([\s\S]+?)\|\|$/);
  if (unwrapMatch?.[1]) {
    editor.chain().focus().deleteRange({ from, to }).insertContent(unwrapMatch[1]).run();
    return;
  }
  editor.chain().focus().deleteRange({ from, to }).insertContent(`||${selected}||`).run();
}

/**
 * Capture la sélection courante de l'éditeur pour la restaurer plus tard.
 * Sur mobile, taper sur la toolbar peut dismiss la sélection visuelle ;
 * on garde la range côté JS pour la rejouer au moment d'appliquer le format.
 */
function captureRange(editor: Editor | undefined): { from: number; to: number } | null {
  if (!editor) return null;
  const { from, to, empty } = editor.state.selection;
  if (empty) return null;
  return { from, to };
}

function usePortalPos(dropUp: boolean) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);

  const calcPos = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const panelW = 240;
    const left = Math.min(r.left, window.innerWidth - panelW - 8);
    if (dropUp) {
      setPos({ bottom: window.innerHeight - r.top + 4, left });
    } else {
      setPos({ top: r.bottom + 4, left });
    }
  };

  return { btnRef, panelRef, pos, calcPos };
}

/**
 * Coquille partagée des popovers de la toolbar (Font / Size / Color / Table) —
 * factorise l'état d'ouverture, le positionnement clampé au viewport
 * (`usePortalPos`), le clic-extérieur, la capture de sélection et le panneau en
 * portal (HOME-08). Chaque picker fournit son bouton (className fonction de
 * `open`), le contenu du panneau (render-prop recevant `close` + `savedRange`),
 * et des hooks optionnels `onOpen`/`onClose` (ex. préchargement des polices,
 * reset du survol de la grille de tableau).
 */
function ToolbarPopover({
  editor,
  dropUp = false,
  title,
  buttonClassName,
  buttonStyle,
  buttonContent,
  panelClassName,
  onOpen,
  onClose,
  children,
}: {
  editor?: Editor;
  dropUp?: boolean;
  title: string;
  buttonClassName: (open: boolean) => string;
  buttonStyle?: React.CSSProperties;
  buttonContent: React.ReactNode;
  panelClassName: string;
  onOpen?: () => void;
  onClose?: () => void;
  children: (ctx: { close: () => void; savedRange: React.MutableRefObject<{ from: number; to: number } | null> }) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { btnRef, panelRef, pos, calcPos } = usePortalPos(dropUp);
  const savedRange = useRef<{ from: number; to: number } | null>(null);

  const close = () => { setOpen(false); onClose?.(); };

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
      onClose?.();
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('touchstart', handle);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('touchstart', handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={title}
        onPointerDown={(e) => {
          e.preventDefault();
          if (editor) savedRange.current = captureRange(editor);
          if (open) {
            setOpen(false);
            onClose?.();
          } else {
            onOpen?.();
            calcPos();
            setOpen(true);
          }
        }}
        className={buttonClassName(open)}
        style={buttonStyle}
      >
        {buttonContent}
      </button>
      {open && pos && createPortal(
        <div ref={panelRef} className={`fixed z-[200] ${panelClassName}`} style={pos}>
          {children({ close, savedRange })}
        </div>,
        document.body,
      )}
    </>
  );
}

function FontPicker({ editor, baseFontSize, dropUp = false }: { editor: Editor; baseFontSize?: string; dropUp?: boolean }) {
  const activeFontFamily = editor.getAttributes('fontFamily').fontFamily as string | undefined;
  const activeFont = activeFontFamily
    ? (DIARY_FONTS.find((f) => {
        const first = f.family.split(',')[0];
        return first !== undefined && activeFontFamily.includes(first.replace(/"/g, '').trim());
      }) ?? null)
    : null;

  return (
    <ToolbarPopover
      editor={editor}
      dropUp={dropUp}
      title="Police de caractères"
      onOpen={() => DIARY_FONTS.forEach((f) => loadFont(f.key))}
      buttonClassName={(open) =>
        'flex items-center gap-0.5 px-1.5 h-7 [@media(pointer:coarse)]:h-[40px] rounded text-xs transition-colors duration-100 ' +
        (open || activeFont ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-primary hover:bg-text-muted/10')
      }
      buttonStyle={activeFont ? { fontFamily: activeFont.family } : undefined}
      buttonContent={activeFont ? activeFont.label : 'Aa'}
      panelClassName="rounded-xl shadow-lg border border-text-muted/10 overflow-hidden w-[280px] max-w-[calc(100vw-1rem)]"
    >
      {({ close, savedRange }) => {
        // Applique une police à la sélection ET ajuste sa taille selon le facteur
        // d'agrandissement (les scriptes fines deviennent lisibles sans toucher la
        // taille à la main). Référence = taille de base de la note (`baseFontSize`),
        // donc jamais cumulatif : rechanger de police recalcule depuis la même base.
        const applyFont = (font: DiaryFont | null) => {
          const range = savedRange.current;
          let chain = editor.chain().focus();
          if (range) chain = chain.setTextSelection(range);
          else chain = chain.selectParentNode();
          if (font === null) {
            chain.unsetFontFamily().unsetFontSize().run();
          } else {
            const scale = getFontScale(font.key, false);
            const base = parseFloat(baseFontSize ?? '') || 17;
            chain = chain.setFontFamily(font.family);
            chain = scale !== 1 ? chain.setFontSize(`${Math.round(base * scale)}px`) : chain.unsetFontSize();
            chain.run();
          }
          close();
        };
        return (
          <div className="bg-bg-elevated max-h-[45dvh] sm:max-h-[60dvh] overflow-y-auto hide-scrollbar overscroll-contain pb-1">
            {getFontsByMood().map((group) => (
              <div key={group.mood}>
                <div className="sticky top-0 z-10 px-3 pt-2.5 pb-1.5 bg-bg-elevated border-b border-text-muted/10">
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-accent">{group.label}</p>
                  <p className="text-[11px] text-text-muted/70 leading-tight mt-0.5">{MOOD_DESCRIPTIONS[group.mood]}</p>
                </div>
                {group.fonts.map((f) => {
                  const isActive = activeFont?.key === f.key;
                  const previewPx = Math.round(19 * getFontScale(f.key, false));
                  return (
                    <button key={f.key} type="button"
                      onClick={() => { loadFont(f.key); applyFont(isActive ? null : f); }}
                      className={`w-full text-left px-3 py-2.5 hover:bg-text-muted/5 transition-colors flex items-center justify-between gap-3 ${isActive ? 'bg-accent/5' : ''}`}
                    >
                      <div className="min-w-0">
                        <p className="text-[11px] text-text-muted font-sans font-medium mb-1">{f.label}</p>
                        <p className="text-text-primary truncate leading-tight" style={{ fontFamily: f.family, fontSize: `${previewPx}px` }}>Bonjour le monde</p>
                      </div>
                      {isActive && <span className="text-accent text-sm leading-none shrink-0">✓</span>}
                    </button>
                  );
                })}
              </div>
            ))}
            {activeFont && (
              <>
                <div className="h-px bg-text-muted/10 my-1" />
                <button type="button" onClick={() => applyFont(null)}
                  className="w-full text-left px-3 py-1 text-xs text-text-muted hover:bg-text-muted/5 transition-colors">
                  Réinitialiser
                </button>
              </>
            )}
          </div>
        );
      }}
    </ToolbarPopover>
  );
}

const FONT_SIZES = [
  { label: 'S',   value: '13px' },
  { label: 'M',   value: '16px' },
  { label: 'L',   value: '19px' },
  { label: 'XL',  value: '23px' },
  { label: 'XXL', value: '28px' },
];

function SizePicker({ fontSize, onChange, editor, dropUp = false }: { fontSize?: string; onChange?: (v: string | null) => void; editor?: Editor; dropUp?: boolean }) {
  const inlineFontSize = editor?.getAttributes('fontSize').fontSize as string | undefined;
  const activeValue = inlineFontSize ?? fontSize;
  const active = FONT_SIZES.find((s) => s.value === activeValue) ?? null;

  if (!onChange) return null;

  return (
    <ToolbarPopover
      editor={editor}
      dropUp={dropUp}
      title="Taille de police"
      buttonClassName={(open) =>
        'flex items-center px-1.5 h-7 [@media(pointer:coarse)]:h-[40px] rounded text-xs font-medium transition-colors duration-100 ' +
        (open || active ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-primary hover:bg-text-muted/10')
      }
      buttonContent={active ? active.label : 'M'}
      panelClassName="bg-bg-elevated rounded-xl shadow-lg border border-text-muted/10 py-1 w-[100px] overflow-hidden"
    >
      {({ close, savedRange }) => {
        const applySize = (value: string | null) => {
          const range = savedRange.current;
          if (range && editor) {
            const chain = editor.chain().focus().setTextSelection(range);
            if (value === null) chain.unsetFontSize().run();
            else chain.setFontSize(value).run();
          } else if (editor && !editor.state.selection.empty) {
            if (value === null) editor.chain().focus().unsetFontSize().run();
            else editor.chain().focus().setFontSize(value).run();
          } else {
            onChange?.(value);
          }
          close();
        };
        return (
          <>
            {FONT_SIZES.map((s) => {
              const isActive = s.value === activeValue;
              return (
                <button key={s.value} type="button"
                  onClick={() => applySize(isActive ? null : s.value)}
                  className="w-full text-left px-3 py-1.5 hover:bg-text-muted/5 transition-colors flex items-center justify-between gap-3"
                  style={{ fontSize: s.value }}
                >
                  <span className="text-text-primary">{s.label}</span>
                  {isActive && <span className="text-accent text-xs leading-none">✓</span>}
                </button>
              );
            })}
            {active && (
              <>
                <div className="h-px bg-text-muted/10 my-1" />
                <button type="button" onClick={() => applySize(null)}
                  className="w-full text-left px-3 py-1 text-xs text-text-muted hover:bg-text-muted/5 transition-colors">
                  Réinitialiser
                </button>
              </>
            )}
          </>
        );
      }}
    </ToolbarPopover>
  );
}


// Palette de couleurs de texte — teintes chaleureuses cohérentes avec la
// palette cocoa, plus quelques tons froids. Choix volontairement restreint pour
// rester lisible sur fond clair ET sombre.
const TEXT_COLORS: { label: string; value: string }[] = [
  { label: 'Terre cuite', value: '#b3543f' },
  { label: 'Ambre',       value: '#c97b3c' },
  { label: 'Or',          value: '#c79a17' },
  { label: 'Sauge',       value: '#6f9a5e' },
  { label: 'Émeraude',    value: '#2f8f83' },
  { label: 'Bleu',        value: '#3b6ea5' },
  { label: 'Indigo',      value: '#6c5cb8' },
  { label: 'Mauve',       value: '#9a6b9d' },
  { label: 'Framboise',   value: '#b5546f' },
  { label: 'Ardoise',     value: '#7a8290' },
];

function ColorPicker({ editor, dropUp = false }: { editor: Editor; dropUp?: boolean }) {
  const activeColor = editor.getAttributes('textColor').color as string | undefined;

  return (
    <ToolbarPopover
      editor={editor}
      dropUp={dropUp}
      title="Couleur du texte"
      buttonClassName={(open) =>
        'flex flex-col items-center justify-center w-7 h-7 [@media(pointer:coarse)]:w-[40px] [@media(pointer:coarse)]:h-[40px] rounded text-sm font-semibold leading-none transition-colors duration-100 ' +
        (open || activeColor ? 'bg-accent/15' : 'hover:bg-text-muted/10')
      }
      buttonStyle={{ color: activeColor ?? 'var(--color-text-muted)' }}
      buttonContent={(
        <>
          <span style={{ lineHeight: 1 }}>A</span>
          <span className="w-3.5 h-[3px] rounded-full mt-[1px]" style={{ backgroundColor: activeColor ?? 'var(--color-text-muted)' }} />
        </>
      )}
      panelClassName="bg-bg-elevated rounded-xl shadow-lg border border-text-muted/10 p-2.5 w-[176px] overflow-hidden"
    >
      {({ close, savedRange }) => {
        const applyColor = (value: string | null) => {
          const range = savedRange.current;
          if (range) {
            const chain = editor.chain().focus().setTextSelection(range);
            if (value === null) chain.unsetColor().run();
            else chain.setColor(value).run();
          } else if (!editor.state.selection.empty) {
            if (value === null) editor.chain().focus().unsetColor().run();
            else editor.chain().focus().setColor(value).run();
          }
          close();
        };
        return (
          <>
            <p className="text-[11px] font-mono uppercase tracking-widest text-text-muted/50 mb-2 px-0.5">Couleur du texte</p>
            <div className="grid grid-cols-5 gap-1.5">
              {TEXT_COLORS.map((c) => {
                const isActive = activeColor === c.value;
                return (
                  <button key={c.value} type="button" title={c.label}
                    onClick={() => applyColor(isActive ? null : c.value)}
                    className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${isActive ? 'ring-2 ring-offset-1 ring-offset-bg-elevated ring-text-primary/40' : ''}`}
                    style={{ backgroundColor: c.value }}
                  />
                );
              })}
            </div>
            {activeColor && (
              <>
                <div className="h-px bg-text-muted/10 my-2" />
                <button type="button" onClick={() => applyColor(null)}
                  className="w-full text-left px-1 py-0.5 text-xs text-text-muted hover:text-text-primary transition-colors">
                  Retirer la couleur
                </button>
              </>
            )}
          </>
        );
      }}
    </ToolbarPopover>
  );
}


interface EditorToolbarProps {
  editor: Editor;
  fontSize?: string;
  onFontSizeChange?: (v: string | null) => void;
  onImageInsert?: (files: File[]) => void;
  /**
   * Reçoit un OU plusieurs fichiers audio (sélection multiple supportée).
   * L'éditeur les upload séquentiellement et insère un AudioNode par fichier
   * dans l'ordre de sélection.
   */
  onAudioInsert?: (files: File[]) => void;
  onVideoInsert?: (file: File) => void;
  toolbarPosition?: 'top' | 'bottom';
  onTogglePosition?: () => void;
}

// Blocs custom à exclure du correcteur orthographique.
// On les remplace par des espaces (même longueur) pour conserver
// les offsets retournés par LanguageTool, puis on les restaure à l'application.
const EXCLUDED_BLOCK_RE = /^:::chat\b[^\n]*\n[\s\S]*?^:::/gm;

function maskCustomBlocks(md: string): { masked: string; regions: Array<{ start: number; end: number; content: string }> } {
  const regions: Array<{ start: number; end: number; content: string }> = [];
  const masked = md.replace(EXCLUDED_BLOCK_RE, (match, offset: number) => {
    regions.push({ start: offset, end: offset + match.length, content: match });
    return match.replace(/[^\n]/g, ' ');
  });
  return { masked, regions };
}

function restoreCustomBlocks(corrected: string, regions: Array<{ start: number; end: number; content: string }>): string {
  let result = corrected;
  for (const r of [...regions].reverse()) {
    result = result.slice(0, r.start) + r.content + result.slice(r.end);
  }
  return result;
}

export function EditorToolbar({ editor, fontSize, onFontSizeChange, onImageInsert, onAudioInsert, onVideoInsert, toolbarPosition = 'top', onTogglePosition }: EditorToolbarProps) {
  const dropUp = toolbarPosition === 'bottom';
  // Régions masquées (blocs :::chat) + plage traitée (sélection ou note entière),
  // capturées au clic « Corriger » et réutilisées à l'application.
  const spellState = useRef<{
    regions: Array<{ start: number; end: number; content: string }>;
    range: { from: number; to: number };
  }>({ regions: [], range: { from: 0, to: 0 } });

  const handleLink = async () => {
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = await promptDialog({
      title: 'Ajouter un lien',
      message: 'Colle l’adresse à laquelle le texte sélectionné renverra.',
      placeholder: 'https://exemple.com',
      initialValue: prev ?? 'https://',
      inputType: 'url',
      confirmLabel: 'Ajouter',
    });
    if (!url) return;
    editor.chain().focus().setLink({ href: url }).run();
  };

  return (
    <HScroll className="flex items-center gap-0.5 [@media(pointer:coarse)]:gap-1.5 flex-nowrap py-0.5" fadeFrom="var(--color-bg-elevated)">

      {/* ── Texte ── */}
      <Btn title="Gras (⌘B)" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" /><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
        </svg>
      </Btn>
      <Btn title="Italique (⌘I)" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="4" x2="10" y2="4" /><line x1="14" y1="20" x2="5" y2="20" /><line x1="15" y1="4" x2="9" y2="20" />
        </svg>
      </Btn>
      <Btn title="Souligné (⌘U)" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 4v8a6 6 0 0 0 12 0V4" /><line x1="4" y1="21" x2="20" y2="21" />
        </svg>
      </Btn>
      <Btn title="Barré" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12" />
          <path d="M16 6C16 6 14.5 4 12 4C9.5 4 7 5.5 7 8C7 10 8.5 11 10 11.5" />
          <path d="M8 18C8 18 9.5 20 12 20C14.5 20 17 18.5 17 16C17 14 15.5 13 14 12.5" />
        </svg>
      </Btn>
      <Btn title="Code en ligne" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
        </svg>
      </Btn>
      <Btn title="Spoiler (⌘⇧S) — texte caché jusqu'au clic en lecture" onClick={() => wrapSpoiler(editor)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {/* Œil barré — analogie « contenu masqué » */}
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      </Btn>
      <Btn title={editor.isActive('link') ? 'Retirer le lien' : 'Ajouter un lien'} active={editor.isActive('link')} onClick={handleLink}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      </Btn>

      <Divider />

      {/* ── Style ── */}
      <FontPicker editor={editor} baseFontSize={fontSize} dropUp={dropUp} />
      <SizePicker fontSize={fontSize} onChange={onFontSizeChange} editor={editor} dropUp={dropUp} />
      <ColorPicker editor={editor} dropUp={dropUp} />

      <Divider />

      {/* ── Paragraphe ── */}
      <Btn title="Citation" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" />
          <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
        </svg>
      </Btn>
      <Btn title="Liste à puces" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" />
          <circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      </Btn>
      <Btn title="Liste numérotée" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" />
          <path d="M4 6h1v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M4 10h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Btn>
      <Btn title="Liste de cases à cocher" active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 17 2 2 4-4" /><path d="m3 7 2 2 4-4" /><path d="M13 6h8" /><path d="M13 12h8" /><path d="M13 18h8" />
        </svg>
      </Btn>

      <Divider />

      {/* ── Blocs ── */}
      <Btn title="Créer une branche" active={editor.isActive('branch')} onClick={() => editor.chain().focus().insertBranch().run()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
      </Btn>
      <Btn title="Extrait de livre" active={editor.isActive('excerpt', { kind: 'book' })} onClick={() => editor.chain().focus().insertExcerpt('book').run()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      </Btn>
      <Btn title="Extrait de paroles" active={editor.isActive('excerpt', { kind: 'lyrics' })} onClick={() => editor.chain().focus().insertExcerpt('lyrics').run()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="22" />
        </svg>
      </Btn>
      <Btn title="Citation film / série" active={editor.isActive('excerpt', { kind: 'movie' })} onClick={() => editor.chain().focus().insertExcerpt('movie').run()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="20" rx="2.18" /><line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="2" y1="7" x2="7" y2="7" /><line x1="2" y1="17" x2="7" y2="17" /><line x1="17" y1="17" x2="22" y2="17" /><line x1="17" y1="7" x2="22" y2="7" />
        </svg>
      </Btn>
      <Btn title="Ajout tardif horodaté" onClick={() => editor.chain().focus().insertEditBlock().run()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          <line x1="12" y1="19" x2="12" y2="21" /><line x1="5" y1="12" x2="3" y2="12" />
        </svg>
      </Btn>
      <Btn title="Insérer une conversation" onClick={() => editor.chain().focus().insertChat().run()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </Btn>
      <Btn title="Insérer un diagramme (Mermaid)" onClick={() => editor.chain().focus().insertMermaid().run()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="3" width="7" height="5" rx="1" /><rect x="13" y="16" width="7" height="5" rx="1" />
          <path d="M7.5 8v3a2 2 0 0 0 2 2h7a2 2 0 0 1 0 0" /><path d="M7.5 8v3a2 2 0 0 0 2 2h7" /><path d="M16.5 13v3" />
        </svg>
      </Btn>
      <TableInsertBtn editor={editor} dropUp={dropUp} />
      <TableContextToolbar editor={editor} />

      <Divider />

      {/* ── Médias ── */}
      {onImageInsert && (
        <label title="Insérer une ou plusieurs images" className="flex items-center justify-center w-7 h-7 [@media(pointer:coarse)]:w-[40px] [@media(pointer:coarse)]:h-[40px] rounded text-sm cursor-pointer text-text-muted hover:text-text-primary hover:bg-text-muted/10 transition-colors duration-100">
          <input type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp" className="sr-only"
            onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length > 0) onImageInsert(files); e.target.value = ''; }} />
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
          </svg>
        </label>
      )}
      {onAudioInsert && (
        <label title="Insérer un ou plusieurs fichiers audio" className="flex items-center justify-center w-7 h-7 [@media(pointer:coarse)]:w-[40px] [@media(pointer:coarse)]:h-[40px] rounded text-sm cursor-pointer text-text-muted hover:text-text-primary hover:bg-text-muted/10 transition-colors duration-100">
          <input
            type="file"
            multiple
            accept="audio/mpeg,audio/mp3,audio/ogg,audio/wav,audio/aac,audio/flac,audio/mp4"
            className="sr-only"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) onAudioInsert(files);
              e.target.value = '';
            }}
          />
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
          </svg>
        </label>
      )}
      {onVideoInsert && (
        <label title="Insérer une vidéo (MP4, WebM ou MOV — jusqu'à 500 Mo)" className="flex items-center justify-center w-7 h-7 [@media(pointer:coarse)]:w-[40px] [@media(pointer:coarse)]:h-[40px] rounded text-sm cursor-pointer text-text-muted hover:text-text-primary hover:bg-text-muted/10 transition-colors duration-100">
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onVideoInsert(file);
              e.target.value = '';
            }}
          />
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
        </label>
      )}

      <Divider />

      {/* ── Outils ── */}
      <SpellCheckButton
        getText={() => {
          // Périmètre : sélection si non vide, sinon toute la note.
          const range = getWorkRange(editor);
          const md = getMarkdownForRange(editor, range.from, range.to);
          const { masked, regions } = maskCustomBlocks(md);
          spellState.current = { regions, range };
          return masked;
        }}
        onApply={(corrected) => {
          const restored = restoreCustomBlocks(corrected, spellState.current.regions);
          const { from, to } = spellState.current.range;
          replaceRangeWithMarkdown(editor, from, to, restored);
        }}
      />
      <Btn title="Réduire les lignes vides (1 ligne vide → 0, 2 → 1…) — sur la sélection si du texte est sélectionné" onClick={() => { const hadSelection = !editor.state.selection.empty; const ok = applyReflowToEditor(editor); editor.commands.focus(); if (!ok) void notifyDialog({ title: 'Rien à réduire', message: hadSelection ? 'La sélection ne contient pas de lignes vides en trop.' : 'Cette note ne contient pas de lignes vides en trop.' }); }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="14" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
          <polyline points="17 10 20 12 17 14" />
        </svg>
      </Btn>
      <ImportMarkdownBtn editor={editor} />
      <CollapseAllBtn editor={editor} />

      {/* ── Position toggle (pushed right) ── */}
      {onTogglePosition && (
        <>
          <div className="flex-1 min-w-2" />
          <Btn title={dropUp ? 'Barre en haut' : 'Barre en bas'} onClick={onTogglePosition}>
            {dropUp ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            )}
          </Btn>
        </>
      )}
    </HScroll>
  );
}

const COLLAPSIBLE_TYPES = new Set(['branch', 'editBlock', 'chat', 'mermaid']);

function hasCollapsibleBlocks(editor: Editor): boolean {
  let found = false;
  editor.state.doc.descendants((node) => {
    if (COLLAPSIBLE_TYPES.has(node.type.name)) { found = true; return false; }
  });
  return found;
}

// ── Table insert (grid picker) ──────────────────────────────────────────────

function TableInsertBtn({ editor, dropUp = false }: { editor: Editor; dropUp?: boolean }) {
  const [hovered, setHovered] = useState<{ rows: number; cols: number } | null>(null);
  const MAX = 5;

  return (
    <ToolbarPopover
      editor={editor}
      dropUp={dropUp}
      title="Insérer un tableau"
      onClose={() => setHovered(null)}
      buttonClassName={(open) =>
        'flex items-center justify-center w-7 h-7 [@media(pointer:coarse)]:w-[40px] [@media(pointer:coarse)]:h-[40px] rounded text-sm transition-colors duration-100 ' +
        (open ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-primary hover:bg-text-muted/10')
      }
      buttonContent={(
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="3" y1="15" x2="21" y2="15" />
          <line x1="9" y1="3" x2="9" y2="21" />
          <line x1="15" y1="3" x2="15" y2="21" />
        </svg>
      )}
      panelClassName="bg-bg-elevated rounded-xl shadow-lg border border-text-muted/10 p-2.5"
    >
      {({ close }) => {
        const insertTable = (rows: number, cols: number) => {
          editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
          close(); // ferme + reset du survol via onClose
        };
        return (
          <>
            <p className="text-[11px] text-text-muted text-center mb-2 font-medium min-h-[14px]">
              {hovered ? `${hovered.rows} × ${hovered.cols}` : 'Tableau'}
            </p>
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${MAX}, 1.5rem)` }}
              onMouseLeave={() => setHovered(null)}
            >
              {Array.from({ length: MAX }, (_, ri) =>
                Array.from({ length: MAX }, (_, ci) => {
                  const r = ri + 1;
                  const c = ci + 1;
                  const isHighlighted = hovered && r <= hovered.rows && c <= hovered.cols;
                  return (
                    <div
                      key={`${r}-${c}`}
                      className={`w-6 h-6 rounded border cursor-pointer transition-colors ${
                        isHighlighted
                          ? 'bg-accent/30 border-accent/60'
                          : 'bg-text-muted/5 border-text-muted/20 hover:bg-accent/15 hover:border-accent/40'
                      }`}
                      onMouseEnter={() => setHovered({ rows: r, cols: c })}
                      onClick={() => insertTable(r, c)}
                    />
                  );
                })
              )}
            </div>
          </>
        );
      }}
    </ToolbarPopover>
  );
}

// ── Table context controls (shown when cursor is inside a table) ────────────

function TableContextToolbar({ editor }: { editor: Editor }) {
  const [isInTable, setIsInTable] = useState(() => editor.isActive('table'));

  useEffect(() => {
    const update = () => setIsInTable(editor.isActive('table'));
    editor.on('selectionUpdate', update);
    editor.on('update', update);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('update', update);
    };
  }, [editor]);

  if (!isInTable) return null;

  return (
    <>
      <Divider />
      {/* Add row after */}
      <Btn title="Ajouter une ligne après" onClick={() => editor.chain().focus().addRowAfter().run()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="10" rx="1" />
          <line x1="2" y1="7" x2="22" y2="7" />
          <line x1="8" y1="2" x2="8" y2="12" />
          <line x1="16" y1="2" x2="16" y2="12" />
          <line x1="12" y1="17" x2="12" y2="22" />
          <line x1="9.5" y1="19.5" x2="14.5" y2="19.5" />
        </svg>
      </Btn>
      {/* Delete row */}
      <Btn title="Supprimer la ligne" onClick={() => editor.chain().focus().deleteRow().run()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="10" rx="1" />
          <line x1="2" y1="7" x2="22" y2="7" />
          <line x1="8" y1="2" x2="8" y2="12" />
          <line x1="16" y1="2" x2="16" y2="12" />
          <line x1="10" y1="19" x2="14" y2="23" />
          <line x1="14" y1="19" x2="10" y2="23" />
        </svg>
      </Btn>
      <Divider />
      {/* Add column after */}
      <Btn title="Ajouter une colonne après" onClick={() => editor.chain().focus().addColumnAfter().run()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="10" height="20" rx="1" />
          <line x1="7" y1="2" x2="7" y2="22" />
          <line x1="2" y1="8" x2="12" y2="8" />
          <line x1="2" y1="16" x2="12" y2="16" />
          <line x1="17" y1="9" x2="17" y2="15" />
          <line x1="14" y1="12" x2="20" y2="12" />
        </svg>
      </Btn>
      {/* Delete column */}
      <Btn title="Supprimer la colonne" onClick={() => editor.chain().focus().deleteColumn().run()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="10" height="20" rx="1" />
          <line x1="7" y1="2" x2="7" y2="22" />
          <line x1="2" y1="8" x2="12" y2="8" />
          <line x1="2" y1="16" x2="12" y2="16" />
          <line x1="15" y1="9" x2="21" y2="15" />
          <line x1="21" y1="9" x2="15" y2="15" />
        </svg>
      </Btn>
      <Divider />
      {/* Delete table */}
      <Btn title="Supprimer le tableau" onClick={() => editor.chain().focus().deleteTable().run()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="M19 6l-1 14H6L5 6" />
          <line x1="10" y1="11" x2="14" y2="15" />
          <line x1="14" y1="11" x2="10" y2="15" />
        </svg>
      </Btn>
    </>
  );
}

/**
 * Importe un fichier Markdown (.md / .txt) et l'insère au curseur.
 *
 * Le texte est parsé par le parser markdown de l'éditeur (mêmes règles que le
 * contenu initial : blocs custom `:::`, tightLists…) → HTML, puis inséré via
 * `insertContent` (commande de base, non overridée par tiptap-markdown — qui
 * sinon re-parserait en markdown *inline* et casserait titres/listes/blocs).
 */
function ImportMarkdownBtn({ editor }: { editor: Editor }) {
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const text = await file.text();
      if (!text.trim()) return;
      // `parser.parse()` (tiptap-markdown) renvoie une **string HTML** prête pour
      // l'insertion ; `insertContent` (base, non overridé) la parse fidèlement.
      const parser = (editor.storage as { markdown?: { parser?: { parse(input: string): string } } }).markdown?.parser;
      const html = parser?.parse(text);
      if (typeof html !== 'string') throw new Error('Parser markdown indisponible');
      editor.chain().focus().insertContent(html).run();
    } catch (err) {
      console.error('[markdown import]', err);
      await notifyDialog({
        title: 'Import impossible',
        message: "Ce fichier n'a pas pu être lu ou converti. Vérifie que c'est bien du texte Markdown.",
        tone: 'danger',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <label
      title="Importer un fichier Markdown (.md) au curseur"
      className={`flex items-center justify-center w-7 h-7 [@media(pointer:coarse)]:w-[40px] [@media(pointer:coarse)]:h-[40px] rounded text-sm cursor-pointer text-text-muted hover:text-text-primary hover:bg-text-muted/10 transition-colors duration-100 ${busy ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <input
        type="file"
        accept=".md,.markdown,.mdown,.txt,text/markdown,text/plain"
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <path d="M12 12v6" /><polyline points="9 15 12 18 15 15" />
      </svg>
    </label>
  );
}

function CollapseAllBtn({ editor }: { editor: Editor }) {
  const [collapsed, setCollapsed] = useState(false);
  const [hasBlocks, setHasBlocks] = useState(() => hasCollapsibleBlocks(editor));

  useEffect(() => {
    const update = () => setHasBlocks(hasCollapsibleBlocks(editor));
    editor.on('update', update);
    return () => { editor.off('update', update); };
  }, [editor]);

  if (!hasBlocks) return null;

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    window.dispatchEvent(new CustomEvent(next ? 'branch:collapseAll' : 'branch:expandAll'));
  };

  return (
    <>
      <Divider />
      <Btn title={collapsed ? 'Tout déplier' : 'Tout replier'} onClick={toggle}>
        {collapsed ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="17 11 12 6 7 11" />
            <polyline points="17 18 12 13 7 18" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="7 13 12 18 17 13" />
            <polyline points="7 6 12 11 17 6" />
          </svg>
        )}
      </Btn>
    </>
  );
}
