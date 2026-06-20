import type { PrismaClient, Prisma } from '@prisma/client';

/**
 * Sous-ensemble du contexte tRPC dont a besoin l'écriture d'un `AuditLog`.
 * (Évite de coupler le helper à toute la forme du `Context`.)
 */
export interface AuditCtx {
  db: PrismaClient;
  /** Absent pour les mutations publiques (avant auth) — l'évènement est alors anonyme. */
  user?: { id: string } | null;
  ipHash: string | null;
  userAgent: string | null;
}

/**
 * Écrit un évènement dans le journal d'activité (`AuditLog`).
 *
 * Fire-and-forget par défaut : on n'attend pas l'écriture et on avale les
 * erreurs — un log d'audit ne doit jamais faire échouer l'action métier qu'il
 * accompagne ni en ralentir la réponse. La page `/logs` (owner only) lit ces
 * lignes ; voir `routers/logs.ts`.
 */
export function recordAudit(
  ctx: AuditCtx,
  action: string,
  opts: { entryId?: string | null; metadata?: Prisma.InputJsonValue } = {},
): void {
  void ctx.db.auditLog
    .create({
      data: {
        userId: ctx.user?.id ?? null,
        action,
        entryId: opts.entryId ?? null,
        metadata: opts.metadata,
        ipHash: ctx.ipHash,
        userAgent: ctx.userAgent,
      },
    })
    .catch(() => null);
}
