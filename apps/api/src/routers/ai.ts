import { z } from 'zod';
import { router, authedProcedure } from '../trpc.js';
import { env, isDev } from '../env.js';
import { recordAudit } from '../lib/audit.js';
import { recapOwnerIdFor } from '../lib/permissions.js';

/**
 * Récap mensuel IA — synthèse d'un mois de notes (page Stats).
 *
 * AUTH & TRANSPORT (cf. lib/aiText.ts) : on appelle directement l'API Messages
 * d'Anthropic avec le token du plan Max (`CLAUDE_CODE_OAUTH_TOKEN`, généré par
 * `claude setup-token`). Réponse en streaming SSE natif, aucun coût API :
 * décompté du quota Max. Fallback Agent SDK (login Claude Code local) en dev.
 *
 * Ce router tRPC porte la lecture des récaps (`getRecap`, `listRecapPeriods`,
 * `logRecapOpen`) et `status` ; la génération passe par la route REST streaming
 * `POST /ai/recap` (cf. server.ts), réservée à l'owner.
 */

export const aiAvailable = () => !!env.CLAUDE_CODE_OAUTH_TOKEN || isDev;

/** Modèles proposés dans l'app → identifiants API réels (token Max y a accès). */
export const AI_MODELS = ['haiku', 'sonnet', 'opus'] as const;
export type AiModel = (typeof AI_MODELS)[number];
export const AI_MODEL_IDS: Record<AiModel, string> = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-8',
};

// System prompt envoyé à l'API directe : il DOIT rester exactement la signature
// de Claude Code. Y injecter nos instructions fait rejeter le token du plan Max
// (rate_limit_error). Nos vraies consignes vont donc dans le MESSAGE utilisateur
// (cf. buildRecapMessage), pas dans le system.
export const AI_SYSTEM = "You are Claude Code, Anthropic's official CLI for Claude.";

// ── Récap mensuel ──────────────────────────────────────────────────────────
// Claude ne réécrit pas dans la voix de l'autrice ici : il lui ÉCRIT, à la 2e
// personne (« tu »), une synthèse chaleureuse et lucide de son mois.
export const RECAP_INSTRUCTIONS = `Tu écris à l'autrice d'un journal intime une synthèse de son mois, à partir de ses notes et de son ressenti quotidien. Tu la connais bien : tu es un témoin attentif, lucide et tendre, jamais complaisant.

MISSION :
- Relis l'ensemble du mois fourni et restitue-lui ce qui s'en dégage : les fils qui reviennent, l'évolution de son état d'esprit, les moments qui ont compté (joies, tensions, bascules), ce qui l'a occupée ou préoccupée.
- Adresse-toi DIRECTEMENT à elle, à la deuxième personne (« tu »). Le récap est une lettre courte qui lui parle, pas un rapport.
- N'INVENTE RIEN : aucun événement, fait, personne, citation ou émotion qui ne soit présent dans les notes. Si le mois est mince, dis-le simplement et reste bref. Tu n'es pas là pour broder.
- Ne fais pas une liste jour par jour : synthétise, relie, dégage le mouvement d'ensemble. Tu peux citer un moment marquant précis quand il éclaire le mois.
- EXCEPTION pour les notes marquées (secret) ou (intime) : tu peux en évoquer la teneur générale et l'émotion, mais ne cite JAMAIS leur contenu mot pour mot, ne reproduis aucune phrase ni détail explicite. Paraphrase pudiquement. (Ce récap peut être lu par un proche ; le contenu exact de ces notes ne doit pas fuiter, seulement leur couleur générale.)
- Sois fidèle à sa complexité : elle est lucide, parfois sarcastique, souvent contradictoire. Ne la lisse pas, ne la materne pas, ne moralise jamais, ne psychologise pas à outrance. Reflète-lui ses contradictions sans les juger.
- Termine sur une note juste (pas forcément positive) qui résume la teneur du mois.

PONCTUATION & FORMAT :
- PONCTUATION SIMPLE EXCLUSIVEMENT : points, virgules, points de suspension, points d'exclamation et d'interrogation. JAMAIS de tiret cadratin (—) ni demi-cadratin (–), ni point-virgule.
- Français, paragraphes courts (1 à 4 phrases) séparés par UNE ligne vide. Rythme aéré.
- Tu peux commencer par un titre court en gras markdown si tu veux, mais ce n'est pas obligatoire. Pas d'autre balise, pas de préambule du type « Voici ton récap ».
- Longueur : 4 à 8 paragraphes courts. Une lettre qui se lit en une minute, pas un essai.`;

/** Construit le message utilisateur du récap : consignes + digest du mois. */
export function buildRecapMessage(monthLabel: string, digest: string): string {
  return `${RECAP_INSTRUCTIONS}

=== MOIS À SYNTHÉTISER : ${monthLabel} ===
(Ci-dessous : les notes du mois et le ressenti quotidien. Réponds UNIQUEMENT avec la lettre de récap, rien d'autre.)

${digest}`;
}

export const aiRouter = router({
  /** Le client masque la carte récap quand l'IA n'est pas configurée. */
  status: authedProcedure.query(() => ({
    enabled: aiAvailable(),
    models: AI_MODELS,
    defaultModel: (AI_MODELS as readonly string[]).includes(env.AI_TEXT_MODEL) ? env.AI_TEXT_MODEL : 'sonnet',
  })),

  /**
   * Récap mensuel déjà généré pour une période (owner only, privé).
   * Renvoie null si aucun récap n'a encore été généré pour ce mois.
   * La génération elle-même passe par la route REST streaming POST /ai/recap.
   */
  getRecap: authedProcedure
    .input(z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) }))
    .query(async ({ ctx, input }) => {
      const ownerId = recapOwnerIdFor(ctx.user);
      if (!ownerId) return null;
      return ctx.db.aiRecap.findUnique({
        where: { ownerId_period: { ownerId, period: input.period } },
        select: { period: true, contentMd: true, model: true, entryCount: true, generatedAt: true },
      });
    }),

  /**
   * Mois pour lesquels un récap existe (le plus récent d'abord). Sert au confident
   * (qui ne peut pas générer) à choisir un mois ; l'owner, lui, liste ses mois
   * depuis Dexie pour pouvoir générer n'importe quel mois.
   */
  listRecapPeriods: authedProcedure.query(async ({ ctx }) => {
    const ownerId = recapOwnerIdFor(ctx.user);
    if (!ownerId) return [];
    return ctx.db.aiRecap.findMany({
      where: { ownerId },
      select: { period: true, entryCount: true, generatedAt: true },
      orderBy: { period: 'desc' },
    });
  }),

  /**
   * Journalise la lecture d'un récap par un confident (calqué sur entries.logOpen).
   * Émis par le client à chaque ouverture réelle. Le récap résumant des notes
   * intimes (secret/adulte inclus), cet accès confident doit laisser une trace.
   * No-op pour l'owner (lit son propre récap) et les guests sans accès.
   */
  logRecapOpen: authedProcedure
    .input(z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'GUEST') return { ok: true };
      const ownerId = recapOwnerIdFor(ctx.user);
      if (!ownerId) return { ok: true };
      // Ne loguer que si un récap existe vraiment pour ce mois.
      const exists = await ctx.db.aiRecap.findUnique({
        where: { ownerId_period: { ownerId, period: input.period } },
        select: { period: true },
      });
      if (exists) recordAudit(ctx, 'RECAP_OPENED', { metadata: { period: input.period } });
      return { ok: true };
    }),
});
