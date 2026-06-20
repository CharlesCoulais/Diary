import { db, type LocalEntry, type LocalDailyLog, type MediaMeta } from './db/schema';
import { getNoteTypeConfig } from '../components/NoteTypePicker';
import {
  parseContentBlocks, groupConsecutiveMedia, unescapeMd, escapeHtml, escapeAttr,
  type ContentBlock,
} from '../components/AnnotatedReader';
import {
  blocksToHtml, collectImageSrcs, collectMermaidCodes, revealMarkdown,
} from './exportPdf/blocksToHtml';
import { renderMermaidToSvg } from '../components/MermaidRender';
import { PRINT_STYLES } from './exportPdf/styles';
import { apiClient, type RouterOutputs } from './trpc';
import { formatDateLong } from './dateHelpers';
import { seriesGroupProgress } from './seriesProgress';

type EntryComment = RouterOutputs['comments']['list'][number];
type EntryReaction = RouterOutputs['reactions']['forEntry'][number];

const MAX_RANGE_DAYS = 92;

const STATUS_LABEL: Record<string, string> = {
  wishlist: 'Souhaité', owned: 'Possédé', ongoing: 'En cours', finished: 'Terminé', abandoned: 'Abandonné',
};
const SECTION_LABEL: Record<string, string> = {
  MORNING: 'Matin', LATE_MORNING: 'Fin de matinée', NOON: 'Midi', AFTERNOON: 'Après-midi',
  LATE_AFTERNOON: "Fin d'après-midi", EARLY_EVENING: 'Début de soirée', EVENING: 'Soir', NIGHT: 'Nuit', FREE: 'Libre',
};
const VIS_LABEL: Record<string, string> = { PRIVATE: 'Privé', SHARED_ALL: 'Partagé', SHARED_SPECIFIC: 'Partagé (ciblé)' };

const stars = (n?: number) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '');
const shortName = (a: { displayName?: string | null; email?: string | null }) => a.displayName || (a.email ?? '').split('@')[0] || 'Anonyme';

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

/** Exécute `fn` sur chaque item avec une concurrence limitée. */
async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const worker = async () => { while (i < items.length) { const idx = i++; await fn(items[idx]!); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// ── Résolution des images (same-origin → dataURL ; externes telles quelles) ──
async function fetchDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size > 5_000_000) return null;
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : null);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch { return null; }
}

async function resolveImages(srcs: string[], max: number): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(srcs.filter(Boolean))].slice(0, max);
  await mapPool(unique, 8, async (src) => {
    if (/^(https?:|data:)/i.test(src)) { map.set(src, src); return; } // externe/dataURL : tel quel
    const dataUrl = await fetchDataUrl(location.origin + (src.startsWith('/') ? src : '/' + src));
    if (dataUrl) map.set(src, dataUrl);
  });
  return map;
}

async function renderMermaids(codes: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  await mapPool([...new Set(codes)], 4, async (code) => {
    const svg = await withTimeout(renderMermaidToSvg(code).catch(() => ''), 4000, '');
    if (svg) map.set(code, svg);
  });
  return map;
}

function collectMediaMetaImages(m?: MediaMeta | null): string[] {
  if (!m) return [];
  const out: string[] = [];
  if (m.coverUrl) out.push(m.coverUrl);
  for (const t of m.tracks ?? []) if (t.coverUrl) out.push(t.coverUrl);
  for (const q of m.quizQuestions ?? []) {
    if (q.image) out.push(q.image);
    for (const oi of q.optionImages ?? []) if (oi) out.push(oi);
  }
  return out;
}

// ── Contexte de rendu partagé (note unique OU période) ──────────────────────
interface EntryData { blocks: ContentBlock[]; comments: EntryComment[]; reactions: EntryReaction[]; }
interface RenderContext { perEntry: Map<string, EntryData>; images: Map<string, string>; mermaids: Map<string, string>; }

async function gatherRenderContext(entries: LocalEntry[]): Promise<RenderContext> {
  const perEntry = new Map<string, EntryData>();
  for (const e of entries) {
    let blocks: ContentBlock[] = [];
    try { blocks = groupConsecutiveMedia(parseContentBlocks(unescapeMd(e.contentMd ?? ''))); } catch { blocks = []; }
    perEntry.set(e.id, { blocks, comments: [], reactions: [] });
  }
  // Commentaires + réactions par note, concurrence limitée et tolérante.
  await mapPool(entries, 6, async (e) => {
    const [comments, reactions] = await Promise.all([
      withTimeout(apiClient.comments.list.query({ entryId: e.id }), 5000, [] as EntryComment[]),
      withTimeout(apiClient.reactions.forEntry.query({ entryId: e.id }), 5000, [] as EntryReaction[]),
    ]);
    const d = perEntry.get(e.id);
    if (d) { d.comments = comments; d.reactions = reactions; }
  });
  // Images + mermaid sur l'ensemble.
  const imgSrcs: string[] = [];
  const mermaidCodes: string[] = [];
  for (const e of entries) {
    const d = perEntry.get(e.id)!;
    imgSrcs.push(
      ...collectImageSrcs(d.blocks),
      ...collectMediaMetaImages(e.mediaMeta),
      ...d.comments.filter((c) => c.image).map((c) => '/images/' + c.image!.id),
    );
    mermaidCodes.push(...collectMermaidCodes(d.blocks));
  }
  const images = await withTimeout(resolveImages(imgSrcs, entries.length > 1 ? 250 : 40), 12000, new Map<string, string>());
  const mermaids = await renderMermaids(mermaidCodes);
  return { perEntry, images, mermaids };
}

// ── Rendu des sections ──────────────────────────────────────────────────────
function entryBadges(entry: LocalEntry, includeVisibility: boolean): string[] {
  const b: string[] = [];
  if (includeVisibility) b.push(VIS_LABEL[entry.visibility] ?? entry.visibility);
  if (entry.isForConfidant) b.push('💛 Confident');
  if (entry.isAdult) b.push('🔞 18+');
  if (entry.isSecret) b.push('🔒 Secret');
  if (entry.isDraft) b.push('Brouillon');
  if (entry.unlockAt) b.push('🔒 Capsule' + (entry.capsuleSpoiler ? ' · « ' + entry.capsuleSpoiler + ' »' : ''));
  return b;
}

function renderEntryHeader(entry: LocalEntry, cfg: ReturnType<typeof getNoteTypeConfig>, mode: 'full' | 'compact'): string {
  const color = cfg.hex;
  const time = entry.timeLabel ?? (entry.section ? SECTION_LABEL[entry.section] ?? '' : '');
  if (mode === 'full') {
    const badges = entryBadges(entry, true).map((b) => `<span class="pdf-badge">${escapeHtml(b)}</span>`).join('');
    return `
    <div class="pdf-kicker" style="color:${color}">${cfg.icon} ${escapeHtml(cfg.label)}</div>
    <h1>${escapeHtml(entry.title || cfg.label)}</h1>
    <div class="pdf-datel">${escapeHtml(formatDateLong(entry.date))}${time ? ' · ' + escapeHtml(time) : ''}</div>
    <div class="pdf-badges">${badges}</div>`;
  }
  const badges = entryBadges(entry, false).map((b) => `<span class="pdf-badge">${escapeHtml(b)}</span>`).join('');
  return `<div class="pdf-entry-head"><span class="pdf-entry-type" style="color:${color}">${cfg.icon} ${escapeHtml(cfg.label)}</span>${time ? ' · <span class="pdf-entry-time">' + escapeHtml(time) + '</span>' : ''}${entry.title ? ' · <strong>' + escapeHtml(entry.title) + '</strong>' : ''}${badges ? ' ' + badges : ''}</div>`;
}

function renderEntryMeta(entry: LocalEntry): string {
  const rows: string[] = [];
  const row = (k: string, v: string) => { if (v) rows.push(`<tr><td class="k">${k}</td><td>${v}</td></tr>`); };
  if (entry.mood) row('Humeur', escapeHtml(entry.mood));
  if (entry.weather) row('Météo', escapeHtml(entry.weather));
  if (entry.sleepHours != null) row('Sommeil', `${entry.sleepHours} h`);
  if (entry.tagNames?.length) row('Tags', entry.tagNames.map(escapeHtml).join(' · '));
  const ratings = entry.ratings ?? [];
  const fav = ratings.filter((r) => r.value === 'FAVORITE').length;
  const low = ratings.filter((r) => r.value === 'LOW').length;
  if (fav || low) {
    const p: string[] = [];
    if (fav) p.push(`★ ${fav} favori${fav > 1 ? 's' : ''}`);
    if (low) p.push(`⊘ ${low} à oublier`);
    row('Notations', p.join(' · '));
  }
  return rows.length ? `<table class="pdf-meta">${rows.join('')}</table>` : '';
}

function renderMediaMeta(noteType: string, m: MediaMeta | null | undefined, images: Map<string, string>): string {
  if (!m) return '';
  const rows: string[] = [];
  const row = (k: string, v: string) => { if (v) rows.push(`<tr><td class="k">${k}</td><td>${v}</td></tr>`); };
  const cover = m.coverUrl ? images.get(m.coverUrl) : undefined;
  const coverHtml = cover ? `<img src="${escapeAttr(cover)}" style="max-width:120px;border-radius:6px;float:right;margin:0 0 8px 12px"/>` : '';
  if (m.subject) row('Titre', escapeHtml(m.subject));
  if (m.creator) row('Auteur', escapeHtml(m.creator));
  if (m.rating) row('Note', stars(m.rating));
  if (m.status) row('Statut', STATUS_LABEL[m.status] ?? m.status);
  if (noteType === 'SERIES') {
    const prog = seriesGroupProgress(m);
    if (prog) row('Progression', escapeHtml(prog));
    for (const s of m.seasonsWatched ?? []) {
      row(`Saison ${s.number}`, `${(s.watched ?? []).length}/${s.episodes} ép.${s.title ? ' · ' + escapeHtml(s.title) : ''}`);
    }
  } else if (m.progressCurrent && m.progressTotal) {
    row('Progression', `${m.progressCurrent} / ${m.progressTotal}`);
  }
  if (m.volume || m.totalVolumes) row('Tome', `${m.volume ?? '?'}${m.totalVolumes ? ' / ' + m.totalVolumes : ''}`);
  if (m.chapter || m.totalChapters) row('Chapitre', `${m.chapter ?? '?'}${m.totalChapters ? ' / ' + m.totalChapters : ''}${m.partName ? ' · ' + escapeHtml(m.partName) : ''}`);
  if (m.description) rows.push(`<tr><td class="k">Résumé</td><td><em>${escapeHtml(m.description)}</em></td></tr>`);

  let html = rows.length ? `${coverHtml}<table class="pdf-meta">${rows.join('')}</table>` : '';

  if (m.tracks?.length) {
    html += `<div class="pdf-section-title">${escapeHtml(m.playlistName ?? 'Playlist')}</div><ol>`;
    for (const t of m.tracks) {
      html += `<li>${escapeHtml(t.subject ?? '')}${t.creator ? ' — ' + escapeHtml(t.creator) : ''}${t.rating ? ' · ' + stars(t.rating) : ''}</li>`;
    }
    html += '</ol>';
  } else if (m.lyrics) {
    html += `<div class="pdf-section-title">Paroles</div><pre class="pdf-code">${escapeHtml(m.lyrics)}</pre>`;
  }

  if (m.quizQuestions?.length) {
    html += `<div class="pdf-section-title">Quizz — ${m.quizQuestions.length} question${m.quizQuestions.length > 1 ? 's' : ''}</div>`;
    m.quizQuestions.forEach((q, i) => {
      html += `<div class="pdf-branch"><div class="pdf-branch-head">Question ${i + 1}</div><div class="pdf-branch-body"><p class="pdf-p">${escapeHtml(q.prompt)}</p>`;
      const qImg = q.image ? images.get(q.image) : undefined;
      if (qImg) html += `<figure class="pdf-figure"><img src="${escapeAttr(qImg)}" style="max-width:240px"/></figure>`;
      if (q.options?.length) {
        html += '<ul>';
        q.options.forEach((opt, oi) => {
          const correct = (q.correct ?? []).includes(oi);
          html += `<li>${correct ? '✓ ' : ''}${escapeHtml(opt)}</li>`;
        });
        html += '</ul>';
      }
      if (q.accepted?.length) html += `<p class="pdf-p"><em>Réponses acceptées : ${q.accepted.map(escapeHtml).join(', ')}</em></p>`;
      if (q.explanation) html += `<p class="pdf-p"><em>${escapeHtml(q.explanation)}</em></p>`;
      html += '</div></div>';
    });
  }
  return html;
}

function renderReactions(reactions: EntryReaction[]): string {
  if (!reactions.length) return '';
  const pills = reactions.map((r) => `<span class="pdf-reaction-pill">${escapeHtml(r.emoji)} ${r.count}</span>`).join('');
  const detail = reactions
    .map((r) => `${r.emoji} ${r.users.map((u) => escapeHtml(shortName(u))).join(', ')}`)
    .join(' · ');
  return `<div class="pdf-section-title">Réactions</div><div class="pdf-reactions">${pills}</div><div class="pdf-react-names">${detail}</div>`;
}

function renderComments(comments: EntryComment[], images: Map<string, string>): string {
  if (!comments.length) return '';
  const roots = comments.filter((c) => !c.parentId);
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id);
  const one = (c: EntryComment, isReply: boolean): string => {
    const name = escapeHtml(shortName(c.author));
    const role = c.author.role === 'OWNER' ? '<span class="pdf-comment-role">owner</span>' : '';
    const date = new Date(c.createdAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const quote = c.replyTo
      ? `<div class="pdf-comment-quote"><strong>${escapeHtml(c.replyTo.author ? shortName(c.replyTo.author) : '')}</strong> ${escapeHtml((c.replyTo.content || '').slice(0, 160))}</div>`
      : '';
    const cImg = c.image ? images.get('/images/' + c.image.id) : undefined;
    const img = cImg ? `<img class="pdf-comment-img" src="${escapeAttr(cImg)}"/>` : '';
    const gif = c.gifUrl ? `<div class="pdf-media-ph">GIF — <a href="${escapeAttr(c.gifUrl)}">voir</a></div>` : '';
    return `<div class="pdf-comment${isReply ? ' reply' : ''}"><div class="pdf-comment-meta">${name}${role} · ${escapeHtml(date)}</div>${quote}<div class="pdf-comment-body">${revealMarkdown(c.content || '')}</div>${img}${gif}</div>`;
  };
  const threads = roots.map((r) => {
    const anchor = r.anchorText ? `<div class="pdf-thread-anchor">« ${escapeHtml(r.anchorText)} »</div>` : '';
    const replies = repliesOf(r.id).map((rep) => one(rep, true)).join('');
    return `<div class="pdf-thread">${anchor}${one(r, false)}${replies}</div>`;
  }).join('');
  return `<div class="pdf-section-title">Commentaires (${comments.length})</div><div class="pdf-comments">${threads}</div>`;
}

/** Bloc « ressenti du jour » (daily log) — miroir de DailyLogRecap. */
function renderDailyLog(log?: LocalDailyLog): string {
  if (!log) return '';
  const parts: string[] = [];
  if (log.mood) parts.push(escapeHtml(log.mood));
  if (log.weather) parts.push(escapeHtml(log.weather));
  if (log.sleepHours != null) parts.push(`😴 ${log.sleepHours} h`);
  if (log.energy != null) parts.push(`⚡ ${log.energy}/5`);
  if (log.anxiety != null) parts.push(`🌀 ${log.anxiety}/5`);
  if (!parts.length) return '';
  return `<div class="pdf-dailylog"><span class="pdf-dailylog-label">Ressenti</span>${parts.map((p) => `<span class="pdf-dailylog-item">${p}</span>`).join('')}</div>`;
}

function renderEntrySection(entry: LocalEntry, ctx: RenderContext, mode: 'full' | 'compact'): string {
  const cfg = getNoteTypeConfig(entry.noteType);
  const data = ctx.perEntry.get(entry.id) ?? { blocks: [], comments: [], reactions: [] };
  let contentHtml = '';
  try { contentHtml = data.blocks.length ? blocksToHtml(data.blocks, { images: ctx.images, mermaids: ctx.mermaids }) : ''; }
  catch { contentHtml = `<pre class="pdf-code">${escapeHtml(entry.contentMd ?? '')}</pre>`; }
  return [
    renderEntryHeader(entry, cfg, mode),
    renderEntryMeta(entry),
    renderMediaMeta(entry.noteType, entry.mediaMeta, ctx.images),
    contentHtml,
    renderReactions(data.reactions),
    renderComments(data.comments, ctx.images),
  ].filter(Boolean).join('\n');
}

// ── Fenêtre d'impression ────────────────────────────────────────────────────
function openExportWindow(): Window | null {
  const win = window.open('', '_blank');
  if (!win) return null;
  win.document.write('<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/><title>Export…</title></head><body style="font-family:system-ui,sans-serif;color:#6b5840;padding:48px;text-align:center;font-size:15px">Préparation du PDF…</body></html>');
  win.document.close();
  return win;
}

function showMessage(win: Window, msg: string): void {
  if (win.closed) return;
  win.document.open();
  win.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/><title>Export</title></head><body style="font-family:system-ui,sans-serif;color:#6b5840;padding:48px;text-align:center;font-size:15px">${escapeHtml(msg)}</body></html>`);
  win.document.close();
}

function wrapPrintDoc(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"/>
<title>${escapeAttr(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet"/>
<style>${PRINT_STYLES}</style></head>
<body>${body}
<script>
(function(){
  function ready(){
    var imgs = Array.prototype.slice.call(document.images);
    Promise.all(imgs.map(function(img){ return img.complete ? 1 : new Promise(function(r){ img.onload = img.onerror = r; }); }))
      .then(function(){ return (document.fonts && document.fonts.ready) ? document.fonts.ready : 1; })
      .then(function(){ window.__printReady = true; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
</script>
</body></html>`;
}

async function printInWindow(win: Window, html: string): Promise<void> {
  if (win.closed) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  // Impression déterministe : attend les polices + images (plafond 3,5 s).
  await new Promise<void>((resolve) => {
    const start = Date.now();
    const tick = () => {
      const w = win as Window & { __printReady?: boolean };
      if (w.__printReady || win.closed || Date.now() - start > 3500) return resolve();
      setTimeout(tick, 100);
    };
    tick();
  });
  if (!win.closed) win.print();
}

// ── Export d'UNE note ───────────────────────────────────────────────────────
export async function exportToPdf(entry: LocalEntry): Promise<void> {
  const win = openExportWindow();
  if (!win) return;
  const cfg = getNoteTypeConfig(entry.noteType);
  const ctx = await gatherRenderContext([entry]);
  const body = renderEntrySection(entry, ctx, 'full');
  await printInWindow(win, wrapPrintDoc(`${cfg.label} — ${entry.date}`, body));
}

// ── Export d'une PÉRIODE (plage de dates) + ressenti du jour ────────────────
const sortByTime = (a: LocalEntry, b: LocalEntry) =>
  (a.timeLabel || '').localeCompare(b.timeLabel || '') || a.createdAt.localeCompare(b.createdAt);

export async function exportRangeToPdf(from: string, to: string): Promise<void> {
  const win = openExportWindow();
  if (!win) return;

  const dayMs = 86_400_000;
  const span = Math.round((new Date(to + 'T12:00:00').getTime() - new Date(from + 'T12:00:00').getTime()) / dayMs);
  if (!from || !to || span < 0) { showMessage(win, 'Plage de dates invalide.'); return; }
  if (span > MAX_RANGE_DAYS) { showMessage(win, `Période trop longue (maximum ${MAX_RANGE_DAYS} jours). Choisis une plage plus courte.`); return; }

  const [entries, dailyLogs] = await Promise.all([
    db.entries.where('date').between(from, to, true, true).filter((e) => e.deletedAt === null && !e.collectionOnly).toArray().catch(() => [] as LocalEntry[]),
    db.dailyLogs.where('date').between(from, to, true, true).filter((d) => d.deletedAt === null).toArray().catch(() => [] as LocalDailyLog[]),
  ]);

  const byDate = new Map<string, LocalEntry[]>();
  for (const e of entries) { const arr = byDate.get(e.date) ?? []; arr.push(e); byDate.set(e.date, arr); }
  for (const arr of byDate.values()) arr.sort(sortByTime);
  const logByDate = new Map(dailyLogs.map((d) => [d.date, d] as const));
  const dates = [...new Set([...byDate.keys(), ...logByDate.keys()])].sort();
  if (!dates.length) { showMessage(win, 'Aucune note ni ressenti sur cette période.'); return; }

  const ctx = await gatherRenderContext(entries);

  const cover = `<div class="pdf-cover"><div class="pdf-kicker">Journal</div><h1>Du ${escapeHtml(formatDateLong(from))}<br/>au ${escapeHtml(formatDateLong(to))}</h1><div class="pdf-datel">${dates.length} jour${dates.length > 1 ? 's' : ''} · ${entries.length} note${entries.length > 1 ? 's' : ''}</div></div>`;

  const days = dates.map((date) => {
    const log = logByDate.get(date);
    const dayEntries = byDate.get(date) ?? [];
    const sections = dayEntries.map((e) => `<div class="pdf-entry">${renderEntrySection(e, ctx, 'compact')}</div>`).join('');
    const noNote = dayEntries.length ? '' : '<p class="pdf-p" style="color:#9a8a72;font-style:italic">Aucune note ce jour.</p>';
    return `<section class="pdf-day"><h2 class="pdf-day-title">${escapeHtml(formatDateLong(date))}</h2>${renderDailyLog(log)}${sections}${noNote}</section>`;
  }).join('');

  await printInWindow(win, wrapPrintDoc(`Journal ${from} – ${to}`, cover + days));
}
