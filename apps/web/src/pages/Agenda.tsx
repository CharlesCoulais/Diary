import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db/schema';
import type { AgendaEvent, MediaMeta } from '../lib/db/schema';
import { isoToday } from '../lib/dateHelpers';
import { splitUpcomingPast, groupByDate, eventsByDate, formatEventEnd } from '../lib/agendaEvents';
import { PageHeader } from '../components/PageHeader';
import { BottomNav } from '../components/BottomNav';
import { trpc } from '../lib/trpc';

const ACCENT = 'var(--color-note-agenda)';
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const pad = (n: number) => String(n).padStart(2, '0');

/** Événement enrichi de sa note source (pour la navigation). */
type AggEvent = AgendaEvent & { entryId: string; noteTitle: string | null };

function formatDayHeader(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function AgendaPage() {
  const navigate = useNavigate();
  const { data: me } = trpc.auth.me.useQuery();
  const isOwner = me?.role === 'OWNER';
  // Owner : lecture offline-first depuis Dexie. Confident : pas de sync Dexie →
  // lecture serveur (entries.aggregateByType). On bascule selon le rôle.
  const dexieEntries = useLiveQuery(
    () => db.entries.filter((e) => e.noteType === 'AGENDA' && !e.deletedAt).toArray(),
    [],
  );
  const { data: serverRaw } = trpc.entries.aggregateByType.useQuery(
    { type: 'AGENDA' },
    { enabled: !!me && !isOwner },
  );
  // `serverRaw as unknown` dans le ternaire : la sortie tRPC est trop profonde
  // pour l'inférence TS (TS2589) une fois unie au type Dexie — on l'aplatit
  // dès le ternaire, puis on cast vers la forme utile.
  const entries = ((isOwner ? dexieEntries : (serverRaw as unknown)) ?? []) as Array<{
    id: string;
    title: string | null;
    mediaMeta: MediaMeta | null;
  }>;

  const events: AggEvent[] = entries.flatMap((e) =>
    (e.mediaMeta?.events ?? []).map((ev) => ({ ...ev, entryId: e.id, noteTitle: e.title })),
  );

  const [view, setView] = useState<'list' | 'calendar'>('list');
  const today = isoToday();
  const openNote = (entryId: string) => navigate(`/?entryId=${entryId}`);

  return (
    <div className="min-h-dvh pb-24 max-w-2xl mx-auto lg:pb-0">
      <div className="lg:px-12 lg:pb-16">
        <PageHeader
          title="Agenda"
          backTo="/"
          subtitle={events.length > 0 ? `${events.length} événement${events.length > 1 ? 's' : ''}` : undefined}
        />

        <div className="px-4 lg:px-0 max-w-xl mx-auto">
          {events.length === 0 ? (
            <div className="text-center py-16">
              <p className="font-serif text-text-muted/55 text-3xl mb-3">🗓️</p>
              <p className="font-serif text-text-muted italic text-sm">
                {me?.role === 'OWNER'
                  ? <>Aucun événement pour l'instant. Crée une note de type <strong>Agenda</strong> et ajoute des événements — ils apparaîtront tous ici.</>
                  : 'Aucun événement accessible pour le moment.'}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1 mb-4 w-fit rounded-lg border border-text-muted/15 p-0.5 text-[12px]">
                {(['list', 'calendar'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    aria-pressed={view === v}
                    className={`px-3 py-1 rounded-md font-medium transition-colors ${view === v ? 'text-white' : 'text-text-muted hover:text-text-primary'}`}
                    style={view === v ? { backgroundColor: ACCENT } : {}}
                  >
                    {v === 'list' ? 'Liste' : 'Calendrier'}
                  </button>
                ))}
              </div>
              {view === 'list'
                ? <AgendaListView events={events} today={today} onOpen={openNote} />
                : <AgendaCalendarView events={events} today={today} onOpen={openNote} />}
            </>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}

function EventRow({ ev, onOpen }: { ev: AggEvent; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(ev.entryId)}
      className={`w-full text-left flex items-baseline gap-2 py-1.5 px-2 -mx-2 rounded-lg hover:bg-text-muted/5 transition-colors ${ev.done ? 'opacity-50' : ''}`}
    >
      <span className="shrink-0 w-12 text-[11px] font-mono text-text-muted/70 tabular-nums">{ev.time || '—'}</span>
      <span className="flex-1 min-w-0">
        <span className={`text-sm text-text-primary ${ev.done ? 'line-through' : ''}`}>
          {ev.title || <span className="italic text-text-muted/50">Sans titre</span>}
        </span>
        {ev.location && <span className="text-text-muted/60 text-xs"> · {ev.location}</span>}
        {(() => { const end = formatEventEnd(ev); return end ? <span className="text-text-muted/60 text-xs font-mono"> {end}</span> : null; })()}
        {ev.noteTitle && <span className="block text-[10px] text-text-muted/45 truncate">{ev.noteTitle}</span>}
      </span>
    </button>
  );
}

function AgendaListView({ events, today, onOpen }: { events: AggEvent[]; today: string; onOpen: (id: string) => void }) {
  const { upcoming, past } = splitUpcomingPast(events, today);
  const Section = ({ label, items }: { label: string; items: AggEvent[] }) =>
    items.length === 0 ? null : (
      <div className="flex flex-col gap-1.5 mb-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-text-muted/50">{label}</p>
        {groupByDate(items).map(({ date, events: evs }) => (
          <div key={date} className="rounded-lg bg-bg-elevated/60 px-3 py-2">
            <p className="text-[12px] font-medium mb-0.5" style={{ color: ACCENT }}>{formatDayHeader(date)}</p>
            {evs.map((ev) => <EventRow key={ev.id} ev={ev} onOpen={onOpen} />)}
          </div>
        ))}
      </div>
    );
  return (
    <div>
      <Section label="À venir" items={upcoming} />
      <Section label="Passés" items={past} />
    </div>
  );
}

function AgendaCalendarView({ events, today, onOpen }: { events: AggEvent[]; today: string; onOpen: (id: string) => void }) {
  const byDate = eventsByDate(events);
  const [y, setY] = useState(() => parseInt(today.slice(0, 4)));
  const [mo, setMo] = useState(() => parseInt(today.slice(5, 7)) - 1);
  const [selected, setSelected] = useState<string | null>(today);

  const daysInMonth = new Date(y, mo + 1, 0).getDate();
  const lead = (new Date(y, mo, 1).getDay() + 6) % 7;
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
        <button type="button" onClick={() => shift(-1)} aria-label="Mois précédent" className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted/60 hover:text-text-primary hover:bg-text-muted/8 transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <span className="text-sm font-medium text-text-primary">{MONTHS[mo]} {y}</span>
        <button type="button" onClick={() => shift(1)} aria-label="Mois suivant" className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted/60 hover:text-text-primary hover:bg-text-muted/8 transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d, i) => <div key={i} className="text-center text-[10px] text-text-muted/45 font-mono py-1">{d}</div>)}
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
              onClick={() => setSelected(iso)}
              className={`relative aspect-square min-h-[40px] flex items-center justify-center rounded-lg text-[13px] transition-colors ${isSel ? 'text-white' : has ? 'text-text-primary hover:bg-text-muted/8' : 'text-text-muted/45 hover:bg-text-muted/5'} ${isToday && !isSel ? 'ring-1 ring-inset' : ''}`}
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
      <div className="rounded-lg bg-bg-elevated/60 px-3 py-2 mt-1 min-h-[3rem]">
        {selected ? (
          <>
            <p className="text-[12px] font-medium mb-0.5" style={{ color: ACCENT }}>{formatDayHeader(selected)}</p>
            {selectedEvents.length > 0
              ? selectedEvents.map((ev) => <EventRow key={ev.id} ev={ev} onOpen={onOpen} />)
              : <p className="text-xs text-text-muted/55 italic py-1">Aucun événement ce jour-là.</p>}
          </>
        ) : (
          <p className="text-xs text-text-muted/55 italic py-1">Choisis un jour pour voir ses événements.</p>
        )}
      </div>
    </div>
  );
}
