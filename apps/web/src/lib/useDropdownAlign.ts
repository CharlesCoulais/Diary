import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Repositionne automatiquement un panneau de dropdown s'il déborde de la
 * viewport (typiquement sur mobile quand le trigger est près du bord droit
 * et que le panneau s'ouvre avec `absolute left-0`).
 *
 * Usage :
 *   const { panelRef, panelStyle } = useDropdownAlign(open);
 *   {open && <div ref={panelRef} style={panelStyle} className="absolute left-0 ...">…</div>}
 *
 * Mesure faite via `useLayoutEffect` (avant peinture) pour éviter un flash visuel.
 * Padding de 8px conservé entre le bord du panneau et celui de la viewport.
 */
export function useDropdownAlign<T extends HTMLElement = HTMLDivElement>(open: boolean) {
  const panelRef = useRef<T>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties | undefined>(undefined);

  useLayoutEffect(() => {
    if (!open) {
      setPanelStyle(undefined);
      return;
    }
    const el = panelRef.current;
    if (!el) return;
    // Réinitialise tout transform précédent avant de mesurer.
    el.style.transform = '';
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const PAD = 8;
    let dx = 0;
    if (rect.right > vw - PAD) dx = vw - PAD - rect.right;
    else if (rect.left < PAD) dx = PAD - rect.left;
    setPanelStyle(dx !== 0 ? { transform: `translateX(${dx}px)` } : undefined);
  }, [open]);

  return { panelRef, panelStyle };
}
