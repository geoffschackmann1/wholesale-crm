// Service worker for Wholesale CRM PWA
// Handles: Web Push notifications, offline shell caching

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('wholesale-crm-v1').then((cache) =>
      cache.addAll(['/', '/inbox', '/buy-boxes', '/manifest.json'])
    )
  );
});

self.addEventListener('fetch', (event) => {
  // Network-first for API routes; cache-first for shell
  if (event.request.url.includes('/api/')) return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Wholesale CRM Alert', {
      body: data.body ?? '',
      icon: '/icon-192.png',
      data: { url: data.url ?? '/inbox' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url ?? '/inbox'));
});
