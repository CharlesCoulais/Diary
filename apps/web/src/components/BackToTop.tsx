import { useEffect, useRef, useState } from 'react';

/**
 * Bouton flottant « remonter en haut ».
 *
 * Détecte automatiquement le conteneur de scroll : remonte le DOM depuis sa
 * position d'insertion jusqu'à trouver un ancêtre avec `overflow-y: auto`
 * ou `overflow-y: scroll`. Si aucun n'est trouvé → fallback sur `window`.
 *
 * Indispensable pour les pages avec un layout deux colonnes en `overflow-y:
 * auto` (Collection, Tasks…) où le `window.scrollY` reste à 0 alors que le
 * scroll se passe dans la colonne — sans ce fix, le bouton ne s'affichait
 * jamais sur ces pages.
 *
 * La prop `panelOpen` est conservée pour compatibilité d'API mais ignorée.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function BackToTop({ panelOpen = false }: { panelOpen?: boolean }) {
  const [visible, setVisible] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  // Conteneur de scroll trouvé (ou null pour window). Sert au scrollTo du click.
  const containerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Trouve le premier ancêtre déclaré scrollable (`overflow-y: auto|scroll`).
    // Note : on **ne vérifie pas** que scrollHeight > clientHeight au moment du
    // mount — un container peut être vide au début et se remplir après
    // (Collection charge ses items en différé). On accepte l'éventuel container
    // non-scrollant : il ne déclenchera juste pas l'event, sans casser.
    function findScrollContainer(start: Element | null): HTMLElement | null {
      let el: Element | null = start;
      while (el && el !== document.body) {
        const oy = getComputedStyle(el).overflowY;
        if (oy === 'auto' || oy === 'scroll') return el as HTMLElement;
        el = el.parentElement;
      }
      return null;
    }

    const container = findScrollContainer(anchorRef.current?.parentElement ?? null);
    containerRef.current = container;
    // Filet de sécurité : on écoute AUSSI `window` (scroll naturel sur les pages
    // qui n'ont pas de container interne, ou si la détection a raté).
    const getScroll = () => Math.max(container?.scrollTop ?? 0, window.scrollY);
    const onScroll = () => setVisible(getScroll() > 200);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    container?.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      container?.removeEventListener('scroll', onScroll);
    };
  }, []);

  const handleClick = () => {
    // Scroll les DEUX (container interne + window) — l'un des deux ne bouge
    // pas et c'est sans effet, l'autre remonte effectivement en haut.
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div
      ref={anchorRef}
      style={{ bottom: 'var(--backtotop-bottom, 1.5rem)' }}
      // Desktop : positionne le bouton dans la colonne de gauche (juste à
      // gauche d'un éventuel panneau droit `[data-right-panel]`) via la
      // variable `--right-col-x` exposée par RightColumnTracker. Sinon (mobile,
      // ou page mono-colonne sur desktop) : `right: 1rem` classique.
      className="fixed right-4 lg:right-[calc(100vw-var(--right-col-x,100vw)+1rem)] z-40"
    >
      <button
        type="button"
        onClick={handleClick}
        aria-label="Revenir en haut"
        // w-12 h-12 : même diamètre que la ChatFab mobile et la bulle chat desktop
        // → empilement vertical parfaitement aligné (centres + bords droits).
        className={`w-12 h-12 rounded-full bg-bg-elevated/95 backdrop-blur shadow-soft border border-text-muted/10 flex items-center justify-center text-text-muted hover:text-accent transition-all duration-200 ${
          visible ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-2 pointer-events-none'
        }`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>
    </div>
  );
}
