import { useState } from 'react';
import { apiClient } from '../lib/trpc';
import { SettingsCard } from './SettingsCard';

export function ExportSection() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setLoading(true);
    setError(null);
    try {
      // L'URL de l'API — même origin en prod, port 4100 en dev
      const base = import.meta.env.DEV ? 'http://localhost:4100' : '';
      const res = await fetch(`${base}/api/export`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `carnet-export-${date}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SettingsCard>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text-muted leading-relaxed">
          Télécharge l'intégralité de ton journal en ZIP — entrées en Markdown, images et audios inclus.
        </p>
        <button
          type="button"
          onClick={handleExport}
          disabled={loading}
          className="self-start flex items-center gap-2 px-4 py-2 rounded-xl bg-accent/15 text-accent text-sm font-medium hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <>
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Génération en cours…
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Télécharger le ZIP
            </>
          )}
        </button>
        {error && (
          <p className="text-xs text-danger">{error}</p>
        )}
      </div>
    </SettingsCard>
  );
}
