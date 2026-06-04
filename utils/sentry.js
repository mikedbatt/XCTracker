// ── Sentry crash + error monitoring ──────────────────────────────────────────
// Initialized once at app startup. Reports JS errors, unhandled promise
// rejections, and (on native) native crashes. Web and native share one DSN —
// @sentry/react-native handles both platforms.
//
// Without EXPO_PUBLIC_SENTRY_DSN set in .env, this is a no-op so dev / CI
// builds don't try to talk to Sentry.
//
// One-time setup:
// 1. Create a free Sentry account at https://sentry.io
// 2. Create a project ("React Native" type)
// 3. Copy the DSN (looks like https://abc123@o12345.ingest.sentry.io/67890)
// 4. Add to .env:  EXPO_PUBLIC_SENTRY_DSN=https://abc123@...
// 5. For symbolicated stack traces on native, follow the Sentry React Native
//    Expo guide for the EAS build hook (one extra plugin in app.json).

import * as Sentry from '@sentry/react-native';

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initSentry() {
  if (!SENTRY_DSN) {
    if (__DEV__) {
      // Don't spam the dev console for every reload — log once.
      if (!global.__sentryWarned) {
        console.warn('[sentry] EXPO_PUBLIC_SENTRY_DSN not set; error monitoring disabled');
        global.__sentryWarned = true;
      }
    }
    return;
  }
  // Wrap in try/catch so a Sentry init failure (missing native module,
  // bad DSN, network issue, etc.) never crashes the app on launch. If
  // monitoring is broken we'd rather know via missing events than via
  // a startup crash that locks all users out.
  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      // Don't report errors from dev builds (too noisy, drowns out real issues)
      enabled: !__DEV__,
      // Lower this if quota becomes a concern; 10% performance trace sample is fine for now.
      tracesSampleRate: 0.1,
      environment: __DEV__ ? 'development' : 'production',
      // Capture unhandled promise rejections in addition to thrown errors.
      enableAutoPerformanceTracing: true,
    });

    // Expose on window for in-browser smoke testing. Newer @sentry/react-native
    // versions don't auto-expose anymore; without this you can't call
    // captureException from the DevTools console. Web-only; native ignores.
    if (typeof window !== 'undefined') {
      window.Sentry = Sentry;
    }
  } catch (e) {
    console.warn('[sentry] init failed; continuing without monitoring:', e?.message || e);
  }
}

// Re-export so call sites can do explicit Sentry.captureException(e) inside
// catch blocks for events worth highlighting beyond what's auto-captured.
export { Sentry };
