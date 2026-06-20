import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, authedProcedure } from '../trpc.js';
import { canRead } from '../lib/permissions.js';
import { emitToEntryAudience } from '../lib/events.js';
import { recordAudit } from '../lib/audit.js';

/**
 * Notation favoris / nul d'une entry par un utilisateur.
 * Mutuellement exclusif : un utilisateur a au plus 1 ligne par entry.
 *
 * Visibilité côté lecture :
 *  - OWNER : voit toutes les ratings de tous les confidents.
 *  - GUEST : voit sa propre rating + celle de l'owner de l'entry.
 *
 * Les ratings sont incluses dans le payload `sync.pull` (filtrées selon la
 * règle ci-dessus) pour fonctionner offline-first ; ce router expose
 * uniquement la mutation `set` et un getter ponctuel `listForEntry`.
 */

const ENTRY_PERM_SELECT = {
  authorId: true,
  visibility: true,
  commentsLocked: true,
  commentsResolved: true,
  isSecret: true,
  shares: { select: { receiverId: true, canComment: true } },
} as const;

const ratingValueSchema = z.enum(['FAVORITE', 'LOW']);

export const ratingsRouter = router({
  /**
   * Pose / met à jour / efface la rating de l'utilisateur courant sur une entry.
   * - value=null → supprime la rating
   * - value=FAVORITE|LOW → upsert (écrase l'ancienne valeur)
   */
  set: authedProcedure
    .input(z.object({
      entryId: z.string(),
      value: ratingValueSchema.nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db.entry.findUnique({
        where: { id: input.entryId, deletedAt: null },
        select: ENTRY_PERM_SELECT,
      });
      if (!entry || !canRead(ctx.user, entry)) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      // On effectue le changement de rating ET on « touche » `Entry.updatedAt`
      // dans la même transaction : c'est ce bump qui fait apparaître l'entry
      // dans le prochain `sync.pull(since: ...)` côté Owner — sans ça, Dexie
      // ne récupère jamais la nouvelle rating et l'UI semble figée.
      await ctx.db.$transaction(async (tx) => {
        if (input.value === null) {
          await tx.entryRating.deleteMany({
            where: { entryId: input.entryId, userId: ctx.user.id },
          });
        } else {
          await tx.entryRating.upsert({
            where: { entryId_userId: { entryId: input.entryId, userId: ctx.user.id } },
            create: { entryId: input.entryId, userId: ctx.user.id, value: input.value },
            update: { value: input.value },
          });
        }
        // Touch sans changement de contenu — `updatedAt` est forcé à maintenant.
        // `version` n'est pas incrémenté : la rating n'est pas une modif de
        // l'entry elle-même (pas de revision créée non plus).
        await tx.entry.update({
          where: { id: input.entryId },
          data: { updatedAt: new Date() },
        });
      });

      // Notifie le owner + ses confidents (SSE) — ils ré-actualiseront leur
      // payload local au prochain sync.pull et verront la nouvelle rating.
      void emitToEntryAudience(ctx.db, entry, 'rating').catch(() => null);
      recordAudit(
        ctx,
        input.value === null ? 'RATING_CLEARED' : 'RATING_SET',
        { entryId: input.entryId, metadata: input.value ? { value: input.value } : {} },
      );
      return { ok: true as const, value: input.value };
    }),

  /**
   * Liste les ratings visibles pour l'utilisateur courant sur une entry donnée.
   * - OWNER : toutes les ratings (avec displayName/email pour chaque confident).
   * - GUEST : la sienne + celle de l'owner de l'entry.
   */
  listForEntry: authedProcedure
    .input(z.object({ entryId: z.string() }))
    .query(async ({ ctx, input }) => {
      const entry = await ctx.db.entry.findUnique({
        where: { id: input.entryId, deletedAt: null },
        select: ENTRY_PERM_SELECT,
      });
      if (!entry || !canRead(ctx.user, entry)) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const rows = await ctx.db.entryRating.findMany({
        where: { entryId: input.entryId },
        select: {
          userId: true,
          value: true,
          updatedAt: true,
          user: { select: { id: true, displayName: true, email: true, role: true } },
        },
      });

      if (ctx.user.role === 'OWNER') {
        return rows;
      }
      // Guest : ne renvoyer que la sienne + celle de l'owner de l'entry.
      return rows.filter((r) => r.userId === ctx.user.id || r.userId === entry.authorId);
    }),
});
