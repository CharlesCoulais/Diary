import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import type { User, PrismaClient } from '@prisma/client';
import { router, authedProcedure } from '../trpc.js';
import { sendPushToUser, displayName } from '../lib/push.js';
import { emitToUser, emitDmTyping, isUserOnline } from '../lib/events.js';
import { aggregateReactions } from './reactions.js';
import { recordAudit } from '../lib/audit.js';

const REACTION_SELECT = {
  emoji: true,
  userId: true,
  user: { select: { id: true, displayName: true, email: true } },
} as const;

const SENDER_SELECT = { id: true, displayName: true, email: true, role: true } as const;

const IMAGE_MAX_BYTES = 8 * 1024 * 1024;   // 8 Mo
const VIDEO_MAX_BYTES = 15 * 1024 * 1024;  // 15 Mo

const MESSAGE_INCLUDE = {
  sender: { select: SENDER_SELECT },
  reactions: { select: REACTION_SELECT },
  image: { select: { id: true } },
  video: { select: { id: true } },
  replyTo: {
    select: {
      id: true,
      content: true,
      deletedAt: true,
      senderId: true,
      gifUrl: true,
      sender: { select: SENDER_SELECT },
      image: { select: { id: true } },
      video: { select: { id: true } },
    },
  },
} as const;

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

/**
 * Résout une conversation directe à partir de son `conversationId`.
 *
 * Une conversation = couple (owner, confident). Comme chaque confident n'a
 * qu'un seul owner (`User.invitedById`), elle est identifiée de façon unique
 * par l'`userId` du confident → `conversationId === guestId`.
 *
 * Refuse (FORBIDDEN) si l'appelant ne fait pas partie de la conversation.
 */
async function resolveConversation(
  db: PrismaClient,
  user: User,
  conversationId: string,
): Promise<{ ownerId: string; guestId: string; otherUserId: string }> {
  if (user.role === 'OWNER') {
    const guest = await db.user.findUnique({
      where: { id: conversationId },
      select: { id: true, role: true, invitedById: true },
    });
    if (!guest || guest.role !== 'GUEST' || guest.invitedById !== user.id) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    return { ownerId: user.id, guestId: guest.id, otherUserId: guest.id };
  }
  // GUEST : sa seule conversation est avec son owner ; conversationId === son id.
  if (conversationId !== user.id || !user.invitedById) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return { ownerId: user.invitedById, guestId: user.id, otherUserId: user.invitedById };
}

/** Clause `where` couvrant les messages d'une conversation (les deux sens). */
function conversationWhere(ownerId: string, guestId: string) {
  return {
    deletedAt: null as Date | null,
    OR: [
      { senderId: ownerId, recipientId: guestId },
      { senderId: guestId, recipientId: ownerId },
    ],
  };
}

export const directMessagesRouter = router({
  /**
   * Liste les conversations de l'utilisateur.
   * - Owner : une par confident (avec dernier message + non-lus).
   * - Guest : une seule, avec son owner.
   * Sert au sélecteur de conversation et à décider si le FAB s'affiche.
   */
  conversations: authedProcedure.query(async ({ ctx }) => {
    const pairs: { conversationId: string; ownerId: string; guestId: string; otherUserId: string }[] = [];

    if (ctx.user.role === 'OWNER') {
      const guests = await ctx.db.user.findMany({
        where: { role: 'GUEST', invitedById: ctx.user.id, revokedAt: null },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      for (const g of guests) {
        pairs.push({ conversationId: g.id, ownerId: ctx.user.id, guestId: g.id, otherUserId: g.id });
      }
    } else if (ctx.user.invitedById) {
      pairs.push({
        conversationId: ctx.user.id,
        ownerId: ctx.user.invitedById,
        guestId: ctx.user.id,
        otherUserId: ctx.user.invitedById,
      });
    }

    return Promise.all(
      pairs.map(async (p) => {
        const [other, lastMessage, unreadCount] = await Promise.all([
          ctx.db.user.findUnique({
            where: { id: p.otherUserId },
            select: { id: true, displayName: true, email: true, avatarImageId: true },
          }),
          ctx.db.directMessage.findFirst({
            where: conversationWhere(p.ownerId, p.guestId),
            orderBy: { createdAt: 'desc' },
            select: {
              id: true, content: true, createdAt: true, senderId: true, gifUrl: true,
              image: { select: { id: true } },
              video: { select: { id: true } },
            },
          }),
          ctx.db.directMessage.count({
            where: { recipientId: ctx.user.id, senderId: p.otherUserId, readAt: null, deletedAt: null },
          }),
        ]);
        const lastPreview = lastMessage
          ? (lastMessage.content
            || (lastMessage.image ? '📷 Photo'
              : lastMessage.video ? '🎬 Vidéo'
              : lastMessage.gifUrl ? 'GIF'
              : null))
          : null;
        return {
          conversationId: p.conversationId,
          otherName: other ? displayName(other) : '?',
          otherUserId: p.otherUserId,
          otherAvatarImageId: other?.avatarImageId ?? null,
          otherOnline: isUserOnline(p.otherUserId),
          lastMessage: lastPreview,
          lastAt: lastMessage?.createdAt ?? null,
          unreadCount,
        };
      }),
    );
  }),

  /** Messages d'une conversation, du plus ancien au plus récent. */
  list: authedProcedure
    .input(z.object({ conversationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { ownerId, guestId } = await resolveConversation(ctx.db, ctx.user, input.conversationId);
      const messages = await ctx.db.directMessage.findMany({
        where: conversationWhere(ownerId, guestId),
        include: MESSAGE_INCLUDE,
        orderBy: { createdAt: 'asc' },
        take: 200,
      });
      return messages.map(({ reactions, ...rest }) => ({
        ...rest,
        reactions: aggregateReactions(reactions),
      }));
    }),

  /** Envoie un message dans une conversation (texte et/ou média). */
  send: authedProcedure
    .input(z.object({
      conversationId: z.string(),
      content: z.string().max(5000).optional(),
      replyToId: z.string().optional(),
      image: z.object({
        data: z.string(),
        mimeType: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
        size: z.number().int().positive(),
      }).optional(),
      video: z.object({
        data: z.string(),
        mimeType: z.enum(['video/mp4', 'video/webm', 'video/quicktime']),
        filename: z.string().max(200),
        size: z.number().int().positive(),
      }).optional(),
      gifUrl: z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { ownerId, guestId, otherUserId } = await resolveConversation(
        ctx.db, ctx.user, input.conversationId,
      );

      const content = input.content?.trim() ?? '';
      if (!content && !input.image && !input.video && !input.gifUrl) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Message vide.' });
      }
      if (input.image && base64Bytes(input.image.data) > IMAGE_MAX_BYTES) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Image trop lourde (max 8 Mo).' });
      }
      if (input.video && base64Bytes(input.video.data) > VIDEO_MAX_BYTES) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Vidéo trop lourde (max 15 Mo).' });
      }
      if (input.gifUrl && !isGiphyUrl(input.gifUrl)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'URL de GIF invalide.' });
      }

      // Une réponse ne peut citer qu'un message de la même conversation.
      if (input.replyToId) {
        const parent = await ctx.db.directMessage.findUnique({
          where: { id: input.replyToId },
          select: { senderId: true, recipientId: true },
        });
        const participants = [ownerId, guestId];
        if (!parent
          || !participants.includes(parent.senderId)
          || !participants.includes(parent.recipientId)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Message cité introuvable.' });
        }
      }

      const message = await ctx.db.directMessage.create({
        data: {
          senderId: ctx.user.id,
          recipientId: otherUserId,
          content,
          gifUrl: input.gifUrl ?? null,
          replyToId: input.replyToId ?? null,
        },
      });

      if (input.image) {
        await ctx.db.image.create({
          data: {
            data: input.image.data,
            mimeType: input.image.mimeType,
            size: input.image.size,
            authorId: ctx.user.id,
            directMessageId: message.id,
          },
        });
      }
      if (input.video) {
        await ctx.db.video.create({
          data: {
            data: input.video.data,
            mimeType: input.video.mimeType,
            filename: input.video.filename,
            size: input.video.size,
            authorId: ctx.user.id,
            directMessageId: message.id,
          },
        });
      }

      emitToUser(otherUserId, 'directMessage');
      emitToUser(ctx.user.id, 'directMessage');
      recordAudit(ctx, 'MESSAGE_SENT', {
        metadata: {
          recipient: otherUserId,
          media: input.image ? 'image' : input.video ? 'video' : input.gifUrl ? 'gif' : null,
        },
      });
      sendPushToUser(ctx.db, otherUserId, {
        title: 'Nouveau message ✦',
        body: content
          ? `${displayName(ctx.user)} : ${content.slice(0, 80)}`
          : `${displayName(ctx.user)} t'a envoyé un média`,
        url: `/?chat=${input.conversationId}`,
      }, { kind: 'message', respectPref: 'notifyMessages' }).catch(() => null);

      return { id: message.id };
    }),

  /** Modifie un message — expéditeur uniquement. */
  edit: authedProcedure
    .input(z.object({
      messageId: z.string(),
      content: z.string().min(1).max(5000).trim(),
      // Concurrence optimiste (optionnel, rétrocompat) : version connue par le client.
      expectedVersion: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const message = await ctx.db.directMessage.findUnique({
        where: { id: input.messageId },
        select: { senderId: true, recipientId: true, deletedAt: true, version: true },
      });
      if (!message || message.deletedAt) throw new TRPCError({ code: 'NOT_FOUND' });
      if (message.senderId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN' });
      if (input.expectedVersion !== undefined && input.expectedVersion !== message.version) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Ce message a été modifié ailleurs. Recharge pour voir la dernière version.',
        });
      }

      const updated = await ctx.db.directMessage.update({
        where: { id: input.messageId },
        data: { content: input.content, editedAt: new Date(), version: { increment: 1 } },
        include: { sender: { select: SENDER_SELECT } },
      });
      emitToUser(message.recipientId, 'directMessage');
      emitToUser(ctx.user.id, 'directMessage');
      return updated;
    }),

  /** Suppression douce d'un message — expéditeur uniquement. */
  delete: authedProcedure
    .input(z.object({ messageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const message = await ctx.db.directMessage.findUnique({
        where: { id: input.messageId },
        select: { senderId: true, recipientId: true },
      });
      if (!message) throw new TRPCError({ code: 'NOT_FOUND' });
      if (message.senderId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN' });

      await ctx.db.directMessage.update({
        where: { id: input.messageId },
        data: { deletedAt: new Date() },
      });
      emitToUser(message.recipientId, 'directMessage');
      emitToUser(ctx.user.id, 'directMessage');
      return { ok: true as const };
    }),

  /** Bascule une réaction emoji sur un message (ajoute si absente, retire sinon). */
  toggleReaction: authedProcedure
    .input(z.object({ messageId: z.string(), emoji: z.string().min(1).max(10) }))
    .mutation(async ({ ctx, input }) => {
      const message = await ctx.db.directMessage.findUnique({
        where: { id: input.messageId },
        select: {
          senderId: true,
          recipientId: true,
          deletedAt: true,
          sender: { select: { id: true, role: true } },
          recipient: { select: { id: true, role: true } },
        },
      });
      if (!message || message.deletedAt) throw new TRPCError({ code: 'NOT_FOUND' });
      if (ctx.user.id !== message.senderId && ctx.user.id !== message.recipientId) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      const existing = await ctx.db.reaction.findUnique({
        where: {
          userId_directMessageId_emoji: {
            userId: ctx.user.id,
            directMessageId: input.messageId,
            emoji: input.emoji,
          },
        },
      });
      if (existing) {
        await ctx.db.reaction.delete({ where: { id: existing.id } });
      } else {
        await ctx.db.reaction.create({
          data: { userId: ctx.user.id, directMessageId: input.messageId, emoji: input.emoji },
        });
      }

      const other = ctx.user.id === message.senderId ? message.recipientId : message.senderId;
      emitToUser(other, 'directMessage');
      emitToUser(ctx.user.id, 'directMessage');

      // Notifie l'auteur du message quand quelqu'un d'autre y ajoute une réaction.
      if (!existing && message.senderId !== ctx.user.id) {
        const conversationId = message.sender.role === 'GUEST'
          ? message.sender.id
          : message.recipient.id;
        sendPushToUser(ctx.db, message.senderId, {
          title: `${input.emoji}  ${displayName(ctx.user)}`,
          body: 'a réagi à ton message',
          url: `/?chat=${conversationId}`,
        }, { kind: 'reaction', respectPref: 'notifyMessages' }).catch(() => null);
      }

      return { action: existing ? ('removed' as const) : ('added' as const) };
    }),

  /** Marque comme lus tous les messages reçus dans une conversation. */
  markRead: authedProcedure
    .input(z.object({ conversationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { otherUserId } = await resolveConversation(ctx.db, ctx.user, input.conversationId);
      await ctx.db.directMessage.updateMany({
        where: { recipientId: ctx.user.id, senderId: otherUserId, readAt: null, deletedAt: null },
        data: { readAt: new Date() },
      });
      return { ok: true as const };
    }),

  /** Nombre total de messages non lus reçus — alimente le badge du FAB. */
  unreadCount: authedProcedure.query(async ({ ctx }) => {
    return ctx.db.directMessage.count({
      where: { recipientId: ctx.user.id, readAt: null, deletedAt: null },
    });
  }),

  /**
   * Signale « est en train d'écrire ». Éphémère : aucune écriture en base,
   * on diffuse juste l'info à l'autre participant.
   */
  typing: authedProcedure
    .input(z.object({ conversationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { otherUserId } = await resolveConversation(ctx.db, ctx.user, input.conversationId);
        emitDmTyping(otherUserId, input.conversationId, displayName(ctx.user));
        return { ok: true as const };
      } catch {
        return { ok: false as const };
      }
    }),
});
