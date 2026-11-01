// Alive Bot Service Worker (PWA)
const CACHE_NAME = 'alive-bot-v1.3.0';

const OFFLINE_URLS = [
  '/',
  '/index.html',
  '/css/panel.css',
  '/js/panel.js',
  '/js/icons.js',
  '/js/state.js',
  '/js/store.js',
  '/js/commands.js',
  '/img/icon-192.png',
  '/img/icon-512.png',
  '/img/icon-maskable-192.png',
  '/img/icon-maskable-512.png',
  '/img/ic_splash_logo.webp',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(OFFLINE_URLS).catch((err) => {
        console.warn('[sw] cache warmup parcial:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Não interceptar endpoints de API dinâmica nem websockets/chat
  if (url.pathname.startsWith('/api') || url.pathname === '/health') {
    return;
  }

  // Network-first com fallback para cache
  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const toCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, toCache);
          }).catch(() => {});
        }
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.headers.get('accept')?.includes('text/html')) {
          return (await caches.match('/index.html')) || (await caches.match('/'));
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      })
  );
});
