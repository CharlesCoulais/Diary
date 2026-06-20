import { useState, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db/schema';
import { trpc } from '../lib/trpc';
import { NOTE_TYPE_CONFIG } from '../components/NoteTypePicker';
import { useNoteTypeDefs } from '../lib/useNoteTypeDefs';
import { behaviorOf } from '@carnet/schemas';
import { HScroll } from '../components/HScroll';
import { BottomNav, GuestBottomNav } from '../components/BottomNav';
import { BackToTop } from '../components/BackToTop';
import { PageHeader } from '../components/PageHeader';
import { MonthlyRecapCard } from '../components/MonthlyRecapCard';
import { DailyLogInsights } from '../components/DailyLogInsights';
import { getTracks } from '../lib/musicTracks';
import { isoToday } from '../lib/dateHelpers';

// ─── helpers ────────────────────────────────────────────────────────────────
// `isoToday` est partagé via `lib/dateHelpers.ts` (heure locale).
// `addDays` reste local car il combine logique UTC + manipulation arithmétique
// qui n'est utilisée que dans cette page (streaks).

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function computeStreaks(writtenDays: Set<string>, today: string) {
  const yesterday = addDays(today, -1);
  const todayWritten = writtenDays.has(today);

  // streak is alive if written today OR yesterday (still time to write today)
  let current = 0;
  let cursor: string | null = todayWritten ? today : writtenDays.has(yesterday) ? yesterday : null;
  if (cursor) {
    while (writtenDays.has(cursor)) {
      current++;
      cursor = addDays(cursor, -1);
    }
  }

  if (writtenDays.size === 0) return { current: 0, best: 0, todayWritten };

  const sorted = Array.from(writtenDays).sort();
  let best = 0;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (addDays(sorted[i - 1]!, 1) === sorted[i]) {
      run++;
    } else {
      run = 1;
    }
    if (run > best) best = run;
  }
  if (run > best) best = run;
  if (1 > best) best = 1;

  return { current, best: Math.max(best, current), todayWritten };
}

// ─── types ──────────────────────────────────────────────────────────────────

export interface MediaItem {
  subject: string;
  creator?: string;
  coverUrl?: string;
  rating?: number;
  extra?: string; // ex: "S2 · E5" pour les épisodes
}

// ─── sub-components ─────────────────────────────────────────────────────────

function StatCard({ label, value, onClick }: { label: string; value: string | number; onClick?: () => void }) {
  const inner = (
    <>
      <span className="text-xs text-text-muted uppercase tracking-wide font-medium">{label}</span>
      <span className="text-2xl font-serif text-text-primary leading-tight">{value}</span>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="bg-bg-elevated shadow-soft rounded-xl px-5 py-4 flex flex-col gap-1 min-w-0 w-full text-left hover:bg-text-muted/[0.04] active:scale-[0.98] transition-all"
      >
        {inner}
      </button>
    );
  }
  return (
    <div className="bg-bg-elevated shadow-soft rounded-xl px-5 py-4 flex flex-col gap-1 min-w-0">
      {inner}
    </div>
  );
}

// Contenu partagé entre le bottom-sheet mobile et le panneau droit desktop
function MediaItemsList({ items }: { items: MediaItem[] }) {
  return (
    <div className="flex flex-col divide-y divide-text-muted/[0.06]">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          {item.coverUrl ? (
            <img src={item.coverUrl} alt="" className="w-10 h-14 object-cover rounded-md shrink-0 bg-text-muted/10" />
          ) : (
            <div className="w-10 h-14 rounded-md bg-text-muted/10 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-text-primary font-medium leading-snug truncate">{item.subject}</p>
            {item.creator && <p className="text-xs text-text-muted truncate mt-0.5">{item.creator}</p>}
            {item.extra && <p className="text-xs text-text-muted/50 mt-0.5">{item.extra}</p>}
            {item.rating != null && item.rating > 0 && (
              <div className="flex gap-0.5 mt-1">
                {Array.from({ length: 5 }, (_, si) => (
                  <span key={si} className={`text-[11px] leading-none ${si < item.rating! ? 'text-accent' : 'text-text-muted/20'}`}>★</span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// Bottom-sheet — mobile uniquement (lg:hidden)
function MediaListSheet({ title, items, onClose }: { title: string; items: MediaItem[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="lg:hidden fixed inset-0 z-50 flex items-end justify-center bg-bg-primary/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-h-[80dvh] bg-bg-elevated rounded-t-3xl shadow-xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-text-muted/[0.08] shrink-0">
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">{title}</h2>
          <button type="button" onClick={onClose} className="w-7 h-7 rounded-full bg-text-muted/10 flex items-center justify-center text-text-muted hover:bg-text-muted/20 transition-colors">
            <CloseIcon />
          </button>
        </div>
        <div className="overflow-y-auto scrollbar-soft px-5 py-1 pb-6">
          <MediaItemsList items={items} />
        </div>
      </div>
    </div>
  );
}

function StreakCard({ current, best, todayWritten, isGuest }: { current: number; best: number; todayWritten: boolean; isGuest: boolean }) {
  const isBroken = current === 0;
  return (
    <div className="bg-bg-elevated shadow-soft rounded-xl px-5 py-4 flex flex-col gap-1">
      <span className="text-xs text-text-muted uppercase tracking-wide font-medium">Streak actuel</span>
      <div className="flex items-end gap-3 flex-wrap">
        <span className="text-4xl font-serif text-accent leading-tight">
          {current} {current === 1 ? 'jour' : 'jours'}
        </span>
        {(isBroken || best > current) && best > 0 && (
          <span className="text-sm text-text-muted mb-1">
            · meilleur&nbsp;: <strong className="text-text-primary">{best} j.</strong>
          </span>
        )}
      </div>
      {current > 0 && !todayWritten && (
        <p className="text-xs text-text-muted mt-0.5">{isGuest ? "Pas encore de note aujourd'hui pour prolonger la série." : "Écris aujourd'hui pour maintenir ton streak !"}</p>
      )}
      {current > 0 && todayWritten && (
        <p className="text-xs text-text-muted mt-0.5">
          {current === 1 ? 'Bonne reprise !' : `${current} jours d'affilée 🎉`}
        </p>
      )}
      {isBroken && (
        <p className="text-xs text-text-muted mt-0.5">{isGuest ? "Série interrompue — aucune note hier ni aujourd'hui." : "Aucune entrée hier ni aujourd'hui — recommence le streak !"}</p>
      )}
    </div>
  );
}

function TypeBreakdown({ counts, total }: { counts: Record<string, number>; total: number }) {
  return (
    <div className="bg-bg-elevated shadow-soft rounded-xl px-5 py-4 flex flex-col gap-3">
      <span className="text-xs text-text-muted uppercase tracking-wide font-medium">Répartition par type</span>
      <div className="flex flex-col gap-2.5">
        {NOTE_TYPE_CONFIG.map((cfg) => {
          const count = counts[cfg.value] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={cfg.value} className="flex items-center gap-2.5">
              <cfg.Icon className="w-4 h-4 flex-shrink-0" style={{ color: cfg.color }} />
              <span className="text-xs text-text-muted w-14 flex-shrink-0">{cfg.label}</span>
              <div className="flex-1 h-2 bg-text-muted/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: cfg.color }}
                />
              </div>
              <span className="text-xs text-text-muted w-8 text-right flex-shrink-0">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MoodCloud({ moods }: { moods: [string, number][] }) {
  const max = moods[0]?.[1] ?? 1;
  return (
    <div className="bg-bg-elevated shadow-soft rounded-xl px-5 py-4 flex flex-col gap-3">
      <span className="text-xs text-text-muted uppercase tracking-wide font-medium">Humeurs fréquentes</span>
      {moods.length === 0 ? (
        <p className="text-sm text-text-muted">Aucune humeur enregistrée.</p>
      ) : (
        <div className="flex gap-3 flex-wrap">
          {moods.map(([emoji, count]) => {
            // Taille proportionnelle, en px (immune au root 12px) : 18px pour la
            // moins fréquente → 40px pour la plus fréquente. Sans arrondi, sinon
            // la pondération s'écrase en quasi binaire (STAT-06).
            const fontPx = 18 + 22 * (max > 0 ? count / max : 0);
            return (
              <div key={emoji} className="flex flex-col items-center gap-0.5">
                <span
                  className="leading-none transition-all"
                  style={{ fontSize: `${fontPx}px` }}
                  title={`${count}×`}
                >
                  {emoji}
                </span>
                <span className="text-xs text-text-muted">{count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DAY_LABELS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// Couleur d'une cellule d'activité : l'opacité de l'accent varie avec le nombre
// d'entrées, RELATIVEMENT au max de la période — un jour très chargé est
// nettement plus foncé qu'un jour léger (ex. 13 ≠ 4). Courbe sqrt pour garder
// les petits comptes visibles. Renvoie null pour 0 (cellule « vide » gérée à part).
function activityShade(n: number, max: number): string | null {
  if (n <= 0) return null;
  const ratio = max > 0 ? Math.min(1, n / max) : 1;
  const pct = Math.round(32 + 68 * Math.sqrt(ratio));
  return `color-mix(in srgb, var(--color-accent) ${pct}%, transparent)`;
}

// ── Vue 7 jours : bandeau de 7 cellules larges ──────────────────────────────

function DayStrip({ dayCounts, today }: { dayCounts: Map<string, number>; today: string }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const maxCount = Math.max(1, ...days.map((d) => dayCounts.get(d) ?? 0));

  return (
    <div className="bg-bg-elevated shadow-soft rounded-xl px-5 py-4 flex flex-col gap-3">
      <span className="text-xs text-text-muted uppercase tracking-wide font-medium">
        Activité — 7 derniers jours
      </span>
      <div className="flex gap-2">
        {days.map((date) => {
          const n = dayCounts.get(date) ?? 0;
          const isToday = date === today;
          const dow = (new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7;
          const dayNum = parseInt(date.slice(8), 10);
          const labelFull = new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
          return (
            <div key={date} className="flex-1 flex flex-col items-center gap-1.5">
              <span className="text-[11px] text-text-muted/50 uppercase tracking-wide select-none">
                {DAY_LABELS_SHORT[dow]}
              </span>
              <div
                title={`${labelFull} · ${n} entrée${n !== 1 ? 's' : ''}`}
                className={`w-full rounded-md transition-colors ${n === 0 ? 'bg-text-muted/10' : ''} ${
                  isToday ? 'ring-1 ring-accent/70' : ''
                }`}
                style={{ aspectRatio: '1 / 1', backgroundColor: activityShade(n, maxCount) ?? undefined }}
              />
              <span className={`text-[11px] font-mono leading-none ${isToday ? 'text-accent font-semibold' : 'text-text-muted/60'}`}>
                {dayNum}
              </span>
              {n > 0 && (
                <span className="text-[11px] text-text-muted/55 leading-none">{n}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Heatmap semaines (30j / année / tout) ────────────────────────────────────

function WeekHeatmap({ dayCounts, today, period }: {
  dayCounts: Map<string, number>;
  today: string;
  period: '30d' | 'year' | 'all';
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [period]);

  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  const todayDow = (new Date(Date.UTC(ty, tm - 1, td)).getUTCDay() + 6) % 7;

  let gridStart: string;
  let numWeeks: number;
  let title: string;

  if (period === '30d') {
    const start30 = addDays(today, -29);
    const [sy, sm, sd] = start30.split('-').map(Number) as [number, number, number];
    const startDow = (new Date(Date.UTC(sy, sm - 1, sd)).getUTCDay() + 6) % 7;
    gridStart = addDays(start30, -startDow);
    const diffDays = Math.round(
      (new Date(today + 'T00:00:00Z').getTime() - new Date(gridStart + 'T00:00:00Z').getTime()) / 86400000,
    );
    numWeeks = Math.ceil(diffDays / 7) + 1;
    title = '30 derniers jours';
  } else if (period === 'year') {
    const year = today.slice(0, 4);
    const jan1 = `${year}-01-01`;
    const [jy, jm, jd] = jan1.split('-').map(Number) as [number, number, number];
    const jan1Dow = (new Date(Date.UTC(jy, jm - 1, jd)).getUTCDay() + 6) % 7;
    gridStart = addDays(jan1, -jan1Dow);
    const diffDays = Math.round(
      (new Date(today + 'T00:00:00Z').getTime() - new Date(gridStart + 'T00:00:00Z').getTime()) / 86400000,
    );
    numWeeks = Math.ceil(diffDays / 7) + 1;
    title = `Activité — ${year}`;
  } else {
    // all : depuis la première entrée connue
    const allDates = Array.from(dayCounts.keys()).sort();
    const oldest = allDates[0];
    if (!oldest) {
      gridStart = addDays(today, -(todayDow + 51 * 7));
      numWeeks = 52;
    } else {
      const [oy, om, od] = oldest.split('-').map(Number) as [number, number, number];
      const oldestDow = (new Date(Date.UTC(oy, om - 1, od)).getUTCDay() + 6) % 7;
      gridStart = addDays(oldest, -oldestDow);
      const diffDays = Math.round(
        (new Date(today + 'T00:00:00Z').getTime() - new Date(gridStart + 'T00:00:00Z').getTime()) / 86400000,
      );
      numWeeks = Math.ceil(diffDays / 7) + 1;
    }
    title = 'Activité — tout';
  }

  const weeks: Array<Array<{ date: string; inRange: boolean }>> = [];
  for (let w = 0; w < numWeeks; w++) {
    const week: Array<{ date: string; inRange: boolean }> = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(gridStart, w * 7 + d);
      week.push({ date, inRange: date <= today });
    }
    weeks.push(week);
  }

  function weekMonthLabel(wi: number): string | null {
    const date = weeks[wi]![0]!.date;
    const [fy, fm] = date.split('-').map(Number) as [number, number];
    if (wi === 0) {
      return new Date(Date.UTC(fy, fm - 1, 1)).toLocaleDateString('fr-FR', { month: 'short' });
    }
    const prevDate = weeks[wi - 1]![0]!.date;
    const [, pm] = prevDate.split('-').map(Number) as [number, number];
    if (fm !== pm) {
      return new Date(Date.UTC(fy, fm - 1, 1)).toLocaleDateString('fr-FR', { month: 'short' });
    }
    return null;
  }

  // Max d'entrées sur les jours visibles (dans la grille et <= aujourd'hui),
  // pour échelonner l'intensité relativement à la période.
  let maxCount = 1;
  for (const [date, c] of dayCounts) {
    if (date >= gridStart && date <= today && c > maxCount) maxCount = c;
  }

  return (
    <div className="bg-bg-elevated shadow-soft rounded-xl px-5 py-4 flex flex-col gap-3">
      <span className="text-xs text-text-muted uppercase tracking-wide font-medium">{title}</span>
      <HScroll innerRef={scrollRef}>
        <table className="border-separate border-spacing-[3px]">
          <thead>
            <tr>
              <th className="w-4" />
              {weeks.map((_, wi) => {
                const label = weekMonthLabel(wi);
                return (
                  <th
                    key={wi}
                    className="text-[11px] text-text-muted/60 font-normal text-left pb-0.5 overflow-visible whitespace-nowrap"
                    style={{ width: 14, minWidth: 14 }}
                  >
                    {label ?? ''}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {DAY_LABELS.map((dayLabel, di) => (
              <tr key={di}>
                <td className="text-[11px] text-text-muted/50 text-right pr-1 w-4 leading-none select-none">
                  {di === 0 || di === 2 || di === 4 ? dayLabel : ''}
                </td>
                {weeks.map((week, wi) => {
                  const { date, inRange } = week[di]!;
                  const n = dayCounts.get(date) ?? 0;
                  const isToday = date === today;
                  const label = new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
                  return (
                    <td key={wi}>
                      <div
                        title={inRange ? `${label} · ${n} entrée${n !== 1 ? 's' : ''}` : ''}
                        className={`w-[14px] h-[14px] rounded-[2px] transition-colors ${
                          !inRange ? 'bg-transparent' : n === 0 ? 'bg-text-muted/10' : ''
                        } ${isToday ? 'ring-1 ring-accent/70' : ''}`}
                        style={{ backgroundColor: inRange ? (activityShade(n, maxCount) ?? undefined) : undefined }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </HScroll>
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <span>Moins</span>
        <div className="w-3 h-3 rounded-[2px] bg-text-muted/10" />
        <div className="w-3 h-3 rounded-[2px]" style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 45%, transparent)' }} />
        <div className="w-3 h-3 rounded-[2px]" style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 70%, transparent)' }} />
        <div className="w-3 h-3 rounded-[2px]" style={{ backgroundColor: 'var(--color-accent)' }} />
        <span>Plus</span>
      </div>
    </div>
  );
}

function TopTags({ tags }: { tags: [string, number][] }) {
  const max = tags[0]?.[1] ?? 1;
  return (
    <div className="bg-bg-elevated shadow-soft rounded-xl px-5 py-4 flex flex-col gap-3">
      <span className="text-xs text-text-muted uppercase tracking-wide font-medium">Tags les plus utilisés</span>
      {tags.length === 0 ? (
        <p className="text-sm text-text-muted">Aucun tag utilisé.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {tags.map(([tag, count]) => {
            const pct = Math.round((count / max) * 100);
            return (
              <div key={tag} className="flex items-center gap-2.5">
                <span className="text-xs text-accent font-medium">#</span>
                <span className="text-xs text-text-primary flex-1 truncate">{tag}</span>
                <div className="w-20 h-1.5 bg-text-muted/10 rounded-full overflow-hidden flex-shrink-0">
                  <div
                    className="h-full rounded-full bg-accent/50 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-text-muted w-5 text-right flex-shrink-0">{count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── period config ───────────────────────────────────────────────────────────

const PERIODS = [
  { value: '7d' as const, label: '7 jours' },
  { value: '30d' as const, label: '30 jours' },
  { value: 'year' as const, label: 'Cette année' },
  { value: 'all' as const, label: 'Tout' },
];

// ─── main page ───────────────────────────────────────────────────────────────

export function StatsPage() {
  const today = isoToday();
  const { data: me } = trpc.auth.me.useQuery();
  const isGuest = me?.role === 'GUEST';
  const authReady = me !== undefined;
  // Types custom du viewer : pour compter une note CUSTOM sous son COMPORTEMENT
  // effectif (un custom héritant de BOOK compte comme un livre, etc.).
  const { defsById } = useNoteTypeDefs();
  const defsKey = Object.keys(defsById).sort().join(',');

  const [period, setPeriod] = useState<'7d' | '30d' | 'year' | 'all'>('year');
  const [mediaSheet, setMediaSheet] = useState<{ title: string; items: MediaItem[] } | null>(null);

  // Guest CONFIDANT : stats depuis l'API (entrées owner)
  const { data: apiStats } = trpc.stats.overview.useQuery({ period }, { enabled: authReady && isGuest });

  // Owner : stats depuis Dexie local (seulement quand on sait qu'on est owner)
  const localStats = useLiveQuery(async () => {
    if (!authReady || isGuest) return null;

    const periodStart = period === '7d' ? addDays(today, -6)
      : period === '30d' ? addDays(today, -29)
      : period === 'year' ? `${today.slice(0, 4)}-01-01`
      : '0000-01-01';

    // collectionOnly exclu : un item de Collection n'est pas une note écrite.
    const allEntries = await db.entries.filter((e) => e.deletedAt === null && !e.collectionOnly).toArray();

    // Streak on ALL entries (never filtered)
    const allWrittenDays = new Set(allEntries.map((e) => e.date));
    const { current: currentStreak, best: bestStreak, todayWritten } = computeStreaks(allWrittenDays, today);

    // Other stats on filtered entries
    const entries = period === 'all' ? allEntries : allEntries.filter((e) => e.date >= periodStart);

    // Compte par COMPORTEMENT effectif : une note CUSTOM est rangée dans le
    // bucket de son comportement hérité (BOOK, MUSIC, …), pas sous 'CUSTOM'.
    const typeCounts: Record<string, number> = {};
    for (const e of entries) {
      const b = behaviorOf(e, defsById);
      typeCounts[b] = (typeCounts[b] ?? 0) + 1;
    }

    // Media stats: unique finished items by title (Map pour conserver les métadonnées)
    const booksMap = new Map<string, MediaItem>();
    const moviesMap = new Map<string, MediaItem>();
    const seriesMap = new Map<string, MediaItem>();
    const episodesList: MediaItem[] = [];
    for (const e of entries) {
      const behavior = behaviorOf(e, defsById);
      const meta = e.mediaMeta as { status?: string; subject?: string; seriesName?: string; seriesStatus?: string; creator?: string; coverUrl?: string; rating?: number; season?: number; progressCurrent?: number } | null | undefined;
      if (behavior === 'BOOK' && meta?.status === 'finished' && meta?.subject) {
        if (!booksMap.has(meta.subject))
          booksMap.set(meta.subject, { subject: meta.subject, creator: meta.creator, coverUrl: meta.coverUrl, rating: meta.rating });
      }
      if (behavior === 'MOVIE' && meta?.status === 'finished' && meta?.subject) {
        if (!moviesMap.has(meta.subject))
          moviesMap.set(meta.subject, { subject: meta.subject, creator: meta.creator, coverUrl: meta.coverUrl, rating: meta.rating });
      }
      if (behavior === 'SERIES' && (meta?.status === 'finished' || meta?.seriesStatus === 'finished')) {
        const key = meta?.seriesName || meta?.subject;
        if (key && !seriesMap.has(key))
          seriesMap.set(key, { subject: key, creator: meta?.creator, coverUrl: meta?.coverUrl, rating: meta?.rating });
      }
      if (behavior === 'SERIES') {
        const title = meta?.seriesName || meta?.subject || 'Sans titre';
        const parts: string[] = [];
        if (meta?.season) parts.push(`S${meta.season}`);
        if (meta?.progressCurrent) parts.push(`E${meta.progressCurrent}`);
        episodesList.push({ subject: title, creator: meta?.creator, coverUrl: meta?.coverUrl, rating: meta?.rating, extra: parts.join(' · ') || undefined });
      }
    }
    const cmp = (a: MediaItem, b: MediaItem) => a.subject.localeCompare(b.subject, 'fr', { sensitivity: 'base' });
    const booksList = Array.from(booksMap.values()).sort(cmp);
    const moviesList = Array.from(moviesMap.values()).sort(cmp);
    const seriesWatchedList = Array.from(seriesMap.values()).sort(cmp);
    episodesList.sort(cmp);
    const booksRead = booksList.length;
    const moviesWatched = moviesList.length;
    const seriesWatched = seriesWatchedList.length;

    // Total morceaux (playlists incluses) — comportement MUSIC (custom inclus)
    let totalTracks = 0;
    for (const e of entries) {
      if (behaviorOf(e, defsById) === 'MUSIC') {
        totalTracks += getTracks(e.mediaMeta).length;
      }
    }

    // avgPerDay = entrées par JOUR ÉCRIT (pas par jour calendaire) — cohérent
    // avec les cases « Entrées » et « Jours écrits » affichées à côté.
    const filteredDays = new Set(entries.map((e) => e.date));
    const totalDays = filteredDays.size;
    const avgPerDay = entries.length > 0 ? (entries.length / Math.max(totalDays, 1)).toFixed(1) : '0';

    const segmenter = new Intl.Segmenter();
    const moodCounts: Record<string, number> = {};
    for (const e of entries) {
      if (e.mood) {
        for (const { segment } of segmenter.segment(e.mood)) {
          if (segment.trim()) moodCounts[segment] = (moodCounts[segment] ?? 0) + 1;
        }
      }
    }
    const topMoods = Object.entries(moodCounts).sort((a, b) => b[1] - a[1]).slice(0, 10) as [string, number][];

    const dayCounts: Record<string, number> = {};
    for (const e of allEntries) dayCounts[e.date] = (dayCounts[e.date] ?? 0) + 1;

    const tagCounts: Record<string, number> = {};
    for (const e of entries) {
      for (const tag of e.tagNames ?? []) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }
    const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5) as [string, number][];

    return {
      totalEntries: entries.length,
      totalDays,
      totalTracks,
      avgPerDay,
      booksRead,
      moviesWatched,
      seriesWatched,
      booksList,
      moviesList,
      seriesWatchedList,
      episodesList,
      currentStreak,
      bestStreak,
      todayWritten,
      typeCounts,
      topMoods,
      dayCounts,
      topTags,
    };
  }, [today, authReady, isGuest, period, defsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const raw = isGuest ? apiStats : localStats;

  if (!authReady || raw === undefined || raw === null) {
    return (
      <div className="min-h-dvh flex items-center justify-center pb-16">
        <span className="text-text-muted text-sm">Chargement…</span>
      </div>
    );
  }

  const {
    totalEntries,
    totalDays,
    currentStreak,
    bestStreak,
    todayWritten,
    typeCounts,
    topMoods,
    dayCounts: dayCountsRaw,
    topTags,
  } = raw as typeof raw & { todayWritten?: boolean };
  const totalTracks = (raw as { totalTracks?: number }).totalTracks ?? 0;
  const booksRead = (raw as { booksRead?: number }).booksRead ?? 0;
  const moviesWatched = (raw as { moviesWatched?: number }).moviesWatched ?? 0;
  const seriesWatched = (raw as { seriesWatched?: number }).seriesWatched ?? 0;
  const episodesWatched = (typeCounts as Record<string, number>)['SERIES'] ?? 0;
  const booksList = (raw as { booksList?: MediaItem[] }).booksList ?? [];
  const moviesList = (raw as { moviesList?: MediaItem[] }).moviesList ?? [];
  const seriesWatchedList = (raw as { seriesWatchedList?: MediaItem[] }).seriesWatchedList ?? [];
  const episodesList = (raw as { episodesList?: MediaItem[] }).episodesList ?? [];

  // avgPerDay: from local stats or compute from API stats
  let avgPerDay: string;
  const rawAvgPerDay = (raw as unknown as { avgPerDay?: string }).avgPerDay;
  if (rawAvgPerDay !== undefined) {
    avgPerDay = rawAvgPerDay;
  } else {
    // Guest path: entrées par jour écrit (cohérent avec « Entrées » / « Jours écrits »).
    avgPerDay = totalEntries > 0 ? (totalEntries / Math.max(totalDays, 1)).toFixed(1) : '0';
  }

  const dayCounts = new Map(Object.entries(dayCountsRaw));
  const hasMediaStats = booksRead > 0 || moviesWatched > 0 || seriesWatched > 0 || episodesWatched > 0;

  return (
    <div className="min-h-dvh max-w-2xl mx-auto lg:max-w-none lg:flex lg:items-start">

      {/* ── Contenu principal ── */}
      <div className="flex-1 min-w-0 pb-48 sm:pb-56 lg:pb-8 lg:px-12">
        <PageHeader
          title={PERIODS.find((p) => p.value === period)?.label ?? 'Statistiques'}
          kicker="Statistiques"
          controls={
            <div className="flex gap-2">
              {PERIODS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPeriod(value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    period === value
                      ? 'bg-accent text-white border-transparent'
                      : 'border-text-muted/15 text-text-muted hover:text-text-primary hover:border-text-muted/30'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          }
          backTo="/"
        />

        <main className="px-6 flex flex-col gap-4">
          {/* Streak — standalone full-width row */}
          <div className="w-full">
            <StreakCard current={currentStreak} best={bestStreak} todayWritten={todayWritten ?? false} isGuest={isGuest} />
          </div>

          {/* Core metrics grid: 4 cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Entrées" value={totalEntries} />
            <StatCard label="Jours écrits" value={totalDays} />
            <StatCard label="Moy. / jour" value={avgPerDay} />
            {totalTracks > 0 && <StatCard label="Morceaux" value={totalTracks} />}
          </div>

          {/* Media stats row — only shown if any media stat > 0 */}
          {hasMediaStats && (
            <div className="flex flex-wrap gap-3">
              {booksRead > 0 && (
                <div className="flex-1 min-w-[180px]">
                  <StatCard label="Livres lus" value={booksRead} onClick={booksList.length > 0 ? () => setMediaSheet({ title: 'Livres lus', items: booksList }) : undefined} />
                </div>
              )}
              {moviesWatched > 0 && (
                <div className="flex-1 min-w-[180px]">
                  <StatCard label="Films vus" value={moviesWatched} onClick={moviesList.length > 0 ? () => setMediaSheet({ title: 'Films vus', items: moviesList }) : undefined} />
                </div>
              )}
              {episodesWatched > 0 && (
                <div className="flex-1 min-w-[180px]">
                  <StatCard label="Épisodes vus" value={episodesWatched} onClick={episodesList.length > 0 ? () => setMediaSheet({ title: 'Épisodes vus', items: episodesList }) : undefined} />
                </div>
              )}
              {seriesWatched > 0 && (
                <div className="flex-1 min-w-[180px]">
                  <StatCard label="Séries terminées" value={seriesWatched} onClick={seriesWatchedList.length > 0 ? () => setMediaSheet({ title: 'Séries terminées', items: seriesWatchedList }) : undefined} />
                </div>
              )}
            </div>
          )}

          {/* Récap mensuel IA — owner only, privé (la carte se masque seule si l'IA
              n'est pas configurée ou si l'historique est trop mince) */}
          {/* Récap du mois & Sommeil/ressenti — owner ET confident CONFIDANT.
              Les cartes s'auto-masquent pour les guests sans accès / sans données.
              Le récap est lecture seule côté confident (pas de génération). */}
          <MonthlyRecapCard />
          <DailyLogInsights />

          {/* Activité : bandeau 7j ou heatmap semaines */}
          {period === '7d'
            ? <DayStrip dayCounts={dayCounts} today={today} />
            : <WeekHeatmap dayCounts={dayCounts} today={today} period={period} />
          }

          {/* type breakdown + moods + tags côte à côte sur desktop */}
          <div className="flex flex-col lg:grid lg:grid-cols-5 gap-4">
            <div className="lg:col-span-3">
              <TypeBreakdown counts={typeCounts} total={totalEntries} />
            </div>
            <div className="lg:col-span-2 flex flex-col gap-4">
              <MoodCloud moods={topMoods} />
              <TopTags tags={topTags} />
            </div>
          </div>
        </main>

        <BackToTop panelOpen={!!mediaSheet} />
        {isGuest ? <GuestBottomNav /> : <BottomNav />}
      </div>

      {/* ── Panneau droit — desktop uniquement ── */}
      {mediaSheet && (
        <div className="hidden lg:flex flex-col w-72 xl:w-80 shrink-0 border-l border-text-muted/[0.08] sticky top-0 h-dvh">
          <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-text-muted/[0.08] shrink-0">
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-widest">{mediaSheet.title}</h2>
            <button
              type="button"
              onClick={() => setMediaSheet(null)}
              className="w-7 h-7 rounded-full bg-text-muted/10 flex items-center justify-center text-text-muted hover:bg-text-muted/20 transition-colors"
            >
              <CloseIcon />
            </button>
          </div>
          <div className="overflow-y-auto scrollbar-soft flex-1 px-5 pb-6">
            <MediaItemsList items={mediaSheet.items} />
          </div>
        </div>
      )}

      {/* ── Bottom-sheet — mobile uniquement ── */}
      {mediaSheet && (
        <MediaListSheet
          title={mediaSheet.title}
          items={mediaSheet.items}
          onClose={() => setMediaSheet(null)}
        />
      )}
    </div>
  );
}
