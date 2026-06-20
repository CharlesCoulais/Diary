import { Node, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    image: {
      setImage: (attrs: { src: string; alt?: string; title?: string; width?: number }) => ReturnType;
    };
  }
}

import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useRef, useCallback, useState, useEffect } from 'react';

// ── Node view ─────────────────────────────────────────────────────────────────

function ResizableImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const src = node.attrs.src as string;
  const alt = (node.attrs.alt as string | null) ?? '';
  const width = node.attrs.width as number | null;
  const spoiler = node.attrs.spoiler as boolean;
  const souvenir = node.attrs.souvenir as boolean;
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Légende = attribut `alt` (voyage dans le bloc image → ne casse pas le
  // regroupement en carrousel côté lecture). Édité localement, commit immédiat.
  const [caption, setCaption] = useState(alt);
  useEffect(() => { setCaption(alt); }, [alt]);

  const onPointerDownHandle = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = wrapperRef.current?.getBoundingClientRect().width ?? (width ?? 400);
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);

    const onMove = (me: PointerEvent) => {
      const newW = Math.max(80, Math.round(startWidth + (me.clientX - startX)));
      updateAttributes({ width: newW });
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  }, [width, updateAttributes]);

  return (
    <NodeViewWrapper>
      <div contentEditable={false}>
        <div
          ref={wrapperRef}
          className={`resizable-image-wrapper${selected ? ' resizable-image-selected' : ''}${spoiler ? ' resizable-image-spoiler' : ''}`}
          style={{ width: width ? `${width}px` : undefined }}
        >
          <img src={src} alt={alt} className="resizable-image-img" draggable={false} />
          {spoiler && <div className="resizable-image-spoiler-label"><span className="spoiler-img-badge">🙈 Spoiler</span></div>}
          <div
            className="resizable-image-handle"
            onPointerDown={onPointerDownHandle}
            title="Redimensionner"
            aria-label="Redimensionner l'image"
          />
        </div>
        <input
          type="text"
          value={caption}
          onChange={(e) => {
            const v = e.target.value.replace(/[\r\n]+/g, ' ');
            setCaption(v);
            updateAttributes({ alt: v.trim() ? v : null });
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
          placeholder="Légende (optionnel)…"
          draggable={false}
          className="mt-1.5 block bg-transparent border-0 border-b border-text-muted/20 focus:border-accent/50 outline-none text-sm text-text-muted text-center italic placeholder:not-italic placeholder:text-text-muted/55 px-2 py-0.5 transition-colors"
          style={{ width: width ? `${width}px` : '100%', maxWidth: '100%' }}
        />
        <div className="audio-node-actions">
          <button
            type="button"
            onClick={() => updateAttributes({ souvenir: !souvenir })}
            className={`audio-node-action-btn${souvenir ? ' audio-node-action-active' : ''}`}
            aria-label={souvenir ? 'Retirer des souvenirs' : 'Ajouter aux souvenirs'}
          >
            {souvenir
              ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> Souvenir</>
              : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Souvenir</>
            }
          </button>
          <button
            type="button"
            onClick={() => updateAttributes({ spoiler: !spoiler })}
            className={`audio-node-action-btn${spoiler ? ' audio-node-action-active' : ''}`}
            aria-label={spoiler ? 'Retirer le spoiler' : 'Marquer comme spoiler'}
          >
            {spoiler
              ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg> Spoiler actif</>
              : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Spoiler</>
            }
          </button>
        </div>
      </div>
    </NodeViewWrapper>
  );
}

// ── Extension ─────────────────────────────────────────────────────────────────

interface SerializerState { write: (s: string) => void; closeBlock: (n: object) => void; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMd = any;

export const ResizableImage = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src:     { default: null },
      alt:     { default: null },
      title:   { default: null },
      width:   { default: null },
      spoiler: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-spoiler') === 'true',
        renderHTML: (attrs) => attrs.spoiler ? { 'data-spoiler': 'true' } : {},
      },
      souvenir: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-souvenir') === 'true',
        renderHTML: (attrs) => attrs.souvenir ? { 'data-souvenir': 'true' } : {},
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[src]',
        getAttrs: (el) => {
          const img = el as HTMLImageElement;
          const styleWidth = img.style.width ? parseInt(img.style.width) : null;
          const attrWidth  = img.width || null;
          return {
            src:      img.getAttribute('src'),
            alt:      img.getAttribute('alt'),
            title:    img.getAttribute('title'),
            width:    styleWidth ?? (attrWidth || null),
            spoiler:  img.getAttribute('data-spoiler') === 'true',
            souvenir: img.getAttribute('data-souvenir') === 'true',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    const { width, spoiler, souvenir, ...rest } = HTMLAttributes;
    const style = width ? `width:${width}px` : undefined;
    return ['img', mergeAttributes(
      rest,
      style ? { style } : {},
      spoiler  ? { 'data-spoiler': 'true' }  : {},
      souvenir ? { 'data-souvenir': 'true' } : {},
    )];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },

  addCommands() {
    return {
      setImage:
        (attrs: { src: string; alt?: string; title?: string; width?: number }) =>
        ({ state, dispatch }: { state: import('@tiptap/pm/state').EditorState; dispatch?: (tr: import('@tiptap/pm/state').Transaction) => void }) => {
          const node = state.schema.nodes['image']!.create(attrs);
          const tr = state.tr.replaceSelectionWith(node);
          if (dispatch) dispatch(tr);
          return true;
        },
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          state: SerializerState,
          node: { attrs: { src?: string; alt?: string; title?: string; width?: number | null; spoiler?: boolean; souvenir?: boolean } } & object,
        ) {
          const { src = '', alt = '', title, width, spoiler, souvenir } = node.attrs;
          if (width || spoiler || souvenir || (alt && alt.trim())) {
            // Syntaxe custom :::img — survivit à l'aller-retour tiptap-markdown.
            const safeSrc = src.replace(/"/g, "'");
            const safeAlt = (alt || title || '').replace(/"/g, "'");
            const widthPart    = width    ? ` ${width}`    : '';
            const souvenirPart = souvenir ? ' souvenir'    : '';
            const wrap = spoiler ? '||' : '';
            state.write(`${wrap}:::img "${safeSrc}" "${safeAlt}"${widthPart}${souvenirPart}${wrap}`);
          } else {
            const titlePart = title ? ` "${title}"` : '';
            state.write(`![${alt ?? ''}](${src}${titlePart})`);
          }
          state.closeBlock(node);
        },
        parse: {
          setup(md: AnyMd) {
            md.block.ruler.before(
              'fence',
              'img_node',
              (state: AnyMd, startLine: number, _endLine: number, silent: boolean) => {
                const pos = state.bMarks[startLine] + state.tShift[startLine];
                const max = state.eMarks[startLine];
                const line = state.src.slice(pos, max).trim();

                const isSpoiler = line.startsWith('||:::img');
                if (!isSpoiler && !line.startsWith(':::img')) return false;
                if (silent) return true;

                // Format: [||]:::img "src" "alt" [width] [souvenir][||]
                const m = isSpoiler
                  ? line.match(/^\|\|:::img\s+"([^"]*)"\s+"([^"]*)"((?:\s+\d+)?)((?:\s+souvenir)?)\|\|$/)
                  : line.match(/^:::img\s+"([^"]*)"\s+"([^"]*)"((?:\s+\d+)?)((?:\s+souvenir)?)$/);
                const src      = m?.[1] ?? '';
                const alt      = m?.[2] ?? '';
                const width    = m?.[3] ? parseInt(m[3].trim()) : null;
                const isSouvenir = (m?.[4] ?? '').trim() === 'souvenir';

                const esc = (s: string) => s.replace(/"/g, '&quot;');
                const styleAttr    = width      ? ` style="width:${width}px"` : '';
                const spoilerAttr  = isSpoiler  ? ' data-spoiler="true"'      : '';
                const souvenirAttr = isSouvenir ? ' data-souvenir="true"'     : '';
                const token = state.push('html_block', '', 0);
                token.content = `<img src="${esc(src)}" alt="${esc(alt)}"${styleAttr}${spoilerAttr}${souvenirAttr}>\n`;
                token.block = true;
                token.map = [startLine, startLine + 1];
                state.line = startLine + 1;
                return true;
              },
              { alt: ['paragraph', 'reference', 'blockquote', 'list'] },
            );
          },
        },
      },
    };
  },
});
