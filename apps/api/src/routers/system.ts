import { publicProcedure, router } from '../trpc.js';
import { SERVER_STARTED_AT } from '../startup.js';

/** Normalise : transforme '' / whitespace en null (Railway peut injecter une chaîne vide). */
function nonEmpty(v: string | undefined): string | null {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
}

export const systemRouter = router({
  version: publicProcedure.query(() => ({
    startedAt: SERVER_STARTED_AT,
    // Identifiant injecté par tsup au build (cf. apps/api/tsup.config.ts).
    // C'est notre source de vérité prioritaire car stable entre replicas et
    // différent à chaque build, indépendamment de Railway.
    buildId: nonEmpty(process.env['BUILD_ID']),
    deploymentId: nonEmpty(process.env['RAILWAY_DEPLOYMENT_ID']),
    commitSha: nonEmpty(process.env['RAILWAY_GIT_COMMIT_SHA']),
  })),
});
