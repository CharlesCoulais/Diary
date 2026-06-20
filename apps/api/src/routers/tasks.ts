import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { Prisma } from '@prisma/client';
import { router, authedProcedure } from '../trpc.js';
import { sendPushToUser, displayName } from '../lib/push.js';
import { emitToOwnerCircle } from '../lib/events.js';
import { recordAudit } from '../lib/audit.js';

const TASK_SELECT = {
  id: true,
  ownerId: true,
  title: true,
  notes: true,
  status: true,
  dueDate: true,
  completedAt: true,
  category: true,
  taskType: true,
  priority: true,
  sortOrder: true,
  createdBy: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

function getOwnerId(user: { id: string; role: string; invitedById?: string | null; guestAccess?: string | null }): string {
  if (user.role === 'OWNER') return user.id;
  if (user.guestAccess === 'CONFIDANT' && user.invitedById) return user.invitedById;
  throw new TRPCError({ code: 'FORBIDDEN', message: 'Accès réservé au confident' });
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'À faire',
  IN_PROGRESS: 'En cours',
  DONE: 'Fait',
  LOCAL_DONE: 'Fait local',
  TO_TEST: 'À tester',
  DEPLOYED: 'Déployé',
  MIGRATED: 'Migré',
  CANCELLED: 'Annulée',
  SCHEDULED: 'Planifiée',
};

const PRIORITY_LABELS: Record<string, string> = {
  HIGH: 'haute',
  MEDIUM: 'moyenne',
  LOW: 'basse',
};

/**
 * `taskType: 'writing-idea'` est utilisé par le panel « Notes à venir »
 * (capture rapide d'idées d'écriture côté owner — cf. WritingIdeasPanel).
 * Ces entrées sont privées à l'owner : on les retire systématiquement
 * des résultats renvoyés à un confident, à la fois dans `list` (Tasks
 * principale) et dans `myTasks` (compteur sidebar).
 */
const PRIVATE_TASK_TYPES = ['writing-idea'];

/** Exclut les writing-ideas du résultat si le viewer est un GUEST. */
function privacyFilter(user: { role: string }): { taskType?: { notIn: string[] } } {
  return user.role === 'GUEST' ? { taskType: { notIn: PRIVATE_TASK_TYPES } } : {};
}

export const tasksRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    const ownerId = getOwnerId(ctx.user);
    return ctx.db.task.findMany({
      where: { ownerId, deletedAt: null, ...privacyFilter(ctx.user) },
      orderBy: { createdAt: 'asc' },
      select: TASK_SELECT,
    });
  }),

  /**
   * Liste les « notes à venir » actives (writing-ideas non DONE / CANCELLED)
   * de l'owner. Endpoint séparé de `list` parce que :
   *   - On veut que la page Tâches du confident reste épurée (sans
   *     writing-ideas mélangées aux vraies tâches)
   *   - Mais le confident garde la visibilité sur les idées d'écriture
   *     pour suivre ce sur quoi l'owner veut écrire — dans un bloc dédié.
   * Owner + Confident, lecture seule côté guest.
   */
  writingIdeas: authedProcedure.query(async ({ ctx }) => {
    const ownerId = getOwnerId(ctx.user);
    return ctx.db.task.findMany({
      where: {
        ownerId,
        deletedAt: null,
        taskType: 'writing-idea',
        status: { notIn: ['DONE', 'CANCELLED'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, createdAt: true },
    });
  }),

  // Tâches "personnelles" de l'utilisateur courant.
  // - Owner   : tâches dont il est propriétaire (ownerId = lui)
  // - Confident : tâches qu'il a lui-même créées dans la liste partagée (createdBy = lui)
  // Utilisé pour le compteur sidebar / menu mobile du confident.
  myTasks: authedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role === 'OWNER') {
      return ctx.db.task.findMany({
        where: { ownerId: ctx.user.id, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: TASK_SELECT,
      });
    }
    // Confident : uniquement les tâches qu'il a explicitement créées (createdBy = son id)
    // createdBy null = tâches de l'owner sans tracking → ne lui appartiennent pas
    return ctx.db.task.findMany({
      where: { createdBy: ctx.user.id, deletedAt: null, ...privacyFilter(ctx.user) },
      orderBy: { createdAt: 'asc' },
      select: TASK_SELECT,
    });
  }),

  create: authedProcedure
    .input(z.object({
      title: z.string().min(1).max(500).trim(),
      notes: z.string().max(10_000).optional(),
      status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'LOCAL_DONE', 'TO_TEST', 'DEPLOYED', 'MIGRATED', 'CANCELLED', 'SCHEDULED']).optional(),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      category: z.string().max(100).nullable().optional(),
      taskType: z.string().max(50).nullable().optional(),
      priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const ownerId = getOwnerId(ctx.user);
      const created = await ctx.db.task.create({
        data: {
          id: crypto.randomUUID(),
          ownerId,
          title: input.title,
          notes: input.notes ?? null,
          status: input.status ?? 'OPEN',
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          completedAt: input.status === 'DONE' ? new Date() : null,
          category: input.category ?? null,
          taskType: input.taskType ?? null,
          priority: input.priority ?? null,
          createdBy: ctx.user.id,
          version: 1,
          deletedAt: null,
        },
        select: TASK_SELECT,
      });
      void emitToOwnerCircle(ctx.db, ownerId, 'task', ctx.user.id).catch(() => null);
      recordAudit(ctx, 'TASK_CREATED', { metadata: { title: input.title } });
      return created;
    }),

  update: authedProcedure
    .input(z.object({
      id: z.string().min(1),
      title: z.string().min(1).max(500).trim().optional(),
      notes: z.string().max(10_000).nullable().optional(),
      status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'LOCAL_DONE', 'TO_TEST', 'DEPLOYED', 'MIGRATED', 'CANCELLED', 'SCHEDULED']).optional(),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      completedAt: z.string().datetime().nullable().optional(),
      category: z.string().max(100).nullable().optional(),
      taskType: z.string().max(50).nullable().optional(),
      priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).nullable().optional(),
      sortOrder: z.number().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const ownerId = getOwnerId(ctx.user);
      const before = await ctx.db.task.findFirst({ where: { id: input.id, ownerId } });
      if (!before) throw new TRPCError({ code: 'NOT_FOUND' });

      const { id, ...data } = input;
      const after = await ctx.db.task.update({
        where: { id },
        data: {
          ...data,
          dueDate: data.dueDate ? new Date(data.dueDate) : data.dueDate,
          version: { increment: 1 },
        },
        select: TASK_SELECT,
      });

      const statusChanged = data.status !== undefined && data.status !== before.status;
      const priorityChanged = data.priority !== undefined && data.priority !== before.priority;

      if (statusChanged || priorityChanged) {
        const meta: Prisma.InputJsonValue = {
          ...(statusChanged ? { status: { from: before.status, to: after.status } } : {}),
          ...(priorityChanged ? { priority: { from: before.priority, to: after.priority } } : {}),
        };

        await ctx.db.notification.create({
          data: {
            userId: ownerId,
            type: 'TASK_UPDATED',
            taskId: after.id,
            meta,
          },
        });

        const bodyParts: string[] = [];
        if (statusChanged) bodyParts.push(`statut → ${STATUS_LABELS[after.status] ?? after.status}`);
        if (priorityChanged) {
          bodyParts.push(after.priority
            ? `priorité → ${PRIORITY_LABELS[after.priority] ?? after.priority}`
            : 'priorité retirée');
        }
        const titleShort = after.title.length > 50 ? after.title.slice(0, 47) + '…' : after.title;
        const actor = ctx.user.id === ownerId ? '' : ` par ${displayName(ctx.user)}`;

        // Si c'est l'owner qui modifie sa propre tâche, pas de push.
        // Sinon (confident), respecter la pref notifyOwnerTaskChanges.
        if (ctx.user.id !== ownerId) {
          sendPushToUser(ctx.db, ownerId, {
            title: `📋 ${titleShort}`,
            body: `${bodyParts.join(' · ')}${actor}`,
            url: '/tasks',
          }, { respectPref: 'notifyOwnerTaskChanges', kind: 'task' }).catch(() => null);
        }
      }

      if (statusChanged) {
        recordAudit(ctx, 'TASK_STATUS_CHANGED', {
          metadata: { from: before.status, to: after.status, title: after.title },
        });
      }

      void emitToOwnerCircle(ctx.db, ownerId, 'task', ctx.user.id).catch(() => null);
      return after;
    }),

  delete: authedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const ownerId = getOwnerId(ctx.user);
      const task = await ctx.db.task.findFirst({ where: { id: input.id, ownerId } });
      if (!task) throw new TRPCError({ code: 'NOT_FOUND' });

      await ctx.db.task.update({
        where: { id: input.id },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      void emitToOwnerCircle(ctx.db, ownerId, 'task', ctx.user.id).catch(() => null);
      recordAudit(ctx, 'TASK_DELETED', { metadata: { title: task.title } });
      return { ok: true };
    }),
});
