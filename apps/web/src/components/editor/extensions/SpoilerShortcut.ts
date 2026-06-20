import { Extension, type Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';

/**
 * Toggle spoiler sur la sélection courante.
 * - Nœud bloc atom sélectionné (audioNode, videoNode) → toggle attribut `spoiler`.
 * - Sélection texte → wrap/unwrap `||...||`.
 * - Sélection vide → insère `||spoiler||`.
 */
export function toggleSpoiler(editor: Editor): boolean {
  const { selection } = editor.state;

  // Nœud bloc sélectionné (NodeSelection) : audio ou vidéo
  if (selection instanceof NodeSelection) {
    const node = selection.node;
    if (node.type.name === 'audioNode' || node.type.name === 'videoNode') {
      editor.commands.updateAttributes(node.type.name, { spoiler: !node.attrs.spoiler });
      return true;
    }
    // Image bloc : convertir en syntaxe markdown spoiler ||![alt](src)||
    if (node.type.name === 'image') {
      const src = (node.attrs.src as string | null) ?? '';
      const alt = (node.attrs.alt as string | null) ?? '';
      const { from, to } = selection;
      editor.chain().focus().deleteRange({ from, to }).insertContent(`||![${alt}](${src})||`).run();
      return true;
    }
    return false;
  }

  const { from, to, empty } = selection;
  if (empty) {
    const placeholder = 'spoiler';
    editor.chain().focus().insertContent(`||${placeholder}||`).run();
    const newFrom = from + 2;
    const newTo = newFrom + placeholder.length;
    editor.commands.setTextSelection({ from: newFrom, to: newTo });
    return true;
  }

  const selected = editor.state.doc.textBetween(from, to, '\n');
  const unwrap = selected.match(/^\|\|([\s\S]+?)\|\|$/);
  if (unwrap?.[1]) {
    editor.chain().focus().deleteRange({ from, to }).insertContent(unwrap[1]).run();
    return true;
  }
  editor.chain().focus().deleteRange({ from, to }).insertContent(`||${selected}||`).run();
  return true;
}

/**
 * Petit raccourci clavier `⌘⇧S` (Mod-Shift-s) qui wrap la sélection courante
 * avec `||...||` (syntaxe spoiler).
 *
 * Pas de Mark Tiptap dédié — on opère sur le texte brut, le rendu en aval
 * (AnnotatedReader, CommentContent, previewRuns) reconnaît le pattern et
 * applique le flou / click-to-reveal.
 *
 * Comportement :
 *  - Sélection vide → insère `||spoiler||` (l'utilisateur peut sélectionner
 *    et remplacer le mot après).
 *  - Sélection existante non encore enveloppée → wrap par `||...||`.
 *  - Sélection déjà enveloppée (`||x||`) → unwrap (toggle off).
 */
export const SpoilerShortcut = Extension.create({
  name: 'spoilerShortcut',

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-s': () => toggleSpoiler(this.editor),
    };
  },
});
