import { useEffect } from 'react';

/**
 * Observe globalement le DOM à la recherche d'un élément `[data-right-panel]`
 * visible sur desktop. Quand un tel panneau est présent, expose son `left`
 * position en CSS variable `--right-col-x` sur `:root`.
 *
 * Utilisation : les pages avec un layout deux colonnes marquent leur colonne
 * de droite (panneau de lecture, détail…) avec `data-right-panel`. Le chat
 * flottant et le bouton « remonter en haut » lisent ensuite cette variable
 * pour se positionner **dans la colonne de gauche**, juste avant le panneau,
 * au lieu de se superposer au contenu du panneau de droite.
 *
 * Si aucun panneau n'est visible (page mono-colonne ou panneau pas encore
 * sélectionné côté confident), la variable est retirée → chat et flèche
 * reviennent à `right: 1rem` (comportement par défaut).
 */
export function RightColumnTracker() {
  useEffect(() => {
    let currentEl: HTMLElement | null = null;
    let ro: ResizeObserver | null = null;

    const updateVar = () => {
      // Ne s'applique que sur desktop (lg) — sur mobile la mise en page est
      // mono-colonne par définition.
      const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
      if (!isDesktop || !currentEl) {
        document.documentElement.style.removeProperty('--right-col-x');
        return;
      }
      const rect = currentEl.getBoundingClientRect();
      if (rect.width > 0 && rect.left > 0) {
        document.documentElement.style.setProperty('--right-col-x', `${rect.left}px`);
      } else {
        document.documentElement.style.removeProperty('--right-col-x');
      }
    };

    const attachTo = (el: HTMLElement | null) => {
      if (currentEl === el) return;
      ro?.disconnect();
      ro = null;
      currentEl = el;
      if (el) {
        ro = new ResizeObserver(updateVar);
        ro.observe(el);
      }
      updateVar();
    };

    const find = () => {
      // Cherche le premier panneau visible. `hidden` (display:none) le rend
      // `offsetWidth === 0` → on l'ignore.
      const candidates = Array.from(document.querySelectorAll<HTMLElement>('[data-right-panel]'));
      const visible = candidates.find((el) => el.offsetWidth > 0);
      attachTo(visible ?? null);
    };

    find();

    // MutationObserver léger pour détecter l'apparition/disparition d'un
    // `[data-right-panel]` (changement de route ou de sélection d'entrée).
    const mo = new MutationObserver(() => find());
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-right-panel', 'class', 'style'] });

    window.addEventListener('resize', updateVar);

    return () => {
      mo.disconnect();
      ro?.disconnect();
      window.removeEventListener('resize', updateVar);
      document.documentElement.style.removeProperty('--right-col-x');
    };
  }, []);

  return null;
}
