import { z } from 'zod';
import { router, authedProcedure } from '../trpc.js';
import { env } from '../env.js';

/**
 * Recherche de GIF via l'API Giphy (clé serveur `GIPHY_API_KEY`).
 * Partagé entre la messagerie directe et les commentaires.
 * Sans clé configurée → liste vide (le client masque alors le sélecteur).
 */
export const gifsRouter = router({
  search: authedProcedure
    .input(z.object({ query: z.string().max(100) }))
    .query(async ({ input }) => {
      const key = env.GIPHY_API_KEY;
      const q = input.query.trim();
      if (!key || !q) return [];
      try {
        const url = new URL('https://api.giphy.com/v1/gifs/search');
        url.searchParams.set('api_key', key);
        url.searchParams.set('q', q);
        url.searchParams.set('limit', '24');
        url.searchParams.set('rating', 'pg-13');
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return [];
        const json = await res.json() as {
          data?: { id: string; images?: {
            original?: { url?: string; width?: string; height?: string };
            fixed_width?: { url?: string };
          } }[];
        };
        return (json.data ?? []).flatMap((g) => {
          const full = g.images?.original?.url;
          const preview = g.images?.fixed_width?.url ?? full;
          if (!full || !preview) return [];
          return [{
            id: g.id,
            url: full,
            previewUrl: preview,
            width: Number(g.images?.original?.width) || 0,
            height: Number(g.images?.original?.height) || 0,
          }];
        });
      } catch {
        return [];
      }
    }),
});
