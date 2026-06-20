import { useEffect, useRef, useState } from 'react';
import type { MediaSearchResult } from '../lib/mediaSearch';

interface MediaSearchInputProps {
  value: string;
  placeholder: string;
  onSearch: (q: string, signal: AbortSignal) => Promise<MediaSearchResult[]>;
  onSelect: (result: MediaSearchResult) => void;
  onChange: (v: string) => void;
}

export function MediaSearchInput({ value, placeholder, onSearch, onSelect, onChange }: MediaSearchInputProps) {
  // État local pour l'input — découplé de la prop pour éviter les pertes de caractères
  // dues aux re-renders IndexedDB entre chaque frappe
  const [localValue, setLocalValue] = useState(value);
  const [results, setResults] = useState<MediaSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const focusedRef = useRef(false);

  // Sync depuis l'extérieur uniquement quand l'input n'est pas focus (ex: sélection suggestion "En cours")
  const prevExternalRef = useRef(value);
  useEffect(() => {
    if (!focusedRef.current && prevExternalRef.current !== value) {
      prevExternalRef.current = value;
      setLocalValue(value);
    }
  }, [value]);

  // Recherche effective — utilisée par le debounce ET par le bouton manuel
  const runSearch = async (v: string) => {
    abortRef.current?.abort();
    if (!v || v.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    abortRef.current = new AbortController();
    setLoading(true);
    try {
      const res = await onSearch(v, abortRef.current.signal);
      setResults(res);
      setOpen(res.length > 0);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setLoading(false);
      return;
    }
    setLoading(false);
  };

  const handleChange = (v: string) => {
    setLocalValue(v);
    onChange(v); // propage vers la DB

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void runSearch(v); }, 400);
  };

  const triggerManualSearch = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    void runSearch(localValue);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={localValue}
          placeholder={placeholder}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { focusedRef.current = true; results.length > 0 && setOpen(true); }}
          onBlur={() => { focusedRef.current = false; }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); triggerManualSearch(); }
          }}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted/55 outline-none border-b border-text-muted/15 focus:border-accent/40 transition-colors pb-0.5"
        />
        {loading ? (
          <span className="text-text-muted/55 text-xs shrink-0 animate-spin inline-block">↻</span>
        ) : (
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); triggerManualSearch(); }}
            disabled={!localValue || localValue.length < 2}
            title="Lancer la recherche"
            aria-label="Lancer la recherche"
            className="shrink-0 p-1 rounded text-text-muted/50 hover:text-accent hover:bg-accent/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-bg-elevated border border-text-muted/15 rounded-xl shadow-soft overflow-hidden">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setLocalValue(r.title);
                onSelect(r);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-text-muted/10 transition-colors"
            >
              {r.coverUrl ? (
                <img src={r.coverUrl} alt="" className="w-7 h-9 object-cover rounded shrink-0" />
              ) : (
                <div className="w-7 h-9 rounded bg-text-muted/10 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm text-text-primary truncate">{r.title}</p>
                {(r.creator || r.year) && (
                  <p className="text-xs text-text-muted truncate">
                    {[r.creator, r.year].filter(Boolean).join(' · ')}
                  </p>
                )}
                {r.progressTotal && (
                  <p className="text-xs text-text-muted/60">{r.progressTotal} pages</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
