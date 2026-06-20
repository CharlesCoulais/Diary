/**
 * Force la mise à jour complète du service worker + bundle JS et recharge la
 * page. Utilisé par AppVersionSection (bouton manuel) et DeploymentBanner
 * (bouton « Recharger » du bandeau auto).
 *
 * Pourquoi on ne se contente pas d'un simple `window.location.reload()` :
 * sur iOS Safari PWA et Android Chrome PWA, le SW peut rester sur l'ancienne
 * version même après un reload, parce que l'OS garde l'ancien process actif
 * et le SW reste contrôleur de la page. Sans intervention explicite, le user
 * doit fermer + rouvrir l'app pour voir la nouvelle version.
 *
 * Stratégie :
 *   1. Demande au SW de vérifier une nouvelle version (`registration.update()`).
 *   2. Si une version `waiting` existe, lui dire de prendre la main maintenant
 *      (postMessage `SKIP_WAITING` — le SW écoute ce message, cf. sw.ts).
 *   3. Attendre l'event `controllerchange` (max 3 s) pour s'assurer que le
 *      nouveau SW contrôle bien la page AVANT de reload — sinon on recharge
 *      trop tôt et l'ancien SW continue de servir les chunks périmés.
 *   4. Vider toutes les `CacheStorage` (chunks JS, manifests précachés).
 *   5. Reload avec query-string anti-cache HTTP.
 *
 * On NE désinscrit PAS le SW : sa subscription push y est rattachée et serait
 * détruite (→ "Notifs push expirées" après chaque refresh).
 */
export async function forceSWUpdateAndReload(): Promise<void> {
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const controllerChanged = new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
        setTimeout(resolve, 3000);
      });
      await Promise.all(registrations.map(async (r) => {
        await r.update();
        if (r.waiting) r.waiting.postMessage({ type: 'SKIP_WAITING' });
      }));
      await controllerChanged;
    } catch (e) {
      console.error('[swUpdate] failed:', e);
    }
  }
  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) {
      console.error('[swUpdate] cache clear failed:', e);
    }
  }
  window.location.replace(`${window.location.origin}/?_v=${Date.now()}`);
}
