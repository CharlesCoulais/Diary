import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format YYYY-MM-DD');

/**
 * Daily log : un état global du jour (mood/sommeil/météo/énergie/anxiété),
 * en complément des champs identiques portés par chaque entrée individuelle.
 * Clé naturelle : (ownerId, date) — il y a au plus un log par jour par utilisateur.
 */
export const syncDailyLogInput = z.object({
  date: isoDate,
  mood: z.string().max(200).nullable(),
  sleepHours: z.number().min(0).max(24).nullable(),
  weather: z.string().max(80).nullable(),
  energy: z.number().int().min(1).max(5).nullable(),
  anxiety: z.number().int().min(1).max(5).nullable(),
  version: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});

export type SyncDailyLogInput = z.infer<typeof syncDailyLogInput>;
