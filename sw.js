/* Cyrus OS Service Worker.
   Strategy:
   - App shell (HTML/CSS/JS/icon/manifest): cache-first, refresh in background.
   - Supabase API + Realtime WebSocket: network-only, never cache (dynamic data + RLS auth).
   - TradingView widgets and external CDNs: stale-while-revalidate.
   Bump CACHE_VERSION on every shell change to force clients to drop the old cache. */

const CACHE_VERSION = 'cyrus-os-v7.17.0';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png',
  './styles/tokens.css',
  './styles/base.css',
  './styles/components.css',
  './styles/animations.css',
  './styles/theme-sterile.css',
  './styles/finance.css',
  './styles/fitness.css',
  './styles/calendar.css',
  './styles/ai.css',
  './styles/motivation.css',
  './styles/system.css',
  './styles/lowday.css',
  './styles/principles.css',
  './scripts/supabase.js',
  './scripts/state.js',
  './scripts/notifications.js',
  './scripts/drawer.js',
  './scripts/markets.js',
  './scripts/morning.js',
  './scripts/academics.js',
  './scripts/japanese.js',
  './scripts/trading.js',
  './scripts/todos.js',
  './scripts/the90.js',
  './scripts/hermes.js',
  './scripts/finance.js',
  './scripts/finance-charts.js',
  './scripts/fitness.js',
  './scripts/calendar.js',
  './scripts/ai.js',
  './scripts/motivation.js',
  './scripts/sound.js',
  './scripts/rpg.js',
  './scripts/lowday.js',
  './scripts/principles.js',
  './scripts/glass.js',
  './scripts/herocube.js',
  './vendor/gsap.min.js',
  './vendor/ScrollTrigger.min.js',
  './vendor/SplitText.min.js',
  './vendor/lenis.min.js',
  './vendor/three.module.js',
  './vendor/supabase.js',
  './vendor/chart.umd.min.js',
  './scripts/applock.js',
  './scripts/theme.js',
  './scripts/ambient.js',
  './scripts/lifetree.js',
  './scripts/dragsort.js',
  './scripts/swipe.js',
  './scripts/sync.js',
  './scripts/auth.js',
  './scripts/app.js',
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

/* ════════════ Web Push (Stage 4) ════════════ */

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'Cyrus OS', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'Cyrus OS';
  const options = {
    body: payload.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: payload.tag || 'cyrus-os',
    requireInteraction: false,
    data: { url: payload.url || './' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

/* Clicking a notification focuses an existing PWA window or opens a new one */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) {
          // navigate the existing window to the payload URL before focusing
          if ('navigate' in c && target) { return c.navigate(target).then((cl) => (cl || c).focus()).catch(() => c.focus()); }
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
