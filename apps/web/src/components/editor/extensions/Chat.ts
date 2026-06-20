import { Node, mergeAttributes, type CommandProps } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ChatNodeView } from './ChatNodeView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    chat: {
      insertChat: (opts?: { platform?: string; title?: string; raw?: string }) => ReturnType;
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

// btoa unicode-safe pour les attributs HTML (TextEncoder + base64).
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

export const Chat = Node.create({
  name: 'chat',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      platform: {
        default: 'other',
        parseHTML: (el) => el.getAttribute('data-platform') ?? 'other',
        renderHTML: (attrs) => ({ 'data-platform': attrs.platform ?? 'other' }),
      },
      title: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-title') ?? '',
        renderHTML: (attrs) => (attrs.title ? { 'data-title': attrs.title } : {}),
      },
      raw: {
        default: '',
        parseHTML: (el) => {
          const b64 = el.getAttribute('data-raw-b64');
          if (b64) return decodeBase64(b64);
          return el.getAttribute('data-raw') ?? '';
        },
        renderHTML: (attrs) => (attrs.raw ? { 'data-raw-b64': encodeBase64(attrs.raw) } : {}),
      },
      me: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-me') ?? '',
        renderHTML: (attrs) => (attrs.me ? { 'data-me': attrs.me } : {}),
      },
      aliases: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-aliases') ?? '',
        renderHTML: (attrs) => (attrs.aliases ? { 'data-aliases': attrs.aliases } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="chat"]' }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'chat' }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChatNodeView);
  },

  addCommands() {
    return {
      insertChat:
        (opts) =>
        ({ state, dispatch }: CommandProps) => {
          const insertPos = state.selection.$from.pos;
          const schema = state.schema;
          const node = schema.nodes['chat']!.create({
            platform: opts?.platform ?? 'other',
            title: opts?.title ?? '',
            raw: opts?.raw ?? '[12:00] Toi\nÉcris ici la conversation…',
          });
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
        serialize(state: SerializerState, node: { attrs: { platform?: string; title?: string; raw?: string; me?: string; aliases?: string } } & object) {
          const platform = node.attrs.platform ?? 'other';
          const title = node.attrs.title ?? '';
          const me = node.attrs.me ?? '';
          const aliases = node.attrs.aliases ?? '';
          const raw = node.attrs.raw ?? '';
          const titleAttr = title ? ` with="${title.replace(/"/g, '\\"')}"` : '';
          const meAttr = me ? ` me="${me.replace(/"/g, '\\"')}"` : '';
          const aliasesAttr = aliases ? ` aliases="${aliases.replace(/"/g, '\\"')}"` : '';
          state.write(`:::chat platform="${platform}"${titleAttr}${meAttr}${aliasesAttr}\n`);
          state.write(raw);
          state.ensureNewLine();
          state.write(':::');
          state.closeBlock(node);
        },
        parse: {
          setup(md: AnyMd) {
            md.block.ruler.before(
              'fence',
              'chat_block_container',
              (state: AnyMd, startLine: number, endLine: number, silent: boolean) => {
                const pos = state.bMarks[startLine] + state.tShift[startLine];
                const max = state.eMarks[startLine];
                const line = state.src.slice(pos, max).trim();

                if (!line.startsWith(':::chat')) return false;
                if (silent) return true;

                const platformMatch = line.match(/platform="([^"]*)"/);
                const titleMatch = line.match(/with="((?:[^"\\]|\\.)*)"/);
                const meMatch = line.match(/me="((?:[^"\\]|\\.)*)"/);
                const aliasesMatch = line.match(/aliases="((?:[^"\\]|\\.)*)"/);
                const platform = platformMatch ? platformMatch[1] : 'other';
                const title = titleMatch ? titleMatch[1]!.replace(/\\"/g, '"') : '';
                const me = meMatch ? meMatch[1]!.replace(/\\"/g, '"') : '';
                const aliases = aliasesMatch ? aliasesMatch[1]!.replace(/\\"/g, '"') : '';

                let nextLine = startLine + 1;
                const bodyLines: string[] = [];
                let hasEnding = false;

                for (; nextLine < endLine; nextLine++) {
                  const lPos = state.bMarks[nextLine] + state.tShift[nextLine];
                  const lMax = state.eMarks[nextLine];
                  const lLine = state.src.slice(lPos, lMax);
                  if (lLine.trim() === ':::') {
                    hasEnding = true;
                    break;
                  }
                  bodyLines.push(lLine);
                }

                const raw = bodyLines.join('\n');

                let token = state.push('chat_block_open', 'div', 1);
                token.attrSet('data-type', 'chat');
                token.attrSet('data-platform', platform || 'other');
                if (title) token.attrSet('data-title', title);
                if (me) token.attrSet('data-me', me);
                if (aliases) token.attrSet('data-aliases', aliases);
                // raw peut contenir des newlines : on encode en base64 unicode-safe pour
                // ne pas casser le sérialiseur HTML d'attributs.
                if (raw) token.attrSet('data-raw-b64', encodeBase64(raw));
                token.block = true;
                token.map = [startLine, nextLine];

                token = state.push('chat_block_close', 'div', -1);
                token.block = true;

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
