/**
 * Service Worker for Overlay Caching
 * Performance Optimization #9
 * 
 * Caches overlay assets for faster loading in OBS
 */

const CACHE_NAME = 'coinbattle-overlay-v1';
const CACHE_VERSION = '1.0.0';

// URLs to cache
const urlsToCache = [
  '/plugins/coinbattle/overlay/overlay.html',
  '/plugins/coinbattle/overlay/overlay.js',
  '/plugins/coinbattle/overlay/styles.css',
  '/plugins/coinbattle/overlay/gpu-animations.css',
  'https://cdn.socket.io/4.5.4/socket.io.min.js'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  console.log('[CoinBattle SW] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[CoinBattle SW] Caching assets');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('[CoinBattle SW] Installation complete');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[CoinBattle SW] Installation failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[CoinBattle SW] Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName.startsWith('coinbattle-overlay-') && cacheName !== CACHE_NAME) {
              console.log('[CoinBattle SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[CoinBattle SW] Activation complete');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Only handle requests for our plugin assets or socket.io
  if (!url.pathname.startsWith('/plugins/coinbattle') && 
      !url.hostname.includes('socket.io') &&
      !url.hostname.includes('cdn.socket.io')) {
    return;
  }
  
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          console.log('[CoinBattle SW] Serving from cache:', url.pathname);
          
          // Return cached response and fetch update in background
          fetchAndCache(request);
          
          return cachedResponse;
        }
        
        // Not in cache, fetch from network
        console.log('[CoinBattle SW] Fetching from network:', url.pathname);
        return fetchAndCache(request);
      })
      .catch((error) => {
        console.error('[CoinBattle SW] Fetch failed:', error);
        
        // Return offline fallback if available
        return caches.match('/plugins/coinbattle/offline.html');
      })
  );
});

/**
 * Fetch from network and update cache
 */
function fetchAndCache(request) {
  return fetch(request)
    .then((response) => {
      // Check if valid response
      if (!response || response.status !== 200 || response.type === 'error') {
        return response;
      }
      
      // Clone response (can only be consumed once)
      const responseToCache = response.clone();
      
      // Update cache
      caches.open(CACHE_NAME)
        .then((cache) => {
          cache.put(request, responseToCache);
        });
      
      return response;
    });
}

// Message event - handle commands from client
self.addEventListener('message', (event) => {
  const { action, data } = event.data;
  
  switch (action) {
    case 'skipWaiting':
      self.skipWaiting();
      break;
      
    case 'clearCache':
      caches.delete(CACHE_NAME)
        .then(() => {
          event.ports[0].postMessage({ success: true });
        });
      break;
      
    case 'getStats':
      getCacheStats()
        .then((stats) => {
          event.ports[0].postMessage({ success: true, stats });
        });
      break;
      
    default:
      console.warn('[CoinBattle SW] Unknown action:', action);
  }
});

/**
 * Get cache statistics
 */
async function getCacheStats() {
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  
  const stats = {
    cacheVersion: CACHE_VERSION,
    cacheName: CACHE_NAME,
    cachedFiles: keys.length,
    files: keys.map(req => req.url)
  };
  
  return stats;
}

// Periodic cache cleanup (every hour)
setInterval(async () => {
  console.log('[CoinBattle SW] Running periodic cache cleanup...');
  
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  
  // Remove old entries (optional, based on custom logic)
  for (const request of keys) {
    const response = await cache.match(request);
    const dateHeader = response.headers.get('date');
    
    if (dateHeader) {
      const cacheDate = new Date(dateHeader);
      const now = new Date();
      const ageInHours = (now - cacheDate) / (1000 * 60 * 60);
      
      // Remove if older than 24 hours
      if (ageInHours > 24) {
        console.log('[CoinBattle SW] Removing old cache entry:', request.url);
        await cache.delete(request);
      }
    }
  }
}, 60 * 60 * 1000); // Every hour
