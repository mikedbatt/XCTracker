// ── Sentry crash + error monitoring (web only for now) ─────────────────────
// Native is intentionally disabled — @sentry/react-native requires the
// @sentry/react-native/expo config plugin in app.json to link its native
// module, and that plugin currently breaks our Gradle build (likely a
// new-architecture / React Compiler interaction). Web is where Sentry's
// main value sits today (browser errors from web-only users), so we gate
// the package import + init to web. Native crashes go to native crash
// reporting (none right now — future work).
//
// CRITICAL: do NOT static-import @sentry/react-native here. Even without
// calling init, the module's top-level code accesses native bridges that
// don't exist on Android/iOS without the config plugin → app crashes on
// launch. The dynamic import inside initSentry keeps the module out of
// the native bundle entirely.

import { Platform } from 'react-native';

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export async function initSentry() {
  if (Platform.OS !== 'web') return;

  if (!SENTRY_DSN) {
    if (__DEV__) {
      if (!global.__sentryWarned) {
        console.warn('[sentry] EXPO_PUBLIC_SENTRY_DSN not set; error monitoring disabled');
        global.__sentryWarned = true;
      }
    }
    return;
  }

  try {
    // Dynamic import so the @sentry/react-native package is NEVER pulled
    // into the native bundle. Web only.
    const Sentry = await import('@sentry/react-native');
    Sentry.init({
      dsn: SENTRY_DSN,
      enabled: !__DEV__,
      tracesSampleRate: 0.1,
      environment: __DEV__ ? 'development' : 'production',
      enableAutoPerformanceTracing: true,
    });
    // Expose on window for in-browser smoke testing. Web only.
    if (typeof window !== 'undefined') {
      window.Sentry = Sentry;
    }
  } catch (e) {
    console.warn('[sentry] init failed; continuing without monitoring:', e?.message || e);
  }
}
