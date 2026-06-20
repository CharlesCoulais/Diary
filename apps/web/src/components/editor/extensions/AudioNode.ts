import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { AudioNodeView } from './AudioNodeView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    audioNode: {
      insertAudio: (src: string, filename: string) => ReturnType;
    };
  }
}

interface SerializerState {
  write: (s: string) => void;
  closeBlock: (n: object) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMd = any;

export const AudioNode = Node.create({
  name: 'audioNode',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-src'),
        renderHTML: (attrs) => ({ 'data-src': attrs.src ?? '' }),
      },
      filename: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-filename'),
        renderHTML: (attrs) => ({ 'data-filename': attrs.filename ?? '' }),
      },
      spoiler: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-spoiler') === 'true',
        renderHTML: (attrs) => attrs.spoiler ? { 'data-spoiler': 'true' } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="audio-node"]' }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'audio-node' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AudioNodeView);
  },

  addCommands() {
    return {
      insertAudio:
        (src: string, filename: string) =>
        ({ state, dispatch }) => {
          const { schema } = state;
          const node = schema.nodes['audioNode']!.create({ src, filename });
          const $from = state.selection.$from;
          const insertPos = $from.depth > 0 ? $from.after(1) : state.doc.content.size;
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
        serialize(
          state: SerializerState,
          node: { attrs: { src?: string; filename?: string; spoiler?: boolean } } & object,
        ) {
          const src = node.attrs.src ?? '';
          const name = (node.attrs.filename ?? '').replace(/"/g, "'");
          const wrap = node.attrs.spoiler ? '||' : '';
          state.write(`${wrap}:::audio "${src}" "${name}"${wrap}`);
          state.closeBlock(node);
        },
        parse: {
          setup(md: AnyMd) {
            md.block.ruler.before(
              'fence',
              'audio_node',
              (state: AnyMd, startLine: number, _endLine: number, silent: boolean) => {
                const pos = state.bMarks[startLine] + state.tShift[startLine];
                const max = state.eMarks[startLine];
                const line = state.src.slice(pos, max).trim();

                const isSpoiler = line.startsWith('||:::audio');
                if (!isSpoiler && !line.startsWith(':::audio')) return false;
                if (silent) return true;

                const m = isSpoiler
                  ? line.match(/^\|\|:::audio\s+"([^"]*)"\s+"([^"]*)"\|\|$/)
                  : line.match(/^:::audio\s+"([^"]*)"\s+"([^"]*)"/);
                const src = m?.[1] ?? '';
                const filename = m?.[2] ?? '';

                const escapedSrc = src.replace(/"/g, '&quot;');
                const escapedName = filename.replace(/"/g, '&quot;');
                const token = state.push('html_block', '', 0);
                token.content = `<div data-type="audio-node" data-src="${escapedSrc}" data-filename="${escapedName}"${isSpoiler ? ' data-spoiler="true"' : ''}></div>\n`;
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
