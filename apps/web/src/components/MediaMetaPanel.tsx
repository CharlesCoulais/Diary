import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { NoteType, NoteTypeBehavior } from './NoteTypePicker';
import { resolveNoteTypeConfig } from './NoteTypePicker';
import { useNoteTypeDefs } from '../lib/useNoteTypeDefs';
import { db, type MediaMeta, type MediaTrack } from '../lib/db/schema';
import { MediaSearchInput } from './MediaSearchInput';
import { ISBNScanner } from './ISBNScanner';
import { searchMovies, searchSeries, searchBooks, searchMusic, fetchTVDetails, fetchTVSeasonEpisodes, fetchBookEditions, fetchBookByISBN, fetchBookDescription, fetchMovieCollection } from '../lib/mediaSearch';
import { apiClient } from '../lib/trpc';
import type { MediaSearchResult, BookEdition } from '../lib/mediaSearch';
import { migrateToPlaylist, getTracks } from '../lib/musicTracks';
import { parseSkileyExport, playlistNameFromFilename, lookupItunesCover, lookupLrclibLyrics } from '../lib/skileyImport';
import { SkileyImportDialog, type SkileyImportOptions } from './SkileyImportDialog';
import { MAX_PLAYLIST_TRACKS } from '@carnet/schemas';
import { QuizBuilder } from './QuizBuilder';
import { SeasonEpisodeTracker } from './SeasonEpisodeTracker';
import { AgendaEventBuilder } from './AgendaEventBuilder';
import { BudgetBuilder } from './BudgetBuilder';
import { renameDevTheme, propagateDevTotals, propagateDevPartName, devThemeTotals, devPartNameForVolume, renameQuizTheme, propagateQuizTotal, quizThemeTotal } from '../lib/devSeries';

// Champs musicaux qui appartiennent à une track quand la note MUSIC est en mode playlist.
// En mode mono, ils restent stockés au niveau top de mediaMeta (rétrocompat).
const MUSIC_TRACK_FIELDS = new Set(['subject', 'creator', 'trackTitle', 'coverUrl', 'rating', 'description', 'streamUrl', 'lyrics', 'lyricsTranslation']);

/** Pause annulable (utilisée pour le backoff de l'enrichissement pochettes). */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const id = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(id); resolve(); }, { once: true });
  });
}

// Input texte avec buffering local pour éviter les pertes de caractères dues aux re-renders Dexie
/** Input texte qui ne propage onChange qu'au blur — évite les re-renders à chaque frappe. */
function BufferedTextInput({ value, placeholder, onChange, className }: { value?: string; placeholder: string; onChange: (v: string) => void; className?: string }) {
  const [local, setLocal] = useState(value ?? '');
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setLocal(value ?? '');
  }, [value]);
  return (
    <input
      type="text"
      value={local}
      placeholder={placeholder}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; onChange(local); }}
      onChange={(e) => setLocal(e.target.value)}
      className={className ?? "w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted/55 outline-none border-b border-text-muted/15 focus:border-accent/40 transition-colors pb-0.5"}
    />
  );
}

/** Input nombre qui ne propage onChange qu'au blur. */
function BufferedNumberInput({ value, placeholder, min, className, onChange }: { value?: number; placeholder: string; min?: number; className?: string; onChange: (v: number | undefined) => void }) {
  const [local, setLocal] = useState(value != null ? String(value) : '');
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setLocal(value != null ? String(value) : '');
  }, [value]);
  return (
    <input
      type="number"
      value={local}
      placeholder={placeholder}
      min={min ?? 0}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; onChange(local ? parseInt(local, 10) : undefined); }}
      onChange={(e) => setLocal(e.target.value)}
      className={className ?? "w-24 bg-transparent text-sm text-text-primary placeholder:text-text-muted/55 outline-none border-b border-text-muted/15 focus:border-accent/40 transition-colors pb-0.5"}
    />
  );
}

interface MediaMetaPanelProps {
  noteType: NoteType;
  /** Id du type custom (quand noteType === 'CUSTOM') — sert à résoudre le
   *  comportement hérité (`behavior`) qui pilote l'affichage structuré. */
  customTypeId?: string | null;
  meta: MediaMeta | null;
  onChange: (meta: MediaMeta) => void;
  onInsertText?: (text: string) => void;
  /** Id de la note courante — sert à exclure la note elle-même lors de la
   *  propagation des métadonnées DEV vers les notes sœurs du même thème. */
  entryId?: string;
}

const STATUS_OPTIONS: { value: MediaMeta['status']; label: string }[] = [
  { value: 'ongoing',   label: 'En cours' },
  { value: 'finished',  label: 'Terminé' },
  { value: 'abandoned', label: 'Abandonné' },
];

const STAR_VALUES = [1, 2, 3, 4, 5];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  // Mobile : label au-dessus de la valeur (le `w-20` fixe amputait la valeur dans
  // la sheet étroite, COLL-05). ≥ sm : retour à la mise en page horizontale.
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <span className="text-text-muted text-xs sm:w-20 shrink-0">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

const TextInput = BufferedTextInput;
const NumberInput = BufferedNumberInput;

function ProgressBar({ current, total }: { current?: number; total?: number }) {
  if (!total || !current) return null;
  const pct = Math.min(100, Math.round((current / total) * 100));
  return (
    <div className="mt-1 h-1 rounded-full bg-text-muted/10 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${pct}%`, backgroundColor: 'var(--color-accent)', opacity: 0.7 }}
      />
    </div>
  );
}

function StarRating({ value, onChange }: { value?: number; onChange: (v: number | undefined) => void }) {
  return (
    <div className="flex gap-1">
      {STAR_VALUES.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? undefined : n)}
          className={
            'text-base transition-all duration-100 ' +
            (value !== undefined && n <= value ? 'opacity-100' : 'opacity-20 hover:opacity-50')
          }
          style={{ color: 'var(--color-accent)' }}
          aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function MediaMetaPanel({ noteType, customTypeId, meta, onChange, onInsertText, entryId }: MediaMetaPanelProps) {
  const m = meta ?? {};

  // Comportement effectif : built-in → lui-même ; custom → comportement hérité
  // (ou JOURNAL si la définition a disparu). Tous les branchements STRUCTURELS
  // (quel panneau / quels champs afficher) passent par `behavior`. La persistance
  // (filtres Dexie par type stocké) garde le `noteType` brut.
  const { defsById } = useNoteTypeDefs();
  const behavior: NoteTypeBehavior = resolveNoteTypeConfig({ noteType, customTypeId }, defsById).behavior;

  // Mode playlist MUSIC : `tracks` non vide.
  // En mode playlist, les champs musicaux sont stockés dans `tracks[activeTrackIndex]` au lieu du top-level.
  const isMusicPlaylist = behavior === 'MUSIC' && !!m.tracks && m.tracks.length > 0;
  const [activeTrackIndex, setActiveTrackIndex] = useState(0);
  const safeTrackIndex = isMusicPlaylist
    ? Math.min(activeTrackIndex, (m.tracks?.length ?? 1) - 1)
    : 0;
  const activeTrackIndexRef = useRef(safeTrackIndex);
  activeTrackIndexRef.current = safeTrackIndex;

  // Vue effective des champs musicaux pour la track active.
  const trackView: Partial<MediaTrack> = isMusicPlaylist
    ? (m.tracks?.[safeTrackIndex] ?? {})
    : (m as MediaTrack);

  // Applique un patch en respectant le mode playlist (route les champs track-level vers la track active).
  const applyPatch = useCallback((current: MediaMeta, patch: Partial<MediaMeta>): MediaMeta => {
    if (behavior !== 'MUSIC' || !current.tracks || current.tracks.length === 0) {
      return { ...current, ...patch };
    }
    const idx = Math.min(activeTrackIndexRef.current, current.tracks.length - 1);
    const trackPatch: Partial<MediaTrack> = {};
    const notePatch: Partial<MediaMeta> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (MUSIC_TRACK_FIELDS.has(k)) (trackPatch as Record<string, unknown>)[k] = v;
      else (notePatch as Record<string, unknown>)[k] = v;
    }
    const tracks = [...current.tracks];
    tracks[idx] = { ...tracks[idx], ...trackPatch };
    return { ...current, ...notePatch, tracks };
  }, [behavior]);

  const set = (patch: Partial<MediaMeta>) => onChange(applyPatch(m, patch));

  // Pour rendre `m.X` musique-aware quand on est en playlist
  const mv = isMusicPlaylist ? { ...m, ...trackView } : m;

  const addTrack = useCallback(() => {
    const next = migrateToPlaylist(m);
    onChange(next);
    setActiveTrackIndex((next.tracks?.length ?? 1) - 1);
  }, [m, onChange]);

  const removeTrack = useCallback((idx: number) => {
    if (!m.tracks || m.tracks.length === 0) return;
    const tracks = m.tracks.filter((_, i) => i !== idx);
    if (tracks.length === 0) {
      const cleaned = { ...m };
      delete cleaned.tracks;
      delete cleaned.playlistName;
      onChange(cleaned);
      setActiveTrackIndex(0);
    } else {
      onChange({ ...m, tracks });
      setActiveTrackIndex(Math.min(idx, tracks.length - 1));
    }
  }, [m, onChange]);

  // Toutes les entrées du même type avec un sujet (pour retrouver ISBN etc.)
  const allSubjectEntries = useLiveQuery(
    () => db.entries
      .filter((e) => e.noteType === noteType && e.deletedAt === null && !!e.mediaMeta?.subject)
      .toArray()
      .then((entries) => {
        const seen = new Map<string, typeof entries[0]>();
        for (const e of entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
          const key = e.mediaMeta!.subject!;
          if (!seen.has(key)) seen.set(key, e);
        }
        return seen;
      }),
    [noteType],
  ) ?? new Map();

  // Noms de séries connus (pour autocomplete du champ Série/Thème — livres, films, dev).
  // Gate structurel par `behavior` ; filtre Dexie par le type brut stocké (`noteType`).
  const knownSeriesNames = useLiveQuery(
    () => (behavior !== 'BOOK' && behavior !== 'MOVIE' && behavior !== 'DEV' && behavior !== 'QUIZZ') ? Promise.resolve([] as string[]) :
      db.entries
        .filter((e) => (e.noteType === noteType) && e.deletedAt === null && !!e.mediaMeta?.seriesName)
        .toArray()
        .then((entries) => [...new Set(entries.map((e) => e.mediaMeta!.seriesName!))].sort()),
    [behavior, noteType],
  ) ?? [];

  // Noms de parties connus dans le thème courant (autocomplete DEV) — déduplique
  // par n° de partie pour proposer « Partie N — nom » et réutiliser un nom existant.
  // Gate structurel par `behavior` ; filtre Dexie par le type brut stocké (`noteType`).
  const themeForParts = (m.seriesName ?? '').trim();
  const knownPartNames = useLiveQuery(
    () => (behavior !== 'DEV' || !themeForParts) ? Promise.resolve([] as { volume: number | null; name: string }[]) :
      db.entries
        .filter((e) => e.noteType === noteType && e.deletedAt === null
          && (e.mediaMeta?.seriesName ?? '').trim() === themeForParts && !!e.mediaMeta?.partName)
        .toArray()
        .then((entries) => {
          const byName = new Map<string, { volume: number | null; name: string }>();
          for (const e of entries) {
            const name = e.mediaMeta!.partName!;
            if (!byName.has(name)) byName.set(name, { volume: e.mediaMeta?.volume ?? null, name });
          }
          return [...byName.values()].sort((a, b) => (a.volume ?? 0) - (b.volume ?? 0));
        }),
    [behavior, noteType, themeForParts],
  ) ?? [];

  // Entrées en cours du même type — seulement pour les types avec un cycle de vie (pas MUSIC/MOVIE/OUTING)
  const ongoingEntries = (behavior === 'BOOK' || behavior === 'SERIES')
    ? [...allSubjectEntries.values()].filter(
        (e) => e.mediaMeta?.status !== 'finished' && e.mediaMeta?.status !== 'abandoned',
      )
    : [];

  const searchFn: ((q: string, signal: AbortSignal) => Promise<MediaSearchResult[]>) | null = {
    MOVIE:    searchMovies,
    SERIES:   searchSeries,
    BOOK:     searchBooks,
    MUSIC:    searchMusic,
    OUTING:   null,
    JOURNAL:  null,
    SHOPPING: null,
    DEV:      null,
    QUIZZ:    null,
    AGENDA:   null,
    FINANCE:  null,
  }[behavior] ?? null;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const mRef = useRef(m);
  mRef.current = m;

  // Import playlist Skiley (.json) + enrichissement des pochettes via iTunes.
  const skileyInputRef = useRef<HTMLInputElement>(null);
  const enrichAbortRef = useRef<AbortController | null>(null);

  const [bookEditions, setBookEditions] = useState<BookEdition[]>([]);
  const [seriesInput, setSeriesInput] = useState(m.seriesName ?? '');
  const seriesFocused = useRef(false);
  // DEV : nom de la partie (édité localement, commit au blur).
  const [partNameInput, setPartNameInput] = useState(m.partName ?? '');
  const partNameFocused = useRef(false);
  const [showPartSuggestions, setShowPartSuggestions] = useState(false);
  const [showSeriesSuggestions, setShowSeriesSuggestions] = useState(false);
  const [isbnInput, setIsbnInput] = useState(m.isbn ?? '');
  const [isbnLoading, setIsbnLoading] = useState(false);
  const [isbnStatus, setIsbnStatus] = useState<'idle' | 'error' | 'no-pages'>('idle');
  const [showScanner, setShowScanner] = useState(false);
  const [lyricsState, setLyricsState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [urlMetaState, setUrlMetaState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [importState, setImportState] = useState<{ phase: 'idle' | 'parsing' | 'enriching' | 'done' | 'error'; done: number; total: number; msg?: string; note?: string }>({ phase: 'idle', done: 0, total: 0 });
  const [skileyParsed, setSkileyParsed] = useState<{ tracks: MediaTrack[]; playlistName?: string } | null>(null);

  // Synchronise inputs quand le meta change (ex: clic sur suggestion "En cours")
  useEffect(() => { setIsbnInput(m.isbn ?? ''); }, [m.isbn]);
  useEffect(() => { if (!seriesFocused.current) setSeriesInput(m.seriesName ?? ''); }, [m.seriesName]);
  useEffect(() => { if (!partNameFocused.current) setPartNameInput(m.partName ?? ''); }, [m.partName]);
  // Auto-déplie la section paroles quand on récupère des paroles avec succès
  useEffect(() => { if (lyricsState === 'done') setLyricsOpen(true); }, [lyricsState]);

  const handleISBNLookup = useCallback(async () => {
    const trimmed = isbnInput.trim();
    if (!trimmed || trimmed.replace(/[-\s]/g, '').length < 10) return;
    setIsbnLoading(true);
    setIsbnStatus('idle');
    try {
      const result = await fetchBookByISBN(trimmed, new AbortController().signal);
      if (result && result.title) {
        const patch: Partial<MediaMeta> = { isbn: trimmed };
        if (result.title) patch.subject = result.title;
        if (result.creator) patch.creator = result.creator;
        if (result.pages) patch.progressTotal = result.pages;
        if (result.description) patch.description = result.description;
        if (result.coverUrl) patch.coverUrl = result.coverUrl;
        onChangeRef.current({ ...mRef.current, ...patch });
        setBookEditions([]);
        if (!result.pages) setIsbnStatus('no-pages');
      } else {
        setIsbnStatus('error');
      }
    } finally {
      setIsbnLoading(false);
    }
  }, [isbnInput]);

  const allSubjectEntriesRef = useRef(allSubjectEntries);
  allSubjectEntriesRef.current = allSubjectEntries;

  const handleSelect = useCallback((r: MediaSearchResult) => {
    const tmdbId = parseInt(r.id, 10);

    // Si ce média est déjà en base, on part de ses métadonnées pour récupérer ISBN etc.
    const existing = allSubjectEntriesRef.current.get(r.title)?.mediaMeta;
    const patch: Partial<MediaMeta> = { ...(existing ?? {}), subject: r.title };
    if (r.creator) patch.creator = r.creator;
    if (r.progressTotal && !existing?.progressTotal) patch.progressTotal = r.progressTotal;
    if (r.description && !existing?.description) patch.description = r.description;
    if (r.coverUrl) patch.coverUrl = r.coverUrl;
    if (r.isbn && !existing?.isbn) patch.isbn = r.isbn;
    if (behavior === 'MUSIC' && r.albumTitle) patch.trackTitle = r.albumTitle;
    onChangeRef.current(applyPatch(mRef.current, patch));

    // MUSIC : si pas encore de streamUrl, tente de retrouver la vidéo YouTube
    // correspondante (scrape de la page de résultats YT côté serveur).
    if (behavior === 'MUSIC') {
      const currentStream = (mRef.current.tracks && mRef.current.tracks.length > 0)
        ? mRef.current.tracks[Math.min(activeTrackIndexRef.current, mRef.current.tracks.length - 1)]?.streamUrl
        : mRef.current.streamUrl;
      if (!currentStream) {
        apiClient.entries.findYouTubeForTrack.query({
          title: r.title,
          artist: r.creator,
        }).then((yt) => {
          if (!yt?.url) return;
          const stillEmpty = (mRef.current.tracks && mRef.current.tracks.length > 0)
            ? !mRef.current.tracks[Math.min(activeTrackIndexRef.current, mRef.current.tracks.length - 1)]?.streamUrl
            : !mRef.current.streamUrl;
          if (stillEmpty) onChangeRef.current(applyPatch(mRef.current, { streamUrl: yt.url }));
        }).catch(() => {});
      }
    }

    if (behavior === 'SERIES' && !isNaN(tmdbId)) {
      const ac = new AbortController();
      fetchTVDetails(tmdbId, ac.signal).then((details) => {
        if (!details) return;
        onChangeRef.current({ ...mRef.current, ...patch, tmdbId, totalSeasons: details.totalSeasons });
        fetchTVSeasonEpisodes(tmdbId, 1, ac.signal).then((count) => {
          if (count) onChangeRef.current({ ...mRef.current, ...patch, tmdbId, totalSeasons: details.totalSeasons, progressTotal: count, season: 1 });
        }).catch(() => {});
      }).catch(() => {});
    }

    if (behavior === 'MOVIE' && !isNaN(tmdbId)) {
      const ac = new AbortController();
      fetchMovieCollection(tmdbId, ac.signal).then((coll) => {
        if (!coll) return;
        onChangeRef.current({
          ...mRef.current,
          ...patch,
          tmdbId,
          seriesName: coll.seriesName,
          volume: coll.volume,
          totalVolumes: coll.totalVolumes,
        });
      }).catch(() => {});
    }

    if (behavior === 'BOOK' && r.workId) {
      setBookEditions([]);
      // Si on a déjà la description, pas besoin de la refetch
      if (!existing?.description) {
        const acDesc = new AbortController();
        fetchBookDescription(r.workId, acDesc.signal).then((desc) => {
          if (desc) onChangeRef.current({ ...mRef.current, ...patch, description: desc });
        }).catch(() => {});
      }
      // Éditions seulement si on n'a pas déjà le total de pages
      if (!existing?.progressTotal) {
        const acEditions = new AbortController();
        fetchBookEditions(r.workId, acEditions.signal).then((editions) => {
          if (editions.length > 1) setBookEditions(editions);
        }).catch(() => {});
      }
    } else if (behavior === 'BOOK' && !r.description && !existing?.description) {
      // Le résultat sélectionné vient de Google Books (pas de workId) MAIS n'a
      // pas de description (cas des mangas FR peu indexés). On tente une recherche
      // OL ciblée pour retrouver un workId puis fetch la description / éditions.
      const acFallback = new AbortController();
      const olQuery = encodeURIComponent(`${r.title} ${r.creator ?? ''}`.trim());
      fetch(`https://openlibrary.org/search.json?q=${olQuery}&limit=1&fields=key`, { signal: acFallback.signal })
        .then((res) => res.ok ? res.json() : null)
        .then((data: { docs?: { key?: string }[] } | null) => {
          const wid = data?.docs?.[0]?.key?.replace('/works/', '');
          if (!wid) return;
          return fetchBookDescription(wid, acFallback.signal);
        })
        .then((desc) => {
          if (desc) onChangeRef.current({ ...mRef.current, ...patch, description: desc });
        })
        .catch(() => { /* on accepte l'échec — le résumé reste vide */ });
    }
  }, [behavior]);

  // Recharge le nb d'épisodes uniquement quand la saison change (pas au montage)
  const seasonAbortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  useEffect(() => { isMountedRef.current = true; return () => { isMountedRef.current = false; }; }, []);
  const prevSeasonRef = useRef<number | undefined>(m.season);
  useEffect(() => {
    const prev = prevSeasonRef.current;
    prevSeasonRef.current = m.season;
    if (prev === m.season) return; // pas de changement (ou montage initial)
    if (behavior !== 'SERIES' || !m.tmdbId || !m.season) return;
    seasonAbortRef.current?.abort();
    seasonAbortRef.current = new AbortController();
    fetchTVSeasonEpisodes(m.tmdbId, m.season, seasonAbortRef.current.signal).then((count) => {
      if (count) onChangeRef.current({ ...mRef.current, progressTotal: count });
    }).catch(() => {});
    return () => seasonAbortRef.current?.abort();
  }, [behavior, m.tmdbId, m.season]);

  // Helper : lit un champ musical depuis la track active si playlist, sinon depuis le top-level
  const readTrackField = useCallback(<K extends keyof MediaTrack>(key: K): MediaTrack[K] | undefined => {
    if (behavior === 'MUSIC' && mRef.current.tracks && mRef.current.tracks.length > 0) {
      const idx = Math.min(activeTrackIndexRef.current, mRef.current.tracks.length - 1);
      return mRef.current.tracks[idx]?.[key];
    }
    return (mRef.current as MediaTrack)[key];
  }, [behavior]);

  const handleStreamUrlChange = useCallback(async (url: string) => {
    // ⚠️ On utilise mRef.current/applyPatch directement, pas `set` :
    // `set` est défini sur chaque render et capturé stale dans cette useCallback (deps fixes).
    onChangeRef.current(applyPatch(mRef.current, { streamUrl: url || undefined }));
    if (!url) return;

    // Normalise Spotify URLs: strip locale prefix (intl-XX/) and tracking param (?si=...)
    const normalizedUrl = url
      .replace(/open\.spotify\.com\/intl-[a-z]+\//, 'open.spotify.com/')
      .replace(/[?&]si=[^&]+/, '');

    let oembedUrl: string | null = null;
    if (normalizedUrl.includes('spotify.com'))           oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(normalizedUrl)}`;
    else if (normalizedUrl.includes('youtube.com') || normalizedUrl.includes('youtu.be')) oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(normalizedUrl)}&format=json`;
    else if (normalizedUrl.includes('soundcloud.com'))   oembedUrl = `https://soundcloud.com/oembed?url=${encodeURIComponent(normalizedUrl)}&format=json`;
    else if (normalizedUrl.includes('deezer.com'))       oembedUrl = `https://api.deezer.com/oembed?url=${encodeURIComponent(normalizedUrl)}&format=json`;
    if (!oembedUrl) return;

    setUrlMetaState('loading');
    try {
      const res = await fetch(oembedUrl);
      if (!res.ok) throw new Error();
      const data = await res.json() as { title?: string; author_name?: string };
      const patch: Partial<MediaMeta> = {};
      if (data.title && !readTrackField('subject'))  patch.subject = data.title;
      if (data.author_name && !readTrackField('creator')) patch.creator = data.author_name;

      // Spotify oEmbed ne renvoie pas author_name — on complète via iTunes
      if (data.title && !patch.creator && !readTrackField('creator')) {
        try {
          const ac = new AbortController();
          const results = await searchMusic(data.title, ac.signal);
          const best = results[0];
          if (best) {
            if (!readTrackField('subject'))  patch.subject  = best.title || data.title;
            if (!readTrackField('creator'))  patch.creator  = best.creator;
            if (!readTrackField('trackTitle') && best.albumTitle) patch.trackTitle = best.albumTitle;
            if (!readTrackField('coverUrl')  && best.coverUrl)   patch.coverUrl   = best.coverUrl;
          }
        } catch { /* silencieux */ }
      }

      if (Object.keys(patch).length) onChangeRef.current(applyPatch(mRef.current, { streamUrl: url || undefined, ...patch }));
      setUrlMetaState('done');
      setTimeout(() => setUrlMetaState('idle'), 2500);
    } catch {
      setUrlMetaState('idle');
    }
  }, [applyPatch, readTrackField]);

  const handleFetchLyrics = useCallback(async () => {
    const title = mv.subject?.trim();
    const artist = mv.creator?.trim();
    if (!title || !artist) return;
    setLyricsState('loading');
    try {
      const lyrics = await lookupLrclibLyrics(title, artist, new AbortController().signal);
      if (!lyrics) throw new Error('empty');
      onChangeRef.current(applyPatch(mRef.current, { lyrics }));
      setLyricsState('done');
      setTimeout(() => setLyricsState('idle'), 3000);
    } catch {
      setLyricsState('error');
    }
  }, [mv.subject, mv.creator, applyPatch]);

  // ─── Import playlist Skiley (.json) ───
  // Clé STABLE d'un morceau (titre+artiste+album) : ne change pas quand on swappe
  // le streamUrl (Spotify->YouTube) ni quand on pose pochette/paroles.
  const stableKey = (t: MediaTrack) => `${t.subject ?? ''} ${t.creator ?? ''} ${t.trackTitle ?? ''}`;

  // Applique les patchs récupérés (lien YouTube / pochette / paroles) au meta
  // courant, idempotent : lit toujours mRef.current. streamUrl est écrasé (swap
  // YouTube voulu) ; pochette/paroles seulement si encore vides.
  const flushPatches = useCallback((patchByKey: Map<string, Partial<MediaTrack>>) => {
    const cur = mRef.current;
    if (!cur.tracks?.length) return;
    let changed = false;
    const tracks = cur.tracks.map((t) => {
      const patch = patchByKey.get(stableKey(t));
      if (!patch) return t;
      const next = { ...t };
      let local = false;
      if (patch.streamUrl && patch.streamUrl !== t.streamUrl) { next.streamUrl = patch.streamUrl; local = true; }
      if (patch.coverUrl && !t.coverUrl) { next.coverUrl = patch.coverUrl; local = true; }
      if (patch.lyrics && !t.lyrics) { next.lyrics = patch.lyrics; local = true; }
      if (!local) return t;
      changed = true;
      return next;
    });
    if (changed) onChangeRef.current({ ...cur, tracks });
  }, []);

  // Enrichissement en arrière-plan des morceaux importés : lien YouTube (swap,
  // fallback Spotify), pochette iTunes, paroles lrclib — selon les options.
  // Concurrence bornée + backoff adaptatif sur rate-limit iTunes. Annulable.
  const runEnrichment = useCallback(async (
    toEnrich: MediaTrack[],
    opts: { youtube: boolean; covers: boolean; lyrics: boolean },
    dropped = 0,
  ) => {
    enrichAbortRef.current?.abort();
    const ac = new AbortController();
    enrichAbortRef.current = ac;
    const signal = ac.signal;

    const note = dropped > 0
      ? `${dropped} morceau${dropped > 1 ? 'x' : ''} au-delà de la limite de ${MAX_PLAYLIST_TRACKS} n'ont pas été importés.`
      : undefined;
    const resetSoon = () => setTimeout(() => setImportState((s) => (s.phase === 'done' ? { phase: 'idle', done: 0, total: 0 } : s)), note ? 8000 : 4000);
    const targets = toEnrich.filter((t) => t.subject || t.creator);
    const total = targets.length;
    if (!total || (!opts.youtube && !opts.covers && !opts.lyrics)) {
      setImportState({ phase: 'done', done: 0, total: 0, note });
      resetSoon();
      return;
    }

    const patchByKey = new Map<string, Partial<MediaTrack>>();
    const addPatch = (t: MediaTrack, p: Partial<MediaTrack>) => {
      patchByKey.set(stableKey(t), { ...patchByKey.get(stableKey(t)), ...p });
    };
    const queue = targets.map((t) => ({ t, attempts: 0 }));
    let done = 0;
    let delayMs = 0;        // backoff iTunes, partagé entre workers
    let lastFlush = 0;
    setImportState({ phase: 'enriching', done: 0, total, note });

    const worker = async () => {
      while (queue.length && !signal.aborted) {
        const item = queue.shift()!;
        const title = item.t.subject ?? '';
        const artist = item.t.creator;
        if (delayMs) await sleep(delayMs, signal);
        if (signal.aborted) return;
        try {
          // YouTube : une seule fois (pas de retry) — scrape serveur, fallback Spotify.
          if (item.attempts === 0 && opts.youtube && title) {
            try {
              const yt = await apiClient.entries.findYouTubeForTrack.query({ title: title.slice(0, 200), artist: artist?.slice(0, 200) });
              if (yt?.url) addPatch(item.t, { streamUrl: yt.url });
            } catch { /* garde le lien Spotify */ }
          }
          if (signal.aborted) return;
          // Pochette iTunes : retry du seul lookup pochette en cas de rate-limit.
          if (opts.covers && !item.t.coverUrl) {
            const { coverUrl, rateLimited } = await lookupItunesCover(title, artist, signal);
            if (rateLimited && item.attempts < 4) {
              delayMs = Math.min((delayMs || 1500) * 2, 30000);
              queue.push({ t: item.t, attempts: item.attempts + 1 });
              continue;
            }
            if (!rateLimited && delayMs) delayMs = Math.max(0, delayMs - 500);
            if (coverUrl) addPatch(item.t, { coverUrl });
          }
          if (signal.aborted) return;
          // Paroles : une seule fois (pas de retry).
          if (item.attempts === 0 && opts.lyrics && title && artist) {
            try {
              const lyrics = await lookupLrclibLyrics(title, artist, signal);
              if (lyrics) addPatch(item.t, { lyrics });
            } catch { /* pas de paroles trouvées */ }
          }
        } catch {
          if (signal.aborted) return;
        }
        done++;
        setImportState({ phase: 'enriching', done, total, note });
        const now = Date.now();
        if (now - lastFlush > 600) { lastFlush = now; flushPatches(patchByKey); }
      }
    };

    // YouTube = scrape serveur plus lourd → concurrence plus basse pour ménager l'IP.
    const concurrency = opts.youtube ? 3 : 4;
    await Promise.all(Array.from({ length: concurrency }, worker));
    if (signal.aborted) return;
    flushPatches(patchByKey);
    setImportState({ phase: 'done', done, total, note });
    resetSoon();
  }, [flushPatches]);

  // Étape 1 : parse le fichier puis ouvre la modale de sélection.
  const handleSkileyFile = useCallback(async (file: File) => {
    setImportState({ phase: 'parsing', done: 0, total: 0 });
    let imported: MediaTrack[];
    try {
      imported = parseSkileyExport(await file.text());
    } catch {
      setImportState({ phase: 'error', done: 0, total: 0, msg: "Fichier illisible : ce n'est pas un export Skiley (.json) valide." });
      return;
    }
    if (!imported.length) {
      setImportState({ phase: 'error', done: 0, total: 0, msg: 'Aucun morceau trouvé dans ce fichier.' });
      return;
    }
    setImportState({ phase: 'idle', done: 0, total: 0 });
    setSkileyParsed({ tracks: imported, playlistName: playlistNameFromFilename(file.name) });
  }, []);

  // Étape 2 : la modale renvoie la sélection + les options → on insère et on enrichit.
  const handleSkileyImport = useCallback((opts: SkileyImportOptions) => {
    setSkileyParsed(null);
    const selected = opts.tracks;
    if (!selected.length) return;

    // Insertion non destructive : on garde les morceaux déjà présents et on bascule
    // la note en playlist (les champs musicaux top-level migrent vers tracks[]).
    const cur = mRef.current;
    const existing = getTracks(cur).filter((t) => t.streamUrl || t.subject || t.creator);
    // Borne au plafond du schéma (sinon la sync rejette toute la note).
    const tracks = [...existing, ...selected].slice(0, MAX_PLAYLIST_TRACKS);
    const dropped = existing.length + selected.length - tracks.length;
    const cleaned: MediaMeta = { ...cur };
    for (const k of MUSIC_TRACK_FIELDS) delete (cleaned as Record<string, unknown>)[k];
    onChangeRef.current({
      ...cleaned,
      tracks,
      playlistName: cur.playlistName || opts.playlistName,
    });
    setActiveTrackIndex(Math.min(existing.length, tracks.length - 1));

    void runEnrichment(
      tracks.slice(existing.length),
      { youtube: opts.linkSource === 'youtube', covers: opts.fetchCovers, lyrics: opts.fetchLyrics },
      dropped,
    );
  }, [runEnrichment]);

  useEffect(() => () => enrichAbortRef.current?.abort(), []);

  // ─── DEV : éditer une métadonnée structurelle propage aux notes du thème ───
  // setLive lit toujours le meta courant (mRef) pour rester correct dans les
  // callbacks asynchrones (lookups Dexie).
  const setLive = useCallback((patch: Partial<MediaMeta>) => {
    onChangeRef.current(applyPatch(mRef.current, patch));
  }, [applyPatch]);

  // Thème : soit on rattache la note à un thème existant (et on récupère ses
  // totaux), soit on renomme le thème → propagation à toutes ses notes.
  const commitDevTheme = (rawTheme: string) => {
    const cur = mRef.current;
    const next = rawTheme.trim();
    const prev = (cur.seriesName ?? '').trim();
    if (next === prev) return;
    const joiningExisting = !!next && knownSeriesNames.some((s) => s !== prev && s === next);
    if (joiningExisting) {
      void devThemeTotals(next).then((t) =>
        setLive({ seriesName: next, totalVolumes: t.totalVolumes ?? cur.totalVolumes, totalChapters: t.totalChapters ?? cur.totalChapters }),
      );
      return;
    }
    setLive({ seriesName: next || undefined });
    if (prev) void renameDevTheme(prev, next, entryId);
  };

  // Suggestion de thème : rattache + remplit les totaux du thème.
  const pickDevTheme = (s: string) => {
    setSeriesInput(s);
    setShowSeriesSuggestions(false);
    const cur = mRef.current;
    void devThemeTotals(s).then((t) =>
      setLive({ seriesName: s, totalVolumes: t.totalVolumes ?? cur.totalVolumes, totalChapters: t.totalChapters ?? cur.totalChapters }),
    );
  };

  // Total parties / chapitres : s'applique à toutes les notes du thème.
  const commitDevTotal = (patch: Partial<MediaMeta>) => {
    setLive(patch);
    const cur = mRef.current;
    const theme = (cur.seriesName ?? '').trim();
    if (!theme) return;
    const merged = { ...cur, ...patch };
    void propagateDevTotals(theme, { totalVolumes: merged.totalVolumes, totalChapters: merged.totalChapters }, entryId);
  };

  // N° de partie : remplit le nom de partie connu pour ce n° (si vide).
  const commitDevVolume = (v: number | undefined) => {
    const cur = mRef.current;
    const theme = (cur.seriesName ?? '').trim();
    if (v != null && theme && !cur.partName) {
      void devPartNameForVolume(theme, v).then((name) => {
        if (name) { setLive({ volume: v, partName: name }); setPartNameInput(name); }
        else setLive({ volume: v });
      });
    } else {
      setLive({ volume: v });
    }
  };

  // Nom de partie : s'applique à toutes les notes du thème ayant le même n°.
  const commitDevPartName = (rawName: string) => {
    const name = rawName.trim() || undefined;
    setLive({ partName: name });
    const cur = mRef.current;
    const theme = (cur.seriesName ?? '').trim();
    if (theme) void propagateDevPartName(theme, cur.volume, name, entryId);
  };

  // ─── QUIZZ : thème + total (cible « X / total ») propagés aux quizz du thème ───
  const commitQuizTheme = (rawTheme: string) => {
    const cur = mRef.current;
    const next = rawTheme.trim();
    const prev = (cur.seriesName ?? '').trim();
    if (next === prev) return;
    const joiningExisting = !!next && knownSeriesNames.some((s) => s !== prev && s === next);
    if (joiningExisting) {
      void quizThemeTotal(next).then((tv) => setLive({ seriesName: next, totalVolumes: tv ?? cur.totalVolumes }));
      return;
    }
    setLive({ seriesName: next || undefined });
    if (prev) void renameQuizTheme(prev, next, entryId);
  };
  const pickQuizTheme = (s: string) => {
    setSeriesInput(s);
    setShowSeriesSuggestions(false);
    const cur = mRef.current;
    void quizThemeTotal(s).then((tv) => setLive({ seriesName: s, totalVolumes: tv ?? cur.totalVolumes }));
  };
  const commitQuizTotal = (v: number | undefined) => {
    setLive({ totalVolumes: v });
    const theme = (mRef.current.seriesName ?? '').trim();
    if (theme) void propagateQuizTotal(theme, v, entryId);
  };

  const subjectLabel = {
    BOOK:     'Titre',
    SERIES:   'Titre',
    MOVIE:    'Titre',
    MUSIC:    'Titre',
    OUTING:   'Lieu',
    JOURNAL:  'Sujet',
    SHOPPING: 'Sujet',
    DEV:      'Sujet',
    QUIZZ:    'Titre du quizz',
    AGENDA:   'Titre',
    FINANCE:  'Titre',
  }[behavior] ?? 'Titre';

  const creatorLabel = {
    BOOK:     'Auteur·e',
    SERIES:   'Réseau',
    MOVIE:    'Réalisateur·ice',
    MUSIC:    'Artiste',
    OUTING:   'Avec',
    JOURNAL:  '',
    SHOPPING: '',
    DEV:      '',
    QUIZZ:    '',
    AGENDA:   '',
    FINANCE:  '',
  }[behavior];

  // Filtre l'entrée courante (même sujet déjà sélectionné)
  const suggestions = ongoingEntries.filter((e) => e.mediaMeta?.subject !== m.subject);

  // AGENDA / FINANCE : panneaux dédiés (pas de champs média subject/auteur/note).
  if (behavior === 'AGENDA') {
    return (
      <div className="flex flex-col gap-3 py-3 border-t border-text-muted/10">
        <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted/50">Événements</p>
        <AgendaEventBuilder meta={m} onChange={onChange} />
      </div>
    );
  }
  if (behavior === 'FINANCE') {
    return (
      <div className="flex flex-col gap-3 py-3 border-t border-text-muted/10">
        <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted/50">Budget</p>
        <BudgetBuilder meta={m} onChange={onChange} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 py-3 border-t border-text-muted/10">
      {/* En cours — sélection rapide sans requête */}
      {suggestions.length > 0 && (() => {
        const progressOf = (em: MediaMeta) =>
          behavior === 'BOOK' && em.progressCurrent && em.progressTotal
            ? `p. ${em.progressCurrent}/${em.progressTotal}`
            : behavior === 'SERIES' && em.season
              ? `S${em.season}${em.progressCurrent ? ` E${em.progressCurrent}` : ''}`
              : null;
        return (
          <div className="flex flex-col gap-1.5">
            <span className="text-text-muted text-xs">En cours</span>
            {suggestions.length > 3 ? (
              <select
                value=""
                onChange={(ev) => {
                  const picked = suggestions.find((e) => e.id === ev.target.value);
                  if (picked) onChange({ ...picked.mediaMeta! });
                }}
                className="w-full bg-transparent text-sm text-text-primary outline-none border-b border-text-muted/15 focus:border-accent/40 transition-colors pb-1"
              >
                <option value="" disabled>
                  Reprendre une série en cours…
                </option>
                {suggestions.map((e) => {
                  const em = e.mediaMeta!;
                  const progress = progressOf(em);
                  return (
                    <option key={e.id} value={e.id}>
                      {em.subject}{progress ? ` — ${progress}` : ''}
                    </option>
                  );
                })}
              </select>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((e) => {
                  const em = e.mediaMeta!;
                  const progress = progressOf(em);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => onChange({ ...em })}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border border-text-muted/15 text-text-muted hover:border-accent/30 hover:text-text-primary transition-all duration-150 max-w-[200px]"
                    >
                      <span className="truncate">{em.subject}</span>
                      {progress && <span className="text-text-muted/50 shrink-0">{progress}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Série — livres et films */}
      {(behavior === 'BOOK' || behavior === 'MOVIE' || behavior === 'DEV' || behavior === 'QUIZZ') && (
        <Field label={(behavior === 'DEV' || behavior === 'QUIZZ') ? 'Thème' : 'Série'}>
          <div className="relative">
            <input
              type="text"
              value={seriesInput}
              placeholder={behavior === 'DEV' ? 'Thème principal (ex. JavaScript)…' : behavior === 'QUIZZ' ? 'Thème du quizz (ex. JavaScript)…' : 'Nom de la saga / série…'}
              onFocus={() => { seriesFocused.current = true; setShowSeriesSuggestions(true); }}
              onBlur={() => {
                seriesFocused.current = false;
                if (behavior === 'DEV') commitDevTheme(seriesInput);
                else if (behavior === 'QUIZZ') commitQuizTheme(seriesInput);
                else set({ seriesName: seriesInput.trim() || undefined });
                setTimeout(() => setShowSeriesSuggestions(false), 150);
              }}
              onChange={(e) => setSeriesInput(e.target.value)}
              className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted/55 outline-none border-b border-text-muted/15 focus:border-accent/40 transition-colors pb-0.5"
            />
            {showSeriesSuggestions && knownSeriesNames.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-bg-elevated rounded-xl shadow-lg border border-text-muted/10 overflow-hidden">
                {knownSeriesNames
                  .filter((s) => !seriesInput || s.toLowerCase().includes(seriesInput.toLowerCase()))
                  .slice(0, 5)
                  .map((s) => (
                    <button
                      key={s}
                      type="button"
                      onMouseDown={() => {
                        if (behavior === 'DEV') { pickDevTheme(s); return; }
                        if (behavior === 'QUIZZ') { pickQuizTheme(s); return; }
                        setSeriesInput(s);
                        set({ seriesName: s });
                        setShowSeriesSuggestions(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-text-muted/5 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </Field>
      )}

      {/* Import playlist Skiley : input caché + statut (commun aux modes mono/playlist) */}
      {behavior === 'MUSIC' && (
        <input
          ref={skileyInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void handleSkileyFile(f);
          }}
        />
      )}
      {behavior === 'MUSIC' && importState.phase !== 'idle' && (
        <div className="text-xs">
          {importState.phase === 'error' ? (
            <p className="text-danger">{importState.msg}</p>
          ) : importState.phase === 'parsing' ? (
            <p className="text-text-muted">Lecture du fichier…</p>
          ) : importState.phase === 'enriching' ? (
            <div className="space-y-1">
              <p className="text-text-muted">Récupération des pochettes… {importState.done}/{importState.total}</p>
              <div className="h-1 rounded-full bg-text-muted/15 overflow-hidden">
                <div
                  className="h-full bg-accent transition-all duration-300"
                  style={{ width: `${importState.total ? (importState.done / importState.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-accent">Import terminé ✓</p>
          )}
          {importState.phase !== 'error' && importState.note && (
            <p className="text-danger/80 mt-1">⚠ {importState.note}</p>
          )}
        </div>
      )}

      {skileyParsed && (
        <SkileyImportDialog
          tracks={skileyParsed.tracks}
          playlistName={skileyParsed.playlistName}
          onCancel={() => setSkileyParsed(null)}
          onImport={handleSkileyImport}
        />
      )}

      {/* Playlist (MUSIC multi-tracks) : nom + onglets des morceaux */}
      {behavior === 'MUSIC' && isMusicPlaylist && (
        <>
          <Field label="Playlist">
            <BufferedTextInput
              value={m.playlistName}
              placeholder="Nom de la playlist (optionnel)…"
              onChange={(v) => onChange({ ...m, playlistName: v || undefined })}
            />
          </Field>
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-text-muted text-xs w-20 shrink-0">Morceaux</span>
            <div className="flex-1 flex flex-wrap gap-1.5">
              {(m.tracks ?? []).map((t, i) => {
                const isActive = i === safeTrackIndex;
                const label = t.subject?.trim() || `Morceau ${i + 1}`;
                return (
                  <div key={i} className="inline-flex items-center">
                    <button
                      type="button"
                      onClick={() => setActiveTrackIndex(i)}
                      className={
                        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 max-w-[180px] ' +
                        (isActive
                          ? 'border-accent/40 bg-accent/10 text-accent font-medium'
                          : 'border-text-muted/15 text-text-muted hover:border-text-muted/30')
                      }
                    >
                      <span className="opacity-60 tabular-nums">{i + 1}</span>
                      <span className="truncate">{label}</span>
                    </button>
                    {isActive && (
                      <button
                        type="button"
                        onClick={() => removeTrack(i)}
                        aria-label="Supprimer ce morceau"
                        className="ml-0.5 p-0.5 text-text-muted/55 hover:text-danger transition-colors"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={addTrack}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border border-dashed border-text-muted/25 text-text-muted hover:border-accent/40 hover:text-accent transition-all duration-150"
              >
                + Ajouter
              </button>
              <button
                type="button"
                onClick={() => skileyInputRef.current?.click()}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border border-dashed border-text-muted/25 text-text-muted hover:border-accent/40 hover:text-accent transition-all duration-150"
              >
                ⇪ Importer (.json)
              </button>
            </div>
          </div>
        </>
      )}

      {/* Sujet — pour DEV, ce champ est rendu plus bas (après le n° de chapitre). */}
      {behavior !== 'DEV' && (
        <Field label={subjectLabel}>
          {searchFn ? (
            <MediaSearchInput
              key={`subject-${safeTrackIndex}`}
              value={mv.subject ?? ''}
              placeholder={subjectLabel + '…'}
              onSearch={searchFn}
              onSelect={handleSelect}
              onChange={(v) => set({ subject: v || undefined })}
            />
          ) : (
            <BufferedTextInput
              value={mv.subject}
              placeholder={subjectLabel + '…'}
              onChange={(v) => set({ subject: v || undefined })}
            />
          )}
        </Field>
      )}

      {/* Album — Musique uniquement, juste après Titre */}
      {behavior === 'MUSIC' && (
        <Field label="Album">
          <BufferedTextInput
            value={mv.trackTitle}
            placeholder="Nom de l'album…"
            onChange={(v) => set({ trackTitle: v || undefined })}
          />
        </Field>
      )}

      {/* Créateur */}
      {creatorLabel && (
        <Field label={creatorLabel}>
          <BufferedTextInput
            value={mv.creator}
            placeholder={creatorLabel + '…'}
            onChange={(v) => set({ creator: v || undefined })}
          />
        </Field>
      )}

      {/* Sélecteur d'édition livre */}
      {behavior === 'BOOK' && bookEditions.length > 0 && (
        <Field label="Édition">
          <div className="flex flex-wrap gap-1">
            {bookEditions.map((ed) => (
              <button
                key={ed.key}
                type="button"
                onClick={() => {
                  set({ progressTotal: ed.pages });
                  setBookEditions([]);
                }}
                className={
                  'px-2 py-0.5 rounded-full text-xs border transition-colors duration-150 ' +
                  (m.progressTotal === ed.pages
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-text-muted/15 text-text-muted hover:border-text-muted/30')
                }
              >
                {ed.label}
              </button>
            ))}
          </div>
        </Field>
      )}

      {/* Lookup ISBN */}
      {behavior === 'BOOK' && (
        <Field label="ISBN">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={isbnInput}
              placeholder="978-…"
              onChange={(e) => {
                setIsbnInput(e.target.value);
                setIsbnStatus('idle');
                set({ isbn: e.target.value.trim() || undefined });
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleISBNLookup()}
              className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted/55 outline-none border-b border-text-muted/15 focus:border-accent/40 transition-colors pb-0.5"
            />
            {/* Scan barcode button */}
            <button
              type="button"
              onClick={() => setShowScanner(true)}
              title="Scanner le code-barres"
              className="p-1.5 rounded-lg text-accent/70 hover:text-accent hover:bg-accent/10 transition-colors shrink-0"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 5v3M3 5h3" /><path d="M21 5v3M21 5h-3" />
                <path d="M3 19v-3M3 19h3" /><path d="M21 19v-3M21 19h-3" />
                <line x1="7" y1="8" x2="7" y2="16" /><line x1="10" y1="8" x2="10" y2="16" />
                <line x1="13" y1="8" x2="13" y2="16" /><line x1="17" y1="8" x2="17" y2="16" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleISBNLookup}
              disabled={isbnLoading}
              className="text-xs text-accent hover:opacity-70 transition-opacity disabled:opacity-40 shrink-0"
            >
              {isbnLoading ? '↻' : 'Chercher'}
            </button>
          </div>
          {isbnStatus === 'error' && <p className="text-xs text-danger mt-0.5">ISBN introuvable</p>}
          {isbnStatus === 'no-pages' && <p className="text-xs text-text-muted mt-0.5">Titre récupéré · nombre de pages non disponible</p>}
        </Field>
      )}

      {/* ISBN barcode scanner */}
      {showScanner && (
        <ISBNScanner
          onDetected={(isbn) => {
            setShowScanner(false);
            setIsbnInput(isbn);
            setIsbnStatus('idle');
            set({ isbn });
            // Auto-trigger lookup
            setTimeout(() => {
              const trimmed = isbn.trim();
              if (!trimmed) return;
              setIsbnLoading(true);
              import('../lib/mediaSearch').then(({ fetchBookByISBN }) =>
                fetchBookByISBN(trimmed, new AbortController().signal)
                  .then((result) => {
                    if (result && result.title) {
                      const patch: Partial<MediaMeta> = { isbn: trimmed };
                      if (result.title) patch.subject = result.title;
                      if (result.creator) patch.creator = result.creator;
                      if (result.pages) patch.progressTotal = result.pages;
                      if (result.description) patch.description = result.description;
                      if (result.coverUrl) patch.coverUrl = result.coverUrl;
                      onChangeRef.current({ ...mRef.current, ...patch });
                      if (!result.pages) setIsbnStatus('no-pages');
                    } else {
                      setIsbnStatus('error');
                    }
                  })
                  .finally(() => setIsbnLoading(false))
              );
            }, 100);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* Progression livre */}
      {behavior === 'BOOK' && (
        <>
          <Field label="Tome">
            <div className="flex items-center gap-2">
              <NumberInput
                value={m.volume}
                placeholder="actuel"
                min={1}
                onChange={(v) => set({ volume: v })}
              />
              <span className="text-text-muted/55 text-xs">/</span>
              <NumberInput
                value={m.totalVolumes}
                placeholder="total"
                min={1}
                onChange={(v) => set({ totalVolumes: v })}
              />
            </div>
          </Field>
          <Field label="Chapitre">
            <NumberInput
              value={m.chapter}
              placeholder="n°"
              min={1}
              onChange={(v) => set({ chapter: v })}
            />
          </Field>
          <Field label="Page">
            <div className="flex items-center gap-2">
              <NumberInput
                value={m.progressCurrent}
                placeholder="actuelle"
                min={0}
                onChange={(v) => set({ progressCurrent: v })}
              />
              <span className="text-text-muted/55 text-xs">/</span>
              <NumberInput
                value={m.progressTotal}
                placeholder="total"
                min={1}
                onChange={(v) => set({ progressTotal: v })}
              />
            </div>
            <ProgressBar current={m.progressCurrent} total={m.progressTotal} />
          </Field>
        </>
      )}

      {/* Structure DEV : Partie (n° + nom) + Chapitre (n°) — sert au regroupement
          Thème → Parties → Chapitres et à l'ordre dans la Collection. */}
      {behavior === 'DEV' && (
        <>
          <Field label="Partie">
            <div className="flex items-center gap-2">
              <NumberInput
                value={m.volume}
                placeholder="n°"
                min={1}
                onChange={(v) => commitDevVolume(v)}
              />
              <span className="text-text-muted/55 text-xs">/</span>
              <NumberInput
                value={m.totalVolumes}
                placeholder="total"
                min={1}
                onChange={(v) => commitDevTotal({ totalVolumes: v })}
              />
            </div>
          </Field>
          <Field label="Nom de la partie">
            <div className="relative">
              <input
                type="text"
                value={partNameInput}
                placeholder="ex. Comprendre le moteur JavaScript"
                onFocus={() => { partNameFocused.current = true; setShowPartSuggestions(true); }}
                onBlur={() => {
                  partNameFocused.current = false;
                  commitDevPartName(partNameInput);
                  setTimeout(() => setShowPartSuggestions(false), 150);
                }}
                onChange={(e) => setPartNameInput(e.target.value)}
                className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted/55 outline-none border-b border-text-muted/15 focus:border-accent/40 transition-colors pb-0.5"
              />
              {showPartSuggestions && knownPartNames.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-bg-elevated rounded-xl shadow-lg border border-text-muted/10 overflow-hidden">
                  {knownPartNames
                    .filter((p) => !partNameInput || p.name.toLowerCase().includes(partNameInput.toLowerCase()))
                    .slice(0, 6)
                    .map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        onMouseDown={() => {
                          setPartNameInput(p.name);
                          setShowPartSuggestions(false);
                          // Réutiliser une partie existante reprend aussi son n°.
                          const vol = p.volume ?? mRef.current.volume;
                          setLive(p.volume != null ? { partName: p.name, volume: p.volume } : { partName: p.name });
                          const theme = (mRef.current.seriesName ?? '').trim();
                          if (theme) void propagateDevPartName(theme, vol, p.name, entryId);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-text-muted/5 transition-colors flex items-center gap-2"
                      >
                        {p.volume != null && <span className="text-text-muted/50 text-xs shrink-0">P{p.volume}</span>}
                        <span className="truncate">{p.name}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>
          </Field>
          <Field label="Chapitre">
            <div className="flex items-center gap-2">
              <NumberInput
                value={m.chapter}
                placeholder="n°"
                min={1}
                onChange={(v) => set({ chapter: v })}
              />
              <span className="text-text-muted/55 text-xs">/</span>
              <NumberInput
                value={m.totalChapters}
                placeholder="total"
                min={1}
                onChange={(v) => commitDevTotal({ totalChapters: v })}
              />
            </div>
          </Field>
          {/* Sujet du chapitre — placé après le n° de chapitre (ordre de saisie logique). */}
          <Field label="Sujet">
            <BufferedTextInput
              value={mv.subject}
              placeholder="Titre du chapitre…"
              onChange={(v) => set({ subject: v || undefined })}
            />
          </Field>
        </>
      )}

      {/* QUIZZ : n° dans le thème (ordre) + total (cible « X / total ») */}
      {behavior === 'QUIZZ' && (
        <Field label="N°">
          <div className="flex items-center gap-2">
            <NumberInput
              value={m.volume}
              placeholder="n°"
              min={1}
              onChange={(v) => set({ volume: v })}
            />
            <span className="text-text-muted/55 text-xs">/</span>
            <NumberInput
              value={m.totalVolumes}
              placeholder="total"
              min={1}
              onChange={(v) => commitQuizTotal(v)}
            />
          </div>
        </Field>
      )}

      {/* QUIZZ : éditeur de questions (owner) */}
      {behavior === 'QUIZZ' && (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer select-none">
              <input type="checkbox" checked={!!m.quizShuffleQuestions} onChange={(e) => set({ quizShuffleQuestions: e.target.checked || undefined })} className="accent-[var(--color-accent)]" />
              Mélanger l'ordre des questions
            </label>
            <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer select-none">
              <input type="checkbox" checked={!!m.quizShuffleOptions} onChange={(e) => set({ quizShuffleOptions: e.target.checked || undefined })} className="accent-[var(--color-accent)]" />
              Mélanger l'ordre des options (QCM)
            </label>
          </div>
          <span className="text-text-muted text-xs">Questions du quizz</span>
          <QuizBuilder
            value={m.quizQuestions ?? []}
            onChange={(qs) => set({ quizQuestions: qs.length ? qs : undefined })}
            entryId={entryId}
          />
        </div>
      )}

      {/* Progression série */}
      {behavior === 'SERIES' && (
        <>
          <Field label="Saison">
            <div className="flex items-center gap-2">
              <NumberInput
                value={m.season}
                placeholder="actuelle"
                min={1}
                onChange={(v) => set({ season: v })}
              />
              <span className="text-text-muted/55 text-xs">/</span>
              <NumberInput
                value={m.totalSeasons}
                placeholder="total"
                min={1}
                onChange={(v) => set({ totalSeasons: v })}
              />
            </div>
          </Field>
          <Field label="Épisode">
            <div className="flex items-center gap-2">
              <NumberInput
                value={m.progressCurrent}
                placeholder="actuel"
                min={1}
                onChange={(v) => set({ progressCurrent: v })}
              />
              <span className="text-text-muted/55 text-xs">/</span>
              <NumberInput
                value={m.progressTotal}
                placeholder="par saison"
                min={1}
                onChange={(v) => set({ progressTotal: v })}
              />
            </div>
            <ProgressBar current={m.progressCurrent} total={m.progressTotal} />
          </Field>
          {/* Suivi détaillé saison par saison, épisode par épisode (collection) */}
          <details className="group rounded-xl border border-text-muted/15 px-3 py-2">
            <summary className="cursor-pointer list-none select-none text-xs text-text-muted hover:text-text-primary flex items-center gap-1.5">
              <svg
                width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                className="shrink-0 transition-transform group-open:rotate-90"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
              Suivi des épisodes
            </summary>
            <div className="mt-3">
              <SeasonEpisodeTracker entryId={entryId ?? ''} meta={m} onChange={onChange} />
            </div>
          </details>
        </>
      )}

      {/* Film n° — pour les sagas */}
      {behavior === 'MOVIE' && (
        <Field label="Film n°">
          <div className="flex items-center gap-2">
            <NumberInput
              value={m.volume}
              placeholder="n°"
              min={1}
              onChange={(v) => set({ volume: v })}
            />
            <span className="text-text-muted/55 text-xs">/</span>
            <NumberInput
              value={m.totalVolumes}
              placeholder="total"
              min={1}
              onChange={(v) => set({ totalVolumes: v })}
            />
          </div>
        </Field>
      )}

      {/* Statut — pour livre et série. Le label change selon le type :
          - BOOK multi-tomes → "Statut du tome" + "Statut de la série"
          - BOOK mono → "Statut" (un seul)
          - SERIES → "Statut de la saison" + "Statut de la série"
          - MOVIE avec seriesName (saga) → "Statut du film" + "Statut de la saga" */}
      {(() => {
        const isBook = behavior === 'BOOK';
        const isSeries = behavior === 'SERIES';
        const isMovie = behavior === 'MOVIE';
        if (!isBook && !isSeries && !isMovie) return null;

        // Une œuvre fait-elle partie d'un groupe (saga, série multi-tomes/saisons) ?
        const isMultiTome = isBook && (!!m.volume || !!m.totalVolumes || !!m.seriesName?.trim());
        const isSaga = isMovie && !!m.seriesName?.trim();
        const hasGroup = isMultiTome || isSeries || isSaga;

        const tomeLabel = isBook ? 'Statut du tome' : isSeries ? 'Statut de la saison' : 'Statut du film';
        const groupLabel = isBook ? 'Statut de la série' : isSeries ? 'Statut de la série' : 'Statut de la saga';

        return (
          <>
            <Field label={hasGroup ? tomeLabel : 'Statut'}>
              <div className="flex gap-1.5 flex-wrap">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set({ status: m.status === opt.value ? undefined : opt.value })}
                    className={
                      'px-2 py-0.5 rounded-full text-xs border transition-colors duration-150 ' +
                      (m.status === opt.value
                        ? 'border-accent/40 bg-accent/10 text-accent'
                        : 'border-text-muted/15 text-text-muted hover:border-text-muted/30')
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </Field>
            {hasGroup && (
              <Field label={groupLabel}>
                <div className="flex gap-1.5 flex-wrap">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => set({ seriesStatus: m.seriesStatus === opt.value ? undefined : opt.value })}
                      className={
                        'px-2 py-0.5 rounded-full text-xs border transition-colors duration-150 ' +
                        (m.seriesStatus === opt.value
                          ? 'border-accent/40 bg-accent/10 text-accent'
                          : 'border-text-muted/15 text-text-muted hover:border-text-muted/30')
                      }
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </Field>
            )}
          </>
        );
      })()}

      {/* Couverture */}
      {behavior !== 'OUTING' && (
        <Field label="Couverture">
          <div className="flex items-center gap-3">
            {mv.coverUrl && (
              <img
                src={mv.coverUrl}
                alt="couverture"
                className="h-16 w-auto rounded object-cover shrink-0 shadow-sm"
              />
            )}
            <BufferedTextInput
              value={mv.coverUrl}
              placeholder="URL image…"
              onChange={(v) => set({ coverUrl: v || undefined })}
            />
          </div>
        </Field>
      )}

      {/* Résumé */}
      {behavior !== 'OUTING' && behavior !== 'MUSIC' && (
        <Field label="Résumé">
          <div className="flex flex-col gap-1.5">
            <textarea
              value={m.description ?? ''}
              placeholder="Résumé…"
              rows={3}
              onChange={(e) => set({ description: e.target.value || undefined })}
              className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted/55 outline-none border-b border-text-muted/15 focus:border-accent/40 transition-colors pb-0.5 resize-none leading-relaxed"
            />
            {/* Raccourcis pour récupérer un résumé FR depuis les sites qui n'ont
                pas d'API publique (Mangacollec / BDfugue / Amazon / Babelio).
                3 clics : ouvrir → copier → coller. */}
            {(behavior === 'BOOK' || behavior === 'MOVIE' || behavior === 'SERIES') && (() => {
              const q = m.subject ?? '';
              const isbn = m.isbn?.replace(/[-\s]/g, '');
              if (!q && !isbn) return null;
              // URLs directes des pages de recherche : le navigateur du user
              // résout naturellement les anti-bot (Cloudflare etc.). Le user
              // arrive sur une liste de résultats où il pioche le bon.
              const enc = encodeURIComponent;
              const isbnOrTitle = isbn || q;
              // Slug SEO BDfugue : titre en kebab-case (accents retirés) suivi de
              // `-tome-<n>`. Ex: "Le Jeu de la mort" T16 → /le-jeu-de-la-mort-tome-16.
              const bdfugueSlug =
                q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
                  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') +
                (m.volume ? `-tome-${m.volume}` : '');
              const links: { label: string; url: string }[] = behavior === 'BOOK'
                ? [
                  { label: 'Amazon FR', url: `https://www.amazon.fr/s?k=${enc(isbnOrTitle)}` },
                  { label: 'BDfugue', url: `https://www.bdfugue.com/${bdfugueSlug}` },
                  { label: 'Babelio', url: `https://www.babelio.com/resrecherche.php?Recherche=${enc(q)}` },
                  { label: 'Fnac', url: `https://www.fnac.com/SearchResult/ResultList.aspx?Search=${enc(isbnOrTitle)}` },
                ]
                : behavior === 'MOVIE'
                ? [
                  { label: 'Allociné', url: `https://www.allocine.fr/rechercher/movie/?q=${enc(q)}` },
                  { label: 'SensCritique', url: `https://www.senscritique.com/search?q=${enc(q)}` },
                ]
                : [
                  { label: 'SensCritique', url: `https://www.senscritique.com/search?q=${enc(q)}` },
                  { label: 'BetaSeries', url: `https://www.betaseries.com/recherche?search=${enc(q)}` },
                ];
              return (
                <div className="flex items-center gap-2 flex-wrap text-[11px]">
                  <span className="text-text-muted/50">Chercher le résumé :</span>
                  {links.map((l) => (
                    <a
                      key={l.label}
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent/70 hover:text-accent underline underline-offset-2"
                    >
                      {l.label}
                    </a>
                  ))}
                </div>
              );
            })()}
          </div>
        </Field>
      )}

      {/* Note */}
      <Field label="Note">
        <StarRating value={mv.rating} onChange={(v) => set({ rating: v })} />
      </Field>

      {/* Lien stream — Musique uniquement */}
      {behavior === 'MUSIC' && (
        <Field label="Lien">
          <div className="flex items-center gap-2">
            <BufferedTextInput
              value={mv.streamUrl}
              placeholder="YouTube, Spotify, SoundCloud, Deezer…"
              onChange={handleStreamUrlChange}
            />
            {urlMetaState === 'loading' && <span className="text-xs text-text-muted shrink-0">↻</span>}
            {urlMetaState === 'done' && <span className="text-xs text-success shrink-0">✓</span>}
          </div>
        </Field>
      )}

      {/* Paroles + traduction — Musique uniquement */}
      {behavior === 'MUSIC' && (
        <>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setLyricsOpen((o) => !o)}
              className="text-text-muted text-xs flex items-center gap-1 hover:text-text-primary transition-colors"
            >
              <span className={`inline-block transition-transform ${lyricsOpen ? 'rotate-90' : ''}`}>▸</span>
              Paroles {(mv.lyrics || mv.lyricsTranslation) && <span className="text-text-muted/55">·</span>}
              {mv.lyrics && <span className="text-text-muted/55">original</span>}
              {mv.lyrics && mv.lyricsTranslation && <span className="text-text-muted/55">+</span>}
              {mv.lyricsTranslation && <span className="text-text-muted/55">traduction</span>}
            </button>
            <button
              type="button"
              onClick={handleFetchLyrics}
              disabled={lyricsState === 'loading' || !mv.subject || !mv.creator}
              className={`text-xs transition-opacity disabled:opacity-40 hover:opacity-70 ${lyricsState === 'error' ? 'text-danger' : lyricsState === 'done' ? 'text-success' : 'text-accent'}`}
            >
              {lyricsState === 'loading' ? '↻ Recherche…' : lyricsState === 'done' ? '✓ Récupérées' : lyricsState === 'error' ? '✗ Introuvables — réessayer' : 'Récupérer'}
            </button>
          </div>
          {lyricsOpen && (
            <>
              <Field label="Original">
                <textarea
                  key={`lyrics-${safeTrackIndex}`}
                  value={mv.lyrics ?? ''}
                  placeholder="Paroles du morceau…"
                  rows={6}
                  onChange={(e) => set({ lyrics: e.target.value || undefined })}
                  className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted/55 outline-none border-b border-text-muted/15 focus:border-accent/40 transition-colors pb-0.5 resize-y leading-relaxed font-mono"
                />
              </Field>
              <Field label="Traduction">
                <textarea
                  key={`translation-${safeTrackIndex}`}
                  value={mv.lyricsTranslation ?? ''}
                  placeholder="Traduction (à saisir manuellement)…"
                  rows={6}
                  onChange={(e) => set({ lyricsTranslation: e.target.value || undefined })}
                  className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted/55 outline-none border-b border-text-muted/15 focus:border-accent/40 transition-colors pb-0.5 resize-y leading-relaxed font-mono"
                />
              </Field>
            </>
          )}
        </>
      )}

      {/* + Ajouter un autre morceau — MUSIC mono uniquement (en mode playlist, les boutons sont en haut dans les pills) */}
      {behavior === 'MUSIC' && !isMusicPlaylist && (
        <div className="flex justify-end items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => skileyInputRef.current?.click()}
            className="text-xs text-text-muted hover:text-accent transition-colors"
          >
            ⇪ Importer une playlist (.json)
          </button>
          <button
            type="button"
            onClick={addTrack}
            className="text-xs text-accent hover:opacity-70 transition-opacity"
          >
            + Ajouter un autre morceau
          </button>
        </div>
      )}
    </div>
  );
}
