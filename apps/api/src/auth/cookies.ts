import '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { isProd } from '../env.js';

export const SESSION_COOKIE = 'journal_session';

export function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd, // HTTPS uniquement en prod
    sameSite: 'strict',
    path: '/',
    expires: expiresAt,
    signed: false, // signature inutile : le token est déjà random + hashé serveur
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function getSessionCookie(req: FastifyRequest): string | null {
  return req.cookies[SESSION_COOKIE] ?? null;
}
