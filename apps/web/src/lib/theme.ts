import { useCallback, useState } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'journal-theme';

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.classList.toggle('light', theme === 'light');
  localStorage.setItem(STORAGE_KEY, theme);
}

// Applique le thème immédiatement au chargement du module, avant que React
// ne rende quoi que ce soit (y compris le lock screen).
applyTheme(getInitialTheme());

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      return next;
    });
  }, []);

  return { theme, toggle };
}
