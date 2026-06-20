import { useEffect, useRef } from 'react';

/**
 * Accessibilité de modale : piège le focus clavier (Tab / Shift+Tab en boucle),
 * ferme sur Échap, et restaure le focus à l'élément déclencheur à la fermeture.
 *
 * À poser sur le **panneau** de la modale (pas le backdrop), qui doit porter
 * `role="dialog" aria-modal="true" tabIndex={-1}` :
 *
 *   const panelRef = useModalA11y<HTMLDivElement>(onClose);
 *   <div role="dialog" aria-modal="true" tabIndex={-1} ref={panelRef}>…</div>
 *
 * Le composant de modale étant monté seulement quand elle est ouverte, l'effet
 * s'exécute une fois au montage. `onClose` est lu via une ref pour éviter une
 * closure périmée sans re-déclencher l'effet.
 */
export function useModalA11y<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(
        el.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((n) => n.offsetParent !== null);

    // Focus initial : premier élément focusable, sinon le conteneur lui-même.
    (focusables()[0] ?? el).focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        e.preventDefault();
        return;
      }
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ref;
}
