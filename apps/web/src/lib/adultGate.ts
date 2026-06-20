/** Entrées 18+ déverrouillées pour cette session (réinitialisé au rechargement de la page). */
export const adultUnlocked = new Set<string>();

/** Normalise une réponse : trim + lowercase + suppression des diacritiques. */
function normalizeAnswer(text: string): string {
  return text.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

async function hashString(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Hash SHA-256 normalisé (sans accents, minuscules) — utilisé pour créer de nouveaux hashes. */
export async function sha256(text: string): Promise<string> {
  return hashString(normalizeAnswer(text));
}

/**
 * Vérifie une réponse contre un hash stocké.
 * Essaie d'abord le nouveau format (sans accents), puis le format legacy
 * (avec accents, juste lowercase) pour rester compatible avec les gates existantes.
 */
export async function checkHash(answer: string, storedHash: string): Promise<boolean> {
  if (await hashString(normalizeAnswer(answer)) === storedHash) return true;
  return await hashString(answer.trim().toLowerCase()) === storedHash;
}
