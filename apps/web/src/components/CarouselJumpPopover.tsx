import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Popover « aller à l'élément N » réutilisable par tous les carrousels
 * (playlist musique, photos, vidéos…) : saisie directe d'un numéro (utile pour
 * les grandes séries) + liste cliquable. Chaque ligne est rendue par `renderItem`
 * (titre, vignette, nom de fichier…). Rendu en portal ancré au compteur pour
 * échapper aux conteneurs `overflow-hidden` (panneau desktop, carte).
 */
export function CarouselJumpPopover({
  count,
  activeIndex,
  triggerRef,
  onSelect,
  onClose,
  renderItem,
}: {
  count: number;
  activeIndex: number;
  triggerRef: React.RefObject<HTMLElement>;
  onSelect: (index: number) => void;
  onClose: () => void;
  renderItem?: (index: number) => React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [style, setStyle] = useState<React.CSSProperties | null>(null);
  const [num, setNum] = useState('');
  const W = 260, H = 340;

  // Position fixe ancrée au trigger, clampée au viewport (préfère en dessous).
  useLayoutEffect(() => {
    const compute = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const m = 8, vw = window.innerWidth, vh = window.innerHeight;
      let left = r.left + r.width / 2 - W / 2;
      if (left + W > vw - m) left = vw - W - m;
      if (left < m) left = m;
      const below = vh - r.bottom - m, above = r.top - m;
      const top = below >= H ? r.bottom + 4 : above >= H ? r.top - H - 4 : Math.max(m, vh - H - m);
      setStyle({ position: 'fixed', left, top, width: W, maxHeight: H, zIndex: 60 });
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [triggerRef]);

  // Fermeture : clic extérieur (souris + tactile) et Échap.
  useEffect(() => {
    const outside = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', outside);
    document.addEventListener('touchstart', outside);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('touchstart', outside);
      document.removeEventListener('keydown', key);
    };
  }, [onClose, triggerRef]);

  // Centre l'élément actif dans la liste à l'ouverture.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'center' });
  }, []);

  const go = (i: number) => { onSelect(Math.min(Math.max(i, 0), count - 1)); onClose(); };
  const submitNum = () => { const n = parseInt(num, 10); if (!isNaN(n)) go(n - 1); };

  return createPortal(
    <div
      ref={ref}
      style={style ?? { position: 'fixed', opacity: 0, pointerEvents: 'none' }}
      className="bg-bg-elevated border border-text-muted/15 rounded-xl shadow-2xl overflow-hidden flex flex-col"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 p-2 border-b border-text-muted/10 shrink-0">
        <input
          type="text"
          inputMode="numeric"
          value={num}
          autoFocus
          onChange={(e) => setNum(e.target.value.replace(/[^0-9]/g, ''))}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitNum(); } }}
          placeholder={`n° (1–${count})`}
          className="flex-1 min-w-0 bg-bg-primary border border-text-muted/15 rounded-lg px-2 py-1 text-sm tabular-nums text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/40"
        />
        <button type="button" onClick={submitNum} className="px-2.5 py-1 text-xs rounded-lg bg-accent text-white font-medium transition-opacity hover:opacity-90">
          Aller
        </button>
      </div>
      <ul ref={listRef} className="flex-1 overflow-y-auto scrollbar-soft py-1 min-h-0">
        {Array.from({ length: count }, (_, i) => (
          <li key={i}>
            <button
              type="button"
              data-active={i === activeIndex}
              onClick={() => go(i)}
              className={
                'w-full text-left px-3 py-1.5 flex gap-2 items-center transition-colors ' +
                (i === activeIndex ? 'bg-accent/10 text-accent' : 'text-text-primary hover:bg-text-muted/5')
              }
            >
              <span className="text-[11px] tabular-nums opacity-50 w-7 shrink-0 text-right">{i + 1}</span>
              <span className="min-w-0 flex-1">{renderItem ? renderItem(i) : null}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>,
    document.body,
  );
}
