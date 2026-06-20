import { z } from 'zod';
import { router, ownerProcedure } from '../trpc.js';
import { db } from '../db.js';

const ALLOWED_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/aac', 'audio/flac', 'audio/mp4'] as const;
const MAX_SIZE = 30 * 1024 * 1024; // 30 MB

export const audiosRouter = router({
  upload: ownerProcedure
    .input(
      z.object({
        data: z.string().max(45_000_000), // base64 de 30 MB ≈ 40 MB en base64
        mimeType: z.enum(ALLOWED_TYPES),
        filename: z.string().max(255),
        size: z.number().int().max(MAX_SIZE),
        entryId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const audio = await db.audio.create({
        data: {
          data: input.data,
          mimeType: input.mimeType,
          filename: input.filename,
          size: input.size,
          authorId: ctx.user.id,
          entryId: input.entryId ?? null,
        },
        select: { id: true },
      });
      return { id: audio.id };
    }),

  delete: ownerProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db.audio.deleteMany({
        where: { id: input.id, authorId: ctx.user.id },
      });
      return { ok: true };
    }),
});
