import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET doit faire au moins 32 caractères'),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  // Clé API Giphy (gratuite) pour la recherche de GIF dans la messagerie.
  // Optionnelle : sans elle, l'onglet « GIF » du sélecteur est masqué.
  GIPHY_API_KEY: z.string().optional(),
  // Token Claude Code (généré par `claude setup-token`, lié au plan Max) pour
  // le récap mensuel IA. Optionnel : sans lui (et hors dev avec un login Claude
  // Code local), la carte récap est masquée.
  CLAUDE_CODE_OAUTH_TOKEN: z.string().optional(),
  // Modèle utilisé pour le récap mensuel (alias Claude Code : sonnet/haiku/opus).
  AI_TEXT_MODEL: z.string().default('sonnet'),
  // Stockage vidéo R2 (Cloudflare). Optionnel : sans ces vars, les vidéos
  // sont stockées sur disque local (dev uniquement — éphémère en prod).
  R2_ENDPOINT: z.string().url().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
});

// Railway (entre autres) injecte parfois une chaîne VIDE pour une variable
// « créée mais sans valeur ». Or `z.string().url().optional()` rejette "" (ce
// n'est pas `undefined`) → le boot planterait sur une var optionnelle laissée
// vide (ex. R2_ENDPOINT). On retire donc les chaînes vides/espaces avant parse :
// elles sont alors traitées comme non définies (→ `.optional()`/`.default()`).
const rawEnv = Object.fromEntries(
  Object.entries(process.env).filter(([, v]) => (v ?? '').trim() !== ''),
);

const parsed = envSchema.safeParse(rawEnv);

if (!parsed.success) {
  console.error('Variables d\'environnement invalides :');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isDev = env.NODE_ENV === 'development';
export const isProd = env.NODE_ENV === 'production';
