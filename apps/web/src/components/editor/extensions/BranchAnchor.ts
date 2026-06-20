import { Mark, mergeAttributes } from '@tiptap/core';

export const BranchAnchor = Mark.create({
  name: 'branchAnchor',
  inclusive: false,
  excludes: '',

  parseHTML() {
    return [{ tag: 'span[data-branch-anchor]' }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-branch-anchor': '', class: 'branch-anchor-mark' }),
      0,
    ];
  },

  addStorage() {
    return {
      // Sérialise comme du texte simple — le mark est visuel uniquement dans l'app
      markdown: {
        serialize: { open: '', close: '' },
        parse: {},
      },
    };
  },
});
