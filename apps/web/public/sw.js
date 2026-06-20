// Network-first pour les navigations : garantit que l'HTML est toujours frais après un déploiement.
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request)),
    );
  }
});

// Permet au bouton "Forcer la mise à jour" de basculer immédiatement sur la nouvelle
// version sans avoir à fermer tous les onglets (et sans désenregistrer le SW, ce qui
// détruirait la subscription push).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    try { data = { body: event.data ? event.data.text() : '' }; } catch (_) { /* noop */ }
  }

  const notify = self.registration.showNotification(data.title || 'Journal', {
    body: data.body || '',
    // Honore l'icône envoyée par le serveur (mode discret) — doit rester aligné
    // avec src/sw.ts (le SW de prod généré par VitePWA). Ce public/sw.js n'est
    // servi qu'en dev (VitePWA ne génère pas de SW en dev). NB : l'OS affiche
    // toujours l'icône+nom de l'app comme source — non contournable en web push.
    icon: data.icon || '/icon-192.png',
    badge: '/favicon-32.png',
    // timestamp = heure d'émission côté serveur (fallback : maintenant). L'OS
    // l'affiche à côté de la notif et l'utilise pour trier le centre de notifs.
    timestamp: typeof data.timestamp === 'number' ? data.timestamp : Date.now(),
    data: { url: data.url || '/' },
  }).catch((err) => {
    console.error('[sw] showNotification failed:', err);
  });

  // Demande un sync à tous les onglets ouverts
  const broadcast = clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    list.forEach((client) => client.postMessage({ type: 'SYNC_REQUESTED' }));
  });

  event.waitUntil(Promise.all([notify, broadcast]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
