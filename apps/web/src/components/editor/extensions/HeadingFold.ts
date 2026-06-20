import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

/**
 * Repli des sections par titre, **en édition**.
 *
 * Principe : l'état « replié » vit dans l'état du plugin ProseMirror (jamais dans
 * le document), donc il n'est ni sérialisé en markdown ni synchronisé — c'est un
 * pur confort d'affichage, réinitialisé à chaque ouverture (tout déplié par défaut).
 *
 * Un chevron cliquable est posé au début de chaque titre qui possède une section
 * (au moins un bloc avant le prochain titre de niveau égal ou supérieur). Quand un
 * titre est replié, tous les blocs suivants — jusqu'au prochain titre de niveau
 * ≤ au sien — sont masqués via une décoration `display:none`. Le repli est donc
 * naturellement imbriqué (replier un H1 cache aussi ses sous-titres).
 *
 * Les positions repliées sont remappées à chaque transaction qui modifie le doc,
 * donc l'état survit aux éditions sans tracking manuel.
 */

export const headingFoldKey = new PluginKey<HeadingFoldState>('headingFold');

interface HeadingFoldState {
  folded: Set<number>; // positions (avant le node) des titres repliés
}

type FoldMeta =
  | { type: 'toggle'; pos: number }
  | { type: 'foldAll'; value: boolean };

function buildChevron(view: EditorView, pos: number, isFolded: boolean): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'heading-fold-toggle' + (isFolded ? ' is-folded' : '');
  btn.contentEditable = 'false';
  btn.setAttribute('aria-label', isFolded ? 'Déplier la section' : 'Replier la section');
  btn.title = isFolded ? 'Déplier' : 'Replier';
  btn.innerHTML =
    '<svg width="0.7em" height="0.7em" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  // Empêche la perte de sélection / le placement du curseur dans le widget.
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    view.dispatch(view.state.tr.setMeta(headingFoldKey, { type: 'toggle', pos } as FoldMeta));
  });
  return btn;
}

export const HeadingFold = Extension.create({
  name: 'headingFold',

  addProseMirrorPlugins() {
    return [
      new Plugin<HeadingFoldState>({
        key: headingFoldKey,

        state: {
          init: () => ({ folded: new Set<number>() }),
          apply(tr, value) {
            let folded = value.folded;
            const meta = tr.getMeta(headingFoldKey) as FoldMeta | undefined;

            if (meta) {
              folded = new Set(folded);
              if (meta.type === 'toggle') {
                if (folded.has(meta.pos)) folded.delete(meta.pos);
                else folded.add(meta.pos);
              } else if (meta.type === 'foldAll') {
                folded = new Set<number>();
                if (meta.value) {
                  tr.doc.forEach((node, pos) => {
                    if (node.type.name === 'heading') folded.add(pos);
                  });
                }
              }
            }

            // Remappe les positions après toute édition du document.
            if (tr.docChanged && folded.size) {
              const mapped = new Set<number>();
              folded.forEach((p) => {
                const r = tr.mapping.mapResult(p);
                if (!r.deleted) {
                  // Le node à la position remappée doit toujours être un titre.
                  const node = tr.doc.nodeAt(r.pos);
                  if (node && node.type.name === 'heading') mapped.add(r.pos);
                }
              });
              folded = mapped;
            }

            return { folded };
          },
        },

        props: {
          decorations(state) {
            const pluginState = headingFoldKey.getState(state);
            if (!pluginState) return null;
            const { folded } = pluginState;
            const doc = state.doc;

            // Enfants de premier niveau avec leur position.
            const children: { node: import('@tiptap/pm/model').Node; pos: number }[] = [];
            doc.forEach((node, pos) => children.push({ node, pos }));

            const decos: Decoration[] = [];

            for (let i = 0; i < children.length; i++) {
              const { node, pos } = children[i]!;
              if (node.type.name !== 'heading') continue;
              const level = (node.attrs.level as number) ?? 1;

              const next = children[i + 1];
              const hasSection =
                !!next && !(next.node.type.name === 'heading' && ((next.node.attrs.level as number) ?? 1) <= level);
              if (!hasSection) continue;

              const isFolded = folded.has(pos);

              // Chevron au tout début du contenu du titre.
              decos.push(
                Decoration.widget(pos + 1, (view) => buildChevron(view, pos, isFolded), {
                  side: -1,
                  key: `heading-fold-${pos}-${isFolded ? 1 : 0}`,
                  ignoreSelection: true,
                }),
              );

              if (isFolded) {
                for (let j = i + 1; j < children.length; j++) {
                  const cj = children[j]!;
                  if (cj.node.type.name === 'heading' && ((cj.node.attrs.level as number) ?? 1) <= level) break;
                  decos.push(
                    Decoration.node(cj.pos, cj.pos + cj.node.nodeSize, { class: 'heading-fold-hidden' }),
                  );
                }
              }
            }

            return DecorationSet.create(doc, decos);
          },
        },
      }),
    ];
  },
});
