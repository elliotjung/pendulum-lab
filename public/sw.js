const VERSION = 'pendulum-lab-v10.36.0';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const RUNTIME_CACHE_LIMIT = 96;
const SHELL = ['./', './index.html', './app.html', './manifest.webmanifest'];
const CACHE_BYPASS_MODES = new Set(['no-store', 'reload', 'no-cache']);
const STATIC_DESTINATIONS = new Set(['script', 'style', 'image', 'font', 'manifest', 'worker']);
const STATIC_PATH = /\.(?:avif|css|gif|html?|ico|jpe?g|m?js|otf|png|svg|ttf|wasm|webmanifest|webp|woff2?)$/i;

async function trimRuntimeCache(cache) {
  const keys = await cache.keys();
  const overflow = keys.length - RUNTIME_CACHE_LIMIT;
  if (overflow <= 0) return;
  await Promise.all(keys.slice(0, overflow).map((request) => cache.delete(request)));
}

async function cacheRuntimeResponse(request, response) {
  if (!response.ok) return;
  const cacheControl = response.headers?.get?.('cache-control') || '';
  if (/\b(?:no-store|private)\b/i.test(cacheControl)) return;
  // Clone before the first await: respondWith may start consuming the original
  // response as soon as this microtask yields.
  const copy = response.clone();
  const cache = await caches.open(RUNTIME_CACHE);
  await cache.put(request, copy);
  await trimRuntimeCache(cache);
}

function settle(promise, warning) {
  return promise.catch((error) => console.warn(warning, error));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('pendulum-lab-v') && key !== SHELL_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Let the browser perform explicit refresh/bypass requests directly. In
  // particular, a `no-store` request must neither read nor populate our caches.
  if (CACHE_BYPASS_MODES.has(request.cache)) return;
  if (request.mode === 'navigate') {
    const networkResponse = fetch(request);
    const cacheUpdate = networkResponse.then((response) => cacheRuntimeResponse(request, response));
    const response = networkResponse.catch(
      async () => (await caches.match(request)) || (await caches.match('./index.html')) || Response.error()
    );
    event.respondWith(response);
    event.waitUntil(settle(cacheUpdate, 'Pendulum Lab navigation cache update failed.'));
    return;
  }
  const isStaticRequest = STATIC_DESTINATIONS.has(request.destination) || STATIC_PATH.test(url.pathname);
  if (!isStaticRequest) return;
  const outcome = caches.match(request).then(async (cached) => {
    if (cached) return { response: cached, shouldCache: false };
    return { response: await fetch(request), shouldCache: true };
  });
  // Register the cache continuation before exposing the Response so cloning
  // always happens before the browser can consume its body.
  const cacheUpdate = outcome.then(({ response, shouldCache }) =>
    shouldCache ? cacheRuntimeResponse(request, response) : undefined
  );
  const response = outcome.then(({ response: resolved }) => resolved);
  event.respondWith(response);
  event.waitUntil(settle(cacheUpdate, 'Pendulum Lab runtime cache update failed.'));
});
