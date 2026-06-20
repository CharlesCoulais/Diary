import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LocalEntry, type LocalDailyLog } from '../lib/db/schema';
import { DailyLogRecap } from '../components/DailyLogRecap';
import { useSyncContext } from '../lib/sync/SyncProvider';
import { EntryCard } from '../components/EntryCard';
import { BottomNav } from '../components/BottomNav';
import { BackToTop } from '../components/BackToTop';
import { BulkActionBar, type BulkAction } from '../components/BulkActionBar';
import { type SortMode, SortPicker, isUpdatedSort } from './Home';
import { EntryFilters, EMPTY_FILTERS, applyFilters, collectAvailableMoods, isFiltered, type FilterState, type ReadGateStatus } from '../components/EntryFilters';
import { useCollapsibleSection } from '../hooks/useCollapsibleSection';
import { useTrackPageHeaderHeight } from '../hooks/useTrackPageHeaderHeight';
import { ChevronToggle } from '../components/ChevronToggle';
import { RangeExportSheet } from '../components/RangeExportSheet';
import { getNoteTypeConfig } from '../components/NoteTypePicker';
import type { NoteType } from '../components/NoteTypePicker';
import { trpc } from '../lib/trpc';
import { getOwnerDisplayPrefs, subscribeOwnerPrefs } from '../lib/displayPrefs';
import { OwnerTopBar } from '../components/OwnerTopBar';
import { formatDateLong } from '../lib/dateHelpers';

const SECTION_TIME: Record<string, string> = {
  MORNING: '06:00', LATE_MORNING: '10:00', NOON: '12:00',
  AFTERNOON: '14:00', LATE_AFTERNOON: '16:00',
  EARLY_EVENING: '18:00', EVENING: '20:00', NIGHT: '22:00', FREE: '23:50',
};

/**
 * « Modifié il y a 2h », « hier », « mardi 19 mai »… selon la fraîcheur.
 * Utilisé seulement en mode tri par `updatedAt` — donne le contexte qu'on
 * perd en quittant le regroupement par jour de note.
 */
function formatRelativeUpdate(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'à l\'instant';
  if (diffMin < 60) return `Modifié il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Modifié il y a ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'Modifié hier';
  if (diffD < 7) return `Modifié il y a ${diffD} jours`;
  return `Modifié le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
}

function entrySortKey(e: LocalEntry): string {
  if (e.timeLabel) return e.timeLabel;
  if (e.section) return SECTION_TIME[e.section] ?? '23:59';
  return new Date(e.createdAt).toTimeString().slice(0, 8);
}

function sortItems(items: LocalEntry[], mode: SortMode): LocalEntry[] {
  return [...items].sort((a, b) => {
    // Tie-breaker aligné sur la direction du tri principal (cf. Home.tsx) :
    // descendant → récent en haut, ascendant → chronologique.
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
    const cmp = a.updatedAt.localeCompare(b.updatedAt);
    return cmp !== 0 ? cmp : createdTie;
  });
}

function groupByDate(
  entries: LocalEntry[],
  mode: SortMode,
): Array<{ date: string; entries: LocalEntry[] }> {
  const map = new Map<string, LocalEntry[]>();
  for (const e of entries) {
    const bucket = map.get(e.date);
    if (bucket) bucket.push(e);
    else map.set(e.date, [e]);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({ date, entries: sortItems(items, mode) }));
}

export function TimelinePage() {
  const [query, setQuery] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  // Tri **session-only** : reset au défaut des Réglages à chaque refresh
  // (pas de localStorage). Si l'utilisateur change le tri via le SortPicker,
  // ça reste valable jusqu'à la prochaine recharge. La source de vérité
  // long-terme est `Réglages → Affichage → Notes → Tri par défaut`.
  const [sortMode, setSortMode] = useState<SortMode>(() => getOwnerDisplayPrefs().defaultSortMode);
  // Initialise `filters` depuis les prefs : `hideDrafts: true` → `isDraft: false`
  // (masquer les brouillons), et `defaultTypes` → `types`. Sans ça, Timeline
  // ne respectait pas du tout ces réglages au chargement.
  const [filters, setFilters] = useState<FilterState>(() => {
    const p = getOwnerDisplayPrefs();
    return {
      ...EMPTY_FILTERS,
      isDraft: p.hideDrafts ? false : null,
      types: p.defaultTypes,
    };
  });
  // null = pas de filtre, 'read' = lus par confident, 'unread' = non-lus parmi les entrées visibles par lui
  const [confidantReadFilter, setConfidantReadFilter] = useState<'read' | 'unread' | null>(null);
  const [hideAdult, setHideAdult] = useState(() => getOwnerDisplayPrefs().hideAdult);
  const [hideMyForgotten, setHideMyForgotten] = useState(() => getOwnerDisplayPrefs().hideMyForgotten);
  const [adultOnly, setAdultOnly] = useState(false);
  // Page Journal (owner) → `compactJournal` est le **défaut** persisté ; le
  // toggle dans la barre de filtres reste un override de session (non écrit
  // en localStorage). Au remount, on repart du défaut configuré.
  const [compactMode, setCompactMode] = useState(() => getOwnerDisplayPrefs().compactJournal);
  const [filtersCollapsed, toggleFiltersCollapsed] = useCollapsibleSection('timeline', 'mobile');
  const { mobileRef: headerMobileRef, desktopRef: headerDesktopRef } = useTrackPageHeaderHeight();
  const toggleCompactMode = useCallback(() => setCompactMode((v) => !v), []);
  // Synchro robuste — same-tab (Réglages), cross-tab (storage event), et
  // bfcache (Android PWA / iOS Safari qui re-affichent la page depuis le
  // cache mémoire sans re-monter React). Refresh TOUS les états dérivés
  // des prefs, sinon seul compactMode resterait synchro avec les Réglages.
  useEffect(() => subscribeOwnerPrefs(() => {
    const p = getOwnerDisplayPrefs();
    setCompactMode(p.compactJournal);
    setHideAdult(p.hideAdult);
    setHideMyForgotten(p.hideMyForgotten);
    setSortMode(p.defaultSortMode);
    // Met à jour les portions de `filters` pilotées par les prefs sans toucher
    // les autres axes (tags, moods, dates, capsules…) que l'utilisateur a pu
    // configurer manuellement sur la page.
    setFilters((prev) => ({
      ...prev,
      isDraft: p.hideDrafts ? false : prev.isDraft,
      types: p.defaultTypes,
    }));
  }), []);
  const { sync, syncing } = useSyncContext();
  // Auth — utilisé pour `applyFilters` (favoris perso) et `viewerIsOwner`.
  const { data: me } = trpc.auth.me.useQuery();
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [activeDesktopEntryId, setActiveDesktopEntryId] = useState<string | null>(null);
  // Le panel a été ouvert via la bulle 💬 → lecture scrollée sur les commentaires.
  const [desktopOpenToComments, setDesktopOpenToComments] = useState(false);

  const { data: confidantReadIdsData = [] } = trpc.entries.confidantReadIds.useQuery(undefined, {
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  const confidantReadSet = new Set(confidantReadIdsData);

  // Verrous de lecture : agrégat des statuts par entry pour filtrer côté owner.
  // Refetch léger : la décision passe par tRPC mutation qui invalide déjà cette query côté UI.
  const { data: readGateStatuses = {} } = trpc.readGate.statusesForOwner.useQuery(undefined, {
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const gateStatusOf = useCallback((e: { id: string }): Set<ReadGateStatus> => {
    return new Set((readGateStatuses[e.id] ?? []) as ReadGateStatus[]);
  }, [readGateStatuses]);

  const dailyLogs = useLiveQuery(
    () => db.dailyLogs.filter((dl) => dl.deletedAt === null).toArray(),
    [],
  ) ?? [];
  const dailyLogByDate = new Map<string, LocalDailyLog>(dailyLogs.map((dl) => [dl.date, dl]));

  const allEntries = useLiveQuery(
    () => db.entries.filter((e) => e.deletedAt === null && !e.collectionOnly).toArray(),
    [],
  ) ?? [];

  const availableTypes = [...new Set(allEntries.map((e) => e.noteType))] as NoteType[];
  const availableTags = [...new Set(allEntries.flatMap((e) => e.tagNames ?? []))].sort();
  // Compteur par tag affiché dans le dropdown du filtre.
  const tagCounts = allEntries.reduce<Record<string, number>>((acc, e) => {
    (e.tagNames ?? []).forEach((t) => { acc[t] = (acc[t] ?? 0) + 1; });
    return acc;
  }, {});
  const availableMoods = collectAvailableMoods(allEntries);

  const searched = query.trim()
    ? allEntries.filter((e) => {
        const q = query.toLowerCase();
        return (
          e.contentMd.toLowerCase().includes(q) ||
          (e.title?.toLowerCase().includes(q) ?? false) ||
          (e.mediaMeta?.subject?.toLowerCase().includes(q) ?? false)
        );
      })
    : allEntries;

  const afterConfidant = (() => {
    if (!confidantReadFilter) return searched;
    if (confidantReadFilter === 'read') return searched.filter((e) => confidantReadSet.has(e.id));
    // 'unread' : entrées visibles par le confident (toutes sauf secrètes) qu'il n'a pas lues
    return searched.filter((e) => !e.isSecret && !confidantReadSet.has(e.id));
  })();
  const afterAdult = adultOnly
    ? afterConfidant.filter((e) => !!e.isAdult)
    : (hideAdult ? afterConfidant.filter((e) => !e.isAdult) : afterConfidant);
  // Masque les notes que l'utilisateur courant a marquées « à oublier »
  // (pref `hideMyForgotten`). Bypass si un filtre « À oublier » explicite
  // est actif dans la barre — sinon le pool serait vidé avant d'arriver
  // à `applyFilters` et le filtre n'aurait rien à matcher.
  const afterForgotten = (hideMyForgotten && me?.id && filters.lowFilter === null)
    ? afterAdult.filter((e) => {
        const mine = (e.ratings ?? []).find((r) => r.userId === me.id);
        return mine?.value !== 'LOW';
      })
    : afterAdult;
  const filtered = applyFilters(afterForgotten, filters, gateStatusOf, me?.id);
  const activeDesktopEntry = filtered.find((e) => e.id === activeDesktopEntryId) ?? null;
  // Tri par date de modif ⇒ liste plate (le regroupement par jour de la note
  // n'a plus de sens : on veut voir la dernière modifiée en haut, peu importe
  // de quel jour de journal elle parle).
  const flatMode = isUpdatedSort(sortMode);
  const grouped = flatMode ? [] : groupByDate(filtered, sortMode);
  const flatEntries = flatMode ? sortItems(filtered, sortMode) : [];

  /**
   * Lazy rendering progressif des cards (mode flat + grouped).
   *
   * Vu la taille des `EntryCard` (DOM lourd : éditeur Tiptap monté en mode lecture,
   * média preview, comments…), monter 500+ cards d'un coup tue la frame mobile.
   * On garde une approche simple : rendre les `visibleCount` premières entries,
   * un sentinel IntersectionObserver tout en bas charge la suite par paquets de
   * 50. Évite la complexité de la virtualisation tout en plafonnant le DOM monté.
   *
   * Reset à chaque changement de filtre / tri / mode (la cohorte d'entries change).
   */
  const [visibleCount, setVisibleCount] = useState(50);
  useEffect(() => {
    // Filtres / tri / mode changent → recommencer à 50 (sinon les anciennes
    // entries hors-filtre restent dans le DOM jusqu'à scroll up).
    setVisibleCount(50);
  }, [flatMode, compactMode, sortMode, query, JSON.stringify(filters)]);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const totalEntries = flatMode ? flatEntries.length : filtered.length;
    if (visibleCount >= totalEntries) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisibleCount((v) => Math.min(v + 50, totalEntries));
      }
    }, { rootMargin: '600px' }); // charge 600px avant que le sentinel soit visible
    io.observe(el);
    return () => io.disconnect();
  }, [visibleCount, flatMode, flatEntries.length, filtered.length]);

  const visibleFlatEntries = flatMode ? flatEntries.slice(0, visibleCount) : [];
  // En mode grouped, on slice par nombre d'entries cumulé (pas par groupe)
  // pour garder un comportement uniforme.
  const visibleGrouped = (() => {
    if (flatMode) return [];
    let remaining = visibleCount;
    const out: typeof grouped = [];
    for (const g of grouped) {
      if (remaining <= 0) break;
      const sliced = g.entries.slice(0, remaining);
      out.push({ ...g, entries: sliced });
      remaining -= sliced.length;
    }
    return out;
  })();
  const totalEntries = flatMode ? flatEntries.length : filtered.length;
  const hasMore = visibleCount < totalEntries;

  const handleBulkApply = async (action: BulkAction) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    const base = { updatedAt: now, _dirty: true as const };
    switch (action.type) {
      case 'draft':
        await db.entries.where('id').anyOf(ids).modify({ isDraft: action.value, ...base });
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

  const allFilteredEntries = filtered;

  return (
    <div className="min-h-dvh pb-48 sm:pb-56 max-w-2xl mx-auto [overflow-x:clip] lg:max-w-none lg:px-0 lg:pb-0 lg:flex lg:items-start">
      {/* Left column — timeline content */}
      <div className={`px-6 lg:px-12 lg:pb-16 lg:min-h-dvh lg:min-w-0 ${activeDesktopEntryId ? 'lg:w-[520px] lg:shrink-0' : 'lg:flex-1'}`}>

        {/* ── Header mobile ─────────────────────────────────────────────────── */}
        <div ref={headerMobileRef} className="lg:hidden sticky top-0 z-[11] -mx-6 px-6 pt-5 pb-4 mb-6 bg-bg-primary/90 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-1">
            <p className="font-mono text-[11px] tracking-widest uppercase text-text-muted/50 select-none">Diary</p>
            <OwnerTopBar />
          </div>
          <h1 className="font-serif text-4xl text-text-primary tracking-tight text-center">Toutes les notes</h1>
        </div>

        {/* ── Header desktop ────────────────────────────────────────────────── */}
        <div ref={headerDesktopRef} className={`hidden lg:flex items-center sticky top-0 z-[11] -mx-12 px-12 bg-bg-primary/90 backdrop-blur-sm ${activeDesktopEntryId ? 'pt-5 pb-3 mb-1' : 'pt-10 pb-6 mb-2'}`}>
          <div className="flex-1">
            <p className="font-mono text-[11px] tracking-widest uppercase text-text-muted/50 select-none mb-2">
              {syncing ? 'Synchronisation…' : `${filtered.length} note${filtered.length !== 1 ? 's' : ''}`}
            </p>
            <h1 className={`font-serif text-text-primary tracking-tight text-center ${activeDesktopEntryId ? 'text-3xl' : 'text-6xl'}`}>
              Journal
            </h1>
          </div>
        </div>

        {/* ── Search + filters ──────────────────────────────────────────────── */}
        <div className="sticky top-[var(--page-header-h,96px)] z-[10] bg-bg-elevated rounded-2xl shadow-soft mb-4">
          {/* Search row — flex-wrap : sort+select passent en dessous sur mobile étroit */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pt-2.5 pb-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted/50 shrink-0">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder="Chercher…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 min-w-0 bg-transparent text-sm text-text-primary placeholder:text-text-muted/55 outline-none"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} className="text-text-muted/55 hover:text-text-muted text-xs shrink-0">✕</button>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              {(filtered.length !== allEntries.length || query.trim()) && (
                <span className="text-xs text-text-muted/55 tabular-nums">
                  {filtered.length}<span className="opacity-60"> / {allEntries.length}</span>
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
              <button
                type="button"
                title="Exporter une période en PDF"
                onClick={() => setExportOpen(true)}
                className="flex items-center justify-center w-8 h-8 rounded-xl transition-colors shrink-0 text-text-muted hover:text-text-primary"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
              <ChevronToggle collapsed={filtersCollapsed} onClick={toggleFiltersCollapsed} />
            </div>
          </div>

          {/* Mini-résumé (mode replié uniquement) */}
          {filtersCollapsed && (isFiltered(filters) || adultOnly || confidantReadFilter) && (() => {
            const chips: string[] = [];
            if (filters.types.length > 0) chips.push(filters.types.length === 1 ? (filters.types[0] as string) : `${filters.types.length} types`);
            if (filters.tags.length > 0) chips.push(`${filters.tags.length} tag${filters.tags.length > 1 ? 's' : ''}`);
            if (filters.moods.length > 0) chips.push(`${filters.moods.length} mood${filters.moods.length > 1 ? 's' : ''}`);
            if (filters.from || filters.to) chips.push('Période');
            if (filters.visibility) chips.push(filters.visibility === 'PRIVATE' ? 'Privé' : filters.visibility === 'SHARED_ALL' ? 'Partagé' : 'Spécifique');
            if (filters.isForConfidant) chips.push('Pour toi');
            if (filters.isDraft) chips.push('Brouillons');
            if (filters.isSecret) chips.push('Secret');
            if (filters.readGateStatuses.length > 0) chips.push(`Verrou (${filters.readGateStatuses.length})`);
            if (filters.capsuleStatuses.length > 0) chips.push(`Capsules (${filters.capsuleStatuses.length})`);
            if (adultOnly) chips.push('18+');
            if (confidantReadFilter === 'read') chips.push('Lu');
            if (confidantReadFilter === 'unread') chips.push('Non lu');
            return (
              <div className="px-3 pb-2 text-[11px] text-text-muted/70 flex items-center gap-1.5 -mt-1.5 truncate">
                <span className="text-text-muted/55 shrink-0">Filtres :</span>
                <span className="truncate">{chips.join(' · ')}</span>
              </div>
            );
          })()}

          {/* Pills row */}
          {!filtersCollapsed && (() => {
            const adultTotal = allEntries.filter((e) => e.isAdult).length;
            const visibleForConfidant = allEntries.filter((e) => !e.isSecret);
            const readByConfidantCount = visibleForConfidant.filter((e) => confidantReadSet.has(e.id)).length;
            const unreadByConfidantCount = visibleForConfidant.filter((e) => !confidantReadSet.has(e.id)).length;
            const capsuleCount = allEntries.filter((e) => !!e.unlockAt).length;
            const PILL_INACTIVE = 'border-text-muted/15 text-text-muted/60 hover:border-text-muted/30 hover:text-text-muted';
            // 18+ est désormais dans le dropdown « États » (via les props
            // adultOnly/onAdultOnlyChange d'EntryFilters). On conserve ici
            // seulement le pill « 18+ masqué » qui agit sur la pref globale.
            const qp = (
              <>
                {hideAdult && !adultOnly && (
                  <button type="button" onClick={() => setHideAdult(false)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 ${PILL_INACTIVE}`}
                    title="Réafficher le contenu 18+"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    18+ masqué
                  </button>
                )}
              </>
            );
            const rp = (readByConfidantCount > 0 || unreadByConfidantCount > 0) ? (
              <>
                {readByConfidantCount > 0 && (
                  <button type="button" onClick={() => setConfidantReadFilter((v) => v === 'read' ? null : 'read')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 ${confidantReadFilter === 'read' ? 'bg-accent/15 text-accent border-accent/40 font-medium' : PILL_INACTIVE}`}
                  >
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 shrink-0" aria-hidden><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" /><circle cx="8" cy="8" r="2" fill="none" /></svg>
                    Lu {confidantReadFilter !== 'read' && `(${readByConfidantCount})`}
                  </button>
                )}
                {unreadByConfidantCount > 0 && (
                  <button type="button" onClick={() => setConfidantReadFilter((v) => v === 'unread' ? null : 'unread')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 ${confidantReadFilter === 'unread' ? 'bg-warning/15 text-warning border-warning/40 font-medium' : PILL_INACTIVE}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${confidantReadFilter === 'unread' ? 'bg-warning' : 'bg-text-muted/40'}`} />
                    Non lu {confidantReadFilter !== 'unread' && `(${unreadByConfidantCount})`}
                  </button>
                )}
              </>
            ) : undefined;
            const hasAnyPills = availableTypes.length > 0;
            if (!hasAnyPills) return null;
            return (
              <>
                <div className="h-px bg-text-muted/[0.12]" />
                <div className="px-3 py-2.5">
                  <EntryFilters
                    filters={filters} onChange={setFilters}
                    availableTypes={availableTypes} availableTags={availableTags} tagCounts={tagCounts} availableMoods={availableMoods}
                    sortMode={sortMode} onSortChange={setSortMode}
                    hideSortPicker
                    showReadGateFilter={allEntries.some((e) => !!e.readGatePrompt)}
                    showCapsuleFilter={allEntries.some((e) => !!e.unlockAt)}
                    counts={{
                      draft: allEntries.filter((e) => e.isDraft).length,
                      forConfidant: allEntries.filter((e) => e.isForConfidant).length,
                      secret: allEntries.filter((e) => e.isSecret).length,
                    }}
                    readGateCounts={(() => {
                      // Compte agrégé par statut sur l'ensemble des notes verrouillées
                      // (les statuts d'une même note peuvent contribuer à plusieurs cases).
                      const c = { approved: 0, rejected: 0, pending: 0, unanswered: 0 } as Record<ReadGateStatus, number>;
                      for (const e of allEntries) {
                        if (!e.readGatePrompt) continue;
                        const statuses = (readGateStatuses[e.id] ?? []) as ReadGateStatus[];
                        if (statuses.length === 0) c.unanswered++;
                        else for (const s of statuses) c[s]++;
                      }
                      return c;
                    })()}
                    capsuleCounts={(() => {
                      const now = Date.now();
                      let locked = 0, unlocked = 0;
                      for (const e of allEntries) {
                        if (!e.unlockAt) continue;
                        if (new Date(e.unlockAt).getTime() > now) locked++;
                        else unlocked++;
                      }
                      return { locked, unlocked };
                    })()}
                    quickPillsSlot={qp} readPillsSlot={rp}
                    viewerIsOwner
                    adultOnly={adultOnly}
                    onAdultOnlyChange={setAdultOnly}
                    adultCount={adultTotal}
                    favoritesCounts={(() => {
                      const meId = me?.id;
                      let any = 0, mine = 0, others = 0;
                      for (const e of allEntries) {
                        const ratings = (e as { ratings?: Array<{ userId: string; value: 'FAVORITE' | 'LOW' }> }).ratings ?? [];
                        const favs = ratings.filter((r) => r.value === 'FAVORITE');
                        if (favs.length > 0) any++;
                        if (meId && favs.some((r) => r.userId === meId)) mine++;
                        if (meId && favs.some((r) => r.userId !== meId)) others++;
                      }
                      return { any, mine, others };
                    })()}
                    lowCounts={(() => {
                      const meId = me?.id;
                      let any = 0, mine = 0, others = 0;
                      for (const e of allEntries) {
                        const ratings = (e as { ratings?: Array<{ userId: string; value: 'FAVORITE' | 'LOW' }> }).ratings ?? [];
                        const lows = ratings.filter((r) => r.value === 'LOW');
                        if (lows.length > 0) any++;
                        if (meId && lows.some((r) => r.userId === meId)) mine++;
                        if (meId && lows.some((r) => r.userId !== meId)) others++;
                      }
                      return { any, mine, others };
                    })()}
                  />
                </div>
              </>
            );
          })()}
        </div>

        {((flatMode ? flatEntries.length : grouped.length) === 0) && (() => {
          const anyFilter = !!query || isFiltered(filters) || adultOnly || !!confidantReadFilter;
          return (
            <div className="text-center py-12">
              <p className="font-serif text-text-muted/55 text-2xl mb-2">✦</p>
              <p className="font-serif text-text-muted italic text-sm">
                {anyFilter ? 'Aucun résultat.' : 'Rien encore.'}
              </p>
              {anyFilter && (
                <button
                  type="button"
                  onClick={() => { setQuery(''); setFilters(EMPTY_FILTERS); setAdultOnly(false); setConfidantReadFilter(null); }}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-text-muted/20 text-text-muted hover:border-accent/40 hover:text-accent transition-colors"
                >
                  Réinitialiser les filtres
                </button>
              )}
            </div>
          );
        })()}

        {flatMode ? (
          // Vue plate : tri par updatedAt, pas de regroupement par date. Chaque
          // carte garde son badge date (présent dans EntryCardView). On ajoute
          // un petit pill « modifié il y a Xh » au-dessus de la carte.
          <div className="flex flex-col gap-3">
            {visibleFlatEntries.map((entry) => (
              <div key={entry.id} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 px-1">
                  <span className="font-mono text-[11px] uppercase tracking-widest text-text-muted/50">
                    {formatRelativeUpdate(entry.updatedAt)}
                  </span>
                  <span className="text-[11px] text-text-muted/45">·</span>
                  <span className="text-[11px] italic text-text-muted/60">
                    note du {formatDateLong(entry.date)}
                  </span>
                </div>
                <EntryCard
                  entry={entry}
                  isReadByConfidant={confidantReadSet.has(entry.id)}
                  onDesktopClick={(opts) => {
                        setDesktopOpenToComments(!!opts?.comments);
                        setActiveDesktopEntryId(entry.id);
                      }}
                  isActivePanel={activeDesktopEntryId === entry.id}
                  selectable={selectMode}
                  selected={selectedIds.has(entry.id)}
                  compactMode={compactMode}
                  onSelect={() => setSelectedIds((prev) => {
                    const next = new Set(prev);
                    next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
                    return next;
                  })}
                  onTagClick={(tag) => setFilters((prev) => ({ ...prev, tags: prev.tags.includes(tag) ? prev.tags : [...prev.tags, tag] }))}
                  onSave={sync}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {visibleGrouped.map(({ date, entries }, idx) => (
              <section key={date}>
                {idx > 0 && <div className="h-px bg-text-muted/[0.08] my-6" />}
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 mb-3 px-1">
                  <span className="font-serif italic text-xl text-text-primary/80 capitalize">
                    {formatDateLong(date)}
                  </span>
                  {dailyLogByDate.has(date) && (
                    <DailyLogRecap log={dailyLogByDate.get(date)} date={date} editable />
                  )}
                </div>
                <div className="flex flex-col gap-3">
                  {entries.map((entry) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      isReadByConfidant={confidantReadSet.has(entry.id)}
                      onDesktopClick={(opts) => {
                        setDesktopOpenToComments(!!opts?.comments);
                        setActiveDesktopEntryId(entry.id);
                      }}
                      isActivePanel={activeDesktopEntryId === entry.id}
                      selectable={selectMode}
                      selected={selectedIds.has(entry.id)}
                      compactMode={compactMode}
                      onSelect={() => setSelectedIds((prev) => {
                        const next = new Set(prev);
                        next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
                        return next;
                      })}
                      onTagClick={(tag) => setFilters((prev) => ({ ...prev, tags: prev.tags.includes(tag) ? prev.tags : [...prev.tags, tag] }))}
                      onSave={sync}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Sentinel pour lazy load : quand visible (rootMargin 600px), on
            charge +50 entries. Voir useEffect ci-dessus. */}
        {hasMore && (
          <div ref={sentinelRef} className="h-8 flex items-center justify-center text-[11px] text-text-muted/55">
            … {totalEntries - visibleCount} note{totalEntries - visibleCount > 1 ? 's' : ''} à venir
          </div>
        )}

        {selectMode && (
          <BulkActionBar
            count={selectedIds.size}
            totalCount={allFilteredEntries.length}
            allSelected={selectedIds.size === allFilteredEntries.length && allFilteredEntries.length > 0}
            selectedEntries={allFilteredEntries.filter((e) => selectedIds.has(e.id))}
            onSelectAll={() => setSelectedIds(new Set(allFilteredEntries.map((e) => e.id)))}
            onDeselectAll={() => setSelectedIds(new Set())}
            onClose={() => { setSelectMode(false); setSelectedIds(new Set()); }}
            onApply={handleBulkApply}
          />
        )}

        <RangeExportSheet
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          initialFrom={filters.from || undefined}
          initialTo={filters.to || undefined}
        />

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
            desktopPanel
            openToComments={desktopOpenToComments}
            onModalClose={() => { setDesktopOpenToComments(false); setActiveDesktopEntryId(null); }}
            onSave={sync}
            onTagClick={(tag) => setFilters((prev) => ({
              ...prev,
              tags: prev.tags.includes(tag) ? prev.tags : [...prev.tags, tag],
            }))}
          />
        </div>
      )}
    </div>
  );
}
