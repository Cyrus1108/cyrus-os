/* Cyrus OS Service Worker.
   Strategy:
   - App shell (HTML/CSS/JS/icon/manifest): cache-first, refresh in background.
   - Supabase API + Realtime WebSocket: network-only, never cache (dynamic data + RLS auth).
   - TradingView widgets and external CDNs: stale-while-revalidate.
   Bump CACHE_VERSION on every shell change to force clients to drop the old cache. */

const CACHE_VERSION = 'cyrus-os-v6.2.1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './styles/tokens.css',
  './styles/base.css',
  './styles/components.css',
  './styles/animations.css',
  './scripts/supabase.js',
  './scripts/state.js',
  './scripts/notifications.js',
  './scripts/creed.js',
  './scripts/drawer.js',
  './scripts/markets.js',
  './scripts/morning.js',
  './scripts/academics.js',
  './scripts/japanese.js',
  './scripts/trading.js',
  './scripts/todos.js',
  './scripts/sync.js',
  './scripts/auth.js',
  './scripts/app.js',
];

self.addEventListener('install', (event) => {
  // Pre-cache the app shell so the PWA boots offline
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  // Drop old caches and take control of any open tabs immediately
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only intercept GET; let everything else (POST/PATCH/DELETE etc.) pass through
  if (req.method !== 'GET') return;

  // Supabase API + Realtime: never cache — always go to network.
  // RLS is per-token and tokens rotate; serving stale data here would be a security/integrity bug.
  if (url.hostname.endsWith('.supabase.co')) return;

  // External CDNs (TradingView, jsdelivr, Google Fonts): stale-while-revalidate
  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req).then((res) => {
          // Only cache successful, same-type responses
          if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Same-origin (app shell): cache-first, then network
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Background refresh — don't block on it
        fetch(req).then((res) => {
          if (res && res.ok) caches.open(CACHE_VERSION).then((c) => c.put(req, res));
        }).catch(() => {});
        return cached;
      }
      return fetch(req);
    })
  );
});

/* Stage 4 will add a 'push' event listener here for Web Push from Cloudflare Workers. */
