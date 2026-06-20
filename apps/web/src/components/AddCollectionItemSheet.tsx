import { useEffect, useState } from 'react';
import { db, type LocalEntry, type MediaMeta, type MediaStatus } from '../lib/db/schema';
import { useBackButtonClose } from '../hooks/useBackButtonClose';
import { MediaSearchInput } from './MediaSearchInput';
import { searchBooks, searchMovies, searchSeries, searchMusic, fetchTVDetails, fetchTVSeasonEpisodes, type MediaSearchResult } from '../lib/mediaSearch';
import { getNoteTypeConfig, noteTint } from './NoteTypePicker';

export type AddNoteType = Extract<LocalEntry['noteType'], 'BOOK' | 'MOVIE' | 'SERIES' | 'MUSIC'>;

const TYPE_OPTIONS: { value: AddNoteType; label: string; placeholder: string; search: (q: string, signal: AbortSignal) => Promise<MediaSearchResult[]> }[] = [
  { value: 'BOOK', label: 'Livre', placeholder: 'Titre, auteur, ISBN…', search: searchBooks },
  { value: 'MOVIE', label: 'Film', placeholder: 'Titre du film…', search: searchMovies },
  { value: 'SERIES', label: 'Série', placeholder: 'Titre de la série…', search: searchSeries },
  { value: 'MUSIC', label: 'Musique', placeholder: 'Titre, artiste, album…', search: searchMusic },
];

interface Props {
  open: boolean;
  onClose: () => void;
  ownerId: string;
  onAdded?: () => void;
  /** Pré-remplit la sheet quand on l'ouvre depuis une série existante (ex: "Ajouter
   *  d'autres tomes" → seriesName, creator et tome de départ pré-définis). */
  prefill?: {
    noteType: AddNoteType;
    seriesName: string;
    creator?: string;
    startFrom: number;
  };
  /** Si vrai, rendu inline dans le panneau desktop (pas de backdrop/fixed). */
  inline?: boolean;
}

/**
 * Sheet d'ajout d'un item à la Collection. Un item de Collection est une Entry
 * avec `collectionOnly: true` : même schéma qu'une note du journal, mais masquée
 * de la Timeline/Fil tant qu'on n'a pas écrit dessus.
 * Flow :
 *  1. Choix du type (livre/film/série/musique).
 *  2. Choix du statut (Possédé / Wishlist / Terminé).
 *  3. Recherche externe + sélection, OU saisie manuelle (titre + auteur).
 *  4. Insertion locale Dexie (Entry collectionOnly, _dirty=true) → sync au prochain tick.
 */
export function AddCollectionItemSheet({ open, onClose, ownerId, onAdded, prefill, inline = false }: Props) {
  const [type, setType] = useState<AddNoteType>(prefill?.noteType ?? 'BOOK');
  const [status, setStatus] = useState<MediaStatus>('owned');
  const [query, setQuery] = useState(prefill?.seriesName ?? '');
  const [manualMode, setManualMode] = useState(false);
  const [manualTitle, setManualTitle] = useState(prefill?.seriesName ?? '');
  const [manualCreator, setManualCreator] = useState(prefill?.creator ?? '');
  // Mode "ajout en masse" — visible uniquement pour les livres (mangas, sagas).
  const [bulkMode, setBulkMode] = useState(!!prefill);
  const [bulkStart, setBulkStart] = useState(prefill?.startFrom ?? 1);
  const [bulkEnd, setBulkEnd] = useState(prefill?.startFrom ?? 1);
  const [bulkLoading, setBulkLoading] = useState(false);
  // Message inline (ex: « série déjà présente — suivi rattaché »).
  const [feedback, setFeedback] = useState<string | null>(null);

  // Resync les états avec un nouveau prefill quand la sheet est rouverte avec
  // une série différente.
  useEffect(() => {
    if (!open) return;
    if (prefill) {
      setType(prefill.noteType);
      setQuery(prefill.seriesName);
      setManualTitle(prefill.seriesName);
      setManualCreator(prefill.creator ?? '');
      setBulkMode(true);
      setBulkStart(prefill.startFrom);
      setBulkEnd(prefill.startFrom);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill?.seriesName]);

  useBackButtonClose(open, onClose);

  // Repart d'un message vierge à chaque (ré)ouverture de la sheet.
  useEffect(() => { if (open) setFeedback(null); }, [open]);

  if (!open) return null;

  const typeOpt = TYPE_OPTIONS.find((o) => o.value === type)!;
  const supportsBulk = type === 'BOOK';
  // Mode bulk : recherche API et saisie manuelle restent disponibles ; la plage
  // de tomes choisie est appliquée à tous les items créés (titre/auteur/cover
  // identiques, seriesName partagé pour le regroupement Collection).
  const effectiveManualMode = manualMode;
  const bulkActive = supportsBulk && bulkMode;
  const bulkCount = bulkActive ? Math.max(0, bulkEnd - bulkStart + 1) : 0;

  const reset = () => {
    setQuery(''); setManualMode(false); setManualTitle(''); setManualCreator('');
    setBulkMode(false); setBulkStart(1); setBulkEnd(1); setFeedback(null);
  };

  // Clé de déduplication : (série normalisée) + (volume). Une œuvre mono sans
  // volume se déduplique sur son seul titre.
  const dedupKey = (meta: MediaMeta): string => {
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const series = norm(meta.seriesName ?? meta.subject ?? '');
    return `${series}#${meta.volume ?? ''}`;
  };

  const insertItems = async (items: { meta: MediaMeta; createdAtOffset?: number }[]) => {
    const now = Date.now();
    // Déduplication : on ne recrée pas un tome déjà présent dans la collection
    // (que ce soit un item ou une vraie note du même type). Évite les doublons
    // quand on ajoute des tomes à une série existante avec une plage qui chevauche.
    const existing = await db.entries
      .filter((e) => e.deletedAt === null && e.noteType === type)
      .toArray();
    const existingKeys = new Set(existing.map((e) => dedupKey(e.mediaMeta ?? {})));
    const fresh = items.filter(({ meta }) => !existingKeys.has(dedupKey(meta)));
    if (fresh.length === 0) {
      // Tout existait déjà — rien à insérer.
      reset();
      onClose();
      return [];
    }

    // Chaque item de Collection est une Entry collectionOnly : contenu vide,
    // statut stocké dans mediaMeta.status, masquée des vues journal.
    const records: LocalEntry[] = fresh.map(({ meta, createdAtOffset = 0 }) => {
      const iso = new Date(now + createdAtOffset).toISOString();
      return {
        id: (crypto as Crypto & { randomUUID(): string }).randomUUID(),
        authorId: ownerId,
        date: iso.slice(0, 10),
        createdAt: iso,
        updatedAt: iso,
        section: null,
        title: null,
        contentMd: '',
        mood: null,
        sleepHours: null,
        weather: null,
        timeLabel: null,
        noteType: type,
        customTypeId: null,
        mediaMeta: { ...meta, status },
        font: null,
        fontSize: null,
        visibility: 'PRIVATE',
        isDraft: false,
        isForConfidant: false,
        isSecret: false,
        isAdult: false,
        adultQuestion: null,
        adultAnswerHash: null,
        adultHints: [],
        adultMercyAnswer: null,
        unlockAt: null,
        capsuleSpoiler: null,
        hideUntilAt: null,
        collectionOnly: true,
        links: null,
        commentsLocked: false,
        version: 0,
        deletedAt: null,
        tagNames: [],
        commentsCount: 0,
        _dirty: true,
      };
    });
    await db.entries.bulkPut(records);
    onAdded?.();
    reset();
    onClose();
    return records;
  };

  /**
   * Récupère en arrière-plan la liste des saisons et leur nombre d'épisodes
   * depuis TMDB et l'écrit dans `mediaMeta.seasonsWatched`. **Fusionne** avec
   * l'existant : les épisodes déjà cochés (`watched`) sont préservés par n° de
   * saison — sûr aussi bien pour un nouvel item que pour une entrée existante.
   * Non bloquant et gracieux : sans clé TMDB ou en cas d'échec, on ne touche à rien.
   */
  const populateSeasonsFromTmdb = async (entryId: string, tmdbId: number) => {
    try {
      const ac = new AbortController();
      const details = await fetchTVDetails(tmdbId, ac.signal);
      const total = details?.totalSeasons ?? 0;
      if (total <= 0) return;
      const entry = await db.entries.get(entryId);
      if (!entry) return;
      const byNum = new Map((entry.mediaMeta?.seasonsWatched ?? []).map((s) => [s.number, s] as const));
      for (let n = 1; n <= total; n++) {
        const count = await fetchTVSeasonEpisodes(tmdbId, n, ac.signal);
        const ex = byNum.get(n);
        byNum.set(n, { number: n, episodes: count ?? ex?.episodes ?? 0, watched: ex?.watched ?? [] });
      }
      await db.entries.update(entryId, {
        mediaMeta: { ...entry.mediaMeta, tmdbId, totalSeasons: total, seasonsWatched: [...byNum.values()] },
        updatedAt: new Date().toISOString(),
        _dirty: true,
      });
    } catch {
      /* gracieux : édition manuelle possible dans le détail */
    }
  };

  /**
   * Cherche une entrée SERIES déjà présente (note OU item) ayant la même clé de
   * dédup que `meta` — pour y rattacher le suivi au lieu d'ignorer l'ajout.
   */
  const findExistingSeries = async (meta: MediaMeta): Promise<LocalEntry | undefined> => {
    const key = dedupKey(meta);
    const list = await db.entries
      .filter((e) => e.deletedAt === null && e.noteType === 'SERIES')
      .toArray();
    return list.find((e) => dedupKey(e.mediaMeta ?? {}) === key);
  };

  /**
   * Point d'entrée commun (recherche + saisie manuelle). Pour une SÉRIE déjà
   * présente, rattache/rafraîchit le suivi des épisodes sur l'entrée existante
   * et prévient l'utilisateur (au lieu d'un ajout silencieusement ignoré).
   * Sinon, insertion normale (+ remplissage TMDB si série avec tmdbId).
   */
  const commitItems = async (items: { meta: MediaMeta; createdAtOffset?: number }[], tmdbId: number) => {
    if (type === 'SERIES' && items[0]) {
      const existing = await findExistingSeries(items[0].meta);
      if (existing) {
        if (Number.isFinite(tmdbId)) {
          if (!existing.mediaMeta?.tmdbId) {
            await db.entries.update(existing.id, {
              mediaMeta: { ...existing.mediaMeta, tmdbId },
              updatedAt: new Date().toISOString(),
              _dirty: true,
            });
          }
          void populateSeasonsFromTmdb(existing.id, tmdbId);
          setFeedback(existing.collectionOnly
            ? 'Cette série est déjà dans ta collection — son suivi des épisodes a été mis à jour.'
            : 'Tu as déjà des notes sur cette série — le suivi des épisodes y a été rattaché.');
        } else {
          setFeedback('Cette série est déjà présente. Ouvre-la pour suivre les épisodes saison par saison.');
        }
        onAdded?.();
        return;
      }
    }
    const created = await insertItems(items);
    if (type === 'SERIES' && Number.isFinite(tmdbId) && created.length > 0) {
      void populateSeasonsFromTmdb(created[0]!.id, tmdbId);
    }
  };

  type PerVol = { coverUrl?: string; description?: string; progressTotal?: number; isbn?: string };

  /**
   * Construit la liste d'items pour bulk : un par tome dans la plage, avec
   * `seriesName` partagé. Les champs spécifiques au tome (cover, résumé,
   * nombre de pages, ISBN) sont pris dans `perVolume` quand dispo.
   */
  const buildBulkItems = (
    base: { subject: string; creator?: string; coverUrl?: string; description?: string; progressTotal?: number; isbn?: string },
    perVolume?: Record<number, PerVol>,
  ): { meta: MediaMeta; createdAtOffset?: number }[] => {
    if (!bulkActive) {
      return [{ meta: {
        subject: base.subject,
        creator: base.creator,
        coverUrl: base.coverUrl,
        description: base.description,
        progressTotal: base.progressTotal,
        isbn: base.isbn,
      } }];
    }
    const start = Math.max(1, Math.min(99, bulkStart));
    const end = Math.max(start, Math.min(start + 99, bulkEnd));
    const total = end - start + 1;
    return Array.from({ length: total }, (_, i) => {
      const volume = start + i;
      const perVol = perVolume?.[volume];
      return {
        meta: {
          subject: base.subject,
          creator: base.creator,
          // Cover STRICTEMENT par tome : pas de fallback sur la couverture de
          // la série (sinon tous les tomes héritent de celle du tome 1).
          coverUrl: perVol?.coverUrl,
          description: perVol?.description ?? base.description,
          progressTotal: perVol?.progressTotal ?? base.progressTotal,
          isbn: perVol?.isbn,
          seriesName: base.subject,
          volume,
          totalVolumes: end,
        } as MediaMeta,
        createdAtOffset: i,
      };
    });
  };

  /**
   * En mode bulk + recherche : **une seule** requête large sur le nom de série,
   * puis matching local du numéro de tome dans le titre des résultats. Évite
   * les requêtes parasites par tome qui retournent souvent autre chose (ex:
   * "Le Jeu de la mort tome 2" → Les X-Wings Tome 2). On extrait le volume
   * via regex sur des patterns courants : `T01`, `Tome 1`, `Vol. 1`, etc.
   */
  /** Recherche Open Library directe avec limit haut — meilleure source pour
   *  les éditions par tome (titres "T01", "T02"…). En bulk on en a besoin de
   *  ~30-50 pour couvrir une saga complète. */
  const fetchBooksOLBulk = async (q: string, signal: AbortSignal): Promise<MediaSearchResult[]> => {
    try {
      const res = await fetch(
        `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=50&fields=key,title,author_name,number_of_pages_median,cover_i,isbn`,
        { signal },
      );
      if (!res.ok) return [];
      const data = await res.json() as { docs?: Record<string, unknown>[] };
      return (data.docs ?? []).map((r, i) => ({
        id: String(i),
        title: (r['title'] as string) ?? '',
        creator: (r['author_name'] as string[] | undefined)?.[0],
        coverUrl: r['cover_i']
          ? `https://covers.openlibrary.org/b/id/${r['cover_i'] as number}-L.jpg`
          : undefined,
        progressTotal: r['number_of_pages_median'] as number | undefined,
        isbn: (r['isbn'] as string[] | undefined)?.[0],
      })).filter((r) => r.title);
    } catch { return []; }
  };

  /**
   * Couvertures par tome via MangaDex — source bien plus complète qu'Open
   * Library pour les mangas (OL n'a souvent que les 1-2 premiers tomes).
   * Retourne `{ numéroDeTome: urlCouverture }`. Le manga retourné par la
   * recherche est validé contre la requête (titre OU alt-titre qui matche)
   * pour éviter de greffer des couvertures sur une série non-manga.
   */
  const fetchMangaDexCovers = async (q: string, signal: AbortSignal): Promise<Record<number, string>> => {
    const norm = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const nq = norm(q);
    if (!nq) return {};
    try {
      const mRes = await fetch(
        `https://api.mangadex.org/manga?title=${encodeURIComponent(q)}&limit=5`,
        { signal },
      );
      if (!mRes.ok) return {};
      const mData = await mRes.json() as {
        data?: { id: string; attributes: { title: Record<string, string>; altTitles: Record<string, string>[] } }[];
      };
      const manga = (mData.data ?? []).find((m) => {
        const titles = [
          ...Object.values(m.attributes.title ?? {}),
          ...(m.attributes.altTitles ?? []).flatMap((t) => Object.values(t)),
        ].map(norm);
        return titles.some((t) => t.length > 0 && (t.includes(nq) || nq.includes(t)));
      });
      if (!manga) return {};
      const cRes = await fetch(
        `https://api.mangadex.org/cover?manga%5B%5D=${manga.id}&limit=100`,
        { signal },
      );
      if (!cRes.ok) return {};
      const cData = await cRes.json() as {
        data?: { attributes: { volume: string | null; fileName: string; locale: string | null } }[];
      };
      const byVol: Record<number, { url: string; locale: string | null }> = {};
      for (const c of cData.data ?? []) {
        const { volume, fileName, locale } = c.attributes;
        if (!volume || !fileName) continue;
        const vol = parseInt(volume, 10);
        if (Number.isNaN(vol)) continue;
        const url = `https://uploads.mangadex.org/covers/${manga.id}/${fileName}.512.jpg`;
        const existing = byVol[vol];
        // Préfère une couverture localisée 'en', sinon garde la première vue.
        if (!existing || (existing.locale !== 'en' && locale === 'en')) {
          byVol[vol] = { url, locale };
        }
      }
      return Object.fromEntries(Object.entries(byVol).map(([v, x]) => [Number(v), x.url]));
    } catch { return {}; }
  };

  const fetchPerVolume = async (base: { subject: string }, start: number, end: number): Promise<Record<number, PerVol>> => {
    const ctrl = new AbortController();
    // Pour BOOK on prend OL en direct (50 résultats max) car c'est la source la
    // mieux indexée par tome. Pour les autres types on reste sur le pipeline standard.
    const allResults = type === 'BOOK'
      ? await fetchBooksOLBulk(base.subject, ctrl.signal)
      : await typeOpt.search(base.subject, ctrl.signal).catch(() => [] as MediaSearchResult[]);

    // Patterns pour extraire le numéro de tome dans le titre. Ordre = priorité.
    const tomePatterns = [
      /\bT(?:ome)?\s*0*(\d{1,3})\b/i,       // T1, T01, T001, Tome 1, Tome 01
      /\bvol(?:ume)?\.?\s*0*(\d{1,3})\b/i,  // Vol 1, Vol. 1, Volume 1
      /#\s*0*(\d{1,3})\b/,                  // #1, # 1
      /\s0*(\d{1,3})\s*$/,                  // numéro nu en fin de titre : "Boy's Abyss 01"
    ];

    const result: Record<number, PerVol> = {};
    for (const r of allResults) {
      for (const pat of tomePatterns) {
        const m = r.title.match(pat);
        if (!m || !m[1]) continue;
        const vol = parseInt(m[1], 10);
        if (vol < start || vol > end) break;
        // Premier hit gagne : les résultats sont triés par pertinence ; on évite
        // d'écraser un meilleur cover_i par un second moins bon.
        if (!result[vol]) {
          result[vol] = {
            coverUrl: r.coverUrl,
            description: r.description,
            progressTotal: r.progressTotal,
            isbn: r.isbn,
          };
        }
        break;
      }
    }

    // Manga : MangaDex couvre les tomes que Open Library ignore. La couverture
    // MangaDex prime (jeu cohérent par tome) ; OL ne sert qu'en dernier recours.
    if (type === 'BOOK') {
      const mdCovers = await fetchMangaDexCovers(base.subject, ctrl.signal).catch(() => ({} as Record<number, string>));
      for (let v = start; v <= end; v++) {
        const cover = mdCovers[v];
        if (!cover) continue;
        result[v] = { ...result[v], coverUrl: cover };
      }
    }

    return result;
  };

  /**
   * Strip les suffixes de tome (`T01`, `Tome 3`, `Vol. 2`, etc.) en fin de
   * titre. En bulk, on veut le nom de série pur — sinon le subject de chaque
   * item devient "Série T01" sur les N items.
   */
  const stripVolumeSuffix = (s: string): string => {
    // Retire un suffixe de tome avec mot-clé (`T01`, `Tome 3`, `Vol. 2`…) OU
    // un simple numéro en fin de titre ("Boy's Abyss 01"), précédé d'un
    // séparateur — donc un titre qui *commence* par un nombre n'est pas touché.
    const stripped = s
      .replace(/[\s,:;–—-]+(?:t\.?|tome|vol\.?|volume|#)?\s*0*\d{1,3}\s*$/i, '')
      .trim();
    return stripped || s;
  };

  const handleSelectResult = async (r: MediaSearchResult) => {
    if (bulkActive) {
      // En bulk : le titre devient le nom de la série (sans le numéro de tome).
      const seriesTitle = stripVolumeSuffix(r.title) || r.title;
      const base = {
        subject: seriesTitle,
        creator: r.creator,
        coverUrl: r.coverUrl,
        description: r.description,
        progressTotal: r.progressTotal,
        // ISBN d'un tome de référence (T01 souvent) — sera écrasé par perVol[i].isbn si trouvé.
        isbn: r.isbn,
      };
      setBulkLoading(true);
      try {
        const start = Math.max(1, Math.min(99, bulkStart));
        const end = Math.max(start, Math.min(start + 99, bulkEnd));
        const perVolume = await fetchPerVolume({ subject: seriesTitle }, start, end);
        await insertItems(buildBulkItems(base, perVolume));
      } finally {
        setBulkLoading(false);
      }
      return;
    }
    // Mode simple : on propage TOUT ce qu'on a — résumé, page total, ISBN.
    const items = buildBulkItems({
      subject: r.title,
      creator: r.creator,
      coverUrl: r.coverUrl,
      description: r.description,
      progressTotal: r.progressTotal,
      isbn: r.isbn,
    });
    // Pour une série, `r.id` porte l'id TMDB → on le garde pour récupérer ensuite
    // la structure saisons/épisodes.
    const tmdbId = type === 'SERIES' ? Number(r.id) : NaN;
    if (Number.isFinite(tmdbId)) items.forEach((it) => { it.meta.tmdbId = tmdbId; });
    void commitItems(items, tmdbId);
  };

  const handleManualAdd = () => {
    const subject = manualTitle.trim();
    if (!subject) return;
    // Saisie manuelle : pas de tmdbId. commitItems gère le cas « série déjà
    // présente » (message) ; sinon insertion normale.
    void commitItems(buildBulkItems({ subject, creator: manualCreator.trim() || undefined }), NaN);
  };

  // Contenu partagé entre mode inline (panneau desktop) et modal (mobile)
  const formBody = (
    <>
      {feedback && (
        <div className="px-5 pb-3">
          <p className="text-xs text-accent bg-accent/10 border border-accent/20 rounded-lg px-3 py-2 leading-relaxed">
            {feedback}
          </p>
        </div>
      )}
      {/* Type */}
      <div className="px-5 pb-3">
        <p className="text-[11px] uppercase tracking-wide text-text-muted/60 mb-1.5">Type</p>
        <div className="flex flex-wrap gap-1.5">
          {TYPE_OPTIONS.map((opt) => {
            const cfg = getNoteTypeConfig(opt.value);
            const active = type === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { setType(opt.value); reset(); }}
                className={
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors duration-150 ' +
                  (active
                    ? 'border-transparent font-medium'
                    : 'bg-transparent border-text-muted/15 text-text-muted hover:border-text-muted/30')
                }
                style={active ? { backgroundColor: noteTint(cfg.color, 13), color: cfg.color, borderColor: noteTint(cfg.color, 25) } : {}}
              >
                <cfg.Icon className="w-3.5 h-3.5 shrink-0" /> {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Statut */}
      <div className="px-5 pb-3">
        <p className="text-[11px] uppercase tracking-wide text-text-muted/60 mb-1.5">Statut</p>
        <div className="flex gap-1.5 flex-wrap">
          {([
            { v: 'owned', label: 'Possédé' },
            { v: 'wishlist', label: 'Wishlist' },
            { v: 'ongoing', label: 'En cours' },
            { v: 'finished', label: 'Terminé' },
          ] as const).map((s) => (
            <button
              key={s.v}
              type="button"
              onClick={() => setStatus(s.v)}
              className={
                'flex-1 min-w-[80px] px-3 py-2 rounded-xl text-xs border transition-colors ' +
                (status === s.v
                  ? 'border-accent/40 bg-accent/10 text-accent font-medium'
                  : 'border-text-muted/15 text-text-muted hover:border-text-muted/30')
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mode bulk — uniquement pour BOOK */}
      {supportsBulk && (
        <div className="px-5 pb-3">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={bulkMode}
              onChange={(e) => setBulkMode(e.target.checked)}
              className="mt-0.5 shrink-0 accent-accent"
            />
            <span className="text-xs text-text-primary">
              Ajouter plusieurs tomes d'un coup
              <span className="block text-[11px] text-text-muted/60 mt-0.5">
                Saisie manuelle du nom de la série + plage de tomes (ex: 1 à 25).
              </span>
            </span>
          </label>
          {bulkMode && (
            <div className="flex items-center gap-2 mt-2 ml-6">
              <span className="text-[11px] text-text-muted/70">Tomes</span>
              <input
                type="number"
                min={1}
                max={99}
                value={bulkStart}
                onChange={(e) => setBulkStart(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-20 bg-bg-primary rounded-lg px-2 py-2 text-xs text-text-primary border border-text-muted/15 outline-none focus:border-accent/40 tabular-nums"
              />
              <span className="text-[11px] text-text-muted/70">à</span>
              <input
                type="number"
                min={bulkStart}
                max={99}
                value={bulkEnd}
                onChange={(e) => setBulkEnd(Math.max(bulkStart, parseInt(e.target.value, 10) || bulkStart))}
                className="w-20 bg-bg-primary rounded-lg px-2 py-2 text-xs text-text-primary border border-text-muted/15 outline-none focus:border-accent/40 tabular-nums"
              />
              <span className="text-[11px] text-text-muted/60">
                → {Math.min(99, Math.max(0, bulkEnd - bulkStart + 1))} {Math.min(99, bulkEnd - bulkStart + 1) > 1 ? 'tomes' : 'tome'}
              </span>
              {(bulkEnd - bulkStart + 1) > 99 && (
                <span className="text-[11px] text-warning">max 99 par lot</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Recherche / saisie manuelle */}
      <div className="px-5 pb-3">
        {!effectiveManualMode ? (
          <>
            <p className="text-[11px] uppercase tracking-wide text-text-muted/60 mb-1.5">Chercher</p>
            <MediaSearchInput
              value={query}
              placeholder={bulkActive ? 'Nom de la série (ex: One Piece)' : typeOpt.placeholder}
              onSearch={typeOpt.search}
              onChange={setQuery}
              onSelect={handleSelectResult}
            />
            {bulkActive && (
              <p className="text-[11px] text-text-muted/60 mt-1.5 italic">
                {bulkLoading
                  ? `Récupération des couvertures des ${bulkCount} tomes…`
                  : `En sélectionnant un résultat, ${bulkCount} tome${bulkCount > 1 ? 's' : ''} seront créés avec recherche par tome (couvertures et résumés distincts).`}
              </p>
            )}
            <button
              type="button"
              onClick={() => setManualMode(true)}
              className="mt-2 text-[11px] text-text-muted/60 hover:text-text-primary underline underline-offset-2"
            >
              Saisir manuellement
            </button>
          </>
        ) : (
          <>
            <p className="text-[11px] uppercase tracking-wide text-text-muted/60 mb-1.5">
              {bulkActive ? 'Nom de la série' : 'Saisie manuelle'}
            </p>
            <input
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              placeholder={bulkActive ? 'Ex: One Piece' : 'Titre *'}
              className="w-full bg-bg-primary rounded-lg px-3 py-2 text-sm text-text-primary border border-text-muted/15 outline-none focus:border-accent/40 mb-2"
            />
            <input
              value={manualCreator}
              onChange={(e) => setManualCreator(e.target.value)}
              placeholder="Auteur / réalisateur / artiste"
              className="w-full bg-bg-primary rounded-lg px-3 py-2 text-sm text-text-primary border border-text-muted/15 outline-none focus:border-accent/40"
            />
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => setManualMode(false)}
                className="flex-1 px-3 py-2 rounded-xl text-sm text-text-muted hover:text-text-primary border border-text-muted/15"
              >
                Recherche
              </button>
              <button
                type="button"
                onClick={handleManualAdd}
                disabled={!manualTitle.trim()}
                className="flex-1 px-3 py-2 rounded-xl text-sm font-medium bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 disabled:opacity-40"
              >
                {bulkActive
                  ? `Ajouter ${bulkCount} tome${bulkCount > 1 ? 's' : ''}`
                  : 'Ajouter'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );

  // ── Mode inline : panneau desktop (sans backdrop ni fixed) ──────────────────
  if (inline) {
    return (
      <div className="flex flex-col h-full overflow-y-auto hide-scrollbar" role="region" aria-labelledby="add-collection-title">
        <div className="px-5 pt-5 pb-3 flex items-start justify-between shrink-0">
          <div>
            <h3 id="add-collection-title" className="text-base font-medium text-text-primary">
              Ajouter à la collection
            </h3>
            <p className="text-xs text-text-muted/70 mt-1">
              Sans créer de note. Utile pour les achats non commencés ou les envies.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted/50 hover:text-text-primary hover:bg-text-muted/10 transition-colors shrink-0 ml-3 mt-0.5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {formBody}
      </div>
    );
  }

  // ── Mode modal : bottom-sheet mobile ────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-collection-title"
    >
      <div
        className="bg-bg-elevated rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[88dvh] overflow-y-auto scrollbar-soft"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3">
          <h3 id="add-collection-title" className="text-base font-medium text-text-primary">
            Ajouter à la collection
          </h3>
          <p className="text-xs text-text-muted/70 mt-1">
            Sans créer de note. Utile pour les achats non commencés ou les envies.
          </p>
        </div>
        {formBody}
        <button
          type="button"
          onClick={onClose}
          className="w-full text-xs text-text-muted/60 hover:text-text-primary py-3 border-t border-text-muted/10 mt-2"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
