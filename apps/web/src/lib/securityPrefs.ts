import { useState, useCallback, useEffect } from 'react';

/** Délai d'inactivité avant verrouillage (en millisecondes). 0 = jamais. */
const LOCK_TIMEOUT_KEY = 'app-lock-timeout-ms';
/** Délai par défaut : 5 minutes — historiquement la valeur hardcodée. */
export const DEFAULT_LOCK_TIMEOUT_MS = 5 * 60 * 1000;

export interface LockTimeoutOption {
  ms: number;
  label: string;
}

export const LOCK_TIMEOUT_OPTIONS: LockTimeoutOption[] = [
  { ms: 30_000,       label: '30 s' },
  { ms: 60_000,       label: '1 min' },
  { ms: 5 * 60_000,   label: '5 min' },
  { ms: 15 * 60_000,  label: '15 min' },
  { ms: 30 * 60_000,  label: '30 min' },
  { ms: 60 * 60_000,  label: '1 h' },
  { ms: 0,            label: 'Jamais' },
];

export function getLockTimeoutMs(): number {
  try {
    const v = localStorage.getItem(LOCK_TIMEOUT_KEY);
    if (v !== null) {
      const n = parseInt(v, 10);
      if (!Number.isNaN(n) && n >= 0) return n;
    }
  } catch { /* localStorage indisponible */ }
  return DEFAULT_LOCK_TIMEOUT_MS;
}

export function setLockTimeoutMs(ms: number): void {
  try {
    localStorage.setItem(LOCK_TIMEOUT_KEY, String(ms));
    // Notifier les autres composants/onglets (PinContext relit la valeur)
    window.dispatchEvent(new CustomEvent('lockTimeoutChange', { detail: { ms } }));
  } catch { /* localStorage indisponible */ }
}

/** Hook réactif : lit la valeur courante et permet de la modifier. */
export function useLockTimeout(): [number, (ms: number) => void] {
  const [value, setValue] = useState<number>(() => getLockTimeoutMs());

  useEffect(() => {
    const handler = () => setValue(getLockTimeoutMs());
    window.addEventListener('lockTimeoutChange', handler);
    // Synchro entre onglets via storage event natif
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('lockTimeoutChange', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const update = useCallback((ms: number) => {
    setValue(ms);
    setLockTimeoutMs(ms);
  }, []);

  return [value, update];
}
