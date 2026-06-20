import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, authedProcedure } from '../trpc.js';
import { canInteract } from '../lib/permissions.js';
import { sendPushToUser, displayName } from '../lib/push.js';
import { emitToEntryAudience } from '../lib/events.js';
import { recordAudit } from '../lib/audit.js';

const ENTRY_PERM_SELECT = {
  authorId: true,
  visibility: true,
  commentsLocked: true,
  commentsResolved: true,
  isSecret: true,
  shares: { select: { receiverId: true, canComment: true } },
} as const;

// Validation : 1 caractère minimum, max 10 chars (un emoji peut être multi-codepoints)
// Pas de liste blanche — n'importe quel emoji est autorisé.
const emojiSchema = z.string().min(1).max(10);

export interface ReactionRow {
  emoji: string;
  userId: string;
  user: { id: string; displayName: string | null; email: string };
}

/**
 * Agrège les réactions brutes en tableau de { emoji, count, userIds, users }.
 */
export function aggregateReactions(reactions: ReactionRow[]) {
  const map = new Map<string, {
    count: number;
    userIds: string[];
    users: Array<{ id: string; displayName: string | null; email: string }>;
  }>();
  for (const r of reactions) {
    const existing = map.get(r.emoji);
    if (existing) {
      existing.count++;
      existing.userIds.push(r.userId);
      existing.users.push(r.user);
    } else {
      map.set(r.emoji, { count: 1, userIds: [r.userId], users: [r.user] });
    }
  }
  return Array.from(map.entries())
    .map(([emoji, data]) => ({ emoji, ...data }))
    .sort((a, b) => b.count - a.count);
}

export const reactionsRouter = router({
  /**
   * Bascule une réaction sur une entrée (ajoute si absente, retire si présente).
   */
  toggleEntry: authedProcedure
    .input(z.object({ entryId: z.string(), emoji: emojiSchema }))
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db.entry.findUnique({
        where: { id: input.entryId, deletedAt: null },
        select: ENTRY_PERM_SELECT,
      });
      if (!entry || !canInteract(ctx.user, entry)) throw new TRPCError({ code: 'NOT_FOUND' });

      const existing = await ctx.db.reaction.findUnique({
        where: {
          userId_entryId_emoji: {
            userId: ctx.user.id,
            entryId: input.entryId,
            emoji: input.emoji,
          },
        },
      });

      if (existing) {
        await ctx.db.reaction.delete({ where: { id: existing.id } });
        void emitToEntryAudience(ctx.db, entry, 'reaction').catch(() => null);
        recordAudit(ctx, 'REACTION_REMOVED', { entryId: input.entryId, metadata: { emoji: input.emoji, target: 'entry' } });
        return { action: 'removed' as const };
      } else {
        await ctx.db.reaction.create({
          data: { userId: ctx.user.id, entryId: input.entryId, emoji: input.emoji },
        });
        void emitToEntryAudience(ctx.db, entry, 'reaction').catch(() => null);
        recordAudit(ctx, 'REACTION_ADDED', { entryId: input.entryId, metadata: { emoji: input.emoji, target: 'entry' } });
        // Notifie l'auteur de l'entrée, sauf si c'est lui-même qui réagit
        if (entry.authorId !== ctx.user.id) {
          ctx.db.notification.create({
            data: {
              id: crypto.randomUUID(),
              userId: entry.authorId,
              type: 'REACTION_NEW',
              entryId: input.entryId,
              meta: { emoji: input.emoji, reactorId: ctx.user.id },
            },
          }).catch(() => null);
          sendPushToUser(ctx.db, entry.authorId, {
            title: `${input.emoji}  ${displayName(ctx.user)}`,
            body: 'a réagi à une de tes notes',
            url: `/?entryId=${input.entryId}`,
          }, { respectPref: 'notifyOwnerReactions', kind: 'reaction' }).catch(() => null);
        }
        return { action: 'added' as const };
      }
    }),

  /**
   * Bascule une réaction sur un commentaire.
   */
  toggleComment: authedProcedure
    .input(z.object({ commentId: z.string(), emoji: emojiSchema }))
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.db.comment.findUnique({
        where: { id: input.commentId, deletedAt: null },
        select: {
          authorId: true,
          entryId: true,
          entry: { select: ENTRY_PERM_SELECT },
        },
      });
      if (!comment || !canInteract(ctx.user, comment.entry)) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const existing = await ctx.db.reaction.findUnique({
        where: {
          userId_commentId_emoji: {
            userId: ctx.user.id,
            commentId: input.commentId,
            emoji: input.emoji,
          },
        },
      });

      if (existing) {
        await ctx.db.reaction.delete({ where: { id: existing.id } });
        void emitToEntryAudience(ctx.db, comment.entry, 'reaction').catch(() => null);
        recordAudit(ctx, 'REACTION_REMOVED', { entryId: comment.entryId, metadata: { emoji: input.emoji, target: 'comment' } });
        return { action: 'removed' as const };
      } else {
        await ctx.db.reaction.create({
          data: { userId: ctx.user.id, commentId: input.commentId, emoji: input.emoji },
        });
        void emitToEntryAudience(ctx.db, comment.entry, 'reaction').catch(() => null);
        recordAudit(ctx, 'REACTION_ADDED', { entryId: comment.entryId, metadata: { emoji: input.emoji, target: 'comment' } });
        // Notifie l'auteur du commentaire, sauf si c'est lui-même qui réagit.
        if (comment.authorId !== ctx.user.id) {
          ctx.db.notification.create({
            data: {
              id: crypto.randomUUID(),
              userId: comment.authorId,
              type: 'REACTION_NEW',
              entryId: comment.entryId,
              commentId: input.commentId,
              meta: { emoji: input.emoji, reactorId: ctx.user.id },
            },
          }).catch(() => null);
          // Push + rafraîchissement temps réel de la cloche.
          sendPushToUser(ctx.db, comment.authorId, {
            title: `${input.emoji}  ${displayName(ctx.user)}`,
            body: 'a réagi à ton commentaire',
            url: `/?entryId=${comment.entryId}&commentId=${input.commentId}`,
          }, { kind: 'reaction', respectPref: 'notifyOwnerReactions' }).catch(() => null);
        }
        return { action: 'added' as const };
      }
    }),

  /**
   * Réactions agrégées pour une entrée.
   */
  forEntry: authedProcedure
    .input(z.object({ entryId: z.string() }))
    .query(async ({ ctx, input }) => {
      const entry = await ctx.db.entry.findUnique({
        where: { id: input.entryId, deletedAt: null },
        select: ENTRY_PERM_SELECT,
      });
      // Lecture charitable : pour un id introuvable / supprimé, renvoie une liste vide
      // (ne pas casser le batch entier juste parce qu'une carte référence un id orphelin).
      if (!entry || !canInteract(ctx.user, entry)) return aggregateReactions([]);

      const reactions = await ctx.db.reaction.findMany({
        where: { entryId: input.entryId },
        select: { emoji: true, userId: true, user: { select: { id: true, displayName: true, email: true } } },
      });
      return aggregateReactions(reactions);
    }),

  /**
   * Réactions agrégées pour un commentaire.
   */
  forComment: authedProcedure
    .input(z.object({ commentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const comment = await ctx.db.comment.findUnique({
        where: { id: input.commentId, deletedAt: null },
        select: { entry: { select: ENTRY_PERM_SELECT } },
      });
      if (!comment || !canInteract(ctx.user, comment.entry)) {
        return aggregateReactions([]);
      }

      const reactions = await ctx.db.reaction.findMany({
        where: { commentId: input.commentId },
        select: { emoji: true, userId: true, user: { select: { id: true, displayName: true, email: true } } },
      });
      return aggregateReactions(reactions);
    }),
});
