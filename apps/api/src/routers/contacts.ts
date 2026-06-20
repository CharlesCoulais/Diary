import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, authedProcedure, ownerProcedure } from '../trpc.js';

/**
 * Carnet d'adresses de l'owner (page /contacts). Données de référence — PAS des
 * notes de journal : pas de sync Dexie, lecture serveur pour l'owner ET le
 * confident CONFIDANT (en lecture seule). Seul l'owner crée/édite/supprime.
 *
 * Résolution de propriété : l'owner lit son propre carnet ; un confident
 * CONFIDANT lit celui de son invitant (`invitedById`). Tout autre cas → refus
 * (jamais de filtrage silencieux, cf. règle d'autorisation du projet).
 */
function contactsOwnerId(user: {
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

/** Normalise un champ optionnel : trim + chaîne vide → null. */
const norm = (s: string | undefined | null): string | null => {
  const t = s?.trim();
  return t ? t : null;
};

const upsertInput = z.object({
  id: z.string().min(1).max(64).optional(),
  firstName: z.string().max(120).optional(),
  lastName: z.string().max(120).optional(),
  relation: z.string().max(80).optional(),
  phone: z.string().max(60).optional(),
  email: z.string().max(200).optional(),
  address: z.string().max(400).optional(),
  notes: z.string().max(2000).optional(),
  birthday: z.string().max(10).optional(), // "YYYY-MM-DD" ou "" (normalisé côté handler)
});

export const contactsRouter = router({
  /** Liste du carnet (owner + confident CONFIDANT), triée nom puis prénom. */
  list: authedProcedure.query(async ({ ctx }) => {
    const ownerId = contactsOwnerId(ctx.user);
    if (!ownerId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Carnet non accessible' });
    return ctx.db.contact.findMany({
      where: { ownerId },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { createdAt: 'asc' }],
    });
  }),

  /** Crée (sans `id`) ou met à jour (avec `id`) un contact. Owner only. */
  upsert: ownerProcedure.input(upsertInput).mutation(async ({ ctx, input }) => {
    const firstName = norm(input.firstName) ?? '';
    const lastName = norm(input.lastName) ?? '';
    if (!firstName && !lastName) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Indique au moins un nom ou un prénom' });
    }
    const data = {
      firstName,
      lastName,
      relation: norm(input.relation),
      phone: norm(input.phone),
      email: norm(input.email),
      address: norm(input.address),
      notes: norm(input.notes),
      // anniversaire : on ne garde que le format ISO strict, sinon null
      birthday: /^\d{4}-\d{2}-\d{2}$/.test(input.birthday ?? '') ? input.birthday! : null,
    };

    if (input.id) {
      // `updateMany` borné à l'owner : un id qui n'est pas le sien ne touche rien.
      const res = await ctx.db.contact.updateMany({
        where: { id: input.id, ownerId: ctx.user.id },
        data,
      });
      if (res.count === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'Contact introuvable' });
      return ctx.db.contact.findUniqueOrThrow({ where: { id: input.id } });
    }

    return ctx.db.contact.create({ data: { ...data, ownerId: ctx.user.id } });
  }),

  /** Supprime un contact. Owner only. */
  delete: ownerProcedure.input(z.object({ id: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const res = await ctx.db.contact.deleteMany({ where: { id: input.id, ownerId: ctx.user.id } });
    if (res.count === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'Contact introuvable' });
    return { ok: true };
  }),
});
