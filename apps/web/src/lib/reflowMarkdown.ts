import { Fragment, type Node as PMNode } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/react';

/**
 * Réduit l'espacement vertical d'une note : chaque **suite de N paragraphes
 * vides** (lignes vides) est ramenée à **N − 1**.
 *   - 1 ligne vide → 0 (les paragraphes se collent, séparés par leur marge) ;
 *   - 2 lignes vides → 1 ;
 *   - 3 → 2, etc.
 * Exception : la ligne vide **juste après un titre ou une liste** est conservée
 * (on ne descend jamais en dessous de 1 ligne vide après ces blocs).
 * Le texte des paragraphes n'est PAS modifié ; titres, listes, blocs de code et
 * blocs `:::` sont laissés intacts (et ne comptent pas comme lignes vides).
 *
 * Si du texte est **sélectionné**, seuls les blocs de premier niveau couverts
 * par la sélection sont traités ; sinon toute la note.
 *
 * Appliqué en une transaction unique → annulable avec Ctrl/⌘+Z.
 * Renvoie false si la plage traitée ne contient aucune ligne vide à réduire.
 */
export function applyReflowToEditor(editor: Editor): boolean {
  const { state } = editor.view;
  const { schema, doc } = state;
  const paraType = schema.nodes.paragraph;
  if (!paraType) return false;

  const isEmptyPara = (node: PMNode) =>
    node.type === paraType && node.textContent.trim() === '';

  // Plage traitée : tout le doc, ou les blocs de premier niveau couverts par la
  // sélection. `depth === 0` = NodeSelection d'un bloc top-level (positions déjà
  // aux frontières du bloc — `before(1)` lèverait).
  const { selection } = state;
  const wholeDoc = selection.empty;
  const $from = doc.resolve(selection.from);
  const $to = doc.resolve(selection.to);
  const rangeFrom = wholeDoc ? 0 : ($from.depth ? $from.before(1) : selection.from);
  const rangeTo = wholeDoc ? doc.content.size : ($to.depth ? $to.after(1) : selection.to);

  const targets: PMNode[] = [];
  // Dernier bloc avant la plage — pour appliquer la règle « garde 1 ligne vide
  // après un titre/une liste » même quand la sélection commence par des vides.
  let prevOutside: PMNode | null = null;
  doc.forEach((node, offset) => {
    if (offset + node.nodeSize <= rangeFrom) { prevOutside = node; return; }
    if (offset >= rangeTo) return;
    targets.push(node);
  });

  const blocks: PMNode[] = [];
  let emptyRun = 0;
  let changed = false;

  const flushEmpties = () => {
    if (emptyRun === 0) return;
    const prev = blocks.length > 0 ? blocks[blocks.length - 1] : prevOutside;
    const KEEP_ONE_AFTER = new Set(['heading', 'bulletList', 'orderedList', 'taskList']);
    const keepsSpace = !!prev && KEEP_ONE_AFTER.has(prev.type.name);
    // Après un titre / une liste on garde au moins 1 ligne vide ; sinon N → N − 1.
    const keep = keepsSpace ? Math.max(1, emptyRun - 1) : emptyRun - 1;
    if (keep !== emptyRun) changed = true;
    for (let i = 0; i < keep; i++) blocks.push(paraType.create());
    emptyRun = 0;
  };

  for (const node of targets) {
    if (isEmptyPara(node)) {
      emptyRun++;
    } else {
      flushEmpties();
      blocks.push(node);
    }
  }
  flushEmpties();

  if (!changed) return false;
  if (blocks.length === 0 && targets.length === doc.childCount) {
    blocks.push(paraType.create()); // un doc ne peut pas être vide
  }
  editor.view.dispatch(state.tr.replaceWith(rangeFrom, rangeTo, Fragment.fromArray(blocks)).scrollIntoView());
  return true;
}
