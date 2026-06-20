import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Lightbox plein écran avec **zoom** : molette (desktop), double-clic / double-tap
 * (toggle 1× ↔ 2,5×) et **pinch** à deux doigts (mobile), + **pan** au drag quand
 * c'est zoomé. Le pinch natif du navigateur est désactivé globalement
 * (`maximum-scale=1` du viewport, anti-zoom-input iOS) → on gère le zoom en JS.
 *
 * Composant partagé : notes (via TruncatedImage), Collection, messagerie.
 */
const MIN = 1;
const MAX = 5;

export function ImageLightbox({ src, alt = '', onClose }: { src: string; alt?: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const ptrs = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const pan = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);

  // État courant lu dans les handlers sans re-binder (refs miroir).
  const st = useRef({ scale, tx, ty });
  st.current = { scale, tx, ty };

  // Borne le pan pour que l'image ne sorte pas complètement de l'écran.
  const clampApply = (s: number, nx: number, ny: number) => {
    const el = imgRef.current;
    const w = el ? el.clientWidth * s : 0;
    const h = el ? el.clientHeight * s : 0;
    const maxX = Math.max(0, (w - window.innerWidth) / 2);
    const maxY = Math.max(0, (h - window.innerHeight) / 2);
    setScale(s);
    setTx(Math.min(maxX, Math.max(-maxX, nx)));
    setTy(Math.min(maxY, Math.max(-maxY, ny)));
  };

  // Zoom vers un point focal (coordonnées écran) en gardant ce point fixe.
  const zoomTo = (target: number, focalX: number, focalY: number) => {
    const s = st.current.scale;
    const s2 = Math.min(MAX, Math.max(MIN, target));
    const fx = focalX - window.innerWidth / 2;
    const fy = focalY - window.innerHeight / 2;
    if (s2 === 1) { clampApply(1, 0, 0); return; }
    const nx = fx - (fx - st.current.tx) * (s2 / s);
    const ny = fy - (fy - st.current.ty) * (s2 / s);
    clampApply(s2, nx, ny);
  };

  // Verrou de scroll : effet À PART, monté UNE SEULE FOIS (deps []). ⚠️ Ne JAMAIS
  // le mettre dans un effet qui dépend de `onClose` : si le parent passe un
  // onClose non mémoïsé, l'effet se relance à chaque re-render et re-capture
  // `prevOverflow` à 'hidden' → à la fermeture, body reste overflow:hidden et le
  // scroll tactile reste figé sur mobile (le bug). Ici, on capture/restaure la
  // vraie valeur précédente exactement une fois.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    // Molette → zoom (listener natif non-passif pour pouvoir preventDefault).
    const el = containerRef.current;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomTo(st.current.scale * (e.deltaY < 0 ? 1.18 : 1 / 1.18), e.clientX, e.clientY);
    };
    el?.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      document.removeEventListener('keydown', onKey);
      el?.removeEventListener('wheel', onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  // Pas de setPointerCapture : les gestes sont gérés sur le CONTENEUR plein écran
  // (le doigt ne sort jamais de l'overlay → la capture est inutile). setPointerCapture
  // a un bug iOS WebKit connu : une capture non libérée gèle le scroll tactile de
  // toute la page après fermeture (« faut kill l'app »). On l'évite donc totalement.
  const onPointerDown = (e: React.PointerEvent) => {
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      if (!a || !b) return;
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: st.current.scale };
      pan.current = null;
    } else if (ptrs.current.size === 1 && st.current.scale > 1) {
      pan.current = { x: e.clientX, y: e.clientY };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 2 && pinch.current) {
      const [a, b] = [...ptrs.current.values()];
      if (!a || !b) return;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      moved.current = true;
      zoomTo(pinch.current.scale * (dist / pinch.current.dist), (a.x + b.x) / 2, (a.y + b.y) / 2);
    } else if (ptrs.current.size === 1 && pan.current && st.current.scale > 1) {
      const dx = e.clientX - pan.current.x;
      const dy = e.clientY - pan.current.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved.current = true;
      pan.current = { x: e.clientX, y: e.clientY };
      clampApply(st.current.scale, st.current.tx + dx, st.current.ty + dy);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size < 2) pinch.current = null;
    if (ptrs.current.size === 0) {
      pan.current = null;
      // Double-tap tactile → toggle zoom (le double-clic souris passe par onDoubleClick).
      if (!moved.current && e.pointerType === 'touch') {
        const now = Date.now();
        const lt = lastTap.current;
        if (lt && now - lt.t < 300 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 30) {
          zoomTo(st.current.scale > 1 ? 1 : 2.5, e.clientX, e.clientY);
          lastTap.current = null;
        } else {
          lastTap.current = { t: now, x: e.clientX, y: e.clientY };
        }
      }
    }
  };

  const zoomed = scale > 1;

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Image agrandie"
      className="fixed inset-0 z-[200] bg-black/95 overflow-hidden touch-none select-none"
      onClick={(e) => { if (e.target === e.currentTarget && !moved.current) onClose(); }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="w-full h-full flex items-center justify-center p-4 sm:p-8">
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          draggable={false}
          onDoubleClick={(e) => zoomTo(zoomed ? 1 : 2.5, e.clientX, e.clientY)}
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transformOrigin: 'center center',
            cursor: zoomed ? 'grab' : 'zoom-in',
            touchAction: 'none',
            transition: ptrs.current.size === 0 ? 'transform 0.12s ease-out' : 'none',
          }}
          className="block max-w-[95vw] max-h-[95vh] w-auto h-auto rounded-lg shadow-2xl"
        />
      </div>

      {/* Indice gestes — disparaît dès qu'on a zoomé. */}
      {!zoomed && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-bg-elevated/90 backdrop-blur text-[11px] text-text-muted shadow-soft border border-text-muted/15">
          Double-tap ou pince pour zoomer
        </div>
      )}

      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer"
        className="fixed top-4 right-4 z-10 w-10 h-10 rounded-full bg-bg-elevated/90 text-text-primary flex items-center justify-center shadow-soft hover:bg-bg-elevated transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>,
    document.body,
  );
}
