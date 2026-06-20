import { createHash, randomBytes } from 'node:crypto';
import type { UserRole } from '@prisma/client';
import { db } from '../db.js';

const REFRESH_TTL_OWNER_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours
const REFRESH_TTL_GUEST_MS = 7 * 24 * 60 * 60 * 1000; //   7 jours

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function ttlForRole(role: UserRole): number {
  return role === 'GUEST' ? REFRESH_TTL_GUEST_MS : REFRESH_TTL_OWNER_MS;
}

export async function createSession(opts: {
  userId: string;
  role: UserRole;
  userAgent?: string | undefined;
  ipHash?: string | undefined;
}) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ttlForRole(opts.role));

  const session = await db.session.create({
    data: {
      userId: opts.userId,
      tokenHash,
      userAgent: opts.userAgent ?? null,
      ipHash: opts.ipHash ?? null,
      expiresAt,
    },
  });
  return { session, token, expiresAt };
}

export async function validateSession(token: string) {
  const tokenHash = hashToken(token);
  const session = await db.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;
  // Défense en profondeur : si le user a été soft-deleted (guest révoqué),
  // on rejette toute session active même si revokeSession a manqué.
  if (session.user.revokedAt) return null;

  // Touch lastUsedAt sans bloquer la requête (best effort)
  void db.session
    .update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => undefined);

  return session;
}

export async function revokeSession(token: string) {
  const tokenHash = hashToken(token);
  await db.session.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserSessions(userId: string) {
  await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
