import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { GuestTopBar } from './GuestTopBar';
import { OwnerTopBar } from './OwnerTopBar';

interface PageHeaderProps {
  title: string;
  /** Kicker mono uppercase affiché en haut (ex: "FIL", "STATS"…). Par défaut = title. */
  kicker?: string;
  /** Sous-titre optionnel affiché sous le titre en petit mono. */
  subtitle?: ReactNode;
  /** Contenu libre affiché sous le titre (ex: pills de période). Pas de style imposé. */
  controls?: ReactNode;
  /** @deprecated Navigation désormais via OwnerTopBar/GuestTopBar — ignoré. */
  backTo?: string;
  backLabel?: string;
  /** Boutons d'action à droite (insérés avant les topbars). */
  rightAction?: ReactNode;
  /** Classe additionnelle. */
  className?: string;
}

/**
 * En-tête standardisé sticky pour toutes les pages secondaires.
 * Pattern unifié mobile + desktop : kicker · avatar | grand titre.
 *
 * ⚠️ Requiert que le parent ait `lg:px-12` pour que le `-mx-12` desktop fonctionne.
 */
export function PageHeader({ title, kicker, subtitle, controls, rightAction, className = '' }: PageHeaderProps) {
  const ref = useRef<HTMLDivElement>(null);

  /**
   * Expose la hauteur réelle du PageHeader via la variable CSS
   * `--page-header-h`. Les barres de filtres en dessous l'utilisent pour
   * leur sticky `top: var(--page-header-h)` au lieu d'une valeur en dur.
   * Indispensable car le header peut changer de taille (notamment quand
   * un panneau desktop est actif → titre text-3xl au lieu de text-6xl).
   */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const h = el.offsetHeight;
      if (h > 0) {
        document.documentElement.style.setProperty('--page-header-h', `${h}px`);
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <div ref={ref} className={`sticky top-0 z-[11] bg-bg-primary/90 backdrop-blur-sm px-6 pt-5 pb-4 mb-6 lg:-mx-12 lg:px-12 lg:pt-10 lg:pb-6 lg:mb-2 ${className}`}>
      {/* Ligne 1 : kicker + actions */}
      <div className="flex items-center justify-between mb-1">
        <p className="font-mono text-[11px] tracking-widest uppercase text-text-muted/50 select-none">
          {kicker ?? title}
        </p>
        <div className="flex items-center gap-2">
          {rightAction}
          <div className="lg:hidden flex items-center gap-2">
            <OwnerTopBar />
            <GuestTopBar />
          </div>
        </div>
      </div>

      {/* Titre — centré mobile + desktop */}
      <h1 className="font-serif text-4xl lg:text-6xl text-text-primary tracking-tight text-center">
        {title}
      </h1>

      {/* Sous-titre optionnel */}
      {subtitle && (
        <p className="font-mono text-[11px] text-text-muted/50 mt-1 tracking-widest uppercase text-center">
          {subtitle}
        </p>
      )}

      {/* Contenu libre sous le titre (pills, navigation…) */}
      {controls && (
        <div className="mt-3 flex justify-center">
          {controls}
        </div>
      )}
    </div>
  );
}
