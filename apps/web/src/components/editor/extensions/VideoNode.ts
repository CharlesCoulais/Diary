import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { VideoNodeView } from './VideoNodeView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    videoNode: {
      insertVideo: (src: string, filename: string) => ReturnType;
    };
  }
}

interface SerializerState {
  write: (s: string) => void;
  closeBlock: (n: object) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMd = any;

export const VideoNode = Node.create({
  name: 'videoNode',
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
      souvenir: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-souvenir') === 'true',
        renderHTML: (attrs) => attrs.souvenir ? { 'data-souvenir': 'true' } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="video-node"]' }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'video-node' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoNodeView);
  },

  addCommands() {
    return {
      insertVideo:
        (src: string, filename: string) =>
        ({ state, dispatch }) => {
          const { schema } = state;
          const node = schema.nodes['videoNode']!.create({ src, filename });
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
          node: { attrs: { src?: string; filename?: string; spoiler?: boolean; souvenir?: boolean } } & object,
        ) {
          const src = node.attrs.src ?? '';
          const name = (node.attrs.filename ?? '').replace(/"/g, "'");
          const wrap = node.attrs.spoiler ? '||' : '';
          const souvenirFlag = node.attrs.souvenir ? ' souvenir' : '';
          state.write(`${wrap}:::video "${src}" "${name}"${souvenirFlag}${wrap}`);
          state.closeBlock(node);
        },
        parse: {
          setup(md: AnyMd) {
            md.block.ruler.before(
              'fence',
              'video_node',
              (state: AnyMd, startLine: number, _endLine: number, silent: boolean) => {
                const pos = state.bMarks[startLine] + state.tShift[startLine];
                const max = state.eMarks[startLine];
                const line = state.src.slice(pos, max).trim();

                const isSpoiler = line.startsWith('||:::video');
                if (!isSpoiler && !line.startsWith(':::video')) return false;
                if (silent) return true;

                const m = isSpoiler
                  ? line.match(/^\|\|:::video\s+"([^"]*)"\s+"([^"]*)"((?:\s+souvenir)?)\|\|$/)
                  : line.match(/^:::video\s+"([^"]*)"\s+"([^"]*)"((?:\s+souvenir)?)$/);
                const src = m?.[1] ?? '';
                const filename = m?.[2] ?? '';
                const isSouvenir = (m?.[3] ?? '').trim() === 'souvenir';

                const escapedSrc = src.replace(/"/g, '&quot;');
                const escapedName = filename.replace(/"/g, '&quot;');
                const token = state.push('html_block', '', 0);
                token.content = `<div data-type="video-node" data-src="${escapedSrc}" data-filename="${escapedName}"${isSpoiler ? ' data-spoiler="true"' : ''}${isSouvenir ? ' data-souvenir="true"' : ''}></div>\n`;
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
