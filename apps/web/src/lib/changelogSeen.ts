import { useEffect, useState } from 'react';

/**
 * Suivi « dernière version vue » du changelog — volontairement léger (aucune
 * dépendance lourde comme `marked`) pour pouvoir être importé dans le shell
 * toujours chargé (top bars) sans alourdir le bundle principal. Le rendu du
 * changelog lui-même vit dans `pages/Changelog.tsx`.
 */

const SEEN_KEY = 'changelog-last-seen-version';

/** Parse le markdown du changelog en versions (`## version — date`). */
export function parseChangelogVersions(md: string): string[] {
  const out: string[] = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^##\s+([^—\-]+)(?:[—\-]\s*(.+))?\s*$/);
    if (m) out.push(m[1]!.trim());
  }
  return out;
}

/** Marque la dernière version comme vue. */
export function markChangelogSeen(latestVersion: string) {
  try {
    localStorage.setItem(SEEN_KEY, latestVersion);
  } catch { /* stockage indisponible */ }
}

/** Renvoie true si une version plus récente est dispo (pour le badge « nouveau »). */
export function useHasUnseenChangelog(): { hasUnseen: boolean; latest: string | null } {
  const [latest, setLatest] = useState<string | null>(null);
  const [seen, setSeen] = useState<string | null>(null);
  useEffect(() => {
    try { setSeen(localStorage.getItem(SEEN_KEY)); } catch { /* noop */ }
    fetch('/changelog.md')
      .then((r) => (r.ok ? r.text() : ''))
      .then((md) => {
        const versions = parseChangelogVersions(md);
        if (versions[0]) setLatest(versions[0]);
      })
      .catch(() => { /* noop */ });
  }, []);
  return { hasUnseen: !!latest && latest !== seen, latest };
}
