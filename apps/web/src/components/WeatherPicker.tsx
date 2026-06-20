import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDropdownAlign } from '../lib/useDropdownAlign';

interface WeatherOption {
  emoji: string;
  label: string;
}

/**
 * Liste exhaustive d'emojis météo / sensations, groupés par catégorie.
 * L'ordre suit grosso modo : ciel → précipitations → phénomènes extrêmes → ressenti.
 */
const WEATHER_OPTIONS: WeatherOption[] = [
  // Ciel
  { emoji: '☀️',  label: 'Plein soleil' },
  { emoji: '🌤️', label: 'Soleil voilé' },
  { emoji: '⛅',  label: 'Nuageux ensoleillé' },
  { emoji: '🌥️', label: 'Très nuageux' },
  { emoji: '☁️',  label: 'Couvert' },
  // Précipitations
  { emoji: '🌦️', label: 'Soleil et pluie' },
  { emoji: '🌧️', label: 'Pluie' },
  { emoji: '⛈️',  label: 'Orage' },
  { emoji: '🌩️', label: 'Éclair' },
  { emoji: '❄️',  label: 'Neige' },
  { emoji: '🌨️', label: 'Tempête de neige' },
  // Phénomènes
  { emoji: '🌫️', label: 'Brouillard' },
  { emoji: '💨',  label: 'Vent' },
  { emoji: '🌪️', label: 'Tornade' },
  { emoji: '🌈',  label: 'Arc-en-ciel' },
  // Cycle jour/nuit
  { emoji: '🌅',  label: 'Lever de soleil' },
  { emoji: '🌇',  label: 'Coucher de soleil' },
  { emoji: '🌙',  label: 'Nuit claire' },
  // Ressenti
  { emoji: '🥵',  label: 'Canicule' },
  { emoji: '🥶',  label: 'Glacial' },
  { emoji: '💧',  label: 'Humide' },
];

export function WeatherPicker({
  value,
  onChange,
  minimal = false,
  showLabel = false,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  minimal?: boolean;
  showLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; right: number } | null>(null);
  // Recale le panneau dans le viewport s'il déborde (mobile) — cf. pattern
  // « Dropdowns viewport-safe » (CLAUDE.md).
  const { panelRef, panelStyle } = useDropdownAlign<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (containerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  const current = WEATHER_OPTIONS.find((o) => o.emoji === value);
  const placeholder = '🌤️';

  return (
    <div ref={containerRef} className={`relative ${minimal ? '' : 'flex-1'}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          if (!open && btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            setDropPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
          }
          setOpen((v) => !v);
        }}
        className={minimal
          ? `flex items-center gap-1.5 text-sm text-left ${value ? 'pr-5' : ''}`
          : `w-full flex items-center gap-2 bg-bg-primary/60 rounded-xl px-3 py-2 border transition-colors ${value ? 'pr-8' : ''} ${open ? 'border-accent/40' : 'border-transparent hover:border-text-muted/15'}`
        }
      >
        <span className="text-base shrink-0" title={current?.label}>{value || placeholder}</span>
        {minimal && showLabel && current?.label && (
          <span className="text-xs text-text-muted/70 truncate max-w-[90px]">{current.label}</span>
        )}
        {!minimal && (
          <span className={`text-sm text-left flex-1 truncate ${value ? 'text-text-primary' : 'text-text-muted/55'}`}>
            {current?.label ?? (value ? 'Météo perso' : 'Météo…')}
          </span>
        )}
      </button>
      {/* Bouton « effacer » : frère du trigger (pas imbriqué — HTML valide, clavier/AT
          fiable, cf. BUG-09), positionné en absolu sur le bord droit du champ. */}
      {value && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onChange(null); }}
          className={`absolute top-1/2 -translate-y-1/2 ${minimal ? 'right-0' : 'right-2'} text-[11px] text-text-muted/55 hover:text-danger transition-colors px-1 cursor-pointer`}
          aria-label="Effacer la météo"
        >
          ✕
        </button>
      )}

      {open && dropPos && createPortal(
        <div
          ref={panelRef}
          className="fixed z-[200] bg-bg-elevated border border-text-muted/15 rounded-xl shadow-lg p-2 min-w-[180px] max-w-[calc(100vw-16px)]"
          style={{ top: dropPos.top, right: Math.max(8, dropPos.right), ...panelStyle }}
        >
          <div className="grid grid-cols-6 gap-1 max-h-[40vh] overflow-y-auto hide-scrollbar">
            {WEATHER_OPTIONS.map((opt) => {
              const active = opt.emoji === value;
              return (
                <button
                  key={opt.emoji}
                  type="button"
                  onClick={() => {
                    onChange(active ? null : opt.emoji);
                    setOpen(false);
                  }}
                  title={opt.label}
                  aria-label={opt.label}
                  className={`aspect-square flex items-center justify-center text-xl rounded-lg transition-all duration-100 ${
                    active
                      ? 'bg-accent/20 ring-1 ring-accent/40 scale-110'
                      : 'hover:bg-text-muted/10 opacity-70 hover:opacity-100'
                  }`}
                >
                  {opt.emoji}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
