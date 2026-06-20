import { useState } from 'react';
import { trpc } from '../lib/trpc';
import { forceSWUpdateAndReload } from '../lib/swUpdate';

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function AppVersionSection() {
  const [loading, setLoading] = useState(false);

  const { data } = trpc.system.version.useQuery(undefined, {
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const handleForceRefresh = async () => {
    setLoading(true);
    await forceSWUpdateAndReload();
  };

  // Build time du bundle JS courant (injecté par Vite à la compilation).
  // Peut être différent du `startedAt` côté API : c'est le cas typique où
  // la PWA sert encore l'ancien bundle (SW pas encore mis à jour) alors que
  // le serveur a redémarré sur une nouvelle version.
  const clientBuild = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : null;
  // Compare jours (ISO YYYY-MM-DD) plutôt que timestamps exacts : si l'API a
  // restarté à 9h et le bundle a été build à 8h ce matin, c'est la même version
  // fonctionnelle.
  const sameDay = clientBuild && data?.startedAt
    ? clientBuild.slice(0, 10) === data.startedAt.slice(0, 10)
    : null;
  const outOfSync = sameDay === false;

  return (
    <section className="bg-bg-elevated rounded-2xl px-6 py-5 shadow-soft">
      <h2 className="text-sm font-medium text-text-muted uppercase tracking-wide mb-3">Application</h2>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">Bundle sur cet appareil</span>
          <span className={`text-xs font-mono tabular-nums ${outOfSync ? 'text-warning font-medium' : 'text-text-primary'}`}>
            {clientBuild ? formatDate(clientBuild) : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">Serveur déployé</span>
          <span className="text-xs font-mono text-text-primary tabular-nums">
            {data?.startedAt ? formatDate(data.startedAt) : '—'}
          </span>
        </div>
        {outOfSync && (
          <div className="px-3 py-2 rounded-xl bg-warning/10 border border-warning/25 text-[11px] leading-relaxed text-text-primary">
            Le bundle de cet appareil est <strong>plus ancien que le serveur</strong>. Clique sur « Forcer la mise à jour » ci-dessous, puis ferme totalement l'app (swipe up) et rouvre-la pour récupérer la dernière version.
          </div>
        )}
        <div className="border-t border-text-muted/10 pt-3">
          <button
            type="button"
            onClick={handleForceRefresh}
            disabled={loading}
            className="w-full py-2 rounded-xl bg-bg-primary text-sm text-accent font-medium border border-accent/20 hover:bg-accent/5 active:bg-accent/10 transition-colors disabled:opacity-40"
          >
            {loading ? 'Mise à jour en cours…' : '⟳ Forcer la mise à jour'}
          </button>
          <p className="text-xs text-text-muted/50 text-center mt-2 leading-relaxed">
            Vide le cache et recharge l'appli pour obtenir la dernière version.
          </p>
        </div>
      </div>
    </section>
  );
}
