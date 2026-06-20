import Anthropic from '@anthropic-ai/sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { env } from '../env.js';
import {
  AI_SYSTEM,
  RECAP_INSTRUCTIONS,
  buildRecapMessage,
  AI_MODEL_IDS,
  type AiModel,
} from '../routers/ai.js';

/**
 * Génère un texte en streaming via Claude (plan Max).
 *
 * Chemin RAPIDE (token Max présent) : API Messages d'Anthropic directe via
 * `@anthropic-ai/sdk`, authentifiée par le token OAuth du plan Max + le beta
 * header `oauth-2025-04-20`. Streaming SSE natif → premier mot en ~2 s.
 * ⚠️ Le `system` DOIT rester la signature Claude Code (sinon token rejeté) ;
 * les consignes vont dans le MESSAGE utilisateur (cf. buildRecapMessage).
 *
 * Chemin de SECOURS (dev sans token) : le Claude Agent SDK, qui s'appuie sur le
 * login Claude Code local. Plus lent (démarrage du CLI) mais évite d'exiger un
 * token en développement. Là, les consignes servent de `systemPrompt`.
 *
 * `onDelta` est appelé au fil de l'eau ; la promesse résout avec le texte
 * complet (qui fait foi). Lève si la génération échoue/est interrompue.
 */

/** Tokens consommés par l'appel (pour donner une idée de l'usage du plan Max). */
export interface AiUsage { input: number; output: number }

export interface StreamResult { text: string; usage: AiUsage | null }

interface GenericArgs {
  /** Message utilisateur complet (consignes + contenu) pour l'API directe. */
  apiUser: string;
  /** systemPrompt pour le fallback Agent SDK (les consignes). */
  sdkSystem: string;
  /** prompt utilisateur pour le fallback Agent SDK (le contenu brut). */
  sdkUser: string;
  model: AiModel;
  maxTokens: number;
  signal: AbortSignal;
  onDelta: (chunk: string) => void;
}

function streamGeneric(args: GenericArgs): Promise<StreamResult> {
  if (env.CLAUDE_CODE_OAUTH_TOKEN) return streamViaApi(args);
  return streamViaAgentSdk(args);
}

// ── Récap mensuel : synthèse d'un mois de notes (page Stats) ───────────────
export interface RecapArgs {
  /** Digest construit côté serveur (notes + ressenti du mois). */
  digest: string;
  /** Libellé du mois en clair, ex. « mai 2026 ». */
  monthLabel: string;
  model: AiModel;
  signal: AbortSignal;
  onDelta: (chunk: string) => void;
}

export function streamRecap({ digest, monthLabel, model, signal, onDelta }: RecapArgs): Promise<StreamResult> {
  return streamGeneric({
    apiUser: buildRecapMessage(monthLabel, digest),
    sdkSystem: RECAP_INSTRUCTIONS,
    sdkUser: digest,
    model,
    maxTokens: 4000,
    signal,
    onDelta,
  });
}

// ── Chemin rapide : API Messages directe ──────────────────────────────────
async function streamViaApi({ apiUser, model, maxTokens, signal, onDelta }: GenericArgs): Promise<StreamResult> {
  const client = new Anthropic({
    authToken: env.CLAUDE_CODE_OAUTH_TOKEN,
    // Indispensable pour que le token du plan Max soit accepté sur l'API directe.
    defaultHeaders: { 'anthropic-beta': 'oauth-2025-04-20' },
  });

  let full = '';
  const stream = client.messages.stream(
    {
      model: AI_MODEL_IDS[model],
      max_tokens: maxTokens,
      system: AI_SYSTEM,
      messages: [{ role: 'user', content: apiUser }],
    },
    { signal },
  );
  stream.on('text', (delta) => { full += delta; onDelta(delta); });
  const fin = await stream.finalMessage();
  if (!full.trim()) throw new Error("l'IA n'a renvoyé aucun texte");
  const u = fin.usage;
  const usage: AiUsage = {
    input: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    output: u.output_tokens ?? 0,
  };
  return { text: full.trim(), usage };
}

// ── Chemin de secours : Agent SDK (login Claude Code local en dev) ─────────
async function streamViaAgentSdk({ sdkSystem, sdkUser, model, signal, onDelta }: GenericArgs): Promise<StreamResult> {
  const ac = new AbortController();
  signal.addEventListener('abort', () => ac.abort(), { once: true });

  let final: string | null = null;
  let usage: AiUsage | null = null;
  for await (const message of query({
    prompt: sdkUser,
    options: {
      systemPrompt: sdkSystem,
      model,
      maxTurns: 1,
      tools: [],
      permissionMode: 'default',
      includePartialMessages: true,
      abortController: ac,
    },
  })) {
    if (message.type === 'stream_event') {
      const ev = message.event;
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') onDelta(ev.delta.text);
    } else if (message.type === 'result') {
      if (message.subtype === 'success') final = message.result;
      else throw new Error(`génération interrompue (${message.subtype})`);
      const u = message.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } | undefined;
      if (u) usage = { input: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), output: u.output_tokens ?? 0 };
    }
  }
  if (final == null || final.trim() === '') throw new Error("l'IA n'a renvoyé aucun texte");
  return { text: final.trim(), usage };
}
