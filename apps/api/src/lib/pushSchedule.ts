/**
 * Évaluation des plages horaires des modes « notifications discrètes » et
 * « silencieux ».
 *
 * Une règle = des jours de la semaine + une heure de début/fin. Si l'heure de
 * fin est ≤ l'heure de début, la fenêtre passe minuit (ex. 17:00 → 08:00 ;
 * 00:00 → 00:00 = journée entière).
 */

export interface ScheduleRule {
  days: number[]; // 0 = dimanche … 6 = samedi (comme Date.getDay())
  from: string;   // 'HH:MM'
  to: string;     // 'HH:MM'
}

/** 'HH:MM' → minutes depuis minuit. Renvoie null si invalide. */
function toMinutes(hhmm: unknown): number | null {
  if (typeof hhmm !== 'string') return null;
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Jour (0-6) + minutes-depuis-minuit pour « maintenant » dans un fuseau donné. */
function nowInZone(timezone: string): { day: number; minutes: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const wd = parts.find((p) => p.type === 'weekday')?.value ?? '';
    const hour = Number(parts.find((p) => p.type === 'hour')?.value);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value);
    const day = WEEKDAY_INDEX[wd];
    if (day === undefined || Number.isNaN(hour) || Number.isNaN(minute)) return null;
    // `hour` peut valoir 24 à minuit selon l'implémentation → normaliser.
    return { day, minutes: (hour % 24) * 60 + minute };
  } catch {
    return null;
  }
}

/**
 * Vrai si l'instant courant tombe dans une des plages de l'horaire.
 * Horaire vide/invalide ou fuseau absent → `false` (aucune plage active).
 */
export function isWithinSchedule(schedule: unknown, timezone: string | null): boolean {
  if (!Array.isArray(schedule) || schedule.length === 0) return false;
  if (!timezone) return false;
  const now = nowInZone(timezone);
  if (!now) return false;

  for (const raw of schedule) {
    const rule = raw as Partial<ScheduleRule>;
    const from = toMinutes(rule.from);
    const to = toMinutes(rule.to);
    if (from === null || to === null || !Array.isArray(rule.days)) continue;

    for (const d of rule.days) {
      if (typeof d !== 'number') continue;
      if (to > from) {
        // Fenêtre dans la même journée.
        if (now.day === d && now.minutes >= from && now.minutes < to) return true;
      } else {
        // Fenêtre qui passe minuit (00:00→00:00 = journée entière).
        if (now.day === d && now.minutes >= from) return true;
        if (now.day === (d + 1) % 7 && now.minutes < to) return true;
      }
    }
  }
  return false;
}
