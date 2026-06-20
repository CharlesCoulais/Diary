import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, authedProcedure, ownerProcedure } from '../trpc.js';
import { createNoteTypeDefInput, updateNoteTypeDefInput, reorderNoteTypeDefsInput } from '@carnet/schemas';

/**
 * Types de note personnalisés (NoteTypeDef) définis par l'owner.
 *
 * Lecture (`list`) : owner (les siens) ET confident CONFIDANT (ceux de son
 * invitant, lecture seule) — même résolution de propriété que `contacts`.
 * Écritures (`create`/`update`/`reorder`/`delete`) : owner only.
 *
 * Pour l'owner, les types sont aussi mirrorés dans Dexie via le pull (cf.
 * `sync.pull`) pour fonctionner offline ; ce router sert le confident (sans
 * Dexie) et de fallback. Suppression bloquée tant qu'une note l'utilise.
 */
function noteTypesOwnerId(user: {
  id: string;
  role: string;
  guestAccess: string | null;
  invitedById: string | null;
}): string | null {
  if (user.role === 'OWNER') return user.id;
  if (user.role === 'GUEST' && user.guestAccess === 'CONFIDANT' && user.invitedById) {
    return user.invitedById;
  }
  return null;
}

/** Slug ASCII stable dérivé du libellé (clé interne unique par owner). */
function slugify(label: string): string {
  const s = label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return s || 'type';
}

export const noteTypesRouter = router({
  /** Liste des types custom (owner + confident CONFIDANT), ordonnés. */
  list: authedProcedure.query(async ({ ctx }) => {
    const ownerId = noteTypesOwnerId(ctx.user);
    if (!ownerId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Types non accessibles' });
    return ctx.db.noteTypeDef.findMany({
      where: { ownerId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }),

  /** Nb de notes par type custom (owner only) — pour la page Réglages. */
  usageCounts: ownerProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.entry.groupBy({
      by: ['customTypeId'],
      where: { authorId: ctx.user.id, customTypeId: { not: null }, deletedAt: null },
      _count: { _all: true },
    });
    const out: Record<string, number> = {};
    for (const r of rows) if (r.customTypeId) out[r.customTypeId] = r._count._all;
    return out;
  }),

  /** Crée un type custom (slug unique par owner, ajouté en fin de liste). */
  create: ownerProcedure.input(createNoteTypeDefInput).mutation(async ({ ctx, input }) => {
    const existing = await ctx.db.noteTypeDef.findMany({
      where: { ownerId: ctx.user.id },
      select: { key: true },
    });
    const keys = new Set(existing.map((e) => e.key));
    const base = slugify(input.label);
    let key = base;
    let n = 2;
    while (keys.has(key)) key = `${base}-${n++}`;
    return ctx.db.noteTypeDef.create({
      data: { ...input, key, ownerId: ctx.user.id, sortOrder: existing.length },
    });
  }),

  /** Met à jour un type custom (champs omis = inchangés). Owner only. */
  update: ownerProcedure.input(updateNoteTypeDefInput).mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;
    const res = await ctx.db.noteTypeDef.updateMany({ where: { id, ownerId: ctx.user.id }, data });
    if (res.count === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'Type introuvable' });
    return ctx.db.noteTypeDef.findUniqueOrThrow({ where: { id } });
  }),

  /** Réordonne (sortOrder = position dans `ids`). Owner only. */
  reorder: ownerProcedure.input(reorderNoteTypeDefsInput).mutation(async ({ ctx, input }) => {
    await ctx.db.$transaction(
      input.ids.map((id, index) =>
        ctx.db.noteTypeDef.updateMany({ where: { id, ownerId: ctx.user.id }, data: { sortOrder: index } }),
      ),
    );
    return { ok: true };
  }),

  /** Supprime un type custom — BLOQUÉ tant qu'une note l'utilise. Owner only. */
  delete: ownerProcedure.input(z.object({ id: z.string().min(1).max(64) })).mutation(async ({ ctx, input }) => {
    const used = await ctx.db.entry.count({
      where: { customTypeId: input.id, authorId: ctx.user.id, deletedAt: null },
    });
    if (used > 0) {
      throw new TRPCError({ code: 'CONFLICT', message: `Type utilisé par ${used} note${used > 1 ? 's' : ''}` });
    }
    const res = await ctx.db.noteTypeDef.deleteMany({ where: { id: input.id, ownerId: ctx.user.id } });
    if (res.count === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'Type introuvable' });
    return { ok: true };
  }),
});
