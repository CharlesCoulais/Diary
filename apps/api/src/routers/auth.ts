import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { loginInput, registerInput, passwordSchema } from '@carnet/schemas';
import { router, publicProcedure, authedProcedure, ownerProcedure } from '../trpc.js';
import { randomBytes, createHash } from 'crypto';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { createSession, revokeSession, revokeAllUserSessions } from '../auth/session.js';
import { sendMail } from '../lib/email.js';
import { env } from '../env.js';
import {
  setSessionCookie,
  clearSessionCookie,
  getSessionCookie,
} from '../auth/cookies.js';
import { sendPushToUser } from '../lib/push.js';
import { createChallengeToken, verifyChallengeToken, checkTotp } from './twofa.js';

/** Transforme un User-Agent brut en label lisible (ex : "iPhone · Safari"). */
function parseUA(ua: string | null | undefined): string {
  if (!ua) return 'Appareil inconnu';
  const s = ua.toLowerCase();

  let device = 'Ordinateur';
  if (/iphone/.test(s))                      device = 'iPhone';
  else if (/ipad/.test(s))                   device = 'iPad';
  else if (/android.*mobile/.test(s))        device = 'Android';
  else if (/android/.test(s))               device = 'Tablette Android';
  else if (/macintosh|mac os x/.test(s))    device = 'Mac';
  else if (/windows/.test(s))               device = 'Windows';
  else if (/linux/.test(s))                 device = 'Linux';

  let browser = '';
  if (/edg\//.test(s))                       browser = 'Edge';
  else if (/opr\/|opera/.test(s))            browser = 'Opera';
  else if (/chrome\//.test(s))               browser = 'Chrome';
  else if (/firefox\//.test(s))              browser = 'Firefox';
  else if (/safari\//.test(s))               browser = 'Safari';

  return browser ? `${device} · ${browser}` : device;
}

function publicUser(user: {
  id: string;
  email: string;
  role: 'OWNER' | 'GUEST';
  displayName: string | null;
  avatarImageId?: string | null;
  guestAccess?: string | null;
  pinHash?: string | null;
  mustChangePassword?: boolean;
  budgetOpeningBalance?: number;
  guestCanViewCalendar?: boolean;
  guestCanViewAgenda?: boolean;
  guestCanViewBudget?: boolean;
}) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    avatarImageId: user.avatarImageId ?? null,
    guestAccess: user.guestAccess ?? null,
    pinHash: user.pinHash ?? null,
    mustChangePassword: user.mustChangePassword ?? false,
    budgetOpeningBalance: user.budgetOpeningBalance ?? 0,
    guestCanViewCalendar: user.guestCanViewCalendar ?? false,
    guestCanViewAgenda: user.guestCanViewAgenda ?? false,
    guestCanViewBudget: user.guestCanViewBudget ?? false,
  };
}

export const authRouter = router({
  /**
   * Création du compte Owner unique.
   * Refuse toute tentative ultérieure : les autres utilisateurs sont créés
   * par le système d'invitation (Guest).
   */
  register: publicProcedure
    .input(registerInput)
    .mutation(async ({ ctx, input }) => {
      const existingOwner = await ctx.db.user.findFirst({
        where: { role: 'OWNER' },
        select: { id: true },
      });
      if (existingOwner) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message:
            "Un compte Owner existe déjà. Les autres comptes se créent par invitation.",
        });
      }

      const existingEmail = await ctx.db.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      });
      if (existingEmail) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Email déjà utilisé' });
      }

      const passwordHash = await hashPassword(input.password);
      const user = await ctx.db.user.create({
        data: {
          email: input.email,
          passwordHash,
          role: 'OWNER',
          displayName: input.displayName ?? null,
        },
      });

      const { token, expiresAt } = await createSession({
        userId: user.id,
        role: user.role,
        userAgent: ctx.userAgent ?? undefined,
        ipHash: ctx.ipHash ?? undefined,
      });
      setSessionCookie(ctx.res, token, expiresAt);

      await ctx.db.auditLog.create({
        data: {
          userId: user.id,
          action: 'OWNER_REGISTERED',
          ipHash: ctx.ipHash,
          userAgent: ctx.userAgent,
        },
      });

      return { user: publicUser(user) };
    }),

  login: publicProcedure
    .input(loginInput)
    .mutation(async ({ ctx, input }) => {
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);

      // Protection 1 : bloquer après 10 tentatives échouées sur 15 minutes
      //   pour cet email (évite brute-force ciblé sur un compte).
      const recentFailedByEmail = await ctx.db.auditLog.count({
        where: {
          action: 'LOGIN_FAILED',
          createdAt: { gt: fifteenMinAgo },
          metadata: { path: ['email'], equals: input.email },
        },
      });
      if (recentFailedByEmail >= 10) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Trop de tentatives. Réessaie dans 15 minutes.',
        });
      }

      // Protection 2 : bloquer après 30 tentatives échouées sur 15 minutes
      //   depuis la même IP (toutes adresses confondues). Évite le
      //   credential stuffing massif depuis une seule machine.
      if (ctx.ipHash) {
        const recentFailedByIp = await ctx.db.auditLog.count({
          where: {
            action: 'LOGIN_FAILED',
            createdAt: { gt: fifteenMinAgo },
            ipHash: ctx.ipHash,
          },
        });
        if (recentFailedByIp >= 30) {
          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: 'Trop de tentatives. Réessaie dans 15 minutes.',
          });
        }
      }

      const user = await ctx.db.user.findUnique({
        where: { email: input.email },
      });

      // Toujours vérifier le mot de passe (DUMMY_HASH si user absent) pour
      // mitiger les timing attacks d'énumération d'emails.
      const ok = await verifyPassword(user?.passwordHash, input.password);

      // Guest révoqué (soft-delete) : on rejette comme si les identifiants
      // étaient mauvais, pour ne pas distinguer du cas "compte inexistant"
      // côté attaquant.
      if (user && user.revokedAt) {
        await ctx.db.auditLog.create({
          data: {
            userId: user.id,
            action: 'LOGIN_FAILED',
            ipHash: ctx.ipHash,
            userAgent: ctx.userAgent,
            metadata: { email: input.email, reason: 'revoked' },
          },
        });
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Identifiants invalides',
        });
      }

      if (!user || !ok) {
        await ctx.db.auditLog.create({
          data: {
            userId: user?.id ?? null,
            action: 'LOGIN_FAILED',
            ipHash: ctx.ipHash,
            userAgent: ctx.userAgent,
            metadata: { email: input.email },
          },
        });
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Identifiants invalides',
        });
      }

      // ── 2FA : si activé, on ne crée pas encore la session ───────────────
      if (user.totpEnabled) {
        const challengeToken = createChallengeToken(user.id);
        return { requires2FA: true as const, challengeToken };
      }

      const { token, expiresAt } = await createSession({
        userId: user.id,
        role: user.role,
        userAgent: ctx.userAgent ?? undefined,
        ipHash: ctx.ipHash ?? undefined,
      });
      setSessionCookie(ctx.res, token, expiresAt);

      await ctx.db.auditLog.create({
        data: {
          userId: user.id,
          action: 'LOGIN',
          ipHash: ctx.ipHash,
          userAgent: ctx.userAgent,
        },
      });

      // Alerter les autres appareils déjà connectés (best-effort)
      sendPushToUser(ctx.db, user.id, {
        title: '🔐 Nouvelle connexion',
        body: `Accès depuis ${parseUA(ctx.userAgent)}`,
        url: '/settings',
      }, { respectPref: 'notifyOwnerSecurity', kind: 'security' }).catch(() => null);

      return { user: publicUser(user) };
    }),

  /** Finalise le login après vérification du code TOTP */
  loginVerify2FA: publicProcedure
    .input(z.object({
      challengeToken: z.string(),
      code: z.string().length(6),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = verifyChallengeToken(input.challengeToken);
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Challenge expiré ou invalide. Recommence la connexion.' });
      }

      const user = await ctx.db.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, role: true, twoFactorSecret: true, totpEnabled: true, displayName: true, guestAccess: true, guestCanComment: true, guestCanViewCalendar: true, guestCanViewAgenda: true, guestCanViewBudget: true, invitedById: true, notifEnabled: true, notifReminderTime: true },
      });

      if (!user || !user.totpEnabled || !user.twoFactorSecret) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Identifiants invalides.' });
      }

      const valid = await checkTotp(input.code, user.twoFactorSecret);
      if (!valid) {
        await ctx.db.auditLog.create({
          data: { userId: user.id, action: '2FA_CHALLENGE_FAILED', ipHash: ctx.ipHash, userAgent: ctx.userAgent },
        });
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Code invalide.' });
      }

      const { token, expiresAt } = await createSession({
        userId: user.id,
        role: user.role,
        userAgent: ctx.userAgent ?? undefined,
        ipHash: ctx.ipHash ?? undefined,
      });
      setSessionCookie(ctx.res, token, expiresAt);

      await ctx.db.auditLog.create({
        data: { userId: user.id, action: 'LOGIN', ipHash: ctx.ipHash, userAgent: ctx.userAgent },
      });

      return { user: publicUser(user as any) };
    }),

  /**
   * Demande de réinitialisation de mot de passe.
   *
   * Sécurité :
   *   - Réponse uniforme `{ ok: true }` que l'email existe ou non (anti-
   *     énumération des comptes).
   *   - Rate-limit par IP via le rate-limit global de Fastify + une
   *     vérification courte ici (3 demandes / 15min pour le même email).
   *   - Token = randomBytes(32) hex (64 chars), stocké hashé en SHA-256.
   *   - Expiration 1 heure.
   *   - Users `revokedAt != null` (confidents soft-deleted) ignorés
   *     silencieusement.
   */
  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
      const recent = await ctx.db.auditLog.count({
        where: {
          action: 'PASSWORD_RESET_REQUESTED',
          createdAt: { gt: fifteenMinAgo },
          metadata: { path: ['email'], equals: input.email },
        },
      });
      if (recent >= 3) {
        // Réponse uniforme — pas d'indice que l'email existe.
        return { ok: true as const };
      }

      const user = await ctx.db.user.findUnique({
        where: { email: input.email },
        select: { id: true, email: true, displayName: true, revokedAt: true },
      });

      if (user && !user.revokedAt) {
        const token = randomBytes(32).toString('hex');
        const tokenHash = createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h

        await ctx.db.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt,
            ipHash: ctx.ipHash,
            userAgent: ctx.userAgent,
          },
        });

        const resetUrl = `${env.WEB_ORIGIN}/reset-password?token=${token}`;
        const displayName = user.displayName ?? user.email.split('@')[0] ?? 'toi';
        await sendMail({
          to: user.email,
          subject: 'Réinitialisation de ton mot de passe — Carnet',
          text:
            `Salut ${displayName},\n\n` +
            `Tu as demandé à réinitialiser ton mot de passe Carnet. Clique sur ce lien dans l'heure qui vient pour choisir un nouveau :\n\n` +
            `${resetUrl}\n\n` +
            `Si tu n'as pas demandé ça, ignore ce mail — ton mot de passe actuel reste valide.\n\n` +
            `À tantôt,\n` +
            `Carnet`,
        }).catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[auth.requestPasswordReset] sendMail failed', err);
        });
      }

      await ctx.db.auditLog.create({
        data: {
          userId: user?.id ?? null,
          action: 'PASSWORD_RESET_REQUESTED',
          ipHash: ctx.ipHash,
          userAgent: ctx.userAgent,
          metadata: { email: input.email, userFound: !!user, userRevoked: !!user?.revokedAt },
        },
      });

      return { ok: true as const };
    }),

  /**
   * Confirme un reset password : vérifie le token, change le mot de passe,
   * marque le token comme utilisé, et invalide toutes les sessions actives
   * du user (force re-login partout — défense en profondeur si un attaquant
   * avait obtenu le token).
   */
  confirmPasswordReset: publicProcedure
    .input(z.object({
      token: z.string().min(32).max(200),
      newPassword: passwordSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const tokenHash = createHash('sha256').update(input.token).digest('hex');
      const row = await ctx.db.passwordResetToken.findUnique({
        where: { tokenHash },
        select: { id: true, userId: true, expiresAt: true, usedAt: true },
      });
      if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Lien invalide ou expiré.' });
      }

      const newHash = await hashPassword(input.newPassword);
      await ctx.db.$transaction([
        ctx.db.user.update({ where: { id: row.userId }, data: { passwordHash: newHash } }),
        ctx.db.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      ]);
      // Invalide toutes les sessions actives (autres appareils, etc.) —
      // l'utilisateur doit se re-login partout avec son nouveau mot de passe.
      await revokeAllUserSessions(row.userId);

      await ctx.db.auditLog.create({
        data: {
          userId: row.userId,
          action: 'PASSWORD_RESET_CONFIRMED',
          ipHash: ctx.ipHash,
          userAgent: ctx.userAgent,
        },
      });

      return { ok: true as const };
    }),

  /**
   * Change le mot de passe de l'utilisateur connecté.
   *
   * Deux cas d'usage :
   *   - Forced change : après un `regeneratePassword` côté owner, le
   *     confident arrive ici avec `mustChangePassword: true`. Il choisit
   *     son mdp définitif → on reset le flag.
   *   - Changement volontaire : depuis Réglages → Compte (UI à câbler
   *     plus tard si besoin).
   *
   * Pas de demande de l'ancien mdp dans le cas forced (le user vient
   * juste de se login avec un mdp temporaire généré par l'owner — il
   * est connu de l'app via la session). En cas de changement volontaire
   * hors forced, on demande l'ancien (cf. `currentPassword` requis).
   */
  changePassword: authedProcedure
    .input(z.object({
      newPassword: passwordSchema,
      /** Requis si l'utilisateur n'est pas en mode forced-change. */
      currentPassword: z.string().min(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.user.id },
        select: { passwordHash: true, mustChangePassword: true },
      });
      if (!user) throw new TRPCError({ code: 'NOT_FOUND' });

      // Hors forced change, on exige l'ancien mdp (anti-vol de session)
      if (!user.mustChangePassword) {
        if (!input.currentPassword) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Mot de passe actuel requis.' });
        }
        const ok = await verifyPassword(user.passwordHash, input.currentPassword);
        if (!ok) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Mot de passe actuel incorrect.' });
        }
      }

      const newHash = await hashPassword(input.newPassword);
      await ctx.db.user.update({
        where: { id: ctx.user.id },
        data: { passwordHash: newHash, mustChangePassword: false },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.user.id,
          action: 'PASSWORD_CHANGED',
          ipHash: ctx.ipHash,
          userAgent: ctx.userAgent,
          metadata: { wasForced: user.mustChangePassword },
        },
      });

      return { ok: true as const };
    }),

  logout: authedProcedure.mutation(async ({ ctx }) => {
    const token = getSessionCookie(ctx.req);
    if (token) await revokeSession(token);
    clearSessionCookie(ctx.res);
    await ctx.db.auditLog.create({
      data: {
        userId: ctx.user.id,
        action: 'LOGOUT',
        ipHash: ctx.ipHash,
        userAgent: ctx.userAgent,
      },
    });
    return { ok: true };
  }),

  /**
   * Renvoie l'utilisateur courant ou null si non connecté.
   * Utilisé par le frontend pour décider entre /login et /.
   */
  me: publicProcedure.query(({ ctx }) => {
    if (!ctx.user) return null;
    return publicUser(ctx.user);
  }),

  /**
   * Met à jour le nom d'affichage de l'utilisateur connecté.
   *
   * Visible côté Owner ↔ Confidents (commentaires, fil, chat, header de l'app).
   * Limite stricte : 1 à 80 caractères après trim. Une chaîne vide → `null`
   * (revient à l'affichage de l'email tronqué).
   */
  updateDisplayName: authedProcedure
    .input(z.object({ displayName: z.string().trim().max(80) }))
    .mutation(async ({ ctx, input }) => {
      const trimmed = input.displayName.trim();
      await ctx.db.user.update({
        where: { id: ctx.user.id },
        data: { displayName: trimmed.length === 0 ? null : trimmed },
      });
      return { ok: true };
    }),

  /** Définit ou supprime la photo de profil de l'utilisateur. */
  setAvatar: authedProcedure
    .input(z.object({ imageId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      if (input.imageId !== null) {
        const img = await ctx.db.image.findFirst({
          where: { id: input.imageId, authorId: ctx.user.id },
          select: { id: true },
        });
        if (!img) throw new TRPCError({ code: 'NOT_FOUND', message: 'Image introuvable' });
      }
      await ctx.db.user.update({
        where: { id: ctx.user.id },
        data: { avatarImageId: input.imageId },
      });
      return { ok: true };
    }),

  /**
   * Solde de départ de la page Budget globale (owner). Synchronisé entre
   * appareils via `auth.me`. Borné pour éviter les valeurs aberrantes.
   */
  setBudgetOpeningBalance: ownerProcedure
    .input(z.object({ amount: z.number().finite().min(-1_000_000_000).max(1_000_000_000) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.user.update({
        where: { id: ctx.user.id },
        data: { budgetOpeningBalance: input.amount },
      });
      return { ok: true };
    }),

  /**
   * Liste toutes les sessions actives de l'utilisateur courant.
   * Inclut un flag `isCurrent` pour identifier la session en cours.
   */
  sessions: authedProcedure.query(async ({ ctx }) => {
    const sessions = await ctx.db.session.findMany({
      where: {
        userId: ctx.user.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, userAgent: true, createdAt: true, lastUsedAt: true },
      orderBy: { lastUsedAt: 'desc' },
    });
    return sessions.map((s) => ({
      ...s,
      deviceLabel: parseUA(s.userAgent),
      isCurrent: s.id === ctx.session!.id,
    }));
  }),

  /** Révoque une session spécifique (la session doit appartenir à l'utilisateur courant). */
  revokeSession: authedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const target = await ctx.db.session.findUnique({
        where: { id: input.sessionId },
        select: { userId: true },
      });
      if (!target || target.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      await ctx.db.session.update({
        where: { id: input.sessionId },
        data: { revokedAt: new Date() },
      });
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.user.id,
          action: 'SESSION_REVOKED',
          ipHash: ctx.ipHash,
          userAgent: ctx.userAgent,
          metadata: { revokedSessionId: input.sessionId },
        },
      });
      return { ok: true };
    }),

  savePin: authedProcedure
    .input(z.object({ pinHash: z.string().length(64) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.user.update({
        where: { id: ctx.user.id },
        data: { pinHash: input.pinHash },
      });
      return { ok: true };
    }),

  removePin: authedProcedure
    .mutation(async ({ ctx }) => {
      await ctx.db.user.update({
        where: { id: ctx.user.id },
        data: { pinHash: null },
      });
      return { ok: true };
    }),
});
