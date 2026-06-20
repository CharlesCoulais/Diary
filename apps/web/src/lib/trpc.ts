import { createTRPCReact, httpBatchLink } from '@trpc/react-query';
import { createTRPCClient } from '@trpc/client';
import type { inferRouterOutputs, inferRouterInputs } from '@trpc/server';
import type { AppRouter } from '@carnet/api';

export const trpc = createTRPCReact<AppRouter>();

/**
 * Helpers de type pour dériver les shapes des inputs/outputs des procédures
 * tRPC directement depuis le router serveur.
 *
 * Usage :
 *   type Entry = RouterOutputs['entries']['list'][number];
 *   type ListInput = RouterInputs['entries']['list'];
 *
 * Évite les `entry: any` côté composants : la source de vérité reste le
 * serveur, le client suit automatiquement les évolutions du payload.
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;

/**
 * Client tRPC partagé.
 * - `credentials: 'include'` est essentiel pour que le cookie de session
 *   soit envoyé en cross-origin pendant le dev (vite proxy le laisse passer).
 */
const httpLink = httpBatchLink({
  url: '/trpc',
  fetch(url, options) {
    return fetch(url, { ...options, credentials: 'include' });
  },
});

export const trpcClient = trpc.createClient({ links: [httpLink] });

// Client vanilla pour les appels hors composants React (sync engine).
export const apiClient = createTRPCClient<AppRouter>({ links: [httpLink] });
