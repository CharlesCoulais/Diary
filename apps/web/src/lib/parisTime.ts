/**
 * Utilitaires pour interpréter une date + heure saisies dans l'UI comme
 * **heure de Paris** (Europe/Paris), indépendamment du fuseau du navigateur.
 *
 * Pourquoi : l'app est utilisée principalement en France. Si on faisait
 * `new Date("2026-05-22T22:00:00")`, JS interpréterait la chaîne comme heure
 * locale du navigateur — bug si l'utilisateur a son OS sur un autre fuseau
 * (PWA installée en voyage, OS réglé en UTC sur certaines machines, etc.).
 *
 * On force donc Europe/Paris via `Intl.DateTimeFormat` qui gère DST proprement.
 */
const TZ = 'Europe/Paris';

/**
 * Combine une date `YYYY-MM-DD` et une heure `HH:MM` (vide → "00:00") en
 * un timestamp ISO UTC, en supposant que l'heure saisie est en Paris.
 */
export function parisDateTimeToISO(dateStr: string, timeStr: string): string {
  const safeTime = /^\d{2}:\d{2}$/.test(timeStr) ? timeStr : '00:00';
  const [Y, M, D] = dateStr.split('-').map(Number);
  const [h, m] = safeTime.split(':').map(Number);

  if (!Y || !M || !D) throw new Error(`parisDateTimeToISO: date invalide ${dateStr}`);

  // Sonde : on construit un instant UTC avec les composantes voulues, puis on
  // regarde à quelle heure Paris l'affiche. La différence donne l'offset Paris
  // pour ce jour précis (gère DST automatiquement).
  const probeUTC = Date.UTC(Y, M - 1, D, h, m, 0);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(new Date(probeUTC));
  const v = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
  const parisProbe = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'), v('second'));
  const offsetMs = parisProbe - probeUTC; // Paris est en avance de offsetMs sur UTC

  // L'instant UTC réel pour que l'horloge Paris affiche (Y,M,D,h,m) :
  return new Date(probeUTC - offsetMs).toISOString();
}

/** Heure Paris (`HH:MM`, 24h) à partir d'un timestamp ISO. */
export function parisTimeOf(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(iso));
}

/** Date Paris (`YYYY-MM-DD`) à partir d'un timestamp ISO. */
export function parisDateOf(iso: string): string {
  // en-CA produit YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso));
}

/** Date longue Paris en français : "22 mai 2026". */
export function parisDateLong(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: TZ,
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(iso));
}
