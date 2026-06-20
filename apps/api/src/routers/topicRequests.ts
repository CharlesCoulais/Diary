import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, authedProcedure, ownerProcedure } from '../trpc.js';
import { sendPushToUser, displayName } from '../lib/push.js';
import { emitToUser, emitToOwnerCircle } from '../lib/events.js';
import { recordAudit } from '../lib/audit.js';
import type { Prisma } from '@prisma/client';
import {
  createTopicRequestInput,
  updateTopicRequestStatusInput,
  listTopicRequestsInput,
} from '@carnet/schemas';

/** Champs renvoyés au client (avec relations utiles). */
const REQUEST_SELECT = {
  id: true,
  title: true,
  description: true,
  status: true,
  authorId: true,
  treatedById: true,
  ownerNote: true,
  linkedEntryId: true,
  createdAt: true,
  updatedAt: true,
  treatedAt: true,
  author: {
    select: { id: true, email: true, displayName: true },
  },
  linkedEntry: {
    select: { id: true, date: true, title: true, noteType: true },
  },
} as const;

export const topicRequestsRouter = router({
  /**
   * Le confident crée une demande. Le owner ne peut pas en créer pour lui-même
   * (ça n'a pas de sens — il écrit directement dans son journal).
   */
  create: authedProcedure
    .input(createTopicRequestInput)
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'GUEST') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Seuls les guests peuvent faire une demande.' });
      }
      const created = await ctx.db.topicRequest.create({
        data: {
          title: input.title,
          description: input.description ?? null,
          authorId: ctx.user.id,
        },
        select: REQUEST_SELECT,
      });

      // Notif push vers l'owner du journal (le guest a forcément un invitedById)
      if (ctx.user.invitedById) {
        sendPushToUser(ctx.db, ctx.user.invitedById, {
          title: '💡 Nouvelle demande',
          body: `${displayName(ctx.user)} : ${input.title}`,
          url: '/demandes',
        }, { respectPref: 'notifyOwnerRequests', kind: 'request' }).catch(() => null);
        emitToUser(ctx.user.invitedById, 'topicRequest');
      }

      recordAudit(ctx, 'REQUEST_CREATED', { metadata: { title: input.title } });
      return created;
    }),

  /**
   * Liste les demandes.
   *  - Owner : voit toutes les demandes
   *  - Guest : voit uniquement les siennes
   */
  list: authedProcedure
    .input(listTopicRequestsInput)
    .query(async ({ ctx, input }) => {
      const where = ctx.user.role === 'OWNER'
        ? (input?.status ? { status: input.status } : {})
        : { authorId: ctx.user.id, ...(input?.status ? { status: input.status } : {}) };
      return ctx.db.topicRequest.findMany({
        where,
        select: REQUEST_SELECT,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: input?.limit ?? 100,
      });
    }),

  /**
   * Compte les demandes "ouvertes" — celles qui demandent encore l'attention
   * de l'owner (PENDING ou IN_PROGRESS). Utilisé pour le badge "Demandes" du
   * sidebar et l'onglet "Toutes" de la page Boîte à demandes.
   *  - Owner : nombre total de PENDING + IN_PROGRESS
   *  - Guest : 0 (n'a pas besoin de notif sur ses propres demandes)
   */
  pendingCount: authedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== 'OWNER') return 0;
    return ctx.db.topicRequest.count({ where: { status: { in: ['PENDING', 'IN_PROGRESS'] } } });
  }),

  /**
   * Owner uniquement : change le statut + note optionnelle + entry liée.
   */
  updateStatus: ownerProcedure
    .input(updateTopicRequestStatusInput)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.topicRequest.findUnique({
        where: { id: input.id },
        select: { id: true, status: true, authorId: true, title: true },
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });

      // Nettoyer / extraire l'ID si on a une URL ou un ID brut
      const cleanedEntryId = input.linkedEntryId
        ? (input.linkedEntryId.match(/entryId=([^&\s]+)/)?.[1] ?? input.linkedEntryId).trim()
        : null;

      // Vérifier que l'entry liée existe si fournie
      if (cleanedEntryId) {
        const e = await ctx.db.entry.findUnique({
          where: { id: cleanedEntryId },
          select: { id: true, authorId: true, deletedAt: true },
        });
        if (!e || e.authorId !== ctx.user.id || e.deletedAt) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Note introuvable dans ton journal (vérifie qu\'elle a bien été synchronisée).',
          });
        }
      }

      const reachedTerminal = input.status === 'DONE' || input.status === 'REJECTED';
      const transitionedToTerminal = reachedTerminal
        && existing.status !== 'DONE'
        && existing.status !== 'REJECTED';

      const updated = await ctx.db.topicRequest.update({
        where: { id: input.id },
        data: {
          status: input.status,
          ownerNote: input.ownerNote ?? null,
          linkedEntryId: cleanedEntryId,
          treatedById: ctx.user.id,
          treatedAt: reachedTerminal ? new Date() : null,
        },
        select: REQUEST_SELECT,
      });

      // Notif + push pour l'auteur de la demande quand elle passe en DONE/REJECTED
      if (transitionedToTerminal && existing.authorId !== ctx.user.id) {
        const authorId = existing.authorId;
        (async () => {
          const author = await ctx.db.user.findUnique({
            where: { id: authorId },
            select: { notifEnabled: true, notifyOnRequestTreated: true },
          });
          if (!author?.notifyOnRequestTreated) return;
          const meta: Prisma.InputJsonValue = {
            requestId: existing.id,
            status: input.status,
            linkedEntryId: cleanedEntryId,
          };
          await ctx.db.notification.create({
            data: {
              id: crypto.randomUUID(),
              userId: authorId,
              type: 'REQUEST_TREATED',
              entryId: cleanedEntryId,
              meta,
            },
          }).catch(() => null);
          if (!author.notifEnabled) return;
          const owner = await ctx.db.user.findUnique({
            where: { id: ctx.user.id },
            select: { displayName: true, email: true },
          });
          const ownerName = owner ? displayName(owner) : 'L\'auteur';
          const verb = input.status === 'DONE' ? 'a traité' : 'a refusé';
          void sendPushToUser(ctx.db, authorId, {
            title: `${ownerName} ${verb} ta demande`,
            body: existing.title,
            url: cleanedEntryId ? `/?entryId=${cleanedEntryId}` : '/demandes',
          }, { kind: 'request' });
        })().catch(() => null);
      }

      if (input.status !== existing.status) {
        recordAudit(ctx, 'REQUEST_STATUS_CHANGED', {
          entryId: cleanedEntryId ?? undefined,
          metadata: { from: existing.status, to: input.status, title: existing.title },
        });
      }

      // Temps réel : l'auteur de la demande (et le reste du cercle) voit le
      // changement de statut sans rafraîchir.
      void emitToOwnerCircle(ctx.db, ctx.user.id, 'topicRequest').catch(() => null);

      return updated;
    }),

  /**
   * Supprimer : l'auteur (confident) peut retirer SA demande tant qu'elle est PENDING.
   * L'owner peut tout supprimer.
   */
  delete: authedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const r = await ctx.db.topicRequest.findUnique({
        where: { id: input.id },
        select: { id: true, authorId: true, status: true, title: true },
      });
      if (!r) throw new TRPCError({ code: 'NOT_FOUND' });

      const isOwner = ctx.user.role === 'OWNER';
      const isAuthor = r.authorId === ctx.user.id;
      const canDelete = isOwner || (isAuthor && r.status === 'PENDING');
      if (!canDelete) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: isAuthor ? 'Demande déjà traitée — impossible à supprimer.' : 'Action non autorisée.',
        });
      }
      await ctx.db.topicRequest.delete({ where: { id: input.id } });
      recordAudit(ctx, 'REQUEST_DELETED', { metadata: { title: r.title } });
      // Temps réel : la liste / le compteur se mettent à jour pour tout le cercle.
      const ownerId = isOwner ? ctx.user.id : (ctx.user.invitedById ?? ctx.user.id);
      void emitToOwnerCircle(ctx.db, ownerId, 'topicRequest', ctx.user.id).catch(() => null);
      return { ok: true as const };
    }),
});
