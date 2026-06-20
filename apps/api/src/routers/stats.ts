import { z } from 'zod';
import { router, authedProcedure } from '../trpc.js';
import { db } from '../db.js';
import { computeStatsForAuthor } from '../lib/stats.js';

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export const statsRouter = router({
  overview: authedProcedure
    .input(z.object({ period: z.enum(['7d', '30d', 'year', 'all']).optional().default('all') }))
    .query(async ({ ctx, input }) => {
      // Pour un guest, on utilise l'ID de l'owner qui l'a invité (invitedById)
      let authorId = ctx.user.id;
      if (ctx.user.role === 'GUEST') {
        if (!ctx.user.invitedById) return null;
        authorId = ctx.user.invitedById;
      }

      const today = new Date().toISOString().slice(0, 10);
      const since = input.period === '7d' ? addDays(today, -6)
        : input.period === '30d' ? addDays(today, -29)
        : input.period === 'year' ? `${today.slice(0, 4)}-01-01`
        : undefined;

      return computeStatsForAuthor(authorId, db, since);
    }),
});
