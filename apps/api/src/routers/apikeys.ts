import crypto from 'node:crypto';
import { router, ownerProcedure } from '../trpc.js';

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export const apiKeysRouter = router({
  status: ownerProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUniqueOrThrow({
      where: { id: ctx.user.id },
      select: { apiKeyHash: true },
    });
    return { hasKey: !!user.apiKeyHash };
  }),

  generate: ownerProcedure.mutation(async ({ ctx }) => {
    const token = crypto.randomBytes(32).toString('hex');
    await ctx.db.user.update({
      where: { id: ctx.user.id },
      data: { apiKeyHash: hashToken(token) },
    });
    return { token };
  }),

  revoke: ownerProcedure.mutation(async ({ ctx }) => {
    await ctx.db.user.update({
      where: { id: ctx.user.id },
      data: { apiKeyHash: null },
    });
    return { ok: true };
  }),
});
