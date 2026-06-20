import { DOMParser as PMDOMParser } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/react';

/**
 * Conversion markdown → HTML bloc-par-bloc, partagée entre le COLLAGE de texte
 * (DiaryEditor.handlePaste) et le REMPLACEMENT par le correcteur orthographique.
 *
 * L'enjeu commun : préserver l'aération (lignes vides) sans excès. tiptap-markdown
 * re-parse le markdown en mode inline et fusionnerait tout sur une seule ligne ;
 * on construit donc le HTML nous-mêmes puis on l'insère via une slice ProseMirror.
 */

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Construit le HTML d'un texte markdown :
 *  - chaque ligne non vide = un paragraphe (sauts de ligne préservés) ;
 *  - une SUITE de lignes vides = UN seul paragraphe vide (espacement conservé,
 *    mais 2-3 lignes vides ne deviennent pas 2-3 paragraphes vides) ;
 *  - items de liste consécutifs regroupés en UNE liste compacte ;
 *  - blocs ``` ``` et titres `#` conservés ; inline rendu via le parser markdown.
 *
 * Un paragraphe vide est émis avec un espace insécable (U+00A0) car ProseMirror
 * supprime les paragraphes réellement vides au parsing ; le NBSP est ensuite
 * retiré du document par le plugin normalizeNbspParagraphs (PreservingParagraph).
 */
export function buildPasteHtml(editor: Editor, text: string): string {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/[\u2028\u2029]/g, '\n');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parser = (editor.storage as any).markdown?.parser;
  const inline = (s: string): string => {
    if (parser?.parse) {
      try { const out = parser.parse(s, { inline: true }); if (typeof out === 'string') return out; } catch { /* fallback */ }
    }
    return escapeHtml(s);
  };
  const NBSP = '\u00A0';
  const lines = normalized.split('\n');
  const out: string[] = [];
  let listTag: 'ul' | 'ol' | null = null;
  let listItems: string[] = [];
  const flushList = () => {
    if (!listTag) return;
    out.push(`<${listTag}>${listItems.map((it) => `<li>${inline(it)}</li>`).join('')}</${listTag}>`);
    listTag = null; listItems = [];
  };
  let pendingBlank = false;
  const emitBlank = () => {
    if (pendingBlank && out.length > 0) out.push(`<p>${NBSP}</p>`);
    pendingBlank = false;
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const fence = /^\s*```(\w*)\s*$/.exec(line);
    if (fence) {
      flushList(); emitBlank();
      const lang = fence[1] || '';
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i] ?? '')) { code.push(lines[i] ?? ''); i++; }
      i++;
      out.push(`<pre><code${lang ? ` class="language-${lang}"` : ''}>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    const ul = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (ul) { if (listTag && listTag !== 'ul') flushList(); if (!listTag) emitBlank(); listTag = 'ul'; listItems.push(ul[1] ?? ''); i++; continue; }
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ol) { if (listTag && listTag !== 'ol') flushList(); if (!listTag) emitBlank(); listTag = 'ol'; listItems.push(ol[1] ?? ''); i++; continue; }
    flushList();
    if (line.trim() === '') { pendingBlank = true; i++; continue; }
    emitBlank();
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { const lvl = (h[1] ?? '#').length; out.push(`<h${lvl}>${inline(h[2] ?? '')}</h${lvl}>`); i++; continue; }
    out.push(`<p>${inline(line)}</p>`);
    i++;
  }
  flushList();
  return out.join('');
}

/**
 * Périmètre de travail d'une action éditeur (correcteur, IA) :
 *  - sélection vide → toute la note ;
 *  - sélection non vide → les blocs de premier niveau ENTIÈREMENT couverts
 *    (mêmes frontières que « réduire les lignes vides »).
 * `depth === 0` = NodeSelection d'un bloc top-level (positions déjà aux
 * frontières) → on ne déplace pas.
 */
export interface WorkRange { from: number; to: number; isSelection: boolean }

export function getWorkRange(editor: Editor): WorkRange {
  const { selection, doc } = editor.state;
  if (selection.empty) return { from: 0, to: doc.content.size, isSelection: false };
  const $from = doc.resolve(selection.from);
  const $to = doc.resolve(selection.to);
  const from = $from.depth ? $from.before(1) : selection.from;
  const to = $to.depth ? $to.after(1) : selection.to;
  return { from, to, isSelection: true };
}

/** Sérialise en markdown les blocs d'une plage [from, to] (frontières de blocs). */
export function getMarkdownForRange(editor: Editor, from: number, to: number): string {
  const slice = editor.state.doc.slice(from, to);
  const tmp = editor.schema.topNodeType.create(null, slice.content);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serializer = (editor.storage as any).markdown?.serializer;
  return (serializer ? serializer.serialize(tmp) : tmp.textContent).trim();
}

/** Remplace la plage [from, to] par du markdown, en préservant l'aération. */
export function replaceRangeWithMarkdown(editor: Editor, from: number, to: number, md: string): void {
  const html = buildPasteHtml(editor, md);
  const view = editor.view;
  const dom = new window.DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  const doc = PMDOMParser.fromSchema(editor.schema).parse(dom, { preserveWhitespace: 'full' });
  const tr = view.state.tr.replaceWith(from, to, doc.content).scrollIntoView();
  view.dispatch(tr);
}

/**
 * Remplace TOUT le contenu de l'éditeur par du markdown, en préservant
 * l'aération (cf. buildPasteHtml). Une seule transaction → annulable ⌘Z.
 */
export function replaceEditorContentFromMarkdown(editor: Editor, md: string): void {
  replaceRangeWithMarkdown(editor, 0, editor.state.doc.content.size, md);
}
