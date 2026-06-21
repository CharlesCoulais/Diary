import { Node, mergeAttributes, type CommandProps } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { BranchNodeView } from './BranchNodeView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    branch: {
      insertBranch: (anchorText?: string) => ReturnType;
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

export const Branch = Node.create({
  name: 'branch',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,
  draggable: true,

  addAttributes() {
    return {
      anchorText: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-anchor-text'),
        renderHTML: (attrs) =>
          attrs.anchorText ? { 'data-anchor-text': attrs.anchorText } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="branch"]' }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'branch' }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(BranchNodeView);
  },

  addCommands() {
    return {
      /**
       * Applique le mark branchAnchor sur la sélection (si texte sélectionné),
       * puis insère un nœud branch juste après le bloc courant.
       */
      insertBranch:
        (anchorText?: string) =>
        ({ state, dispatch, commands }: CommandProps) => {
          const { selection, schema } = state;
          const { $from, $to, empty } = selection;

          // Texte ancre = sélection courante ou paramètre
          const selectedText =
            anchorText ??
            (!empty
              ? state.doc.textBetween($from.pos, $to.pos)
              : null);

          // $from.after($from.depth) = position juste après le nœud bloc courant
          // (≠ $from.end() qui est à l'intérieur du nœud, ce qui provoquerait une imbrication)
          const insertPos = $from.after($from.depth);

          if (dispatch) {
            let tr = state.tr;

            // Appliquer le mark branchAnchor dans la même transaction (évite le double dispatch)
            if (!empty && schema.marks['branchAnchor']) {
              tr = tr.addMark($from.pos, $to.pos, schema.marks['branchAnchor']!.create());
            }

            const branchNode = schema.nodes['branch']!.create(
              { anchorText: selectedText },
              schema.nodes['paragraph']!.create(),
            );
            tr = tr.insert(insertPos, branchNode);
            // TextSelection.near() au lieu de selection.constructor.near() —
            // NodeSelection et d'autres types n'ont pas de méthode statique near()
            const branchStart = insertPos + 1;
            tr.setSelection(
              TextSelection.near(tr.doc.resolve(branchStart + 1)),
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
        serialize(state: SerializerState, node: { attrs: { anchorText?: string } } & object) {
          const anchor = node.attrs.anchorText ? ` "${node.attrs.anchorText}"` : '';
          state.write(`:::branch${anchor}\n`);
          state.renderContent(node);
          state.ensureNewLine();
          state.write(':::');
          state.closeBlock(node);
        },
        parse: {
          setup(md: AnyMd) {
            md.block.ruler.before(
              'fence',
              'branch_container',
              (state: AnyMd, startLine: number, endLine: number, silent: boolean) => {
                const pos = state.bMarks[startLine] + state.tShift[startLine];
                const max = state.eMarks[startLine];
                const line = state.src.slice(pos, max).trim();

                if (!line.startsWith(':::branch')) return false;
                if (silent) return true;

                // Extraire le texte ancre optionnel : :::branch "anchor text"
                const anchorMatch = line.match(/^:::branch\s+"([^"]*)"$/);
                const anchorText = anchorMatch ? anchorMatch[1] : null;

                let nextLine = startLine + 1;
                let hasEnding = false;
                // Profondeur d'imbrication : on est déjà dans le `:::branch` (=1).
                // Tout conteneur multi-lignes imbriqué (branch/edit/chat/mermaid)
                // ouvre un niveau ; un `:::` seul le ferme. La branche ne se ferme
                // qu'au `:::` qui ramène la profondeur à 0 — sinon le `:::` d'un
                // diagramme imbriqué fermerait la branche trop tôt.
                let depth = 1;

                for (; nextLine < endLine; nextLine++) {
                  const lPos = state.bMarks[nextLine] + state.tShift[nextLine];
                  const lMax = state.eMarks[nextLine];
                  const t = state.src.slice(lPos, lMax).trim();
                  if (/^:::(?:branch|edit|chat|mermaid|book|lyrics|movie)\b/.test(t)) {
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

                let token = state.push('branch_open', 'div', 1);
                token.attrSet('data-type', 'branch');
                if (anchorText) token.attrSet('data-anchor-text', anchorText);
                token.block = true;
                token.map = [startLine, nextLine];

                state.md.block.tokenize(state, startLine + 1, nextLine);

                token = state.push('branch_close', 'div', -1);
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
