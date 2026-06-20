import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, ownerProcedure } from '../trpc.js';

/**
 * Helpers pour propager les modifications de tags vers tous les appareils :
 * on bump `updatedAt` de toutes les entrées concernées → le prochain
 * `sync.pull(since)` les redescend avec le nouveau nom, sans créer de
 * révision (pas de modification de contenu).
 */
async function bumpEntriesForTag(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  ownerId: string,
  tagId: string,
) {
  const entryIds = (
    await db.entryTag.findMany({
      where: { tagId, entry: { authorId: ownerId } },
      select: { entryId: true },
    })
  ).map((et: { entryId: string }) => et.entryId);
  if (entryIds.length === 0) return;
  await db.entry.updateMany({
    where: { id: { in: entryIds } },
    data: { updatedAt: new Date() },
  });
}

export const tagsRouter = router({
  /**
   * Autocomplete léger pour les inputs de tags (preview/composer).
   * Renvoie 30 résultats max, filtré par préfixe insensible à la casse.
   */
  list: ownerProcedure
    .input(z.object({ q: z.string().max(50).optional() }))
    .query(async ({ ctx, input }) => {
      const tags = await ctx.db.tag.findMany({
        where: {
          ownerId: ctx.user.id,
          ...(input.q ? { name: { contains: input.q, mode: 'insensitive' } } : {}),
        },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, kind: true },
        take: 30,
      });
      return tags;
    }),

  /**
   * Liste exhaustive pour l'écran de gestion des tags (Settings → Tags).
   * Inclut le nombre d'entrées rattachées à chaque tag pour permettre des
   * choix éclairés (rename, merge, delete).
   */
  listAll: ownerProcedure.query(async ({ ctx }) => {
    const tags = await ctx.db.tag.findMany({
      where: { ownerId: ctx.user.id },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        kind: true,
        color: true,
        _count: { select: { entries: true } },
      },
    });
    return tags.map((t) => ({
      id: t.id,
      name: t.name,
      kind: t.kind,
      color: t.color,
      entryCount: t._count.entries,
    }));
  }),

  /**
   * Crée un tag manuellement depuis la UI de gestion (sans passer par une
   * note). Pratique pour préparer une nomenclature à l'avance.
   *
   * Refuse les doublons exacts (même nom + même kind) via l'index unique
   * `(ownerId, name, kind)`. La comparaison est insensible à la casse pour
   * éviter qu'un « Vacances » manuel coexiste avec un « vacances » créé via
   * autocomplete.
   */
  create: ownerProcedure
    .input(z.object({
      name: z.string().trim().min(1).max(60),
      kind: z.enum(['EMOTION', 'THEME', 'PERSON', 'PLACE', 'OTHER']).optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const name = input.name.trim();
      const kind = input.kind ?? 'OTHER';
      const existing = await ctx.db.tag.findFirst({
        where: {
          ownerId: ctx.user.id,
          name: { equals: name, mode: 'insensitive' },
          kind,
        },
        select: { id: true, name: true },
      });
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Le tag « ${existing.name} » existe déjà.`,
        });
      }
      const tag = await ctx.db.tag.create({
        data: {
          ownerId: ctx.user.id,
          name,
          kind,
          color: input.color ?? null,
        },
        select: { id: true, name: true, kind: true, color: true },
      });
      return { ...tag, entryCount: 0 };
    }),

  /**
   * Renomme un tag existant. La relation `EntryTag` reste intacte → toutes
   * les notes qui le portaient adoptent automatiquement le nouveau nom, sans
   * qu'on ait à les re-éditer une par une.
   *
   * Refuse le renommage si un autre tag du même owner porte déjà le nouveau
   * nom (pour ne pas violer l'index unique `(ownerId, name, kind)`) → l'UI
   * propose alors un merge à la place.
   */
  update: ownerProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().trim().min(1).max(60),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tag = await ctx.db.tag.findFirst({
        where: { id: input.id, ownerId: ctx.user.id },
        select: { id: true, name: true, kind: true },
      });
      if (!tag) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tag introuvable' });

      const newName = input.name.trim();
      if (newName !== tag.name) {
        const conflict = await ctx.db.tag.findFirst({
          where: {
            ownerId: ctx.user.id,
            name: { equals: newName, mode: 'insensitive' },
            kind: tag.kind,
            id: { not: tag.id },
          },
          select: { id: true, name: true },
        });
        if (conflict) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Un autre tag « ${conflict.name} » existe déjà. Utilise la fusion pour les regrouper.`,
          });
        }
      }

      await ctx.db.tag.update({
        where: { id: tag.id },
        data: {
          name: newName,
          ...(input.color !== undefined ? { color: input.color } : {}),
        },
      });

      // Propage vers les autres appareils via bump d'updatedAt.
      if (newName !== tag.name) {
        await bumpEntriesForTag(ctx.db, ctx.user.id, tag.id);
      }

      return { ok: true };
    }),

  /**
   * Nettoyage en masse des tags **orphelins** (aucune `EntryTag` rattachée).
   *
   * Pourquoi ils existent : le push de sync remplace les `EntryTag` d'une note
   * (deleteMany + createMany) mais ne supprime pas le `Tag` lui-même. Donc
   * dès qu'un utilisateur retire un tag d'une note (ou supprime la note),
   * le Tag survit en orphelin. Idem pour les tags créés par erreur de frappe
   * qui ne sont jamais sauvegardés.
   *
   * On les liste pour transparence dans la UI de gestion, et on offre ici
   * une action de nettoyage en un clic.
   */
  deleteUnused: ownerProcedure.mutation(async ({ ctx }) => {
    const result = await ctx.db.tag.deleteMany({
      where: {
        ownerId: ctx.user.id,
        entries: { none: {} },
      },
    });
    return { ok: true, deleted: result.count };
  }),

  /**
   * Supprime un tag — la relation `EntryTag` est cascadée par Prisma. Les
   * notes restent intactes, simplement détaguées (l'utilisateur ne va pas
   * sur 200 notes pour cliquer "x" sur le tag).
   */
  delete: ownerProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tag = await ctx.db.tag.findFirst({
        where: { id: input.id, ownerId: ctx.user.id },
        select: { id: true },
      });
      if (!tag) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tag introuvable' });

      // Capture les entrées AVANT le cascade pour pouvoir bumper leur updatedAt.
      const entryIds = (
        await ctx.db.entryTag.findMany({
          where: { tagId: tag.id, entry: { authorId: ctx.user.id } },
          select: { entryId: true },
        })
      ).map((et) => et.entryId);

      await ctx.db.tag.delete({ where: { id: tag.id } }); // cascade → EntryTag

      if (entryIds.length > 0) {
        await ctx.db.entry.updateMany({
          where: { id: { in: entryIds } },
          data: { updatedAt: new Date() },
        });
      }

      return { ok: true, entriesAffected: entryIds.length };
    }),

  /**
   * Fusionne `sourceId` dans `targetId` : déplace toutes les liaisons
   * EntryTag(source → ...) vers target, puis supprime le tag source. Utile
   * quand on a accumulé des doublons par typo (« vacances » / « Vacances »
   * / « vacanes »).
   *
   * Idempotent : si une entrée portait DÉJÀ les deux tags, on ne crée pas
   * de doublon (la clé primaire composite `(entryId, tagId)` l'interdit).
   */
  merge: ownerProcedure
    .input(z.object({
      sourceId: z.string(),
      targetId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.sourceId === input.targetId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Source et cible identiques' });
      }

      const [source, target] = await Promise.all([
        ctx.db.tag.findFirst({ where: { id: input.sourceId, ownerId: ctx.user.id }, select: { id: true } }),
        ctx.db.tag.findFirst({ where: { id: input.targetId, ownerId: ctx.user.id }, select: { id: true } }),
      ]);
      if (!source) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tag source introuvable' });
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tag cible introuvable' });

      // Entrées qui portent le source — destinées à recevoir target.
      const sourceLinks = await ctx.db.entryTag.findMany({
        where: { tagId: source.id, entry: { authorId: ctx.user.id } },
        select: { entryId: true },
      });
      const sourceEntryIds = sourceLinks.map((et) => et.entryId);

      if (sourceEntryIds.length > 0) {
        // Crée les liens (entry, target) en sautant les doublons.
        await ctx.db.entryTag.createMany({
          data: sourceEntryIds.map((entryId) => ({ entryId, tagId: target.id })),
          skipDuplicates: true,
        });
      }

      // Supprime le tag source (cascade → EntryTag(source) auto-effacé).
      await ctx.db.tag.delete({ where: { id: source.id } });

      if (sourceEntryIds.length > 0) {
        await ctx.db.entry.updateMany({
          where: { id: { in: sourceEntryIds } },
          data: { updatedAt: new Date() },
        });
      }

      return { ok: true, entriesAffected: sourceEntryIds.length };
    }),
});
