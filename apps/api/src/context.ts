import { createHmac } from 'node:crypto';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import type { Session, User } from '@prisma/client';
import { db } from './db.js';
import { env } from './env.js';
import { validateSession } from './auth/session.js';
import { getSessionCookie } from './auth/cookies.js';

export type AuthedSession = Session & { user: User };

export async function createContext({ req, res }: CreateFastifyContextOptions) {
  const token = getSessionCookie(req);

  let user: User | null = null;
  let session: AuthedSession | null = null;

  if (token) {
    const found = await validateSession(token);
    if (found) {
      session = found;
      user = found.user;
    }
  }

  const ip = req.ip;
  // HMAC avec COOKIE_SECRET pour résister aux rainbow tables sur l'espace IPv4 limité
  const ipHash = ip ? createHmac('sha256', env.COOKIE_SECRET).update(ip).digest('hex') : null;
  const userAgent = req.headers['user-agent'] ?? null;

  return {
    req,
    res,
    db,
    user,
    session,
    ipHash,
    userAgent,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
