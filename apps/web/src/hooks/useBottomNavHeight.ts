import { useEffect, useRef } from 'react';

/**
 * Mesure la hauteur réelle du BottomNav et l'expose en variable CSS
 * `--bottomnav-height` sur `:root`. Les offsets flottants (FAB chat, bulle,
 * BackToTop) en dérivent dans `globals.css` au lieu de constantes magiques
 * (`5rem`/`9rem`) qui cassaient dès que la hauteur du nav changeait (SET-19).
 *
 * La hauteur mesurée (`offsetHeight`) inclut déjà le `safe-bottom`
 * (`env(safe-area-inset-bottom)`) du nav — inutile de le rajouter dans les calc.
 * Sur desktop le nav est `lg:hidden` → `offsetHeight` vaut 0, mais la media query
 * desktop de `globals.css` surcharge les offsets sans lire cette variable, donc
 * c'est sans effet ; au retour en mobile le ResizeObserver re-mesure.
 */
export function useBottomNavHeight<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => {
      document.documentElement.style.setProperty('--bottomnav-height', `${el.offsetHeight}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return ref;
}
