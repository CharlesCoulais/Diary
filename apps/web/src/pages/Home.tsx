import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { trpc } from '../lib/trpc';
import { db, type LocalEntry } from '../lib/db/schema';
import { useSyncContext } from '../lib/sync/SyncProvider';
// useTheme + usePinContext consommés par OwnerTopBar — plus d'import local.
import { useDropdownAlign } from '../lib/useDropdownAlign';
import { isoToday, shiftDate, formatDateLong, relativeLabel, formatDateKicker } from '../lib/dateHelpers';
import { OwnerTopBar } from '../components/OwnerTopBar';
import { WritingIdeasPanel } from '../components/WritingIdeasPanel';
import { BottomNav } from '../components/BottomNav';
import { BackToTop } from '../components/BackToTop';
import { EntryCard } from '../components/EntryCard';
import { BulkActionBar, type BulkAction } from '../components/BulkActionBar';
import { NOTE_TYPE_CONFIG, getNoteTypeConfig } from '../components/NoteTypePicker';
import type { NoteType } from '../components/NoteTypePicker';
import { TypeFilterButton, VisibilityFilterButton, SectionFilterButton, TagFilterButton, MoodFilterButton, ReadGateFilterButton, CapsuleFilterButton, FavoritesFilterButton, collectAvailableMoods, ratingMatchesFilter, type ReadGateStatus, type CapsuleStatus } from '../components/EntryFilters';
import { useCollapsibleSection } from '../hooks/useCollapsibleSection';
import { useTrackPageHeaderHeight } from '../hooks/useTrackPageHeaderHeight';
import { ChevronToggle } from '../components/ChevronToggle';
import { getOwnerDisplayPrefs, subscribeOwnerPrefs, type SortMode as PrefsSortMode } from '../lib/displayPrefs';
import { OnThisDay } from '../components/OnThisDay';
import { DailyTracker } from '../components/DailyTracker';
import { CalendarPanel } from '../components/DatePicker';

// ── Section sort weight ──────────────────────────────────────────────────────
const SECTION_TIME: Record<string, string> = {
  MORNING:       '06:00',
  LATE_MORNING:  '10:00',
  NOON:          '12:00',
  AFTERNOON:     '14:00',
  LATE_AFTERNOON:'16:00',
  EARLY_EVENING: '18:00',
  EVENING:       '20:00',
  NIGHT:         '22:00',
  FREE:          '23:50',
};

function entrySortKey(entry: LocalEntry): string {
  if (entry.timeLabel) return entry.timeLabel;
  if (entry.section) return SECTION_TIME[entry.section] ?? '23:59';
  return new Date(entry.createdAt).toTimeString().slice(0, 8);
}

// Le type vit dans `lib/displayPrefs.ts` (pour pouvoir le référencer depuis
// les prefs sans créer de dépendance circulaire avec une page React).
// Ré-export pour conserver la compat avec Timeline / GuestHome qui importent
// `SortMode` depuis Home.
export type SortMode = PrefsSortMode;

export const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'time-desc',    label: 'Heure ↓' },
  { value: 'time-asc',     label: 'Heure ↑' },
  { value: 'updated-desc', label: 'Modifié ↓' },
  { value: 'updated-asc',  label: 'Modifié ↑' },
];

/**
 * Vrai si le tri courant est basé sur `updatedAt`. Quand c'est le cas,
 * la Timeline et le journal du confident passent en **liste plate** (sans
 * regroupement par date) — sinon une note du 18 mai modifiée aujourd'hui
 * resterait coincée dans la section « 18 mai » et le tri serait invisible.
 */
export function isUpdatedSort(mode: SortMode): boolean {
  return mode === 'updated-desc' || mode === 'updated-asc';
}

function sortEntries(entries: LocalEntry[], mode: SortMode): LocalEntry[] {
  return [...entries].sort((a, b) => {
    // Tie-breaker : on aligne la direction du `createdAt` sur la direction du
    // tri principal. Quand plusieurs notes ont le même créneau (« Partie 1 »,
    // « Partie 2 », « Partie 3 » toutes en MORNING) :
    //   - tri descendant → Partie 3 au-dessus de Partie 1 (récent en haut)
    //   - tri ascendant  → Partie 1 au-dessus de Partie 3 (chronologique)
    const isDesc = mode === 'time-desc' || mode === 'updated-desc';
    const createdTie = isDesc
      ? b.createdAt.localeCompare(a.createdAt)
      : a.createdAt.localeCompare(b.createdAt);

    if (mode === 'time-desc') {
      const cmp = entrySortKey(b).localeCompare(entrySortKey(a));
      return cmp !== 0 ? cmp : createdTie;
    }
    if (mode === 'time-asc') {
      const cmp = entrySortKey(a).localeCompare(entrySortKey(b));
      return cmp !== 0 ? cmp : createdTie;
    }
    if (mode === 'updated-desc') {
      const cmp = b.updatedAt.localeCompare(a.updatedAt);
      return cmp !== 0 ? cmp : createdTie;
    }
    // updated-asc
    const cmp = a.updatedAt.localeCompare(b.updatedAt);
    return cmp !== 0 ? cmp : createdTie;
  });
}

/** Liste des modes encore valides — utilisé pour ignorer les valeurs obsolètes en localStorage. */
const VALID_SORT_MODES = new Set<SortMode>(SORT_OPTIONS.map((o) => o.value));

export function useSortMode(key: string, defaultMode: SortMode): [SortMode, (m: SortMode) => void] {
  const [mode, setMode] = useState<SortMode>(() => {
    const stored = localStorage.getItem(key);
    // Migration : `created-desc` / `created-asc` ne sont plus exposés (redondants
    // avec `updated-*`). On les remplace par le mode `Modifié` correspondant.
    if (stored === 'created-desc') return 'updated-desc';
    if (stored === 'created-asc') return 'updated-asc';
    return (stored && VALID_SORT_MODES.has(stored as SortMode)) ? (stored as SortMode) : defaultMode;
  });
  const set = (m: SortMode) => { setMode(m); localStorage.setItem(key, m); };
  return [mode, set];
}

export function SortPicker({ mode, onChange }: { mode: SortMode; onChange: (m: SortMode) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { panelRef, panelStyle } = useDropdownAlign(open);
  const current = SORT_OPTIONS.find((o) => o.value === mode)!;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-text-muted border border-text-muted/15 rounded-lg px-2.5 py-1.5 hover:text-text-primary transition-colors whitespace-nowrap"
        aria-label="Ordre de tri"
      >
        {current.label}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div ref={panelRef} style={panelStyle} className="absolute right-0 top-full mt-1.5 z-20 bg-bg-elevated border border-text-muted/[0.12] rounded-xl shadow-lg overflow-hidden min-w-[120px]">
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                mode === o.value
                  ? 'text-accent bg-accent/8 font-medium'
                  : 'text-text-muted hover:text-text-primary hover:bg-text-muted/8'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Date helpers ─────────────────────────────────────────────────────────────
// Date helpers consolidés dans `lib/dateHelpers.ts` (utilisés aussi par
// GuestDay, Timeline, etc.). Pas de wrapper local : import direct.

// (SunIcon / MoonIcon retirés — l'icône thème vit dans OwnerTopBar.)

// ── Composant ────────────────────────────────────────────────────────────────
export function HomePage() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { data: user } = trpc.auth.me.useQuery();
  const { sync, syncing } = useSyncContext();
  // theme + PIN gérés par OwnerTopBar (qui les consomme directement via les
  // contexts) — Home n'en a plus besoin localement.
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  // pendingCount (badge demandes) géré par OwnerTopBar — pas besoin local.

  const [searchParams, setSearchParams] = useSearchParams();
  const today = isoToday();
  const [selectedDate, setSelectedDate] = useState(() => searchParams.get('date') ?? today);
  const isToday = selectedDate === today;
  const [typeFilter, setTypeFilter] = useState<NoteType[]>(() => getOwnerDisplayPrefs().defaultTypes);
  const [hideDrafts, setHideDrafts] = useState(() => getOwnerDisplayPrefs().hideDrafts);
  const [hideAdult, setHideAdult] = useState(() => getOwnerDisplayPrefs().hideAdult);
  const [hideMyForgotten, setHideMyForgotten] = useState(() => getOwnerDisplayPrefs().hideMyForgotten);
  // Page Aujourd'hui (owner) → utilise `compactToday` comme **défaut** (persisté
  // dans les réglages). Le toggle dans la barre de filtres est un override
  // purement local à la session : il ne réécrit PAS le réglage par défaut.
  // Au remount (nav back, reload), on repart toujours du défaut configuré.
  const [compactMode, setCompactMode] = useState(() => getOwnerDisplayPrefs().compactToday);
  const toggleCompactMode = useCallback(() => setCompactMode((v) => !v), []);
  // Synchro robuste — same-tab (Réglages), cross-tab (storage event), bfcache
  // (Android PWA / iOS Safari qui restaurent la page sans re-monter React).
  // Refresh tous les états dérivés des prefs (pas seulement compactMode), sinon
  // les autres réglages ne seraient pas appliqués après changement.
  useEffect(() => subscribeOwnerPrefs(() => {
    const p = getOwnerDisplayPrefs();
    setCompactMode(p.compactToday);
    setHideDrafts(p.hideDrafts);
    setHideAdult(p.hideAdult);
    setHideMyForgotten(p.hideMyForgotten);
    setTypeFilter(p.defaultTypes);
  }), []);
  const [filtersCollapsed, toggleFiltersCollapsed] = useCollapsibleSection('home', 'mobile');
  const { mobileRef: headerMobileRef, desktopRef: headerDesktopRef } = useTrackPageHeaderHeight();
  const [adultOnly, setAdultOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [sectionFilter, setSectionFilter] = useState<string[]>([]);
  const [moodFilter, setMoodFilter] = useState<string[]>([]);
  const [draftFilter, setDraftFilter] = useState(false);
  const [secretFilter, setSecretFilter] = useState(false);
  const [forConfidantFilter, setForConfidantFilter] = useState(false);
  // Filtre « Favoris » : dropdown à 4 états (null / any / mine / others).
  // - null    : pas de filtre
  // - any     : au moins une notation FAVORITE (n'importe qui)
  // - mine    : moi (owner) ai marqué FAVORITE
  // - others  : un confident a marqué FAVORITE
  const [favoritesFilter, setFavoritesFilter] = useState<'any' | 'mine' | 'others' | null>(null);
  const [visibilityFilter, setVisibilityFilter] = useState<LocalEntry['visibility'] | null>(null);
  // null = pas de filtre, 'read' = uniquement les lus par confident, 'unread' = uniquement les non-lus (parmi les partageables)
  const [confidantReadFilter, setConfidantReadFilter] = useState<'read' | 'unread' | null>(null);
  // Statuts des verrous de lecture (multi-select OR ; [] = pas de filtre).
  const [readGateFilter, setReadGateFilter] = useState<ReadGateStatus[]>([]);
  // Statuts des capsules temporelles (scellée/ouverte). Filtre du jour courant.
  const [capsuleStatusFilter, setCapsuleStatusFilter] = useState<CapsuleStatus[]>([]);
  const [newEntryId, setNewEntryId] = useState<string | null>(null);
  // Aujourd'hui garde son tri persisté dans localStorage (clé `journal-sort`).
  // Le réglage "tri par défaut" des Réglages ne concerne **que** Journal /
  // Timeline (cf. Timeline.tsx et GuestHome.tsx) — l'écran du jour reste sur
  // le choix de l'utilisateur de session en session.
  const [sortMode, setSortMode] = useSortMode('journal-sort', 'time-desc');
  const focusedEntryId = searchParams.get('entryId');
  const focusedCommentId = searchParams.get('commentId') ?? undefined;
  const newEntryParam = searchParams.get('newEntry');

  const [capsuleFilter, setCapsuleFilter] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: confidantReadIdsData = [] } = trpc.entries.confidantReadIds.useQuery(undefined, {
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  // Statuts agrégés des réponses aux verrous (par entryId).
  const { data: readGateStatusesData = {} } = trpc.readGate.statusesForOwner.useQuery(undefined, {
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const { data: pendingRequestsList = [] } = trpc.topicRequests.list.useQuery(
    { status: 'PENDING', limit: 8 },
    { staleTime: 60_000, enabled: isToday && user?.role === 'OWNER' },
  );
  const confidantReadSet = new Set(confidantReadIdsData);

  // `rawEntriesRaw` peut être `undefined` tant que Dexie n'a pas résolu la query.
  // On le garde tel quel pour distinguer "en cours de chargement" (undefined) de
  // "résolu mais vide" ([]) — c'est crucial pour le fallback serveur ci-dessous,
  // qui sinon se déclenche pendant le chargement initial et écrase les données.
  const rawEntriesRaw = useLiveQuery(
    () =>
      db.entries
        // collectionOnly exclu : les items de Collection ne sont pas des notes du journal.
        .filter((e) => e.date === selectedDate && e.deletedAt === null && !e.collectionOnly)
        .toArray(),
    [selectedDate],
  );
  const rawEntries = rawEntriesRaw ?? [];

  // Fallback serveur : si une date passée n'a aucune entrée locale (nouveau device,
  // entrée créée ailleurs…), on fetch depuis le serveur et on hydrate l'IndexedDB.
  const fetchedDates = useRef(new Set<string>());
  useEffect(() => {
    if (isToday) return;                          // aujourd'hui : le sync normal suffit
    if (rawEntriesRaw === undefined) return;      // Dexie pas encore résolu : on attend
    if (rawEntriesRaw.length > 0) return;         // déjà des données locales
    if (fetchedDates.current.has(selectedDate)) return; // déjà tenté pour cette date
    fetchedDates.current.add(selectedDate);

    utils.entries.list.fetch({ date: selectedDate, limit: 50 }).then(async (serverEntries: any[]) => {
      if (!serverEntries.length) return;
      const toUpsert = serverEntries.map((e) => ({
        id: e.id,
        authorId: e.authorId,
        date: e.date.slice(0, 10),
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        section: e.section,
        title: e.title,
        contentMd: e.contentMd,
        mood: e.mood,
        sleepHours: e.sleepHours,
        weather: e.weather,
        timeLabel: e.timeLabel ?? null,
        noteType: e.noteType as LocalEntry['noteType'],
        mediaMeta: (e.mediaMeta ?? null) as LocalEntry['mediaMeta'],
        font: e.font ?? null,
        fontSize: (e as any).fontSize ?? null,
        visibility: e.visibility as LocalEntry['visibility'],
        isDraft: e.isDraft,
        isForConfidant: e.isForConfidant,
        isSecret: e.isSecret,
        isAdult: (e as any).isAdult ?? false,
        adultQuestion: (e as any).adultQuestion ?? null,
        adultAnswerHash: (e as any).adultAnswerHash ?? null,
        adultHints: (e as any).adultHints ?? [],
        adultMercyAnswer: (e as any).adultMercyAnswer ?? null,
        unlockAt: (e as any).unlockAt ?? null,
        capsuleSpoiler: (e as any).capsuleSpoiler ?? null,
        hideUntilAt: (e as any).hideUntilAt ?? null,
        collectionOnly: (e as any).collectionOnly ?? false,
        links: (e.links ?? null) as LocalEntry['links'],
        commentsLocked: e.commentsLocked,
        version: e.version,
        deletedAt: null,
        // Les tags viennent du serveur via `entries.list` (ENTRY_SELECT inclut
        // la jointure `tags` qui est aplatie en `tagNames` côté router). Si on
        // forçait `[]` ici, on écraserait les tags réellement stockés en base
        // chaque fois que ce fallback se déclenche — bug observé en prod.
        tagNames: (e.tagNames as string[] | undefined) ?? [],
        commentsCount: e._count?.comments ?? 0,
        _dirty: false,
      } as LocalEntry));
      await db.entries.bulkPut(toUpsert);
    }).catch(() => null);
  }, [selectedDate, isToday, rawEntriesRaw]);

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [selectedDate]);

  // ── Desktop 3-column : entry read panel ───────────────────────────────────
  const [isDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);
  const [activeDesktopEntryId, setActiveDesktopEntryId] = useState<string | null>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 1024
      ? new URLSearchParams(window.location.search).get('entryId')
      : null,
  );
  // Le panel a été ouvert via la bulle 💬 → lecture scrollée sur les commentaires.
  const [desktopOpenToComments, setDesktopOpenToComments] = useState(false);
  // Reset panel when date changes — sauf si on navigue vers une entrée précise
  // (focusedEntryId / newEntryParam), auquel cas le panel sera positionné par l'effet dédié.
  useEffect(() => {
    if (focusedEntryId || newEntryParam) return;
    setActiveDesktopEntryId(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // Re-clic sur « Aujourd'hui » dans la nav : comme c'est la route active, le
  // router ne remonte pas HomePage et le panneau desktop resterait ouvert sur la
  // dernière note. Le lien émet donc cet event pour forcer la fermeture + retour
  // au jour courant.
  useEffect(() => {
    const reset = () => { setActiveDesktopEntryId(null); setSelectedDate(today); };
    window.addEventListener('home:reset-today', reset);
    return () => window.removeEventListener('home:reset-today', reset);
  }, [today]);

  const draftCount = useLiveQuery(
    () => db.entries.filter((e) => !!e.isDraft && !e.deletedAt && !e.collectionOnly).count(),
    [],
  ) ?? 0;

  // ── Capsule filter : toutes les capsules de l'IndexedDB local ─────────────
  const allCapsules = useLiveQuery(
    () => db.entries.filter((e) => !!e.unlockAt && !e.deletedAt).toArray(),
    [],
  ) ?? [];
  const now = new Date();
  const capsulesLocked = allCapsules.filter((e) => new Date(e.unlockAt!) > now).sort((a, b) => a.unlockAt!.localeCompare(b.unlockAt!));
  const capsulesUnlocked = allCapsules.filter((e) => new Date(e.unlockAt!) <= now).sort((a, b) => b.unlockAt!.localeCompare(a.unlockAt!));

  // Si l'utilisateur arrive via une notif push (`?entryId=...`), l'entrée
  // ciblée doit être visible quel que soit l'état des filtres — sinon clic
  // sur la notif aboutit à une page "vide" si l'entrée ne matche pas le
  // filtre par défaut (ex: brouillons masqués alors que la notif pointe sur
  // un brouillon). On bypass tous les filtres pour cette entrée précise.
  const passesFilters = (e: LocalEntry): boolean => {
    if (!(!hideDrafts || !e.isDraft)) return false;
    if (!(adultOnly ? e.isAdult : (!hideAdult || !e.isAdult))) return false;
    // « À oublier » : masque silencieusement si l'utilisateur courant a
    // posé une rating LOW dessus (et que la pref est activée).
    // Home n'a pas de pill « À oublier » explicite (seulement Favoris) ;
    // pour voir ses LOW depuis ici, il faut désactiver la pref dans Réglages.
    if (hideMyForgotten && user?.id) {
      const mine = (e.ratings ?? []).find((r) => r.userId === user.id);
      if (mine?.value === 'LOW') return false;
    }
    if (!(typeFilter.length === 0 || typeFilter.includes(e.noteType))) return false;
    if (!(!visibilityFilter || e.visibility === visibilityFilter)) return false;
    if (!(sectionFilter.length === 0 || (!!e.section && sectionFilter.includes(e.section)))) return false;
    if (!(tagFilter.length === 0 || tagFilter.some((t) => (e.tagNames ?? []).includes(t)))) return false;
    if (moodFilter.length > 0) {
      if (!e.mood) return false;
      const seg = new Intl.Segmenter();
      const graphemes = [...seg.segment(e.mood)].map((s) => s.segment).filter((s) => s.trim());
      if (!moodFilter.some((m) => graphemes.includes(m))) return false;
    }
    if (draftFilter && !e.isDraft) return false;
    if (secretFilter && !e.isSecret) return false;
    if (forConfidantFilter && !e.isForConfidant) return false;
    // Filtre favoris — logique centralisée dans `ratingMatchesFilter`
    // (partagée avec `applyFilters`) pour éviter le drift documenté à
    // l'audit Sprint 2.
    if (!ratingMatchesFilter(e, favoritesFilter, 'FAVORITE', user?.id)) return false;
    if (readGateFilter.length > 0) {
      if (!e.readGatePrompt) return false;
      const statuses = (readGateStatusesData[e.id] ?? []) as ReadGateStatus[];
      if (statuses.length === 0) {
        if (!readGateFilter.includes('unanswered')) return false;
      } else if (!readGateFilter.some((s) => statuses.includes(s))) return false;
    }
    if (capsuleStatusFilter.length > 0) {
      if (!e.unlockAt) return false;
      const status: CapsuleStatus = new Date(e.unlockAt).getTime() <= Date.now() ? 'unlocked' : 'locked';
      if (!capsuleStatusFilter.includes(status)) return false;
    }
    if (confidantReadFilter) {
      const isRead = confidantReadSet.has(e.id);
      if (confidantReadFilter === 'read') {
        if (!isRead) return false;
      } else {
        if (e.isSecret || isRead) return false;
      }
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchSearch = e.contentMd.toLowerCase().includes(q)
        || (e.title?.toLowerCase().includes(q) ?? false)
        || (e.mediaMeta?.subject?.toLowerCase().includes(q) ?? false)
        || (e.mediaMeta?.creator?.toLowerCase().includes(q) ?? false)
        || (e.tagNames ?? []).some((t) => t.toLowerCase().includes(q));
      if (!matchSearch) return false;
    }
    return true;
  };
  const filtered = rawEntries.filter(
    (e) => passesFilters(e) || (focusedEntryId !== null && e.id === focusedEntryId),
  );
  const entries = sortEntries(filtered, sortMode);
  const activeDesktopEntry = entries.find((e) => e.id === activeDesktopEntryId) ?? null;

  // FAB "+" depuis le BottomNav → créer une nouvelle note et effacer le param
  const createParam = searchParams.get('create');
  useEffect(() => {
    if (createParam !== '1' || !user) return;
    setSearchParams((prev) => { prev.delete('create'); return prev; }, { replace: true });
    handleNewEntry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createParam, user?.id]);

  // When navigating to a specific entry from another page, switch to its date first
  useEffect(() => {
    if (!focusedEntryId) return;
    db.entries.get(focusedEntryId).then((e) => {
      if (e && e.date && e.date !== selectedDate) setSelectedDate(e.date);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedEntryId]);

  // Quand on promeut un item de Collection en note (param ?newEntry=<id>) :
  // - setNewEntryId immédiatement (avant que entries charge) pour que l'EntryCard
  //   monte directement avec autoFocus=true
  // - switch de date si nécessaire
  // - panneau droit desktop uniquement
  useEffect(() => {
    if (!newEntryParam) return;
    setNewEntryId(newEntryParam);
    if (window.innerWidth >= 1024) setActiveDesktopEntryId(newEntryParam);
    db.entries.get(newEntryParam).then((e) => {
      if (e && e.date && e.date !== selectedDate) setSelectedDate(e.date);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newEntryParam]);

  // Ouvre le panneau droit desktop immédiatement dès qu'un entryId est dans l'URL.
  // activeDesktopEntry sera null tant que entries ne contient pas encore l'entrée,
  // mais dès qu'elle charge le panel s'affiche automatiquement.
  useEffect(() => {
    if (!focusedEntryId) return;
    if (window.innerWidth >= 1024) setActiveDesktopEntryId(focusedEntryId);
  }, [focusedEntryId]);

  const scrolledToRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusedEntryId || scrolledToRef.current === focusedEntryId) return;
    const el = document.getElementById(`entry-${focusedEntryId}`);
    if (el) {
      scrolledToRef.current = focusedEntryId;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [focusedEntryId, entries]);

  const scrolledNewRef = useRef<string | null>(null);
  useEffect(() => {
    if (!newEntryId || scrolledNewRef.current === newEntryId) return;
    const el = document.getElementById(`entry-${newEntryId}`);
    if (el) {
      scrolledNewRef.current = newEntryId;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [newEntryId, entries]);

  // (logout déplacé dans OwnerTopBar — plus utilisé localement)

  const handleNewEntry = async () => {
    if (!user) return;
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const currentTime = `${String(nowDate.getHours()).padStart(2, '0')}:${String(nowDate.getMinutes()).padStart(2, '0')}`;
    const id = crypto.randomUUID();
    setNewEntryId(id);
    // Sur desktop, ouvrir directement dans le panel droit
    if (window.innerWidth >= 1024) setActiveDesktopEntryId(id);
    await db.entries.put({
      id,
      authorId: user.id,
      date: selectedDate,
      createdAt: now,
      updatedAt: now,
      section: null,
      title: null,
      contentMd: '',
      mood: null,
      sleepHours: null,
      weather: null,
      timeLabel: currentTime,
      noteType: 'JOURNAL',
      customTypeId: null,
      mediaMeta: null,
      font: null,
      fontSize: null,
      visibility: 'PRIVATE',
      isDraft: true,
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
      collectionOnly: false,
      links: null,
      commentsLocked: false,
      version: 0,
      deletedAt: null,
      tagNames: [],
      commentsCount: 0,
      _dirty: true,
    });
    sync();
  };

  const handleBulkApply = async (action: BulkAction) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    const base = { updatedAt: now, _dirty: true as const };
    switch (action.type) {
      case 'draft':
        // En bulk, on publie/retourne en brouillon directement (pas de picker individuel).
        // On efface le minuteur dans les deux sens pour rester cohérent.
        await db.entries.where('id').anyOf(ids).modify({ isDraft: action.value, hideUntilAt: null, ...base });
        break;
      case 'visibility':
        await db.entries.where('id').anyOf(ids).modify({ visibility: action.value, ...base });
        break;
      case 'confidant':
        await db.entries.where('id').anyOf(ids).modify({ isForConfidant: action.value, ...base });
        break;
      case 'mood':
        await db.entries.where('id').anyOf(ids).modify({ mood: action.value, ...base });
        break;
      case 'addTag':
        await db.entries.where('id').anyOf(ids).modify((e: LocalEntry) => {
          e.tagNames = [...new Set([...(e.tagNames ?? []), action.tag])];
          e.updatedAt = now;
          e._dirty = true;
        });
        break;
      case 'removeTag':
        await db.entries.where('id').anyOf(ids).modify((e: LocalEntry) => {
          e.tagNames = (e.tagNames ?? []).filter((t) => t !== action.tag);
          e.updatedAt = now;
          e._dirty = true;
        });
        break;
    }
    sync();
  };

  return (
    // Scroll desktop indépendant par colonne : outer en `h-screen
    // overflow-hidden`, chaque colonne gère son propre scroll vertical.
    // Sur mobile (< lg), comportement classique (scroll de la page entière).
    <div className="min-h-dvh px-6 pb-48 sm:pb-56 max-w-2xl mx-auto overflow-x-clip lg:max-w-none lg:px-0 lg:pb-0 lg:flex lg:items-start lg:h-screen lg:overflow-hidden">
    {/* Left column — journal content (scrollable indépendant en desktop) */}
    <div className={`lg:px-12 lg:pb-16 lg:h-full lg:overflow-y-auto lg:overflow-x-hidden lg:min-w-0 hide-scrollbar ${activeDesktopEntryId ? 'lg:w-[520px] lg:shrink-0' : 'lg:flex-1'}`}>

      {/* ── Header sticky : kicker + avatar + navigation date (mobile) ─────── */}
      <div ref={headerMobileRef} className="lg:hidden sticky top-0 z-[11] -mx-6 px-6 pt-5 pb-6 mb-8 bg-bg-primary/90 backdrop-blur-sm">

        {/* Ligne 1 : kicker · sync · avatar */}
        <div className="flex items-center justify-between mb-3">
          <p className="font-mono text-[11px] tracking-widest uppercase text-text-muted/50 select-none">
            {formatDateKicker(selectedDate)}
          </p>
          <div className="flex items-center gap-2">
            <span
              role="status"
              aria-label={syncing ? 'Synchronisation…' : undefined}
              className={`text-xs text-text-muted/55 leading-none ${syncing ? 'inline-block animate-spin' : 'invisible'}`}
            >↻</span>
            {/* Menu avatar Owner — partagé avec les autres pages via OwnerTopBar.
                Le bloc historique (lock + avatar + menu inline) qui vivait ici
                divergeait (manquait Aujourd'hui / Journal / Fil / Centre d'aide),
                ce qui posait souci notamment sur /aujourd-hui où HomePage est
                rendu et où l'utilisateur attendait la même navigation que partout
                ailleurs. Désormais on délègue à OwnerTopBar (source unique). */}
            <OwnerTopBar />
          </div>
        </div>

        {/* Ligne 2 : navigation date */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
            aria-label="Jour précédent"
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          {/* Label cliquable → date picker custom */}
          <div className="relative flex-1 text-center">
            <h1 className="font-serif text-4xl text-text-primary capitalize tracking-tight">
              <button
                type="button"
                onClick={() => setDatePickerOpen((v) => !v)}
                aria-haspopup="dialog"
                aria-expanded={datePickerOpen}
                aria-label="Changer de date"
                className="select-none hover:text-accent transition-colors"
              >
                {relativeLabel(selectedDate, today) ?? formatDateLong(selectedDate)}
              </button>
            </h1>
            {isToday && entries.length === 0 && !syncing && (
              <p className="font-serif italic text-text-muted/60 text-base mt-1">
                Rien encore. Commence quand tu veux.
              </p>
            )}
            {datePickerOpen && (
              <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50">
                <CalendarPanel
                  value={selectedDate}
                  onChange={(v) => { if (v) setSelectedDate(v); }}
                  onClose={() => setDatePickerOpen(false)}
                  max={today}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
              disabled={isToday}
              aria-label="Jour suivant"
              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            {!isToday && (
              <button
                onClick={() => setSelectedDate(today)}
                className="text-xs text-accent hover:opacity-80 transition-opacity whitespace-nowrap px-1"
              >
                Auj.
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Header desktop : kicker + titre centré + navigation date ─────────── */}
      <div ref={headerDesktopRef} className={`hidden lg:flex items-center gap-4 sticky top-0 z-[11] -mx-12 px-12 bg-bg-primary/90 backdrop-blur-sm ${activeDesktopEntryId ? 'pt-5 pb-3 mb-1' : 'pt-10 pb-4 mb-2'}`}>
        <button
          onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
          aria-label="Jour précédent"
          className="p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors shrink-0"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="relative flex-1 text-center">
          <p className={`font-mono text-[11px] tracking-widest uppercase text-text-muted/50 select-none text-left ${activeDesktopEntryId ? 'mb-1' : 'mb-3'}`}>
            {formatDateKicker(selectedDate)}
          </p>
          <h1 className={`font-serif text-text-primary capitalize tracking-tight ${activeDesktopEntryId ? 'text-3xl' : 'text-7xl'}`}>
            <button
              type="button"
              onClick={() => setDatePickerOpen((v) => !v)}
              aria-haspopup="dialog"
              aria-expanded={datePickerOpen}
              aria-label="Changer de date"
              className="select-none hover:text-accent transition-colors"
            >
              {relativeLabel(selectedDate, today) ?? formatDateLong(selectedDate)}
            </button>
          </h1>
          {datePickerOpen && (
            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50">
              <CalendarPanel
                value={selectedDate}
                onChange={(v) => { if (v) setSelectedDate(v); }}
                onClose={() => setDatePickerOpen(false)}
                max={today}
              />
            </div>
          )}
          {isToday && entries.length === 0 && !syncing && !activeDesktopEntryId && (
            <p className="font-serif italic text-text-muted/60 text-xl mt-3">
              Rien encore. Commence quand tu veux.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
            disabled={isToday}
            aria-label="Jour suivant"
            className="p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          {!isToday && (
            <button
              onClick={() => setSelectedDate(today)}
              className="text-xs text-accent hover:opacity-80 transition-opacity whitespace-nowrap px-1"
            >
              Auj.
            </button>
          )}
        </div>
      </div>

      {/* Tracker du jour — owner uniquement */}
      {user?.role === 'OWNER' && <DailyTracker date={selectedDate} centered={!!activeDesktopEntryId} />}

      {/* Notes à venir — capture rapide d'idées d'écriture, owner uniquement,
          visible sur le jour courant seulement (sinon ça polluerait la
          navigation dans le passé). */}
      {isToday && user?.role === 'OWNER' && user.id && (
        <WritingIdeasPanel ownerId={user.id} />
      )}

      {/* Souvenirs — mobile : liste, desktop : cartes horizontales */}
      {isToday && user?.role === 'OWNER' && (
        <>
          <div className="lg:hidden">
            <OnThisDay />
          </div>
          <div className="hidden lg:block">
            <OnThisDay variant="cards" />
          </div>
        </>
      )}

      {/* Demandes en attente — desktop uniquement, aujourd'hui, owner */}
      {isToday && user?.role === 'OWNER' && pendingRequestsList.length > 0 && (
        <div className="hidden lg:block mb-8">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-serif italic text-2xl text-text-primary">
              {pendingRequestsList[0]?.author.displayName ?? 'Quelqu\'un'} t'a demandé
            </h2>
            <Link
              to="/demandes"
              className="text-sm text-text-muted/50 hover:text-accent transition-colors"
            >
              Toutes les demandes →
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
            {pendingRequestsList.map((req) => (
              <Link
                key={req.id}
                to="/demandes"
                className="shrink-0 w-56 rounded-2xl bg-bg-elevated p-5 hover:bg-text-muted/8 transition-colors block"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-full bg-accent/20 text-accent text-xs flex items-center justify-center font-semibold shrink-0">
                    {(req.author.displayName || req.author.email).charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs text-text-muted/50">
                    {new Date(req.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                <p className="text-sm font-medium text-text-primary leading-snug line-clamp-2">{req.title}</p>
                {req.description && (
                  <p className="text-xs text-text-muted/60 mt-1.5 line-clamp-2 leading-relaxed">{req.description}</p>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {(draftCount > 0 || hideDrafts) && (
        <div className="lg:hidden flex items-center gap-2 mb-3 flex-wrap">
          {draftCount > 0 && !hideDrafts && (
            <Link
              to="/brouillons"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/25 text-accent/80 hover:bg-accent/15 hover:text-accent transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>
              </svg>
              <span className="font-mono text-[11px]">{draftCount}</span>
              <span className="text-[11px]">brouillon{draftCount > 1 ? 's' : ''} en cours</span>
            </Link>
          )}
          {hideDrafts && (
            <button
              type="button"
              onClick={() => setHideDrafts(false)}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-text-muted/8 text-text-muted/60 border border-text-muted/15 hover:text-text-muted transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
              Brouillons masqués
            </button>
          )}
        </div>
      )}

      {!capsuleFilter && (
        <>
          {/* CTA mobile */}
          <button
            type="button"
            onClick={handleNewEntry}
            className="lg:hidden w-full flex items-center justify-center gap-3 px-5 py-5 rounded-2xl bg-accent text-bg-primary hover:opacity-90 active:scale-[0.98] transition-all shadow-sm my-6"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>
            </svg>
            <span className="font-semibold text-base">
              Nouvelle note{!isToday ? ` · ${formatDateLong(selectedDate)}` : ''}
            </span>
          </button>

          {/* CTA desktop : « Nouvelle note » + « Brouillons » côte à côte. Sans
              brouillon, le bouton occupe toute la largeur (plus de carte morte
              « Aucun brouillon » — cf. HOME-06). */}
          <div className={`hidden lg:grid ${draftCount > 0 ? 'lg:grid-cols-[3fr_2fr]' : 'lg:grid-cols-1'} gap-3 ${activeDesktopEntryId ? 'my-4' : 'my-8'}`}>
            <button
              type="button"
              onClick={handleNewEntry}
              className={`flex flex-col justify-end gap-1.5 rounded-2xl bg-accent text-bg-primary hover:opacity-95 active:scale-[0.99] transition-all text-left ${activeDesktopEntryId ? 'p-4 min-h-[72px]' : 'p-7 min-h-[148px]'}`}
            >
              <span className="font-mono text-[11px] tracking-widest uppercase opacity-60 flex items-center gap-1.5">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                </svg>
                Nouvelle note
              </span>
              <p className={`font-serif font-normal leading-tight ${activeDesktopEntryId ? 'text-lg' : 'text-3xl'}`}>
                {isToday ? 'Écrire ta journée' : formatDateLong(selectedDate)}
              </p>
            </button>
            {draftCount > 0 && (
              <Link
                to="/brouillons"
                className={`flex flex-col justify-end gap-1 rounded-2xl bg-bg-elevated hover:bg-text-muted/8 transition-colors ${activeDesktopEntryId ? 'p-4 min-h-[72px]' : 'p-7 min-h-[148px]'}`}
              >
                <span className="font-mono text-[11px] tracking-widest uppercase text-text-muted/50">Brouillons en cours</span>
                <p className={`font-serif font-normal text-text-primary leading-none ${activeDesktopEntryId ? 'text-3xl' : 'text-6xl'}`}>{draftCount}</p>
                <p className="text-sm text-text-muted/60">à reprendre</p>
              </Link>
            )}
          </div>
        </>
      )}

      {!capsuleFilter && rawEntries.length > 0 && (() => {
        // Available values for dropdowns
        const hasTypeFilter = rawEntries.some((e) => e.noteType !== 'JOURNAL');
        const hasVisibilityFilter = rawEntries.some((e) => e.visibility !== 'PRIVATE');

        // Section: collect available sections with counts
        const sectionCounts = rawEntries.reduce<Record<string, number>>((acc, e) => {
          if (e.section) acc[e.section] = (acc[e.section] ?? 0) + 1;
          return acc;
        }, {});
        const availableSections = Object.entries(sectionCounts).map(([value, count]) => ({ value, count }));

        // Tags: collect available tags with counts
        const tagCounts = rawEntries.reduce<Record<string, number>>((acc, e) => {
          (e.tagNames ?? []).forEach((t) => { acc[t] = (acc[t] ?? 0) + 1; });
          return acc;
        }, {});
        const availableTagsList = Object.keys(tagCounts);

        // Moods
        const availableMoods = collectAvailableMoods(rawEntries);
        const moodCounts = rawEntries.reduce<Record<string, number>>((acc, e) => {
          if (!e.mood) return acc;
          const seg = new Intl.Segmenter();
          [...seg.segment(e.mood)].map(s => s.segment).filter(s => s.trim()).forEach((g) => {
            acc[g] = (acc[g] ?? 0) + 1;
          });
          return acc;
        }, {});

        // Boolean pill counts
        const capsulesToday = rawEntries.filter((e) => !!e.unlockAt).length;
        const visibleForConfidant = rawEntries.filter((e) => !e.isSecret);
        const readThisDayCount = visibleForConfidant.filter((e) => confidantReadSet.has(e.id)).length;
        const unreadThisDayCount = visibleForConfidant.filter((e) => !confidantReadSet.has(e.id)).length;
        const adultToday = rawEntries.filter((e) => e.isAdult).length;
        const draftToday = rawEntries.filter((e) => !!e.isDraft).length;
        const secretToday = rawEntries.filter((e) => !!e.isSecret).length;
        const forConfidantToday = rawEntries.filter((e) => !!e.isForConfidant).length;

        const hasReadGateLocked = rawEntries.some((e) => !!e.readGatePrompt);
        const hasAnyPills = hasTypeFilter || hasVisibilityFilter || availableSections.length > 1
          || availableTagsList.length > 0 || availableMoods.length > 0
          || capsulesToday > 0 || readThisDayCount > 0 || unreadThisDayCount > 0
          || adultToday > 0 || draftToday > 0 || secretToday > 0 || forConfidantToday > 0
          || hasReadGateLocked;

        return (
          <div className="sticky top-[var(--page-header-h,96px)] z-[10] bg-bg-elevated rounded-2xl shadow-soft mb-4">
            {/* Search + sort + select — flex-wrap : les boutons passent en dessous sur mobile étroit */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pt-2.5 pb-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted/50 shrink-0">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Chercher dans ce jour…"
                  className="flex-1 min-w-0 bg-transparent text-sm text-text-primary placeholder:text-text-muted/55 outline-none"
                />
                {search && (
                  <button type="button" onClick={() => setSearch('')} className="text-text-muted/55 hover:text-text-muted text-xs">✕</button>
                )}
              </div>
              {(entries.length !== rawEntries.length || search.trim()) && (
                <span className="text-xs text-text-muted/55 shrink-0 tabular-nums">
                  {entries.length}<span className="opacity-60"> / {rawEntries.length}</span>
                </span>
              )}
              <SortPicker mode={sortMode} onChange={setSortMode} />
              <button
                type="button"
                title={compactMode ? 'Mode compact actif — désactiver' : 'Mode compact (cartes condensées)'}
                onClick={toggleCompactMode}
                className={`flex items-center justify-center w-8 h-8 rounded-xl transition-colors shrink-0 ${compactMode ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-primary'}`}
                aria-pressed={compactMode}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
              <button
                type="button"
                title="Sélectionner des notes"
                onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }}
                className={`flex items-center justify-center w-8 h-8 rounded-xl transition-colors shrink-0 ${selectMode ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-primary'}`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="5" height="5" rx="1"/><rect x="3" y="10" width="5" height="5" rx="1"/>
                  <rect x="3" y="17" width="5" height="5" rx="1"/><line x1="12" y1="5.5" x2="21" y2="5.5"/>
                  <line x1="12" y1="12.5" x2="21" y2="12.5"/><line x1="12" y1="19.5" x2="21" y2="19.5"/>
                </svg>
              </button>
              {hasAnyPills && <ChevronToggle collapsed={filtersCollapsed} onClick={toggleFiltersCollapsed} />}
            </div>

            {/* Mini-résumé des filtres actifs (mode replié) */}
            {hasAnyPills && filtersCollapsed && (() => {
              const chips: string[] = [];
              if (typeFilter.length > 0) chips.push(typeFilter.length === 1 ? (typeFilter[0] as string) : `${typeFilter.length} types`);
              if (visibilityFilter) chips.push(visibilityFilter === 'PRIVATE' ? 'Privé' : visibilityFilter === 'SHARED_ALL' ? 'Partagé' : 'Spécifique');
              if (sectionFilter.length > 0) chips.push(`${sectionFilter.length} section${sectionFilter.length > 1 ? 's' : ''}`);
              if (tagFilter.length > 0) chips.push(`${tagFilter.length} tag${tagFilter.length > 1 ? 's' : ''}`);
              if (moodFilter.length > 0) chips.push(`${moodFilter.length} mood${moodFilter.length > 1 ? 's' : ''}`);
              if (forConfidantFilter) chips.push('Pour toi');
              if (draftFilter) chips.push('Brouillons');
              if (secretFilter) chips.push('Secret');
              if (readGateFilter.length > 0) chips.push(`Verrou (${readGateFilter.length})`);
              if (capsuleStatusFilter.length > 0) chips.push(`Capsules (${capsuleStatusFilter.length})`);
              if (adultOnly) chips.push('18+');
              if (confidantReadFilter === 'read') chips.push('Lu');
              if (confidantReadFilter === 'unread') chips.push('Non lu');
              if (favoritesFilter === 'any') chips.push('Favoris');
              if (favoritesFilter === 'mine') chips.push('Mes favoris');
              if (favoritesFilter === 'others') chips.push('Favoris confidents');
              if (chips.length === 0) return null;
              return (
                <div className="px-3 pb-2 text-[11px] text-text-muted/70 flex items-center gap-1.5 -mt-1.5 truncate">
                  <span className="text-text-muted/55 shrink-0">Filtres :</span>
                  <span className="truncate">{chips.join(' · ')}</span>
                </div>
              );
            })()}

            {/* Pills row */}
            {hasAnyPills && !filtersCollapsed && (
              <>
                <div className="h-px bg-text-muted/[0.12]" />
                <div className="flex flex-wrap gap-1.5 px-3 py-2.5">
                  {/* ── Dropdowns (filtres structurels) ── */}
                  {hasTypeFilter && (
                    <TypeFilterButton
                      availableTypes={NOTE_TYPE_CONFIG.filter((c) => rawEntries.some((e) => e.noteType === c.value)).map((c) => c.value)}
                      selected={typeFilter}
                      onChange={setTypeFilter}
                    />
                  )}
                  {hasVisibilityFilter && (
                    <VisibilityFilterButton value={visibilityFilter} onChange={setVisibilityFilter} />
                  )}
                  {availableSections.length > 1 && (
                    <SectionFilterButton availableSections={availableSections} selected={sectionFilter} onChange={setSectionFilter} />
                  )}
                  {availableTagsList.length > 0 && (
                    <TagFilterButton availableTags={availableTagsList} selected={tagFilter} onChange={setTagFilter} counts={tagCounts} />
                  )}
                  {availableMoods.length > 0 && (
                    <MoodFilterButton availableMoods={availableMoods} selected={moodFilter} onChange={setMoodFilter} counts={moodCounts} />
                  )}
                  {/* Verrou de lecture : visible seulement si au moins une note verrouillée */}
                  {rawEntries.some((e) => !!e.readGatePrompt) && (
                    <ReadGateFilterButton
                      selected={readGateFilter}
                      onChange={setReadGateFilter}
                      counts={(() => {
                        const c = { approved: 0, rejected: 0, pending: 0, unanswered: 0 } as Record<ReadGateStatus, number>;
                        for (const e of rawEntries) {
                          if (!e.readGatePrompt) continue;
                          const statuses = (readGateStatusesData[e.id] ?? []) as ReadGateStatus[];
                          if (statuses.length === 0) c.unanswered++;
                          else for (const s of statuses) c[s]++;
                        }
                        return c;
                      })()}
                    />
                  )}
                  {/* Capsules (statut) : visible seulement s'il y a au moins une capsule ce jour */}
                  {rawEntries.some((e) => !!e.unlockAt) && (
                    <CapsuleFilterButton
                      selected={capsuleStatusFilter}
                      onChange={setCapsuleStatusFilter}
                      counts={(() => {
                        const nowMs = Date.now();
                        let locked = 0, unlocked = 0;
                        for (const e of rawEntries) {
                          if (!e.unlockAt) continue;
                          if (new Date(e.unlockAt).getTime() > nowMs) locked++;
                          else unlocked++;
                        }
                        return { locked, unlocked };
                      })()}
                    />
                  )}

                  {/* ── Pills confident ── */}
                  {forConfidantToday > 0 && (
                    <button type="button"
                      onClick={() => setForConfidantFilter((v) => !v)}
                      className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-colors ${forConfidantFilter ? 'bg-accent/10 text-accent border-accent/30 font-medium' : 'border-text-muted/15 text-text-muted hover:border-text-muted/30'}`}
                    >
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 shrink-0" aria-hidden><path d="M8 13.5S2 9.5 2 5.5a3.5 3.5 0 0 1 6-2.45A3.5 3.5 0 0 1 14 5.5c0 4-6 8-6 8z" /></svg>
                      Pour toi {!forConfidantFilter && `(${forConfidantToday})`}
                    </button>
                  )}
                  {/* Favoris — dropdown (tous / mes / des confidents) */}
                  <FavoritesFilterButton
                    value={favoritesFilter as 'any' | 'mine' | 'others' | 'owner' | null}
                    onChange={(v) => setFavoritesFilter(v as 'any' | 'mine' | 'others' | null)}
                    viewerIsOwner
                  />
                  {readThisDayCount > 0 && (
                    <button type="button"
                      onClick={() => setConfidantReadFilter((v) => v === 'read' ? null : 'read')}
                      className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-colors ${confidantReadFilter === 'read' ? 'bg-accent/10 text-accent border-accent/30 font-medium' : 'border-text-muted/15 text-text-muted hover:border-text-muted/30'}`}
                    >
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 shrink-0" aria-hidden><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" /><circle cx="8" cy="8" r="2" fill="none" /></svg>
                      Lu {!confidantReadFilter && `(${readThisDayCount})`}
                    </button>
                  )}
                  {unreadThisDayCount > 0 && (
                    <button type="button"
                      onClick={() => setConfidantReadFilter((v) => v === 'unread' ? null : 'unread')}
                      className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-colors ${confidantReadFilter === 'unread' ? 'bg-warning/15 text-warning border-warning/30 font-medium' : 'border-text-muted/15 text-text-muted hover:border-text-muted/30'}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${confidantReadFilter === 'unread' ? 'bg-warning' : 'bg-text-muted/40'}`} />
                      Non lu {!confidantReadFilter && `(${unreadThisDayCount})`}
                    </button>
                  )}

                  {/* ── Pills statut ── */}
                  {draftToday > 0 && (
                    <button type="button"
                      onClick={() => setDraftFilter((v) => !v)}
                      className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-colors ${draftFilter ? 'bg-warning/15 text-warning border-warning/30 font-medium' : 'border-text-muted/15 text-text-muted hover:border-text-muted/30'}`}
                    >
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 shrink-0" aria-hidden><path d="M11 2L14 5L6 13L3 14L4 11L11 2ZM9.5 3.5L12.5 6.5" /></svg>
                      Brouillons {!draftFilter && `(${draftToday})`}
                    </button>
                  )}
                  {secretToday > 0 && (
                    <button type="button"
                      onClick={() => setSecretFilter((v) => !v)}
                      className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-colors ${secretFilter ? 'bg-secret/15 text-secret border-secret/30 font-medium' : 'border-text-muted/15 text-text-muted hover:border-text-muted/30'}`}
                    >
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 shrink-0" aria-hidden><rect x="3" y="8" width="10" height="6" rx="1" /><path d="M5 8V6a3 3 0 0 1 6 0v2" /></svg>
                      Secret {!secretFilter && `(${secretToday})`}
                    </button>
                  )}
                  {adultToday > 0 && (
                    <button type="button"
                      onClick={() => setAdultOnly((v) => !v)}
                      className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-colors ${adultOnly ? 'bg-adult/15 text-adult border-adult/30' : 'border-text-muted/15 text-text-muted hover:border-text-muted/30'}`}
                    >
                      🔞 18+ {!adultOnly && `(${adultToday})`}
                    </button>
                  )}
                  {capsulesToday > 0 && (
                    <button type="button"
                      onClick={() => setCapsuleFilter(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border transition-all duration-150 border-text-muted/15 text-text-muted hover:border-text-muted/30"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                      </svg>
                      {allCapsules.length > capsulesToday
                        ? `Capsules (${capsulesToday} ce jour · ${allCapsules.length} au total)`
                        : `Capsules (${capsulesToday})`}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* ── Vue capsules (toutes dates) ───────────────────────────────────── */}
      {capsuleFilter ? (
        <div className="space-y-6">
          <button
            type="button"
            onClick={() => setCapsuleFilter(false)}
            className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Retour au journal
          </button>
          {capsulesLocked.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted/50 mb-3 flex items-center gap-2">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Scellées
              </h2>
              <div className="space-y-3">
                {capsulesLocked.map((entry) => (
                  <EntryCard key={entry.id} entry={entry} onSave={sync} onTagClick={(tag) => setTagFilter((prev) => prev.includes(tag) ? prev : [...prev, tag])} />
                ))}
              </div>
            </section>
          )}
          {capsulesUnlocked.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted/50 mb-3 flex items-center gap-2">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" />
                </svg>
                Ouvertes
              </h2>
              <div className="space-y-3">
                {capsulesUnlocked.map((entry) => (
                  <EntryCard key={entry.id} entry={entry} onSave={sync} onTagClick={(tag) => setTagFilter((prev) => prev.includes(tag) ? prev : [...prev, tag])} />
                ))}
              </div>
            </section>
          )}
          {allCapsules.length === 0 && (
            <p className="text-center text-text-muted/55 italic text-sm py-8">Aucune capsule temporelle.</p>
          )}
        </div>
      ) : (

      /* ── Vue normale (jour sélectionné) ───────────────────────────────── */
      <div className="space-y-3">
        {entries.length === 0 && !syncing && !isToday && (
          <div className="text-center py-8">
            <p className="font-serif text-text-muted/55 text-2xl mb-2">✦</p>
            <p className="font-serif text-text-muted italic text-sm">Aucune note pour ce jour.</p>
          </div>
        )}

        {entries.map((entry) => (
          <EntryCard
            key={entry.id}
            entry={entry}
            autoFocus={!selectMode && entry.id === newEntryId && !activeDesktopEntryId}
            defaultOpen={!selectMode && !newEntryId && entry.id === focusedEntryId && !focusedCommentId && !isDesktop}
            focusedCommentId={!selectMode && !isDesktop && entry.id === focusedEntryId ? focusedCommentId : undefined}
            onSave={sync}
            onTagClick={(tag) => setTagFilter((prev) => prev.includes(tag) ? prev : [...prev, tag])}
            isReadByConfidant={confidantReadSet.has(entry.id)}
            isActivePanel={activeDesktopEntryId === entry.id}
            selectable={selectMode}
            selected={selectedIds.has(entry.id)}
            onDesktopClick={(opts) => {
              setDesktopOpenToComments(!!opts?.comments);
              setActiveDesktopEntryId(entry.id);
            }}
            compact={!!activeDesktopEntryId}
            compactMode={compactMode}
            onSelect={() => setSelectedIds((prev) => {
              const next = new Set(prev);
              next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
              return next;
            })}
          />
        ))}
      </div>
      )}

      {selectMode && (
        <BulkActionBar
          count={selectedIds.size}
          totalCount={entries.length}
          allSelected={selectedIds.size === entries.length && entries.length > 0}
          selectedEntries={entries.filter((e) => selectedIds.has(e.id))}
          onSelectAll={() => setSelectedIds(new Set(entries.map((e) => e.id)))}
          onDeselectAll={() => setSelectedIds(new Set())}
          onClose={() => { setSelectMode(false); setSelectedIds(new Set()); }}
          onApply={handleBulkApply}
        />
      )}

      <BackToTop panelOpen={!!activeDesktopEntryId} />
      <BottomNav />
    </div>{/* /left column */}

    {/* Right panel — desktop entry read view */}
    {activeDesktopEntry && (
      <div data-right-panel className="hidden lg:flex lg:flex-col lg:flex-1 lg:sticky lg:top-0 lg:self-start lg:h-dvh lg:border-l lg:border-text-muted/10 lg:overflow-hidden">
        <EntryCard
          key={activeDesktopEntry.id}
          entry={activeDesktopEntry}
          defaultOpen
          autoFocus={activeDesktopEntry.id === newEntryId}
          focusedCommentId={activeDesktopEntry.id === focusedEntryId ? focusedCommentId : undefined}
          desktopPanel
          openToComments={desktopOpenToComments}
          onModalClose={() => {
            setDesktopOpenToComments(false);
            if (newEntryParam) { navigate(-1); return; }
            setActiveDesktopEntryId(null);
          }}
          onSave={sync}
          onTagClick={(tag) => setTagFilter((prev) => prev.includes(tag) ? prev : [...prev, tag])}
        />
      </div>
    )}
    </div>
  );
}
