import { useCallback, useState } from 'react';

/**
 * État replié/déplié persisté en localStorage. Utilisé pour les blocs filtres
 * en haut de Timeline, GuestHome, Home, Collection, Drafts… Une clé unique
 * par bloc permet de mémoriser indépendamment chaque page.
 *
 * `defaultCollapsed` accepte `'mobile'` : replié par défaut sous le breakpoint
 * `lg` (< 1024px), déplié au-dessus. Sert à replier uniformément les filtres sur
 * mobile (cf. TRANS-03) tout en les gardant visibles sur desktop. Le choix
 * explicite de l'utilisateur (localStorage) prime toujours sur ce défaut.
 */
function resolveDefault(d: boolean | 'mobile'): boolean {
  if (d === 'mobile') {
    try {
      return window.matchMedia('(max-width: 1023px)').matches;
    } catch {
      return false;
    }
  }
  return d;
}

export function useCollapsibleSection(
  storageKey: string,
  defaultCollapsed: boolean | 'mobile' = false,
): [boolean, () => void, (collapsed: boolean) => void] {
  const lsKey = `filter-collapsed:${storageKey}`;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(lsKey);
      if (v === '1') return true;
      if (v === '0') return false;
      return resolveDefault(defaultCollapsed);
    } catch {
      return resolveDefault(defaultCollapsed);
    }
  });
  const persist = useCallback((next: boolean) => {
    setCollapsed(next);
    try { localStorage.setItem(lsKey, next ? '1' : '0'); } catch { /* localStorage indispo */ }
  }, [lsKey]);
  const toggle = useCallback(() => {
    persist(!collapsed);
  }, [collapsed, persist]);
  return [collapsed, toggle, persist];
}
