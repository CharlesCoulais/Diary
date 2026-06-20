import { trpc } from '../lib/trpc';
import { SettingsCard } from './SettingsCard';

function deviceIcon(label: string): string {
  const l = label.toLowerCase();
  if (l.includes('iphone') || l.includes('android')) return '📱';
  if (l.includes('ipad') || l.includes('tablette'))  return '📟';
  return '💻';
}

function formatDate(d: Date | string): string {
  const date = new Date(d);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1)   return 'À l\'instant';
  if (diffMin < 60)  return `Il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)    return `Il y a ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7)     return `Il y a ${diffD} j`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function ActiveSessionsSection() {
  const { data: sessions, refetch } = trpc.auth.sessions.useQuery();
  const revoke = trpc.auth.revokeSession.useMutation({
    onSuccess: () => refetch(),
  });

  return (
    <SettingsCard>
      {!sessions ? (
        <div className="divide-y divide-text-muted/8 -mx-6" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="px-4 py-3 flex items-center gap-3 animate-pulse">
              <span className="w-5 h-5 rounded-full bg-text-muted/15 shrink-0" />
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <span className="h-3 w-2/5 rounded bg-text-muted/15" />
                <span className="h-2.5 w-1/4 rounded bg-text-muted/10" />
              </div>
            </div>
          ))}
        </div>
      ) : (
      <div className="divide-y divide-text-muted/8 -mx-6">
        {sessions!.map((s) => (
          <div key={s.id} className="px-4 py-3 flex items-center gap-3">
            <span className="text-lg shrink-0">{deviceIcon(s.deviceLabel)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-text-primary flex items-center gap-2">
                {s.deviceLabel}
                {s.isCurrent && (
                  <span className="px-1.5 py-0.5 rounded-md bg-success/15 text-success text-[11px] font-semibold">
                    Cette session
                  </span>
                )}
              </p>
              <p className="text-[11px] text-text-muted/50 mt-0.5">
                Actif {formatDate(s.lastUsedAt)}
              </p>
            </div>
            {!s.isCurrent && (
              <button
                onClick={() => revoke.mutate({ sessionId: s.id })}
                disabled={revoke.isPending}
                className="text-xs text-danger/60 hover:text-danger transition-colors shrink-0 disabled:opacity-40"
              >
                Révoquer
              </button>
            )}
          </div>
        ))}

        {sessions!.length === 0 && (
          <p className="px-4 py-3 text-xs text-text-muted/50">Aucune session active.</p>
        )}
      </div>
      )}
      <p className="mt-3 text-[11px] text-text-muted/55">
        Tu reçois une notification push à chaque nouvelle connexion.
      </p>
    </SettingsCard>
  );
}
