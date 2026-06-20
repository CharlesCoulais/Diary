import { Mark, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontFamily: {
      setFontFamily: (fontFamily: string) => ReturnType;
      unsetFontFamily: () => ReturnType;
    };
  }
}

export const FontFamily = Mark.create({
  name: 'fontFamily',
  spanning: true,

  addAttributes() {
    return {
      fontFamily: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).style.fontFamily || null,
        renderHTML: (attrs) => {
          if (!attrs.fontFamily) return {};
          return { style: `font-family: ${attrs.fontFamily as string}` };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[style]',
        getAttrs: (node) => {
          const ff = (node as HTMLElement).style.fontFamily;
          return ff ? { fontFamily: ff } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setFontFamily:
        (fontFamily) =>
        ({ commands }) =>
          commands.setMark(this.name, { fontFamily }),
      unsetFontFamily:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});
