import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, authedProcedure, ownerProcedure } from '../trpc.js';
import { canInteract, canComment } from '../lib/permissions.js';
import { sendPushToUser, displayName } from '../lib/push.js';
import { notifyCommentMentions } from '../lib/mentions.js';
import { emitToEntryAudience, emitTypingToEntryAudience } from '../lib/events.js';

const ENTRY_PERM_SELECT = {
  authorId: true,
  visibility: true,
  commentsLocked: true,
  commentsResolved: true,
  isSecret: true,
  shares: { select: { receiverId: true, canComment: true } },
} as const;

const AUTHOR_SELECT = { id: true, displayName: true, email: true, role: true } as const;

const IMAGE_MAX_BYTES = 8 * 1024 * 1024; // 8 Mo

/** Taille réelle (octets) d'une donnée encodée en base64. */
function base64Bytes(data: string): number {
  return Buffer.from(data, 'base64').length;
}

/** Vrai si l'URL pointe vers le CDN Giphy en https. */
function isGiphyUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === 'https:'
      && (url.hostname === 'giphy.com' || url.hostname.endsWith('.giphy.com'));
  } catch {
    return false;
  }
}

export const commentsRouter = router({
  /**
   * Retourne les commentaires d'une entrée.
   * - Owner : tous les commentaires
   * - Guest : ses propres commentaires + tous les commentaires de l'auteur de l'entrée
   */
  list: authedProcedure
    .input(z.object({ entryId: z.string() }))
    .query(async ({ ctx, input }) => {
      const entry = await ctx.db.entry.findUnique({
        where: { id: input.entryId, deletedAt: null },
        select: ENTRY_PERM_SELECT,
      });
      // Lecture charitable : id orphelin → [] (évite de casser un batch tRPC)
      if (!entry || !canInteract(ctx.user, entry)) return [];

      const baseWhere = { entryId: input.entryId, deletedAt: null as Date | null };

      if (ctx.user.role === 'OWNER') {
        return ctx.db.comment.findMany({
          where: baseWhere,
          include: { author: { select: AUTHOR_SELECT }, image: { select: { id: true } }, replyTo: { select: { id: true, content: true, author: { select: AUTHOR_SELECT } } } },
          orderBy: { createdAt: 'asc' },
        });
      }

      // Guest : ses commentaires + ceux de l'auteur du journal (réponses et annotations)
      return ctx.db.comment.findMany({
        where: {
          ...baseWhere,
          OR: [
            { authorId: ctx.user.id },
            { authorId: entry.authorId },
          ],
        },
        include: { author: { select: AUTHOR_SELECT }, image: { select: { id: true } }, replyTo: { select: { id: true, content: true, author: { select: AUTHOR_SELECT } } } },
        orderBy: { createdAt: 'asc' },
      });
    }),

  /** Ajoute un commentaire ou une réponse (texte et/ou média). */
  add: authedProcedure
    .input(z.object({
      entryId: z.string(),
      content: z.string().max(5000).optional(),
      parentId: z.string().optional(),
      replyToId: z.string().optional(),
      anchorText: z.string().max(500).optional(),
      image: z.object({
        data: z.string(),
        mimeType: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
        size: z.number().int().positive(),
      }).optional(),
      gifUrl: z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db.entry.findUnique({
        where: { id: input.entryId, deletedAt: null },
        select: ENTRY_PERM_SELECT,
      });
      if (!entry) throw new TRPCError({ code: 'NOT_FOUND' });
      if (!canComment(ctx.user, entry)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Commentaires non autorisés.' });
      }

      const content = input.content?.trim() ?? '';
      if (!content && !input.image && !input.gifUrl) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Commentaire vide.' });
      }
      if (input.image && base64Bytes(input.image.data) > IMAGE_MAX_BYTES) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Image trop lourde (max 8 Mo).' });
      }
      if (input.gifUrl && !isGiphyUrl(input.gifUrl)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'URL de GIF invalide.' });
      }

      // Si reply, vérifier que le parent appartient à la même entrée
      if (input.parentId) {
        const parent = await ctx.db.comment.findUnique({
          where: { id: input.parentId },
          select: { entryId: true },
        });
        if (!parent || parent.entryId !== input.entryId) {
          throw new TRPCError({ code: 'BAD_REQUEST' });
        }
      }

      const comment = await ctx.db.comment.create({
        data: {
          entryId: input.entryId,
          authorId: ctx.user.id,
          content,
          gifUrl: input.gifUrl ?? null,
          parentId: input.parentId ?? null,
          replyToId: input.replyToId ?? null,
          anchorText: input.anchorText ?? null,
        },
        include: { author: { select: AUTHOR_SELECT } },
      });

      if (input.image) {
        await ctx.db.image.create({
          data: {
            data: input.image.data,
            mimeType: input.image.mimeType,
            size: input.image.size,
            authorId: ctx.user.id,
            commentId: comment.id,
          },
        });
      }

      // Rouvrir automatiquement le fil si quelqu'un répond après clôture
      if (entry.commentsResolved) {
        await ctx.db.entry.update({
          where: { id: input.entryId },
          data: { commentsResolved: false },
        });
        // Notifier l'owner si c'est un guest qui a rouvert le fil
        if (ctx.user.role === 'GUEST') {
          await ctx.db.notification.create({
            data: {
              userId: entry.authorId,
              type: 'THREAD_REOPENED',
              entryId: input.entryId,
              commentId: comment.id,
            },
          });
          sendPushToUser(ctx.db, entry.authorId, {
            title: 'Fil de discussion rouvert ✦',
            body: `${displayName(ctx.user)} a commenté sur un fil résolu`,
            url: `/?entryId=${input.entryId}`,
          }, { respectPref: 'notifyOwnerComments', kind: 'comment' }).catch(() => null);
        }
      }

      // Notifications
      if (ctx.user.role === 'GUEST') {
        // Notifier l'owner (DB + push)
        await ctx.db.notification.create({
          data: {
            userId: entry.authorId,
            type: 'COMMENT_NEW',
            entryId: input.entryId,
            commentId: comment.id,
          },
        });
        await ctx.db.auditLog.create({
          data: {
            userId: ctx.user.id,
            action: 'COMMENT_ADDED',
            entryId: input.entryId,
            ipHash: ctx.ipHash,
            userAgent: ctx.userAgent,
          },
        });
        sendPushToUser(ctx.db, entry.authorId, {
          title: 'Nouveau commentaire ✦',
          body: `${displayName(ctx.user)} a commenté une de tes notes`,
          url: `/?entryId=${input.entryId}`,
        }, { respectPref: 'notifyOwnerComments', kind: 'comment' }).catch(() => null);
      } else if (ctx.user.role === 'OWNER' && input.parentId) {
        // Notifier le guest dont on répond au commentaire (DB + push)
        const parent = await ctx.db.comment.findUnique({
          where: { id: input.parentId },
          select: { authorId: true, author: { select: { id: true, role: true, displayName: true, email: true } } },
        });
        if (parent?.author.role === 'GUEST') {
          await ctx.db.notification.create({
            data: {
              userId: parent.authorId,
              type: 'COMMENT_REPLY',
              entryId: input.entryId,
              commentId: comment.id,
            },
          });
          sendPushToUser(ctx.db, parent.authorId, {
            title: `${displayName(ctx.user)} a répondu`,
            body: `${displayName(ctx.user)} a répondu à ton commentaire`,
            url: `/?entryId=${input.entryId}&commentId=${comment.id}`,
          }, { respectPref: 'notifyOwnerComments', kind: 'comment' }).catch(() => null);
        }
      }

      // Toucher updatedAt de l'entrée pour que la sync incrémentale récupère le nouveau commentsCount
      await ctx.db.entry.update({
        where: { id: input.entryId },
        data: { updatedAt: new Date() },
      });

      // Temps réel : rafraîchit le fil chez tous ceux qui le voient (owner +
      // confidents), quel que soit l'auteur du commentaire.
      void emitToEntryAudience(ctx.db, entry, 'comment').catch(() => null);

      // Mentions @ dans le commentaire → notif + push (porte = canInteract).
      void notifyCommentMentions(ctx.db, ctx.user, { id: comment.id, entryId: input.entryId }, content).catch(() => null);

      return comment;
    }),

  /**
   * Signale « est en train d'écrire » sur le fil d'une entrée. Éphémère :
   * aucune écriture en base, on diffuse juste l'info à l'audience (sauf soi).
   * Le client l'appelle de façon throttlée pendant la frappe.
   */
  typing: authedProcedure
    .input(z.object({ entryId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db.entry.findUnique({
        where: { id: input.entryId, deletedAt: null },
        select: ENTRY_PERM_SELECT,
      });
      if (!entry || !canComment(ctx.user, entry)) {
        // Pas le droit de commenter → on ignore silencieusement (signal éphémère).
        return { ok: false as const };
      }
      void emitTypingToEntryAudience(
        ctx.db,
        entry,
        input.entryId,
        displayName(ctx.user),
        ctx.user.id,
      ).catch(() => null);
      return { ok: true as const };
    }),

  /**
   * Modifie le contenu d'un commentaire — auteur uniquement.
   *
   * Concurrence optimiste : si `expectedVersion` est fourni et ne matche pas
   * la version courante, on rejette avec CONFLICT. Le client peut alors
   * re-fetch et réessayer (ou afficher un message). Sans le champ, l'édition
   * passe (rétrocompat avec les clients qui ne l'envoient pas encore).
   *
   * Pourquoi : un owner peut éditer son propre commentaire pendant que le
   * confident le lit / l'édite (cas rare mais possible) — sans ce check,
   * le last-write-wins effaçait silencieusement la version antérieure.
   */
  edit: authedProcedure
    .input(z.object({
      commentId: z.string(),
      content: z.string().min(1).max(5000).trim(),
      expectedVersion: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.db.comment.findUnique({
        where: { id: input.commentId },
        select: { authorId: true, entryId: true, deletedAt: true, version: true, entry: { select: ENTRY_PERM_SELECT } },
      });
      if (!comment || comment.deletedAt) throw new TRPCError({ code: 'NOT_FOUND' });
      if (comment.authorId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN' });
      if (input.expectedVersion !== undefined && input.expectedVersion !== comment.version) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Ce commentaire a été modifié ailleurs. Recharge pour voir la dernière version.',
        });
      }
      const updated = await ctx.db.comment.update({
        where: { id: input.commentId },
        data: { content: input.content, version: { increment: 1 } },
        include: { author: { select: AUTHOR_SELECT } },
      });
      void emitToEntryAudience(ctx.db, comment.entry, 'comment').catch(() => null);
      // Mentions ajoutées à l'édition → notif (idempotent côté helper).
      void notifyCommentMentions(ctx.db, ctx.user, { id: input.commentId, entryId: comment.entryId }, input.content).catch(() => null);
      return updated;
    }),

  /** Suppression douce — auteur ou owner de l'entrée. */
  delete: authedProcedure
    .input(z.object({ commentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.db.comment.findUnique({
        where: { id: input.commentId },
        select: { authorId: true, entryId: true, entry: { select: ENTRY_PERM_SELECT } },
      });
      if (!comment) throw new TRPCError({ code: 'NOT_FOUND' });

      const canDel =
        comment.authorId === ctx.user.id ||
        (ctx.user.role === 'OWNER' && comment.entry.authorId === ctx.user.id);
      if (!canDel) throw new TRPCError({ code: 'FORBIDDEN' });

      await ctx.db.comment.update({
        where: { id: input.commentId },
        data: { deletedAt: new Date() },
      });
      // Toucher updatedAt de l'entrée pour que la sync incrémentale récupère le nouveau commentsCount
      await ctx.db.entry.update({
        where: { id: comment.entryId },
        data: { updatedAt: new Date() },
      });
      void emitToEntryAudience(ctx.db, comment.entry, 'comment').catch(() => null);
      return { ok: true };
    }),

  /**
   * Activité commentaires récente — un item par thread (commentaire racine).
   * Owner  : tous les threads de ses entrées.
   * Guest  : threads des entrées où il a participé.
   */
  activity: authedProcedure.query(async ({ ctx }) => {
    const INCLUDE = {
      author: { select: { id: true, displayName: true, email: true, role: true } },
      entry: {
        select: {
          id: true,
          date: true,
          noteType: true,
          customTypeId: true,
          mediaMeta: true,
          contentMd: true,
          commentsLocked: true,
          commentsResolved: true,
        },
      },
    } as const;

    let allComments: Awaited<ReturnType<typeof ctx.db.comment.findMany<{ include: typeof INCLUDE }>>>;

    if (ctx.user.role === 'OWNER') {
      allComments = await ctx.db.comment.findMany({
        where: { deletedAt: null, entry: { authorId: ctx.user.id, deletedAt: null } },
        include: INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
    } else {
      const participated = await ctx.db.comment.findMany({
        where: { authorId: ctx.user.id, deletedAt: null },
        select: { entryId: true },
        distinct: ['entryId'],
      });
      const entryIds = participated.map((c) => c.entryId);
      if (!entryIds.length) return [];

      allComments = await ctx.db.comment.findMany({
        where: { entryId: { in: entryIds }, deletedAt: null, entry: { deletedAt: null } },
        include: INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
    }

    // Chaque thread est identifié par son commentaire racine (parentId = null).
    // Les réponses peuvent pointer vers n'importe quel commentaire du thread,
    // il faut donc remonter récursivement jusqu'à la racine.
    const parentMap = new Map<string, string | null>();
    for (const c of allComments) parentMap.set(c.id, c.parentId);

    function getRootId(id: string): string {
      const pid = parentMap.get(id);
      if (!pid) return id;
      return getRootId(pid);
    }

    const rootAnchorText = new Map<string, string | null>(); // rootId → anchorText
    const threadLastComment = new Map<string, typeof allComments[0]>(); // rootId → dernier commentaire
    const threadCount = new Map<string, number>(); // rootId → nb commentaires

    // Collecter anchorText depuis les racines
    for (const c of allComments) {
      if (!c.parentId) rootAnchorText.set(c.id, c.anchorText);
    }

    // allComments est ordonné desc : premier vu par thread = le plus récent
    for (const c of allComments) {
      const rootId = getRootId(c.id);
      threadCount.set(rootId, (threadCount.get(rootId) ?? 0) + 1);
      if (!threadLastComment.has(rootId)) threadLastComment.set(rootId, c);
    }

    // Lectures de fil de l'utilisateur courant (BUG-04) : un fil dont le dernier
    // commentaire n'est pas de moi compte « à répondre » seulement s'il est
    // postérieur à `myReadAt`. Le client dérive le statut à partir de ce champ.
    const rootIds = Array.from(threadLastComment.keys());
    const reads = rootIds.length
      ? await ctx.db.commentThreadRead.findMany({
          where: { userId: ctx.user.id, threadRootId: { in: rootIds } },
          select: { threadRootId: true, readAt: true },
        })
      : [];
    const readMap = new Map(reads.map((r) => [r.threadRootId, r.readAt]));

    return Array.from(threadLastComment.entries())
      .map(([rootId, last]) => ({
        threadRootId: rootId,
        anchorText: rootAnchorText.get(rootId) ?? null,
        threadCount: threadCount.get(rootId) ?? 1,
        id: last.id,
        content: last.content,
        createdAt: last.createdAt,
        author: last.author,
        entry: last.entry,
        myReadAt: readMap.get(rootId) ?? null,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50);
  }),

  /**
   * Marque un fil comme lu par l'utilisateur courant (BUG-04). Appelé quand il
   * ouvre le fil dans le Fil : pose/rafraîchit `readAt = now`, ce qui sort le
   * fil de « à répondre » même sans réponse explicite (j'ai vu le dernier
   * message). Idempotent. Lecture charitable si le fil a disparu.
   */
  markThreadRead: authedProcedure
    .input(z.object({ threadRootId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const root = await ctx.db.comment.findUnique({
        where: { id: input.threadRootId },
        select: { id: true, entry: { select: ENTRY_PERM_SELECT } },
      });
      if (!root || !canInteract(ctx.user, root.entry)) return { ok: true };
      await ctx.db.commentThreadRead.upsert({
        where: { userId_threadRootId: { userId: ctx.user.id, threadRootId: input.threadRootId } },
        create: { userId: ctx.user.id, threadRootId: input.threadRootId },
        update: { readAt: new Date() },
      });
      return { ok: true };
    }),

  /** Clore / rouvrir un fil de commentaires (owner ou guest confidant). */
  resolve: authedProcedure
    .input(z.object({ entryId: z.string(), resolved: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const canResolve =
        ctx.user.role === 'OWNER' ||
        (ctx.user.role === 'GUEST' && ctx.user.guestAccess === 'CONFIDANT');
      if (!canResolve) throw new TRPCError({ code: 'FORBIDDEN' });

      const entry = await ctx.db.entry.findUnique({
        where: { id: input.entryId, deletedAt: null },
        select: ENTRY_PERM_SELECT,
      });
      if (!entry) throw new TRPCError({ code: 'NOT_FOUND' });
      // Un CONFIDANT ne peut résoudre que les fils de l'owner qui l'a invité
      if (ctx.user.role === 'GUEST' && entry.authorId !== ctx.user.invitedById) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      await ctx.db.entry.update({
        where: { id: input.entryId },
        data: { commentsResolved: input.resolved },
      });
      void emitToEntryAudience(ctx.db, entry, 'comment').catch(() => null);
      return { ok: true };
    }),

  /** Nombre de commentaires non supprimés sur une entrée. */
  count: authedProcedure
    .input(z.object({ entryId: z.string() }))
    .query(async ({ ctx, input }) => {
      const entry = await ctx.db.entry.findUnique({
        where: { id: input.entryId, deletedAt: null },
        select: ENTRY_PERM_SELECT,
      });
      if (!entry || !canInteract(ctx.user, entry)) throw new TRPCError({ code: 'NOT_FOUND' });
      return ctx.db.comment.count({
        where: { entryId: input.entryId, deletedAt: null },
      });
    }),
});
