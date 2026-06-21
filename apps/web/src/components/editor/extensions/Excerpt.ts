import { Node, mergeAttributes, type CommandProps } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ExcerptNodeView } from './ExcerptNodeView';
import type { ExcerptKind } from '../excerptKinds';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    excerpt: {
      insertExcerpt: (kind: ExcerptKind) => ReturnType;
    };
  }
}

// Types pour le sérialiseur prosemirror-markdown
interface SerializerState {
  write: (s: string) => void;
  renderContent: (n: object) => void;
  ensureNewLine: () => void;
  closeBlock: (n: object) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMd = any;

interface ExcerptAttrs {
  kind: ExcerptKind;
  meta: Record<string, string>;
}

/**
 * Bloc « extrait / citation » repliable, façon citation, avec des métadonnées.
 * Un seul node pour 3 variantes (livre, paroles, film/série), distinguées par
 * `kind` (cf. `excerptKinds.tsx`). Sérialisé `:::<kind> {json}\n …contenu… \n:::`
 * (le tag markdown EST le kind : `book`/`lyrics`/`movie`).
 */
export const Excerpt = Node.create({
  name: 'excerpt',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,
  draggable: true,

  addAttributes() {
    return {
      kind: {
        default: 'book',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-excerpt-kind') || 'book',
        renderHTML: (attrs: { kind?: string }) => ({ 'data-excerpt-kind': attrs.kind || 'book' }),
      },
      meta: {
        default: {},
        parseHTML: (el: HTMLElement) => {
          const raw = el.getAttribute('data-excerpt-meta');
          if (!raw) return {};
          try { return JSON.parse(raw); } catch { return {}; }
        },
        renderHTML: (attrs: { meta?: Record<string, string> }) => {
          const m = attrs.meta && Object.keys(attrs.meta).length ? attrs.meta : null;
          return m ? { 'data-excerpt-meta': JSON.stringify(m) } : {};
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="excerpt"]' }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'excerpt' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ExcerptNodeView);
  },

  addCommands() {
    return {
      insertExcerpt:
        (kind: ExcerptKind) =>
        ({ state, dispatch }: CommandProps) => {
          const { selection, schema } = state;
          const { $from } = selection;
          const insertPos = $from.after($from.depth);

          if (dispatch) {
            let tr = state.tr;
            const node = schema.nodes['excerpt']!.create(
              { kind, meta: {} },
              schema.nodes['paragraph']!.create(),
            );
            tr = tr.insert(insertPos, node);
            const start = insertPos + 1;
            tr.setSelection(
              TextSelection.near(tr.doc.resolve(start + 1)),
            ).scrollIntoView();
            dispatch(tr);
          }
          return true;
        },
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: SerializerState, node: { attrs: ExcerptAttrs } & object) {
          const kind = node.attrs.kind || 'book';
          const meta = node.attrs.meta || {};
          const clean: Record<string, string> = {};
          for (const k of Object.keys(meta)) {
            const val = meta[k];
            if (val != null && String(val).trim() !== '') clean[k] = String(val);
          }
          const metaStr = Object.keys(clean).length ? ` ${JSON.stringify(clean)}` : '';
          state.write(`:::${kind}${metaStr}\n`);
          state.renderContent(node);
          state.ensureNewLine();
          state.write(':::');
          state.closeBlock(node);
        },
        parse: {
          setup(md: AnyMd) {
            md.block.ruler.before(
              'fence',
              'excerpt_container',
              (state: AnyMd, startLine: number, endLine: number, silent: boolean) => {
                const pos = state.bMarks[startLine] + state.tShift[startLine];
                const max = state.eMarks[startLine];
                const line = state.src.slice(pos, max).trim();

                const open = line.match(/^:::(book|lyrics|movie)\b/);
                if (!open) return false;
                if (silent) return true;
                const kind = open[1];

                // Métadonnées JSON optionnelles après le tag.
                let meta: Record<string, string> = {};
                const rest = line.slice(open[0].length).trim();
                if (rest) {
                  try { meta = JSON.parse(rest); } catch { /* métadonnées ignorées si invalides */ }
                }

                let nextLine = startLine + 1;
                let hasEnding = false;
                // Profondeur : un conteneur imbriqué ouvre un niveau, `:::` seul le ferme.
                let depth = 1;
                for (; nextLine < endLine; nextLine++) {
                  const lPos = state.bMarks[nextLine] + state.tShift[nextLine];
                  const lMax = state.eMarks[nextLine];
                  const t = state.src.slice(lPos, lMax).trim();
                  if (/^:::(?:branch|edit|chat|mermaid|book|lyrics|movie)\b/.test(t)) {
                    depth++;
                  } else if (t === ':::') {
                    depth--;
                    if (depth === 0) { hasEnding = true; break; }
                  }
                }

                const oldParent = state.parentType;
                const oldLineMax = state.lineMax;
                state.parentType = 'container';
                state.lineMax = nextLine;

                let token = state.push('excerpt_open', 'div', 1);
                token.attrSet('data-type', 'excerpt');
                token.attrSet('data-excerpt-kind', kind);
                if (Object.keys(meta).length) token.attrSet('data-excerpt-meta', JSON.stringify(meta));
                token.block = true;
                token.map = [startLine, nextLine];

                state.md.block.tokenize(state, startLine + 1, nextLine);

                token = state.push('excerpt_close', 'div', -1);
                token.block = true;

                state.parentType = oldParent;
                state.lineMax = oldLineMax;
                state.line = nextLine + (hasEnding ? 1 : 0);

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
