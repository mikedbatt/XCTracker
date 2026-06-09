// ── Resilient React.lazy ─────────────────────────────────────────────────────
// Content-hashed chunks (e.g. CoachDashboard-<hash>.js) change every web deploy.
// A client still running an OLD index.html can ask for a chunk hash the latest
// deploy already replaced. Firebase Hosting's SPA rewrite then serves index.html
// (HTML, status 200) for that missing .js, so the browser parses HTML as
// JavaScript → "SyntaxError: Unexpected token '<'" → the dynamic import rejects →
// the app freezes on the loading splash (no error boundary under <Suspense>).
//
// Wrapping the import lets us catch that failure and do ONE full reload. A reload
// re-fetches the fresh index.html (served no-cache + network-first by the SW),
// which references the current chunk hashes — so the second load succeeds.
//
// The sessionStorage throttle prevents an infinite reload loop if a chunk is
// genuinely broken (not just stale): we reload at most once per 10s window, then
// fall through to the real error so it surfaces instead of looping.
import { lazy } from 'react';

export function lazyWithReload(factory) {
  return lazy(() =>
    factory().catch((err) => {
      try {
        const canReload =
          typeof window !== 'undefined' &&
          window.location &&
          typeof window.location.reload === 'function';
        const store = typeof sessionStorage !== 'undefined' ? sessionStorage : null;
        const KEY = 'chunkReloadAt';
        const last = store ? Number(store.getItem(KEY) || 0) : 0;
        if (canReload && Date.now() - last > 10000) {
          if (store) store.setItem(KEY, String(Date.now()));
          window.location.reload();
          // Hold the render so React shows the splash (not the error) until the
          // reload takes over.
          return new Promise(() => {});
        }
      } catch (_) {
        // Fall through to rethrow the original error.
      }
      throw err;
    })
  );
}
