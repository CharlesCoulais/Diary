import type { MediaTrack } from './db/schema';

/**
 * Import d'une playlist depuis un export JSON de Skiley (https://skiley.net).
 *
 * Skiley exporte un tableau JSON où chaque élément décrit un morceau avec ses
 * métadonnées Spotify (titre, artiste, album, URL). On n'a donc PAS besoin de
 * l'API Spotify : tout est déjà dans le fichier. Seule la pochette manque — elle
 * est complétée après coup via iTunes (cf. lookupItunesCover).
 */

/** Champs de l'export Skiley qu'on exploite (le reste est ignoré). */
interface SkileyEntry {
  trackName?: unknown;
  artistName?: unknown;
  secondaryArtistsNames?: unknown;
  albumName?: unknown;
  trackUrl?: unknown;
}

const str = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
};

/** Combine l'artiste principal et les artistes secondaires en « X feat. Y ». */
function buildCreator(primary?: string, secondary?: string): string | undefined {
  if (!primary) return secondary;
  if (!secondary) return primary;
  // Évite « X feat. X » si l'export duplique.
  if (secondary.toLowerCase().includes(primary.toLowerCase())) return secondary;
  return `${primary} feat. ${secondary}`;
}

/**
 * Parse le texte d'un export Skiley en liste de MediaTrack.
 * Tolérant : ignore les entrées sans titre ni URL exploitable. Lève si le JSON
 * est invalide ou si ce n'est pas un tableau (→ message d'erreur côté appelant).
 */
export function parseSkileyExport(text: string): MediaTrack[] {
  const data = JSON.parse(text) as unknown;
  if (!Array.isArray(data)) {
    throw new Error('not-an-array');
  }
  const tracks: MediaTrack[] = [];
  for (const raw of data as SkileyEntry[]) {
    if (!raw || typeof raw !== 'object') continue;
    const subject = str(raw.trackName);
    const streamUrl = str(raw.trackUrl);
    // On garde une entrée si elle a au moins un titre OU une URL jouable.
    if (!subject && !streamUrl) continue;
    const creator = buildCreator(str(raw.artistName), str(raw.secondaryArtistsNames));
    const track: MediaTrack = {};
    if (subject) track.subject = subject;
    if (creator) track.creator = creator;
    const album = str(raw.albumName);
    if (album) track.trackTitle = album;
    if (streamUrl) track.streamUrl = streamUrl;
    tracks.push(track);
  }
  return tracks;
}

/**
 * Devine un nom de playlist depuis le nom de fichier Skiley.
 * « Rock _ Dark - Skiley Export.json » → « Rock / Dark »
 * (Skiley remplace les « / » du nom par « _ » dans le fichier.)
 */
export function playlistNameFromFilename(filename: string): string | undefined {
  let name = filename.replace(/\.json$/i, '');
  name = name.replace(/\s*-\s*Skiley Export\s*$/i, '');
  name = name.replace(/\s+_\s+/g, ' / ');
  name = name.trim();
  return name.length ? name : undefined;
}

/**
 * Cherche les paroles d'un morceau via lrclib.net (même source que le bouton
 * « Récupérer » de l'éditeur). Renvoie le texte brut (sans timestamps) ou undefined.
 */
export async function lookupLrclibLyrics(
  title: string,
  artist: string,
  signal: AbortSignal,
): Promise<string | undefined> {
  if (!title.trim() || !artist.trim()) return undefined;
  const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return undefined;
  const data = await res.json() as { plainLyrics?: string; syncedLyrics?: string };
  const raw = data.plainLyrics ?? data.syncedLyrics?.replace(/\[\d+:\d+\.\d+\] ?/g, '') ?? '';
  const lyrics = raw.replace(/<[^>]*>/g, '').trim();
  return lyrics || undefined;
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Cherche la pochette d'un morceau via l'API iTunes (déjà utilisée pour la
 * recherche musicale). Renvoie `rateLimited: true` sur un 403/429 pour que
 * l'appelant puisse ralentir (iTunes plafonne ~20 req/min sans clé).
 */
export async function lookupItunesCover(
  title: string,
  artist: string | undefined,
  signal: AbortSignal,
): Promise<{ coverUrl?: string; rateLimited?: boolean }> {
  const term = [title, artist].filter(Boolean).join(' ').trim();
  if (term.length < 2) return {};
  const res = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=5`,
    { signal },
  );
  if (res.status === 403 || res.status === 429) return { rateLimited: true };
  if (!res.ok) return {};
  const data = await res.json() as { results?: Record<string, unknown>[] };
  const results = data.results ?? [];
  if (!results.length) return {};
  // Préfère un résultat dont l'artiste correspond ; sinon le premier (plus pertinent).
  const wanted = artist ? norm(artist) : '';
  const best = (wanted
    ? results.find((r) => {
        const a = norm((r['artistName'] as string) ?? '');
        return a && (a.includes(wanted) || wanted.includes(a));
      })
    : undefined) ?? results[0];
  if (!best) return {};
  const cover = (best['artworkUrl100'] as string | undefined)?.replace('100x100', '300x300');
  return { coverUrl: cover };
}
