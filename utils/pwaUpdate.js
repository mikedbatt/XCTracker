// ── PWA auto-update detection ────────────────────────────────────────────────
// An installed PWA keeps serving the version it was opened with until a full
// navigation happens — so a fresh deploy isn't picked up just by reopening the
// app from the home screen. This watches for a new build and notifies the app
// so it can offer a one-tap reload.
//
// How it works: each web build emits a content-hashed `entry-<hash>.js`. We read
// the hash the app is currently running, then re-fetch index.html (bypassing all
// caches) whenever the app regains focus. If the deployed hash differs, a new
// version is live.

import { Platform } from 'react-native';

export function initPwaAutoUpdate(onUpdateAvailable) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;

  const entryRe = /entry-[a-z0-9]+\.js/i;
  const runningSrc = document.querySelector('script[src*="/entry-"]')?.getAttribute('src') || '';
  const running = (runningSrc.match(entryRe) || [])[0];
  if (!running) return; // can't determine current version — skip

  let notified = false;
  const check = async () => {
    if (notified) return;
    try {
      // Cache-busted, no-store fetch → always the freshly deployed index.html.
      const res = await fetch('/?_=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return;
      const html = await res.text();
      const latest = (html.match(entryRe) || [])[0];
      if (latest && latest !== running) {
        notified = true;
        onUpdateAvailable();
      }
    } catch {
      // offline or transient — ignore, we'll check again on next focus
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  window.addEventListener('focus', check);
  // Also check shortly after launch (covers the reopen-from-home-screen case).
  setTimeout(check, 4000);
}

// Hard reload that also clears the service-worker caches so the new build's
// hashed assets are fetched fresh.
export async function reloadForUpdate() {
  if (typeof window === 'undefined') return;
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {}
  window.location.reload();
}
