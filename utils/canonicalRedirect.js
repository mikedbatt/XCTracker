// ── Canonical host redirect (web) ────────────────────────────────────────────
// xctracker.com is the canonical domain. Anyone who opens the old Firebase
// Hosting default URLs (*.web.app / *.firebaseapp.com), or an old PWA install
// pinned to them, is forwarded to xctracker.com — preserving the path, query,
// and hash so deep links and the Strava OAuth callback (?code=…) survive.
//
// IMPORTANT: only ship this once xctracker.com is live (DNS Connected + SSL),
// otherwise it would forward users to a domain that isn't serving yet. Runs as
// the first thing on web startup (app/index.tsx). No-op on the canonical host
// and on native.
import { Platform } from 'react-native';

const CANONICAL_HOST = 'xctracker.com';
const LEGACY_HOSTS = ['xctracker-a2532.web.app', 'xctracker-a2532.firebaseapp.com'];

export function redirectToCanonicalHost() {
  if (Platform.OS !== 'web') return;
  if (typeof window === 'undefined' || !window.location) return;
  const { hostname, pathname, search, hash } = window.location;
  if (!LEGACY_HOSTS.includes(hostname)) return;
  // replace() (not assign) so the legacy URL doesn't linger in history.
  window.location.replace(`https://${CANONICAL_HOST}${pathname}${search}${hash}`);
}
