import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MediaTrack } from '../lib/db/schema';
import { Switch } from './Switch';

export type LinkSource = 'spotify' | 'youtube';

export interface SkileyImportOptions {
  tracks: MediaTrack[];      // morceaux sélectionnés
  fetchCovers: boolean;
  fetchLyrics: boolean;
  linkSource: LinkSource;
  playlistName?: string;
}

interface SkileyImportDialogProps {
  tracks: MediaTrack[];      // tous les morceaux parsés
  playlistName?: string;
  onCancel: () => void;
  onImport: (opts: SkileyImportOptions) => void;
}

/**
 * Modale d'import d'une playlist Skiley : on choisit les morceaux à importer
 * et quelques options (pochettes, paroles, source du lien d'écoute).
 */
export function SkileyImportDialog({ tracks, playlistName, onCancel, onImport }: SkileyImportDialogProps) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(tracks.map((_, i) => i)));
  const [filter, setFilter] = useState('');
  const [fetchCovers, setFetchCovers] = useState(true);
  const [fetchLyrics, setFetchLyrics] = useState(false);
  const [linkSource, setLinkSource] = useState<LinkSource>('spotify');

  // Verrouille le scroll de fond tant que la modale est ouverte.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const q = filter.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!q) return tracks.map((_, i) => i);
    return tracks
      .map((t, i) => i)
      .filter((i) => {
        const t = tracks[i]!;
        return (t.subject ?? '').toLowerCase().includes(q) || (t.creator ?? '').toLowerCase().includes(q);
      });
  }, [tracks, q]);

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };
  const setVisible = (on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const i of visible) { if (on) next.add(i); else next.delete(i); }
      return next;
    });
  };

  const confirm = () => {
    const chosen = tracks.filter((_, i) => selected.has(i));
    if (!chosen.length) return;
    onImport({ tracks: chosen, fetchCovers, fetchLyrics, linkSource, playlistName });
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-bg-primary/80 backdrop-blur-sm" onClick={onCancel} />
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-bg-elevated rounded-2xl shadow-2xl overflow-hidden max-w-lg mx-auto max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-text-muted/10 shrink-0">
          <div>
            <p className="text-sm font-medium text-text-primary">Importer une playlist</p>
            {playlistName && <p className="text-xs text-text-muted">{playlistName}</p>}
          </div>
          <button type="button" onClick={onCancel} className="text-text-muted/50 hover:text-text-muted p-1" aria-label="Fermer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Recherche + tout/aucun */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-text-muted/10 shrink-0">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrer…"
            className="flex-1 min-w-0 bg-bg-primary border border-text-muted/15 rounded-lg px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/40"
          />
          <button type="button" onClick={() => setVisible(true)} className="text-xs text-accent hover:opacity-70 transition-opacity whitespace-nowrap">Tout</button>
          <span className="text-text-muted/45">·</span>
          <button type="button" onClick={() => setVisible(false)} className="text-xs text-text-muted hover:text-accent transition-colors whitespace-nowrap">Aucun</button>
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto min-h-0 scrollbar-soft">
          {visible.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">Aucun morceau ne correspond.</p>
          ) : (
            <ul className="divide-y divide-text-muted/5">
              {visible.map((i) => {
                const t = tracks[i]!;
                const isOn = selected.has(i);
                return (
                  <li key={i}>
                    <label className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-text-muted/5 transition-colors">
                      <input
                        type="checkbox"
                        checked={isOn}
                        onChange={() => toggle(i)}
                        className="h-4 w-4 shrink-0 accent-accent"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-text-primary truncate">{t.subject || 'Sans titre'}</span>
                        <span className="block text-xs text-text-muted truncate">
                          {t.creator || 'Artiste inconnu'}{t.trackTitle ? ` · ${t.trackTitle}` : ''}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Options */}
        <div className="px-4 py-3 border-t border-text-muted/10 space-y-3 shrink-0">
          {/* Source du lien d'écoute */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-text-primary">Lien d'écoute</span>
            <div className="inline-flex rounded-lg border border-text-muted/15 overflow-hidden text-xs">
              {(['spotify', 'youtube'] as const).map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setLinkSource(src)}
                  className={
                    'px-3 py-1.5 transition-colors ' +
                    (linkSource === src ? 'bg-accent/15 text-accent font-medium' : 'text-text-muted hover:text-text-primary')
                  }
                >
                  {src === 'spotify' ? 'Spotify' : 'YouTube'}
                </button>
              ))}
            </div>
          </div>
          {linkSource === 'youtube' && (
            <p className="text-xs text-text-muted -mt-1.5">
              Cherche la vidéo YouTube de chaque morceau (plus lent). Spotify est gardé en secours si rien n'est trouvé.
            </p>
          )}

          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-sm text-text-primary">Récupérer les pochettes <span className="text-text-muted">(iTunes)</span></span>
            <Switch checked={fetchCovers} onChange={setFetchCovers} aria-label="Récupérer les pochettes" />
          </label>

          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-sm text-text-primary">Récupérer les paroles <span className="text-text-muted">(lrclib)</span></span>
            <Switch checked={fetchLyrics} onChange={setFetchLyrics} aria-label="Récupérer les paroles automatiquement" />
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-text-muted/10 shrink-0">
          <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary transition-colors">
            Annuler
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={selected.size === 0}
            className="px-4 py-1.5 text-sm rounded-lg bg-accent text-white font-medium transition-opacity disabled:opacity-40 enabled:hover:opacity-90"
          >
            Importer ({selected.size})
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
