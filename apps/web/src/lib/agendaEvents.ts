import type { AgendaEvent } from './db/schema';

/**
 * Helpers purs pour les notes AGENDA — tri, séparation à venir / passés,
 * groupement par date et indexation par jour (vue calendrier). Aucune dépendance
 * UI/DB : testable et réutilisable côté builder (édition) et view (lecture).
 */

/**
 * Tri chronologique : par date croissante, puis par heure de début. Les
 * événements **sans heure** passent en **fin de journée**. À égalité (même heure,
 * ou deux événements sans heure le même jour) on conserve l'**ordre manuel** =
 * l'ordre du tableau `events` (réordonnable via les flèches du builder, cf.
 * AgendaEventBuilder). Le tie-break par index rend le tri robuste même si le
 * moteur JS n'était pas stable.
 */
export function sortEvents<T extends AgendaEvent>(events: T[]): T[] {
  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      if (a.e.date !== b.e.date) return a.e.date < b.e.date ? -1 : 1;
      const ta = a.e.time;
      const tb = b.e.time;
      if (ta && tb) { if (ta !== tb) return ta < tb ? -1 : 1; }
      else if (ta && !tb) return -1; // a a une heure, b non → a avant b
      else if (!ta && tb) return 1;  // b a une heure, a non → b avant a
      return a.i - b.i;              // égalité → ordre manuel (index du tableau)
    })
    .map((x) => x.e);
}

/**
 * Libellé de la fin d'un événement, ou `null` si rien à afficher. « → 15:30 »
 * pour une fin le même jour, « → 12 juin 16:00 » (ou « → 12 juin ») pour une fin
 * un autre jour. Une `endDate` égale au jour de début sans `endTime` ne produit
 * rien (pas d'info utile).
 */
export function formatEventEnd(ev: AgendaEvent): string | null {
  if (!ev.endDate && !ev.endTime) return null;
  const sameDay = !ev.endDate || ev.endDate === ev.date;
  if (sameDay) return ev.endTime ? `→ ${ev.endTime}` : null;
  const d = new Date(`${ev.endDate}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return ev.endTime ? `→ ${d} ${ev.endTime}` : `→ ${d}`;
}

/**
 * Sépare en « à venir » (date >= aujourd'hui, ordre chronologique) et « passés »
 * (date < aujourd'hui, du plus récent au plus ancien). `todayIso` = "YYYY-MM-DD".
 * Générique : préserve les champs ajoutés (ex. entryId pour la page Agenda globale).
 */
export function splitUpcomingPast<T extends AgendaEvent>(
  events: T[],
  todayIso: string,
): { upcoming: T[]; past: T[] } {
  const upcoming = sortEvents(events.filter((e) => e.date >= todayIso));
  // Passés : jours du plus récent au plus ancien, mais l'ordre INTERNE d'un jour
  // (heure puis ordre manuel) est conservé — d'où le reverse par groupe de date
  // plutôt qu'un reverse global (qui inverserait aussi l'ordre intra-journée).
  const past = groupByDate(sortEvents(events.filter((e) => e.date < todayIso)))
    .reverse()
    .flatMap((g) => g.events);
  return { upcoming, past };
}

/** Groupe une liste (déjà triée) par date : [{ date, events }] dans l'ordre fourni. */
export function groupByDate<T extends AgendaEvent>(events: T[]): Array<{ date: string; events: T[] }> {
  const out: Array<{ date: string; events: T[] }> = [];
  for (const ev of events) {
    const last = out[out.length - 1];
    if (last && last.date === ev.date) last.events.push(ev);
    else out.push({ date: ev.date, events: [ev] });
  }
  return out;
}

/** Index date → événements (pour poser les pastilles sur une grille mensuelle). */
export function eventsByDate<T extends AgendaEvent>(events: T[]): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const ev of sortEvents(events)) {
    (map[ev.date] ??= []).push(ev);
  }
  return map;
}

/** Nombre d'événements à venir (>= aujourd'hui), pour les aperçus compacts. */
export function upcomingCount(events: AgendaEvent[], todayIso: string): number {
  return events.reduce((n, e) => (e.date >= todayIso ? n + 1 : n), 0);
}
