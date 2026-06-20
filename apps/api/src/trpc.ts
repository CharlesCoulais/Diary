import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context.js';
import { recordAudit } from './lib/audit.js';

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // On expose le code mais pas la stack trace
        zodErrors: error.cause instanceof Error && 'flatten' in error.cause
          ? (error.cause as { flatten: () => unknown }).flatten()
          : undefined,
      },
    };
  },
});

/**
 * Chemins de mutations à NE PAS logger automatiquement :
 *  - déjà journalisés sémantiquement (libellé FR + entryId/metadata riches) —
 *    les logger ici ferait un doublon. Voir `lib/audit.ts` et les routers.
 *  - signaux éphémères (`typing`) qui n'écrivent rien en base et spammeraient.
 */
const SKIP_AUTO_AUDIT = new Set<string>([
  // Sémantiques (auth / sécurité)
  'auth.register', 'auth.login', 'auth.loginVerify2FA', 'auth.requestPasswordReset',
  'auth.confirmPasswordReset', 'auth.changePassword', 'auth.logout', 'auth.revokeSession',
  'twofa.setup', 'twofa.confirm', 'twofa.disable',
  // Sémantiques (contenu / interactions)
  'comments.add',
  'guests.revokeGuest', 'guests.regeneratePassword', 'guests.accept',
  'entries.seal', 'entries.unlockAdultContent',
  // `logOpen` est sémantique (ENTRY_OPENED) ; `markRead` est le simple mécanisme
  // de statut de lecture, déjà couvert par ENTRY_OPENED → on évite le doublon.
  'entries.logOpen', 'entries.markRead',
  // `ai.logRecapOpen` est sémantique (RECAP_OPENED) → éviter le doublon rpc.*.
  'ai.logRecapOpen',
  'readGate.respond',
  'sync.push',
  'reactions.toggleEntry', 'reactions.toggleComment',
  'ratings.set',
  'directMessages.send',
  'tasks.create', 'tasks.update', 'tasks.delete',
  'topicRequests.create', 'topicRequests.updateStatus', 'topicRequests.delete',
  // Éphémères
  'comments.typing', 'directMessages.typing',
  // Mécanisme de lecture (comme entries.markRead) : pas un évènement métier
  'comments.markThreadRead',
]);

/**
 * Journalise automatiquement TOUTE mutation (écriture) non déjà couverte par un
 * log sémantique. Stocke uniquement le chemin (`rpc.<router>.<proc>`) + le
 * succès/échec — JAMAIS le contenu de l'input (mots de passe, texte…). Les
 * lectures (queries) ne sont pas loguées. Fire-and-forget : aucune latence.
 */
const autoAuditMiddleware = t.middleware(async ({ ctx, type, path, next }) => {
  const result = await next();
  if (type === 'mutation' && !SKIP_AUTO_AUDIT.has(path)) {
    recordAudit(ctx, `rpc.${path}`, {
      metadata: result.ok ? undefined : { ok: false, error: result.error.code },
    });
  }
  return result;
});

const baseProcedure = t.procedure.use(autoAuditMiddleware);

export const router = t.router;
export const publicProcedure = baseProcedure;

/** Procédure réservée aux utilisateurs authentifiés (Owner ou Guest). */
export const authedProcedure = baseProcedure.use(({ ctx, next }) => {
  if (!ctx.user || !ctx.session) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentification requise' });
  }
  return next({
    ctx: { ...ctx, user: ctx.user, session: ctx.session },
  });
});

/** Procédure réservée à l'Owner. */
export const ownerProcedure = authedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'OWNER') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Réservé au propriétaire du journal' });
  }
  return next({ ctx });
});
