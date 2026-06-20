import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

/**
 * Conteneur à scroll horizontal masqué (`hide-scrollbar`) AVEC une affordance de
 * débordement : un dégradé apparaît sur le bord gauche et/ou droit tant qu'il
 * reste du contenu à faire défiler dans cette direction (cf. TRANS-03 — les
 * `overflow-x-auto hide-scrollbar` nus ne signalent pas qu'on peut scroller).
 *
 * Drop-in pour `<div className="… overflow-x-auto hide-scrollbar">…</div>` :
 * la `className` est appliquée à l'élément scrollable interne (flex, gap, padding).
 *
 * `fadeFrom` = couleur vers laquelle le dégradé fond (= fond du parent).
 * Défaut : le fond élevé (cartes de filtres). Passer `var(--color-bg-primary)`
 * sur fond de page.
 */
interface HScrollProps {
  children: ReactNode;
  className?: string;
  fadeFrom?: string;
  /** Largeur du dégradé. Défaut 2rem. */
  fadeWidth?: string;
  /** Ref optionnelle vers l'élément scrollable interne (auto-scroll, mesure…). */
  innerRef?: RefObject<HTMLDivElement>;
}

export function HScroll({ children, className, fadeFrom = 'var(--color-bg-elevated)', fadeWidth = '2rem', innerRef }: HScrollProps) {
  const ownRef = useRef<HTMLDivElement>(null);
  const ref = innerRef ?? ownRef;
  const [edges, setEdges] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft < max - 1;
    // Bail-out si inchangé : permet de rappeler update() à chaque rendu sans boucle.
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [update]);

  // Recalcule après chaque rendu (le contenu des filtres peut changer).
  useEffect(update);

  return (
    <div className="relative min-w-0">
      <div ref={ref} className={`overflow-x-auto hide-scrollbar ${className ?? ''}`}>
        {children}
      </div>
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 left-0 transition-opacity duration-200 ${edges.left ? 'opacity-100' : 'opacity-0'}`}
        style={{ width: fadeWidth, background: `linear-gradient(to right, ${fadeFrom}, transparent)` }}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 right-0 transition-opacity duration-200 ${edges.right ? 'opacity-100' : 'opacity-0'}`}
        style={{ width: fadeWidth, background: `linear-gradient(to left, ${fadeFrom}, transparent)` }}
      />
    </div>
  );
}
