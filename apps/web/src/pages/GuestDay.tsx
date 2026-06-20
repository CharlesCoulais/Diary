import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { GuestTopBar } from '../components/GuestTopBar';
import { GuestEntryCard } from './GuestHome';
import { DailyLogRecap, type DailyLogRecapData } from '../components/DailyLogRecap';
import { GuestWritingIdeasView } from '../components/WritingIdeasPanel';
import { BackToTop } from '../components/BackToTop';
import { GuestBottomNav } from '../components/BottomNav';
import { getGuestDisplayPrefs, subscribeGuestPrefs, patchGuestDisplayPrefs } from '../lib/displayPrefs';
import { EntryFilters, EMPTY_FILTERS, applyFilters, collectAvailableMoods, isFiltered, type FilterState, type ReadGateStatus } from '../components/EntryFilters';
import type { NoteType } from '../components/NoteTypePicker';
import { useCollapsibleSection } from '../hooks/useCollapsibleSection';
import { useTrackPageHeaderHeight } from '../hooks/useTrackPageHeaderHeight';
import { ChevronToggle } from '../components/ChevronToggle';
import { isoToday, shiftDate, formatDateLong, relativeLabel, formatDateKicker } from '../lib/dateHelpers';
import { CalendarPanel } from '../components/DatePicker';

/** Version courte sans jour de la semaine — pour mobile où le kicker affiche déjà le jour complet.
 *  Spécifique à cette page (non partagé), pas remonté dans dateHelpers pour l'instant. */
function formatDateShort(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
  });
}

// ── Page principale ───────────────────────────────────────────────────────────

export function GuestDayPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const today = isoToday();
  const [selectedDate, setSelectedDate] = useState(() => searchParams.get('date') ?? today);
  const isToday = selectedDate === today;
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const { data: me } = trpc.auth.me.useQuery();
  const isConfidant = me?.guestAccess === 'CONFIDANT';

  // ── Filtres ────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FilterState>(() => {
    const p = getGuestDisplayPrefs();
    return p.defaultTypes.length > 0 ? { ...EMPTY_FILTERS, types: p.defaultTypes } : EMPTY_FILTERS;
  });
  const [adultOnly, setAdultOnly] = useState(false);
  const [forMeOnly, setForMeOnly] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [hideDrafts, setHideDrafts] = useState(() => getGuestDisplayPrefs().hideDrafts);
  const [hideAdult, setHideAdult] = useState(() => getGuestDisplayPrefs().hideAdult);
  const [hideMyForgotten, setHideMyForgotten] = useState(() => getGuestDisplayPrefs().hideMyForgotten);
  // Page Aujourd'hui (confident) → `compactToday` = défaut persisté. Le toggle
  // **persiste** désormais le choix (cohérent avec le Journal : le confident lit
  // surtout en compact et ne doit pas resauter au remount / à la navigation).
  const [compactMode, setCompactMode] = useState(() => getGuestDisplayPrefs().compactToday);
  const toggleCompactMode = useCallback(() => {
    const next = !compactMode;
    setCompactMode(next);
    patchGuestDisplayPrefs({ compactToday: next });
  }, [compactMode]);
  // Synchro robuste — same-tab (Réglages), cross-tab, bfcache (Android PWA).
  // Refresh tous les états dérivés des prefs.
  useEffect(() => subscribeGuestPrefs(() => {
    const p = getGuestDisplayPrefs();
    setCompactMode(p.compactToday);
    setHideDrafts(p.hideDrafts);
    setHideAdult(p.hideAdult);
    setHideMyForgotten(p.hideMyForgotten);
    setFilters((prev) => p.defaultTypes.length > 0
      ? { ...prev, types: p.defaultTypes }
      : { ...prev, types: [] });
  }), []);
  const [filtersCollapsed, toggleFiltersCollapsed] = useCollapsibleSection('guest-day', 'mobile');
  const { mobileRef: headerMobileRef, desktopRef: headerDesktopRef } = useTrackPageHeaderHeight();

  // Sync date avec les search params
  useEffect(() => {
    const d = searchParams.get('date');
    if (d && d !== selectedDate) setSelectedDate(d);
  }, [searchParams]);

  // ── Panel desktop ─────────────────────────────────────────────────────────
  const [isDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);
  const [activeDesktopEntryId, setActiveDesktopEntryId] = useState<string | null>(null);
  useEffect(() => { setActiveDesktopEntryId(null); }, [selectedDate]);

  // Notif push sur desktop : ouvre le panneau droit depuis ?entryId=…
  const focusedEntryIdFromUrl = searchParams.get('entryId') ?? undefined;
  useEffect(() => {
    if (!focusedEntryIdFromUrl) return;
    if (window.innerWidth >= 1024) setActiveDesktopEntryId(focusedEntryIdFromUrl);
  }, [focusedEntryIdFromUrl]);

  // Si l'entrée ciblée est d'un autre jour, naviguer vers ce jour.
  const { data: focusedEntryRemote } = trpc.entries.byId.useQuery(
    { id: focusedEntryIdFromUrl! },
    {
      enabled: !!focusedEntryIdFromUrl,
      staleTime: 5 * 60 * 1000,
      retry: false,
    },
  );
  useEffect(() => {
    if (!focusedEntryRemote) return;
    const entryDate = (focusedEntryRemote as any).date as string | undefined;
    if (entryDate && entryDate !== selectedDate) {
      setSelectedDate(entryDate);
      const params: Record<string, string> = { entryId: focusedEntryIdFromUrl! };
      if (entryDate !== today) params.date = entryDate;
      setSearchParams(params, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedEntryRemote]);

  const goToDate = (date: string) => {
    setSelectedDate(date);
    setSearchParams(date === today ? {} : { date }, { replace: true });
    setActiveDesktopEntryId(null);
  };

  // ── Entrées du jour ───────────────────────────────────────────────────────
  const { data: rawEntries = [], isLoading } = trpc.entries.list.useQuery(
    { date: selectedDate, limit: 50 },
    {
      refetchInterval: 60_000,
      gcTime: 60 * 60 * 1000,
    },
  );
  const allEntries = (rawEntries as any[]);

  // ── État "lu" ─────────────────────────────────────────────────────────────
  const { data: readIdsData = [], refetch: refetchReadIds, isSuccess: readIdsLoaded } = trpc.entries.readIds.useQuery(undefined, {
    enabled: me?.role === 'GUEST',
    staleTime: 60_000,
  });
  const readSet = new Set(readIdsData);
  const markRead = trpc.entries.markRead.useMutation({ onSuccess: () => refetchReadIds() });
  const markUnread = trpc.entries.markUnread.useMutation({ onSuccess: () => refetchReadIds() });

  // Snapshot des lues figé à l'activation du filtre « non lus » — voir GuestHome
  // pour le détail : évite qu'une note lue à l'ouverture disparaisse en direct.
  const [frozenReadIds, setFrozenReadIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!unreadOnly) { setFrozenReadIds(null); return; }
    if (frozenReadIds !== null || !readIdsLoaded) return;
    setFrozenReadIds(new Set(readIdsData));
  }, [unreadOnly, readIdsLoaded, frozenReadIds, readIdsData]);

  // ── Application des filtres ───────────────────────────────────────────────
  const availableTypes = [...new Set(allEntries.map((e: any) => e.noteType as NoteType))];
  const availableTags = [...new Set(allEntries.flatMap((e: any) => (e.tagNames as string[] | undefined) ?? []))].sort();
  // Compteur par tag affiché dans le dropdown du filtre.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tagCounts = (allEntries as any[]).reduce<Record<string, number>>((acc, e) => {
    ((e.tagNames ?? []) as string[]).forEach((t) => { acc[t] = (acc[t] ?? 0) + 1; });
    return acc;
  }, {});
  const availableMoods = collectAvailableMoods(allEntries);

  const searched = search.trim()
    ? allEntries.filter((e: any) => {
        const q = search.toLowerCase();
        return (
          (e.contentMd as string | undefined)?.toLowerCase().includes(q) ||
          (e.title as string | undefined)?.toLowerCase().includes(q) ||
          (e.mediaMeta?.subject as string | undefined)?.toLowerCase().includes(q)
        );
      })
    : allEntries;
  // Resolver verrou côté confident : son statut perso (1 par note).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gateStatusOf = (e: any): Set<ReadGateStatus> => {
    const s = e.readGateStatus;
    if (!s || s === 'awaiting') return new Set();
    if (s === 'approved' || s === 'rejected' || s === 'pending') return new Set<ReadGateStatus>([s]);
    return new Set();
  };
  const filtered = applyFilters(searched, filters, gateStatusOf, me?.id);
  const afterHideDrafts = hideDrafts ? filtered.filter((e: any) => !e.isDraft) : filtered;
  const afterAdult = adultOnly
    ? afterHideDrafts.filter((e: any) => !!e.isAdult)
    : (hideAdult ? afterHideDrafts.filter((e: any) => !e.isAdult) : afterHideDrafts);
  // « À oublier » : masque les notes que le confident a marquées LOW.
  // Bypass si un filtre « À oublier » explicite est actif dans la barre.
  const afterForgotten = (hideMyForgotten && me?.id && filters.lowFilter === null)
    ? afterAdult.filter((e: any) => {
        const ratings = (e.ratings ?? []) as Array<{ userId: string; value: 'FAVORITE' | 'LOW' }>;
        const mine = ratings.find((r) => r.userId === me.id);
        return mine?.value !== 'LOW';
      })
    : afterAdult;
  const afterForMe = forMeOnly ? afterForgotten.filter((e: any) => !!e.isForConfidant) : afterForgotten;
  const afterUnread = unreadOnly
    ? afterForMe.filter((e: any) => {
        const id = e.id as string;
        if (!frozenReadIds) return !readSet.has(id);
        return !(frozenReadIds.has(id) && readSet.has(id));
      })
    : afterForMe;
  // Notif push (`?entryId=…`) : force la présence de l'entrée ciblée dans la
  // liste pour qu'elle s'ouvre normalement, même si les filtres par défaut
  // l'auraient masquée (cf. Home.tsx / GuestHome.tsx).
  let entries: typeof afterUnread = afterUnread;
  if (focusedEntryIdFromUrl && !entries.some((e: any) => e.id === focusedEntryIdFromUrl)) {
    const focused = (allEntries as any[]).find((e: any) => e.id === focusedEntryIdFromUrl);
    if (focused) entries = [focused, ...entries];
  }

  // ── Daily log du jour (confidant uniquement) ──────────────────────────────
  const { data: dailyLogs = [] } = trpc.dailyLog.list.useQuery(
    { from: selectedDate, to: selectedDate },
    {
      enabled: isConfidant,
      staleTime: 30_000,
    },
  );
  const dailyLog: DailyLogRecapData | undefined = dailyLogs[0] as DailyLogRecapData | undefined;

  const activeDesktopEntry = entries.find((e: any) => e.id === activeDesktopEntryId) ?? null;

  // ── Focus depuis URL ──────────────────────────────────────────────────────
  const focusedEntryId = searchParams.get('entryId') ?? undefined;
  const focusedCommentId = searchParams.get('commentId') ?? undefined;

  return (
    <div className="min-h-dvh pb-48 sm:pb-56 max-w-2xl mx-auto overflow-x-clip lg:max-w-none lg:px-0 lg:pb-0 lg:flex lg:items-start">

      {/* ── Colonne principale ─────────────────────────────────────────────── */}
      <div className={`px-6 lg:px-12 lg:pb-16 lg:min-h-dvh lg:min-w-0 ${activeDesktopEntryId ? 'lg:w-[520px] lg:shrink-0' : 'lg:flex-1'}`}>

        {/* Header mobile */}
        <div ref={headerMobileRef} className="lg:hidden sticky top-0 z-[11] -mx-6 px-6 pt-5 pb-4 mb-6 bg-bg-primary/90 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="font-mono text-[11px] tracking-widest uppercase text-text-muted/50 select-none">
              {formatDateKicker(selectedDate)}
            </p>
            <GuestTopBar />
          </div>
          {/* Navigation date mobile */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => goToDate(shiftDate(selectedDate, -1))}
              aria-label="Jour précédent"
              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors shrink-0"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>

            <div className="relative flex-1 text-center">
              <h1
                className="font-serif text-4xl text-text-primary capitalize tracking-tight cursor-pointer select-none whitespace-nowrap"
                onClick={() => setDatePickerOpen(true)}
              >
                {relativeLabel(selectedDate, today) ?? formatDateShort(selectedDate)}
              </h1>
              {datePickerOpen && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50">
                  <CalendarPanel
                    value={selectedDate}
                    onChange={(v) => { if (v) goToDate(v); }}
                    onClose={() => setDatePickerOpen(false)}
                    max={today}
                  />
                </div>
              )}
            </div>

            <button
              onClick={() => !isToday && goToDate(shiftDate(selectedDate, 1))}
              aria-label="Jour suivant"
              disabled={isToday}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors shrink-0 disabled:opacity-30 disabled:pointer-events-none"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>

        {/* Header desktop */}
        <div ref={headerDesktopRef} className={`hidden lg:flex items-center gap-4 sticky top-0 z-[11] -mx-12 px-12 bg-bg-primary/90 backdrop-blur-sm ${activeDesktopEntryId ? 'pt-5 pb-3 mb-1' : 'pt-10 pb-4 mb-2'}`}>
          {/* Flèche gauche */}
          <button
            onClick={() => goToDate(shiftDate(selectedDate, -1))}
            aria-label="Jour précédent"
            className="p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors shrink-0"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          {/* Titre centré + date picker */}
          <div className="flex-1 text-center relative">
            <p className={`font-mono text-[11px] tracking-widest uppercase text-text-muted/50 select-none ${activeDesktopEntryId ? 'mb-1' : 'mb-3'}`}>
              {formatDateKicker(selectedDate)}
            </p>
            <h1
              className={`font-serif text-text-primary capitalize tracking-tight cursor-pointer ${activeDesktopEntryId ? 'text-3xl' : 'text-7xl'}`}
              onClick={() => setDatePickerOpen(true)}
            >
              {relativeLabel(selectedDate, today) ?? formatDateLong(selectedDate)}
            </h1>
            {datePickerOpen && (
              <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50">
                <CalendarPanel
                  value={selectedDate}
                  onChange={(v) => { if (v) goToDate(v); }}
                  onClose={() => setDatePickerOpen(false)}
                  max={today}
                />
              </div>
            )}
          </div>

          {/* Flèche droite + Auj. */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => goToDate(shiftDate(selectedDate, 1))}
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
                onClick={() => goToDate(today)}
                className="text-xs text-accent hover:opacity-80 transition-opacity whitespace-nowrap px-1"
              >
                Auj.
              </button>
            )}
          </div>
        </div>

        {/* Daily log recap (confidant uniquement) */}
        {isConfidant && dailyLog && (
          <div className="mb-5">
            <DailyLogRecap log={dailyLog} date={selectedDate} className="w-full" />
          </div>
        )}

        {/* Notes à venir — confident voit en lecture seule les idées
            d'écriture de l'owner (visible uniquement aujourd'hui). */}
        {isConfidant && isToday && <GuestWritingIdeasView />}

        {/* Search + filters card — affiché uniquement s'il y a au moins une entrée */}
        {allEntries.length > 0 && (() => {
          const adultCount = allEntries.filter((e: any) => !!e.isAdult).length;
          const PILL_INACTIVE = 'border-text-muted/15 text-text-muted/60 hover:border-text-muted/30 hover:text-text-muted';
          const unreadCount = allEntries.filter((e: any) => !readSet.has(e.id as string)).length;
          const guestQp = (
            <>
              {/* 18+ déplacé dans le dropdown États (props adultOnly/onAdultOnlyChange) */}
              {isConfidant && (
                <button
                  type="button"
                  onClick={() => setForMeOnly((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 ${forMeOnly ? 'bg-accent/15 border-accent/40 text-accent font-medium' : PILL_INACTIVE}`}
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" stroke="none" className={`shrink-0 ${forMeOnly ? 'text-accent' : 'text-text-muted/55'}`}>
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                  Pour moi
                  {!forMeOnly && <span className="text-text-muted/50">({allEntries.filter((e: any) => !!e.isForConfidant).length})</span>}
                </button>
              )}
            </>
          );
          const unreadPill = unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => setUnreadOnly((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 ${unreadOnly ? 'bg-warning/15 border-warning/40 text-warning font-medium' : PILL_INACTIVE}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${unreadOnly ? 'bg-warning' : 'bg-text-muted/40'}`} />
              Non lu {!unreadOnly && `(${unreadCount})`}
            </button>
          ) : undefined;
          return (
            <div className="sticky top-[var(--page-header-h,96px)] z-[10] bg-bg-elevated rounded-2xl shadow-soft mb-4">
              {/* Search row */}
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
                {(entries.length !== allEntries.length || search.trim()) && (
                  <span className="text-xs text-text-muted/55 shrink-0 tabular-nums">
                    {entries.length}<span className="opacity-60"> / {allEntries.length}</span>
                  </span>
                )}
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
                {availableTypes.length > 0 && <ChevronToggle collapsed={filtersCollapsed} onClick={toggleFiltersCollapsed} />}
              </div>

              {/* Mini-résumé des filtres actifs (mode replié) */}
              {availableTypes.length > 0 && filtersCollapsed && (isFiltered(filters) || adultOnly || unreadOnly || forMeOnly) && (() => {
                const chips: string[] = [];
                if (filters.types.length > 0) chips.push(filters.types.length === 1 ? (filters.types[0] as string) : `${filters.types.length} types`);
                if (filters.tags.length > 0) chips.push(`${filters.tags.length} tag${filters.tags.length > 1 ? 's' : ''}`);
                if (filters.moods.length > 0) chips.push(`${filters.moods.length} mood${filters.moods.length > 1 ? 's' : ''}`);
                if (filters.isDraft) chips.push('Brouillons');
                if (filters.readGateStatuses.length > 0) chips.push(`Verrou (${filters.readGateStatuses.length})`);
                if (filters.capsuleStatuses.length > 0) chips.push(`Capsules (${filters.capsuleStatuses.length})`);
                if (adultOnly) chips.push('18+');
                if (forMeOnly) chips.push('Pour moi');
                if (unreadOnly) chips.push('Non lus');
                return (
                  <div className="px-3 pb-2 text-[11px] text-text-muted/70 flex items-center gap-1.5 -mt-1.5 truncate">
                    <span className="text-text-muted/55 shrink-0">Filtres :</span>
                    <span className="truncate">{chips.join(' · ')}</span>
                  </div>
                );
              })()}

              {/* Filter pills row */}
              {availableTypes.length > 0 && !filtersCollapsed && (
                <>
                  <div className="h-px bg-text-muted/[0.12]" />
                  <div className="px-3 py-2.5">
                    <EntryFilters
                      filters={filters} onChange={setFilters}
                      availableTypes={availableTypes} availableTags={availableTags} tagCounts={tagCounts} availableMoods={availableMoods}
                      sortMode="time-desc" onSortChange={() => {/* tri non utilisé sur un seul jour */}}
                      hideSortPicker
                      hideForConfidantPill
                      hideSecretPill
                      hideVisibilityFilter
                      showReadGateFilter={(allEntries as any[]).some((e) => !!e.readGatePrompt)}
                      showCapsuleFilter={(allEntries as any[]).some((e) => !!e.unlockAt)}
                      readGateCounts={(() => {
                        const c = { approved: 0, rejected: 0, pending: 0, unanswered: 0 } as Record<ReadGateStatus, number>;
                        for (const e of allEntries as any[]) {
                          if (!e.readGatePrompt) continue;
                          const s = e.readGateStatus;
                          if (!s || s === 'awaiting') c.unanswered++;
                          else if (s === 'approved' || s === 'rejected' || s === 'pending') c[s as ReadGateStatus]++;
                        }
                        return c;
                      })()}
                      capsuleCounts={(() => {
                        const nowMs = Date.now();
                        let locked = 0, unlocked = 0;
                        for (const e of allEntries as any[]) {
                          if (!e.unlockAt) continue;
                          if (new Date(e.unlockAt).getTime() > nowMs) locked++;
                          else unlocked++;
                        }
                        return { locked, unlocked };
                      })()}
                      counts={{
                        draft: allEntries.filter((e: any) => !!e.isDraft).length,
                        secret: allEntries.filter((e: any) => !!e.isSecret).length,
                      }}
                      quickPillsSlot={guestQp}
                      readPillsSlot={unreadPill}
                      viewerIsOwner={false}
                      adultOnly={adultOnly}
                      onAdultOnlyChange={setAdultOnly}
                      adultCount={adultCount}
                      favoritesCounts={(() => {
                        const meId = me?.id;
                        let any = 0, mine = 0, owner = 0;
                        for (const e of allEntries as any[]) {
                          const ratings = (e.ratings ?? []) as Array<{ userId: string; value: 'FAVORITE' | 'LOW' }>;
                          const favs = ratings.filter((r) => r.value === 'FAVORITE');
                          if (favs.length > 0) any++;
                          if (meId && favs.some((r) => r.userId === meId)) mine++;
                          if (e.authorId && favs.some((r) => r.userId === e.authorId)) owner++;
                        }
                        return { any, mine, owner };
                      })()}
                      lowCounts={(() => {
                        const meId = me?.id;
                        let any = 0, mine = 0, owner = 0;
                        for (const e of allEntries as any[]) {
                          const ratings = (e.ratings ?? []) as Array<{ userId: string; value: 'FAVORITE' | 'LOW' }>;
                          const lows = ratings.filter((r) => r.value === 'LOW');
                          if (lows.length > 0) any++;
                          if (meId && lows.some((r) => r.userId === meId)) mine++;
                          if (e.authorId && lows.some((r) => r.userId === e.authorId)) owner++;
                        }
                        return { any, mine, owner };
                      })()}
                    />
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* Liste des entrées */}
        {isLoading ? (
          <div className="flex flex-col gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-bg-elevated rounded-2xl h-32 animate-pulse opacity-40" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="py-16 text-center max-w-sm mx-auto px-6">
            <p className="font-serif text-text-muted/55 text-2xl mb-2">✦</p>
            {isToday ? (
              <>
                <p className="font-serif italic text-text-primary text-base mb-2">Rien encore aujourd'hui.</p>
                <p className="text-text-muted text-[13px] leading-relaxed">
                  Les notes du jour s'afficheront ici. En attendant, tu peux parcourir le <Link to="/" className="text-accent hover:underline">journal</Link>.
                </p>
              </>
            ) : (
              <p className="font-serif italic text-text-muted text-base">Aucune note ce jour-là.</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {entries.map((entry: any) => (
              <GuestEntryCard
                key={entry.id}
                entry={entry}
                defaultOpen={!isDesktop && entry.id === focusedEntryId}
                focusedCommentId={!isDesktop && entry.id === focusedEntryId ? focusedCommentId : undefined}
                isRead={readSet.has(entry.id as string)}
                onMarkRead={() => markRead.mutate({ entryId: entry.id as string })}
                onMarkUnread={() => markUnread.mutate({ entryId: entry.id as string })}
                onDesktopClick={() => setActiveDesktopEntryId(entry.id as string)}
                isActivePanel={activeDesktopEntryId === entry.id}
                compactMode={compactMode}
              />
            ))}
          </div>
        )}

        <BackToTop panelOpen={!!activeDesktopEntryId} />
      </div>

      <GuestBottomNav />

      {/* ── Panneau droit (desktop uniquement) ────────────────────────────── */}
      {activeDesktopEntry && (
        <div data-right-panel className="hidden lg:flex lg:flex-col lg:flex-1 lg:sticky lg:top-0 lg:self-start lg:h-dvh lg:border-l lg:border-text-muted/10 lg:overflow-hidden">
          <GuestEntryCard
            key={activeDesktopEntry.id}
            entry={activeDesktopEntry}
            desktopPanel
            defaultOpen
            focusedCommentId={activeDesktopEntry.id === focusedEntryId ? focusedCommentId : undefined}
            isRead={readSet.has(activeDesktopEntry.id)}
            onMarkRead={() => markRead.mutate({ entryId: activeDesktopEntry.id })}
            onMarkUnread={() => markUnread.mutate({ entryId: activeDesktopEntry.id })}
            onModalClose={() => setActiveDesktopEntryId(null)}
          />
        </div>
      )}
    </div>
  );
}
