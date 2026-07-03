const CACHE_NAME = 'ltth-v1.3.3';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/main.css',
  '/css/layout.css',
  '/js/main.js',
  '/js/layout.js',
  '/js/i18n.js',
  '/_partials/header.html',
  '/_partials/footer.html',
  '/locales/de.json',
  '/locales/en.json',
  '/locales/es.json',
  '/locales/fr.json',
  '/assets/favicon-32x32.png',
  '/assets/favicon-16x16.png',
  '/assets/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('fetch', event => {
  // Let the browser handle non-GET requests (for example, POST/PUT) without SW interception.
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin === self.location.origin && requestUrl.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Only cache successful responses to avoid negative cache poisoning
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});
