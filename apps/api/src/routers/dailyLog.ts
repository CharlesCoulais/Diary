import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, authedProcedure } from '../trpc.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Lecture des daily logs pour l'owner et pour les guests CONFIDANT uniquement
 * (les tiers ALL/SPECIFIC n'ont pas accès aux états globaux du jour, jugés intimes).
 *
 * L'écriture passe par le router sync (push/pull) côté owner.
 */
export const dailyLogRouter = router({
  list: authedProcedure
    .input(
      z.object({
        from: isoDate.optional(),
        to: isoDate.optional(),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      let ownerId = ctx.user.id;
      if (ctx.user.role === 'GUEST') {
        if (!ctx.user.invitedById) throw new TRPCError({ code: 'FORBIDDEN' });
        if (ctx.user.guestAccess !== 'CONFIDANT') return [];
        ownerId = ctx.user.invitedById;
      }
      const where: { ownerId: string; deletedAt: null; date?: { gte?: Date; lte?: Date } } = {
        ownerId,
        deletedAt: null,
      };
      if (input?.from || input?.to) {
        where.date = {};
        if (input.from) where.date.gte = new Date(input.from + 'T00:00:00.000Z');
        if (input.to) where.date.lte = new Date(input.to + 'T00:00:00.000Z');
      }
      const logs = await ctx.db.dailyLog.findMany({
        where,
        select: {
          date: true,
          mood: true,
          sleepHours: true,
          weather: true,
          energy: true,
          anxiety: true,
        },
        orderBy: { date: 'desc' },
        take: 1000,
      });
      return logs.map((dl) => ({
        date: dl.date.toISOString().slice(0, 10),
        mood: dl.mood,
        sleepHours: dl.sleepHours,
        weather: dl.weather,
        energy: dl.energy,
        anxiety: dl.anxiety,
      }));
    }),
});
