/**
 * Feuille de style de l'export PDF (impression). Base serif chaude (Lora) sur
 * fond blanc + styles haute-lisibilité pour les blocs custom encadrés, le chat,
 * les médias, les métadonnées, les réactions et les commentaires.
 *
 * Aucune CSS de spoiler : le contenu masqué est révélé à l'export.
 */
export const PRINT_STYLES = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Lora', Georgia, serif;
  font-size: 15px; line-height: 1.7; color: #2a1f14; background: #fff;
  max-width: 720px; margin: 0 auto; padding: 48px 32px;
}
h1 { font-size: 1.9rem; font-weight: 600; margin-bottom: 4px; line-height: 1.2; }
h2 { font-size: 1.25rem; font-weight: 600; margin: 1.4em 0 0.25em; }
h3 { font-size: 1.05rem; font-weight: 600; margin: 1.1em 0 0.2em; }
h4 { font-size: 0.98rem; font-weight: 600; margin: 1em 0 0.2em; }
p.pdf-p { margin: 0.6em 0; }
em { font-style: italic; } strong { font-weight: 600; }
a { color: #4f7a85; text-decoration: underline; }
blockquote { border-left: 3px solid #4f7a85; padding-left: 1em; margin: 1em 0; color: #5e6c70; font-style: italic; }
ul, ol { padding-left: 1.5em; margin: 0.6em 0; } li { margin: 0.25em 0; }
hr { border: none; border-top: 1px solid #e0d4c8; margin: 2em 0; }
code { font-family: 'Courier New', monospace; font-size: 0.88em; background: #f5efe6; padding: 0.1em 0.35em; border-radius: 3px; }
pre.pdf-code { background: #f5efe6; padding: 1em; border-radius: 6px; overflow: auto; margin: 1em 0; font-family: 'Courier New', monospace; font-size: 0.85em; white-space: pre-wrap; }
figure.pdf-figure { margin: 1em 0; } figure.pdf-figure img { max-width: 100%; border-radius: 8px; display: block; }
table.pdf-table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.92em; }
table.pdf-table th, table.pdf-table td { border: 1px solid #e0d4c8; padding: 0.4em 0.6em; text-align: left; }
table.pdf-table th { background: #f5efe6; font-weight: 600; }

/* En-tête */
.pdf-kicker { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 600; margin-bottom: 6px; }
.pdf-datel { font-style: italic; color: #5e6c70; font-size: 0.95rem; margin-top: 2px; }
.pdf-badges { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
.pdf-badge { font-size: 0.68rem; padding: 2px 8px; border-radius: 999px; background: #f0e7da; color: #6b5840; border: 1px solid #e0d4c8; }

/* Métadonnées */
table.pdf-meta { border-collapse: collapse; width: 100%; margin: 1.2em 0; font-size: 0.92rem; }
table.pdf-meta td { padding: 0.35em 0; border-bottom: 1px solid #efe7db; vertical-align: top; }
table.pdf-meta td.k { color: #8a7a64; width: 130px; white-space: nowrap; padding-right: 12px; }
.pdf-section-title { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.12em; color: #8a7a64; font-weight: 600; margin: 1.8em 0 0.6em; border-top: 1px solid #e0d4c8; padding-top: 0.9em; }

/* Branche / Edit */
.pdf-branch, .pdf-edit { margin: 1em 0; border-radius: 8px; padding: 0.6em 0.9em; break-inside: avoid; }
.pdf-branch { border: 1px solid #cdd9db; background: #f3f7f8; }
.pdf-branch-head { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; color: #4f7a85; font-weight: 600; margin-bottom: 0.4em; }
.pdf-edit { border: 1px solid #e7c99a; background: #fdf6ea; }
.pdf-edit-head { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; color: #b8791f; font-weight: 600; margin-bottom: 0.4em; }
.pdf-branch-body > *:first-child, .pdf-edit-body > *:first-child { margin-top: 0; }
.pdf-branch-body > *:last-child, .pdf-edit-body > *:last-child { margin-bottom: 0; }

/* Chat */
.pdf-chat { margin: 1em 0; border: 1px solid #e0d4c8; border-radius: 10px; padding: 0.8em; background: #faf6f0; break-inside: avoid; }
.pdf-chat-head { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; color: #8a7a64; font-weight: 600; margin-bottom: 0.7em; }
.pdf-bubble { max-width: 78%; margin: 0.4em 0; padding: 0.45em 0.7em; border-radius: 12px; break-inside: avoid; }
.pdf-bubble.them { background: #fff; border: 1px solid #e6ddd0; }
.pdf-bubble.me { background: #e7f0f2; border: 1px solid #cfe0e3; margin-left: auto; }
.pdf-chat-meta { font-size: 0.66rem; color: #9a8a72; margin-bottom: 2px; }
.pdf-chat-reply { font-size: 0.8em; border-left: 2px solid #c9bba6; padding-left: 0.5em; color: #7a6c56; margin-bottom: 3px; }
.pdf-chat-text { font-size: 0.95em; white-space: pre-wrap; }
.pdf-chat-img { max-width: 220px; border-radius: 6px; margin-top: 4px; display: block; }
.pdf-chat-reacts { margin-top: 3px; }

/* Placeholder média (audio / vidéo / image manquante) */
.pdf-media-ph { margin: 0.8em 0; padding: 0.6em 0.9em; border: 1px dashed #c9bba6; border-radius: 8px; background: #faf6f0; color: #6b5840; font-size: 0.92em; }

/* Mermaid */
figure.pdf-mermaid { margin: 1.2em 0; text-align: center; break-inside: avoid; }
figure.pdf-mermaid svg { max-width: 100%; height: auto; }

/* Réactions */
.pdf-reactions { display: flex; flex-wrap: wrap; gap: 6px; margin: 0.6em 0; }
.pdf-reaction-pill { font-size: 0.85rem; padding: 2px 9px; border-radius: 999px; background: #f0e7da; border: 1px solid #e0d4c8; }
.pdf-react-names { font-size: 0.78rem; color: #8a7a64; margin-top: 0.2em; }

/* Commentaires */
.pdf-comments { margin-top: 0.5em; }
.pdf-thread { margin: 0.9em 0; padding-left: 0.2em; break-inside: avoid; }
.pdf-thread-anchor { font-size: 0.85em; font-style: italic; color: #7a6c56; border-left: 2px solid #c9bba6; padding-left: 0.6em; margin-bottom: 0.5em; }
.pdf-comment { margin: 0.5em 0; padding: 0.5em 0.7em; border: 1px solid #ece3d6; border-radius: 8px; background: #fbf8f3; break-inside: avoid; }
.pdf-comment.reply { margin-left: 1.4em; background: #fff; }
.pdf-comment-meta { font-size: 0.72rem; color: #8a7a64; margin-bottom: 3px; }
.pdf-comment-role { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 1px 6px; border-radius: 999px; background: #e7f0f2; color: #4f7a85; margin-left: 4px; }
.pdf-comment-quote { font-size: 0.8em; border-left: 2px solid #c9bba6; padding-left: 0.5em; color: #7a6c56; margin-bottom: 4px; }
.pdf-comment-body { font-size: 0.94em; }
.pdf-comment-img { max-width: 240px; border-radius: 6px; margin-top: 4px; display: block; }

/* Export période */
.pdf-cover { text-align: center; padding: 3em 0 2.5em; border-bottom: 1px solid #e0d4c8; margin-bottom: 1.5em; }
.pdf-cover h1 { font-size: 2.1rem; line-height: 1.25; margin: 0.3em 0; }
.pdf-day { margin: 1.6em 0; break-inside: avoid; }
.pdf-day-title { font-size: 1.2rem; font-weight: 600; color: #6b5840; border-top: 2px solid #e0d4c8; padding-top: 0.5em; margin: 0 0 0.5em; }
.pdf-dailylog { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 10px; background: #f7f1e8; border: 1px solid #e6dccb; border-radius: 999px; padding: 5px 14px; margin: 0 0 0.8em; font-size: 0.95rem; }
.pdf-dailylog-label { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.08em; color: #9a8a72; font-weight: 600; }
.pdf-dailylog-item { white-space: nowrap; }
.pdf-entry { margin: 0.8em 0; padding: 0.2em 0 0.8em; border-top: 1px dashed #ece3d6; break-inside: avoid; }
.pdf-entry:first-of-type { border-top: none; }
.pdf-entry-head { font-size: 0.95rem; color: #6b5840; margin-bottom: 0.4em; }
.pdf-entry-type { font-weight: 600; }
.pdf-entry-time { font-family: 'Courier New', monospace; font-size: 0.85em; color: #8a7a64; }

@media print {
  body { padding: 0; }
  @page { margin: 1.8cm; }
}
`;
