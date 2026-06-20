import { useState } from 'react';
import type { AgendaEvent, MediaMeta } from '../lib/db/schema';
import { isoToday } from '../lib/dateHelpers';
import { splitUpcomingPast, groupByDate, eventsByDate, formatEventEnd } from '../lib/agendaEvents';

const ACCENT = 'var(--color-note-agenda)'; // couleur du type AGENDA
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const pad = (n: number) => String(n).padStart(2, '0');

function formatDayHeader(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function EventRow({ ev }: { ev: AgendaEvent }) {
  const end = formatEventEnd(ev);
  return (
    <div className={`flex items-baseline gap-2 py-1 ${ev.done ? 'opacity-50' : ''}`}>
      <span className="shrink-0 w-12 text-[11px] font-mono text-text-muted/70 tabular-nums">{ev.time || '—'}</span>
      <span className={`flex-1 text-sm text-text-primary ${ev.done ? 'line-through' : ''}`}>
        {ev.title || <span className="italic text-text-muted/50">Sans titre</span>}
        {ev.location && <span className="text-text-muted/60 text-xs"> · {ev.location}</span>}
        {end && <span className="text-text-muted/60 text-xs font-mono"> {end}</span>}
      </span>
    </div>
  );
}

function AgendaList({ events, today }: { events: AgendaEvent[]; today: string }) {
  const { upcoming, past } = splitUpcomingPast(events, today);
  const Section = ({ label, items }: { label: string; items: AgendaEvent[] }) =>
    items.length === 0 ? null : (
      <div className="flex flex-col gap-1.5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-text-muted/50">{label}</p>
        {groupByDate(items).map(({ date, events: evs }) => (
          <div key={date} className="rounded-lg bg-bg-primary/40 px-3 py-2">
            <p className="text-[12px] font-medium mb-0.5" style={{ color: ACCENT }}>{formatDayHeader(date)}</p>
            {evs.map((ev) => <EventRow key={ev.id} ev={ev} />)}
          </div>
        ))}
      </div>
    );
  return (
    <div className="flex flex-col gap-3">
      <Section label="À venir" items={upcoming} />
      <Section label="Passés" items={past} />
    </div>
  );
}

function AgendaCalendar({ events, today }: { events: AgendaEvent[]; today: string }) {
  const byDate = eventsByDate(events);
  const [y, setY] = useState(() => parseInt(today.slice(0, 4)));
  const [mo, setMo] = useState(() => parseInt(today.slice(5, 7)) - 1);
  const [selected, setSelected] = useState<string | null>(null);

  const daysInMonth = new Date(y, mo + 1, 0).getDate();
  const lead = (new Date(y, mo, 1).getDay() + 6) % 7; // lundi = 0
  const cells: (string | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${y}-${pad(mo + 1)}-${pad(i + 1)}`),
  ];

  const shift = (delta: number) => {
    const total = y * 12 + mo + delta;
    setY(Math.floor(total / 12));
    setMo(((total % 12) + 12) % 12);
    setSelected(null);
  };

  const selectedEvents = selected ? (byDate[selected] ?? []) : [];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => shift(-1)} aria-label="Mois précédent" className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted/60 hover:text-text-primary hover:bg-text-muted/8 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <span className="text-sm font-medium text-text-primary">{MONTHS[mo]} {y}</span>
        <button type="button" onClick={() => shift(1)} aria-label="Mois suivant" className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted/60 hover:text-text-primary hover:bg-text-muted/8 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d, i) => <div key={i} className="text-center text-[10px] text-text-muted/45 font-mono">{d}</div>)}
        {cells.map((iso, i) => {
          if (!iso) return <div key={i} />;
          const day = parseInt(iso.slice(8, 10));
          const has = (byDate[iso]?.length ?? 0) > 0;
          const isToday = iso === today;
          const isSel = iso === selected;
          return (
            <button
              key={i}
              type="button"
              onClick={() => has && setSelected(isSel ? null : iso)}
              className={`relative aspect-square min-h-[34px] flex items-center justify-center rounded-lg text-[12px] transition-colors ${isSel ? 'text-white' : has ? 'text-text-primary hover:bg-text-muted/8' : 'text-text-muted/45'} ${isToday && !isSel ? 'ring-1 ring-inset' : ''}`}
              style={{
                backgroundColor: isSel ? ACCENT : has ? `color-mix(in srgb, ${ACCENT} 12%, transparent)` : undefined,
                ...(isToday && !isSel ? { ['--tw-ring-color' as string]: ACCENT } : {}),
              }}
            >
              {day}
              {has && !isSel && <span className="absolute bottom-1 w-1 h-1 rounded-full" style={{ backgroundColor: ACCENT }} />}
            </button>
          );
        })}
      </div>
      {selected && (
        <div className="rounded-lg bg-bg-primary/40 px-3 py-2 mt-1">
          <p className="text-[12px] font-medium mb-0.5" style={{ color: ACCENT }}>{formatDayHeader(selected)}</p>
          {selectedEvents.map((ev) => <EventRow key={ev.id} ev={ev} />)}
        </div>
      )}
    </div>
  );
}

/** Vue lecture d'une note AGENDA : liste groupée par date + bascule mini-calendrier. */
export function AgendaView({ meta }: { meta: MediaMeta | null }) {
  const events = meta?.events ?? [];
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const today = isoToday();

  if (events.length === 0) {
    return <p className="text-sm text-text-muted/55 italic">Aucun événement dans cet agenda.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1 self-end rounded-lg border border-text-muted/15 p-0.5 text-[11px]">
        {(['list', 'calendar'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${view === v ? 'text-white' : 'text-text-muted hover:text-text-primary'}`}
            style={view === v ? { backgroundColor: ACCENT } : {}}
          >
            {v === 'list' ? 'Liste' : 'Calendrier'}
          </button>
        ))}
      </div>
      {view === 'list' ? <AgendaList events={events} today={today} /> : <AgendaCalendar events={events} today={today} />}
    </div>
  );
}
