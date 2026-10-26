// ── Garmin Connect client helpers ────────────────────────────────────────────
// The whole OAuth 2.0 + PKCE handshake is server-driven: garminAuthStart
// generates the PKCE verifier + a random `state` and stores them server-side
// (garminOAuthStates/{state}); the client only navigates to the returned URL
// and hands `code` + `state` back. Nothing has to survive in browser storage,
// which matters because an installed PWA often returns from Garmin's login in
// a different browser context (empty sessionStorage, sometimes signed out).
//
// Garmin's Starter tier is push-only: runs arrive via the garminWebhook Cloud
// Function a few minutes after the athlete's watch syncs to Garmin Connect.
// There is no client-side "sync" — the app just reads the runs collection.
// Tokens are stored server-side (garminTokens/{uid}); the user doc only holds
// garminConnected / garminLastSync / garminBackfill.

const FUNCTIONS_BASE = 'https://us-central1-xctracker-a2532.cloudfunctions.net';

// Legacy connections (pre-2026-10) only have garminAccessToken on the user doc
// until the server migrates them on first touch.
export function isGarminConnected(userData) {
  return !!(userData?.garminConnected || userData?.garminAccessToken);
}

// ── Cloud Function calls ─────────────────────────────────────────────────────
// Sends the caller's Firebase ID token when signed in. Errors carry the
// server's user-facing message. `requireAuth: false` is only for the token
// exchange, where the one-time `state` identifies the user.
async function callGarminFunction(name, body = {}, { requireAuth = true } = {}) {
  const { auth } = await import('./firebaseConfig');
  const user = auth.currentUser;
  if (!user && requireAuth) throw new Error('Please sign in, then try again.');
  const headers = { 'Content-Type': 'application/json' };
  if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
  const response = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Garmin request failed (${response.status})`);
  return data;
}

// Starts a connection attempt. Returns { authUrl, state } — navigate to
// authUrl; Garmin redirects to redirectUri with ?code=…&state=….
export function startGarminAuth(redirectUri) {
  return callGarminFunction('garminAuthStart', { redirectUri });
}

// Finishes the connection (tokens stored server-side). Runs sync from the
// moment of connection — past runs need Garmin Enterprise access (see
// GARMIN_HISTORY_ENABLED in functions/index.js). Shared by the web callback
// route and the native in-app browser flow. Returns { connected, backfill }.
export function connectGarminWithCode(code, state) {
  return callGarminFunction('garminTokenExchange', { code, state }, { requireAuth: false });
}

// Deregisters at Garmin and deletes stored tokens. Existing runs are kept.
export function disconnectGarmin() {
  return callGarminFunction('garminDisconnect');
}
