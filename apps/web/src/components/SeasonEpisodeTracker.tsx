import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type MediaMeta, type SeriesSeason } from '../lib/db/schema';
import {
  cleanSeasons,
  cleanWatched,
  deriveLegacyFields,
  deriveSeriesStatus,
  seriesStats,
} from '../lib/seriesProgress';
import { fetchTVDetails, fetchTVSeasonEpisodes } from '../lib/mediaSearch';

const TMDB_KEY = import.meta.env.VITE_TMDB_API_KEY as string | undefined;
// Au-delà de ce nombre d'épisodes, on n'affiche pas la grille de pastilles
// (illisible / coûteuse) — on s'appuie sur la saisie « vu jusqu'à l'épisode N ».
const GRID_MAX = 120;

interface Props {
  /** Id de l'entrée SERIES suivie (collectionOnly ou note). */
  entryId: string;
  /** Métadonnées courantes — requises quand `onChange` est fourni (mode contrôlé,
   *  cf. MediaMetaPanel). En mode autonome, lues depuis Dexie. */
  meta?: MediaMeta | null;
  /** Si fourni, la persistance passe par ce callback (cas MediaMetaPanel, qui
   *  propage les champs series-level aux notes sœurs). Sinon écriture Dexie directe. */
  onChange?: (meta: MediaMeta) => void;
}

/**
 * Suivi saison/épisode d'une série TV — case par épisode, cochables au fil du
 * temps, sans créer de note. Source de vérité : `mediaMeta.seasonsWatched`.
 * Les champs plats (season/progressCurrent/progressTotal/totalSeasons) et le
 * statut sont dérivés à chaque écriture (cf. lib/seriesProgress.ts).
 */
export function SeasonEpisodeTracker({ entryId, meta: propMeta, onChange }: Props) {
  // En mode contrôlé (onChange fourni), la source de vérité est `propMeta` ;
  // sinon on lit l'entrée en direct depuis Dexie.
  const live = useLiveQuery(() => (onChange ? undefined : db.entries.get(entryId)), [entryId, !!onChange]);
  const meta: MediaMeta = (onChange ? propMeta : live?.mediaMeta) ?? {};
  const seasons = cleanSeasons(meta.seasonsWatched);
  const tmdbId = meta.tmdbId;

  const [open, setOpen] = useState<Set<number>>(() =>
    new Set(seasons.length <= 1 ? seasons.map((s) => s.number) : []),
  );
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const stats = seriesStats(meta);

  const commit = (nextSeasons: SeriesSeason[]) => {
    const cleaned = cleanSeasons(nextSeasons);
    const legacy = deriveLegacyFields(cleaned);
    const derived = deriveSeriesStatus(cleaned, meta.status);
    // On n'écrit le statut que s'il devient finished/ongoing (≥1 vu) — sinon on
    // ne touche pas à wishlist/owned/abandoned.
    const statusPatch =
      derived === 'finished' || derived === 'ongoing'
        ? { status: derived, seriesStatus: derived }
        : {};
    const nextMeta: MediaMeta = {
      ...meta,
      // Réinitialise les champs plats dérivés avant de réappliquer les nouveaux.
      season: undefined,
      progressCurrent: undefined,
      progressTotal: undefined,
      totalSeasons: undefined,
      ...legacy,
      ...statusPatch,
      seasonsWatched: cleaned.length ? cleaned : undefined,
    };
    if (onChange) {
      onChange(nextMeta);
    } else {
      void db.entries.update(entryId, {
        mediaMeta: nextMeta,
        updatedAt: new Date().toISOString(),
        _dirty: true,
      });
    }
  };

  const updateSeason = (number: number, patch: Partial<SeriesSeason>) =>
    commit(seasons.map((s) => (s.number === number ? { ...s, ...patch } : s)));

  // Suivi cumulatif « vu jusqu'à l'épisode N » : cliquer un épisode non-vu coche
  // tous les précédents (1→N) ; cliquer un épisode déjà vu ramène le suivi juste
  // en dessous (1→N-1). Bien plus rapide qu'un par un sur les longues séries.
  const watchUpTo = (season: SeriesSeason, ep: number) => {
    const isWatched = cleanWatched(season).includes(ep);
    const upTo = isWatched ? ep - 1 : ep;
    updateSeason(season.number, {
      watched: Array.from({ length: upTo }, (_, i) => i + 1),
    });
  };

  const toggleAll = (season: SeriesSeason) => {
    const allWatched = cleanWatched(season).length >= season.episodes && season.episodes > 0;
    updateSeason(season.number, {
      watched: allWatched ? [] : Array.from({ length: season.episodes }, (_, i) => i + 1),
    });
  };

  const addSeason = () => {
    const nextNum = seasons.length ? Math.max(...seasons.map((s) => s.number)) + 1 : 1;
    const next = [...seasons, { number: nextNum, episodes: 0, watched: [] }];
    setOpen((o) => new Set(o).add(nextNum));
    commit(next);
  };

  const removeSeason = (number: number) =>
    commit(seasons.filter((s) => s.number !== number));

  const toggleOpen = (number: number) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(number)) n.delete(number);
      else n.add(number);
      return n;
    });

  const fetchFromTmdb = () => {
    if (!tmdbId || !TMDB_KEY) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    void (async () => {
      try {
        const details = await fetchTVDetails(tmdbId, ac.signal);
        const total = details?.totalSeasons ?? 0;
        if (total <= 0) return;
        const byNum = new Map(seasons.map((s) => [s.number, s] as const));
        for (let n = 1; n <= total; n++) {
          const count = await fetchTVSeasonEpisodes(tmdbId, n, ac.signal);
          const ex = byNum.get(n);
          byNum.set(n, {
            number: n,
            episodes: count ?? ex?.episodes ?? 0,
            watched: ex?.watched ?? [],
          });
        }
        if (!ac.signal.aborted) commit([...byNum.values()]);
      } catch {
        /* silencieux : édition manuelle possible */
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
  };

  const canFetch = !!tmdbId && !!TMDB_KEY;

  return (
    <div className="flex flex-col gap-2">
      {/* En-tête + actions */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-text-muted/60">
          Saisons & épisodes
        </span>
        {stats.hasSeasons && (
          <span className="text-[11px] text-text-muted tabular-nums">
            {stats.epsWatched}/{stats.epsTotal} ép. vus
          </span>
        )}
      </div>

      {seasons.length > 0 && (
        <p className="text-[11px] text-text-muted/50 -mt-1">
          Clique un épisode : tous les précédents sont cochés automatiquement.
        </p>
      )}

      {seasons.length === 0 && (
        <p className="text-xs text-text-muted/70 leading-relaxed">
          Aucune saison renseignée.
          {canFetch
            ? ' Récupère-les depuis la fiche, ou ajoute-les manuellement.'
            : ' Ajoute une saison et son nombre d’épisodes pour cocher au fil du temps.'}
        </p>
      )}

      {seasons.map((s) => {
        const watched = cleanWatched(s);
        const isOpen = open.has(s.number);
        const allWatched = s.episodes > 0 && watched.length >= s.episodes;
        return (
          <div key={s.number} className="rounded-xl border border-text-muted/15 overflow-hidden">
            {/* Bandeau saison */}
            <div className="flex items-center gap-2 px-3 py-2 bg-text-muted/5">
              <button
                type="button"
                onClick={() => toggleOpen(s.number)}
                className="flex items-center gap-2 flex-1 min-w-0 text-left"
                aria-expanded={isOpen}
              >
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  className={'shrink-0 text-text-muted/60 transition-transform ' + (isOpen ? 'rotate-90' : '')}
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
                <span className="text-sm text-text-primary truncate">
                  {s.number === 0 ? 'Spéciaux' : `Saison ${s.number}`}
                  {s.title ? ` · ${s.title}` : ''}
                </span>
              </button>
              <span className="text-[11px] text-text-muted tabular-nums shrink-0">
                {watched.length}/{s.episodes || '—'}
              </span>
              <button
                type="button"
                onClick={() => removeSeason(s.number)}
                aria-label="Supprimer la saison"
                className="p-1 rounded-md text-text-muted/55 hover:text-red-500 hover:bg-text-muted/10 transition-colors shrink-0"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                </svg>
              </button>
            </div>

            {isOpen && (
              <div className="px-3 py-2.5 flex flex-col gap-2.5">
                {/* Nombre d'épisodes */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">Épisodes</span>
                  <EpisodeCountInput
                    value={s.episodes}
                    onChange={(v) => updateSeason(s.number, { episodes: v })}
                  />
                  {s.episodes > 0 && (
                    <button
                      type="button"
                      onClick={() => toggleAll(s)}
                      className={
                        'ml-auto px-2.5 py-1 rounded-full text-[11px] border transition-colors ' +
                        (allWatched
                          ? 'border-accent/40 bg-accent/10 text-accent'
                          : 'border-text-muted/15 text-text-muted hover:border-text-muted/30')
                      }
                    >
                      {allWatched ? 'Tout décocher' : 'Tout cocher'}
                    </button>
                  )}
                </div>

                {/* Saisie rapide « vu jusqu'à l'épisode N » — indispensable pour les
                    longues séries (ex. Conan, 1000+ ép.) où la grille n'a pas de sens. */}
                {s.episodes > 0 && (
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <span className="shrink-0">Vu jusqu'à l'ép.</span>
                    <WatchedUpToInput
                      value={watched.length}
                      max={s.episodes}
                      onSet={(n) => updateSeason(s.number, {
                        watched: Array.from({ length: Math.max(0, Math.min(n, s.episodes)) }, (_, i) => i + 1),
                      })}
                    />
                    <span className="text-text-muted/55 shrink-0">/ {s.episodes}</span>
                  </div>
                )}

                {/* Grille d'épisodes — uniquement pour les saisons de taille normale.
                    Au-delà, on s'appuie sur la saisie « vu jusqu'à » ci-dessus. */}
                {s.episodes > 0 && s.episodes <= GRID_MAX && (
                  <div className="grid grid-cols-5 sm:grid-cols-8 gap-1.5">
                    {Array.from({ length: s.episodes }, (_, i) => i + 1).map((ep) => {
                      const on = watched.includes(ep);
                      return (
                        <button
                          key={ep}
                          type="button"
                          onClick={() => watchUpTo(s, ep)}
                          aria-pressed={on}
                          aria-label={`Vu jusqu'à l'épisode ${ep}${on ? ' (déjà vu)' : ''}`}
                          className={
                            'h-10 min-w-10 rounded-lg text-xs font-medium tabular-nums border transition-colors ' +
                            (on
                              ? 'border-accent/40 bg-accent/15 text-accent'
                              : 'border-text-muted/15 text-text-muted hover:border-text-muted/30')
                          }
                        >
                          {ep}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Actions globales */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={addSeason}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-text-muted/15 text-text-muted hover:border-text-muted/30 transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Ajouter une saison
        </button>
        {canFetch && (
          <button
            type="button"
            onClick={fetchFromTmdb}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
          >
            {loading ? 'Récupération…' : 'Récupérer depuis la fiche'}
          </button>
        )}
      </div>
    </div>
  );
}

/** Petit input numérique tampon (commit au blur) pour le nombre d'épisodes. */
function EpisodeCountInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [local, setLocal] = useState(value ? String(value) : '');
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setLocal(value ? String(value) : '');
  }, [value]);
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={20000}
      value={local}
      placeholder="nb"
      onFocus={() => { focused.current = true; }}
      onBlur={() => {
        focused.current = false;
        const n = parseInt(local, 10);
        onChange(Number.isFinite(n) && n > 0 ? Math.min(20000, n) : 0);
      }}
      onChange={(e) => setLocal(e.target.value)}
      className="w-16 bg-transparent text-sm text-text-primary placeholder:text-text-muted/55 outline-none border-b border-text-muted/15 focus:border-accent/40 transition-colors pb-0.5 tabular-nums"
    />
  );
}

/** Saisie « vu jusqu'à l'épisode N » : commit au blur ou à Entrée. */
function WatchedUpToInput({ value, max, onSet }: { value: number; max: number; onSet: (n: number) => void }) {
  const [local, setLocal] = useState(value ? String(value) : '');
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setLocal(value ? String(value) : '');
  }, [value]);
  const commit = () => {
    focused.current = false;
    const n = parseInt(local, 10);
    onSet(Number.isFinite(n) && n > 0 ? Math.min(max, n) : 0);
  };
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={max}
      value={local}
      placeholder="0"
      onFocus={() => { focused.current = true; }}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      onChange={(e) => setLocal(e.target.value)}
      className="w-16 bg-transparent text-sm text-text-primary placeholder:text-text-muted/55 outline-none border-b border-text-muted/15 focus:border-accent/40 transition-colors pb-0.5 tabular-nums"
    />
  );
}
