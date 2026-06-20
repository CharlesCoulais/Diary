import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { router, ownerProcedure } from '../trpc.js';

/**
 * Journal d'activité (audit log) — réservé à l'owner.
 *
 * Expose en lecture seule les `AuditLog` produits par toute l'app
 * (connexions, accès confidents, commentaires, changements de sécurité…).
 * Aucune écriture ici : les logs sont créés par les autres routers, jamais
 * modifiés ni supprimés depuis le client.
 */
export const logsRouter = router({
  /** Liste paginée (curseur) des évènements, triés du plus récent au plus ancien. */
  list: ownerProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).default(50),
          cursor: z.string().optional(),
          /** Filtre optionnel sur un sous-ensemble d'actions (ex: les échecs). */
          actions: z.array(z.string()).optional(),
          /** Plage de dates (jour, fuseau UTC) sur `createdAt`. */
          from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          /** Recherche libre : auteur, user-agent, ou titre d'une note. */
          q: z.string().trim().max(200).optional(),
          /** Restreint à l'historique d'une note précise. */
          entryId: z.string().max(64).optional(),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const { limit, cursor, actions, from, to, q, entryId } = input;

      const where: Prisma.AuditLogWhereInput = {};
      if (actions && actions.length) where.action = { in: actions };
      if (entryId) where.entryId = entryId;
      if (from || to) {
        where.createdAt = {
          ...(from ? { gte: new Date(from + 'T00:00:00.000Z') } : {}),
          ...(to ? { lte: new Date(to + 'T23:59:59.999Z') } : {}),
        };
      }
      if (q) {
        // Pré-fetch des notes de l'owner dont le titre matche → filtre par entryId.
        const matchingEntries = await ctx.db.entry.findMany({
          where: { authorId: ctx.user.id, title: { contains: q, mode: 'insensitive' } },
          select: { id: true },
          take: 200,
        });
        const ids = matchingEntries.map((e) => e.id);
        where.OR = [
          { user: { is: { displayName: { contains: q, mode: 'insensitive' } } } },
          { userAgent: { contains: q, mode: 'insensitive' } },
          ...(ids.length ? [{ entryId: { in: ids } }] : []),
        ];
      }

      const rows = await ctx.db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: { user: { select: { displayName: true, role: true } } },
      });

      let nextCursor: string | undefined;
      if (rows.length > limit) {
        nextCursor = rows.pop()!.id;
      }

      // Résout les titres d'entrées concernées en un seul fetch (les entrées
      // supprimées sont simplement absentes de la map).
      const entryIds = [...new Set(rows.map((r) => r.entryId).filter((id): id is string => !!id))];
      const entries = entryIds.length
        ? await ctx.db.entry.findMany({
            where: { id: { in: entryIds } },
            select: { id: true, title: true, date: true },
          })
        : [];
      const entryMap = new Map(entries.map((e) => [e.id, e]));

      return {
        nextCursor,
        items: rows.map((r) => ({
          id: r.id,
          action: r.action,
          createdAt: r.createdAt,
          actorName: r.user?.displayName ?? null,
          actorRole: r.user?.role ?? null,
          entryId: r.entryId,
          entryTitle: r.entryId ? entryMap.get(r.entryId)?.title ?? null : null,
          entryDate: r.entryId ? entryMap.get(r.entryId)?.date ?? null : null,
          metadata: r.metadata as unknown,
          // L'IP est stockée hashée (HMAC) — on n'en renvoie qu'un fragment court
          // pour distinguer les appareils sans jamais exposer le hash complet.
          deviceTag: r.ipHash ? r.ipHash.slice(-6) : null,
          userAgent: r.userAgent,
        })),
      };
    }),

  /** Compteurs par action — alimente les filtres et l'en-tête de la page. */
  stats: ownerProcedure.query(async ({ ctx }) => {
    const grouped = await ctx.db.auditLog.groupBy({
      by: ['action'],
      _count: { action: true },
    });
    const total = grouped.reduce((sum, g) => sum + g._count.action, 0);
    return {
      total,
      byAction: grouped
        .map((g) => ({ action: g.action, count: g._count.action }))
        .sort((a, b) => b.count - a.count),
    };
  }),
});
