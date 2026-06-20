import { Mark, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textColor: {
      setColor: (color: string) => ReturnType;
      unsetColor: () => ReturnType;
    };
  }
}

/**
 * Mark inline « couleur du texte ». Calquée sur FontFamily / FontSize : rend un
 * `<span style="color: …">` sérialisé tel quel en markdown (tiptap-markdown
 * `html: true`) et reparsé via `parseHTML`. Le rendu en lecture est géré par
 * AnnotatedReader qui lit `el.style.color`.
 */
export const Color = Mark.create({
  name: 'textColor',
  spanning: true,

  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).style.color || null,
        renderHTML: (attrs) => {
          if (!attrs.color) return {};
          return { style: `color: ${attrs.color as string}` };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[style]',
        getAttrs: (node) => {
          const c = (node as HTMLElement).style.color;
          return c ? { color: c } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setColor: (color) => ({ commands }) => commands.setMark(this.name, { color }),
      unsetColor: () => ({ commands }) => commands.unsetMark(this.name),
    };
  },
});
