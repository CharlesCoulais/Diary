/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

self.skipWaiting();
clientsClaim();

// Fallback : si la page client envoie explicitement SKIP_WAITING (cf. "Forcer
// la mise à jour" dans AppVersionSection), on s'auto-active immédiatement.
// Utile sur Android Chrome PWA où `skipWaiting()` au boot ne suffit pas
// toujours à déloger l'ancien SW.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(
  ({ request }: { request: Request }) => request.mode === 'navigate',
  new NetworkFirst({ cacheName: 'pages', networkTimeoutSeconds: 5 }),
);

self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; url?: string; icon?: string } = {};
  try {
    if (event.data) data = event.data.json() as typeof data;
  } catch {
    try { data = { body: event.data?.text() ?? '' }; } catch { /* noop */ }
  }

  const notify = self.registration.showNotification(data.title ?? 'Diary', {
    body: data.body ?? '',
    icon: data.icon ?? '/icon-192.png',
    badge: '/favicon-32.png',
    data: { url: data.url ?? '/' },
  }).catch((err: unknown) => console.error('[sw] showNotification failed:', err));

  const broadcast = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((list) => list.forEach((c) => c.postMessage({ type: 'SYNC_REQUESTED' })));

  event.waitUntil(Promise.all([notify, broadcast]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
