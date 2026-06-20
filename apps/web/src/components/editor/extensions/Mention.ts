import { Node, mergeAttributes } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import { MentionList, type MentionItem, type MentionListRef } from './MentionList';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mention: {
      insertMention: (attrs: { id: string; label: string }) => ReturnType;
    };
  }
}

// Types pour le sérialiseur prosemirror-markdown / parser markdown-it.
interface SerializerState { write: (s: string) => void; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMd = any;

/**
 * Source des personnes mentionnables, alimentée par DiaryEditor (qui détient la
 * query tRPC). Le plugin Suggestion lit cette fonction à chaque frappe — pas de
 * prop drilling dans la config statique de l'extension.
 */
let itemsProvider: () => MentionItem[] = () => [];
export function setMentionItems(get: () => MentionItem[]): void {
  itemsProvider = get;
}

/** Positionne le popup en `fixed` au-dessus/dessous du curseur, borné au viewport. */
function place(popup: HTMLDivElement, rect: DOMRect | null) {
  if (!rect) return;
  const margin = 8;
  const panelH = popup.offsetHeight || 200;
  const panelW = popup.offsetWidth || 224;
  const below = rect.bottom + margin;
  const flipUp = below + panelH > window.innerHeight && rect.top - margin - panelH > 0;
  let left = rect.left;
  if (left + panelW > window.innerWidth - margin) left = window.innerWidth - panelW - margin;
  if (left < margin) left = margin;
  popup.style.left = `${left}px`;
  if (flipUp) { popup.style.top = `${rect.top - margin - panelH}px`; }
  else { popup.style.top = `${below}px`; }
}

/**
 * Mention @ dans une note. Forme canonique markdown : `[@Label](mention:id)`
 * (identique aux commentaires → AnnotatedReader / preview / récap la gèrent déjà).
 *
 * Round-trip : serialize écrit le token markdown ; au chargement, une règle inline
 * markdown-it le re-rend en `<span data-mention-id>` (via `html:true`), capté par
 * `parseHTML`. L'`id` est une réf stable (cuid) ; `label` est le nom affiché.
 */
export const Mention = Node.create({
  name: 'mention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-mention-id'),
        renderHTML: (attrs) => (attrs.id ? { 'data-mention-id': attrs.id } : {}),
      },
      label: {
        default: '',
        parseHTML: (el) => (el.textContent ?? '').replace(/^@/, ''),
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-mention-id]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-mention-id': node.attrs.id, class: 'mention-chip' }),
      `@${node.attrs.label}`,
    ];
  },

  renderText({ node }) {
    return `@${node.attrs.label}`;
  },

  addCommands() {
    return {
      insertMention:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: SerializerState, node: { attrs: { id: string; label: string } }) {
          state.write(`[@${node.attrs.label}](mention:${node.attrs.id})`);
        },
        parse: {
          setup(md: AnyMd) {
            // Règle inline AVANT `link` : capte `[@label](mention:id)` et le rend
            // en HTML inline (span) — `html:true` le préserve, parseHTML le reprend.
            md.inline.ruler.before('link', 'mention', (state: AnyMd, silent: boolean) => {
              const src: string = state.src;
              const start: number = state.pos;
              if (src.charCodeAt(start) !== 0x5b /* [ */ || src.charCodeAt(start + 1) !== 0x40 /* @ */) {
                return false;
              }
              const m = /^\[@([^\]\n]+)\]\(mention:([\w-]+)\)/.exec(src.slice(start));
              if (!m) return false;
              if (!silent) {
                const token = state.push('html_inline', '', 0);
                const label = md.utils.escapeHtml(m[1]);
                const id = md.utils.escapeHtml(m[2]);
                token.content = `<span data-mention-id="${id}" class="mention-chip">@${label}</span>`;
              }
              state.pos += m[0].length;
              return true;
            });
          },
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<MentionItem>({
        editor: this.editor,
        char: '@',
        // Insère le node mention + une espace, en remplaçant le `@query` tapé.
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: this.name, attrs: { id: props.id, label: props.label } },
              { type: 'text', text: ' ' },
            ])
            .run();
        },
        items: ({ query }) => {
          const q = query.toLowerCase();
          return itemsProvider()
            .filter((it) => it.label.toLowerCase().includes(q))
            .slice(0, 6);
        },
        render: () => {
          let component: ReactRenderer<MentionListRef> | null = null;
          let popup: HTMLDivElement | null = null;

          return {
            onStart: (props) => {
              component = new ReactRenderer(MentionList, { props, editor: props.editor });
              popup = document.createElement('div');
              popup.style.position = 'fixed';
              popup.style.zIndex = '60';
              popup.appendChild(component.element);
              document.body.appendChild(popup);
              place(popup, props.clientRect?.() ?? null);
            },
            onUpdate: (props) => {
              component?.updateProps(props);
              if (popup) place(popup, props.clientRect?.() ?? null);
            },
            onKeyDown: (props) => {
              if (props.event.key === 'Escape') {
                popup?.remove();
                return true;
              }
              return component?.ref?.onKeyDown(props) ?? false;
            },
            onExit: () => {
              popup?.remove();
              popup = null;
              component?.destroy();
              component = null;
            },
          };
        },
      }),
    ];
  },
});
