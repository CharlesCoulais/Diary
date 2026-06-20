import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { MermaidNodeView } from './MermaidNodeView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mermaid: {
      insertMermaid: (code?: string) => ReturnType;
    };
  }
}

interface SerializerState {
  write: (s: string) => void;
  ensureNewLine: () => void;
  closeBlock: (n: object) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMd = any;

/** Diagramme par défaut à l'insertion. */
export const DEFAULT_MERMAID = 'graph TD\n  A[Début] --> B[Étape]\n  B --> C[Fin]';

// btoa unicode-safe pour stocker le code (multiligne) dans un attribut HTML.
function encodeBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return typeof btoa !== 'undefined' ? btoa(bin) : Buffer.from(bytes).toString('base64');
}

function decodeBase64(s: string): string {
  try {
    const bin = typeof atob !== 'undefined' ? atob(s) : Buffer.from(s, 'base64').toString('binary');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

export const Mermaid = Node.create({
  name: 'mermaid',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      code: {
        default: '',
        parseHTML: (el) => {
          const b64 = el.getAttribute('data-code-b64');
          if (b64) return decodeBase64(b64);
          return el.getAttribute('data-code') ?? '';
        },
        renderHTML: (attrs) => (attrs.code ? { 'data-code-b64': encodeBase64(attrs.code) } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="mermaid"]' }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'mermaid' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidNodeView);
  },

  addCommands() {
    return {
      insertMermaid:
        (code?: string) =>
        ({ state, dispatch }) => {
          const { schema } = state;
          const node = schema.nodes['mermaid']!.create({ code: code ?? DEFAULT_MERMAID });
          const $from = state.selection.$from;
          // `$from.after($from.depth)` = juste après le bloc courant, DANS son
          // conteneur (donc à l'intérieur d'une branche / d'un ajout si le curseur
          // y est) — et non `$from.after(1)` qui insérait toujours au niveau racine.
          const insertPos = $from.depth > 0 ? $from.after($from.depth) : state.doc.content.size;
          if (dispatch) {
            const tr = state.tr.insert(insertPos, node);
            dispatch(tr);
          }
          return true;
        },
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: SerializerState, node: { attrs: { code?: string } } & object) {
          const code = node.attrs.code ?? '';
          state.write(':::mermaid\n');
          state.write(code);
          state.ensureNewLine();
          state.write(':::');
          state.closeBlock(node);
        },
        parse: {
          setup(md: AnyMd) {
            md.block.ruler.before(
              'fence',
              'mermaid_block',
              (state: AnyMd, startLine: number, endLine: number, silent: boolean) => {
                const pos = state.bMarks[startLine] + state.tShift[startLine];
                const max = state.eMarks[startLine];
                const line = state.src.slice(pos, max).trim();

                if (line !== ':::mermaid') return false;
                if (silent) return true;

                let nextLine = startLine + 1;
                const bodyLines: string[] = [];
                let hasEnding = false;

                for (; nextLine < endLine; nextLine++) {
                  // ⚠️ Ne PAS ajouter `tShift` : il pointerait après l'indentation
                  // et on perdrait les espaces/tabulations de début de ligne, ce qui
                  // casse les diagrammes Mermaid sensibles à l'indentation. On part de
                  // `bMarks + blkIndent` (0 au niveau racine) pour conserver
                  // l'indentation propre du diagramme tout en retirant celle d'un
                  // éventuel conteneur (liste, citation).
                  const lPos = state.bMarks[nextLine] + state.blkIndent;
                  const lMax = state.eMarks[nextLine];
                  const lLine = state.src.slice(lPos, lMax);
                  if (lLine.trim() === ':::') {
                    hasEnding = true;
                    break;
                  }
                  bodyLines.push(lLine);
                }

                const code = bodyLines.join('\n');

                // On émet un html_block auto-fermant (comme AudioNode) : déterministe
                // et capté par `parseHTML` (`div[data-type="mermaid"]`). Le base64
                // est sûr dans un attribut HTML (pas de guillemets).
                const b64 = code ? encodeBase64(code) : '';
                const token = state.push('html_block', '', 0);
                token.content = `<div data-type="mermaid"${b64 ? ` data-code-b64="${b64}"` : ''}></div>\n`;
                token.block = true;
                token.map = [startLine, nextLine];

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
