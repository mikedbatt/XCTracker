// ── Root HTML for the web build ──────────────────────────────────────────────
// Expo Router renders every static page inside this shell. We use it to inject
// a branded loading splash that appears the instant the page loads — before
// React/JS even parses — so mobile users on slow connections see something
// other than a white screen for the first ~3-5 seconds.
//
// The splash uses CSS `#root:empty` so it auto-vanishes the moment React
// mounts anything into #root. No JS required to hide it.

import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

const loadingSplashCSS = `
  /* Brand splash visible until React hydrates anything into #root */
  #root:empty::before {
    content: '';
    position: fixed;
    inset: 0;
    background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);
    z-index: 9999;
  }
  #root:empty::after {
    content: 'TeamBase';
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.5px;
    z-index: 10000;
    animation: tbFadeIn 0.4s ease-out;
  }
  @keyframes tbFadeIn {
    from { opacity: 0; transform: scale(0.96); }
    to   { opacity: 1; transform: scale(1); }
  }
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />

        {/* ── PWA / installability ── */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#4F46E5" />
        <meta name="description" content="Team training platform for distance-running programs — log runs, sync from Strava, track pace zones, and see team analytics." />
        {/* iOS home-screen install */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="TeamBase" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />

        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: loadingSplashCSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
