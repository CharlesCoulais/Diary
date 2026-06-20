import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format YYYY-MM-DD');

// RED_GREEN = journée partagée : des bons moments ET des tensions le même jour.
export const coupleColor = z.enum(['RED', 'BLUE', 'GREEN', 'RED_GREEN']);
export type CoupleColor = z.infer<typeof coupleColor>;

/**
 * Baromètre du couple : une couleur par jour.
 * Clé naturelle : (ownerId, date) — au plus un enregistrement par jour.
 *
 * `setAt` null = couleur jamais posée explicitement → neutre automatique,
 * toujours éditable. Sinon = horodatage de la pose → verrou 24 h.
 */
export const syncCoupleDayInput = z.object({
  date: isoDate,
  color: coupleColor,
  setAt: z.string().datetime().nullable(),
  linkedEntryIds: z.array(z.string()).max(50),
  awayLabel: z.string().max(200).nullable(),
  version: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});

export type SyncCoupleDayInput = z.infer<typeof syncCoupleDayInput>;
