import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MermaidRender } from './MermaidRender';

/**
 * Visionneuse plein écran d'un diagramme Mermaid : agrandir, zoomer (molette /
 * pincement) et naviguer (glisser / deux doigts). Pointer Events → marche au
 * desktop, iOS et Android.
 *
 * ⚠️ Netteté : on NE zoome PAS via `transform: scale()` — le navigateur
 * rasterise alors le SVG à sa taille naturelle puis étire le bitmap (flou, et
 * parfois net selon la re-rasterisation du compositeur). On change à la place la
 * **largeur réelle** du SVG (re-rendu vectoriel → toujours net) ; `transform`
 * ne sert qu'au déplacement (translate, jamais flou).
 */
export function MermaidZoomModal({ code, onClose }: { code: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [naturalW, setNaturalW] = useState<number | null>(null);
  const fitScale = useRef(1);

  const contentRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastDist = useRef<number | null>(null);
  const lastMid = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const clamp = (s: number) => Math.min(10, Math.max(0.1, s));
  const reset = useCallback(() => { setScale(fitScale.current); setTx(0); setTy(0); }, []);

  // Mesure la largeur naturelle du SVG (une fois rendu) et cale un zoom initial
  // « ajusté à l'écran » (jamais au-delà de 100 %).
  useEffect(() => {
    let raf = 0;
    let tries = 0;
    const measure = () => {
      const svg = contentRef.current?.querySelector('svg') as SVGSVGElement | null;
      if (svg) {
        const vb = svg.viewBox?.baseVal;
        const w = vb && vb.width ? vb.width : svg.getBoundingClientRect().width;
        if (w) {
          setNaturalW(w);
          const fit = clamp(Math.min(1, (window.innerWidth * 0.92) / w));
          fitScale.current = fit;
          setScale(fit);
          return;
        }
      }
      if (tries++ < 120) raf = requestAnimationFrame(measure);
    };
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [code]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Bloque le scroll de la page sous la modale.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setScale((s) => clamp(s * factor));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      dragging.current = true;
      last.current = { x: e.clientX, y: e.clientY };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];

    if (pts.length >= 2) {
      const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (lastDist.current != null) setScale((s) => clamp(s * (dist / lastDist.current!)));
      if (lastMid.current) {
        setTx((v) => v + (mid.x - lastMid.current!.x));
        setTy((v) => v + (mid.y - lastMid.current!.y));
      }
      lastDist.current = dist;
      lastMid.current = mid;
      dragging.current = false;
    } else if (dragging.current && last.current) {
      setTx((v) => v + (e.clientX - last.current!.x));
      setTy((v) => v + (e.clientY - last.current!.y));
      last.current = { x: e.clientX, y: e.clientY };
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) { lastDist.current = null; lastMid.current = null; }
    if (pointers.current.size === 0) {
      dragging.current = false;
      last.current = null;
    } else {
      const [p] = [...pointers.current.values()];
      dragging.current = true;
      last.current = p ? { x: p.x, y: p.y } : null;
    }
  };

  return createPortal(
    <div className="mermaid-zoom-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="mermaid-zoom-stage"
        onClick={(e) => e.stopPropagation()}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={reset}
        style={{ touchAction: 'none' }}
      >
        <div className="mermaid-zoom-pan" style={{ transform: `translate(${tx}px, ${ty}px)` }}>
          <div
            ref={contentRef}
            className="mermaid-zoom-content"
            style={naturalW ? { width: `${Math.round(naturalW * scale)}px` } : undefined}
          >
            <MermaidRender code={code} />
          </div>
        </div>
      </div>

      <div className="mermaid-zoom-controls" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => setScale((s) => clamp(s * 1.2))} aria-label="Zoomer">+</button>
        <span className="mermaid-zoom-pct tabular-nums">{Math.round(scale * 100)}%</span>
        <button type="button" onClick={() => setScale((s) => clamp(s / 1.2))} aria-label="Dézoomer">−</button>
        <button type="button" onClick={reset} className="mermaid-zoom-reset">Réinitialiser</button>
      </div>

      <button type="button" className="mermaid-zoom-close" onClick={onClose} aria-label="Fermer">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>,
    document.body,
  );
}
