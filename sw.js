const CACHE_VERSION = 'v1';
const SHELL_CACHE = `tentoo-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `tentoo-runtime-${CACHE_VERSION}`;
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

const PRECACHE_URLS = [
  './',
  'index.html',
  'style.css',
  'manifest.json',
  'palavras_aceitas.txt',
  'favicon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png',
  'js/constants.js',
  'js/helpers.js',
  'js/StorageService.js',
  'js/DictionaryService.js',
  'js/BoardComponent.js',
  'js/Confetti.js',
  'js/TentooGame.js',
  'js/WebMCPService.js',
  'js/gameState.js',
  'js/main.js',
  'js/jev/solver.js',
  'js/jev/jevClient.js',
  'js/jev/autoplay.js'
];

/** @param {Request} request @param {string} cacheName @returns {Promise<Response>} Cached response while the network refreshes the cache in the background */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(response => {
      if (response && (response.ok || response.type === 'opaque')) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);
  if (cached) {
    network.catch(() => undefined);
    return cached;
  }
  const response = await network;
  if (response) return response;
  return new Response('Offline', { status: 503, statusText: 'Offline' });
}

/** @param {Request} request @param {string} cacheName @returns {Promise<Response>} Fresh response when online, cached fallback when offline */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(PRECACHE_URLS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(key => key !== SHELL_CACHE && key !== RUNTIME_CACHE).map(key => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    if (FONT_HOSTS.includes(url.hostname)) {
      event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    }
    return;
  }
  if (url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }
  event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
});
