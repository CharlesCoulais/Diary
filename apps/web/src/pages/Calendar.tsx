import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useModalA11y } from '../hooks/useModalA11y';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LocalEntry, type LocalDailyLog } from '../lib/db/schema';
import { BottomNav } from '../components/BottomNav';
import { BackToTop } from '../components/BackToTop';
import { OwnerTopBar } from '../components/OwnerTopBar';
import { GuestTopBar } from '../components/GuestTopBar';
import { NOTE_TYPE_CONFIG, resolveNoteTypeConfig } from '../components/NoteTypePicker';
import { useNoteTypeDefs } from '../lib/useNoteTypeDefs';
import { parsePreviewRuns } from '../lib/previewRuns';
import { DailyLogRecap } from '../components/DailyLogRecap';
import { useBackButtonClose } from '../hooks/useBackButtonClose';
import { trpc } from '../lib/trpc';

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewMode = 'notes' | 'mood' | 'anxiety' | 'energy' | 'weather' | 'sleep';

const VIEWS = [
  { id: 'notes' as ViewMode,   emoji: '📝', label: 'Notes' },
  { id: 'mood' as ViewMode,    emoji: '😊', label: 'Humeur' },
  { id: 'anxiety' as ViewMode, emoji: '😤', label: 'Anxiété' },
  { id: 'energy' as ViewMode,  emoji: '⚡', label: 'Énergie' },
  { id: 'weather' as ViewMode, emoji: '🌤', label: 'Météo' },
  { id: 'sleep' as ViewMode,   emoji: '😴', label: 'Sommeil' },
] as const;

// ── Color helpers ─────────────────────────────────────────────────────────────

// anxiety 1-5 (1=calme/vert, 5=anxieux/rouge)
const ANXIETY_HEX = ['', '#7a9b76', '#a3b87d', '#d4a843', '#c88b4a', '#c25b52'];
// energy 1-5 (1=faible/gris, 5=élevé/jaune)
const ENERGY_HEX = ['', '#808ca0', '#7a9b76', '#6fb87a', '#98cc55', '#d4b43a'];

function sleepHex(h: number): string {
  if (h < 5) return '#c25b52';
  if (h < 6) return '#c88b4a';
  if (h < 7) return '#d4a843';
  if (h <= 9) return '#7a9b76';
  return '#6d8bb0';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function monthName(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

const MONTH_ABBR = ['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];

/**
 * Sélecteur mois/année (JRNL-06) : évite la navigation mois-par-mois (24 taps pour
 * reculer 2 ans). Sélecteur d'année (‹ ›) + grille de 12 mois. Les mois futurs au-delà
 * du mois courant sont désactivés (le calendrier ne va pas dans le futur).
 */
function MonthYearPicker({ year, month, maxYear, maxMonth, onPick, onClose }: {
  year: number;
  month: number;
  maxYear: number;
  maxMonth: number;
  onPick: (y: number, m: number) => void;
  onClose: () => void;
}) {
  const [viewYear, setViewYear] = useState(year);
  const ref = useModalA11y<HTMLDivElement>(onClose);
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Choisir le mois et l'année"
        onClick={(e) => e.stopPropagation()}
        className="relative bg-bg-elevated rounded-2xl shadow-2xl p-4 w-full max-w-xs"
      >
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => setViewYear((y) => y - 1)}
            aria-label="Année précédente"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-text-muted/10 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <span className="font-serif text-xl text-text-primary tabular-nums">{viewYear}</span>
          <button
            type="button"
            onClick={() => setViewYear((y) => Math.min(maxYear, y + 1))}
            disabled={viewYear >= maxYear}
            aria-label="Année suivante"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-text-muted/10 transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {MONTH_ABBR.map((label, i) => {
            const m = i + 1;
            const isFuture = viewYear > maxYear || (viewYear === maxYear && m > maxMonth);
            const isActive = viewYear === year && m === month;
            return (
              <button
                key={m}
                type="button"
                disabled={isFuture}
                onClick={() => onPick(viewYear, m)}
                className={`min-h-[40px] rounded-lg text-sm transition-colors disabled:opacity-30 disabled:pointer-events-none ${
                  isActive ? 'bg-accent/15 text-accent ring-1 ring-accent/40 font-medium' : 'text-text-primary hover:bg-text-muted/10'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function firstWeekday(year: number, month: number): number {
  const d = new Date(year, month - 1, 1).getDay();
  return d === 0 ? 6 : d - 1;
}

function computeStreaks(writtenDays: Set<string>, today: string) {
  const yesterday = addDays(today, -1);
  const todayWritten = writtenDays.has(today);
  let current = 0;
  let cursor: string | null = todayWritten ? today : writtenDays.has(yesterday) ? yesterday : null;
  while (cursor && writtenDays.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  return { current, todayWritten };
}

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function firstEmoji(s: string | null | undefined): string | null {
  if (!s) return null;
  const seg = new Intl.Segmenter();
  for (const { segment } of seg.segment(s)) {
    if (segment.trim()) return segment;
  }
  return null;
}

function strip(md: string, max = 90): string {
  const runs = parsePreviewRuns(md);
  const text = runs.map((r) => r.text).join(' · ').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}

// ── Stat chip ─────────────────────────────────────────────────────────────────

function StatChip({
  emoji,
  value,
  title,
  accent,
}: {
  emoji: string;
  value?: string | number;
  title: string;
  accent?: boolean;
}) {
  return (
    <div
      title={title}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${accent ? 'bg-accent/15 text-accent' : 'bg-bg-elevated text-text-primary'}`}
    >
      <span className="text-base leading-none">{emoji}</span>
      {value !== undefined && value !== '' && <span className="font-medium">{value}</span>}
    </div>
  );
}

// ── DayBody ───────────────────────────────────────────────────────────────────

function DayBody({
  date,
  entries,
  dailyLog,
  onClose,
  onOpen,
}: {
  date: string;
  entries: LocalEntry[];
  dailyLog: LocalDailyLog | undefined;
  onClose: () => void;
  onOpen: () => void;
}) {
  const { defsById } = useNoteTypeDefs();
  const sorted = useMemo(
    () => [...entries].sort((a, b) => (a.timeLabel ?? '99:99').localeCompare(b.timeLabel ?? '99:99') || a.createdAt.localeCompare(b.createdAt)),
    [entries],
  );

  const formatted = new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      {/* Header */}
      <div className="px-5 pt-2 pb-3 flex items-start justify-between gap-3 border-b border-text-muted/10 shrink-0">
        <div>
          <p className="text-text-primary font-serif text-xl capitalize leading-tight">{formatted}</p>
          <p className="text-xs text-text-muted/60 mt-0.5">
            {sorted.length} note{sorted.length > 1 ? 's' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="tap w-8 h-8 flex items-center justify-center rounded-full text-text-muted/50 hover:text-text-primary hover:bg-bg-primary/60 transition-colors shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto hide-scrollbar px-5 py-3 flex flex-col gap-2">
        {dailyLog && (
          <div className="flex justify-center mb-1">
            <DailyLogRecap log={dailyLog} date={date} editable />
          </div>
        )}
        {sorted.length === 0 && !dailyLog ? (
          <p className="text-sm text-text-muted/50 italic py-6 text-center">Pas d'entrée ce jour.</p>
        ) : sorted.length === 0 ? null : (
          sorted.map((e) => {
            const cfg = resolveNoteTypeConfig(e, defsById);
            const moodEmoji = firstEmoji(e.mood);
            const m = e.mediaMeta ?? {};
            const headline = e.title || (m as Record<string, unknown>).subject as string || strip(e.contentMd, 60) || `${cfg.label}`;
            const preview = e.title || (m as Record<string, unknown>).subject ? strip(e.contentMd, 80) : '';
            return (
              <div
                key={e.id}
                className="rounded-xl bg-bg-primary/40 px-3 py-2 border-l-2"
                style={{ borderLeftColor: cfg.color }}
              >
                <div className="flex items-center gap-2 mb-0.5 text-xs">
                  <span className="inline-flex items-center gap-1 font-medium" style={{ color: cfg.color }}>
                    <cfg.Glyph className="w-3 h-3 shrink-0" /> {cfg.label}
                  </span>
                  {e.timeLabel && <span className="text-text-muted/60">{e.timeLabel}</span>}
                  {moodEmoji && <span>{moodEmoji}</span>}
                  {e.isDraft && <span className="text-[11px] px-1 rounded-full bg-warning/15 text-warning">brouillon</span>}
                  {e.isSecret && <span className="text-[11px] px-1 rounded-full bg-secret/15 text-secret">🔒</span>}
                </div>
                <p className="text-sm text-text-primary font-medium leading-snug line-clamp-1">{headline}</p>
                {preview && (
                  <p className="text-xs text-text-muted/70 leading-relaxed line-clamp-2 mt-0.5">{preview}</p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-text-muted/10 shrink-0">
        <button
          type="button"
          onClick={onOpen}
          className="w-full py-2.5 rounded-xl bg-accent text-bg-primary text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Ouvrir cette journée →
        </button>
      </div>
    </>
  );
}

// ── DaySheet (mobile bottom-sheet) ────────────────────────────────────────────

function DaySheet({
  date,
  entries,
  dailyLog,
  onClose,
  onOpen,
}: {
  date: string;
  entries: LocalEntry[];
  dailyLog: LocalDailyLog | undefined;
  onClose: () => void;
  onOpen: () => void;
}) {
  useBackButtonClose(true, onClose);
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 max-h-[85svh] bg-bg-elevated rounded-t-3xl shadow-2xl flex flex-col">
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-text-muted/20" />
        </div>
        <DayBody date={date} entries={entries} dailyLog={dailyLog} onClose={onClose} onOpen={onOpen} />
      </div>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function CalendarPage() {
  const navigate = useNavigate();
  const { data: me } = trpc.auth.me.useQuery();
  const { defsById } = useNoteTypeDefs();
  const today = isoToday();
  const todayYear = parseInt(today.slice(0, 4), 10);
  const todayMonth = parseInt(today.slice(5, 7), 10);

  const [year, setYear] = useState(todayYear);
  const [month, setMonth] = useState(todayMonth);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('notes');
  const [pickerOpen, setPickerOpen] = useState(false);

  const isOwner = me?.role === 'OWNER';
  // Owner : Dexie (offline-first). Confident : pas de sync Dexie → lecture serveur
  // (`entries.calendarData` / `dailyLog.list`). `as unknown` casse la profondeur tRPC.
  const dexieEntries = useLiveQuery(
    () => db.entries.filter((e) => e.deletedAt === null && !e.collectionOnly).toArray(),
    [],
  );
  const { data: serverEntries } = trpc.entries.calendarData.useQuery(undefined, { enabled: !!me && !isOwner });
  const allEntries = ((isOwner ? dexieEntries : (serverEntries as unknown)) ?? []) as LocalEntry[];

  const dexieDailyLogs = useLiveQuery(
    () => db.dailyLogs.filter((dl) => dl.deletedAt === null).toArray(),
    [],
  );
  const { data: serverDailyLogs } = trpc.dailyLog.list.useQuery(undefined, { enabled: !!me && !isOwner });
  const dailyLogs = ((isOwner ? dexieDailyLogs : (serverDailyLogs as unknown)) ?? []) as LocalDailyLog[];
  const dailyLogByDate = useMemo(
    () => new Map<string, LocalDailyLog>(dailyLogs.map((dl) => [dl.date, dl])),
    [dailyLogs],
  );

  const isLoading = isOwner ? dexieEntries === undefined : serverEntries === undefined;

  const { entriesByDate, monthEntries } = useMemo(() => {
    const byDate = new Map<string, LocalEntry[]>();
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
    const monthArr: LocalEntry[] = [];
    for (const e of allEntries) {
      const arr = byDate.get(e.date) ?? [];
      arr.push(e);
      byDate.set(e.date, arr);
      if (e.date.startsWith(monthPrefix)) monthArr.push(e);
    }
    return { entriesByDate: byDate, monthEntries: monthArr };
  }, [allEntries, year, month]);

  const monthStats = useMemo(() => {
    const totalDays = daysInMonth(year, month);
    const writtenDates = new Set(monthEntries.map((e) => e.date));
    const daysWritten = writtenDates.size;

    const segmenter = new Intl.Segmenter();
    const moodCounts: Record<string, number> = {};
    for (const e of monthEntries) {
      if (!e.mood) continue;
      for (const { segment } of segmenter.segment(e.mood)) {
        if (segment.trim()) moodCounts[segment] = (moodCounts[segment] ?? 0) + 1;
      }
    }
    const topMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const sleeps = monthEntries.map((e) => e.sleepHours).filter((s): s is number => typeof s === 'number');
    const avgSleep = sleeps.length > 0 ? sleeps.reduce((a, b) => a + b, 0) / sleeps.length : null;

    return { totalDays, daysWritten, totalEntries: monthEntries.length, topMood, avgSleep };
  }, [monthEntries, year, month]);

  const streak = useMemo(() => {
    const writtenDays = new Set(allEntries.map((e) => e.date));
    return computeStreaks(writtenDays, today);
  }, [allEntries, today]);

  const days = daysInMonth(year, month);
  const offset = firstWeekday(year, month);
  const isCurrentMonth = year === todayYear && month === todayMonth;

  function prevMonth() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (isCurrentMonth) return;
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  }

  function goToday() {
    setYear(todayYear);
    setMonth(todayMonth);
  }

  function handleDayClick(day: number) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDate((prev) => (prev === dateStr ? null : dateStr));
  }

  const cells: Array<{ day: number } | null> = [
    ...Array(offset).fill(null),
    ...Array.from({ length: days }, (_, i) => ({ day: i + 1 })),
  ];

  const selectedEntries = selectedDate ? entriesByDate.get(selectedDate) ?? [] : [];

  // ── Legend config per view mode ───────────────────────────────────────────

  function renderLegend() {
    if (viewMode === 'notes') {
      return (
        <div className="flex flex-wrap gap-2 mt-4">
          {/* JOURNAL inclus : ses pastilles apparaissent sur les cellules, la légende doit l'expliquer (JRNL-08). */}
          {NOTE_TYPE_CONFIG.map((c) => (
            <span key={c.value} className="flex items-center gap-1 text-xs text-text-muted/70">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
              {c.label}
            </span>
          ))}
        </div>
      );
    }
    if (viewMode === 'anxiety') {
      const items = [
        { label: '1 Calme', hex: ANXIETY_HEX[1] },
        { label: '2', hex: ANXIETY_HEX[2] },
        { label: '3 Modéré', hex: ANXIETY_HEX[3] },
        { label: '4', hex: ANXIETY_HEX[4] },
        { label: '5 Stressé', hex: ANXIETY_HEX[5] },
      ];
      return (
        <div className="flex flex-wrap gap-2 mt-4">
          {items.map((it) => (
            <span key={it.label} className="flex items-center gap-1 text-xs text-text-muted/70">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: it.hex }} />
              {it.label}
            </span>
          ))}
        </div>
      );
    }
    if (viewMode === 'energy') {
      const items = [
        { label: '1 Faible', hex: ENERGY_HEX[1] },
        { label: '2', hex: ENERGY_HEX[2] },
        { label: '3 Moyen', hex: ENERGY_HEX[3] },
        { label: '4', hex: ENERGY_HEX[4] },
        { label: '5 Élevé', hex: ENERGY_HEX[5] },
      ];
      return (
        <div className="flex flex-wrap gap-2 mt-4">
          {items.map((it) => (
            <span key={it.label} className="flex items-center gap-1 text-xs text-text-muted/70">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: it.hex }} />
              {it.label}
            </span>
          ))}
        </div>
      );
    }
    if (viewMode === 'sleep') {
      const items = [
        { label: '< 5h', hex: sleepHex(4) },
        { label: '5-6h', hex: sleepHex(5.5) },
        { label: '6-7h', hex: sleepHex(6.5) },
        { label: '7-9h', hex: sleepHex(8) },
        { label: '> 9h', hex: sleepHex(10) },
      ];
      return (
        <div className="flex flex-wrap gap-2 mt-4">
          {items.map((it) => (
            <span key={it.label} className="flex items-center gap-1 text-xs text-text-muted/70">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: it.hex }} />
              {it.label}
            </span>
          ))}
        </div>
      );
    }
    return null;
  }

  // ── Cell renderer ─────────────────────────────────────────────────────────

  function renderCell(day: number, dateStr: string) {
    const dayEntries = entriesByDate.get(dateStr) ?? [];
    const dailyLog = dailyLogByDate.get(dateStr);
    const isTodays = dateStr === today;
    const isFuture = dateStr > today;
    const isSelected = dateStr === selectedDate;

    const baseClasses = [
      // Mobile : hauteur min 48px (cible tactile ≥ 44px + lisibilité) au lieu d'un
      // carré ~43px ; sm+ : carré classique (cellules déjà plus grandes).
      'relative min-h-[48px] sm:min-h-0 sm:aspect-square flex flex-col items-center justify-center rounded-xl transition-all duration-150',
      isSelected ? 'ring-2 ring-accent' : isTodays ? 'ring-1 ring-accent/40' : '',
      isFuture ? 'opacity-40 pointer-events-none' : '',
    ].filter(Boolean).join(' ');

    if (viewMode === 'notes') {
      const count = dayEntries.length;
      const hasEntries = count > 0;
      // Une pastille par type distinct présent ce jour — résolu (les types
      // custom donnent leur propre couleur, dédupliqués par identité résolue).
      const byValue = new Map<string, { value: string; color: string }>();
      for (const e of dayEntries) {
        const cfg = resolveNoteTypeConfig(e, defsById);
        if (!byValue.has(cfg.value)) byValue.set(cfg.value, { value: cfg.value, color: cfg.color });
      }
      const sortedTypes = [...byValue.values()].sort(
        (a, b) => NOTE_TYPE_CONFIG.findIndex((c) => c.value === a.value) - NOTE_TYPE_CONFIG.findIndex((c) => c.value === b.value),
      );
      const dotsShown = sortedTypes.slice(0, 3);
      const moreDots = Math.max(0, count > 3 ? count - 3 : sortedTypes.length - 3);
      return (
        <button
          key={dateStr}
          type="button"
          onClick={() => handleDayClick(day)}
          disabled={isFuture}
          className={`${baseClasses} gap-0.5 ${isTodays ? 'bg-accent/15 text-accent font-semibold' : hasEntries ? 'hover:bg-bg-elevated text-text-primary' : 'hover:bg-bg-elevated text-text-muted/50'}`}
        >
          <span className="text-[13px] leading-none">{day}</span>
          {hasEntries && (
            <div className="flex items-center gap-0.5">
              {dotsShown.map((t) => (
                <span key={t.value} className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
              ))}
              {moreDots > 0 && (
                <span className="text-[10px] text-text-muted/60 leading-none ml-0.5">+{moreDots}</span>
              )}
            </div>
          )}
        </button>
      );
    }

    if (viewMode === 'mood') {
      const moodEmoji = dailyLog?.mood
        ? firstEmoji(dailyLog.mood)
        : dayEntries.length > 0
        ? firstEmoji(dayEntries[0]?.mood ?? null)
        : null;
      const hasData = !!moodEmoji;
      return (
        <button
          key={dateStr}
          type="button"
          onClick={() => handleDayClick(day)}
          disabled={isFuture}
          className={`${baseClasses} ${isTodays ? 'bg-accent/15 font-semibold' : 'hover:bg-bg-elevated'}`}
        >
          {hasData ? (
            <>
              <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[11px] text-text-primary/50 leading-none">{day}</span>
              <span className="text-xl leading-none">{moodEmoji}</span>
            </>
          ) : (
            <span className="text-[13px] leading-none text-text-primary/30">{day}</span>
          )}
        </button>
      );
    }

    if (viewMode === 'anxiety') {
      const val = dailyLog?.anxiety ?? 0;
      const hasData = val > 0;
      const bgHex = hasData ? ANXIETY_HEX[val] + '40' : undefined;
      return (
        <button
          key={dateStr}
          type="button"
          onClick={() => handleDayClick(day)}
          disabled={isFuture}
          className={`${baseClasses} ${isTodays ? 'font-semibold' : 'hover:bg-bg-elevated'}`}
          style={bgHex ? { backgroundColor: bgHex } : undefined}
        >
          <span className={`text-[13px] leading-none ${hasData ? 'text-text-primary' : 'text-text-primary/30'}`}>{day}</span>
        </button>
      );
    }

    if (viewMode === 'energy') {
      const val = dailyLog?.energy ?? 0;
      const hasData = val > 0;
      const bgHex = hasData ? ENERGY_HEX[val] + '40' : undefined;
      return (
        <button
          key={dateStr}
          type="button"
          onClick={() => handleDayClick(day)}
          disabled={isFuture}
          className={`${baseClasses} ${isTodays ? 'font-semibold' : 'hover:bg-bg-elevated'}`}
          style={bgHex ? { backgroundColor: bgHex } : undefined}
        >
          <span className={`text-[13px] leading-none ${hasData ? 'text-text-primary' : 'text-text-primary/30'}`}>{day}</span>
        </button>
      );
    }

    if (viewMode === 'weather') {
      const weatherEmoji = dailyLog?.weather ? firstEmoji(dailyLog.weather) : null;
      const hasData = !!weatherEmoji;
      return (
        <button
          key={dateStr}
          type="button"
          onClick={() => handleDayClick(day)}
          disabled={isFuture}
          className={`${baseClasses} ${isTodays ? 'bg-accent/15 font-semibold' : 'hover:bg-bg-elevated'}`}
        >
          {hasData ? (
            <>
              <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[11px] text-text-primary/50 leading-none">{day}</span>
              <span className="text-xl leading-none">{weatherEmoji}</span>
            </>
          ) : (
            <span className="text-[13px] leading-none text-text-primary/30">{day}</span>
          )}
        </button>
      );
    }

    if (viewMode === 'sleep') {
      const h = dailyLog?.sleepHours ?? null;
      const hasData = h != null;
      const bgHex = hasData ? sleepHex(h!) + '40' : undefined;
      return (
        <button
          key={dateStr}
          type="button"
          onClick={() => handleDayClick(day)}
          disabled={isFuture}
          className={`${baseClasses} ${isTodays ? 'font-semibold' : 'hover:bg-bg-elevated'}`}
          style={bgHex ? { backgroundColor: bgHex } : undefined}
        >
          <span className={`text-[13px] leading-none ${hasData ? 'text-text-primary' : 'text-text-primary/30'}`}>{day}</span>
          {hasData && (
            <span className="text-[11px] text-text-muted/60 mt-0.5">{h}h</span>
          )}
        </button>
      );
    }

    return null;
  }

  // ── Calendar content (shared between desktop left col and mobile) ──────────

  const calendarContent = (
    <>
      {/* Header mobile */}
      <div className="xl:hidden sticky top-0 z-[11] px-6 pt-5 pb-6 mb-6 bg-bg-primary/90 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-3">
          <p className="font-mono text-[11px] tracking-widest uppercase text-text-muted/50 select-none">Calendrier</p>
          {me?.role === 'OWNER' ? <OwnerTopBar /> : <GuestTopBar />}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={prevMonth}
            aria-label="Mois précédent"
            className="p-2.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            aria-haspopup="dialog"
            aria-label={`${monthName(year, month)} — changer de mois`}
            className="flex-1 text-center font-serif text-4xl text-text-primary capitalize tracking-tight hover:text-accent transition-colors"
          >
            {monthName(year, month)}
          </button>
          <div className="flex items-center gap-1 shrink-0">
            {!isCurrentMonth && (
              <button type="button" onClick={goToday} className="text-xs font-medium text-accent border border-accent/30 hover:bg-accent/10 rounded-full px-2.5 py-1 transition-colors">
                Auj.
              </button>
            )}
            <button
              type="button"
              onClick={nextMonth}
              disabled={isCurrentMonth}
              aria-label="Mois suivant"
              className="p-2.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-30 disabled:pointer-events-none shrink-0"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Header desktop */}
      <div className="hidden xl:flex items-center gap-4 sticky top-0 z-[11] bg-bg-primary/90 backdrop-blur-sm px-8 pt-10 pb-6 mb-4">
        <button
          type="button"
          onClick={prevMonth}
          aria-label="Mois précédent"
          className="p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors shrink-0"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="flex-1 text-center">
          <p className="font-mono text-[11px] tracking-widest uppercase text-text-muted/50 mb-3 select-none text-left">Calendrier</p>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            aria-haspopup="dialog"
            aria-label={`${monthName(year, month)} — changer de mois`}
            className="font-serif text-6xl text-text-primary tracking-tight capitalize hover:text-accent transition-colors"
          >
            {monthName(year, month)}
          </button>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isCurrentMonth && (
            <button type="button" onClick={goToday} className="text-xs text-accent hover:opacity-80 transition-opacity px-1">
              Auj.
            </button>
          )}
          <button
            type="button"
            onClick={nextMonth}
            disabled={isCurrentMonth}
            aria-label="Mois suivant"
            className="p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content wrapper */}
      <div className="px-6 xl:px-8 xl:max-w-[520px] xl:mx-auto">
        {/* Stats chips */}
        <div className="flex flex-wrap gap-1.5 mb-5">
          <StatChip
            emoji="🔥"
            value={streak.current}
            title={`Streak${streak.current > 0 ? (streak.todayWritten ? " — écrit aujourd'hui" : ' — à confirmer') : ''}`}
            accent={streak.current > 0}
          />
          <StatChip
            emoji="📅"
            value={`${monthStats.daysWritten}/${monthStats.totalDays}`}
            title={`Jours écrits ce mois (${Math.round((monthStats.daysWritten / monthStats.totalDays) * 100)}%)`}
          />
          <StatChip
            emoji="✏️"
            value={`${monthStats.totalEntries} notes`}
            title={monthStats.daysWritten > 0 ? `${monthStats.totalEntries} notes (~${(monthStats.totalEntries / monthStats.daysWritten).toFixed(1)}/jour)` : `${monthStats.totalEntries} notes`}
          />
          {monthStats.topMood && (
            <StatChip emoji={monthStats.topMood} title="Mood dominant ce mois" />
          )}
          {monthStats.avgSleep != null && (
            <StatChip emoji="😴" value={`${monthStats.avgSleep.toFixed(1)}h`} title="Sommeil moyen ce mois" />
          )}
        </div>

        {/* View switch */}
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar pb-1 mb-4">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setViewMode(v.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap shrink-0 transition-colors ${viewMode === v.id ? 'bg-accent/20 text-accent font-medium' : 'bg-bg-elevated text-text-muted hover:text-text-primary'}`}
            >
              <span>{v.emoji}</span> {v.label}
            </button>
          ))}
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center text-xs text-text-muted/50 font-medium py-1">{d}</div>
          ))}
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="text-center py-8 text-text-muted/55 text-sm">Chargement…</div>
        ) : (
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((cell, i) => {
              if (!cell) return <div key={`empty-${i}`} className="min-h-[48px] sm:min-h-0 sm:aspect-square" />;
              const { day } = cell;
              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              return renderCell(day, dateStr);
            })}
          </div>
        )}

        {/* Legend */}
        {renderLegend()}
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="xl:flex xl:h-screen xl:overflow-hidden">
        {/* Left column */}
        <div className="xl:flex-1 xl:min-w-0 xl:h-full xl:overflow-y-auto scrollbar-soft xl:overflow-x-hidden xl:border-r xl:border-text-muted/[0.08] pb-48 sm:pb-56 xl:pb-8">
          {calendarContent}
        </div>

        {/* Right column (desktop only) */}
        <div data-right-panel className="hidden xl:flex xl:w-[440px] xl:shrink-0 flex-col h-full overflow-hidden">
          {selectedDate ? (
            <DayBody
              date={selectedDate}
              entries={selectedEntries}
              dailyLog={dailyLogByDate.get(selectedDate)}
              onClose={() => setSelectedDate(null)}
              onOpen={() => {
                const d = selectedDate;
                setSelectedDate(null);
                navigate(`/?date=${d}`);
              }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-text-muted/55 select-none">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <p className="text-sm">Sélectionne un jour</p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile bottom sheet */}
      {selectedDate && (
        <div className="xl:hidden">
          <DaySheet
            date={selectedDate}
            entries={selectedEntries}
            dailyLog={dailyLogByDate.get(selectedDate)}
            onClose={() => setSelectedDate(null)}
            onOpen={() => {
              const d = selectedDate;
              setSelectedDate(null);
              navigate(`/?date=${d}`);
            }}
          />
        </div>
      )}

      <BackToTop panelOpen={!!selectedDate} />
      <BottomNav />

      {pickerOpen && (
        <MonthYearPicker
          year={year}
          month={month}
          maxYear={todayYear}
          maxMonth={todayMonth}
          onPick={(y, m) => { setYear(y); setMonth(m); setSelectedDate(null); setPickerOpen(false); }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
