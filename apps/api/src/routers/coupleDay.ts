import { z } from 'zod';
import { router, authedProcedure } from '../trpc.js';

const COUPLE_DAY_SELECT = {
  id: true,
  date: true,
  color: true,
  setAt: true,
  linkedEntryIds: true,
  awayLabel: true,
} as const;

export const coupleDayRouter = router({
  /**
   * Liste les jours du baromètre du couple.
   * - Owner : lit les siens (mais en pratique l'Owner passe par sync offline-first).
   * - Guest : lit ceux de l'Owner, en lecture seule.
   * L'écriture passe exclusivement par `sync.push` (Owner uniquement).
   */
  list: authedProcedure
    .input(
      z
        .object({ from: z.string().optional(), to: z.string().optional() })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const ownerId =
        ctx.user.role === 'OWNER'
          ? ctx.user.id
          : (await ctx.db.user.findFirst({ where: { role: 'OWNER' }, select: { id: true } }))?.id;
      if (!ownerId) return [];

      const dateFilter: { gte?: Date; lte?: Date } = {};
      if (input?.from) dateFilter.gte = new Date(input.from + 'T00:00:00.000Z');
      if (input?.to) dateFilter.lte = new Date(input.to + 'T00:00:00.000Z');

      const rows = await ctx.db.coupleDay.findMany({
        where: {
          ownerId,
          deletedAt: null,
          ...(input?.from || input?.to ? { date: dateFilter } : {}),
        },
        orderBy: { date: 'asc' },
        select: COUPLE_DAY_SELECT,
      });
      return rows.map((r) => ({ ...r, date: r.date.toISOString().slice(0, 10) }));
    }),
});
