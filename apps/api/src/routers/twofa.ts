/**
 * TASK-5 — 2FA TOTP
 *
 * Procédures :
 *  - setup    : génère un secret TOTP, le stocke (non activé), retourne un otpauth URL
 *  - confirm  : vérifie le code → active totpEnabled, génère des codes de récupération
 *  - disable  : vérifie le code ou un code de récupération → désactive totpEnabled
 */
import { createHmac, randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin, generateSecret } from 'otplib';
import { router, authedProcedure } from '../trpc.js';
import { env } from '../env.js';

// ── TOTP instance (singleton, partagé) ───────────────────────────────────────

const totpCrypto = new NobleCryptoPlugin();
const totpBase32 = new ScureBase32Plugin();
const totp = new TOTP({ crypto: totpCrypto, base32: totpBase32 });

/** Génère un secret base32 */
async function makeSecret(): Promise<string> {
  return generateSecret({ base32: totpBase32 });
}

/** Vérifie un code TOTP (retourne true/false) */
async function checkTotp(token: string, secret: string): Promise<boolean> {
  try {
    const result = await totp.verify(token, { secret });
    return typeof result === 'object' ? result.valid : !!result;
  } catch {
    return false;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Génère N codes de récupération hexadécimaux lisibles (groupes de 4 chars) */
function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(6).toString('hex').toUpperCase(); // 12 chars
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  });
}

/** SHA-256 d'un code de récupération (stockage sécurisé) */
function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(code.replace(/-/g, '').toLowerCase()).digest('hex');
}

// ── Router ────────────────────────────────────────────────────────────────────

export const twofaRouter = router({

  /** Retourne l'état 2FA de l'utilisateur courant */
  status: authedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.user.id },
      select: { totpEnabled: true, twoFactorSecret: true },
    });
    return {
      enabled: user?.totpEnabled ?? false,
      configured: !!user?.twoFactorSecret,
    };
  }),

  /**
   * Étape 1 du setup : génère un secret TOTP et le stocke (pas encore activé).
   * Retourne l'otpauth URL pour que le client génère le QR code.
   */
  setup: authedProcedure.mutation(async ({ ctx }) => {
    const secret = await makeSecret();

    await ctx.db.user.update({
      where: { id: ctx.user.id },
      data: { twoFactorSecret: secret, totpEnabled: false },
    });

    const email = ctx.user.email;
    const otpauthUrl = await totp.toURI({ secret, label: email, issuer: 'Carnet' });

    await ctx.db.auditLog.create({
      data: {
        userId: ctx.user.id,
        action: '2FA_SETUP_STARTED',
        ipHash: ctx.ipHash,
        userAgent: ctx.userAgent,
      },
    });

    return { otpauthUrl, secret };
  }),

  /**
   * Étape 2 du setup : vérifie le code → active le 2FA.
   * Retourne les codes de récupération (à afficher UNE SEULE FOIS).
   */
  confirm: authedProcedure
    .input(z.object({ code: z.string().length(6) }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.user.id },
        select: { twoFactorSecret: true, totpEnabled: true },
      });

      if (!user?.twoFactorSecret) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: "Lance d'abord la configuration 2FA." });
      }
      if (user.totpEnabled) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Le 2FA est déjà activé.' });
      }

      const valid = await checkTotp(input.code, user.twoFactorSecret);
      if (!valid) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Code invalide.' });
      }

      const plainCodes = generateRecoveryCodes(8);
      const hashedCodes = plainCodes.map(hashRecoveryCode);

      await ctx.db.user.update({
        where: { id: ctx.user.id },
        data: { totpEnabled: true, recoveryCodes: hashedCodes },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.user.id,
          action: '2FA_ENABLED',
          ipHash: ctx.ipHash,
          userAgent: ctx.userAgent,
        },
      });

      return { recoveryCodes: plainCodes };
    }),

  /**
   * Désactive le 2FA après vérification du code TOTP OU d'un code de récupération.
   */
  disable: authedProcedure
    .input(z.object({ code: z.string().min(6).max(20) }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.user.id },
        select: { twoFactorSecret: true, totpEnabled: true, recoveryCodes: true },
      });

      if (!user?.totpEnabled) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: "Le 2FA n'est pas activé." });
      }

      // Accepte un code TOTP (6 chiffres) ou un code de récupération (format XXXX-XXXX-XXXX)
      const isTotpCode = /^\d{6}$/.test(input.code);
      let valid = false;

      if (isTotpCode) {
        valid = await checkTotp(input.code, user.twoFactorSecret!);
      } else {
        // Code de récupération : comparer le hash
        const inputHash = hashRecoveryCode(input.code);
        const idx = user.recoveryCodes.indexOf(inputHash);
        if (idx !== -1) {
          valid = true;
          // Consommer le code (évite la réutilisation)
          const newCodes = [...user.recoveryCodes];
          newCodes.splice(idx, 1);
          await ctx.db.user.update({
            where: { id: ctx.user.id },
            data: { recoveryCodes: newCodes },
          });
        }
      }

      if (!valid) {
        await ctx.db.auditLog.create({
          data: {
            userId: ctx.user.id,
            action: '2FA_CHALLENGE_FAILED',
            ipHash: ctx.ipHash,
            userAgent: ctx.userAgent,
          },
        });
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Code invalide.' });
      }

      await ctx.db.user.update({
        where: { id: ctx.user.id },
        data: { totpEnabled: false, twoFactorSecret: null, recoveryCodes: [] },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.user.id,
          action: '2FA_DISABLED',
          ipHash: ctx.ipHash,
          userAgent: ctx.userAgent,
        },
      });

      return { ok: true };
    }),
});

// ── Challenge token (pour le flow login avec 2FA) ─────────────────────────────
// Token HMAC signé : userId|expiresAt — stateless, expire en 5 min.

const CHALLENGE_SECRET = env.COOKIE_SECRET;

export function createChallengeToken(userId: string): string {
  const expiresAt = Date.now() + 5 * 60 * 1000;
  const payload = `${userId}|${expiresAt}`;
  const sig = createHmac('sha256', CHALLENGE_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}|${sig}`).toString('base64url');
}

export function verifyChallengeToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const parts = decoded.split('|');
    if (parts.length !== 3) return null;
    const [userId, expiresAtStr, sig] = parts as [string, string, string];
    const expiresAt = parseInt(expiresAtStr, 10);
    if (Date.now() > expiresAt) return null;
    const payload = `${userId}|${expiresAtStr}`;
    const expected = createHmac('sha256', CHALLENGE_SECRET).update(payload).digest('hex');
    if (sig !== expected) return null;
    return userId;
  } catch {
    return null;
  }
}

/** Vérifie un code TOTP — exporté pour auth.ts */
export { checkTotp };
