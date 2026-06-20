import type { AgendaEvent, MediaMeta } from '../lib/db/schema';
import { isoToday } from '../lib/dateHelpers';
import { sortEvents } from '../lib/agendaEvents';
import { useBufferedInput } from '../hooks/useBufferedInput';
import { DatePicker } from './DatePicker';
import { TimeInput } from './TimeInput';

/**
 * Éditeur des événements d'une note AGENDA (monté dans MediaMetaPanel).
 * Contrôlé : lit `meta.events`, remonte chaque modif via `onChange`.
 *
 * Affichage **trié** comme la vue lecture (date → heure ; sans-heure en fin de
 * journée) pour rester WYSIWYG. À égalité (même jour + même heure, typiquement
 * plusieurs événements sans heure), l'ordre suit le tableau et est réordonnable
 * via les **flèches ↑/↓** (« flèches d'appoint » : actives seulement au sein d'un
 * tel groupe — c'est là que réordonner change quelque chose).
 *
 * Les champs texte sont **tamponnés** (`useBufferedInput`, commit au blur) :
 * sinon chaque frappe partait en base (async) puis revenait → curseur en fin de
 * champ et touches mortes (`^`+`o` = `ô`) cassées.
 */
export function AgendaEventBuilder({
  meta,
  onChange,
}: {
  meta: MediaMeta | null;
  onChange: (m: MediaMeta) => void;
}) {
  const m = meta ?? {};
  const events = m.events ?? [];

  const commit = (next: AgendaEvent[]) => onChange({ ...m, events: next });
  const patch = (id: string, p: Partial<AgendaEvent>) =>
    commit(events.map((e) => (e.id === id ? { ...e, ...p } : e)));
  const add = () =>
    commit([...events, { id: crypto.randomUUID(), date: isoToday(), title: '' }]);
  const remove = (id: string) => commit(events.filter((e) => e.id !== id));

  // Échange la position de deux événements dans le tableau `events` → modifie
  // leur ordre manuel (tie-break du tri), donc l'ordre affiché.
  const swap = (idA: string, idB: string) => {
    const a = events.findIndex((e) => e.id === idA);
    const b = events.findIndex((e) => e.id === idB);
    if (a < 0 || b < 0) return;
    const next = [...events];
    const tmp = next[a]!; // a et b validés ≥ 0 ci-dessus
    next[a] = next[b]!;
    next[b] = tmp;
    commit(next);
  };

  const sorted = sortEvents(events);
  const tieKey = (e: AgendaEvent) => `${e.date}|${e.time ?? ''}`;

  return (
    <div className="flex flex-col gap-2.5">
      {events.length === 0 && (
        <p className="text-xs text-text-muted/60 italic">Aucun événement pour l'instant.</p>
      )}

      {sorted.map((ev, i) => {
        const prev = sorted[i - 1];
        const next = sorted[i + 1];
        const canUp = !!prev && tieKey(prev) === tieKey(ev);
        const canDown = !!next && tieKey(next) === tieKey(ev);
        return (
          <AgendaEventRow
            key={ev.id}
            event={ev}
            onPatch={(p) => patch(ev.id, p)}
            onRemove={() => remove(ev.id)}
            canUp={canUp}
            canDown={canDown}
            onMoveUp={() => { if (prev && canUp) swap(ev.id, prev.id); }}
            onMoveDown={() => { if (next && canDown) swap(ev.id, next.id); }}
          />
        );
      })}

      <button
        type="button"
        onClick={add}
        className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-accent/10 text-accent border border-accent/20 hover:bg-accent/15 transition-colors"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        Ajouter un événement
      </button>
    </div>
  );
}

/** Un événement — titre/lieu tamponnés (commit au blur), date/heure/fait/fin immédiats. */
function AgendaEventRow({
  event: ev,
  onPatch,
  onRemove,
  canUp,
  canDown,
  onMoveUp,
  onMoveDown,
}: {
  event: AgendaEvent;
  onPatch: (p: Partial<AgendaEvent>) => void;
  onRemove: () => void;
  canUp: boolean;
  canDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const title = useBufferedInput(ev.title, (v) => onPatch({ title: v }));
  const location = useBufferedInput(ev.location ?? '', (v) => onPatch({ location: v.trim() || undefined }));
  const hasEnd = !!(ev.endDate || ev.endTime);
  const showReorder = canUp || canDown;

  return (
    <div className="rounded-xl border border-text-muted/12 bg-bg-primary/40 p-2.5 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {showReorder && (
          <div className="shrink-0 flex flex-col -my-1">
            <button
              type="button"
              onClick={onMoveUp}
              disabled={!canUp}
              aria-label="Monter l'événement"
              className="w-6 h-5 flex items-center justify-center rounded text-text-muted/60 hover:text-accent hover:bg-text-muted/8 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-text-muted/60 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={!canDown}
              aria-label="Descendre l'événement"
              className="w-6 h-5 flex items-center justify-center rounded text-text-muted/60 hover:text-accent hover:bg-text-muted/8 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-text-muted/60 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
          </div>
        )}
        <input
          {...title}
          placeholder="Titre de l'événement…"
          className="flex-1 min-w-0 bg-transparent text-sm text-text-primary placeholder:text-text-muted/40 outline-none border-b border-text-muted/10 focus:border-accent/30 pb-1 transition-colors"
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label="Supprimer l'événement"
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-text-muted/55 hover:text-danger hover:bg-danger/10 transition-colors"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
        </button>
      </div>

      {/* Début */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-9 shrink-0 text-[11px] text-text-muted/60">Début</span>
        <DatePicker value={ev.date} onChange={(v) => onPatch({ date: v || isoToday() })} portal className="shrink-0" />
        <TimeInput value={ev.time ?? ''} onChange={(v) => onPatch({ time: v || undefined })} className="w-[88px] shrink-0" />
      </div>

      {/* Fin (optionnelle) */}
      {hasEnd ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-9 shrink-0 text-[11px] text-text-muted/60">Fin</span>
          <DatePicker value={ev.endDate ?? ev.date} onChange={(v) => onPatch({ endDate: v || ev.date })} portal className="shrink-0" />
          <TimeInput value={ev.endTime ?? ''} onChange={(v) => onPatch({ endTime: v || undefined })} className="w-[88px] shrink-0" />
          <button
            type="button"
            onClick={() => onPatch({ endDate: undefined, endTime: undefined })}
            aria-label="Retirer la fin"
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg text-text-muted/50 hover:text-danger hover:bg-danger/10 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onPatch({ endDate: ev.date })}
          className="self-start inline-flex items-center gap-1 text-[11px] font-medium text-accent/80 hover:text-accent transition-colors"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Ajouter une fin
        </button>
      )}

      {/* Lieu + Fait */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          {...location}
          placeholder="Lieu…"
          className="flex-1 min-w-[100px] bg-bg-primary border border-text-muted/15 rounded-lg px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted/40 outline-none focus:border-accent/30 transition-colors"
        />
        <label className="shrink-0 inline-flex items-center gap-1.5 text-[11px] text-text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!ev.done}
            onChange={(e) => onPatch({ done: e.target.checked })}
            className="accent-accent w-3.5 h-3.5"
          />
          Fait
        </label>
      </div>
    </div>
  );
}
