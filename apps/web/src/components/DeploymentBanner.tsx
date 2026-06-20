import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../lib/trpc';
import { forceSWUpdateAndReload } from '../lib/swUpdate';

const POLL_MS = 20_000;

/**
 * Bandeau affiché quand une **nouvelle version a été déployée** côté serveur
 * (Railway fait du blue-green : pas de coupure réseau, juste un swap de
 * container). On compare `deploymentId` / `startedAt` au booth time observé
 * au premier load : si ça change → une nouvelle version est dispo, on propose
 * de recharger pour la prendre.
 */
export function DeploymentBanner() {
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const initialVersionRef = useRef<string | null>(null);
  // Pour filtrer les oscillations entre replicas qui n'ont pas de
  // RAILWAY_DEPLOYMENT_ID : on n'accepte un nouveau key qu'après l'avoir
  // observé 2 fois d'affilée.
  const pendingKeyRef = useRef<string | null>(null);
  const pendingCountRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    // Préfère l'identifiant le plus stable disponible. `buildId` est injecté
    // par tsup au build → toutes les replicas d'un même artefact ont la même
    // valeur, et la valeur change à chaque rebuild. C'est notre source de
    // vérité prioritaire ; les fallbacks (Railway env vars, startedAt)
    // servent au cas où le bundle n'a pas été rebuilt avec la nouvelle config.
    const versionKey = (v: {
      startedAt: string;
      buildId: string | null;
      deploymentId: string | null;
      commitSha: string | null;
    }) => v.buildId ?? v.deploymentId ?? v.commitSha ?? v.startedAt;

    async function tick() {
      try {
        const v = await apiClient.system.version.query();
        if (cancelled) return;
        const key = versionKey(v);
        if (initialVersionRef.current === null) {
          initialVersionRef.current = key;
          return;
        }
        if (key === initialVersionRef.current) {
          // Retour à la version initiale (oscillation entre replicas) → reset.
          pendingKeyRef.current = null;
          pendingCountRef.current = 0;
          return;
        }
        // Nouveau key — exige 2 observations consécutives identiques avant
        // de déclarer un déploiement (filtre les fluctuations entre replicas).
        if (pendingKeyRef.current !== key) {
          pendingKeyRef.current = key;
          pendingCountRef.current = 1;
          return;
        }
        pendingCountRef.current += 1;
        if (pendingCountRef.current >= 2) {
          setLatestVersion(key);
        }
      } catch {
        // Échec réseau ponctuel → on attend le prochain tick, pas de bandeau bruité.
      }
    }

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Bandeau visible uniquement si une nouvelle version est dispo ET qu'elle
  // n'a pas déjà été dismissée par l'utilisateur (le dismiss vaut pour cette
  // version-là — si un nouveau déploiement arrive ensuite, le bandeau réapparaît).
  const visible = latestVersion !== null && latestVersion !== dismissedVersion;
  if (!visible) return null;

  return (
    <div
      className="backdrop-blur-sm text-xs font-medium px-4 py-2 flex items-center justify-center gap-3"
      style={{
        background: 'rgba(122, 155, 118, 0.92)',
        color: 'var(--color-bg-primary)',
      }}
    >
      <span className="flex items-center gap-1.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Nouvelle version disponible
      </span>
      <button
        type="button"
        onClick={() => { void forceSWUpdateAndReload(); }}
        className="underline underline-offset-2 hover:no-underline"
      >
        Recharger
      </button>
      <button
        type="button"
        onClick={() => setDismissedVersion(latestVersion)}
        aria-label="Masquer"
        className="ml-1 opacity-70 hover:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}
