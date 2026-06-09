// ── Eager service worker registration ────────────────────────────────────────
// Registers the app service worker (public/firebase-messaging-sw.js) at startup
// for EVERY web visitor — logged in or not, push opted-in or not. This is what
// makes the PWA installable on Android: Chrome only offers "Install app" once a
// fetch-handling service worker is registered on page load.
//
// Push (utils/webPush.js) later calls navigator.serviceWorker.register() with
// the SAME URL. Registering an identical script URL is idempotent — it returns
// this existing registration rather than creating a second one — so the two
// paths cooperate. Keep the config key order below IN SYNC with webPush.js so
// the URLs stay byte-identical.

import { Platform } from 'react-native';

export function registerServiceWorker() {
  if (Platform.OS !== 'web') return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  const cfg = {
    apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
    authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
    storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
  };
  const swUrl = '/firebase-messaging-sw.js?' + new URLSearchParams(cfg).toString();

  // Reload once when a new service worker takes control (it activates + claims
  // on deploy) so the page swaps to the fresh build.
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  // Register after load so the SW install never competes with first paint.
  const register = () => {
    navigator.serviceWorker
      .register(swUrl)
      .then((reg) => {
        // Proactively check for a new SW whenever the app regains focus — this
        // is what makes an installed PWA pick up a deploy on reopen.
        const checkForUpdate = () => { reg.update().catch(() => {}); };
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') checkForUpdate();
        });
        window.addEventListener('focus', checkForUpdate);
      })
      .catch((e) => console.warn('Service worker registration failed:', e));
  };

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
