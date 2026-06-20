import argon2 from 'argon2';

// Paramètres recommandés OWASP 2024+ pour Argon2id
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 64 * 1024, // 64 MB
  timeCost: 3,
  parallelism: 1,
} as const;

// Hash factice utilisé pour mitiger les timing attacks lors d'un email inconnu
// (on fait toujours un argon2.verify, même si l'utilisateur n'existe pas).
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=1$ZHVtbXlzYWx0ZHVtbXlzYWx0$' +
  'L4QkXJzXnGzs3yJ2TtQrA5MJg1xQjOJPg5zKgLXPDqI';

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  hash: string | null | undefined,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash ?? DUMMY_HASH, password);
  } catch {
    return false;
  }
}
