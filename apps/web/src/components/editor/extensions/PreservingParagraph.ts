import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';

// Réimplémente Paragraph (équivalent @tiptap/extension-paragraph) pour pouvoir
// override addStorage().markdown — l'extension-paragraph n'est pas directement
// importable depuis StarterKit dans ce projet.
const ParagraphBase = Node.create({
  name: 'paragraph',
  priority: 1000,
  group: 'block',
  content: 'inline*',
  parseHTML() {
    return [{ tag: 'p' }];
  },
  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return ['p', mergeAttributes(HTMLAttributes), 0];
  },
  addCommands() {
    return {
      setParagraph: () => ({ commands }) => commands.setNode(this.name),
    };
  },
  addKeyboardShortcuts() {
    return {
      'Mod-Alt-0': () => this.editor.commands.setParagraph(),
    };
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SerializerState = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PmNode = any;

const NBSP = '\u00A0';

/**
 * Transaction qui vide les paragraphes ne contenant qu'un NBSP — l'artefact du
 * round-trip Markdown (cf. serialize ci-dessous) et de buildPasteHtml. Sans ça,
 * chaque ligne vide contient un « espace » réel dans le document (curseur,
 * sélection, copie). Renvoie null si rien à normaliser.
 */
export function normalizeNbspParagraphs(state: EditorState): Transaction | null {
  let tr: Transaction | null = null;
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph' && node.content.size > 0 && node.textContent === NBSP) {
      if (!tr) tr = state.tr;
      tr.delete(tr.mapping.map(pos + 1), tr.mapping.map(pos + 1 + node.content.size));
    }
    return true;
  });
  return tr;
}

/**
 * Variante de Paragraph qui préserve les paragraphes vides à la sérialisation
 * Markdown — émet un espace insécable (U+00A0) pour qu'une ligne blanche entre
 * deux paragraphes survive au round-trip TipTap → Markdown → TipTap.
 *
 * Le NBSP n'est qu'un véhicule de transport : côté éditeur, le plugin
 * ci-dessous re-vide ces paragraphes dès qu'ils apparaissent (chargement d'une
 * note, collage), pour que les lignes vides ne contiennent pas un espace réel.
 */
export const PreservingParagraph = ParagraphBase.extend({
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('normalizeNbspParagraphs'),
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((t) => t.docChanged)) return null;
          return normalizeNbspParagraphs(newState);
        },
      }),
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: SerializerState, node: PmNode) {
          if (node.content.size === 0) {
            state.write(' ');
            state.closeBlock(node);
            return;
          }
          state.renderInline(node);
          state.closeBlock(node);
        },
        parse: {
          // markdown-it gère le parsing standard des paragraphes
        },
      },
    };
  },
});
