import { createContext, useContext, type ReactNode } from 'react';
import { useSync } from './useSync';

type SyncCtx = ReturnType<typeof useSync>;

const SyncContext = createContext<SyncCtx | null>(null);

/**
 * Monte la synchronisation Dexie **une seule fois, au niveau de l'app**.
 *
 * Avant, `useSync` n'était appelé que sur la page d'accueil : ses déclencheurs
 * (intervalle, retour de focus, message du service worker, événement SSE
 * `sync`) ne tournaient donc que là. Monté ici, le re-pull temps réel
 * fonctionne sur **toutes les pages** — y compris quand l'owner consulte
 * /tasks ou /timeline pendant qu'un autre appareil ou un confident modifie
 * la donnée.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const value = useSync();
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

/** Accès à `{ sync, syncing }`. Doit être appelé sous un `<SyncProvider>`. */
export function useSyncContext(): SyncCtx {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSyncContext doit être utilisé dans un <SyncProvider>');
  return ctx;
}
