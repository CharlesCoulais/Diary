import { useEffect, useRef, useState } from 'react';
import { trpc } from '../lib/trpc';

/**
 * Sélecteur de GIF — recherche via l'API Giphy (relayée côté serveur).
 * Rendu en panneau ancré au-dessus du composer. Si la clé Giphy n'est pas
 * configurée, la recherche renvoie une liste vide.
 */
export function GifPicker({
  onSelect,
  onClose,
}: {
  onSelect: (url: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const { data: gifs = [], isFetching } = trpc.gifs.search.useQuery(
    { query: debounced },
    { enabled: debounced.length > 0, staleTime: 60_000 },
  );

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 z-50 bg-bg-elevated border border-text-muted/15 rounded-xl shadow-xl flex flex-col max-h-[300px]">
      <div className="flex items-center gap-2 p-2 border-b border-text-muted/10">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un GIF…"
          className="flex-1 bg-bg-primary rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted/55 outline-none"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="text-text-muted/60 hover:text-danger transition-colors px-1"
          title="Fermer"
        >
          ✕
        </button>
      </div>
      <div className="overflow-y-auto scrollbar-soft min-h-0 p-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5 content-start">
        {debounced.length === 0 && (
          <p className="col-span-full text-xs text-text-muted/55 text-center py-6 italic">
            Tape un mot pour chercher un GIF.
          </p>
        )}
        {debounced.length > 0 && isFetching && gifs.length === 0 && (
          <p className="col-span-full text-xs text-text-muted/50 text-center py-6">Recherche…</p>
        )}
        {debounced.length > 0 && !isFetching && gifs.length === 0 && (
          <p className="col-span-full text-xs text-text-muted/55 text-center py-6 italic">
            Aucun GIF — la recherche est peut-être indisponible.
          </p>
        )}
        {gifs.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => onSelect(g.url)}
            className="rounded-lg overflow-hidden bg-bg-primary hover:ring-2 hover:ring-accent transition-all"
          >
            <img src={g.previewUrl} alt="" className="block w-full h-24 object-contain" loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
}
