import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, authedProcedure, ownerProcedure } from '../trpc.js';
import { db } from '../db.js';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
const MAX_SIZE = 8 * 1024 * 1024; // 8 MB original

export const imagesRouter = router({
  upload: authedProcedure
    .input(
      z.object({
        data: z.string().max(12_000_000), // base64 de 8 MB ≈ 10.7 MB en base64
        mimeType: z.enum(ALLOWED_TYPES),
        size: z.number().int().max(MAX_SIZE),
        entryId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Vérifier la taille réelle du contenu base64 (le client peut mentir sur `size`)
      const realSize = Buffer.byteLength(input.data, 'base64');
      if (realSize > MAX_SIZE) {
        throw new TRPCError({ code: 'PAYLOAD_TOO_LARGE', message: `Image trop grande : ${Math.round(realSize / 1024 / 1024 * 10) / 10} MB (max 8 MB).` });
      }
      const image = await db.image.create({
        data: {
          data: input.data,
          mimeType: input.mimeType,
          size: realSize,
          authorId: ctx.user.id,
          entryId: input.entryId ?? null,
        },
        select: { id: true },
      });
      return { id: image.id };
    }),

  delete: ownerProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db.image.deleteMany({
        where: { id: input.id, authorId: ctx.user.id },
      });
      return { ok: true };
    }),

  // Utilisé par les guests pour vérifier l'accès (le vrai serving passe par REST)
  exists: authedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const img = await db.image.findUnique({ where: { id: input.id }, select: { id: true, authorId: true } });
      if (!img) return { found: false };
      // Vérifier que l'image appartient à l'owner de cet utilisateur (ou à lui-même)
      const allowedAuthorId = ctx.user.role === 'OWNER' ? ctx.user.id : ctx.user.invitedById;
      return { found: img.authorId === allowedAuthorId };
    }),
});
