import { useCallback, useEffect, useState } from 'react';

/**
 * Taille de police racine — réglage **par appareil** (localStorage uniquement,
 * jamais synchronisé). Permet de remonter l'interface entière sur un téléphone
 * un peu serré (Android d'entrée de gamme, vieux iPhone…) ou de la resserrer
 * sur un grand écran.
 *
 * Le projet utilise une base CSS de `font-size: 12px` (cf. `globals.css`),
 * volontairement compacte. Toutes les utilités Tailwind en `rem` (text-*, p-*,
 * m-*, gap-*…) se calent dessus, donc augmenter cette base scale **tout** le
 * layout proportionnellement — pas juste le texte.
 *
 * On applique le style inline sur `<html>` au chargement du module (avant que
 * React ne rende) pour éviter un flash. Même approche que `theme.ts`.
 */

export type FontSize = 'compact' | 'normal' | 'confort' | 'large';

export const FONT_SIZE_PX: Record<FontSize, number> = {
  compact: 11,
  normal: 12, // valeur par défaut historique du projet
  confort: 13.5,
  large: 15,
};

export const FONT_SIZE_LABELS: Record<FontSize, string> = {
  compact: 'Compact',
  normal: 'Normal',
  confort: 'Confort',
  large: 'Grand',
};

const STORAGE_KEY = 'journal-font-size';

function getInitialFontSize(): FontSize {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'compact' || stored === 'normal' || stored === 'confort' || stored === 'large') {
    return stored;
  }
  return 'normal';
}

function applyFontSize(size: FontSize) {
  document.documentElement.style.fontSize = `${FONT_SIZE_PX[size]}px`;
  localStorage.setItem(STORAGE_KEY, size);
}

// Applique immédiatement au chargement du module (avant le premier render React)
// pour éviter un flash de taille par défaut.
applyFontSize(getInitialFontSize());

export function useFontSize() {
  const [size, setSizeState] = useState<FontSize>(getInitialFontSize);

  // Garde sync entre onglets / fenêtres ouvertes sur la même app.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        const v = e.newValue as FontSize;
        if (v in FONT_SIZE_PX) setSizeState(v);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setSize = useCallback((next: FontSize) => {
    applyFontSize(next);
    setSizeState(next);
  }, []);

  return { size, setSize };
}
