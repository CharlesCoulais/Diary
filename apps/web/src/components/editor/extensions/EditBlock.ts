import { Node, mergeAttributes, type CommandProps } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { EditBlockNodeView } from './EditBlockNodeView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    editBlock: {
      insertEditBlock: () => ReturnType;
    };
  }
}

interface SerializerState {
  write: (s: string) => void;
  renderContent: (n: object) => void;
  ensureNewLine: () => void;
  closeBlock: (n: object) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMd = any;

export const EditBlock = Node.create({
  name: 'editBlock',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,
  draggable: true,

  addAttributes() {
    return {
      datetime: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-datetime'),
        renderHTML: (attrs) =>
          attrs.datetime ? { 'data-datetime': attrs.datetime } : {},
      },
      anchorText: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-anchor-text'),
        renderHTML: (attrs) =>
          attrs.anchorText ? { 'data-anchor-text': attrs.anchorText } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="edit-block"]' }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'edit-block' }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EditBlockNodeView);
  },

  addCommands() {
    return {
      insertEditBlock:
        () =>
        ({ state, dispatch, commands }: CommandProps) => {
          const { selection, schema } = state;
          const { $from, $to, empty } = selection;

          // If text is selected, use it as anchor and apply the branchAnchor mark
          const anchorText = !empty ? state.doc.textBetween($from.pos, $to.pos) : null;
          if (!empty && schema.marks['branchAnchor']) {
            commands.setMark(schema.marks['branchAnchor']);
          }

          const datetime = new Date().toISOString();
          const insertPos = state.doc.content.size - 1;

          if (dispatch) {
            const editNode = schema.nodes['editBlock']!.create(
              { datetime, anchorText },
              schema.nodes['paragraph']!.create(),
            );
            const tr = state.tr.insert(insertPos, editNode);
            const nodeStart = insertPos + 1;
            tr.setSelection(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (state.selection.constructor as any).near(tr.doc.resolve(nodeStart + 1)),
            );
            dispatch(tr);
          }
          return true;
        },
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: SerializerState, node: { attrs: { datetime?: string; anchorText?: string } } & object) {
          const dt = node.attrs.datetime ?? new Date().toISOString();
          const anchor = node.attrs.anchorText ? ` "${node.attrs.anchorText}"` : '';
          state.write(`:::edit "${dt}"${anchor}\n`);
          state.renderContent(node);
          state.ensureNewLine();
          state.write(':::');
          state.closeBlock(node);
        },
        parse: {
          setup(md: AnyMd) {
            md.block.ruler.before(
              'fence',
              'edit_block_container',
              (state: AnyMd, startLine: number, endLine: number, silent: boolean) => {
                const pos = state.bMarks[startLine] + state.tShift[startLine];
                const max = state.eMarks[startLine];
                const line = state.src.slice(pos, max).trim();

                if (!line.startsWith(':::edit')) return false;
                if (silent) return true;

                // Format: :::edit "ISO-datetime" "optional anchor text"
                const dtMatch = line.match(/^:::edit\s+"([^"]*)"/);
                const datetime = dtMatch ? dtMatch[1] : new Date().toISOString();
                const anchorMatch = line.match(/^:::edit\s+"[^"]*"\s+"([^"]*)"/);
                const anchorText = anchorMatch ? anchorMatch[1] : null;

                let nextLine = startLine + 1;
                let hasEnding = false;
                // Profondeur d'imbrication (cf. Branch) : un conteneur multi-lignes
                // imbriqué ouvre un niveau, un `:::` seul le ferme — on ne ferme
                // l'ajout qu'au `:::` qui ramène à 0.
                let depth = 1;

                for (; nextLine < endLine; nextLine++) {
                  const lPos = state.bMarks[nextLine] + state.tShift[nextLine];
                  const lMax = state.eMarks[nextLine];
                  const t = state.src.slice(lPos, lMax).trim();
                  if (/^:::(?:branch|edit|chat|mermaid)\b/.test(t)) {
                    depth++;
                  } else if (t === ':::') {
                    depth--;
                    if (depth === 0) {
                      hasEnding = true;
                      break;
                    }
                  }
                }

                const oldParent = state.parentType;
                const oldLineMax = state.lineMax;

                state.parentType = 'container';
                state.lineMax = nextLine;

                let token = state.push('edit_block_open', 'div', 1);
                token.attrSet('data-type', 'edit-block');
                token.attrSet('data-datetime', datetime);
                if (anchorText) token.attrSet('data-anchor-text', anchorText);
                token.block = true;
                token.map = [startLine, nextLine];

                state.md.block.tokenize(state, startLine + 1, nextLine);

                token = state.push('edit_block_close', 'div', -1);
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
