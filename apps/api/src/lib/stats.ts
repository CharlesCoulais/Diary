import type { PrismaClient } from '@prisma/client';
import { behaviorOf, type NoteTypeDefLike } from '@carnet/schemas';

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function computeStreaks(writtenDays: Set<string>, today: string) {
  const yesterday = addDays(today, -1);
  const todayWritten = writtenDays.has(today);
  let current = 0;
  let cursor: string | null = todayWritten ? today : writtenDays.has(yesterday) ? yesterday : null;
  if (cursor) {
    while (writtenDays.has(cursor)) {
      current++;
      cursor = addDays(cursor, -1);
    }
  }
  if (writtenDays.size === 0) return { current: 0, best: 0, todayWritten };
  const sorted = Array.from(writtenDays).sort();
  let best = 0;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (addDays(sorted[i - 1]!, 1) === sorted[i]) { run++; }
    else { run = 1; }
    if (run > best) best = run;
  }
  if (run > best) best = run;
  if (1 > best) best = 1;
  return { current, best: Math.max(best, current), todayWritten };
}

export async function computeStatsForAuthor(authorId: string, db: PrismaClient, since?: string) {
  const allEntries = await db.entry.findMany({
    where: { authorId, deletedAt: null },
    select: {
      date: true,
      noteType: true,
      customTypeId: true,
      mood: true,
      mediaMeta: true,
      tags: { select: { tag: { select: { name: true } } } },
    },
  });

  // Types custom de l'owner → comportement effectif d'une note CUSTOM.
  const defRows = await db.noteTypeDef.findMany({
    where: { ownerId: authorId },
    select: { id: true, behavior: true, label: true, labelPlural: true, volumeLabel: true, icon: true, colorHex: true },
  });
  const defsById: Record<string, NoteTypeDefLike> = {};
  for (const d of defRows) defsById[d.id] = d as NoteTypeDefLike;

  const today = new Date().toISOString().slice(0, 10);

  // Streak: always computed on ALL entries (never filtered by since)
  const allWrittenDays = new Set(allEntries.map((e) => e.date.toISOString().slice(0, 10)));
  const { current: currentStreak, best: bestStreak, todayWritten } = computeStreaks(allWrittenDays, today);

  // Filter entries for all other stats
  const sinceDate = since ? new Date(since) : null;
  const entries = sinceDate
    ? allEntries.filter((e) => e.date >= sinceDate)
    : allEntries;

  // Compte par COMPORTEMENT effectif : une note CUSTOM est rangée dans le bucket
  // de son comportement hérité (BOOK, MUSIC, …), pas sous 'CUSTOM'.
  const typeCounts: Record<string, number> = {};
  for (const e of entries) {
    const b = behaviorOf(e, defsById);
    typeCounts[b] = (typeCounts[b] ?? 0) + 1;
  }

  // Media stats: unique finished items (Map pour conserver les métadonnées)
  type MediaItem = { subject: string; creator?: string; coverUrl?: string; rating?: number; extra?: string };
  const booksMap = new Map<string, MediaItem>();
  const moviesMap = new Map<string, MediaItem>();
  const seriesMap = new Map<string, MediaItem>();
  const episodesList: MediaItem[] = [];
  for (const e of entries) {
    const behavior = behaviorOf(e, defsById);
    const meta = (e.mediaMeta ?? {}) as { status?: string; subject?: string; seriesName?: string; seriesStatus?: string; creator?: string; coverUrl?: string; rating?: number; season?: number; progressCurrent?: number };
    if (behavior === 'BOOK' && meta.status === 'finished' && meta.subject) {
      if (!booksMap.has(meta.subject))
        booksMap.set(meta.subject, { subject: meta.subject, creator: meta.creator, coverUrl: meta.coverUrl, rating: meta.rating });
    }
    if (behavior === 'MOVIE' && meta.status === 'finished' && meta.subject) {
      if (!moviesMap.has(meta.subject))
        moviesMap.set(meta.subject, { subject: meta.subject, creator: meta.creator, coverUrl: meta.coverUrl, rating: meta.rating });
    }
    if (behavior === 'SERIES' && (meta.status === 'finished' || meta.seriesStatus === 'finished')) {
      const key = meta.seriesName || meta.subject;
      if (key && !seriesMap.has(key))
        seriesMap.set(key, { subject: key, creator: meta.creator, coverUrl: meta.coverUrl, rating: meta.rating });
    }
    if (behavior === 'SERIES') {
      const title = meta.seriesName || meta.subject || 'Sans titre';
      const parts: string[] = [];
      if (meta.season) parts.push(`S${meta.season}`);
      if (meta.progressCurrent) parts.push(`E${meta.progressCurrent}`);
      episodesList.push({ subject: title, creator: meta.creator, coverUrl: meta.coverUrl, rating: meta.rating, extra: parts.join(' · ') || undefined });
    }
  }
  const cmp = (a: MediaItem, b: MediaItem) => a.subject.localeCompare(b.subject, 'fr', { sensitivity: 'base' });
  const booksList = Array.from(booksMap.values()).sort(cmp);
  const moviesList = Array.from(moviesMap.values()).sort(cmp);
  const seriesWatchedList = Array.from(seriesMap.values()).sort(cmp);
  episodesList.sort(cmp);
  const booksRead = booksList.length;
  const moviesWatched = moviesList.length;
  const seriesWatched = seriesWatchedList.length;

  // Total morceaux : tracks pour les playlists au comportement MUSIC (custom
  // inclus) + 1 pour les notes mono avec subject/streamUrl
  let totalTracks = 0;
  for (const e of entries) {
    if (behaviorOf(e, defsById) !== 'MUSIC') continue;
    const m = (e.mediaMeta ?? {}) as { tracks?: unknown[]; subject?: string; streamUrl?: string };
    if (Array.isArray(m.tracks) && m.tracks.length > 0) totalTracks += m.tracks.length;
    else if (m.subject || m.streamUrl) totalTracks += 1;
  }


  const moodCounts: Record<string, number> = {};
  const segmenter = new Intl.Segmenter();
  for (const e of entries) {
    if (e.mood) {
      for (const { segment } of segmenter.segment(e.mood)) {
        if (segment.trim()) moodCounts[segment] = (moodCounts[segment] ?? 0) + 1;
      }
    }
  }
  const topMoods = Object.entries(moodCounts).sort((a, b) => b[1] - a[1]).slice(0, 10) as [string, number][];

  const dayCounts: Record<string, number> = {};
  for (const e of entries) {
    const ds = e.date.toISOString().slice(0, 10);
    dayCounts[ds] = (dayCounts[ds] ?? 0) + 1;
  }

  const tagCounts: Record<string, number> = {};
  for (const e of entries) {
    for (const et of e.tags) {
      tagCounts[et.tag.name] = (tagCounts[et.tag.name] ?? 0) + 1;
    }
  }
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5) as [string, number][];

  const writtenDays = new Set(entries.map((e) => e.date.toISOString().slice(0, 10)));

  return {
    totalEntries: entries.length,
    totalDays: writtenDays.size,
    totalTracks,
    booksRead,
    moviesWatched,
    seriesWatched,
    booksList,
    moviesList,
    seriesWatchedList,
    episodesList,
    currentStreak,
    bestStreak,
    todayWritten,
    typeCounts,
    topMoods,
    dayCounts,
    topTags,
  };
}
