import { useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * Track la hauteur réelle du header de page (mobile + desktop) et écrit
 * cette valeur dans la variable CSS globale `--page-header-h`. Les barres
 * de filtres sticky en dessous l'utilisent comme `top: var(--page-header-h)`
 * au lieu d'une valeur en dur — qui casse quand le header change de taille
 * (panneau desktop actif → titre text-3xl au lieu de text-6xl, etc.).
 *
 * Usage :
 *   const { mobileRef, desktopRef } = useTrackPageHeaderHeight();
 *   <div ref={mobileRef}  className="lg:hidden ...">...</div>
 *   <div ref={desktopRef} className="hidden lg:flex ...">...</div>
 *   <div className="sticky top-[var(--page-header-h,96px)] z-[10] ...">filtres</div>
 *
 * Le `display: none` de l'élément non visible le rend `offsetHeight = 0`,
 * donc on prend simplement le max des deux.
 */
export function useTrackPageHeaderHeight<T extends HTMLElement = HTMLDivElement>() {
  const mobileRef = useRef<T>(null);
  const desktopRef = useRef<T>(null);

  useLayoutEffect(() => {
    const update = () => {
      const mobileH = mobileRef.current?.offsetHeight ?? 0;
      const desktopH = desktopRef.current?.offsetHeight ?? 0;
      const h = Math.max(mobileH, desktopH);
      if (h > 0) {
        document.documentElement.style.setProperty('--page-header-h', `${h}px`);
      }
    };
    update();
    const ros: ResizeObserver[] = [];
    for (const el of [mobileRef.current, desktopRef.current]) {
      if (el) {
        const ro = new ResizeObserver(update);
        ro.observe(el);
        ros.push(ro);
      }
    }
    window.addEventListener('resize', update);
    return () => {
      ros.forEach((r) => r.disconnect());
      window.removeEventListener('resize', update);
    };
  }, []);

  return { mobileRef, desktopRef } as { mobileRef: RefObject<T>; desktopRef: RefObject<T> };
}
