import type { MediaMeta, MediaTrack } from './db/schema';

/**
 * Renvoie la liste effective des morceaux pour une note MUSIC.
 *
 * - Si `tracks` existe et n'est pas vide, c'est la source de vérité (mode playlist).
 * - Sinon, on fabrique une track unique à partir des champs top-level (mode legacy).
 */
export function getTracks(meta: MediaMeta | null | undefined): MediaTrack[] {
  if (!meta) return [];
  if (meta.tracks && meta.tracks.length > 0) return meta.tracks;
  if (meta.streamUrl || meta.subject || meta.creator) {
    return [{
      streamUrl: meta.streamUrl,
      subject: meta.subject,
      creator: meta.creator,
      trackTitle: meta.trackTitle,
      coverUrl: meta.coverUrl,
      rating: meta.rating,
      description: meta.description,
      lyrics: meta.lyrics,
      lyricsTranslation: meta.lyricsTranslation,
    }];
  }
  return [];
}

/** Renvoie la track à afficher dans une vue "représentative" (Collection, EntryCard, etc.) */
export function getRepresentativeTrack(meta: MediaMeta | null | undefined): MediaTrack {
  const tracks = getTracks(meta);
  return tracks[0] ?? {};
}

/** True si la note doit être traitée comme une playlist multi-morceaux. */
export function isPlaylist(meta: MediaMeta | null | undefined): boolean {
  return !!meta?.tracks && meta.tracks.length > 0;
}

/**
 * Patch à appliquer pour transformer une note mono-track en playlist multi-track,
 * en migrant les champs top-level vers tracks[0] et en ajoutant une track vide.
 *
 * Les champs top-level musicaux sont effacés pour éviter la confusion :
 * désormais c'est `tracks` qui fait foi.
 */
export function migrateToPlaylist(meta: MediaMeta | null | undefined): MediaMeta {
  const base = meta ?? {};
  if (base.tracks && base.tracks.length > 0) {
    return { ...base, tracks: [...base.tracks, {}] };
  }
  const firstTrack: MediaTrack = {
    streamUrl: base.streamUrl,
    subject: base.subject,
    creator: base.creator,
    trackTitle: base.trackTitle,
    coverUrl: base.coverUrl,
    rating: base.rating,
    description: base.description,
    lyrics: base.lyrics,
    lyricsTranslation: base.lyricsTranslation,
  };
  const cleaned: MediaMeta = { ...base };
  delete cleaned.streamUrl;
  delete cleaned.subject;
  delete cleaned.creator;
  delete cleaned.trackTitle;
  delete cleaned.coverUrl;
  delete cleaned.rating;
  delete cleaned.description;
  delete cleaned.lyrics;
  delete cleaned.lyricsTranslation;
  return { ...cleaned, tracks: [firstTrack, {}] };
}
