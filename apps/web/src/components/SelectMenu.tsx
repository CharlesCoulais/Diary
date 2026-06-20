import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDropdownAlign } from '../lib/useDropdownAlign';

/**
 * Dropdown personnalisé réutilisable — remplace les `<select>` natifs (politique
 * « pas de select OS » : rendu incohérent entre desktop/iOS/Android).
 *
 * Trigger stylé comme les autres inputs de l'app (`bg-bg-primary/60 border
 * border-text-muted/15 rounded-xl`) montrant le libellé (et l'icône) de l'option
 * active + un chevron. Au clic, un panneau s'ouvre via `createPortal` sur
 * `document.body`, ancré sous le bouton et maintenu dans le viewport
 * (`useDropdownAlign`, comme l'IconPicker de NoteTypePicker). Chaque option est
 * un bouton (cible tactile ≥ 36px) : libellé en gras léger, description muette
 * optionnelle sur une 2e ligne, check ✓ sur la valeur active. Fermeture au clic
 * dehors, à Échap, et après sélection.
 */

export interface SelectMenuOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

export function SelectMenu<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  buttonClassName,
  panelWidthClass,
}: {
  value: T;
  options: SelectMenuOption<T>[];
  onChange: (v: T) => void;
  ariaLabel: string;
  /** Classes appliquées au bouton trigger (override du style par défaut). */
  buttonClassName?: string;
  /** Classe de largeur du panneau (défaut : largeur du bouton). */
  panelWidthClass?: string;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { panelRef: alignRef, panelStyle: alignStyle } = useDropdownAlign<HTMLDivElement>(open);

  const selected = options.find((o) => o.value === value);

  const openPanel = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    setOpen(true);
  };

  // Fermeture au clic dehors + Échap.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={
          buttonClassName ??
          'inline-flex items-center justify-between gap-2 w-full min-w-0 bg-bg-primary/60 border border-text-muted/15 rounded-xl px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-accent/40 hover:border-text-muted/30 transition-colors'
        }
      >
        <span className="inline-flex items-center gap-1.5 min-w-0">
          {selected?.icon}
          <span className="truncate">{selected?.label ?? '—'}</span>
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && pos && createPortal(
        <div
          ref={(node) => {
            panelRef.current = node;
            (alignRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          }}
          role="listbox"
          aria-label={ariaLabel}
          className={
            'fixed z-[202] bg-bg-elevated border border-text-muted/15 rounded-xl shadow-xl py-1 max-h-[60vh] overflow-y-auto scrollbar-soft ' +
            (panelWidthClass ?? '')
          }
          style={{
            top: pos.top,
            left: pos.left,
            width: panelWidthClass ? undefined : Math.max(pos.width, 160),
            maxWidth: 'calc(100vw - 16px)',
            ...alignStyle,
          }}
        >
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={
                  'w-full flex items-start gap-2 px-3 py-2 min-h-[36px] text-left text-sm transition-colors ' +
                  (active
                    ? 'text-accent bg-bg-primary/60'
                    : 'text-text-primary hover:bg-bg-primary/60')
                }
              >
                {opt.icon && <span className="shrink-0 mt-0.5">{opt.icon}</span>}
                <span className="flex-1 min-w-0">
                  <span className={'block ' + (active ? 'font-semibold' : 'font-medium')}>
                    {opt.label}
                  </span>
                  {opt.description && (
                    <span className="block text-[11px] leading-snug text-text-muted/70 mt-0.5">
                      {opt.description}
                    </span>
                  )}
                </span>
                {active && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 mt-0.5 text-accent"
                    aria-hidden
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
