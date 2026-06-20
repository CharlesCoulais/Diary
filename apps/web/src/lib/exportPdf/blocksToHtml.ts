import {
  escapeHtml, escapeAttr, safeHref, formatEditDate,
  type ContentBlock, type StyledRun,
} from '../../components/AnnotatedReader';
import { parseChatBody } from '../parseChat';
import { stripSpoilers } from '../spoilers';

export interface BlocksToHtmlOpts {
  /** src d'origine → URL à utiliser dans le PDF (dataURL same-origin, ou URL
   *  externe telle quelle). Absent = image non résolue → placeholder. */
  images: Map<string, string>;
  /** code mermaid → SVG inline. Absent/vide = fallback encadré code source. */
  mermaids: Map<string, string>;
  depth?: number;
}

/** URL absolue pour un lien média (audio/vidéo) cliquable dans le PDF. */
export function absUrl(src: string): string {
  if (/^https?:\/\//i.test(src)) return src;
  const origin = typeof location !== 'undefined' ? location.origin : '';
  return origin + (src.startsWith('/') ? src : '/' + src);
}

/** Normalise une image de chat (id nu → /images/:id). */
export function normChatImg(src: string): string {
  return /^(https?:|\/)/i.test(src) ? src : '/images/' + src;
}

/** Rendu inline des runs stylés (gras/italique/police/lien/code). Les spoilers
 *  sont RÉVÉLÉS (rendus en clair, sans flou). */
function runsToHtml(runs?: StyledRun[]): string {
  if (!runs) return '';
  return runs.map((r) => {
    if (r.text === '\n') return '<br/>';
    if (r.code) return `<code>${escapeHtml(r.text)}</code>`;
    let html = escapeHtml(r.text);
    const styles: string[] = [];
    if (r.fontFamily) styles.push(`font-family:${r.fontFamily}`);
    if (r.fontSize) styles.push(`font-size:${r.fontSize}`);
    if (r.bold) styles.push('font-weight:600');
    if (r.italic) styles.push('font-style:italic');
    const deco = [r.strike ? 'line-through' : '', r.underline ? 'underline' : ''].filter(Boolean).join(' ');
    if (deco) styles.push(`text-decoration:${deco}`);
    // escapeAttr : les noms de police peuvent contenir des guillemets
    // (ex: font-family:Kalam, "Apple Color Emoji", …) qui, non échappés,
    // fermeraient l'attribut style="" et casseraient tout le rendu HTML.
    if (styles.length) html = `<span style="${escapeAttr(styles.join(';'))}">${html}</span>`;
    if (r.href) { const h = safeHref(r.href); if (h) html = `<a href="${escapeAttr(h)}">${html}</a>`; }
    return html;
  }).join('');
}

/** Markdown inline minimal et SÛR (échappé) pour chat/commentaires, spoilers révélés. */
export function revealMarkdown(text: string): string {
  let s = escapeHtml(stripSpoilers(text));
  s = s.replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, (_m, t: string, u: string) => {
    const h = safeHref(u);
    return h ? `<a href="${escapeAttr(h)}">${t}</a>` : t;
  });
  s = s
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/~~([^~\n]+)~~/g, '<s>$1</s>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>');
  return s.replace(/\n/g, '<br/>');
}

function imageHtml(src: string, alt: string, width: number | null, opts: BlocksToHtmlOpts): string {
  const resolved = src ? opts.images.get(src) : undefined;
  if (!resolved) {
    return `<div class="pdf-media-ph">🖼 Image indisponible${alt ? ' — ' + escapeHtml(alt) : ''}</div>`;
  }
  const style = width ? ` style="max-width:${width}px"` : '';
  return `<figure class="pdf-figure"><img src="${escapeAttr(resolved)}" alt="${escapeAttr(alt)}"${style}/></figure>`;
}

function mediaPlaceholder(label: string, src: string, filename?: string): string {
  const name = filename || 'fichier';
  return `<div class="pdf-media-ph">${label} — <a href="${escapeAttr(absUrl(src))}">${escapeHtml(name)}</a></div>`;
}

function chatToHtml(b: ContentBlock, opts: BlocksToHtmlOpts): string {
  const msgs = parseChatBody(b.chatRaw ?? '');
  const me = (b.chatMe ?? '').trim().toLowerCase();
  const platform = b.chatPlatform ? escapeHtml(b.chatPlatform) : 'Conversation';
  const title = b.chatTitle ? ' · ' + escapeHtml(b.chatTitle) : '';
  const head = `<div class="pdf-chat-head">💬 ${platform}${title} · ${msgs.length} message${msgs.length > 1 ? 's' : ''}</div>`;
  const bubbles = msgs.map((m) => {
    const isMe = !!me && m.author.trim().toLowerCase() === me;
    const meta = `<div class="pdf-chat-meta">${escapeHtml(m.author)}${m.timestamp ? ' · ' + escapeHtml(m.timestamp) : ''}</div>`;
    const reply = m.replyTo
      ? `<div class="pdf-chat-reply"><strong>${escapeHtml(m.replyTo.author)}</strong> ${escapeHtml(m.replyTo.content)}</div>`
      : '';
    const text = m.content ? `<div class="pdf-chat-text">${revealMarkdown(m.content)}</div>` : '';
    const imgs = m.images.map((src) => {
      const resolved = opts.images.get(normChatImg(src)) ?? opts.images.get(src);
      return resolved ? `<img class="pdf-chat-img" src="${escapeAttr(resolved)}"/>` : '';
    }).join('');
    const reacts = m.reactions.length
      ? `<div class="pdf-chat-reacts">${m.reactions.map((r) => `<span class="pdf-reaction-pill">${escapeHtml(r.emoji)}${r.by.length ? ' ' + r.by.length : ''}</span>`).join(' ')}</div>`
      : '';
    return `<div class="pdf-bubble ${isMe ? 'me' : 'them'}">${meta}${reply}${text}${imgs}${reacts}</div>`;
  }).join('');
  return `<div class="pdf-chat">${head}${bubbles}</div>`;
}

function blockToHtml(b: ContentBlock, opts: BlocksToHtmlOpts, depth: number): string {
  switch (b.type) {
    case 'paragraph': return `<p class="pdf-p">${runsToHtml(b.runs)}</p>`;
    case 'blockquote': return `<blockquote>${runsToHtml(b.runs)}</blockquote>`;
    case 'heading': { const lvl = Math.min(b.headingLevel ?? 2, 4); return `<h${lvl}>${runsToHtml(b.runs)}</h${lvl}>`; }
    case 'hr': return '<hr/>';
    case 'code': return `<pre class="pdf-code"${b.codeLang ? ` data-lang="${escapeAttr(b.codeLang)}"` : ''}>${escapeHtml(b.codeContent ?? '')}</pre>`;
    case 'list': {
      const tag = b.ordered ? 'ol' : 'ul';
      const items = (b.listItems ?? []).map((it) => `<li>${runsToHtml(it)}</li>`).join('');
      return `<${tag}>${items}</${tag}>`;
    }
    case 'table': {
      const head = (b.tableHeaders ?? []).map((c) => `<th>${runsToHtml(c)}</th>`).join('');
      const rows = (b.tableRows ?? []).map((row) => `<tr>${row.map((c) => `<td>${runsToHtml(c)}</td>`).join('')}</tr>`).join('');
      return `<table class="pdf-table">${head ? `<thead><tr>${head}</tr></thead>` : ''}<tbody>${rows}</tbody></table>`;
    }
    case 'branch':
      return `<div class="pdf-branch"><div class="pdf-branch-head">${b.anchorText ? '« ' + escapeHtml(b.anchorText) + ' »' : 'Branche'}</div><div class="pdf-branch-body">${blocksToHtml(b.children ?? [], { ...opts, depth: depth + 1 })}</div></div>`;
    case 'edit':
      return `<div class="pdf-edit"><div class="pdf-edit-head">⏱ Ajout${b.datetime ? ' du ' + escapeHtml(formatEditDate(b.datetime)) : ''}${b.anchorText ? ' · « ' + escapeHtml(b.anchorText) + ' »' : ''}</div><div class="pdf-edit-body">${blocksToHtml(b.children ?? [], { ...opts, depth: depth + 1 })}</div></div>`;
    case 'image': return imageHtml(b.imageSrc ?? '', b.imageAlt ?? '', b.imageWidth ?? null, opts);
    case 'imageGroup': return (b.imageItems ?? []).map((i) => imageHtml(i.src, i.alt ?? '', null, opts)).join('');
    case 'audio': return mediaPlaceholder('🎧 Audio', b.audioSrc ?? '', b.audioFilename);
    case 'audioGroup': return (b.audioItems ?? []).map((a) => mediaPlaceholder('🎧 Audio', a.src, a.filename)).join('');
    case 'video': return mediaPlaceholder('🎬 Vidéo', b.videoSrc ?? '', b.videoFilename);
    case 'mermaid': {
      const svg = opts.mermaids.get(b.mermaidCode ?? '');
      if (svg) return `<figure class="pdf-mermaid">${svg}</figure>`;
      return `<pre class="pdf-code" data-lang="mermaid">${escapeHtml(b.mermaidCode ?? '')}</pre>`;
    }
    case 'chat': return chatToHtml(b, opts);
    default: return '';
  }
}

export function blocksToHtml(blocks: ContentBlock[], opts: BlocksToHtmlOpts): string {
  const depth = opts.depth ?? 0;
  return blocks.map((b) => blockToHtml(b, opts, depth)).join('\n');
}

/** Tous les src d'images à résoudre (contenu + chat), récursif. */
export function collectImageSrcs(blocks: ContentBlock[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.type === 'image' && b.imageSrc) out.push(b.imageSrc);
    else if (b.type === 'imageGroup') for (const i of b.imageItems ?? []) out.push(i.src);
    else if (b.type === 'chat') {
      for (const m of parseChatBody(b.chatRaw ?? '')) for (const src of m.images) out.push(normChatImg(src));
    }
    if (b.children?.length) out.push(...collectImageSrcs(b.children));
  }
  return out;
}

/** Tous les codes mermaid à rendre, récursif. */
export function collectMermaidCodes(blocks: ContentBlock[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.type === 'mermaid' && b.mermaidCode) out.push(b.mermaidCode);
    if (b.children?.length) out.push(...collectMermaidCodes(b.children));
  }
  return out;
}
