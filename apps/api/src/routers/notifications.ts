import { z } from 'zod';
import webpush from 'web-push';
import { TRPCError } from '@trpc/server';
import { router, authedProcedure } from '../trpc.js';
import { VAPID_PUBLIC } from '../lib/push.js';
import { canRead } from '../lib/permissions.js';

/**
 * Include partagé entre `list` et `listArchived`.
 * On récupère en plus visibility / isSecret / authorId / shares sur l'entry
 * (et sur comment.entry) — pas pour les exposer au client (les selects
 * client-side ne les incluent pas), mais pour appliquer `canRead` côté
 * guest après fetch (cf. `redactNotifForGuest`).
 */
const NOTIF_INCLUDE = {
  comment: {
    select: {
      id: true,
      content: true,
      anchorText: true,
      parentId: true,
      author: { select: { id: true, displayName: true, email: true } },
      entry: {
        select: {
          id: true, date: true, noteType: true, title: true, mediaMeta: true,
          // Champs de permission (cf. canRead) — utilisés post-fetch.
          authorId: true, visibility: true, isSecret: true,
          shares: { select: { receiverId: true, canComment: true } },
        },
      },
    },
  },
  entry: {
    select: {
      id: true, date: true, noteType: true, title: true, mediaMeta: true,
      authorId: true, visibility: true, isSecret: true,
      shares: { select: { receiverId: true, canComment: true } },
    },
  },
  task: {
    select: { id: true, title: true, status: true, priority: true, deletedAt: true },
  },
} as const;

/**
 * Si la viewer est un guest qui n'a plus accès à l'entry liée à la notif
 * (l'owner l'a passée en PRIVATE / Secret après coup), on neutralise les
 * champs sensibles (titre, mediaMeta, contenu du comment). La notif reste
 * affichée comme historique, mais sans données qui ne devraient plus être
 * visibles.
 *
 * Source unique : `canRead` (lib/permissions). Pas de duplication ici.
 */
type PermEntry = {
  authorId: string;
  visibility: 'PRIVATE' | 'SHARED_ALL' | 'SHARED_SPECIFIC';
  isSecret: boolean;
  shares: { receiverId: string; canComment: boolean }[];
  title: string | null;
  mediaMeta: unknown;
};

function redactNotifForGuest<N extends {
  comment: null | { content: string | null; anchorText: string | null; entry: null | PermEntry };
  entry: null | PermEntry;
}>(notif: N, viewer: { id: string; role: 'OWNER' | 'GUEST'; guestAccess: 'ALL' | 'SPECIFIC' | 'CONFIDANT' | null; guestCanComment: boolean }): N {
  if (viewer.role === 'OWNER') return notif;

  const redactEntry = (e: PermEntry): PermEntry => {
    if (canRead(viewer, e)) return e;
    return { ...e, title: null, mediaMeta: null };
  };

  let out = notif;
  if (notif.entry) out = { ...out, entry: redactEntry(notif.entry) };
  if (notif.comment?.entry) {
    const visible = canRead(viewer, notif.comment.entry);
    out = {
      ...out,
      comment: visible
        ? notif.comment
        : { ...notif.comment, content: '', anchorText: null, entry: redactEntry(notif.comment.entry) },
    };
  }
  return out;
}

export const notificationsRouter = router({
  list: authedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const [notifications, unreadCount] = await Promise.all([
        ctx.db.notification.findMany({
          where: { userId: ctx.user.id, archived: false },
          include: NOTIF_INCLUDE,
          orderBy: { createdAt: 'desc' },
          take: input.limit,
        }),
        ctx.db.notification.count({ where: { userId: ctx.user.id, read: false, archived: false } }),
      ]);
      return {
        notifications: notifications.map((n) => redactNotifForGuest(n, ctx.user)),
        unreadCount,
      };
    }),

  markRead: authedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.notification.updateMany({
        where: { id: input.id, userId: ctx.user.id },
        data: { read: true },
      });
      return { ok: true };
    }),

  markAllRead: authedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.notification.updateMany({
      where: { userId: ctx.user.id, read: false, archived: false },
      data: { read: true },
    });
    return { ok: true };
  }),

  archive: authedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.notification.updateMany({
        where: { id: input.id, userId: ctx.user.id },
        data: { archived: true },
      });
      return { ok: true };
    }),

  archiveAllRead: authedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.notification.updateMany({
      where: { userId: ctx.user.id, read: true, archived: false },
      data: { archived: true },
    });
    return { ok: true };
  }),

  listArchived: authedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const notifications = await ctx.db.notification.findMany({
        where: { userId: ctx.user.id, archived: true },
        include: NOTIF_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: input.limit,
      });
      return {
        notifications: notifications.map((n) => redactNotifForGuest(n, ctx.user)),
      };
    }),

  unarchive: authedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.notification.updateMany({
        where: { id: input.id, userId: ctx.user.id },
        data: { archived: false },
      });
      return { ok: true };
    }),

  unreadCount: authedProcedure.query(async ({ ctx }) => {
    const count = await ctx.db.notification.count({
      where: { userId: ctx.user.id, read: false, archived: false },
    });
    return { count };
  }),

  getSettings: authedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.user.id },
      select: {
        notifEnabled: true,
        notifReminderTime: true,
        dailyLogReminderAt: true,
        notifyOnNewEntry: true,
        notifyEntryTypes: true,
        notifyOnTaskUpdate: true,
        notifyOnRequestTreated: true,
        notifyMessages: true,
        notifyOwnerComments: true,
        notifyOwnerReactions: true,
        notifyOwnerTaskChanges: true,
        notifyOwnerRequests: true,
        notifyOwnerSecurity: true,
        notifyOwnerReadGate: true,
        notifyOnReadGateDecision: true,
        notifyOnCapsuleUnlock: true,
        pushDiscreet: true,
        pushDiscreetTitle: true,
        pushDiscreetBody: true,
        pushDiscreetIcon: true,
        pushDiscreetScheduled: true,
        pushDiscreetSchedule: true,
        pushSilent: true,
        pushSilentSchedule: true,
        pushImportantKinds: true,
        timezone: true,
        pauseGuestPush: true,
      },
    });
    return {
      enabled: user?.notifEnabled ?? false,
      reminderTime: user?.notifReminderTime ?? null,
      dailyLogReminderAt: user?.dailyLogReminderAt ?? null,
      notifyOnNewEntry: user?.notifyOnNewEntry ?? false,
      notifyEntryTypes: user?.notifyEntryTypes ?? [],
      notifyOnTaskUpdate: user?.notifyOnTaskUpdate ?? true,
      notifyOnRequestTreated: user?.notifyOnRequestTreated ?? true,
      notifyMessages: user?.notifyMessages ?? true,
      notifyOwnerComments: user?.notifyOwnerComments ?? true,
      notifyOwnerReactions: user?.notifyOwnerReactions ?? true,
      notifyOwnerTaskChanges: user?.notifyOwnerTaskChanges ?? true,
      notifyOwnerRequests: user?.notifyOwnerRequests ?? true,
      notifyOwnerSecurity: user?.notifyOwnerSecurity ?? true,
      notifyOwnerReadGate: user?.notifyOwnerReadGate ?? true,
      notifyOnReadGateDecision: user?.notifyOnReadGateDecision ?? true,
      notifyOnCapsuleUnlock: user?.notifyOnCapsuleUnlock ?? true,
      pushDiscreet: user?.pushDiscreet ?? false,
      pushDiscreetTitle: user?.pushDiscreetTitle ?? null,
      pushDiscreetBody: user?.pushDiscreetBody ?? null,
      pushDiscreetIcon: user?.pushDiscreetIcon ?? null,
      pushDiscreetScheduled: user?.pushDiscreetScheduled ?? false,
      pushDiscreetSchedule: (user?.pushDiscreetSchedule ?? []) as { days: number[]; from: string; to: string }[],
      pushSilent: user?.pushSilent ?? false,
      pushSilentSchedule: (user?.pushSilentSchedule ?? []) as { days: number[]; from: string; to: string }[],
      pushImportantKinds: user?.pushImportantKinds ?? ['security'],
      timezone: user?.timezone ?? null,
      pauseGuestPush: user?.pauseGuestPush ?? false,
    };
  }),

  saveSettings: authedProcedure
    .input(z.object({
      enabled: z.boolean(),
      reminderTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
      dailyLogReminderAt: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
      notifyOnNewEntry: z.boolean().optional(),
      notifyEntryTypes: z.array(z.enum(['JOURNAL', 'BOOK', 'SERIES', 'MOVIE', 'MUSIC', 'OUTING', 'SHOPPING', 'DEV', 'QUIZZ', 'AGENDA', 'FINANCE'])).optional(),
      notifyOnTaskUpdate: z.boolean().optional(),
      notifyOnRequestTreated: z.boolean().optional(),
      notifyMessages: z.boolean().optional(),
      notifyOwnerComments: z.boolean().optional(),
      notifyOwnerReactions: z.boolean().optional(),
      notifyOwnerTaskChanges: z.boolean().optional(),
      notifyOwnerRequests: z.boolean().optional(),
      notifyOwnerSecurity: z.boolean().optional(),
      notifyOwnerReadGate: z.boolean().optional(),
      notifyOnReadGateDecision: z.boolean().optional(),
      notifyOnCapsuleUnlock: z.boolean().optional(),
      pushDiscreet: z.boolean().optional(),
      pushDiscreetTitle: z.string().max(60).nullable().optional(),
      pushDiscreetBody: z.string().max(120).nullable().optional(),
      pushDiscreetIcon: z.enum(['bell', 'cloud', 'note', 'calendar', 'chat']).nullable().optional(),
      pushDiscreetScheduled: z.boolean().optional(),
      pushDiscreetSchedule: z.array(z.object({
        days: z.array(z.number().int().min(0).max(6)),
        from: z.string().regex(/^\d{2}:\d{2}$/),
        to: z.string().regex(/^\d{2}:\d{2}$/),
      })).optional(),
      pushSilent: z.boolean().optional(),
      pushSilentSchedule: z.array(z.object({
        days: z.array(z.number().int().min(0).max(6)),
        from: z.string().regex(/^\d{2}:\d{2}$/),
        to: z.string().regex(/^\d{2}:\d{2}$/),
      })).optional(),
      pushImportantKinds: z.array(z.enum(['comment', 'reaction', 'task', 'request', 'entry', 'message', 'security', 'readGate', 'capsule'])).optional(),
      timezone: z.string().max(64).optional(),
      pauseGuestPush: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.user.update({
        where: { id: ctx.user.id },
        data: {
          notifEnabled: input.enabled,
          notifReminderTime: input.reminderTime,
          ...(input.dailyLogReminderAt !== undefined ? { dailyLogReminderAt: input.dailyLogReminderAt } : {}),
          ...(input.notifyOnNewEntry !== undefined ? { notifyOnNewEntry: input.notifyOnNewEntry } : {}),
          ...(input.notifyEntryTypes !== undefined ? { notifyEntryTypes: input.notifyEntryTypes } : {}),
          ...(input.notifyOnTaskUpdate !== undefined ? { notifyOnTaskUpdate: input.notifyOnTaskUpdate } : {}),
          ...(input.notifyOnRequestTreated !== undefined ? { notifyOnRequestTreated: input.notifyOnRequestTreated } : {}),
          ...(input.notifyMessages !== undefined ? { notifyMessages: input.notifyMessages } : {}),
          ...(input.notifyOwnerComments !== undefined ? { notifyOwnerComments: input.notifyOwnerComments } : {}),
          ...(input.notifyOwnerReactions !== undefined ? { notifyOwnerReactions: input.notifyOwnerReactions } : {}),
          ...(input.notifyOwnerTaskChanges !== undefined ? { notifyOwnerTaskChanges: input.notifyOwnerTaskChanges } : {}),
          ...(input.notifyOwnerRequests !== undefined ? { notifyOwnerRequests: input.notifyOwnerRequests } : {}),
          ...(input.notifyOwnerSecurity !== undefined ? { notifyOwnerSecurity: input.notifyOwnerSecurity } : {}),
          ...(input.notifyOwnerReadGate !== undefined ? { notifyOwnerReadGate: input.notifyOwnerReadGate } : {}),
          ...(input.notifyOnReadGateDecision !== undefined ? { notifyOnReadGateDecision: input.notifyOnReadGateDecision } : {}),
          ...(input.notifyOnCapsuleUnlock !== undefined ? { notifyOnCapsuleUnlock: input.notifyOnCapsuleUnlock } : {}),
          ...(input.pushDiscreet !== undefined ? { pushDiscreet: input.pushDiscreet } : {}),
          ...(input.pushDiscreetTitle !== undefined ? { pushDiscreetTitle: input.pushDiscreetTitle } : {}),
          ...(input.pushDiscreetBody !== undefined ? { pushDiscreetBody: input.pushDiscreetBody } : {}),
          ...(input.pushDiscreetIcon !== undefined ? { pushDiscreetIcon: input.pushDiscreetIcon } : {}),
          ...(input.pushDiscreetScheduled !== undefined ? { pushDiscreetScheduled: input.pushDiscreetScheduled } : {}),
          ...(input.pushDiscreetSchedule !== undefined ? { pushDiscreetSchedule: input.pushDiscreetSchedule } : {}),
          ...(input.pushSilent !== undefined ? { pushSilent: input.pushSilent } : {}),
          ...(input.pushSilentSchedule !== undefined ? { pushSilentSchedule: input.pushSilentSchedule } : {}),
          ...(input.pushImportantKinds !== undefined ? { pushImportantKinds: input.pushImportantKinds } : {}),
          ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
          ...(input.pauseGuestPush !== undefined ? { pauseGuestPush: input.pauseGuestPush } : {}),
        },
      });
      return { ok: true };
    }),

  /**
   * Vérifie qu'un endpoint donné est toujours enregistré côté serveur.
   * Permet à l'app de détecter une subscription invalidée par le push service.
   */
  checkSubscription: authedProcedure
    .input(z.object({ endpoint: z.string().url() }))
    .query(async ({ ctx, input }) => {
      const sub = await ctx.db.pushSubscription.findFirst({
        where: { userId: ctx.user.id, endpoint: input.endpoint },
        select: { id: true },
      });
      return { alive: !!sub };
    }),

  subscribe: authedProcedure
    .input(z.object({
      endpoint: z.string().url(),
      p256dh: z.string(),
      auth: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userAgent = ctx.userAgent ?? undefined;
      // Vérifier que l'endpoint n'appartient pas déjà à un autre utilisateur
      const existing = await ctx.db.pushSubscription.findUnique({
        where: { endpoint: input.endpoint },
        select: { userId: true },
      });
      if (existing && existing.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Endpoint déjà enregistré par un autre utilisateur.' });
      }
      await ctx.db.pushSubscription.upsert({
        where: { endpoint: input.endpoint },
        create: {
          id: crypto.randomUUID(),
          userId: ctx.user.id,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
          userAgent,
        },
        update: { p256dh: input.p256dh, auth: input.auth },
      });
      await ctx.db.user.update({
        where: { id: ctx.user.id },
        data: { notifEnabled: true },
      });
      return { ok: true };
    }),

  unsubscribe: authedProcedure
    .input(z.object({ endpoint: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.pushSubscription.deleteMany({
        where: { endpoint: input.endpoint, userId: ctx.user.id },
      });
      return { ok: true };
    }),

  vapidPublicKey: authedProcedure.query(() => ({ key: VAPID_PUBLIC })),

  sendTest: authedProcedure.mutation(async ({ ctx }) => {
    const subs = await ctx.db.pushSubscription.findMany({ where: { userId: ctx.user.id } });
    if (!subs.length) return { ok: false, reason: 'no_subscription' };
    if (!VAPID_PUBLIC) return { ok: false, reason: 'no_vapid' };
    const payload = JSON.stringify({ title: 'Test Journal', body: 'Push bien reçu ✦', url: '/', timestamp: Date.now() });
    let sent = 0;
    let lastError = '';
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        sent++;
      } catch (e: unknown) {
        lastError = e instanceof Error ? e.message : String(e);
        if ((e as { statusCode?: number }).statusCode === 410) {
          await ctx.db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => null);
        }
      }
    }
    return { ok: sent > 0, error: lastError || undefined };
  }),
});
