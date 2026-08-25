/* Cyrus OS Service Worker.
   Strategy:
   - App shell (HTML/CSS/JS/icon/manifest): cache-first, refresh in background.
   - Supabase API + Realtime WebSocket: network-only, never cache (dynamic data + RLS auth).
   - TradingView widgets and external CDNs: stale-while-revalidate.
   Bump CACHE_VERSION on every shell change to force clients to drop the old cache. */

const CACHE_VERSION = 'cyrus-os-v7.40.0';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/cover-crest.png',
  './vendor/icons.svg',
  './styles/tokens.css',
  './styles/fonts.css',
  './styles/base.css',
  './styles/components.css?v=7.39.0',
  './styles/theme-terminal.css?v=7.37.0',
  './styles/theme-notebook.css?v=7.39.0',
  './styles/animations.css',
  './styles/finance.css',
  './styles/calendar.css',
  './styles/system.css',
  './styles/lowday.css',
  './styles/principles.css',
  './scripts/supabase.js',
  './scripts/state.js',
  './scripts/render-core.js',
  './scripts/beat.js',
  './scripts/sovereign.js',
  './scripts/drawer.js',
  './scripts/morning.js',
  './scripts/trading.js',
  './scripts/todos.js',
  './scripts/the90.js',
  './scripts/goals.js',
  './scripts/finance.js',
  './scripts/finance-charts.js',
  './scripts/calendar.js',
  './scripts/sound.js',
  './scripts/rpg.js',
  './scripts/lowday.js',
  './scripts/principles.js',
  './scripts/glass.js',
  './scripts/energyflow.js?v=7.35.0',
  './scripts/crest.js',
  './vendor/gsap.min.js',
  './vendor/ScrollTrigger.min.js',
  './vendor/SplitText.min.js',
  './vendor/lenis.min.js',
  './vendor/three.module.js',
  './vendor/supabase.js',
  './vendor/chart.umd.min.js',
  './vendor/fonts/inter-var-latin.woff2',
  './vendor/fonts/inter-var-latin-ext.woff2',
  './vendor/fonts/jetbrains-mono-var-latin.woff2',
  './vendor/fonts/jetbrains-mono-var-latin-ext.woff2',
  './vendor/fonts/oswald-var-latin.woff2',
  './vendor/fonts/oswald-var-latin-ext.woff2',
  './scripts/applock.js',
  './scripts/theme.js',
  './scripts/dragsort.js',
  './scripts/swipe.js',
  './scripts/sync.js',
  './scripts/auth.js',
  './scripts/app.js',
  './sounds/sao-menu.mp3',
  './sounds/sao-menu-select.mp3',
];

self.addEventListener('install', (event) => {
  // Pre-cache the app shell so the PWA boots offline
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // Force-revalidate every shell entry on install so a CSS/JS edit always
      // wins over the browser HTTP cache once a new SW version takes over.
      // Per-asset add().catch() so one missing/404 path can't brick the whole install.
      Promise.all(APP_SHELL.map((u) =>
        cache.add(new Request(u, { cache: 'no-cache' })).catch((e) => console.warn('[sw] precache miss', u, e))
      ))
    ).then(() => self.skipWaiting())
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
        }).catch(() => cached || new Response('', { status: 504, statusText: 'offline' }));
        return cached || network;
      })
    );
    return;
  }

  // Navigation requests (magic-link return, deep-links, offline reload):
  // network-first so live HTML picks up new deploys, with the precached
  // shell as the offline fallback so we never serve a blank page.
  if (req.mode === 'navigation') {
    event.respondWith(fetch(req).catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))));
    return;
  }

  // Same-origin (app shell): cache-first, then network
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Background refresh — don't block on it (skip navigations so we
        // never store query-keyed nav variants in the version cache)
        if (req.mode !== 'navigation') {
          fetch(req).then((res) => {
            if (res && res.ok) caches.open(CACHE_VERSION).then((c) => c.put(req, res));
          }).catch(() => {});
        }
        return cached;
      }
      return fetch(req);
    })
  );
});
