import { useCallback, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LocalDailyLog } from '../lib/db/schema';
import { MoodSelector } from './MoodSelector';
import { WeatherPicker } from './WeatherPicker';
import { isoToday, shiftDate } from '../lib/dateHelpers';

interface DailyTrackerProps {
  date: string;
}

/** Un suivi est « rempli » dès qu'au moins un champ est renseigné. */
function logHasData(l: Pick<LocalDailyLog, 'mood' | 'sleepHours' | 'weather' | 'energy' | 'anxiety'>): boolean {
  return !!(l.mood || l.sleepHours != null || l.weather || l.energy != null || l.anxiety != null);
}

/** Streak courant : jours consécutifs avec un suivi rempli, finissant aujourd'hui ou hier. */
function computeDailyStreak(filledDays: Set<string>): number {
  const today = isoToday();
  let cursor = filledDays.has(today)
    ? today
    : filledDays.has(shiftDate(today, -1)) ? shiftDate(today, -1) : null;
  let n = 0;
  while (cursor && filledDays.has(cursor)) {
    n++;
    cursor = shiftDate(cursor, -1);
  }
  return n;
}

/** Pastille « 🔥 N » — affichée à partir de 2 jours de suite. */
function StreakBadge({ streak }: { streak: number }) {
  if (streak < 2) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-accent/10 text-accent px-2 py-0.5 text-[11px] font-medium"
      title={`${streak} jours de suivi d'affilée`}
    >
      🔥 {streak}
    </span>
  );
}

const EMPTY_LOG = (date: string): LocalDailyLog => ({
  date,
  mood: null,
  sleepHours: null,
  weather: null,
  energy: null,
  anxiety: null,
  version: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  deletedAt: null,
  _dirty: false,
});

function Scale1to5({
  value,
  onChange,
  emojis,
  compact = false,
  lowLabel,
  highLabel,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  emojis: [string, string, string, string, string];
  compact?: boolean;
  /** Repères min/max (ex. « calme » … « panique ») — affichés hors mode compact. */
  lowLabel?: string;
  highLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => {
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(active ? null : n)}
              className={`leading-none rounded-lg transition-all ${
                compact ? 'text-base p-1.5' : 'text-xl p-2 rounded-xl'
              } ${
                active
                  ? 'bg-accent/15 ring-1 ring-accent/40 scale-110'
                  : 'opacity-40 hover:opacity-100 hover:bg-text-muted/8'
              }`}
              aria-pressed={active}
              aria-label={`${n} sur 5${n === 1 && lowLabel ? ` — ${lowLabel}` : n === 5 && highLabel ? ` — ${highLabel}` : ''}`}
            >
              {emojis[n - 1]}
            </button>
          );
        })}
      </div>
      {!compact && (lowLabel || highLabel) && (
        <div className="flex justify-between text-[10px] text-text-muted/55 px-1">
          <span>{lowLabel}</span>
          <span>{highLabel}</span>
        </div>
      )}
    </div>
  );
}

function RowLabel({ children }: { children: string }) {
  return (
    <span className="font-mono text-[11px] tracking-widest uppercase text-text-muted/50 w-16 shrink-0">
      {children}
    </span>
  );
}

function BarLabel({ children }: { children: string }) {
  return (
    <span className="font-mono text-[11px] tracking-widest uppercase text-text-muted/55 shrink-0">
      {children}
    </span>
  );
}

export function DailyTracker({ date, centered = false }: DailyTrackerProps & { centered?: boolean }) {
  const log = useLiveQuery(() => db.dailyLogs.get(date), [date]);
  const current = log ?? EMPTY_LOG(date);
  const hasData = logHasData(current);
  const [open, setOpen] = useState(false);

  // Streak de suivi — calculé depuis Dexie (instantané, offline, réactif).
  const streak = useLiveQuery(async () => {
    const all = await db.dailyLogs.toArray();
    const filled = new Set(
      all.filter((l) => l.deletedAt == null && logHasData(l)).map((l) => l.date),
    );
    return computeDailyStreak(filled);
  }, []) ?? 0;

  const save = useCallback(async (patch: Partial<LocalDailyLog>) => {
    const existing = await db.dailyLogs.get(date);
    const now = new Date().toISOString();
    if (existing) {
      await db.dailyLogs.put({ ...existing, ...patch, updatedAt: now, _dirty: true });
    } else {
      await db.dailyLogs.put({ ...EMPTY_LOG(date), ...patch, createdAt: now, updatedAt: now, _dirty: true });
    }
  }, [date]);

  return (
    <>
      {/* ── Barre horizontale desktop ──────────────────────────────────────── */}
      <section className={`${centered ? 'hidden' : 'hidden lg:block'} bg-bg-elevated rounded-2xl mb-5 shadow-soft overflow-x-auto w-full hide-scrollbar`}>
        <div className="flex items-stretch divide-x divide-text-muted/[0.06] w-fit mx-auto min-w-0">

          {/* Label section — masqué sur les écrans < xl ou en mode centré */}
          {!centered && (
            <div className="hidden xl:flex items-center gap-2 px-4 py-3 shrink-0">
              <span className="font-mono text-[11px] tracking-widest uppercase text-text-muted/50">
                Ressenti du jour
              </span>
              <StreakBadge streak={streak} />
            </div>
          )}

          {/* Humeur */}
          <div className="flex items-center gap-2 px-3 py-3 shrink-0">
            {!centered && <BarLabel>Humeur</BarLabel>}
            <MoodSelector value={current.mood} onChange={(mood) => save({ mood })} dropdown />
          </div>

          {/* Météo */}
          <div className="flex items-center gap-2 px-3 py-3 shrink-0">
            {!centered && <BarLabel>Météo</BarLabel>}
            <WeatherPicker value={current.weather} onChange={(weather) => save({ weather })} minimal showLabel={!centered} />
          </div>

          {/* Sommeil */}
          <div className="flex items-center gap-2 px-3 py-3 shrink-0">
            {!centered && <BarLabel>Sommeil</BarLabel>}
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="0.5"
                min={0}
                max={24}
                value={current.sleepHours ?? ''}
                placeholder="—"
                onChange={(e) => save({ sleepHours: e.target.value === '' ? null : parseFloat(e.target.value) })}
                className="w-12 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted/55 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-xs text-text-muted/60">h</span>
            </div>
          </div>

          {/* Énergie */}
          <div className="flex items-center gap-2 px-3 py-3 shrink-0">
            {!centered && <BarLabel>Énergie</BarLabel>}
            <Scale1to5
              value={current.energy}
              onChange={(energy) => save({ energy })}
              emojis={['🪫', '🔋', '⚡', '🚀', '🔥']}
              compact
            />
          </div>

          {/* Anxiété */}
          <div className="flex items-center gap-2 px-3 py-3 shrink-0">
            {!centered && <BarLabel>Anxiété</BarLabel>}
            <Scale1to5
              value={current.anxiety}
              onChange={(anxiety) => save({ anxiety })}
              emojis={['😌', '🙂', '😐', '😰', '😱']}
              compact
            />
          </div>
        </div>
      </section>

      {/* ── Card collapsible mobile ────────────────────────────────────────── */}
      <section className={`${centered ? '' : 'lg:hidden'} bg-bg-elevated rounded-2xl mb-5 shadow-soft`}>
        {/* Header */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`w-full flex items-center justify-between px-4 pt-3.5 pb-3 ${open ? 'border-b border-text-muted/[0.06]' : ''}`}
        >
          <span className="flex items-center gap-2">
            <span className="font-mono text-[11px] tracking-widest uppercase text-text-muted/60">Ressenti du jour</span>
            <StreakBadge streak={streak} />
          </span>
          <div className="flex items-center gap-2">
            {!open && !hasData && <span className="text-xs text-text-muted/55 italic">rien noté</span>}
            {!open && hasData && (
              <span className="text-sm leading-none flex items-center gap-1.5">
                {current.mood && <span>{current.mood}</span>}
                {current.weather && <span>{current.weather}</span>}
                {current.sleepHours != null && <span className="font-mono text-[11px] text-text-muted/60">{current.sleepHours}h</span>}
                {current.energy != null && <span>{(['🪫','🔋','⚡','🚀','🔥'])[current.energy - 1]}</span>}
                {current.anxiety != null && <span>{(['😌','🙂','😐','😰','😱'])[current.anxiety - 1]}</span>}
              </span>
            )}
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={`text-text-muted/45 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </button>

        {open && <div>
          {/* HUMEUR */}
          <div className="flex items-start gap-3 px-4 py-3">
            <RowLabel>Humeur</RowLabel>
            <MoodSelector value={current.mood} onChange={(mood) => save({ mood })} alwaysOpen />
          </div>

          <div className="h-px bg-text-muted/[0.12] mx-4" />

          {/* MÉTÉO + SOMMEIL */}
          <div className="grid grid-cols-2 gap-2 px-4 py-3">
            <div className="border border-text-muted/[0.12] rounded-xl px-3 py-2.5">
              <span className="font-mono text-[11px] tracking-widest uppercase text-text-muted/50 block mb-2">Météo</span>
              <WeatherPicker value={current.weather} onChange={(weather) => save({ weather })} minimal />
            </div>
            <div className="border border-text-muted/[0.12] rounded-xl px-3 py-2.5">
              <span className="font-mono text-[11px] tracking-widest uppercase text-text-muted/50 block mb-2">Sommeil</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  max={24}
                  value={current.sleepHours ?? ''}
                  placeholder="—"
                  onChange={(e) => save({ sleepHours: e.target.value === '' ? null : parseFloat(e.target.value) })}
                  className="w-12 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted/55 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-xs text-text-muted/60">h</span>
              </div>
            </div>
          </div>

          <div className="h-px bg-text-muted/[0.12] mx-4" />

          {/* ÉNERGIE */}
          <div className="flex items-center gap-3 px-4 py-3">
            <RowLabel>Énergie</RowLabel>
            <Scale1to5
              value={current.energy}
              onChange={(energy) => save({ energy })}
              emojis={['🪫', '🔋', '⚡', '🚀', '🔥']}
              lowLabel="à plat"
              highLabel="à fond"
            />
          </div>

          <div className="h-px bg-text-muted/[0.12] mx-4" />

          {/* ANXIÉTÉ */}
          <div className="flex items-center gap-3 px-4 py-3">
            <RowLabel>Anxiété</RowLabel>
            <Scale1to5
              value={current.anxiety}
              onChange={(anxiety) => save({ anxiety })}
              emojis={['😌', '🙂', '😐', '😰', '😱']}
              lowLabel="calme"
              highLabel="panique"
            />
          </div>
        </div>}
      </section>
    </>
  );
}
