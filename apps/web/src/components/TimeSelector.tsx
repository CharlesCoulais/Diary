import { useEffect, useRef, useState } from 'react';
import type { LocalEntry } from '../lib/db/schema';
import { TimeInput } from './TimeInput';
import { useDropdownAlign } from '../lib/useDropdownAlign';

type Section = NonNullable<LocalEntry['section']>;

const SECTION_OPTIONS: { value: Section; label: string }[] = [
  { value: 'MORNING',        label: 'Matin' },
  { value: 'LATE_MORNING',   label: 'Fin de matinée' },
  { value: 'NOON',           label: 'Midi' },
  { value: 'AFTERNOON',      label: 'Après-midi' },
  { value: 'LATE_AFTERNOON', label: 'Fin d\'après-midi' },
  { value: 'EARLY_EVENING',  label: 'Début de soirée' },
  { value: 'EVENING',        label: 'Soir' },
  { value: 'NIGHT',          label: 'Nuit' },
  { value: 'FREE',           label: 'Libre' },
];

interface TimeSelectorProps {
  section: LocalEntry['section'];
  timeLabel: string | null;
  onChange: (patch: { section: LocalEntry['section']; timeLabel: string | null }) => void;
}

type Mode = 'none' | 'label' | 'time';

function resolveMode(section: LocalEntry['section'], timeLabel: string | null): Mode {
  if (timeLabel) return 'time';
  if (section) return 'label';
  return 'none';
}

export function TimeSelector({ section, timeLabel, onChange }: TimeSelectorProps) {
  const initialMode = resolveMode(section, timeLabel);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [dropOpen, setDropOpen] = useState(false);
  const { panelRef, panelStyle } = useDropdownAlign(dropOpen);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropOpen) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [dropOpen]);

  const switchToLabel = () => {
    setMode('label');
    onChange({ section: section ?? 'MORNING', timeLabel: null });
  };

  const switchToTime = () => {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const defaultTime = timeLabel ?? currentTime;
    setMode('time');
    onChange({ section: null, timeLabel: defaultTime });
  };

  const clear = () => {
    setMode('none');
    setDropOpen(false);
    onChange({ section: null, timeLabel: null });
  };

  const currentLabel = SECTION_OPTIONS.find((o) => o.value === section)?.label ?? 'Matin';

  // ── Rien de sélectionné ──────────────────────────────────────────────────
  if (mode === 'none') {
    return (
      <button
        type="button"
        onClick={switchToLabel}
        className="text-xs text-text-muted/70 hover:text-accent transition-colors px-1.5 py-1 -mx-1.5 -my-1 rounded-lg"
      >
        + heure
      </button>
    );
  }

  // ── Mode heure précise ───────────────────────────────────────────────────
  if (mode === 'time') {
    return (
      <div className="flex items-center gap-2">
        <TimeInput
          value={timeLabel ?? ''}
          onChange={(hhmm) => onChange({ section: null, timeLabel: hhmm || null })}
          className="tabular-nums"
          placeholder="HH:MM"
        />
        <button type="button" onClick={switchToLabel}
          className="text-xs text-text-muted/70 hover:text-accent transition-colors px-1.5 py-1 rounded-lg">
          Moment
        </button>
        <button type="button" onClick={clear} aria-label="Retirer l'heure"
          className="text-text-muted/55 hover:text-danger text-base leading-none transition-colors px-1.5 py-1 rounded-lg">
          ×
        </button>
      </div>
    );
  }

  // ── Mode terme — dropdown compact ────────────────────────────────────────
  return (
    <div className="flex items-center gap-2">
      <div className="relative" ref={dropRef}>
        <button
          type="button"
          onClick={() => setDropOpen((v) => !v)}
          className={`flex items-center gap-1.5 bg-bg-primary/60 border rounded-xl px-3 py-1.5 text-sm whitespace-nowrap shrink-0 transition-colors ${dropOpen ? 'border-accent/40 text-text-primary' : 'border-text-muted/15 text-text-primary/80 hover:border-text-muted/30'}`}
        >
          {currentLabel}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${dropOpen ? 'rotate-180' : ''}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {dropOpen && (
          <div ref={panelRef} style={panelStyle} className="absolute left-0 top-full mt-1 z-30 bg-bg-elevated border border-text-muted/15 rounded-xl shadow-lg py-1 min-w-[160px]">
            {SECTION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange({ section: opt.value, timeLabel: null }); setDropOpen(false); }}
                className={`w-full text-left px-4 py-2 text-sm transition-colors ${section === opt.value ? 'text-accent bg-accent/8 font-medium' : 'text-text-muted hover:text-text-primary hover:bg-text-muted/5'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button type="button" onClick={switchToTime}
        className="text-xs text-text-muted/70 hover:text-accent transition-colors whitespace-nowrap shrink-0 px-1.5 py-1 rounded-lg">
        Heure exacte
      </button>
      <button type="button" onClick={clear} aria-label="Retirer l'heure"
        className="text-text-muted/55 hover:text-danger text-base leading-none transition-colors shrink-0 px-1.5 py-1 rounded-lg">
        ×
      </button>
    </div>
  );
}
