import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { passwordSchema } from '@carnet/schemas';
import { randomBytes, createHash, randomInt } from 'crypto';
import { router, ownerProcedure, authedProcedure, publicProcedure } from '../trpc.js';
import { hashPassword } from '../auth/password.js';
import { createSession } from '../auth/session.js';
import { setSessionCookie } from '../auth/cookies.js';

/**
 * Génère un mot de passe temporaire lisible :
 *   - 10 caractères
 *   - Alphabet sans ambiguïté (pas de 0/O, 1/l/I, etc.)
 *   - Mix maj + min + chiffres pour rester robuste
 *
 * Le résultat est destiné à être lu / dicté / copié — pas à être tapé
 * à l'aveugle ; pas d'objectif de mémorisation (l'utilisateur en choisira
 * un définitif au prochain login).
 */
function generateReadablePassword(): string {
  const alphabet = 'abcdefghkmnpqrstuvwxyzABCDEFGHKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 10; i++) {
    out += alphabet[randomInt(alphabet.length)];
  }
  return out;
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export const guestsRouter = router({
  /** Liste les guests actifs et invitations en attente. */
  list: ownerProcedure.query(async ({ ctx }) => {
    const [guests, invitations] = await Promise.all([
      ctx.db.user.findMany({
        where: { role: 'GUEST', invitedById: ctx.user.id, revokedAt: null },
        select: {
          id: true,
          email: true,
          displayName: true,
          guestAccess: true,
          guestCanComment: true,
          guestCanViewCalendar: true,
          guestCanViewAgenda: true,
          guestCanViewBudget: true,
          invitedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      ctx.db.invitation.findMany({
        where: { invitedById: ctx.user.id, acceptedAt: null, revokedAt: null },
        select: { id: true, email: true, guestAccess: true, canComment: true, expiresAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { guests, invitations };
  }),

  /**
   * Personnes mentionnables (@) par le viewer, pour l'autocomplétion :
   *  - Owner → ses confidents actifs.
   *  - Guest → l'owner qui l'a invité + ses confidents frères (hors soi-même).
   * Renvoie de quoi afficher + insérer le token `[@Nom](mention:id)`.
   */
  listMentionable: authedProcedure.query(async ({ ctx }) => {
    const ownerId = ctx.user.role === 'OWNER' ? ctx.user.id : ctx.user.invitedById;
    if (!ownerId) return [];

    const [owner, guests] = await Promise.all([
      ctx.db.user.findUnique({
        where: { id: ownerId },
        select: { id: true, displayName: true, email: true, role: true },
      }),
      ctx.db.user.findMany({
        where: { role: 'GUEST', invitedById: ownerId, revokedAt: null },
        select: { id: true, displayName: true, email: true, role: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const all = [owner, ...guests].filter((u): u is NonNullable<typeof u> => !!u);
    // Le viewer ne se mentionne pas lui-même.
    return all.filter((u) => u.id !== ctx.user.id);
  }),

  /** Crée une invitation — retourne le token en clair (à inclure dans le lien). */
  invite: ownerProcedure
    .input(z.object({
      email: z.string().email(),
      guestAccess: z.enum(['ALL', 'SPECIFIC', 'CONFIDANT']).default('ALL'),
      canComment: z.boolean().default(true),
      canViewCalendar: z.boolean().default(false),
      canViewAgenda: z.boolean().default(false),
      canViewBudget: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.user.findUnique({ where: { email: input.email }, select: { id: true } });
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Cet email est déjà utilisé.' });

      const token = randomBytes(32).toString('hex');
      await ctx.db.invitation.create({
        data: {
          email: input.email,
          tokenHash: hashToken(token),
          guestAccess: input.guestAccess,
          canComment: input.canComment,
          canViewCalendar: input.guestAccess === 'CONFIDANT' ? input.canViewCalendar : false,
          canViewAgenda: input.guestAccess === 'CONFIDANT' ? input.canViewAgenda : false,
          canViewBudget: input.guestAccess === 'CONFIDANT' ? input.canViewBudget : false,
          invitedById: ctx.user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      return { token };
    }),

  /**
   * Révoque l'accès d'un guest existant (soft-delete).
   *
   * Pourquoi soft-delete et pas `user.delete` :
   *   - Le cascade-delete supprimait tous les Comments / Reactions /
   *     EntryRating / ReadGateResponse du confident, faisant disparaître
   *     l'historique de leurs interactions (visible côté owner).
   *   - Pour un journal "intime à partager", c'est trop destructif.
   *
   * Sécurité : on marque `revokedAt`, on supprime toutes les sessions, et
   * on s'appuie sur les guards d'auth (`auth.login` rejette les users
   * `revokedAt != null`). Les queries qui listent / utilisent les guests
   * doivent filtrer `revokedAt: null` (cf. helper interne).
   */
  revokeGuest: ownerProcedure
    .input(z.object({ guestId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const guest = await ctx.db.user.findFirst({
        where: { id: input.guestId, role: 'GUEST', invitedById: ctx.user.id, revokedAt: null },
        select: { id: true },
      });
      if (!guest) throw new TRPCError({ code: 'NOT_FOUND' });
      await ctx.db.session.deleteMany({ where: { userId: input.guestId } });
      await ctx.db.user.update({
        where: { id: input.guestId },
        data: { revokedAt: new Date() },
      });
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.user.id,
          action: 'GUEST_REVOKED',
          ipHash: ctx.ipHash,
          userAgent: ctx.userAgent,
          metadata: { revokedGuestId: input.guestId },
        },
      });
      return { ok: true };
    }),

  /**
   * Régénère un mot de passe temporaire pour un confident.
   *
   * Cas d'usage : le confident a oublié son mdp. Plutôt qu'un flow email
   * (overkill pour un journal perso, ouverture potentielle à du phishing
   * et complexité d'infra), l'owner régénère un mdp aléatoire qu'il
   * communique au confident via le canal de confiance déjà existant
   * (SMS, IRL, chat privé).
   *
   * Effets :
   *   1. Génère un mot de passe lisible (10 chars sans ambiguïté)
   *   2. Hash + écrit sur User.passwordHash
   *   3. Mark `mustChangePassword: true` — l'app forcera l'écran de
   *      changement au prochain login
   *   4. Invalide toutes les sessions actives du confident
   *   5. Retourne le mdp en CLAIR une seule fois — c'est à l'owner de
   *      le noter / copier immédiatement, jamais re-fetchable
   *
   * Sécurité :
   *   - Owner only (ownerProcedure)
   *   - Vérifie que le guest appartient bien à cet owner
   *   - Ignore les confidents revokedAt (soft-deleted)
   *   - AuditLog créé pour traçabilité
   */
  regeneratePassword: ownerProcedure
    .input(z.object({ guestId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const guest = await ctx.db.user.findFirst({
        where: { id: input.guestId, role: 'GUEST', invitedById: ctx.user.id, revokedAt: null },
        select: { id: true, email: true },
      });
      if (!guest) throw new TRPCError({ code: 'NOT_FOUND' });

      const plainPassword = generateReadablePassword();
      const passwordHash = await hashPassword(plainPassword);

      await ctx.db.$transaction([
        ctx.db.user.update({
          where: { id: guest.id },
          data: { passwordHash, mustChangePassword: true },
        }),
        ctx.db.session.deleteMany({ where: { userId: guest.id } }),
      ]);

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.user.id,
          action: 'GUEST_PASSWORD_REGENERATED',
          ipHash: ctx.ipHash,
          userAgent: ctx.userAgent,
          metadata: { targetGuestId: guest.id, targetEmail: guest.email },
        },
      });

      return { password: plainPassword };
    }),

  /** Met à jour le niveau d'accès d'un guest existant. */
  updateGuest: ownerProcedure
    .input(z.object({
      guestId: z.string().cuid(),
      guestAccess: z.enum(['ALL', 'SPECIFIC', 'CONFIDANT']),
      guestCanComment: z.boolean(),
      guestCanViewCalendar: z.boolean().default(false),
      guestCanViewAgenda: z.boolean().default(false),
      guestCanViewBudget: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const guest = await ctx.db.user.findFirst({
        where: { id: input.guestId, role: 'GUEST', invitedById: ctx.user.id, revokedAt: null },
        select: { id: true },
      });
      if (!guest) throw new TRPCError({ code: 'NOT_FOUND' });
      const isConfidant = input.guestAccess === 'CONFIDANT';
      await ctx.db.user.update({
        where: { id: input.guestId },
        data: {
          guestAccess: input.guestAccess,
          guestCanComment: isConfidant ? true : input.guestCanComment,
          guestCanViewCalendar: isConfidant ? input.guestCanViewCalendar : false,
          guestCanViewAgenda: isConfidant ? input.guestCanViewAgenda : false,
          guestCanViewBudget: isConfidant ? input.guestCanViewBudget : false,
        },
      });
      return { ok: true };
    }),

  /** Annule une invitation en attente. */
  revokeInvitation: ownerProcedure
    .input(z.object({ invitationId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.invitation.updateMany({
        where: { id: input.invitationId, invitedById: ctx.user.id },
        data: { revokedAt: new Date() },
      });
      return { ok: true };
    }),

  /** Infos de l'invitation pour pré-remplir le formulaire d'inscription. */
  invitationInfo: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const inv = await ctx.db.invitation.findUnique({
        where: { tokenHash: hashToken(input.token) },
        select: { email: true, expiresAt: true, acceptedAt: true, revokedAt: true },
      });
      if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt < new Date()) return null;
      return { email: inv.email };
    }),

  /** Inscription du guest via le lien d'invitation. */
  accept: publicProcedure
    .input(z.object({
      token: z.string(),
      displayName: z.string().min(1).max(100).trim(),
      password: passwordSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      // Pré-vérification pour retourner des erreurs lisibles avant la transaction
      const inv = await ctx.db.invitation.findUnique({
        where: { tokenHash: hashToken(input.token) },
      });
      if (!inv || inv.revokedAt) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation invalide ou expirée.' });
      }
      if (inv.expiresAt < new Date()) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Invitation expirée.' });
      }
      if (inv.acceptedAt) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Invitation déjà utilisée.' });
      }

      // hashPassword est coûteux (argon2id) — on le fait hors transaction
      const passwordHash = await hashPassword(input.password);
      const tokenHash = hashToken(input.token);

      // Transaction atomique : updateMany avec acceptedAt = null comme verrou optimiste.
      // Si count = 0, une autre requête concurrente a accepté l'invitation en même temps.
      const user = await ctx.db.$transaction(async (tx) => {
        const { count } = await tx.invitation.updateMany({
          where: { tokenHash, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
          data: { acceptedAt: new Date() },
        });
        if (count === 0) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Invitation déjà utilisée.' });
        }
        return tx.user.create({
          data: {
            email: inv.email,
            passwordHash,
            role: 'GUEST',
            displayName: input.displayName,
            guestAccess: inv.guestAccess,
            guestCanComment: inv.canComment,
            guestCanViewCalendar: inv.canViewCalendar,
            guestCanViewAgenda: inv.canViewAgenda,
            guestCanViewBudget: inv.canViewBudget,
            invitedById: inv.invitedById,
            invitedAt: new Date(),
          },
        });
      });

      const { token: sessionToken, expiresAt } = await createSession({
        userId: user.id,
        role: user.role,
        userAgent: ctx.userAgent ?? undefined,
        ipHash: ctx.ipHash ?? undefined,
      });
      setSessionCookie(ctx.res, sessionToken, expiresAt);

      await ctx.db.auditLog.create({
        data: {
          userId: user.id,
          action: 'GUEST_ACCEPTED',
          ipHash: ctx.ipHash,
          userAgent: ctx.userAgent,
          metadata: { invitedById: inv.invitedById, email: inv.email },
        },
      });

      return { user: { id: user.id, email: user.email, role: user.role as string, displayName: user.displayName } };
    }),
});
