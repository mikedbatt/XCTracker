// ── App + FCM service worker ────────────────────────────────────────────────
// This single service worker (only one may own the "/" scope) does two jobs:
//
//   1. INSTALLABILITY + OFFLINE — the install/activate/fetch handlers below give
//      the PWA a fetch handler registered on every page load. Android Chrome only
//      offers "Install app" once it sees a fetch-handling service worker, so this
//      is what makes the app installable on Android. It also caches the hashed
//      static bundle and falls back to a cached shell when offline.
//
//   2. BACKGROUND PUSH — Firebase Cloud Messaging delivery when the app is
//      backgrounded/closed. Foreground messages are handled by utils/webPush.js.
//
// Registered eagerly at startup by utils/registerServiceWorker.js (NOT gated on
// notification permission) so installability works for first-time visitors.
//
// Config values are passed in via the registration URL's query string so we
// don't duplicate firebaseConfig values across two files.

// ── Background push (FCM) ────────────────────────────────────────────────────
// Wrapped in try/catch: if config is missing or messaging fails to init, push
// is simply unavailable — installability + offline (below) must still work.
try {
  importScripts('https://www.gstatic.com/firebasejs/12.10.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/12.10.0/firebase-messaging-compat.js');

  const params = new URL(location).searchParams;
  firebase.initializeApp({
    apiKey:            params.get('apiKey'),
    authDomain:        params.get('authDomain'),
    projectId:         params.get('projectId'),
    storageBucket:     params.get('storageBucket'),
    messagingSenderId: params.get('messagingSenderId'),
    appId:             params.get('appId'),
  });

  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const { title, body } = payload.notification || {};
    const data = payload.data || {};
    self.registration.showNotification(title || 'TeamBase', {
      body: body || '',
      icon: '/favicon.png',
      data,
    });
  });

  // Focus / open the app when the user clicks the notification.
  self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil((async () => {
      const clientsList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = clientsList.find(c => 'focus' in c);
      if (existing) return existing.focus();
      return clients.openWindow('/');
    })());
  });
} catch (e) {
  // Push unavailable in this context — installability + offline still apply.
}

// ── Installability + offline app shell ───────────────────────────────────────
const CACHE = 'teambase-shell-v2';
// Bump SW_BUILD to ship a service-worker change that force-reloads open PWAs
// (via the navigate-on-activate below) WITHOUT clearing the asset cache — so the
// forced reload stays fast. CACHE name stays the same so cached bundles persist.
const SW_BUILD = 3;

// Precache the app shell so navigations work offline. skipWaiting() activates
// this SW immediately rather than waiting for all tabs to close.
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.add('/index.html').catch(() => {}); // best-effort precache
    await self.skipWaiting();
  })());
});

// Drop caches from older deploys, take control of open pages, then force any
// open window to reload onto the new build. This bootstraps an installed PWA
// onto the latest version (incl. the in-app auto-updater) without the user
// having to delete + reinstall — as soon as a new SW activates, open windows
// reload to fresh content.
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
    const wins = await self.clients.matchAll({ type: 'window' });
    for (const w of wins) { try { await w.navigate(w.url); } catch (e) { /* ignore */ } }
  })());
});

// Fetch strategy:
//   • Navigations → network-first (always fresh app shell), cached index.html
//     as the offline fallback.
//   • Hashed static assets (/_expo/static/**) → cache-first; they're
//     content-hashed and immutable, so a cache hit is always correct.
//   • Everything else (Firebase, Strava, cross-origin) → untouched, straight to
//     the network. We never intercept non-GET or cross-origin requests.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        const cached = await caches.match('/index.html');
        return cached || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/_expo/static/')) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const res = await fetch(request);
      if (res.ok) {
        const cache = await caches.open(CACHE);
        cache.put(request, res.clone());
      }
      return res;
    })());
  }
});
