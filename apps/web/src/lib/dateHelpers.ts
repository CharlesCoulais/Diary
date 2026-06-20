/**
 * Helpers de formatage et manipulation de dates partagés entre les pages.
 *
 * Toutes les manipulations « ISO date » (`YYYY-MM-DD`, sans timezone) utilisent
 * `T12:00:00` comme heure ancrée pour éviter les bugs de timezone (midnight
 * UTC ≠ midnight local) — `new Date('2026-05-23')` est interprété comme UTC,
 * `new Date('2026-05-23T12:00:00')` est interprété comme heure locale.
 *
 * `isoToday` retourne la date **locale** (pas UTC) — c'est ce qu'attend
 * l'utilisateur (Aujourd'hui = aujourd'hui chez moi, pas à Greenwich).
 */

/** Date du jour en format ISO `YYYY-MM-DD`, heure locale. */
export function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Décale une date ISO de `days` jours (positif ou négatif). */
export function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** « lundi 23 mai » — pour le kicker des sections de jour. */
export function formatDateLong(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/**
 * Terme relatif (« Aujourd'hui » / « Hier » / « Avant-hier ») si applicable,
 * sinon `null`. `today` est la date de référence (typiquement `isoToday()`).
 */
export function relativeLabel(iso: string, today: string): string | null {
  const diff = Math.round(
    (new Date(today + 'T12:00:00').getTime() - new Date(iso + 'T12:00:00').getTime()) / 86_400_000,
  );
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Hier';
  if (diff === 2) return 'Avant-hier';
  return null;
}

/** « LUNDI 23 MAI · 2026 » — kicker majuscule en haut des pages de jour. */
export function formatDateKicker(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  const weekday = d.toLocaleDateString('fr-FR', { weekday: 'long' });
  const day = d.getDate();
  const month = d.toLocaleDateString('fr-FR', { month: 'long' });
  const year = d.getFullYear();
  return `${weekday} ${day} ${month} · ${year}`.toUpperCase();
}

/**
 * « 23 mai, 14:32 » — pour les timestamps de commentaires / DMs.
 * Forme longue (jour + mois + heure), peu importe la date.
 */
export function formatTimestamp(d: string | Date): string {
  return new Date(d).toLocaleString('fr-FR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}
