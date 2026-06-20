import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, ownerProcedure, authedProcedure } from '../trpc.js';
import { canRead } from '../lib/permissions.js';
import { sendPushToUser } from '../lib/push.js';
import { emitToUser } from '../lib/events.js';

/**
 * Normalise une réponse pour la comparaison d'auto-approbation :
 *  - trim (espaces début/fin)
 *  - lowercase (insensible à la casse)
 *  - retire la ponctuation et les symboles (Unicode `\p{P}` + `\p{S}`)
 *  - retire les diacritiques (« é » ≡ « e ») pour tolérer les accents oubliés
 *  - écrase les espaces internes successifs en un seul
 *
 * Exemple : « Tu dois promettre ! » ≡ « tu dois promettre » ≡ « tu, dois promettre. »
 */
const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // diacritiques (combining marks)
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ')   // ponctuation + symboles → espace
    .replace(/\s+/g, ' ')              // espaces multiples → unique
    .trim();

export const readGateRouter = router({
  respond: authedProcedure
    .input(z.object({ entryId: z.string(), response: z.string().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'GUEST') throw new TRPCError({ code: 'FORBIDDEN' });

      const entry = await ctx.db.entry.findFirst({
        where: { id: input.entryId, deletedAt: null },
        select: {
          id: true,
          readGatePrompt: true,
          readGateAcceptedResponses: true,
          authorId: true,
          visibility: true,
          isSecret: true,
          shares: { select: { receiverId: true, canComment: true } },
        },
      });
      if (!entry?.readGatePrompt) throw new TRPCError({ code: 'NOT_FOUND' });
      if (!canRead(ctx.user, entry)) throw new TRPCError({ code: 'FORBIDDEN' });

      // Logique d'approbation :
      // - Liste non vide ET réponse dans la liste → auto-approuvé
      // - Sinon (liste vide, ou réponse hors liste) → en attente de validation manuelle
      const normalizedInput = normalize(input.response);
      const isAutoApproved =
        entry.readGateAcceptedResponses.length > 0 &&
        entry.readGateAcceptedResponses.some((a) => normalize(a) === normalizedInput);

      const approved: boolean | null = isAutoApproved ? true : null;

      const gateResponse = await ctx.db.readGateResponse.upsert({
        where: { entryId_guestId: { entryId: input.entryId, guestId: ctx.user.id } },
        create: { entryId: input.entryId, guestId: ctx.user.id, response: input.response, approved },
        update: { response: input.response, approved },
        select: { approved: true },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.user.id,
          action: 'read_gate_respond',
          entryId: input.entryId,
          metadata: { response: input.response, autoApproved: isAutoApproved },
        },
      });

      // Notifie l'owner dans les deux cas (validation manuelle attendue OU
      // déverrouillage auto). On distingue via `meta.autoApproved` côté client
      // pour adapter le libellé et zapper les boutons accepter/refuser quand
      // c'est déjà auto.
      const guestName = ctx.user.displayName ?? ctx.user.email;
      try {
        await ctx.db.notification.create({
          data: {
            userId: entry.authorId,
            type: 'READ_GATE_RESPONSE',
            entryId: input.entryId,
            meta: { response: input.response, guestName, autoApproved: isAutoApproved },
          },
        });
      } catch { /* notif non critique, mais à investiguer si ça arrive */ }
      try {
        await sendPushToUser(ctx.db, entry.authorId, {
          title: isAutoApproved ? 'Verrou déverrouillé ✦' : 'Réponse au verrou de lecture',
          body: isAutoApproved
            ? `${guestName} a déverrouillé : "${input.response.slice(0, 80)}"`
            : `${guestName} a répondu : "${input.response.slice(0, 80)}"`,
          url: `/?entryId=${input.entryId}`,
        }, { respectPref: 'notifyOwnerReadGate', kind: 'readGate' });
      } catch { /* push non critique */ }
      // SSE 'entry' → ReadGateReviewSection côté owner se rafraîchit (la query
      // listForEntry est invalidée via le Bridge) sans devoir recharger la page.
      emitToUser(entry.authorId, 'entry');

      return { approved: gateResponse.approved };
    }),

  decide: ownerProcedure
    .input(z.object({ entryId: z.string(), guestId: z.string(), approved: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db.entry.findFirst({
        where: { id: input.entryId, authorId: ctx.user.id, deletedAt: null },
        select: { id: true, readGatePrompt: true },
      });
      if (!entry) throw new TRPCError({ code: 'NOT_FOUND' });

      // Récupère la réponse pour pouvoir la mentionner dans la notif au confident
      const previous = await ctx.db.readGateResponse.findUnique({
        where: { entryId_guestId: { entryId: input.entryId, guestId: input.guestId } },
        select: { response: true, approved: true },
      });

      await ctx.db.readGateResponse.update({
        where: { entryId_guestId: { entryId: input.entryId, guestId: input.guestId } },
        data: { approved: input.approved },
      });

      // Notifie le confident de la décision (in-app + push, sauf si déjà dans le
      // même état — évite de spammer si l'owner clique deux fois sur Accepter)
      if (previous && previous.approved !== input.approved) {
        const ownerName = ctx.user.displayName ?? ctx.user.email;
        try {
          await ctx.db.notification.create({
            data: {
              userId: input.guestId,
              type: 'READ_GATE_DECIDED',
              entryId: input.entryId,
              meta: { approved: input.approved, response: previous.response, ownerName },
            },
          });
        } catch { /* notif non critique */ }
        try {
          await sendPushToUser(ctx.db, input.guestId, {
            title: input.approved ? 'Accès accordé ✦' : 'Accès refusé',
            body: input.approved
              ? `${ownerName} a accepté ta réponse au verrou.`
              : `${ownerName} a refusé ta réponse au verrou.`,
            url: `/?entryId=${input.entryId}`,
          }, { respectPref: 'notifyOnReadGateDecision', kind: 'readGate' });
        } catch { /* push non critique */ }
        // SSE 'entry' → le client confident invalide `entries.list` côté Bridge
        // et reçoit immédiatement le nouveau contenu (déverrouillé ou caché).
        emitToUser(input.guestId, 'entry');
      }

      return { ok: true };
    }),

  /**
   * Retourne, pour chaque entry verrouillée de l'owner, le set agrégé des
   * statuts des réponses reçues (entre 0 et N confidents).
   *
   * Utilisé côté Home / Timeline pour filtrer les notes verrouillées par
   * statut (accepté / refusé / en attente / non répondu).
   *
   * Format : { [entryId]: ('approved' | 'rejected' | 'pending')[] }
   * Les entries sans aucune réponse n'apparaissent pas dans la map — le client
   * les déduit en croisant avec ses entries verrouillées locales (statut
   * « non répondu »).
   */
  statusesForOwner: ownerProcedure
    .query(async ({ ctx }) => {
      const responses = await ctx.db.readGateResponse.findMany({
        where: { entry: { authorId: ctx.user.id, deletedAt: null } },
        select: { entryId: true, approved: true },
      });
      const map: Record<string, ('approved' | 'rejected' | 'pending')[]> = {};
      for (const r of responses) {
        const status = r.approved === true ? 'approved' : r.approved === false ? 'rejected' : 'pending';
        if (!map[r.entryId]) map[r.entryId] = [];
        if (!map[r.entryId]!.includes(status)) map[r.entryId]!.push(status);
      }
      return map;
    }),

  listForEntry: ownerProcedure
    .input(z.object({ entryId: z.string() }))
    .query(async ({ ctx, input }) => {
      const entry = await ctx.db.entry.findFirst({
        where: { id: input.entryId, authorId: ctx.user.id, deletedAt: null },
        select: { id: true },
      });
      if (!entry) throw new TRPCError({ code: 'NOT_FOUND' });

      const responses = await ctx.db.readGateResponse.findMany({
        where: { entryId: input.entryId },
        include: { guest: { select: { id: true, displayName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      });

      return responses.map((r) => ({
        guestId: r.guestId,
        guestName: r.guest.displayName ?? r.guest.email,
        response: r.response,
        approved: r.approved,
        createdAt: r.createdAt,
      }));
    }),
});
