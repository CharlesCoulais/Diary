import { useState } from 'react';
import { Link } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { SettingsCard } from './SettingsCard';

export function ApiKeySection() {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { data, refetch } = trpc.apiKeys.status.useQuery();
  const generate = trpc.apiKeys.generate.useMutation({
    onSuccess: (d) => { setRevealed(d.token); refetch(); },
  });
  const revoke = trpc.apiKeys.revoke.useMutation({
    onSuccess: () => { setRevealed(null); refetch(); },
  });

  const copy = async () => {
    if (!revealed) return;
    await navigator.clipboard.writeText(revealed);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <SettingsCard>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-text-muted leading-relaxed">
            Accès lecture/écriture à l'API REST.
          </p>
          <Link to="/api-docs" className="text-xs text-accent hover:underline shrink-0 ml-3">
            Documentation →
          </Link>
        </div>

        {revealed ? (
          <div className="space-y-2">
            <p className="text-xs text-warning font-medium">Copie cette clé maintenant — elle ne sera plus affichée.</p>
            <div className="flex gap-2">
              <input
                readOnly
                value={revealed}
                className="flex-1 bg-bg-primary rounded-lg px-3 py-2 text-xs font-mono text-text-primary outline-none border border-accent/30 truncate"
              />
              <button
                onClick={copy}
                className="px-3 py-2 rounded-lg bg-accent text-white text-xs font-medium shrink-0"
              >
                {copied ? '✓ Copié' : 'Copier'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className={`text-xs font-medium ${data?.hasKey ? 'text-success' : 'text-text-muted'}`}>
              {data?.hasKey ? '● Clé active' : '○ Aucune clé'}
            </span>
            <div className="flex-1" />
            {data?.hasKey && (
              <button
                onClick={() => revoke.mutate()}
                disabled={revoke.isPending}
                className="text-xs text-danger/70 hover:text-danger transition-colors"
              >
                Révoquer
              </button>
            )}
            <button
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
              className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium disabled:opacity-40"
            >
              {data?.hasKey ? 'Regénérer' : 'Générer'}
            </button>
          </div>
        )}
      </div>
    </SettingsCard>
  );
}
