import type { MediaMeta, MediaStatus, SeriesSeason } from './db/schema';

/**
 * Helpers purs pour le suivi saison/épisode des séries TV de la Collection.
 *
 * Source de vérité : `mediaMeta.seasonsWatched` (une entrée par saison avec la
 * liste des n° d'épisodes vus). Les champs « plats » historiques
 * (`season`/`progressCurrent`/`progressTotal`/`totalSeasons`) en sont **dérivés**
 * à chaque écriture pour rester cohérents avec les vues qui les lisent encore.
 */

/** N° d'épisodes vus valides (uniques, dans [1, episodes], triés croissant). */
export function cleanWatched(season: SeriesSeason): number[] {
  const max = Math.max(0, Math.floor(season.episodes));
  const set = new Set<number>();
  for (const e of season.watched ?? []) {
    const n = Math.floor(e);
    if (n >= 1 && n <= max) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

/** Normalise un tableau de saisons (épisodes >= 0, watched nettoyé, tri par n°). */
export function cleanSeasons(seasons: SeriesSeason[] | undefined): SeriesSeason[] {
  if (!seasons || seasons.length === 0) return [];
  return seasons
    .map((s) => ({
      number: Math.max(0, Math.floor(s.number)),
      episodes: Math.max(0, Math.floor(s.episodes)),
      watched: cleanWatched(s),
      ...(s.title ? { title: s.title } : {}),
    }))
    .sort((a, b) => a.number - b.number);
}

export interface SeriesStats {
  hasSeasons: boolean;   // true si seasonsWatched exploitable
  seasonsTotal: number;  // nb de saisons connues
  seasonsDone: number;   // saisons entièrement vues
  epsTotal: number;      // total d'épisodes connus
  epsWatched: number;    // épisodes vus
}

/** Stats agrégées, avec fallback sur les champs plats si pas de seasonsWatched. */
export function seriesStats(meta: MediaMeta | null | undefined): SeriesStats {
  const seasons = meta?.seasonsWatched;
  if (seasons && seasons.length > 0) {
    let epsTotal = 0;
    let epsWatched = 0;
    let seasonsDone = 0;
    let seasonsTotal = 0;
    for (const s of seasons) {
      const eps = Math.max(0, Math.floor(s.episodes));
      if (eps <= 0) continue;
      seasonsTotal += 1;
      const w = cleanWatched(s).length;
      epsTotal += eps;
      epsWatched += w;
      if (w >= eps) seasonsDone += 1;
    }
    if (epsTotal > 0) {
      return { hasSeasons: true, seasonsTotal, seasonsDone, epsTotal, epsWatched };
    }
  }
  // Fallback : progression plate.
  const epsTotal = meta?.progressTotal ?? 0;
  const epsWatched = Math.min(epsTotal || Infinity, meta?.progressCurrent ?? 0);
  return {
    hasSeasons: false,
    seasonsTotal: meta?.totalSeasons ?? (meta?.season ? 1 : 0),
    seasonsDone: 0,
    epsTotal,
    epsWatched: Number.isFinite(epsWatched) ? epsWatched : 0,
  };
}

/** Libellé compact de progression pour la carte/ligne Collection (ou null). */
export function seriesGroupProgress(meta: MediaMeta | null | undefined): string | null {
  const seasons = meta?.seasonsWatched;
  if (seasons && seasons.length > 0) {
    const st = seriesStats(meta);
    if (st.hasSeasons) {
      const seasonLabel = st.seasonsTotal > 1
        ? `${st.seasonsDone}/${st.seasonsTotal} saisons · `
        : '';
      return `${seasonLabel}${st.epsWatched}/${st.epsTotal} ép.`;
    }
  }
  // Fallback : ancien format S{season} · E{cur}/{total}
  const season = meta?.season;
  if (season) {
    const cur = meta?.progressCurrent;
    const total = meta?.progressTotal;
    return `S${season}${cur ? ` · E${cur}` : ''}${total ? `/${total}` : ''}`;
  }
  if (meta?.progressTotal) {
    return `${meta.progressCurrent ?? 0}/${meta.progressTotal} ép.`;
  }
  return null;
}

/** Champs plats dérivés des saisons (pour rétrocompat des vues existantes). */
export function deriveLegacyFields(seasons: SeriesSeason[]): {
  season?: number;
  progressCurrent?: number;
  progressTotal?: number;
  totalSeasons?: number;
} {
  const valid = seasons.filter((s) => s.episodes > 0);
  if (valid.length === 0) return {};
  // Saison « courante » = la plus avancée avec au moins un épisode vu, sinon la 1re.
  const withWatched = valid.filter((s) => cleanWatched(s).length > 0);
  const current = withWatched.length > 0
    ? withWatched[withWatched.length - 1]!
    : valid[0]!;
  return {
    season: current.number,
    progressCurrent: cleanWatched(current).length,
    progressTotal: current.episodes,
    totalSeasons: valid.length,
  };
}

/**
 * Statut dérivé du suivi épisodes (à appliquer en gardant l'existant si 0 vu).
 * - tous les épisodes vus → 'finished'
 * - au moins un vu → 'ongoing'
 * - 0 vu → garde le statut courant (wishlist/owned/abandoned) inchangé
 */
export function deriveSeriesStatus(
  seasons: SeriesSeason[],
  current: MediaStatus | undefined,
): MediaStatus | undefined {
  const st = seriesStats({ seasonsWatched: seasons } as MediaMeta);
  if (!st.hasSeasons || st.epsTotal === 0) return current;
  if (st.epsWatched >= st.epsTotal) return 'finished';
  if (st.epsWatched > 0) return 'ongoing';
  return current;
}
