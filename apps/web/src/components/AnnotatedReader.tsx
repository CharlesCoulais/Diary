import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { trpc } from '../lib/trpc';
import { commentAuthorName as authorName } from '../lib/commentAuthor';
import { useCommentMutations } from '../lib/useCommentMutations';
import { CommentInput } from './CommentInput';
import { CommentComposer, type CommentSendPayload } from './CommentComposer';
import { CommentContent } from './CommentContent';
import { CommentMedia } from './CommentMedia';
import { TruncatedImage } from './TruncatedImage';
import { BulkAudioPlayer } from './BulkAudioPlayer';
import { ImageGallery } from './ImageGallery';
import { DIARY_FONTS, loadFont, scaledFontSize } from '../lib/fonts';
import { EXCERPT_KINDS, type ExcerptKind } from './editor/excerptKinds';
import { AudioPlayer } from './AudioPlayer';
import { highlightCode } from '../lib/highlightCode';
import { EntryReactions, CommentReactions } from './EmojiReactionBar';
import { EmojiPicker } from './EmojiPicker';
import { ChatDisplay } from './ChatDisplay';
import { MermaidRender } from './MermaidRender';
import { MermaidZoomModal } from './MermaidZoomModal';

const QUICK_REACTIONS = ['❤️', '👍', '😂', '🔥', '👀', '✨'];

interface Author {
  id: string;
  displayName: string | null;
  email: string;
  role: string;
}

interface Comment {
  id: string;
  content: string;
  gifUrl?: string | null;
  image?: { id: string } | null;
  anchorText: string | null;
  parentId: string | null;
  replyToId?: string | null;
  replyTo?: { id: string; content: string; author: Author } | null;
  createdAt: string | Date;
  updatedAt?: string | Date;
  deletedAt: string | Date | null;
  version?: number; // concurrence optimiste : version connue par le client
  author: Author;
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6M9 6V4h6v2" />
    </svg>
  );
}

function ReplyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function formatTime(d: string | Date) {
  const date = new Date(d);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function unescapeMd(text: string): string {
  return text
    .replace(/\\\n/g, '\n')
    .replace(/\\$/gm, '')
    .replace(/\\([[\](){}*_`~#>|!.+=-])/g, '$1');
}

export interface StyledRun { text: string; fontFamily?: string; fontSize?: string; color?: string; bold?: boolean; italic?: boolean; strike?: boolean; underline?: boolean; spoiler?: boolean; code?: boolean; href?: string; }
interface StyleEntry { fontFamily?: string; fontSize?: string; color?: string; bold?: boolean; italic?: boolean; strike?: boolean; underline?: boolean; spoiler?: boolean; code?: boolean; href?: string; }
export interface ContentBlock {
  type: 'paragraph' | 'blockquote' | 'branch' | 'edit' | 'audio' | 'audioGroup' | 'video' | 'code' | 'image' | 'imageGroup' | 'heading' | 'chat' | 'mermaid' | 'table' | 'list' | 'hr' | 'excerpt' | 'taskList';
  runs?: StyledRun[];
  anchorText?: string | null;
  datetime?: string | null;
  // Bloc « extrait / citation » (:::book / :::lyrics / :::movie)
  excerptKind?: ExcerptKind;
  excerptMeta?: Record<string, string>;
  audioSrc?: string;
  audioFilename?: string;
  /** Pour les blocs `audioGroup` (>=2 audios consécutifs regroupés en player playlist). */
  audioItems?: { src: string; filename: string }[];
  videoSrc?: string;
  videoFilename?: string;
  codeContent?: string;
  codeLang?: string;
  children?: ContentBlock[];
  imageSrc?: string;
  imageAlt?: string;
  imageWidth?: number | null;
  spoiler?: boolean;
  /** Pour les blocs `imageGroup` (>=2 images consécutives regroupées en galerie). */
  imageItems?: { src: string; alt?: string }[];
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  // Chat block
  chatPlatform?: string;
  chatTitle?: string;
  chatMe?: string;
  chatAliases?: string;
  chatRaw?: string;
  // Mermaid block
  mermaidCode?: string;
  // List block
  ordered?: boolean;
  listItems?: StyledRun[][];
  // Liste de cases à cocher (- [ ] / - [x])
  taskItems?: { checked: boolean; runs: StyledRun[] }[];
  // Table block
  tableHeaders?: StyledRun[][];
  tableRows?: StyledRun[][][];
}

/**
 * Regroupe les blocs media consécutifs en un seul bloc "group" qui sera
 * rendu via un player/galerie compact :
 *   - `audio` × N (≥ 2)  → `audioGroup` rendu par <BulkAudioPlayer>
 *   - `image` × N (≥ 2)  → `imageGroup` rendu par <ImageGallery>
 *
 * Un media isolé garde son rendu individuel.
 * Récursif pour les `children` (medias à l'intérieur d'une branche / edit-block).
 */
export function groupConsecutiveMedia(blocks: ContentBlock[]): ContentBlock[] {
  const out: ContentBlock[] = [];
  let audioRun: { src: string; filename: string }[] = [];
  let imageRun: { src: string; alt?: string; width?: number | null }[] = [];

  const flushAudio = () => {
    if (audioRun.length >= 2) {
      out.push({ type: 'audioGroup', audioItems: audioRun });
    } else if (audioRun.length === 1) {
      const a = audioRun[0]!;
      out.push({ type: 'audio', audioSrc: a.src, audioFilename: a.filename });
    }
    audioRun = [];
  };
  const flushImages = () => {
    if (imageRun.length >= 2) {
      out.push({ type: 'imageGroup', imageItems: imageRun });
    } else if (imageRun.length === 1) {
      const i = imageRun[0]!;
      out.push({ type: 'image', imageSrc: i.src, imageAlt: i.alt, imageWidth: i.width ?? null });
    }
    imageRun = [];
  };
  const flushAll = () => { flushAudio(); flushImages(); };

  for (const b of blocks) {
    if (b.type === 'audio' && b.audioSrc && !b.spoiler) {
      flushImages();
      audioRun.push({ src: b.audioSrc, filename: b.audioFilename ?? '' });
    } else if (b.type === 'image' && b.imageSrc && !b.spoiler) {
      flushAudio();
      imageRun.push({ src: b.imageSrc, alt: b.imageAlt, width: b.imageWidth });
    } else {
      flushAll();
      if (b.children && b.children.length > 0) {
        out.push({ ...b, children: groupConsecutiveMedia(b.children) });
      } else {
        out.push(b);
      }
    }
  }
  flushAll();
  return out;
}

// Match markdown images ![alt](src) OR HTML <img src="..." alt="..."> (both formats possible from tiptap-markdown with html:true)
const IMG_MD_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;
const IMG_HTML_RE = /<img\s[^>]*src="([^"]*)"[^>]*\/?>/gi;
const IMG_WIDTH_RE = /style="[^"]*width\s*:\s*(\d+)px/i;

type ImagePart = { kind: 'image'; src: string; alt: string; width?: number; spoiler?: boolean };
/** Split a line into text/image parts — handles both ![alt](src) markdown and <img> HTML. */
function splitLineByImages(line: string): Array<{ kind: 'text'; content: string } | ImagePart> {
  type ImageMatch = { index: number; end: number; src: string; alt: string; width?: number; spoiler?: boolean };
  const matches: ImageMatch[] = [];

  IMG_MD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IMG_MD_RE.exec(line)) !== null) {
    matches.push({ index: m.index, end: m.index + m[0].length, src: m[2]!, alt: m[1]! });
  }

  IMG_HTML_RE.lastIndex = 0;
  let h: RegExpExecArray | null;
  while ((h = IMG_HTML_RE.exec(line)) !== null) {
    const tag = h[0];
    const altM = tag.match(/alt="([^"]*)"/i);
    const wM = tag.match(IMG_WIDTH_RE);
    const isSpoiler = /data-spoiler="true"/i.test(tag);
    matches.push({
      index: h.index,
      end: h.index + tag.length,
      src: h[1]!,
      alt: altM?.[1] ?? '',
      width: wM ? parseInt(wM[1]!) : undefined,
      spoiler: isSpoiler || undefined,
    });
  }

  matches.sort((a, b) => a.index - b.index);

  const parts: Array<{ kind: 'text'; content: string } | ImagePart> = [];
  let lastIdx = 0;
  for (const match of matches) {
    if (match.index < lastIdx) continue;
    if (match.index > lastIdx) parts.push({ kind: 'text', content: line.slice(lastIdx, match.index) });
    parts.push({ kind: 'image', src: match.src, alt: match.alt, width: match.width });
    lastIdx = match.end;
  }
  if (lastIdx < line.length) parts.push({ kind: 'text', content: line.slice(lastIdx) });
  return parts;
}

/** Parse **bold** and *italic* markers within a plain text node.
 *
 * Le contenu peut s'étaler sur plusieurs lignes (cas d'un long *…* dans une
 * note ou une branche). Pour éviter de confondre avec les puces de liste
 * markdown (`* item`), on exige que :
 *  - le caractère qui suit l'ouverture ne soit pas un espace ;
 *  - le caractère qui précède la fermeture ne soit pas un espace.
 * Le lazy `[^*_]+?` arrête au premier marqueur valide, donc on supporte aussi
 * plusieurs spans sur la même ligne.
 *
 * Supporté :
 *   ***bold italic***  __***ne fonctionne pas***__  (étoiles uniquement pour triple)
 *   **bold**           __bold__
 *   *italic*           _italic_
 */
function parseBoldItalic(text: string, ff?: string, fs?: string, co?: string, bold?: boolean, italic?: boolean, strike?: boolean, underline?: boolean): StyledRun[] {
  // Ordre IMPORTANT : ***  d'abord, puis ** puis *, et idem côté underscores.
  // Si on faisait l'inverse, `*italic*` matcherait avant `**bold**`.
  const regex = new RegExp([
    '(',
      // ***bold italic*** (triple star, content non-vide)
      '\\*\\*\\*(?!\\s)([\\s\\S]+?)(?<!\\s)\\*\\*\\*',
    '|',
      // **bold**
      '\\*\\*(?!\\s)([\\s\\S]+?)(?<!\\s)\\*\\*',
    '|',
      // *italic*
      '\\*(?!\\s)([^*]+?)(?<!\\s)\\*',
    '|',
      // __bold__
      '__(?!\\s)([\\s\\S]+?)(?<!\\s)__',
    '|',
      // _italic_  (un seul underscore — attention aux mots avec _ comme snake_case :
      // on exige que l'ouverture soit en début ou précédée d'un espace/ponctuation,
      // et la fermeture suivie d'un espace/ponctuation ou fin de chaîne)
      '(?:^|(?<=[\\s.,;:!?(\\[«]))_(?!\\s)([^_]+?)(?<!\\s)_(?=$|[\\s.,;:!?)\\]»])',
    ')',
  ].join(''), 'g');
  const runs: StyledRun[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) runs.push({ text: text.slice(lastIndex, match.index), fontFamily: ff, fontSize: fs, color: co, bold, italic, strike, underline });
    // match[2] = triple-star  | match[3] = double-star  | match[4] = single-star
    // match[5] = double-under | match[6] = single-under
    if (match[2] !== undefined) {
      runs.push({ text: match[2]!, fontFamily: ff, fontSize: fs, color: co, bold: true, italic: true, strike, underline });
    } else if (match[3] !== undefined) {
      runs.push({ text: match[3]!, fontFamily: ff, fontSize: fs, color: co, bold: true, italic, strike, underline });
    } else if (match[4] !== undefined) {
      runs.push({ text: match[4]!, fontFamily: ff, fontSize: fs, color: co, bold, italic: true, strike, underline });
    } else if (match[5] !== undefined) {
      runs.push({ text: match[5]!, fontFamily: ff, fontSize: fs, color: co, bold: true, italic, strike, underline });
    } else if (match[6] !== undefined) {
      runs.push({ text: match[6]!, fontFamily: ff, fontSize: fs, color: co, bold, italic: true, strike, underline });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) runs.push({ text: text.slice(lastIndex), fontFamily: ff, fontSize: fs, color: co, bold, italic, strike, underline });
  return runs.length > 0 ? runs : [{ text, fontFamily: ff, fontSize: fs, color: co, bold, italic, strike, underline }];
}

/**
 * Convertit les marqueurs markdown gras / italique en balises HTML AVANT
 * d'attaquer le DOM. Indispensable quand Tiptap-markdown sérialise du contenu
 * dont les étoiles encadrent un span HTML (cas `*<span style="…">…</span>*`,
 * où les `*` se retrouvent dans des text nodes séparés et ne forment plus
 * une paire détectable par regex sur un seul nœud).
 */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

// N'autorise que http(s), mailto, ancres (#) et liens relatifs (/) ; bloque
// javascript:, data:, etc. Retourne null si le schema est interdit.
export function safeHref(url: string): string | null {
  const u = url.trim();
  if (/^(https?:|mailto:)/i.test(u)) return u;
  if (/^[/#]/.test(u)) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return null;
  return u;
}

// Marques inline (gras/italique/barre/spoiler) appliquees hors code et hors URL.
function inlineMarks(seg: string): string {
  return seg
    .replace(/\|\|([^|\n]+?)\|\|/g, '<span class="spoiler" data-spoiler="1">$1</span>')
    .replace(/~~(?!\s)([\s\S]+?)(?<!\s)~~/g, '<s>$1</s>')
    .replace(/\*\*\*(?!\s)([\s\S]+?)(?<!\s)\*\*\*/g, '<em><strong>$1</strong></em>')
    .replace(/\*\*(?!\s)([\s\S]+?)(?<!\s)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(?!\s)([^*]+?)(?<!\s)\*/g, '<em>$1</em>')
    .replace(/__(?!\s)([\s\S]+?)(?<!\s)__/g, '<strong>$1</strong>')
    .replace(/(?:^|(?<=[\s.,;:!?(\[«]))_(?!\s)([^_]+?)(?<!\s)_(?=$|[\s.,;:!?)\]»])/g, '<em>$1</em>');
}

function preprocessMarkdownToHtml(md: string): string {
  // Decoupe sur les segments code inline ET les liens [texte](url) : les
  // transforms inline ne s'appliquent ni au code ni aux URL. Code -> <code>,
  // lien -> <a> (URL sanitizee). Corrige le code et les liens affiches en brut.
  return md
    .split(/(`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\)|<https?:\/\/[^>\s]+>|https?:\/\/[^\s<>()]+)/g)
    .map((seg) => {
      if (seg.length >= 2 && seg.startsWith('`') && seg.endsWith('`')) {
        return `<code>${escapeHtml(seg.slice(1, -1))}</code>`;
      }
      // Mention `[@Nom](mention:id)` : chip en gras + couleur accent. Reprend les
      // capacités existantes (bold + color) → rendu cohérent dans les deux chemins
      // (runs simples ET fontMap d'annotation), sans nouveau champ de run.
      const mention = seg.match(/^\[@([^\]\n]+)\]\(mention:[\w-]+\)$/);
      if (mention) {
        return `<strong class="mention-chip" style="color:var(--color-accent)">@${escapeHtml(mention[1]!)}</strong>`;
      }
      const link = seg.match(/^\[([^\]\n]+)\]\(([^)\n]+)\)$/);
      if (link) {
        const inner = inlineMarks(link[1]!);
        const href = safeHref(link[2]!);
        if (!href) return inner;
        return `<a href="${escapeAttr(href)}" data-md-link="1">${inner}</a>`;
      }
      // Autolink markdown <https://…> : forme sérialisée par l'éditeur pour une
      // URL nue. Sans ce cas, le `<…>` partirait dans innerHTML comme une balise
      // inconnue et l'URL disparaîtrait en lecture.
      const auto = seg.match(/^<(https?:\/\/[^>\s]+)>$/);
      if (auto) {
        const href = safeHref(auto[1]!);
        return href ? `<a href="${escapeAttr(href)}" data-md-link="1">${escapeHtml(auto[1]!)}</a>` : escapeHtml(auto[1]!);
      }
      // URL nue https://… (texte brut) → lien cliquable.
      if (/^https?:\/\/[^\s<>()]+$/.test(seg)) {
        const href = safeHref(seg);
        return href ? `<a href="${escapeAttr(href)}" data-md-link="1">${escapeHtml(seg)}</a>` : escapeHtml(seg);
      }
      return inlineMarks(seg);
    })
    .join('');
}

/** Parse HTML font/bold/italic spans into text runs using the browser DOM parser. */
function parseHtmlRuns(html: string): StyledRun[] {
  const div = document.createElement('div');
  div.innerHTML = preprocessMarkdownToHtml(html);

  const runs: StyledRun[] = [];

  function walk(node: Node, inheritedFF?: string, inheritedFS?: string, inheritedColor?: string, bold = false, italic = false, strike = false, underline = false, spoiler = false, code = false, href?: string) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent ?? '';
      if (t) {
        if (code) {
          // Code inline : contenu littéral, pas de parsing gras/italique.
          runs.push({ text: t, fontFamily: inheritedFF, fontSize: inheritedFS, color: inheritedColor, code: true, spoiler, href });
        } else {
          const sub = parseBoldItalic(t, inheritedFF, inheritedFS, inheritedColor, bold, italic, strike, underline);
          sub.forEach((r) => { if (spoiler) r.spoiler = true; if (href) r.href = href; });
          runs.push(...sub);
        }
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      // <br> = retour à la ligne dur (Shift+Enter dans l'éditeur). On le
      // sérialise en '\n' dans le run pour que le parent `whitespace-pre-wrap`
      // l'affiche comme un saut de ligne en mode lecture.
      if (el.tagName === 'BR') {
        runs.push({ text: '\n', fontFamily: inheritedFF, fontSize: inheritedFS, color: inheritedColor, bold, italic, strike, underline, spoiler, href });
        return;
      }
      const ff = el.style.fontFamily || inheritedFF;
      const fs = el.style.fontSize || inheritedFS;
      const co = el.style.color || inheritedColor;
      const isBold = bold || el.tagName === 'STRONG' || el.tagName === 'B';
      const isItalic = italic || el.tagName === 'EM' || el.tagName === 'I';
      // <s>, <strike>, <del> = barré ; <u> = souligné
      const isStrike = strike || el.tagName === 'S' || el.tagName === 'STRIKE' || el.tagName === 'DEL';
      const isUnderline = underline || el.tagName === 'U';
      const isCode = code || el.tagName === 'CODE';
      // `<span class="spoiler">` produit par preprocessMarkdownToHtml.
      const isSpoiler = spoiler || (el.tagName === 'SPAN' && el.classList.contains('spoiler'));
      const linkHref = href || (el.tagName === 'A' ? (el.getAttribute('href') || undefined) : undefined);
      node.childNodes.forEach((child) => walk(child, ff, fs, co, isBold, isItalic, isStrike, isUnderline, isSpoiler, isCode, linkHref));
    }
  }

  div.childNodes.forEach((child) => walk(child, undefined, undefined, undefined, false, false, false, false, false, false));
  return runs.filter((r) => r.text.length > 0);
}

/** Parse markdown into paragraph/blockquote/branch blocks (recursive). */
export function parseContentBlocks(md: string): ContentBlock[] {
  const lines = md.split('\n');

  function parseRange(start: number, end: number): ContentBlock[] {
    const result: ContentBlock[] = [];
    let buffer: string[] = [];
    let bufferType: 'paragraph' | 'blockquote' = 'paragraph';

    const flush = () => {
      if (buffer.length === 0) return;
      const runs = parseHtmlRuns(buffer.join('\n'));
      if (runs.length > 0) result.push({ type: bufferType, runs });
      buffer = [];
    };

    let i = start;
    while (i < end) {
      const line = lines[i] ?? '';

      if (/^:::branch/.test(line)) {
        flush();
        const anchorMatch = line.match(/^:::branch\s+"([^"]*)"/);
        const anchorText = anchorMatch ? anchorMatch[1] : null;
        // Fin de conteneur à profondeur — un conteneur imbriqué (branch/edit/chat/
        // mermaid) ouvre un niveau, un `:::` seul le ferme ; on se ferme au `:::`
        // qui ramène à 0 (sinon le `:::` d'un diagramme imbriqué couperait trop tôt).
        let k = i + 1;
        let depth = 1;
        for (; k < end; k++) {
          const t = (lines[k] ?? '').trim();
          if (/^:::(?:branch|edit|chat|mermaid|book|lyrics|movie)\b/.test(t)) depth++;
          else if (t === ':::') { depth--; if (depth === 0) break; }
        }
        const children = parseRange(i + 1, k);
        result.push({ type: 'branch', anchorText, children });
        i = k + 1;
        bufferType = 'paragraph';
        continue;
      }

      // Extrait / citation : :::book | :::lyrics | :::movie {json des métadonnées}
      {
        const ex = line.match(/^:::(book|lyrics|movie)\b/);
        if (ex) {
          flush();
          const kind = ex[1] as ExcerptKind;
          let meta: Record<string, string> = {};
          const rest = line.slice(ex[0].length).trim();
          if (rest) { try { meta = JSON.parse(rest); } catch { /* métadonnées ignorées si invalides */ } }
          let k = i + 1;
          let depth = 1;
          for (; k < end; k++) {
            const t = (lines[k] ?? '').trim();
            if (/^:::(?:branch|edit|chat|mermaid|book|lyrics|movie)\b/.test(t)) depth++;
            else if (t === ':::') { depth--; if (depth === 0) break; }
          }
          const children = parseRange(i + 1, k);
          result.push({ type: 'excerpt', excerptKind: kind, excerptMeta: meta, children });
          i = k + 1;
          bufferType = 'paragraph';
          continue;
        }
      }

      // Spoiler image : ||:::img "src" "alt" [width] [souvenir]||
      if (/^\|\|:::img\s+"/.test(line)) {
        flush();
        const m = line.match(/^\|\|:::img\s+"([^"]*)"\s+"([^"]*)"((?:\s+\d+)?)((?:\s+souvenir)?)\|\|$/);
        const src = m?.[1] ?? '';
        const alt = m?.[2] ?? '';
        const width = m?.[3]?.trim() ? parseInt(m[3].trim()) : null;
        if (src) result.push({ type: 'image', imageSrc: src, imageAlt: alt, imageWidth: width, spoiler: true });
        i++;
        bufferType = 'paragraph';
        continue;
      }

      // Image redimensionnée : :::img "src" "alt" [width] [souvenir]
      if (/^:::img\s+"/.test(line)) {
        flush();
        const m = line.match(/^:::img\s+"([^"]*)"\s+"([^"]*)"((?:\s+\d+)?)((?:\s+souvenir)?)$/);
        const src = m?.[1] ?? '';
        const alt = m?.[2] ?? '';
        const width = m?.[3]?.trim() ? parseInt(m[3].trim()) : null;
        if (src) result.push({ type: 'image', imageSrc: src, imageAlt: alt, imageWidth: width });
        i++;
        bufferType = 'paragraph';
        continue;
      }

      // Spoiler audio : ||:::audio "src" "name"||
      if (/^\|\|:::audio\s+"/.test(line)) {
        flush();
        const m = line.match(/^\|\|:::audio\s+"([^"]*)"\s+"([^"]*)"\|\|$/);
        const src = m?.[1] ?? '';
        const filename = m?.[2] ?? '';
        if (src) result.push({ type: 'audio', audioSrc: src, audioFilename: filename, spoiler: true });
        i++;
        bufferType = 'paragraph';
        continue;
      }

      if (/^:::audio\s+"/.test(line)) {
        flush();
        const m = line.match(/^:::audio\s+"([^"]*)"\s+"([^"]*)"/);
        const src = m?.[1] ?? '';
        const filename = m?.[2] ?? '';
        if (src) result.push({ type: 'audio', audioSrc: src, audioFilename: filename });
        i++;
        bufferType = 'paragraph';
        continue;
      }

      // Spoiler vidéo : ||:::video "src" "name" [souvenir]||
      if (/^\|\|:::video\s+"/.test(line)) {
        flush();
        const m = line.match(/^\|\|:::video\s+"([^"]*)"\s+"([^"]*)"((?:\s+souvenir)?)\|\|$/);
        const src = m?.[1] ?? '';
        const filename = m?.[2] ?? '';
        if (src) result.push({ type: 'video', videoSrc: src, videoFilename: filename, spoiler: true });
        i++;
        bufferType = 'paragraph';
        continue;
      }

      if (/^:::video\s+"/.test(line)) {
        flush();
        const m = line.match(/^:::video\s+"([^"]*)"\s+"([^"]*)"((?:\s+souvenir)?)/);
        const src = m?.[1] ?? '';
        const filename = m?.[2] ?? '';
        if (src) result.push({ type: 'video', videoSrc: src, videoFilename: filename });
        i++;
        bufferType = 'paragraph';
        continue;
      }

      // Legacy HTML format (notes saved before the :::audio migration)
      if (/data-type="audio-node"/.test(line)) {
        flush();
        const srcMatch = line.match(/data-src="([^"]*)"/);
        const nameMatch = line.match(/data-filename="([^"]*)"/);
        if (srcMatch) {
          result.push({ type: 'audio', audioSrc: srcMatch[1], audioFilename: nameMatch?.[1] ?? '' });
        }
        i++;
        bufferType = 'paragraph';
        continue;
      }

      if (line.trim() === ':::mermaid') {
        flush();
        let k = i + 1;
        const bodyLines: string[] = [];
        while (k < end && (lines[k] ?? '').trim() !== ':::') {
          bodyLines.push(lines[k] ?? '');
          k++;
        }
        result.push({ type: 'mermaid', mermaidCode: bodyLines.join('\n') });
        i = k + 1;
        bufferType = 'paragraph';
        continue;
      }

      if (/^:::chat/.test(line)) {
        flush();
        const platformMatch = line.match(/platform="([^"]*)"/);
        const titleMatch = line.match(/with="((?:[^"\\]|\\.)*)"/);
        const meMatch = line.match(/me="((?:[^"\\]|\\.)*)"/);
        const aliasesMatch = line.match(/aliases="((?:[^"\\]|\\.)*)"/);
        let k = i + 1;
        const bodyLines: string[] = [];
        while (k < end && (lines[k] ?? '').trim() !== ':::') {
          bodyLines.push(lines[k] ?? '');
          k++;
        }
        result.push({
          type: 'chat',
          chatPlatform: platformMatch ? platformMatch[1] : 'other',
          chatTitle: titleMatch ? titleMatch[1]!.replace(/\\"/g, '"') : '',
          chatMe: meMatch ? meMatch[1]!.replace(/\\"/g, '"') : '',
          chatAliases: aliasesMatch ? aliasesMatch[1]!.replace(/\\"/g, '"') : '',
          chatRaw: bodyLines.join('\n'),
        });
        i = k + 1;
        bufferType = 'paragraph';
        continue;
      }

      if (/^:::edit/.test(line)) {
        flush();
        const dtMatch = line.match(/^:::edit\s+"([^"]*)"/);
        const datetime = dtMatch ? dtMatch[1] : null;
        const anchorMatch = line.match(/^:::edit\s+"[^"]*"\s+"([^"]*)"/);
        const anchorText = anchorMatch ? anchorMatch[1] : null;
        // Fin de conteneur à profondeur — un conteneur imbriqué (branch/edit/chat/
        // mermaid) ouvre un niveau, un `:::` seul le ferme ; on se ferme au `:::`
        // qui ramène à 0 (sinon le `:::` d'un diagramme imbriqué couperait trop tôt).
        let k = i + 1;
        let depth = 1;
        for (; k < end; k++) {
          const t = (lines[k] ?? '').trim();
          if (/^:::(?:branch|edit|chat|mermaid|book|lyrics|movie)\b/.test(t)) depth++;
          else if (t === ':::') { depth--; if (depth === 0) break; }
        }
        const children = parseRange(i + 1, k);
        result.push({ type: 'edit', datetime, anchorText, children });
        i = k + 1;
        bufferType = 'paragraph';
        continue;
      }

      // Fenced code block (``` or ~~~)
      if (/^(```|~~~)/.test(line)) {
        flush();
        const fence = line.match(/^(```|~~~)/)?.[0] ?? '```';
        const codeLang = line.slice(fence.length).trim() || undefined;
        const codeLines: string[] = [];
        let k = i + 1;
        while (k < end && !(lines[k] ?? '').startsWith(fence)) {
          codeLines.push(lines[k] ?? '');
          k++;
        }
        result.push({ type: 'code', codeContent: codeLines.join('\n'), codeLang });
        i = k + 1;
        bufferType = 'paragraph';
        continue;
      }

      // Heading vide (`##` seul, sans texte) — titre vidé dans l'éditeur :
      // on l'ignore au lieu d'afficher les `#` littéralement en lecture.
      if (/^#{1,6}\s*$/.test(line)) {
        flush();
        i++;
        bufferType = 'paragraph';
        continue;
      }
      // Heading: # ## ### etc.
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        flush();
        const level = headingMatch[1]!.length as 1 | 2 | 3 | 4 | 5 | 6;
        const runs = parseHtmlRuns(headingMatch[2]!);
        result.push({ type: 'heading', headingLevel: level, runs });
        i++;
        bufferType = 'paragraph';
        continue;
      }

      // Table GFM : ligne | ... | suivie d'une ligne |---|---| de séparateur
      if (line.trim().startsWith('|')) {
        const nextLine = lines[i + 1] ?? '';
        if (/^\|[\s|:-]+\|$/.test(nextLine.trim())) {
          flush();
          const parseRow = (rowLine: string): StyledRun[][] =>
            rowLine.split('|').slice(1, -1).map((cell) => parseHtmlRuns(cell.trim()));
          const tableHeaders = parseRow(line);
          i += 2; // sauter header + séparateur
          const tableRows: StyledRun[][][] = [];
          while (i < end) {
            const rowLine = lines[i] ?? '';
            if (!rowLine.trim().startsWith('|') || rowLine.trim() === '') break;
            tableRows.push(parseRow(rowLine));
            i++;
          }
          result.push({ type: 'table', tableHeaders, tableRows });
          bufferType = 'paragraph';
          continue;
        }
      }

      // Horizontal rule: ---, ___, *** (3 or more)
      if (/^(-{3,}|_{3,}|\*{3,})\s*$/.test(line)) {
        flush();
        result.push({ type: 'hr' });
        i++;
        bufferType = 'paragraph';
        continue;
      }

      // Liste de cases à cocher : - [ ] / - [x] (doit passer AVANT la liste à
      // puces, car `- [ ]` matche aussi le motif d'une puce).
      const taskItemLine = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/);
      if (taskItemLine) {
        flush();
        const taskItems: { checked: boolean; runs: StyledRun[] }[] = [];
        let k = i;
        while (k < end) {
          const m = (lines[k] ?? '').match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/);
          if (!m) break;
          taskItems.push({ checked: (m[1] ?? ' ') !== ' ', runs: parseHtmlRuns(m[2] ?? '') });
          k++;
        }
        result.push({ type: 'taskList', taskItems });
        i = k;
        bufferType = 'paragraph';
        continue;
      }

      // Liste à puces (-, *, +) ou numérotée (1. / 1)) — regroupe les items
      // consécutifs du même type. (Les marqueurs exigent un espace après, donc
      // `*italic*` ou `---` ne sont pas confondus avec une puce.)
      const ulItem = line.match(/^\s*[-*+]\s+(.*)$/);
      const olItem = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (ulItem || olItem) {
        flush();
        const ordered = !!olItem;
        const listItems: StyledRun[][] = [];
        let k = i;
        while (k < end) {
          const l = lines[k] ?? '';
          const mu = l.match(/^\s*[-*+]\s+(.*)$/);
          const mo = l.match(/^\s*\d+[.)]\s+(.*)$/);
          const m = ordered ? mo : mu;
          if (!m) break; // fin de liste (ligne vide, autre type, etc.)
          listItems.push(parseHtmlRuns(m[1] ?? ''));
          k++;
        }
        result.push({ type: 'list', ordered, listItems });
        i = k;
        bufferType = 'paragraph';
        continue;
      }

      // Blockquote : ligne commençant par "> " (avec ou sans espace), ou juste ">" pour ligne vide.
      // On regroupe toutes les lignes de quote consécutives (y compris les ">" vides) dans un seul block.
      const quoteMatch = line.match(/^>\s?(.*)$/);
      if (quoteMatch) {
        if (bufferType !== 'blockquote') { flush(); bufferType = 'blockquote'; }
        buffer.push(quoteMatch[1] ?? '');
      } else if (line === '') {
        // Vraie ligne vide = séparateur standard de paragraphes markdown.
        flush();
        bufferType = 'paragraph';
      } else if (line.trim() === '') {
        // Ligne contenant uniquement de l'espace blanc (typiquement un seul " ") :
        // c'est la sérialisation d'un paragraphe vide par PreservingParagraph
        // (Tiptap → Markdown → Tiptap). On émet un paragraphe vide explicite
        // pour préserver l'espacement quand l'utilisateur a appuyé Entrée
        // plusieurs fois entre deux blocs.
        flush();
        result.push({ type: 'paragraph', runs: [{ text: ' ' }] });
        bufferType = 'paragraph';
      } else {
        // Spoiler image : ||![alt](src)|| ou ||<img src="..." alt="...">||
        // Détecté en priorité pour ne pas décomposer la ligne via splitLineByImages.
        const spoilerMd = line.match(/^\|\|!\[([^\]]*)\]\(([^)]+)\)\|\|$/);
        const spoilerHtml = !spoilerMd && line.match(/^\|\|<img\s[^>]*src="([^"]*)"[^>]*\/?>\|\|$/i);
        if (spoilerMd || spoilerHtml) {
          flush();
          bufferType = 'paragraph';
          const src = spoilerMd ? spoilerMd[2]! : (spoilerHtml as RegExpMatchArray)[1]!;
          const alt = spoilerMd ? spoilerMd[1]! : (line.match(/alt="([^"]*)"/i)?.[1] ?? '');
          const wM = spoilerHtml ? line.match(IMG_WIDTH_RE) : null;
          const imgWidth = wM ? parseInt(wM[1]!) : null;
          result.push({ type: 'image', imageSrc: src, imageAlt: alt, imageWidth: imgWidth, spoiler: true });
          i++;
          continue;
        }
        // Check for inline image markdown
        const imageParts = splitLineByImages(line);
        if (imageParts.some((p) => p.kind === 'image')) {
          flush();
          bufferType = 'paragraph';
          for (const part of imageParts) {
            if (part.kind === 'image') {
              result.push({ type: 'image', imageSrc: part.src, imageAlt: part.alt, imageWidth: part.width ?? null, spoiler: part.spoiler ?? false });
            } else if (part.content.trim()) {
              const runs = parseHtmlRuns(part.content);
              if (runs.length > 0) result.push({ type: 'paragraph', runs });
            }
          }
        } else {
          if (bufferType !== 'paragraph') { flush(); bufferType = 'paragraph'; }
          buffer.push(line);
        }
      }
      i++;
    }
    flush();
    return result;
  }

  return parseRange(0, lines.length);
}

/** Rendu inline simple d'une liste de runs (gras/italique/barré/code/spoiler).
 *  Utilisé pour les items de liste (hors système d'ancres de commentaires). */
function renderInlineRuns(runs: StyledRun[]): React.ReactNode {
  return runs.map((r, i) => {
    let node: React.ReactNode;
    if (r.code) {
      node = <code className="diary-inline-code">{r.text}</code>;
    } else {
      const style: React.CSSProperties = {};
      if (r.fontFamily) style.fontFamily = r.fontFamily;
      if (r.fontSize) style.fontSize = r.fontSize;
      if (r.color) style.color = r.color;
      if (r.bold) style.fontWeight = 700;
      if (r.italic) style.fontStyle = 'italic';
      if (r.strike || r.underline) {
        style.textDecorationLine = [r.underline && 'underline', r.strike && 'line-through'].filter(Boolean).join(' ');
      }
      if (r.spoiler) node = <span className="spoiler" data-spoiler="1" style={style}>{r.text}</span>;
      else node = Object.keys(style).length > 0 ? <span style={style}>{r.text}</span> : r.text;
    }
    if (r.href) {
      return <a key={i} href={r.href} target="_blank" rel="noreferrer noopener" className="diary-link">{node}</a>;
    }
    return <span key={i}>{node}</span>;
  });
}

/** Build a per-codeunit style map from runs (1 entrée par UTF-16 code unit pour aligner avec String.length / index). */
function buildFontMap(runs: StyledRun[]): Array<StyleEntry> {
  const map: Array<StyleEntry> = [];
  for (const run of runs) {
    for (let i = 0; i < run.text.length; i++) {
      map.push({ fontFamily: run.fontFamily, fontSize: run.fontSize, color: run.color, bold: run.bold, italic: run.italic, strike: run.strike, underline: run.underline, spoiler: run.spoiler, code: run.code, href: run.href });
    }
  }
  return map;
}

/** Group a text slice (from startPos in fontMap) into styled parts.
 *  Important : on regroupe les surrogate pairs (emojis) sinon ils se cassent en 2 caractères orphelins.
 */
function styledParts(text: string, startPos: number, fontMap: Array<StyleEntry>) {
  const parts: Array<{ text: string; fontFamily?: string; fontSize?: string; color?: string; bold?: boolean; italic?: boolean; strike?: boolean; underline?: boolean; spoiler?: boolean; code?: boolean; href?: string }> = [];
  for (let i = 0; i < text.length; i++) {
    const { fontFamily: ff, fontSize: fs, color: co, bold, italic, strike, underline, spoiler, code: isCode, href } = fontMap[startPos + i] ?? {};
    let char = text[i] ?? '';
    // Surrogate pair (emoji 4 octets) : on agrège la low surrogate avec la high
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      char += text[i + 1];
      i++; // skip la low surrogate
    }
    const last = parts[parts.length - 1];
    if (last && last.fontFamily === ff && last.fontSize === fs && last.color === co && last.bold === bold && last.italic === italic && last.strike === strike && last.underline === underline && last.spoiler === spoiler && last.code === isCode && last.href === href) {
      last.text += char;
    } else {
      parts.push({ text: char, fontFamily: ff, fontSize: fs, color: co, bold, italic, strike, underline, spoiler, code: isCode, href });
    }
  }
  return parts;
}

/** Split text into plain/highlighted segments. */
/**
 * Cherche une ancre dans le texte de manière tolérante :
 *  1. Match exact (sensible à la casse) — chemin rapide.
 *  2. Match insensible à la casse.
 *  3. Match insensible à la casse en strippant la ponctuation de fin de
 *     l'ancre (ex: ancre stockée « hello world. » vs texte « hello world »).
 *  4. Match insensible à la casse en strippant ponctuation et espaces autour
 *     de l'ancre.
 * Retourne l'index dans le texte original et la LONGUEUR à surligner (peut
 * être < à anchor.length si l'ancre a été trimée pour matcher).
 */
function findAnchorRange(haystack: string, anchor: string): { idx: number; length: number } | null {
  if (!anchor) return null;
  // 1. Exact
  let idx = haystack.indexOf(anchor);
  if (idx !== -1) return { idx, length: anchor.length };

  const hLower = haystack.toLowerCase();
  const aLower = anchor.toLowerCase();

  // 2. Case-insensitive
  idx = hLower.indexOf(aLower);
  if (idx !== -1) return { idx, length: anchor.length };

  // 3. Strip trailing punctuation from anchor
  const trimEndPunct = aLower.replace(/[\s.,;:!?…—–\-]+$/u, '');
  if (trimEndPunct && trimEndPunct !== aLower) {
    idx = hLower.indexOf(trimEndPunct);
    if (idx !== -1) return { idx, length: trimEndPunct.length };
  }

  // 4. Strip both leading + trailing
  const fullyTrimmed = aLower.replace(/^[\s.,;:!?…—–\-]+|[\s.,;:!?…—–\-]+$/gu, '');
  if (fullyTrimmed && fullyTrimmed !== aLower) {
    idx = hLower.indexOf(fullyTrimmed);
    if (idx !== -1) return { idx, length: fullyTrimmed.length };
  }

  return null;
}

function buildSegments(text: string, anchors: string[]): Array<{ text: string; anchor: string | null }> {
  let segments: Array<{ text: string; anchor: string | null }> = [{ text, anchor: null }];
  for (const anchor of anchors) {
    segments = segments.flatMap((seg) => {
      if (seg.anchor !== null) return [seg];
      const found = findAnchorRange(seg.text, anchor);
      if (!found) return [seg];
      const { idx, length } = found;
      const result: Array<{ text: string; anchor: string | null }> = [];
      if (idx > 0) result.push({ text: seg.text.slice(0, idx), anchor: null });
      // Garde le texte original (avec sa casse) mais associe l'ancre stockée
      // pour que les autres mécanismes (commentaires, branches) la retrouvent.
      result.push({ text: seg.text.slice(idx, idx + length), anchor });
      if (idx + length < seg.text.length)
        result.push({ text: seg.text.slice(idx + length), anchor: null });
      return result;
    });
  }
  return segments;
}

function MiniThread({
  anchor,
  comments,
  replies,
  entryId,
  commentsLocked,
  me,
  onDelete,
  onEdit,
  onAdd,
  fullWidthComposer = false,
}: {
  anchor: string | null;
  comments: Comment[];
  replies: (parentId: string) => Comment[];
  entryId: string;
  commentsLocked: boolean;
  me: { id: string; role: string };
  onDelete: (id: string) => void;
  onEdit: (id: string, content: string, expectedVersion?: number) => void;
  onAdd: (payload: CommentSendPayload, parentId?: string, replyToId?: string) => void;
  fullWidthComposer?: boolean;
}) {
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isOwner = me.role === 'OWNER';


  const roots = comments.filter((c) => !c.parentId && c.anchorText === anchor);

  const allComments = comments.filter((c) => c.anchorText === anchor);

  const handleSend = (payload: CommentSendPayload) => {
    const targetComment = replyTo ? allComments.find(c => c.id === replyTo) : null;
    const parentId = targetComment
      ? (targetComment.parentId ?? targetComment.id)
      : roots[0]?.id;
    // replyToId = le commentaire spécifique ciblé (pour l'affichage de la citation)
    const replyToId = targetComment?.id;
    onAdd(payload, parentId, replyToId);
    setReplyTo(null);
  };

  const replyToComment = replyTo ? allComments.find(c => c.id === replyTo) : null;

  const handleReply = (id: string) => { setReplyTo(id); inputRef.current?.focus(); };

  return (
    <div className={`flex flex-col gap-1.5 ${fullWidthComposer ? 'flex-1 min-h-0' : ''}`}>
      {roots.map((root) => (
        <div key={root.id} className="flex flex-col gap-1">
          <CommentRow
            comment={root}
            currentUserId={me.id}
            isOwner={isOwner}
            onDelete={onDelete}
            onEdit={onEdit}
            onReply={handleReply}
          />
          {replies(root.id).length > 0 && (
            <div className="flex flex-col gap-1">
              {replies(root.id).map((reply) => (
                <CommentRow
                  key={reply.id}
                  comment={reply}
                  currentUserId={me.id}
                  isOwner={isOwner}
                  onDelete={onDelete}
                  onEdit={onEdit}
                  onReply={handleReply}
                />
              ))}
            </div>
          )}
        </div>
      ))}

      {!commentsLocked && (
        <div className={`sticky bottom-0 pt-2 pb-3 bg-bg-elevated border-t border-text-muted/15 mt-2 flex flex-col gap-1.5${fullWidthComposer ? ' -mx-6 px-6 mt-auto' : ''}`}>
          {replyToComment && (
            <div className="flex items-center gap-2 text-[11px] text-text-muted/60 bg-bg-elevated rounded-lg px-3 py-1.5 border border-text-muted/10">
              <span className="flex-1 truncate">
                <span className="font-medium" style={{ color: replyToComment.author?.id === me.id ? 'var(--color-accent)' : 'var(--color-guest)' }}>
                  ↩ {replyToComment.author?.id === me.id ? 'Moi' : authorName(replyToComment.author)}
                </span>
                {replyToComment.content && (
                  <span className="italic text-text-muted/50 ml-1">— {replyToComment.content.slice(0, 60)}</span>
                )}
              </span>
              <button type="button" onClick={() => setReplyTo(null)} className="shrink-0 text-text-muted/55 hover:text-danger transition-colors">✕</button>
            </div>
          )}
          <CommentComposer
            entryId={entryId}
            placeholder="Répondre…"
            textareaRef={inputRef}
            onSend={handleSend}
          />
        </div>
      )}
    </div>
  );
}

function CommentReactionsIfAny({ commentId, currentUserId }: { commentId: string; currentUserId: string }) {
  const { data: reactions = [] } = trpc.reactions.forComment.useQuery({ commentId });
  if (reactions.length === 0) return null;
  return (
    <div className="mt-2 px-1">
      <CommentReactions commentId={commentId} currentUserId={currentUserId} />
    </div>
  );
}

function CommentRow({
  comment,
  currentUserId,
  isOwner,
  onDelete,
  onEdit,
  onReply,
}: {
  comment: Comment;
  currentUserId: string;
  isOwner: boolean;
  onDelete: (id: string) => void;
  onEdit: (id: string, content: string, expectedVersion?: number) => void;
  onReply?: (id: string) => void;
}) {
  const isMine = comment.author?.id === currentUserId;
  const deleted = !!comment.deletedAt;
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [longPressActive, setLongPressActive] = useState(false);
  const [longPickerOpen, setLongPickerOpen] = useState(false);
  const longPickerBtnRef = useRef<HTMLButtonElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchMoved = useRef(false);
  const activatedByTouch = useRef(false);

  const utils = trpc.useUtils();
  const toggleReaction = trpc.reactions.toggleComment.useMutation({
    onSettled: () => utils.reactions.forComment.invalidate({ commentId: comment.id }),
  });

  const closeLongPress = () => { setLongPressActive(false); setLongPickerOpen(false); setConfirmingDelete(false); };

  const startEdit = () => { setEditText(comment.content); setEditing(true); };
  const cancelEdit = () => setEditing(false);
  const saveEdit = () => {
    if (!editText.trim()) return;
    onEdit(comment.id, editText.trim(), comment.version);
    setEditing(false);
  };

  // Long press : révèle les actions sur mobile (touch)
  const handleTouchStart = () => {
    touchMoved.current = false;
    longPressTimer.current = setTimeout(() => {
      if (!touchMoved.current) {
        activatedByTouch.current = true;
        setLongPressActive(true);
      }
    }, 500);
  };
  const handleTouchMove = () => {
    touchMoved.current = true;
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };
  const handleTouchEnd = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  // Clic/tap en dehors pour fermer le menu long press
  useEffect(() => {
    if (!longPressActive) return;
    const dismiss = () => { setLongPressActive(false); setLongPickerOpen(false); setConfirmingDelete(false); };
    // Délai 500ms : laisse la séquence touch (touchend + click synthétique) se terminer
    const timer = setTimeout(() => {
      document.addEventListener('touchstart', dismiss, { once: true, capture: false });
      document.addEventListener('click', dismiss, { once: true, capture: false });
    }, 500);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('touchstart', dismiss, false);
      document.removeEventListener('click', dismiss, false);
    };
  }, [longPressActive]);

  const name = authorName(comment.author as Author | undefined);
  const showActions = !deleted && !editing && (isMine || isOwner || !!onReply);

  return (
    <div
      id={`comment-${comment.id}`}
      className={`group flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onContextMenu={(e) => {
        e.preventDefault();
        // Sur mobile, contextmenu suit le long press touch — on l'ignore pour éviter de fermer aussitôt
        if (activatedByTouch.current) { activatedByTouch.current = false; return; }
        setLongPressActive((v) => !v);
      }}
    >
      {/* Name + time — au-dessus de la bulle */}
      <div className={`flex items-baseline gap-2 mb-1 px-1 ${isMine ? 'flex-row-reverse' : ''}`}>
        <span
          className="text-[11px] font-semibold"
          style={{ color: isMine ? 'var(--color-accent)' : 'var(--color-guest)' }}
        >
          {isMine ? 'Moi' : name}
        </span>
        <span className="font-mono text-[11px] text-text-muted/60">
          {formatTime(comment.createdAt)}
          {comment.updatedAt && new Date(comment.updatedAt).getTime() - new Date(comment.createdAt).getTime() > 5000 && (
            <span className="italic ml-1" title="Édité">· modifié</span>
          )}
        </span>
      </div>

      {/* Formulaire d'édition — pleine largeur, hors bulle */}
      {editing && (
        <div className="w-full flex flex-col gap-1.5">
          <CommentInput value={editText} onChange={setEditText} onSubmit={saveEdit} placeholder="Modifier…" size="lg" enableMentions />
          <button type="button" onClick={cancelEdit} className="text-[11px] text-text-muted/50 hover:text-text-muted self-end pr-1">Annuler</button>
        </div>
      )}

      {/* Citation du message auquel on répond */}
      {comment.replyTo && !deleted && !editing && (
        <div className={`max-w-[82%] mb-0.5 flex items-stretch gap-1.5 opacity-70`}>
          <div className="w-0.5 rounded-full shrink-0" style={{ backgroundColor: comment.replyTo.author.id === currentUserId ? 'var(--color-accent)' : 'var(--color-guest)' }} />
          <div className="min-w-0 px-2 py-1 rounded-lg bg-text-muted/8 border border-text-muted/10">
            <p className="text-[11px] font-semibold mb-0.5" style={{ color: comment.replyTo.author.id === currentUserId ? 'var(--color-accent)' : 'var(--color-guest)' }}>
              {comment.replyTo.author.id === currentUserId ? 'Moi' : (comment.replyTo.author.displayName || comment.replyTo.author.email.split('@')[0])}
            </p>
            <p className="text-[11px] text-text-muted/70 truncate">{comment.replyTo.content.slice(0, 80)}</p>
          </div>
        </div>
      )}

      {/* Bulle */}
      {!editing && <div
        className={`max-w-[82%] rounded-xl px-3 pt-2.5 ${showActions ? 'pb-1.5' : 'pb-2.5'} ${
          isMine ? '' : 'bg-bg-elevated border border-text-muted/15'
        } ${deleted ? 'opacity-40' : ''}`}
        style={isMine ? { backgroundColor: 'var(--color-me-bubble)' } : undefined}
      >
        {deleted ? (
          <p className="text-[13px] text-text-muted/55 italic">Message supprimé</p>
        ) : (
          <>
            {comment.content && (
              <p className="text-[13px] leading-relaxed text-text-primary">
                <CommentContent content={comment.content} />
              </p>
            )}
            <CommentMedia image={comment.image} gifUrl={comment.gifUrl} />
          </>
        )}

        {/* Actions desktop — hover uniquement, masquées sur touch */}
        {showActions && !longPressActive && (
          <div className={`hidden [@media(hover:hover)]:flex items-center gap-0.5 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity ${isMine ? 'justify-start' : 'justify-end'}`}>
            {confirmingDelete ? (
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="text-text-muted/55">Supprimer ?</span>
                <button type="button" onClick={() => onDelete(comment.id)} className="text-danger font-semibold hover:underline">Oui</button>
                <button type="button" onClick={() => setConfirmingDelete(false)} className="text-text-muted/50 hover:text-text-muted">Non</button>
              </div>
            ) : (
              <>
                {onReply && !isMine && (
                  <button type="button" onClick={() => onReply(comment.id)} title="Répondre" aria-label="Répondre"
                    className="p-1 rounded-md text-text-muted/55 hover:text-accent hover:bg-accent/10 transition-colors">
                    <ReplyIcon />
                  </button>
                )}
                {isMine && (
                  <button type="button" onClick={startEdit} title="Modifier" aria-label="Modifier"
                    className="p-1 rounded-md text-text-muted/55 hover:text-accent hover:bg-accent/10 transition-colors">
                    <PencilIcon />
                  </button>
                )}
                {(isMine || isOwner) && (
                  <button type="button" onClick={() => setConfirmingDelete(true)} title="Supprimer" aria-label="Supprimer"
                    className="p-1 rounded-md text-text-muted/55 hover:text-danger hover:bg-danger/10 transition-colors">
                    <TrashIcon />
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>}

      {/* Réactions emoji existantes — seulement si au moins une réaction */}
      {/* Barre contextuelle long press — réactions rapides + actions */}
      {longPressActive && !deleted && !editing && (
        <div
          className="relative flex items-center gap-1 mt-1.5 bg-bg-elevated border border-text-muted/15 rounded-2xl px-2 py-1.5 shadow-soft w-fit"
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => { toggleReaction.mutate({ commentId: comment.id, emoji }); closeLongPress(); }}
              className="text-xl leading-none hover:scale-125 active:scale-110 transition-transform px-0.5"
            >
              {emoji}
            </button>
          ))}
          <div className="relative">
            <button
              ref={longPickerBtnRef}
              type="button"
              onClick={() => setLongPickerOpen((v) => !v)}
              className="w-6 h-6 flex items-center justify-center rounded-full border border-dashed border-text-muted/30 text-text-muted/50 hover:border-accent/60 hover:text-accent text-sm transition-colors"
            >
              +
            </button>
            {longPickerOpen && (
              <EmojiPicker
                triggerRef={longPickerBtnRef}
                onSelect={(emoji) => { toggleReaction.mutate({ commentId: comment.id, emoji }); closeLongPress(); }}
                onClose={() => setLongPickerOpen(false)}
              />
            )}
          </div>
          {showActions && <div className="w-px h-4 bg-text-muted/20 mx-0.5 shrink-0" />}
          {showActions && (
            confirmingDelete ? (
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="text-text-muted/50">Supprimer ?</span>
                <button type="button" onClick={() => { onDelete(comment.id); closeLongPress(); }} className="text-danger font-semibold">Oui</button>
                <button type="button" onClick={() => setConfirmingDelete(false)} className="text-text-muted/50">Non</button>
              </div>
            ) : (
              <>
                {onReply && !isMine && (
                  <button type="button" onClick={() => { onReply(comment.id); closeLongPress(); }} title="Répondre" aria-label="Répondre"
                    className="p-1 rounded-md text-text-muted/50 hover:text-accent transition-colors">
                    <ReplyIcon />
                  </button>
                )}
                {isMine && (
                  <button type="button" onClick={() => { startEdit(); closeLongPress(); }} title="Modifier" aria-label="Modifier"
                    className="p-1 rounded-md text-text-muted/50 hover:text-accent transition-colors">
                    <PencilIcon />
                  </button>
                )}
                {(isMine || isOwner) && (
                  <button type="button" onClick={() => setConfirmingDelete(true)} title="Supprimer" aria-label="Supprimer"
                    className="p-1 rounded-md text-text-muted/50 hover:text-danger transition-colors">
                    <TrashIcon />
                  </button>
                )}
              </>
            )
          )}
        </div>
      )}

      {!deleted && (
        <CommentReactionsIfAny commentId={comment.id} currentUserId={currentUserId} />
      )}
    </div>
  );
}

export function formatEditDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function EditReadBlock({ datetime, anchorText, children }: { datetime: string | null; anchorText?: string | null; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const expand = () => setOpen(true);
    const collapse = () => setOpen(false);
    window.addEventListener('blocks:expandAll', expand);
    window.addEventListener('blocks:collapseAll', collapse);
    return () => {
      window.removeEventListener('blocks:expandAll', expand);
      window.removeEventListener('blocks:collapseAll', collapse);
    };
  }, []);

  return (
    <div className="my-3 rounded-xl overflow-hidden" style={{ border: '1px solid color-mix(in srgb, #d97706 30%, transparent)', background: 'color-mix(in srgb, #d97706 6%, var(--color-bg-primary, #fff))' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 flex-wrap text-left"
        style={{ borderBottom: open ? '1px solid color-mix(in srgb, #d97706 20%, transparent)' : undefined, background: 'color-mix(in srgb, #d97706 8%, var(--color-bg-primary, #fff))' }}
      >
        <span className="text-[11px] shrink-0" style={{ color: 'color-mix(in srgb, #d97706 60%, transparent)' }}>{open ? '▼' : '▶'}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.8 }}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span className="text-xs italic" style={{ color: 'color-mix(in srgb, #d97706 80%, currentColor)', fontFamily: 'system-ui, sans-serif' }}>
          Ajout du {datetime ? formatEditDate(datetime) : '…'}
        </span>
        {anchorText && (
          <span className="text-xs italic text-text-muted/60 truncate" style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '18ch' }}>
            «&nbsp;{anchorText}&nbsp;»
          </span>
        )}
      </button>
      {open && (
        <div className="px-3 pt-1 pb-2">
          {children}
        </div>
      )}
    </div>
  );
}

function BranchReadBlock({ anchorText, children }: { anchorText: string | null; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const expand = () => setOpen(true);
    const collapse = () => setOpen(false);
    window.addEventListener('blocks:expandAll', expand);
    window.addEventListener('blocks:collapseAll', collapse);
    return () => {
      window.removeEventListener('blocks:expandAll', expand);
      window.removeEventListener('blocks:collapseAll', collapse);
    };
  }, []);

  return (
    <div className="my-2 rounded-xl border border-text-muted/15 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left bg-bg-primary hover:bg-text-muted/5 transition-colors"
      >
        <span className="text-text-muted/45 text-[11px] shrink-0">{open ? '▼' : '▶'}</span>
        {anchorText ? (
          <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted/60 truncate flex-1">« {anchorText} »</span>
        ) : (
          <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted/55 flex-1">Branche</span>
        )}
      </button>
      {open && (
        <div className="px-3 pt-1 pb-2 bg-bg-elevated border-t border-text-muted/10">
          {children}
        </div>
      )}
    </div>
  );
}

/** Extrait / citation (:::book / :::lyrics / :::movie) en lecture — repliable, ouvert par défaut. */
function ExcerptReadBlock({ kind, meta, children }: { kind: ExcerptKind; meta: Record<string, string>; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const expand = () => setOpen(true);
    const collapse = () => setOpen(false);
    window.addEventListener('blocks:expandAll', expand);
    window.addEventListener('blocks:collapseAll', collapse);
    return () => {
      window.removeEventListener('blocks:expandAll', expand);
      window.removeEventListener('blocks:collapseAll', collapse);
    };
  }, []);

  const cfg = EXCERPT_KINDS[kind] ?? EXCERPT_KINDS.book;
  const hasMeta = cfg.fields.some((f) => meta[f.key]);
  const { title, byline, refs } = cfg.summarize(meta);

  return (
    <div
      className="my-3 rounded-xl overflow-hidden border"
      style={{
        ['--excerpt-color' as string]: cfg.colorVar,
        borderColor: 'color-mix(in srgb, var(--excerpt-color) 30%, transparent)',
        background: 'color-mix(in srgb, var(--excerpt-color) 5%, var(--color-bg-primary, #fff))',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        style={{ background: 'color-mix(in srgb, var(--excerpt-color) 8%, transparent)' }}
      >
        <span className="text-[11px] shrink-0" style={{ color: 'color-mix(in srgb, var(--excerpt-color) 60%, currentColor)' }}>{open ? '▼' : '▶'}</span>
        <span className="shrink-0 inline-flex" style={{ color: 'var(--excerpt-color)', opacity: 0.85 }}>{cfg.icon}</span>
        <span className="text-sm min-w-0 flex-1" style={{ fontFamily: 'system-ui, sans-serif' }}>
          {hasMeta ? (
            <>
              <span className="font-semibold text-text-primary">{title}</span>
              {byline && <span className="text-text-muted/80"> — {byline}</span>}
              {refs.length > 0 && <span className="text-text-muted/60"> · {refs.join(' · ')}</span>}
            </>
          ) : (
            <span className="text-text-muted/70 italic">{cfg.label}</span>
          )}
        </span>
      </button>
      {open && (
        <blockquote
          className="px-4 py-3"
          style={{ borderLeft: '3px solid color-mix(in srgb, var(--excerpt-color) 45%, transparent)', margin: 0 }}
        >
          {children}
        </blockquote>
      )}
    </div>
  );
}

/** Sommaire cliquable, généré depuis les titres de la note. Replié/déplié. */
function TableOfContents({ headings }: { headings: { id: string; level: number; text: string }[] }) {
  const [open, setOpen] = useState(true);
  const minLevel = Math.min(...headings.map((h) => h.level));

  const goto = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav className="mb-4 rounded-xl border border-text-muted/15 bg-bg-primary/40 overflow-hidden not-prose" aria-label="Sommaire">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-text-muted/5 transition-colors"
      >
        <span className="text-text-muted/45 text-[11px]">{open ? '▼' : '▶'}</span>
        <span className="font-mono text-[11px] uppercase tracking-widest text-text-muted/60">Sommaire</span>
        <span className="font-mono text-[11px] text-text-muted/55 ml-auto">{headings.length}</span>
      </button>
      {open && (
        <ul className="px-1.5 pb-2 pt-0.5 max-h-[40vh] overflow-y-auto scrollbar-soft">
          {headings.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => goto(h.id)}
                className="block w-full text-left text-[13px] text-text-muted hover:text-accent transition-colors py-1 truncate rounded hover:bg-text-muted/5"
                style={{ paddingLeft: `${(h.level - minLevel) * 0.9 + 0.5}rem`, paddingRight: '0.5rem' }}
                title={h.text}
              >
                {h.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

/** Diagramme Mermaid en lecture — repliable, replié par défaut (comme les autres blocs). */
function MermaidReadBlock({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    const expand = () => setOpen(true);
    const collapse = () => setOpen(false);
    window.addEventListener('blocks:expandAll', expand);
    window.addEventListener('blocks:collapseAll', collapse);
    return () => {
      window.removeEventListener('blocks:expandAll', expand);
      window.removeEventListener('blocks:collapseAll', collapse);
    };
  }, []);

  return (
    <div className="mermaid-block mermaid-block--read my-2">
      <div className="mermaid-block-bar flex items-center">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mermaid-block-toggle flex-1 text-left"
        >
          <span className="text-text-muted/45 text-[11px]">{open ? '▼' : '▶'}</span>
          <span className="mermaid-block-label">Diagramme</span>
        </button>
        {open && (
          <button
            type="button"
            onClick={() => setZoom(true)}
            className="mermaid-block-btn shrink-0"
            aria-label="Agrandir le diagramme"
            title="Agrandir / zoomer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          </button>
        )}
      </div>
      {open && (
        <button
          type="button"
          onClick={() => setZoom(true)}
          className="block w-full cursor-zoom-in"
          aria-label="Agrandir le diagramme"
        >
          <MermaidRender code={code} />
        </button>
      )}
      {zoom && <MermaidZoomModal code={code} onClose={() => setZoom(false)} />}
    </div>
  );
}

// Indice « sélectionner pour commenter » (CONF-06) — montré une seule fois au
// confident (l'autrice connaît déjà le geste), persisté globalement.
const SELECT_HINT_KEY = 'conf06-select-to-comment-hint';

export function AnnotatedReader({
  entryId,
  contentMd,
  commentsLocked,
  focusedCommentId,
  defaultOpenAnchor,
  focusGeneralComments = false,
  fontSize,
  fontFamily,
  fontKey,
  beforeComments,
  className,
  fullWidthComposer = false,
}: {
  entryId: string;
  contentMd: string;
  commentsLocked: boolean;
  focusedCommentId?: string;
  defaultOpenAnchor?: string | 'general' | null;
  /** Ouvre et scrolle directement sur la section « Commentaires » (clic 💬 sur la carte). */
  focusGeneralComments?: boolean;
  fontSize?: string | null;
  fontFamily?: string | null;
  fontKey?: string | null;
  beforeComments?: React.ReactNode;
  className?: string;
  fullWidthComposer?: boolean;
}) {
  const { data: me } = trpc.auth.me.useQuery();
  const { data: rawComments = [] } = trpc.comments.list.useQuery({ entryId });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const comments = rawComments as any[] as Comment[];

  // Surface principale (texte lisible) → tient le compteur local à jour (owner side).
  const { addComment, editComment, deleteComment } = useCommentMutations(entryId, { syncLocalCount: true });

  // Indice de découvrabilité « sélectionner pour commenter » (CONF-06).
  const [selectHintDismissed, setSelectHintDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem(SELECT_HINT_KEY) === '1'; } catch { return true; }
  });
  const dismissSelectHint = useCallback(() => {
    setSelectHintDismissed(true);
    try { localStorage.setItem(SELECT_HINT_KEY, '1'); } catch { /* stockage indisponible */ }
  }, []);

  // Fils de commentaires INDÉPENDANTS : chaque ancre (ou 'general') a son propre
  // état ouvert/fermé. Ouvrir/fermer un fil n'affecte plus les autres (avant, un
  // seul `openAnchor` → ouvrir/fermer un fil rabattait tous les autres).
  const [openAnchors, setOpenAnchors] = useState<Set<string>>(
    () => new Set(defaultOpenAnchor ? [defaultOpenAnchor] : []),
  );
  const isAnchorOpen = (a: string | null) => a != null && openAnchors.has(a);
  const toggleAnchor = (a: string | null) => {
    if (a == null) return;
    setOpenAnchors((prev) => {
      const next = new Set(prev);
      if (next.has(a)) next.delete(a); else next.add(a);
      return next;
    });
  };
  const openAnchorFn = (a: string | null) => {
    if (a == null) return;
    setOpenAnchors((prev) => (prev.has(a) ? prev : new Set(prev).add(a)));
  };
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const [panelVisible, setPanelVisible] = useState(false);
  const [selectionRect, setSelectionRect] = useState<{ top: number; bottom: number; left: number; isTouch: boolean } | null>(null);
  const [annotationCollapsed, setAnnotationCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const annotationInputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const commentButtonRef = useRef<HTMLDivElement>(null);

  // Clic sur la bulle 💬 d'une carte : ouvre la section générale et la scrolle
  // en vue (le DOM de la modale peut mettre un instant à se poser).
  const generalCommentsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusGeneralComments) return;
    openAnchorFn('general');
    const timer = setTimeout(() => {
      generalCommentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
    return () => clearTimeout(timer);
  }, [focusGeneralComments]);

  const scrolledToCommentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusedCommentId || comments.length === 0) return;
    if (scrolledToCommentRef.current === focusedCommentId) return;
    const target = comments.find((c) => c.id === focusedCommentId);
    if (!target) return;
    scrolledToCommentRef.current = focusedCommentId;
    const root = target.parentId ? comments.find((c) => c.id === target.parentId) : target;
    if (!root) return;
    openAnchorFn(root.anchorText ?? 'general');
    // Le DOM peut ne pas être prêt tout de suite (modale qui s'anime, fil qui
    // se déplie, images en cours de chargement) → on réessaie jusqu'à ~2,5 s.
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const el = document.getElementById(`comment-${focusedCommentId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (++tries < 20) timer = setTimeout(tick, 120);
    };
    timer = setTimeout(tick, 120);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedCommentId, comments.length]);

  if (!me) return null;

  const repliesOf = (parentId: string) => comments.filter((c) => c.parentId === parentId);

  // Unique anchors (root-level annotated comments only)
  const anchors = [
    ...new Set(
      comments
        .filter((c) => !c.parentId && c.anchorText && !c.deletedAt)
        .map((c) => c.anchorText as string),
    ),
  ];

  const countFor = (anchor: string | null) =>
    comments.filter((c) => !c.parentId && c.anchorText === anchor && !c.deletedAt).length +
    comments.filter((c) => !!c.parentId && !c.deletedAt &&
      comments.some(r => r.id === c.parentId && r.anchorText === anchor)
    ).length;

  const rawContent = unescapeMd(contentMd);
  // Regroupe les medias consécutifs (audio → playlist player, image → galerie)
  // plutôt que d'empiler N cartes individuelles.
  const contentBlocks = groupConsecutiveMedia(parseContentBlocks(rawContent));

  // Load any Google Fonts referenced in the content or base font
  useEffect(() => {
    if (fontKey) loadFont(fontKey);
    for (const block of contentBlocks) {
      for (const run of block.runs ?? []) {
        if (!run.fontFamily) continue;
        const ff = run.fontFamily;
        const match = DIARY_FONTS.find((f) => {
          const first = f.family.replace(/'/g, '').split(',')[0]?.trim();
          return first !== undefined && ff.includes(first);
        });
        if (match) loadFont(match.key);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentMd, fontKey]);

  // Collect anchor texts from branch/edit blocks for inline highlighting
  function collectBranchAnchors(blocks: ContentBlock[]): string[] {
    return blocks.flatMap((b) => {
      const own = (b.type === 'branch' || b.type === 'edit') && b.anchorText ? [b.anchorText] : [];
      const child = b.children ? collectBranchAnchors(b.children) : [];
      return [...own, ...child];
    });
  }
  const branchAnchors = collectBranchAnchors(contentBlocks);

  // segmentAnchors used per-block in rendering
  const commentAnchors = pendingAnchor && !anchors.includes(pendingAnchor)
    ? [pendingAnchor, ...anchors]
    : anchors;
  const segmentAnchors = [...new Set([...commentAnchors, ...branchAnchors])];

  // Text selection handler
  const handleSelectionChange = useCallback((e: Event) => {
    if (commentsLocked) return;
    // Click inside the annotation panel: keep the pending anchor as-is
    if (panelRef.current?.contains(e.target as Node)) return;
    if (commentButtonRef.current?.contains(e.target as Node)) return;
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    if (!text || text.length < 3 || !textRef.current || !containerRef.current) {
      // Ne pas fermer si le panel de commentaire est ouvert — l'utilisateur doit
      // le fermer explicitement (✕) ou valider son commentaire.
      if (panelVisible) return;
      setPendingAnchor(null);
      setSelectionRect(null);
      setPanelVisible(false);
      return;
    }
    const range = sel!.getRangeAt(0);
    // Only allow selection inside the entry text, not UI chrome
    if (!textRef.current.contains(range.commonAncestorContainer)) {
      if (panelVisible) return;
      setPendingAnchor(null);
      setSelectionRect(null);
      setPanelVisible(false);
      return;
    }
    const rect = range.getBoundingClientRect();
    const cRect = containerRef.current.getBoundingClientRect();
    const isTouch = e.type === 'touchend';
    setPendingAnchor(text);
    setPanelVisible(false); // panel opens only on explicit button click
    setSelectionRect({
      top: rect.top - cRect.top,
      bottom: rect.bottom - cRect.top,
      left: rect.left - cRect.left + rect.width / 2,
      isTouch,
    });
  }, [commentsLocked, panelVisible]);

  useEffect(() => {
    document.addEventListener('mouseup', handleSelectionChange);
    document.addEventListener('touchend', handleSelectionChange);
    return () => {
      document.removeEventListener('mouseup', handleSelectionChange);
      document.removeEventListener('touchend', handleSelectionChange);
    };
  }, [handleSelectionChange]);

  useEffect(() => {
    if (pendingAnchor && panelVisible && !annotationCollapsed) {
      const t = setTimeout(() => annotationInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [pendingAnchor, panelVisible, annotationCollapsed]);

  const handleAddAnnotation = (payload: CommentSendPayload) => {
    if (!pendingAnchor) return;
    const anchor = pendingAnchor;
    addComment.mutate(
      {
        entryId,
        content: payload.content || undefined,
        image: payload.image,
        gifUrl: payload.gifUrl,
        anchorText: anchor,
      },
      {
        onSuccess: () => {
          setPendingAnchor(null);
          setSelectionRect(null);
          openAnchorFn(anchor);
          dismissSelectHint(); // le geste est acquis → ne plus jamais montrer l'indice
        },
      },
    );
  };

  const dismissPending = () => {
    setPendingAnchor(null);
    setPanelVisible(false);
    setSelectionRect(null);
  };

  // `topLevel` : seuls les titres de premier niveau (pas ceux imbriqués dans une
  // branche / un ajout) sont repliables — l'état de repli est indexé sur le tableau
  // top-level `contentBlocks`, et les conteneurs imbriqués sont trop étroits pour le
  // chevron en marge.
  const renderBlock = (block: ContentBlock, bi: number, topLevel = true): React.ReactNode => {
    if (block.type === 'branch') {
      return (
        <BranchReadBlock key={bi} anchorText={block.anchorText ?? null}>
          {(block.children ?? []).map((child, ci) => renderBlock(child, ci, false))}
        </BranchReadBlock>
      );
    }

    if (block.type === 'edit') {
      return (
        <EditReadBlock key={bi} datetime={block.datetime ?? null} anchorText={block.anchorText}>
          {(block.children ?? []).map((child, ci) => renderBlock(child, ci, false))}
        </EditReadBlock>
      );
    }

    if (block.type === 'excerpt') {
      return (
        <ExcerptReadBlock key={bi} kind={block.excerptKind ?? 'book'} meta={block.excerptMeta ?? {}}>
          {(block.children ?? []).map((child, ci) => renderBlock(child, ci, false))}
        </ExcerptReadBlock>
      );
    }

    if (block.type === 'heading') {
      const level = block.headingLevel ?? 2;
      const sizeClass = level === 1 ? 'text-2xl' : level === 2 ? 'text-xl' : level === 3 ? 'text-lg' : 'text-base';
      const runs = block.runs ?? [];
      const blockText = runs.map((r) => r.text).join('');
      const blockFontMap = buildFontMap(runs);
      const blockSegments = buildSegments(blockText, segmentAnchors);
      const hBranchSet = new Set(branchAnchors);
      let _hPos = 0;
      const hSegStarts = blockSegments.map((s) => { const p = _hPos; _hPos += s.text.length; return p; });
      const content = blockSegments.map((seg, si) => {
        const parts = styledParts(seg.text, hSegStarts[si] ?? 0, blockFontMap);
        const inner = parts.map((p, j) => {
          let node: React.ReactNode;
          if (p.code) {
            node = <code className="diary-inline-code">{p.text}</code>;
          } else if (p.italic || p.strike || p.underline) {
            // Le titre est déjà en gras ; on applique italique / barré / souligné.
            node = (
              <span style={{
                fontStyle: p.italic ? 'italic' : undefined,
                textDecorationLine: [p.underline && 'underline', p.strike && 'line-through'].filter(Boolean).join(' ') || undefined,
              }}>{p.text}</span>
            );
          } else {
            node = p.text as React.ReactNode;
          }
          if (p.href) return <a key={j} href={p.href} target="_blank" rel="noreferrer noopener" className="diary-link">{node}</a>;
          return <span key={j}>{node}</span>;
        });
        if (seg.anchor && hBranchSet.has(seg.anchor) && !commentAnchors.includes(seg.anchor)) {
          return <span key={si} className="branch-anchor-inline">{inner}</span>;
        }
        if (seg.anchor && commentAnchors.includes(seg.anchor)) {
          return (
            <mark
              key={si}
              onClick={() => {
                if (seg.anchor === pendingAnchor) return;
                toggleAnchor(seg.anchor);
                dismissPending();
              }}
              className={`rounded-sm px-0.5 not-italic font-[inherit] transition-colors ${
                seg.anchor === pendingAnchor
                  ? 'bg-annotation-pending outline outline-1 outline-annotation-ring cursor-default'
                  : `cursor-pointer ${isAnchorOpen(seg.anchor) ? 'bg-annotation-open' : 'bg-annotation hover:bg-annotation-hover'}`
              }`}
            >
              {inner}
              {seg.anchor !== pendingAnchor && countFor(seg.anchor) > 0 && (
                <sup className="select-none ml-0.5 text-[8px] font-semibold text-success not-italic">
                  {countFor(seg.anchor)}
                </sup>
              )}
            </mark>
          );
        }
        return <span key={si}>{inner}</span>;
      });
      const Tag = (`h${level}`) as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      const hFoldable = topLevel && headingHasSection(bi);
      const hCollapsed = topLevel && collapsedHeadings.has(bi);
      return (
        <Tag key={bi} id={`${tocPrefix}-h-${bi}`} className={`${sizeClass} font-semibold text-text-primary mt-6 mb-2 leading-snug scroll-mt-4`}>
          {hFoldable && (
            <button
              type="button"
              onClick={() => toggleHeading(bi)}
              aria-label={hCollapsed ? 'Déplier la section' : 'Replier la section'}
              title={hCollapsed ? 'Déplier' : 'Replier'}
              className="not-prose inline-flex items-center justify-center align-middle mr-1 -ml-0.5 w-[1.1em] h-[1.1em] rounded text-text-muted/55 hover:text-accent hover:bg-text-muted/10 transition-colors select-none"
            >
              <svg
                width="0.7em" height="0.7em" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: hCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s' }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )}
          {content}
          {hCollapsed && <span className="ml-1.5 align-middle text-text-muted/45 text-[0.6em] font-normal select-none">⋯</span>}
        </Tag>
      );
    }

    if (block.type === 'image' && block.imageSrc) {
      if (block.spoiler) {
        return (
          <div
            key={bi}
            className="my-3 spoiler-img"
            data-spoiler="1"
            style={block.imageWidth ? { maxWidth: `${block.imageWidth}px` } : undefined}
          >
            <TruncatedImage src={block.imageSrc} alt={block.imageAlt ?? ''} maxHeightClass="max-h-[70vh]" width={block.imageWidth} />
            <div className="spoiler-img-label"><span className="spoiler-img-badge">🙈 Spoiler — toucher pour révéler</span></div>
          </div>
        );
      }
      return (
        <div key={bi} className="my-3">
          {/* TruncatedImage cap la hauteur à ~70vh ; les images très hautes
              (screenshots de liste, etc.) sont croppées au top avec fade-out
              + tap pour ouvrir en lightbox scrollable lisible. */}
          <TruncatedImage src={block.imageSrc} alt={block.imageAlt ?? ''} caption={block.imageAlt ?? ''} maxHeightClass="max-h-[70vh]" />
        </div>
      );
    }

    if (block.type === 'audio' && block.audioSrc) {
      if (block.spoiler) {
        return (
          <div key={bi} className="my-3 spoiler-media" data-spoiler="1">
            <AudioPlayer src={block.audioSrc} filename={block.audioFilename} />
            <div className="spoiler-media-label">🙉 Spoiler — toucher pour révéler</div>
          </div>
        );
      }
      return (
        <div key={bi} className="my-3">
          <AudioPlayer src={block.audioSrc} filename={block.audioFilename} />
        </div>
      );
    }

    if (block.type === 'audioGroup' && block.audioItems && block.audioItems.length > 0) {
      return <BulkAudioPlayer key={bi} items={block.audioItems} />;
    }

    if (block.type === 'video' && block.videoSrc) {
      if (block.spoiler) {
        return (
          <div key={bi} className="my-3 spoiler-media" data-spoiler="1" onClick={(e) => e.stopPropagation()}>
            <video
              src={block.videoSrc}
              controls
              preload="metadata"
              className="video-node-player"
              title={block.videoFilename}
            />
            <div className="spoiler-media-label">🙈 Spoiler — toucher pour révéler</div>
          </div>
        );
      }
      return (
        <div key={bi} className="my-3" onClick={(e) => e.stopPropagation()}>
          <video
            src={block.videoSrc}
            controls
            preload="metadata"
            className="video-node-player"
            title={block.videoFilename}
          />
        </div>
      );
    }

    if (block.type === 'imageGroup' && block.imageItems && block.imageItems.length > 0) {
      return <ImageGallery key={bi} items={block.imageItems} />;
    }

    if (block.type === 'table') {
      const renderCellRuns = (runs: StyledRun[]) =>
        runs.map((r, ri) => {
          const style: React.CSSProperties = {};
          if (r.fontFamily) style.fontFamily = r.fontFamily;
          if (r.fontSize) style.fontSize = r.fontSize;
          if (r.color) style.color = r.color;
          if (r.bold) style.fontWeight = 700;
          if (r.italic) style.fontStyle = 'italic';
          // Combine line-through (barré) + underline (souligné) si les deux
          // sont actifs — CSS accepte plusieurs valeurs séparées par espace.
          if (r.strike || r.underline) {
            style.textDecorationLine = [r.underline && 'underline', r.strike && 'line-through'].filter(Boolean).join(' ');
          }
          const className = r.spoiler ? 'spoiler' : undefined;
          const dataAttrs = r.spoiler ? { 'data-spoiler': '1' as const } : {};
          if (Object.keys(style).length || className) {
            return <span key={ri} style={style} className={className} {...dataAttrs}>{r.text}</span>;
          }
          return <span key={ri}>{r.text}</span>;
        });
      return (
        <div key={bi} className="my-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {(block.tableHeaders ?? []).map((cell, ci) => (
                  <th key={ci} className="border border-text-muted/20 px-3 py-2 text-left font-semibold text-text-muted text-xs uppercase tracking-wide" style={{ background: 'color-mix(in srgb, var(--color-text-muted) 7%, transparent)' }}>
                    {renderCellRuns(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(block.tableRows ?? []).map((row, ri) => (
                <tr key={ri} style={ri % 2 === 1 ? { background: 'color-mix(in srgb, var(--color-text-muted) 3%, transparent)' } : {}}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="border border-text-muted/20 px-3 py-2 text-text-primary">
                      {renderCellRuns(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (block.type === 'mermaid') {
      return <MermaidReadBlock key={bi} code={block.mermaidCode ?? ''} />;
    }

    if (block.type === 'chat') {
      return (
        <ChatDisplay
          key={bi}
          platform={block.chatPlatform ?? 'other'}
          title={block.chatTitle ?? ''}
          me={block.chatMe ?? ''}
          aliases={block.chatAliases ?? ''}
          raw={block.chatRaw ?? ''}
          defaultCollapsed
        />
      );
    }

    if (block.type === 'code') {
      return (
        <pre key={bi} className="diary-code-block" data-language={block.codeLang ?? undefined}>
          <code>{highlightCode(block.codeContent ?? '', block.codeLang)}</code>
        </pre>
      );
    }

    if (block.type === 'taskList') {
      const items = block.taskItems ?? [];
      return (
        <ul key={bi} className="my-2 pl-1 space-y-1 list-none text-text-secondary leading-relaxed">
          {items.map((it, ii) => (
            <li key={ii} className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={it.checked}
                disabled
                readOnly
                className="mt-1 shrink-0 w-4 h-4"
                style={{ accentColor: 'var(--color-accent)' }}
              />
              <span className={it.checked ? 'text-text-muted line-through' : ''}>{renderInlineRuns(it.runs)}</span>
            </li>
          ))}
        </ul>
      );
    }

    if (block.type === 'list') {
      const items = block.listItems ?? [];
      const ListTag = block.ordered ? 'ol' : 'ul';
      return (
        <ListTag
          key={bi}
          className={`my-2 pl-6 space-y-0.5 text-text-secondary leading-relaxed marker:text-text-muted/60 ${block.ordered ? 'list-decimal' : 'list-disc'}`}
        >
          {items.map((runs, ii) => (
            <li key={ii} className="pl-1">{renderInlineRuns(runs)}</li>
          ))}
        </ListTag>
      );
    }

    if (block.type === 'hr') {
      return <hr key={bi} className="my-4 border-t border-text-muted/20" />;
    }

    const runs = block.runs ?? [];
    const blockText = runs.map((r) => r.text).join('');
    const blockFontMap = buildFontMap(runs);
    const blockSegments = buildSegments(blockText, segmentAnchors);
    let _bPos = 0;
    const bSegStarts = blockSegments.map((s) => { const p = _bPos; _bPos += s.text.length; return p; });

    const branchAnchorSet = new Set(branchAnchors);
    const renderSeg = (seg: { text: string; anchor: string | null }, si: number) => {
      const parts = styledParts(seg.text, bSegStarts[si] ?? 0, blockFontMap);
      const inner = parts.map((p, j) => {
        const hasStyle = p.fontFamily || p.fontSize || p.color || p.bold || p.italic || p.strike || p.underline;
        const textDecoration = (p.strike || p.underline)
          ? [p.underline && 'underline', p.strike && 'line-through'].filter(Boolean).join(' ')
          : undefined;
        let node: React.ReactNode;
        if (p.code) {
          node = <code className="diary-inline-code">{p.text}</code>;
        } else if (p.spoiler) {
          // Spoiler enveloppe le contenu — la classe `.spoiler` gère le flou
          // + click-to-reveal via le handler global (cf. lib/spoilers).
          node = (
            <span className="spoiler" data-spoiler="1" style={hasStyle ? {
              fontFamily: p.fontFamily,
              fontSize: p.fontSize,
              color: p.color,
              fontWeight: p.bold ? 'bold' : undefined,
              fontStyle: p.italic ? 'italic' : undefined,
              textDecorationLine: textDecoration,
            } : undefined}>{p.text}</span>
          );
        } else {
          node = hasStyle ? (
            <span style={{
              fontFamily: p.fontFamily,
              fontSize: p.fontSize,
              color: p.color,
              fontWeight: p.bold ? 'bold' : undefined,
              fontStyle: p.italic ? 'italic' : undefined,
              textDecorationLine: textDecoration,
            }}>{p.text}</span>
          ) : p.text;
        }
        if (p.href) return <a key={j} href={p.href} target="_blank" rel="noreferrer noopener" className="diary-link">{node}</a>;
        return <span key={j}>{node}</span>;
      });

      if (!seg.anchor) return <span key={si}>{inner}</span>;

      // Branch/edit anchor: dashed underline (no comment interaction)
      if (branchAnchorSet.has(seg.anchor) && !commentAnchors.includes(seg.anchor)) {
        return (
          <span key={si} className="branch-anchor-inline">{inner}</span>
        );
      }

      // Comment anchor
      return (
        <mark
          key={si}
          onClick={() => {
            if (seg.anchor === pendingAnchor) return;
            toggleAnchor(seg.anchor);
            dismissPending();
          }}
          className={`rounded-sm px-0.5 not-italic font-[inherit] transition-colors ${
            seg.anchor === pendingAnchor
              ? 'bg-annotation-pending outline outline-1 outline-annotation-ring cursor-default'
              : `cursor-pointer ${isAnchorOpen(seg.anchor) ? 'bg-annotation-open' : 'bg-annotation hover:bg-annotation-hover'}`
          }`}
        >
          {inner}
          {seg.anchor !== pendingAnchor && countFor(seg.anchor) > 0 && (
            <sup className="select-none ml-0.5 text-[8px] font-semibold text-success not-italic">
              {countFor(seg.anchor)}
            </sup>
          )}
        </mark>
      );
    };

    const blockContent = blockSegments.map((seg, si) => renderSeg(seg, si));

    if (block.type === 'blockquote') {
      return (
        <blockquote key={bi} className="border-l-2 border-text-muted/30 pl-3 my-2 text-text-muted/70 italic text-[0.9em] whitespace-pre-wrap">
          {blockContent}
        </blockquote>
      );
    }
    return (
      <p key={bi} className="text-text-secondary leading-relaxed whitespace-pre-wrap mb-3">
        {blockContent}
      </p>
    );
  };

  // ─── Repli des sections par titre (lecture) ───
  // L'état repliable vit en state local (non persisté). Tout déplié à l'ouverture.
  const [collapsedHeadings, setCollapsedHeadings] = useState<Set<number>>(() => new Set());
  // Un titre est repliable s'il a au moins un bloc avant le prochain titre de
  // niveau égal ou supérieur.
  const headingHasSection = (i: number): boolean => {
    const b = contentBlocks[i];
    if (!b || b.type !== 'heading') return false;
    const L = b.headingLevel ?? 2;
    const next = contentBlocks[i + 1];
    return !!next && !(next.type === 'heading' && (next.headingLevel ?? 2) <= L);
  };
  const toggleHeading = (i: number) =>
    setCollapsedHeadings((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  // Indices des blocs masqués : pour chaque titre replié, tout jusqu'au prochain
  // titre de niveau ≤ au sien (gère naturellement l'imbrication).
  const hiddenBlockIndices = (() => {
    const hidden = new Set<number>();
    for (let i = 0; i < contentBlocks.length; i++) {
      const b = contentBlocks[i]!;
      if (b.type === 'heading' && collapsedHeadings.has(i)) {
        const L = b.headingLevel ?? 2;
        for (let j = i + 1; j < contentBlocks.length; j++) {
          const bj = contentBlocks[j]!;
          if (bj.type === 'heading' && (bj.headingLevel ?? 2) <= L) break;
          hidden.add(j);
        }
      }
    }
    return hidden;
  })();
  const foldableHeadings = contentBlocks
    .map((b, i) => (b.type === 'heading' && headingHasSection(i) ? i : -1))
    .filter((i) => i >= 0);

  const hasBlocks = contentBlocks.some(
    (b) => b.type === 'branch' || b.type === 'edit' || b.type === 'chat' || b.type === 'mermaid',
  );
  const hasFoldableHeadings = foldableHeadings.length > 0;

  // Sommaire automatique : généré depuis les titres de la note. Affiché seulement
  // pour les notes assez longues (≥ 3 titres). Les ids sont préfixés par un
  // identifiant unique d'instance (useId) pour éviter les collisions si plusieurs
  // lecteurs sont montés (ex. split desktop).
  const tocPrefix = `toc${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const headings = contentBlocks
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.type === 'heading')
    .map(({ b, i }) => ({
      id: `${tocPrefix}-h-${i}`,
      level: b.headingLevel ?? 2,
      text: (b.runs ?? []).map((r) => r.text).join('').trim(),
    }))
    .filter((h) => h.text.length > 0);
  const showToc = headings.length >= 3;
  // À l'ouverture, tous les blocs repliables sont repliés (cf. leur état initial) :
  // le bouton démarre donc en mode « Tout déplier ».
  const [allCollapsed, setAllCollapsed] = useState(true);
  const toggleAll = () => {
    const next = !allCollapsed;
    setAllCollapsed(next);
    setCollapsedHeadings(next ? new Set(foldableHeadings) : new Set());
    window.dispatchEvent(new CustomEvent(next ? 'blocks:collapseAll' : 'blocks:expandAll'));
  };

  // Bouton dédié aux titres : son libellé suit l'état RÉEL (tous repliés ?).
  const allHeadingsCollapsed = hasFoldableHeadings && foldableHeadings.every((i) => collapsedHeadings.has(i));
  const toggleAllHeadings = () => {
    setCollapsedHeadings(allHeadingsCollapsed ? new Set() : new Set(foldableHeadings));
  };

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      {/* Sommaire automatique (notes longues) */}
      {showToc && <TableOfContents headings={headings} />}

      {/* Boutons replier/déplier — titres (dédié) + blocs riches */}
      {(hasFoldableHeadings || hasBlocks) && (
        <div className="flex justify-end gap-1.5 mb-2 flex-wrap">
          {hasFoldableHeadings && (
            <button
              type="button"
              onClick={toggleAllHeadings}
              className="inline-flex items-center gap-1.5 text-[11px] text-text-muted/60 hover:text-text-muted transition-colors px-2 py-1 rounded-lg hover:bg-text-muted/5"
              title={allHeadingsCollapsed ? 'Déplier toutes les sections' : 'Replier toutes les sections'}
            >
              {allHeadingsCollapsed ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="17 11 12 6 7 11" /><polyline points="17 18 12 13 7 18" />
                </svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="7 13 12 18 17 13" /><polyline points="7 6 12 11 17 6" />
                </svg>
              )}
              {allHeadingsCollapsed ? 'Déplier les titres' : 'Replier les titres'}
            </button>
          )}
          {hasBlocks && (
            <button
              type="button"
              onClick={toggleAll}
              className="inline-flex items-center gap-1.5 text-[11px] text-text-muted/60 hover:text-text-muted transition-colors px-2 py-1 rounded-lg hover:bg-text-muted/5"
            >
              {allCollapsed ? (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="17 11 12 6 7 11" /><polyline points="17 18 12 13 7 18" />
                  </svg>
                  Tout déplier
                </>
              ) : (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="7 13 12 18 17 13" /><polyline points="7 6 12 11 17 6" />
                  </svg>
                  Tout replier
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Indice « sélectionner pour commenter » (CONF-06) — confident, une seule fois */}
      {me?.role === 'GUEST' && !commentsLocked && !selectHintDismissed && contentMd.trim().length > 0 && (
        <div className="flex items-start gap-2 mb-3 px-3 py-2 rounded-xl bg-accent/[0.07] border border-accent/15 text-[12px] text-text-muted leading-snug">
          <span aria-hidden className="mt-px">💬</span>
          <span className="flex-1">
            Astuce : <strong className="font-medium text-text-primary/80">sélectionne un mot ou une phrase</strong> du texte pour la commenter.
          </span>
          <button
            type="button"
            onClick={dismissSelectHint}
            aria-label="Masquer l’astuce"
            className="shrink-0 text-text-muted/50 hover:text-text-muted transition-colors -mr-1 px-1 leading-none"
          >
            ✕
          </button>
        </div>
      )}

      {/* Content with highlights — rendered as markdown blocks */}
      <div ref={textRef} className="select-text cursor-text" style={{ fontSize: fontSize ? scaledFontSize(fontKey, fontSize) : undefined, fontFamily: fontFamily ?? undefined }}>
        {contentBlocks.map((block, bi) => (hiddenBlockIndices.has(bi) ? null : renderBlock(block, bi)))}
      </div>

      {/* Floating "annotate" button — visible on selection, hidden once panel opens */}
      {pendingAnchor && selectionRect && !panelVisible && !commentsLocked && (
        <div
          ref={commentButtonRef}
          className="absolute z-20"
          style={selectionRect.isTouch
            ? { top: selectionRect.bottom + 8, left: selectionRect.left, transform: 'translate(-50%, 0)' }
            : { top: selectionRect.top - 8, left: selectionRect.left, transform: 'translate(-50%, -100%)' }
          }
        >
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              window.getSelection()?.removeAllRanges();
              setPanelVisible(true);
              setAnnotationCollapsed(false);
            }}
            className="bg-accent text-bg-primary text-[11px] font-medium px-2.5 py-1 rounded-full shadow-soft whitespace-nowrap"
          >
            💬 Commenter
          </button>
        </div>
      )}

      {/* Fixed floating annotation panel — only after explicit click on "💬 Commenter" */}
      {pendingAnchor && panelVisible && !commentsLocked && (
        annotationCollapsed ? (
          /* Collapsed state: visible pill in the bottom-right corner */
          <div ref={panelRef} className="fixed bottom-20 right-4 z-40 flex items-center gap-2 bg-accent text-bg-primary text-xs font-medium pl-3 pr-2 py-2 rounded-full shadow-lg max-w-[220px]">
            <span className="truncate flex-1">💬 {pendingAnchor.length > 28 ? pendingAnchor.slice(0, 28) + '…' : pendingAnchor}</span>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setAnnotationCollapsed(false)}
              className="shrink-0 opacity-80 hover:opacity-100 transition-opacity"
              title="Développer"
            >▲</button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={dismissPending}
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            >✕</button>
          </div>
        ) : (
          /* Expanded state: full panel above nav bar */
          <div ref={panelRef} className="fixed bottom-16 left-0 right-0 z-40 px-3 pointer-events-none">
            <div className="max-w-2xl mx-auto pointer-events-auto">
              <div className="bg-bg-elevated border border-accent/25 rounded-2xl shadow-lg overflow-hidden">
                {/* Header */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-text-muted/10">
                  <span className="text-[11px] text-text-muted/60 italic truncate flex-1">
                    « {pendingAnchor.length > 100 ? pendingAnchor.slice(0, 100) + '…' : pendingAnchor} »
                  </span>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setAnnotationCollapsed(true)}
                    className="shrink-0 text-text-muted/50 hover:text-text-muted transition-colors px-1.5 py-0.5 rounded text-xs"
                    title="Réduire"
                  >▽</button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={dismissPending}
                    className="shrink-0 text-text-muted/50 hover:text-danger transition-colors text-xs"
                  >✕</button>
                </div>
                {/* Body */}
                <div className="px-4 py-3 flex flex-col gap-2">
                  {addComment.isError && (
                    <p className="text-xs text-danger/80">Erreur lors de l'envoi — réessaie.</p>
                  )}
                  <CommentComposer
                    entryId={entryId}
                    placeholder="Ton commentaire…"
                    disabled={addComment.isPending}
                    textareaRef={annotationInputRef}
                    size="lg"
                    onSend={handleAddAnnotation}
                  />
                </div>
              </div>
            </div>
          </div>
        )
      )}

      {/* Slot optionnel avant les réactions/commentaires (ex: tags) */}
      {beforeComments}

      {/* Réactions sur la note */}
      <div className="mt-3 mb-2">
        <EntryReactions entryId={entryId} currentUserId={me.id} />
      </div>

      {/* Annotation threads */}
      {anchors.map((anchor) => {
        const n = countFor(anchor);
        const isOpen = isAnchorOpen(anchor);
        return (
          <div key={anchor} className="mb-2 rounded-xl border border-text-muted/10 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleAnchor(anchor)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left bg-bg-primary hover:bg-text-muted/5 transition-colors"
            >
              <span className="text-accent text-xs shrink-0">💬 {n}</span>
              <span className="text-xs text-text-muted italic truncate flex-1">« {anchor} »</span>
              <span className="text-[11px] text-text-muted/55 shrink-0">{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && (
              <div className="px-3 py-2 bg-bg-elevated">
                <MiniThread
                  anchor={anchor}
                  comments={comments}
                  replies={repliesOf}
                  entryId={entryId}
                  commentsLocked={commentsLocked}
                  me={me}
                  onDelete={(id) => deleteComment.mutate({ commentId: id })}
                  onEdit={(id, content, expectedVersion) => editComment.mutate({ commentId: id, content, expectedVersion })}
                  onAdd={(payload, parentId, replyToId) =>
                    addComment.mutate({
                      entryId,
                      content: payload.content || undefined,
                      image: payload.image,
                      gifUrl: payload.gifUrl,
                      parentId,
                      replyToId,
                      anchorText: parentId ? undefined : anchor,
                    })
                  }
                />
              </div>
            )}
          </div>
        );
      })}

      {/* General comments */}
      <div ref={generalCommentsRef} className="mt-6 flex flex-col flex-1 min-h-0">
        <button
          type="button"
          onClick={() => toggleAnchor('general')}
          className={`w-full flex items-center gap-3 font-mono text-[11px] uppercase tracking-widest text-text-muted/60 hover:text-text-muted transition-colors ${isAnchorOpen('general') ? 'mb-6' : 'mb-10'}`}
        >
          <span className="flex-1 h-px bg-text-muted/25" />
          <span className="shrink-0">
            Commentaires{countFor(null) > 0 ? ` · ${countFor(null)}` : ''}
          </span>
          <span className="flex-1 h-px bg-text-muted/25" />
        </button>
        {isAnchorOpen('general') && (
          <MiniThread
            anchor={null}
            comments={comments}
            replies={repliesOf}
            entryId={entryId}
            commentsLocked={commentsLocked}
            me={me}
            fullWidthComposer={fullWidthComposer}
            onDelete={(id) => deleteComment.mutate({ commentId: id })}
            onEdit={(id, content, expectedVersion) => editComment.mutate({ commentId: id, content, expectedVersion })}
            onAdd={(payload, parentId, replyToId) =>
              addComment.mutate({
                entryId,
                content: payload.content || undefined,
                image: payload.image,
                gifUrl: payload.gifUrl,
                parentId,
                replyToId,
              })
            }
          />
        )}
      </div>
    </div>
  );
}
