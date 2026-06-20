import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDropdownAlign } from '../lib/useDropdownAlign';

// ── Helpers ───────────────────────────────────────────────────────────────────

const WEEKDAYS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];
const MONTHS_LONG = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function dateToIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayIso(): string {
  return dateToIso(new Date());
}

function buildCalendarGrid(year: number, month: number) {
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0…Sun=6
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ date: Date; current: boolean }> = [];

  for (let i = firstDow - 1; i >= 0; i--)
    cells.push({ date: new Date(year, month, -i), current: false });
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ date: new Date(year, month, d), current: true });
  const trailing = cells.length % 7 === 0 ? 0 : 7 - (cells.length % 7);
  for (let i = 1; i <= trailing; i++)
    cells.push({ date: new Date(year, month + 1, i), current: false });

  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

function formatShort(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

// ── CalendarPanel (panneau seul, sans trigger) ───────────────────────────────

interface PanelProps {
  value: string;       // YYYY-MM-DD ou ''
  onChange: (v: string) => void;
  onClose: () => void;
  min?: string;
  max?: string;
  className?: string;
}

export function CalendarPanel({ value, onChange, onClose, min, max, className = '' }: PanelProps) {
  const today = todayIso();
  const ref = useRef<HTMLDivElement>(null);

  const [year, setYear] = useState(() => value ? parseInt(value.slice(0, 4)) : new Date().getFullYear());
  const [month, setMonth] = useState(() => value ? parseInt(value.slice(5, 7)) - 1 : new Date().getMonth());

  const prevMonth = () => month === 0 ? (setMonth(11), setYear(y => y - 1)) : setMonth(m => m - 1);
  const nextMonth = () => month === 11 ? (setMonth(0), setYear(y => y + 1)) : setMonth(m => m + 1);

  const isDisabled = (iso: string) => (min && iso < min) || (max && iso > max) || false;

  // Fermer sur click extérieur / Escape
  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const todaySelectable = !isDisabled(today);
  const grid = buildCalendarGrid(year, month);

  return (
    <div
      ref={ref}
      className={`z-50 bg-bg-elevated border border-text-muted/15 rounded-2xl shadow-soft overflow-hidden w-[272px] ${className}`}
    >
      {/* Navigation mois */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-text-muted/[0.08]">
        <button type="button" onClick={prevMonth}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-text-muted/8 text-text-muted transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span className="text-sm font-medium text-text-primary capitalize">
          {MONTHS_LONG[month]} {year}
        </span>
        <button type="button" onClick={nextMonth}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-text-muted/8 text-text-muted transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      {/* En-têtes jours */}
      <div className="grid grid-cols-7 px-2 pt-2 pb-0.5">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-center text-[11px] font-medium text-text-muted/55 py-1">{d}</div>
        ))}
      </div>

      {/* Grille jours */}
      <div className="px-2 pb-2">
        {grid.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map(({ date, current }) => {
              const iso = dateToIso(date);
              const selected = iso === value;
              const isToday = iso === today;
              const disabled = isDisabled(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={disabled}
                  onClick={() => { onChange(iso); onClose(); }}
                  className={[
                    'h-8 w-full flex items-center justify-center rounded-lg text-[12px] transition-colors',
                    selected
                      ? 'bg-accent text-white font-semibold'
                      : isToday && !disabled
                        ? 'ring-1 ring-accent/50 text-accent font-medium hover:bg-accent/10'
                        : disabled
                          ? 'text-text-muted/20 cursor-default'
                          : !current
                            ? 'text-text-muted/45 hover:bg-text-muted/5'
                            : 'text-text-primary hover:bg-text-muted/8',
                  ].join(' ')}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer : Aujourd'hui */}
      {todaySelectable && (
        <div className="px-3 pb-2.5 pt-0.5 border-t border-text-muted/[0.08]">
          <button
            type="button"
            onClick={() => { onChange(today); onClose(); }}
            className="text-[11px] text-accent/70 hover:text-accent transition-colors font-medium"
          >
            Aujourd'hui
          </button>
          {value && (
            <button
              type="button"
              onClick={() => { onChange(''); onClose(); }}
              className="text-[11px] text-text-muted/55 hover:text-text-muted transition-colors ml-3"
            >
              Effacer
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── DatePicker (trigger + panel) ──────────────────────────────────────────────

interface DatePickerProps {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  /** 'field' (défaut) : style champ de formulaire plein, 'pill' : bouton filtre compact */
  variant?: 'field' | 'pill';
  className?: string;
  /** Rend le calendrier via portal (position fixed) — à utiliser quand un ancêtre
   *  crée un contexte d'empilement / un overflow qui rognerait ou masquerait le
   *  panneau (ex. au-dessus d'une toolbar sticky). */
  portal?: boolean;
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = 'Date…',
  variant = 'field',
  className = '',
  portal = false,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [portalPos, setPortalPos] = useState<{ top: number; left: number } | null>(null);
  const { panelRef, panelStyle } = useDropdownAlign(open && !portal);

  // En mode portal : recalcule la position (ancrée au trigger) à chaque toggle.
  const toggleOpen = () => {
    if (portal && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      const width = 272;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      setPortalPos({ top: r.bottom + 6, left });
    }
    setOpen((v) => !v);
  };

  const clearValue = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  const isActive = !!value;
  const isPill = variant === 'pill';

  const triggerBase = isPill
    ? 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all duration-150 '
    : 'flex items-center gap-2 w-full px-2.5 py-1.5 rounded-xl text-sm border transition-all duration-150 ';

  const triggerColors = isPill
    ? (isActive
        ? 'bg-accent/15 border-accent/40 text-accent font-medium'
        : open
          ? 'border-text-muted/20 text-text-muted bg-text-muted/8'
          : 'border-text-muted/15 text-text-muted/60 hover:border-text-muted/30 hover:text-text-muted')
    : `bg-bg-primary border-text-muted/15 text-text-primary hover:border-text-muted/30 ${open ? 'border-accent/40' : ''}`;

  return (
    <div className="relative" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        className={`${triggerBase}${triggerColors} ${className}`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-50">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <span className={`flex-1 text-left whitespace-nowrap overflow-hidden text-ellipsis ${!value ? 'text-text-muted/50' : ''}`}>
          {value ? formatShort(value) : placeholder}
        </span>
        {isActive ? (
          <span role="button" onClick={clearValue} className="shrink-0 opacity-50 hover:opacity-100 transition-opacity ml-auto">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </span>
        ) : isPill ? (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform duration-100 ${open ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"/></svg>
        ) : null}
      </button>

      {open && (portal && portalPos
        ? createPortal(
            <div data-datepicker-portal="" style={{ position: 'fixed', top: portalPos.top, left: portalPos.left, zIndex: 120 }}>
              <CalendarPanel
                value={value}
                onChange={onChange}
                onClose={() => setOpen(false)}
                min={min}
                max={max}
              />
            </div>,
            document.body,
          )
        : (
          <div ref={panelRef} style={panelStyle} className="absolute left-0 top-full mt-1.5">
            <CalendarPanel
              value={value}
              onChange={onChange}
              onClose={() => setOpen(false)}
              min={min}
              max={max}
            />
          </div>
        ))}
    </div>
  );
}
