const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const crypto = require('crypto');
const { Expo } = require('expo-server-sdk');

admin.initializeApp();
const db = admin.firestore();
const expo = new Expo();

// ── FCM web push helper ──────────────────────────────────────────────────────
async function sendWebPushNotifications(messages) {
  if (!messages || messages.length === 0) return;
  await Promise.all(messages.map(m =>
    admin.messaging().send({
      token: m.token,
      notification: { title: m.title, body: m.body },
      ...(m.data && {
        data: Object.fromEntries(
          Object.entries(m.data).map(([k, v]) => [k, String(v)])
        ),
      }),
    }).catch(e => {
      // Token belongs to an uninstalled app / cleared browser: drop it from
      // every user doc that holds it so it isn't retried on every send.
      if (DEAD_FCM_TOKEN_CODES.has(e.code)) return removeDeadWebPushToken(m.token);
      console.warn('FCM web send error:', e.code || '', e.message);
    })
  ));
}

const DEAD_FCM_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

async function removeDeadWebPushToken(token) {
  try {
    const snap = await db.collection('users').where('webPushToken', '==', token).get();
    await Promise.all(snap.docs.map(d =>
      d.ref.update({ webPushToken: admin.firestore.FieldValue.delete() })));
    if (snap.size) console.log(`Removed dead web push token from ${snap.size} user(s)`);
  } catch (e) {
    console.warn('removeDeadWebPushToken failed:', e.message);
  }
}

// ── Garmin ────────────────────────────────────────────────────────────────────
// Garmin's Starter tier is push-only: new activities arrive via garminWebhook
// when the athlete's watch syncs to Garmin Connect. History is requested with
// Garmin's Backfill service, which queues the request (HTTP 202) and pushes the
// historical activities to the same webhook over the following minutes.
//
// OAuth tokens live in garminTokens/{uid} — server-only (no rule matches the
// collection, so the catch-all deny applies; the Admin SDK bypasses rules).
// User docs are readable by every signed-in user, so the user doc carries only
// non-secret status: garminConnected, garminLastSync, garminBackfill.
//
// All endpoints stay onRequest (not onCall) — same reasoning as the prior
// (since-removed) Strava functions. maxInstances caps cost-abuse exposure.

const GARMIN_RUNTIME = { maxInstances: 10 };
const GARMIN_TOKEN_URL = 'https://diauth.garmin.com/di-oauth2-service/oauth/token';
const GARMIN_API = 'https://apis.garmin.com/wellness-api/rest';
// Historical data (Backfill) is Enterprise-only: on the Starter tier Garmin
// answers 412 "required HISTORICAL_DATA_EXPORT". Flip to true after Enterprise
// onboarding — connect then requests history and the dashboard's import banner
// (driven by users.garminBackfill) appears on its own.
const GARMIN_HISTORY_ENABLED = false;
const GARMIN_BACKFILL_DAYS = 60;
const GARMIN_BACKFILL_CHUNK_DAYS = 30; // keep each backfill request well under Garmin's per-request range cap

const garminTokensRef = uid => db.collection('garminTokens').doc(uid);

// Pre-2026-10 connections stored tokens on the (team-readable) user doc.
const legacyGarminFieldDeletes = () => ({
  garminAccessToken:  admin.firestore.FieldValue.delete(),
  garminRefreshToken: admin.firestore.FieldValue.delete(),
  garminTokenExpiry:  admin.firestore.FieldValue.delete(),
  garminUserId:       admin.firestore.FieldValue.delete(),
});

function setGarminCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

// Verifies the caller's Firebase ID token. Sends the 401 itself and returns
// null on failure.
async function verifyGarminCaller(req, res) {
  const m = (req.headers.authorization || '').match(/^Bearer (.+)$/);
  if (!m) { res.status(401).json({ error: 'Missing auth token' }); return null; }
  try {
    const decoded = await admin.auth().verifyIdToken(m[1]);
    return decoded.uid;
  } catch (e) {
    res.status(401).json({ error: 'Invalid auth token' }); return null;
  }
}

async function fetchGarminUserId(accessToken) {
  const resp = await fetch(`${GARMIN_API}/user/id`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    console.warn(`fetchGarminUserId: ${resp.status} ${await resp.text()}`);
    return null;
  }
  const profile = await resp.json();
  return profile.userId ?? null;
}

async function refreshGarminToken(uid, tokens) {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken,
    client_id: process.env.GARMIN_CLIENT_ID,
    client_secret: process.env.GARMIN_CLIENT_SECRET,
  });
  const resp = await fetch(GARMIN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!resp.ok) throw new Error(`Garmin token refresh failed (${resp.status})`);
  const t = await resp.json();
  const update = {
    accessToken:  t.access_token,
    refreshToken: t.refresh_token ?? tokens.refreshToken,
    expiresAt:    t.expires_in ? Math.floor(Date.now() / 1000) + t.expires_in : null,
  };
  await garminTokensRef(uid).update(update);
  return update.accessToken;
}

async function getValidGarminToken(uid, tokens) {
  const nowSecs = Math.floor(Date.now() / 1000);
  if (tokens.expiresAt && tokens.expiresAt > nowSecs + 300) return tokens.accessToken;
  return refreshGarminToken(uid, tokens);
}

// Returns the user's Garmin tokens, moving legacy user-doc tokens into
// garminTokens/{uid} on first touch. Null if Garmin isn't connected.
async function loadGarminTokens(uid) {
  const snap = await garminTokensRef(uid).get();
  if (snap.exists) return snap.data();

  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const user = userSnap.exists ? userSnap.data() : null;
  if (!user?.garminAccessToken) return null;

  const tokens = {
    accessToken:  user.garminAccessToken,
    refreshToken: user.garminRefreshToken ?? null,
    expiresAt:    user.garminTokenExpiry ?? null,
    garminUserId: user.garminUserId ?? null,
  };
  await garminTokensRef(uid).set(tokens);
  await userRef.update({ ...legacyGarminFieldDeletes(), garminConnected: true });
  console.log(`loadGarminTokens: migrated legacy tokens for uid=${uid}`);
  return tokens;
}

// Asks Garmin to push the last `days` of activities to garminWebhook. 202 =
// queued; 409 = that window was already requested (Garmin backfills a window
// only once), which we count as success. Records the outcome on the user doc
// so the client can show import status.
async function requestGarminBackfill(uid, accessToken, days) {
  const now = Math.floor(Date.now() / 1000);
  const start = now - days * 86400;
  let failure = null;
  let reason = null;

  for (let chunkStart = start; chunkStart < now; chunkStart += GARMIN_BACKFILL_CHUNK_DAYS * 86400) {
    const chunkEnd = Math.min(chunkStart + GARMIN_BACKFILL_CHUNK_DAYS * 86400, now);
    const resp = await fetch(
      `${GARMIN_API}/backfill/activities` +
      `?summaryStartTimeInSeconds=${chunkStart}&summaryEndTimeInSeconds=${chunkEnd}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (resp.status === 202 || resp.status === 409 || resp.ok) continue;
    const body = await resp.text();
    failure = `${resp.status} ${body.slice(0, 200)}`;
    // 412 "required HISTORICAL_DATA_EXPORT" = the athlete didn't leave the
    // historical-data toggle on in Garmin's consent screen. Only a reconnect
    // (re-consent) fixes it, so the client offers that instead of a retry.
    if (body.includes('HISTORICAL_DATA_EXPORT')) reason = 'permission';
    console.error(`requestGarminBackfill uid=${uid}: ${failure}`);
    break;
  }

  const garminBackfill = {
    status: failure ? 'failed' : 'requested',
    ...(reason && { reason }),
    days,
    requestedAt: new Date().toISOString(),
  };
  await db.collection('users').doc(uid).update({ garminBackfill });
  return garminBackfill;
}

// Finds the XCTracker uid for a Garmin push. Prefers the stable garminUserId,
// falls back to the access token, then to legacy user-doc fields (migrating).
async function findUidForGarminUser(garminUserId, userAccessToken) {
  if (garminUserId) {
    const q = await db.collection('garminTokens')
      .where('garminUserId', '==', garminUserId).limit(1).get();
    if (!q.empty) return q.docs[0].id;
  }
  if (userAccessToken) {
    const q = await db.collection('garminTokens')
      .where('accessToken', '==', userAccessToken).limit(1).get();
    if (!q.empty) {
      if (garminUserId) await q.docs[0].ref.update({ garminUserId });
      return q.docs[0].id;
    }
  }
  const legacyQueries = [];
  if (garminUserId) legacyQueries.push(['garminUserId', garminUserId]);
  if (userAccessToken) legacyQueries.push(['garminAccessToken', userAccessToken]);
  for (const [field, value] of legacyQueries) {
    const q = await db.collection('users').where(field, '==', value).limit(1).get();
    if (q.empty) continue;
    const uid = q.docs[0].id;
    await loadGarminTokens(uid);
    if (garminUserId) await garminTokensRef(uid).update({ garminUserId });
    return uid;
  }
  return null;
}

// Removes the connection on our side. Garmin-side deregistration (if any) is
// the caller's job.
async function clearGarminConnection(uid) {
  await garminTokensRef(uid).delete();
  await db.collection('users').doc(uid).update({
    ...legacyGarminFieldDeletes(),
    garminConnected: false,
    garminLastSync:  admin.firestore.FieldValue.delete(),
    garminBackfill:  admin.firestore.FieldValue.delete(),
  });
}

// ── Garmin OAuth start ───────────────────────────────────────────────────────
// The PKCE verifier lives server-side in garminOAuthStates/{state}, not in the
// browser. An installed PWA often opens Garmin's login in a separate browser
// context, so the return to /garmin-callback can land somewhere with different
// sessionStorage (and sometimes no Firebase sign-in). The random `state` comes
// back in the redirect URL and is all the callback needs.
const GARMIN_AUTH_URL = 'https://connect.garmin.com/oauth2Confirm';
const GARMIN_OAUTH_STATE_TTL_MS = 15 * 60 * 1000;
const GARMIN_WEB_REDIRECTS = [
  'https://xctracker.com/garmin-callback',
  'https://xctracker-a2532.web.app/garmin-callback',
  'http://localhost:8081/garmin-callback',
];
const isAllowedGarminRedirect = uri =>
  GARMIN_WEB_REDIRECTS.includes(uri) || uri === 'xctracker://garmin-auth';

const garminOAuthStatesRef = state => db.collection('garminOAuthStates').doc(state);

exports.garminAuthStart = functions
  .runWith(GARMIN_RUNTIME)
  .https.onRequest(async (req, res) => {
    setGarminCors(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return; }

    const uid = await verifyGarminCaller(req, res);
    if (!uid) return;

    const { redirectUri } = req.body || {};
    if (!redirectUri || !isAllowedGarminRedirect(redirectUri)) {
      res.status(400).json({ error: 'Invalid redirect URI' }); return;
    }

    try {
      // One pending attempt per user — drop abandoned ones.
      const stale = await db.collection('garminOAuthStates').where('uid', '==', uid).get();
      await Promise.all(stale.docs.map(d => d.ref.delete()));

      const codeVerifier = crypto.randomBytes(32).toString('base64url');
      const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
      const state = crypto.randomBytes(24).toString('base64url');
      await garminOAuthStatesRef(state).set({ uid, codeVerifier, redirectUri, createdAt: Date.now() });

      const authUrl = `${GARMIN_AUTH_URL}?` + new URLSearchParams({
        response_type: 'code',
        client_id: process.env.GARMIN_CLIENT_ID,
        redirect_uri: redirectUri,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state,
      }).toString();
      res.json({ authUrl, state });
    } catch (e) {
      console.error('garminAuthStart error:', e);
      res.status(500).json({ error: 'Could not start the Garmin connection.' });
    }
  });

// ── Garmin token exchange (+ first-connect history import when enabled) ──────
// Redeems the one-time `state` from garminAuthStart, exchanges the OAuth code
// for tokens, stores them server-side, then (GARMIN_HISTORY_ENABLED only)
// requests the last GARMIN_BACKFILL_DAYS. The `state` is the credential: it was
// issued to a signed-in user and is single-use, so the callback works even in a
// browser context without a Firebase session. If the caller IS signed in, it
// must be the same user who started the flow.
exports.garminTokenExchange = functions
  .runWith(GARMIN_RUNTIME)
  .https.onRequest(async (req, res) => {
    setGarminCors(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return; }

    const { code, state } = req.body || {};
    if (!code || !state || typeof state !== 'string') {
      res.status(400).json({ error: 'Missing code or state' }); return;
    }

    // Single-use: read + delete atomically so a code can't be redeemed twice.
    let pending;
    try {
      pending = await db.runTransaction(async tx => {
        const ref = garminOAuthStatesRef(state);
        const snap = await tx.get(ref);
        if (!snap.exists) return null;
        tx.delete(ref);
        return snap.data();
      });
    } catch (e) {
      console.error('garminTokenExchange: state lookup failed:', e);
      res.status(500).json({ error: 'Could not complete the Garmin connection.' }); return;
    }
    if (!pending || Date.now() - pending.createdAt > GARMIN_OAUTH_STATE_TTL_MS) {
      res.status(400).json({ error: 'This connection link expired — please try connecting again.' }); return;
    }
    const { uid, codeVerifier, redirectUri } = pending;

    const m = (req.headers.authorization || '').match(/^Bearer (.+)$/);
    if (m) {
      const caller = await admin.auth().verifyIdToken(m[1]).then(d => d.uid, () => null);
      if (caller && caller !== uid) {
        console.warn(`garminTokenExchange: state for uid=${uid} redeemed by uid=${caller}`);
        res.status(403).json({ error: 'This Garmin connection was started from a different account. Please try again.' });
        return;
      }
    }

    const clientId = process.env.GARMIN_CLIENT_ID;
    const clientSecret = process.env.GARMIN_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      res.status(500).json({ error: 'Garmin env vars not set' }); return;
    }

    try {
      const response = await fetch(GARMIN_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          code_verifier: codeVerifier,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
      });
      if (!response.ok) {
        const err = await response.text();
        console.warn(`garminTokenExchange uid=${uid}: ${response.status} ${err}`);
        res.status(400).json({ error: 'Garmin rejected the authorization. Please try connecting again.' });
        return;
      }

      const t = await response.json();
      const garminUserId = await fetchGarminUserId(t.access_token);

      // One Garmin account → one XCTracker user. Drop any older link so webhook
      // pushes can't be routed to the wrong athlete.
      if (garminUserId) {
        const prior = await db.collection('garminTokens')
          .where('garminUserId', '==', garminUserId).get();
        await Promise.all(prior.docs
          .filter(d => d.id !== uid)
          .map(d => clearGarminConnection(d.id)));
      }

      await garminTokensRef(uid).set({
        accessToken:  t.access_token,
        refreshToken: t.refresh_token ?? null,
        expiresAt:    t.expires_in ? Math.floor(Date.now() / 1000) + t.expires_in : null,
        garminUserId,
        connectedAt:  new Date().toISOString(),
      });
      await db.collection('users').doc(uid).update({
        ...legacyGarminFieldDeletes(),
        garminConnected: true,
      });

      let backfill = null;
      if (GARMIN_HISTORY_ENABLED) {
        try {
          backfill = await requestGarminBackfill(uid, t.access_token, GARMIN_BACKFILL_DAYS);
        } catch (e) {
          console.error('garminTokenExchange: backfill request failed (non-fatal):', e);
        }
      }

      res.json({ connected: true, backfill });
    } catch (e) {
      console.error('garminTokenExchange error:', e);
      res.status(500).json({ error: 'Could not complete the Garmin connection.' });
    }
  });

// ── Garmin history import (retry) ────────────────────────────────────────────
// Re-requests history for an already-connected user. No client UI calls this
// while GARMIN_HISTORY_ENABLED is false (Starter tier).
exports.garminBackfill = functions
  .runWith(GARMIN_RUNTIME)
  .https.onRequest(async (req, res) => {
    setGarminCors(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return; }

    const uid = await verifyGarminCaller(req, res);
    if (!uid) return;
    if (!GARMIN_HISTORY_ENABLED) {
      res.status(403).json({ error: 'Garmin history import requires Garmin Enterprise access.' }); return;
    }

    const days = Math.min(Math.max(parseInt(req.body?.days, 10) || GARMIN_BACKFILL_DAYS, 1), GARMIN_BACKFILL_DAYS);

    try {
      const tokens = await loadGarminTokens(uid);
      if (!tokens) { res.status(400).json({ error: 'Garmin not connected' }); return; }
      const accessToken = await getValidGarminToken(uid, tokens);
      const backfill = await requestGarminBackfill(uid, accessToken, days);
      res.json({ backfill });
    } catch (e) {
      console.error('garminBackfill failed:', e);
      res.status(500).json({ error: 'Could not request your Garmin history.' });
    }
  });

// ── Garmin disconnect ────────────────────────────────────────────────────────
// Deregisters the user at Garmin (stops pushes) and deletes stored tokens.
exports.garminDisconnect = functions
  .runWith(GARMIN_RUNTIME)
  .https.onRequest(async (req, res) => {
    setGarminCors(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return; }

    const uid = await verifyGarminCaller(req, res);
    if (!uid) return;

    try {
      const tokens = await loadGarminTokens(uid);
      if (tokens) {
        try {
          const accessToken = await getValidGarminToken(uid, tokens);
          const resp = await fetch(`${GARMIN_API}/user/registration`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!resp.ok && resp.status !== 404) {
            console.warn(`garminDisconnect uid=${uid}: deregistration ${resp.status} ${await resp.text()}`);
          }
        } catch (e) {
          console.warn('garminDisconnect: Garmin deregistration failed (non-fatal):', e.message);
        }
      }
      await clearGarminConnection(uid);
      res.json({ disconnected: true });
    } catch (e) {
      console.error('garminDisconnect failed:', e);
      res.status(500).json({ error: 'Could not disconnect Garmin.' });
    }
  });

// ── Pace zone helpers ─────────────────────────────────────────────────────────
// Ported from utils/vdotUtils.js — functions/ is a separate package.
function getPaceZone(paceSecPerMile, tp) {
  if (!tp || !paceSecPerMile || paceSecPerMile <= 0) return 'e';
  const riBoundary = (tp.r + tp.i) / 2;
  const itBoundary = (tp.i + tp.t) / 2;
  const tmBoundary = (tp.t + tp.m) / 2;
  const meBoundary = tp.eHigh;
  if (paceSecPerMile <= riBoundary) return 'r';
  if (paceSecPerMile <= itBoundary) return 'i';
  if (paceSecPerMile <= tmBoundary) return 't';
  if (paceSecPerMile <= meBoundary) return 'm';
  return 'e';
}

function calcPaceZoneBreakdown(paceStream, tp) {
  const zones = { e: 0, m: 0, t: 0, i: 0, r: 0 };
  if (!paceStream || !tp) return zones;
  for (const point of paceStream) {
    if (!point.pace || point.pace <= 0 || point.pace > 1800) continue;
    zones[getPaceZone(point.pace, tp)] += point.seconds || 1;
  }
  return zones;
}

// ── Garmin activity → run format (server-side) ────────────────────────────────
function garminActivityToRunServer(activity, userId, schoolId) {
  const actType = (activity.activityType || '').toUpperCase();
  if (!actType.includes('RUN')) return null;

  const distanceMeters = activity.distanceInMeters ?? 0;
  const miles = distanceMeters / 1609.344;
  if (miles < 0.1) return null;

  const totalSeconds = activity.durationInSeconds ?? 0;
  if (totalSeconds < 1) return null;

  const hours = Math.floor(totalSeconds / 3600);
  const mins  = Math.floor((totalSeconds % 3600) / 60);
  const secs  = totalSeconds % 60;
  const duration = hours > 0
    ? `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${mins}:${String(secs).padStart(2, '0')}`;

  const speedMs = activity.averageSpeedInMetersPerSecond;
  const averagePace = speedMs && speedMs > 0 ? Math.round(1609.344 / speedMs) : null;

  let date;
  if (activity.startTimeInSeconds) {
    date = new Date(activity.startTimeInSeconds * 1000);
  } else if (activity.startTimeLocal) {
    date = new Date(activity.startTimeLocal);
  } else {
    date = new Date();
  }

  const elevMeters = activity.totalElevationGainInMeters ?? null;
  const activityName = activity.activityName ?? null;
  const genericNames = ['Running', 'Morning Run', 'Afternoon Run', 'Evening Run', 'Trail Run'];

  return {
    userId,
    schoolId: schoolId || null,
    miles: Math.round(miles * 100) / 100,
    duration,
    elevationGain: elevMeters ? Math.round(elevMeters * 3.281) : null,
    averagePace,
    effort: null,
    notes: activityName && !genericNames.includes(activityName) ? activityName : null,
    source: 'garmin',
    garminActivityId: String(activity.summaryId ?? activity.activityId ?? ''),
    date,
  };
}

// Approximate a pace stream from the activity summary's average speed.
// Single-segment estimate good enough for zone classification.
function approximatePaceStream(activity) {
  const speedMs = activity.averageSpeedInMetersPerSecond;
  const totalSecs = activity.durationInSeconds;
  if (!speedMs || speedMs <= 0 || !totalSecs) return null;
  return [{ pace: Math.round(1609.344 / speedMs), seconds: totalSecs }];
}

// ── Garmin webhook (push delivery) ────────────────────────────────────────────
// Garmin POSTs here when a connected user's watch syncs, when a backfill
// request is fulfilled, and when a user revokes access in Garmin Connect.
// Register this URL in the Garmin Developer Portal as
//   …/garminWebhook/<GARMIN_WEBHOOK_KEY>
// (a path segment — the portal strips query strings on save; Cloud Functions
// routes sub-paths to the function, so req.path is '/<key>'). The key is
// enforced once GARMIN_WEBHOOK_KEY is set in functions/.env, so pushes can't be
// forged by anyone who learns an athlete's Garmin userId.
//
// Payload shapes: { activities: [{ userId, userAccessToken, summaryId, … }] }
//                 { deregistrations: [{ userId, userAccessToken }] }
exports.garminWebhook = functions
  .runWith({ maxInstances: 10 })
  .https.onRequest(async (req, res) => {
    // Garmin sends a GET/HEAD ping during webhook verification
    if (req.method === 'GET' || req.method === 'HEAD') {
      res.status(200).send('OK'); return;
    }
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed'); return;
    }

    const expectedKey = process.env.GARMIN_WEBHOOK_KEY;
    const providedKey = req.path.replace(/^\/+|\/+$/g, '') || req.query.key;
    if (expectedKey && providedKey !== expectedKey) {
      console.warn('garminWebhook: rejected push with missing/invalid key');
      res.status(403).send('Forbidden'); return;
    }

    const body = req.body || {};
    const activities = body.activities || [];
    const deregistrations = body.deregistrations || [];

    for (const d of deregistrations) {
      try {
        const uid = await findUidForGarminUser(d.userId, d.userAccessToken);
        if (uid) {
          await clearGarminConnection(uid);
          console.log(`garminWebhook: deregistered uid=${uid}`);
        }
      } catch (e) {
        console.error('Garmin webhook deregistration error:', e);
      }
    }

    let imported = 0;
    let errors   = 0;
    const milesByUid = {};
    const uidCache = new Map();

    for (const activity of activities) {
      try {
        const cacheKey = activity.userId || activity.userAccessToken;
        if (!uidCache.has(cacheKey)) {
          uidCache.set(cacheKey, await findUidForGarminUser(activity.userId, activity.userAccessToken));
        }
        const uid = uidCache.get(cacheKey);
        if (!uid) {
          console.warn(`garminWebhook: no user found for garminUserId=${activity.userId}`);
          continue;
        }

        const userRef = db.collection('users').doc(uid);
        const userData = (await userRef.get()).data() || {};
        const run = garminActivityToRunServer(activity, uid, userData.schoolId);
        if (!run) continue;

        const actId = activity.summaryId ?? activity.activityId;
        const runRef = db.collection('runs').doc(`garmin_${uid}_${actId}`);
        const existing = await runRef.get();
        if (existing.exists) continue;

        let paceZoneSeconds = null;
        if (userData.trainingPaces) {
          const paceStream = approximatePaceStream(activity);
          if (paceStream) paceZoneSeconds = calcPaceZoneBreakdown(paceStream, userData.trainingPaces);
        }

        await runRef.set({
          ...run,
          ...(paceZoneSeconds ? { paceZoneSeconds, hasPaceData: true } : { hasPaceData: false }),
        });
        milesByUid[uid] = (milesByUid[uid] || 0) + run.miles;
        imported++;
      } catch (e) {
        console.error('Garmin webhook activity error:', e);
        errors++;
      }
    }

    // One totalMiles increment per user (a backfill push can carry many runs).
    await Promise.all(Object.entries(milesByUid).map(([uid, miles]) =>
      db.collection('users').doc(uid).update({
        totalMiles: admin.firestore.FieldValue.increment(Math.round(miles * 10) / 10),
        garminLastSync: new Date().toISOString(),
      })
    ));

    console.log(`Garmin webhook: imported ${imported}/${activities.length}, errors ${errors}, deregistrations ${deregistrations.length}`);
    res.status(200).json({ imported, errors });
  });

// ── Push Notification on New Team Post ───────────────────────────────────────
// Triggered when a new document is created in the teamPosts collection.
// Sends push notifications to all relevant users based on the channel.

exports.onNewTeamPost = functions
  .runWith({ maxInstances: 10 })
  .firestore
  .document('teamPosts/{postId}')
  .onCreate(async (snap, context) => {
    const post = snap.data();
    // Image-only posts are saved with text: '' — they still notify.
    if (!post.schoolId || (!post.text && !post.imageUrl)) return;

    const { schoolId, channel, authorId, authorName } = post;
    const text = post.text || '📷 Photo';
    const channelKey = channel || 'whole_team';

    try {
      const usersSnap = await db.collection('users')
        .where('schoolId', '==', schoolId)
        .get();

      const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const seen = new Set(allUsers.map(u => u.id));

      // Parents linked to this school's athletes who don't carry the schoolId
      // yet (linked before their athlete joined the team). Bounded lookup —
      // array-contains-any takes ≤30 values — instead of reading EVERY parent
      // in the database on every post.
      const schoolAthleteIds = allUsers.filter(u => u.role === 'athlete').map(u => u.id);
      const parentChunks = [];
      for (let i = 0; i < schoolAthleteIds.length; i += 30) {
        parentChunks.push(schoolAthleteIds.slice(i, i + 30));
      }
      const parentSnaps = await Promise.all(parentChunks.map(ids =>
        // Only parent docs carry linkedAthleteIds, so no role filter (which
        // would need a composite index).
        db.collection('users')
          .where('linkedAthleteIds', 'array-contains-any', ids)
          .get()
      ));
      parentSnaps.forEach(ps => ps.docs.forEach(d => {
        if (!seen.has(d.id)) { seen.add(d.id); allUsers.push({ id: d.id, ...d.data() }); }
      }));

      const recipients = allUsers.filter(user => {
        if (user.id === authorId) return false;
        if (!user.expoPushToken && !user.webPushToken) return false;

        const role = user.role;
        const isCoach = role === 'admin_coach' || role === 'assistant_coach';
        const isParent = role === 'parent';

        switch (channelKey) {
          case 'whole_team':
            return true;
          case 'boys':
          case 'girls':
            return isCoach || (role === 'athlete' && user.gender === channelKey);
          case 'coaches':
            return isCoach;
          case 'parents':
            return isParent;
          default:
            if (channelKey.startsWith('group_')) {
              const groupId = channelKey.replace('group_', '');
              return isCoach || user.groupId === groupId;
            }
            return true;
        }
      });

      if (recipients.length === 0) return;

      const title = authorName || 'New message';
      const body = text.length > 100 ? text.slice(0, 97) + '...' : text;
      const data = { channel: channelKey, postId: context.params.postId };

      // One send per device token: a shared family/school device can hold the
      // same token on several user docs.
      const sentTokens = new Set();
      const messages = [];
      const webMessages = [];
      for (const user of recipients) {
        if (user.expoPushToken && sentTokens.has(user.expoPushToken)) continue;
        if (user.webPushToken && sentTokens.has(user.webPushToken)) continue;
        if (user.expoPushToken) sentTokens.add(user.expoPushToken);
        if (user.webPushToken) sentTokens.add(user.webPushToken);
        if (user.expoPushToken && Expo.isExpoPushToken(user.expoPushToken)) {
          messages.push({
            to: user.expoPushToken,
            sound: 'default',
            title, body, data,
            badge: 1,
          });
        }
        if (user.webPushToken) {
          webMessages.push({ token: user.webPushToken, title, body, data });
        }
      }

      const chunks = expo.chunkPushNotifications(messages);
      for (const chunk of chunks) {
        try {
          await expo.sendPushNotificationsAsync(chunk);
        } catch (error) {
          console.error('Push send error:', error);
        }
      }
      await sendWebPushNotifications(webMessages);

      console.log(`Sent ${messages.length} native + ${webMessages.length} web push notifications for post in ${channelKey}`);
    } catch (error) {
      console.error('onNewTeamPost error:', error);
    }
  });

// ── Daily Wellness Check-In Reminder ─────────────────────────────────────────
// Runs once daily at 4 PM Eastern (3 PM CT, 2 PM MT, 1 PM PT). "Already checked
// in today" is judged against midnight in each athlete's SCHOOL timezone —
// Cloud Functions run in UTC, so setHours(0) meant "since 8 PM ET yesterday"
// and an evening check-in suppressed the next day's reminder.

// Midnight at the start of now's calendar day in `tz`, as a Date.
function startOfDayInTimeZone(now, tz) {
  const parts = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(now).forEach(p => { parts[p.type] = p.value; });
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offsetMs = asUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day) - offsetMs);
}

exports.dailyCheckinReminder = functions
  .runWith({ maxInstances: 1 })
  .pubsub
  .schedule('0 16 * * *')
  .timeZone('America/New_York')
  .onRun(async (context) => {
    try {
      const now = new Date();
      const [athletesSnap, schoolsSnap] = await Promise.all([
        db.collection('users')
          .where('role', '==', 'athlete')
          .where('status', '==', 'approved')
          .get(),
        db.collection('schools').get(),
      ]);

      if (athletesSnap.empty) return;

      const dayStartBySchool = {};
      schoolsSnap.docs.forEach(d => {
        dayStartBySchool[d.id] = startOfDayInTimeZone(now, d.data().timezone || 'America/New_York');
      });
      const defaultDayStart = startOfDayInTimeZone(now, 'America/New_York');
      const earliest = new Date(Math.min(defaultDayStart, ...Object.values(dayStartBySchool)));

      // Latest check-in per athlete since the earliest school's midnight.
      const checkinsSnap = await db.collection('checkins')
        .where('date', '>=', admin.firestore.Timestamp.fromDate(earliest))
        .get();
      const latestCheckin = {};
      checkinsSnap.docs.forEach(d => {
        const { userId, date } = d.data();
        const when = date?.toDate ? date.toDate() : (date ? new Date(date) : null);
        if (userId && when && (!latestCheckin[userId] || when > latestCheckin[userId])) latestCheckin[userId] = when;
      });
      const checkedInToday = (uid, schoolId) => {
        const when = latestCheckin[uid];
        return !!when && when >= (dayStartBySchool[schoolId] || defaultDayStart);
      };

      const title = 'Daily Check-In';
      const body = 'How are you feeling? A quick check-in helps your coach keep you healthy.';
      const data = { type: 'checkin_reminder' };

      const messages = [];
      const webMessages = [];
      athletesSnap.docs.forEach(doc => {
        const athlete = doc.data();
        if (checkedInToday(doc.id, athlete.schoolId)) return;
        if (athlete.expoPushToken && Expo.isExpoPushToken(athlete.expoPushToken)) {
          messages.push({ to: athlete.expoPushToken, sound: 'default', title, body, data });
        }
        if (athlete.webPushToken) {
          webMessages.push({ token: athlete.webPushToken, title, body, data });
        }
      });

      const chunks = expo.chunkPushNotifications(messages);
      for (const chunk of chunks) {
        try {
          await expo.sendPushNotificationsAsync(chunk);
        } catch (error) {
          console.error('Checkin reminder push error:', error);
        }
      }
      await sendWebPushNotifications(webMessages);

      console.log(`Sent ${messages.length} native + ${webMessages.length} web check-in reminders`);
    } catch (error) {
      console.error('dailyCheckinReminder error:', error);
    }
  });

// ── Weekly Check-In Reminder (multi-timezone) ────────────────────────────────
// Runs every hour on Saturday (UTC). Fires per-school at their local noon.

exports.weeklyCheckinReminder = functions
  .runWith({ maxInstances: 1 })
  .pubsub
  .schedule('0 * * * 6')
  .onRun(async () => {
    try {
      const now = new Date();
      const schoolsSnap = await db.collection('schools').get();
      if (schoolsSnap.empty) return;

      for (const schoolDoc of schoolsSnap.docs) {
        const school = schoolDoc.data();
        const tz = school.timezone || 'America/New_York';

        const localFmt = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          hour: '2-digit', hour12: false, weekday: 'short',
        });
        const parts = {};
        localFmt.formatToParts(now).forEach(p => { parts[p.type] = p.value; });
        const localHour = parseInt(parts.hour, 10) % 24;
        if (parts.weekday !== 'Sat' || localHour !== 12) continue;

        const dateFmt = new Intl.DateTimeFormat('en-CA', {
          timeZone: tz,
          year: 'numeric', month: '2-digit', day: '2-digit',
        });
        const anchor = dateFmt.format(now);

        const athletesSnap = await db.collection('users')
          .where('schoolId', '==', schoolDoc.id)
          .where('role', '==', 'athlete')
          .where('status', '==', 'approved')
          .get();
        if (athletesSnap.empty) continue;

        const checkinsSnap = await db.collection('weeklyCheckins')
          .where('schoolId', '==', schoolDoc.id)
          .where('weekStartISO', '==', anchor)
          .get();
        const submittedUids = new Set(
          checkinsSnap.docs.map(d => d.data().userId).filter(Boolean)
        );

        const title = 'Weekly check-in';
        const body = 'How was your week? Share a quick update with your coach.';
        const data = { type: 'weekly_checkin_reminder' };

        const messages = [];
        const webMessages = [];
        athletesSnap.docs.forEach(d => {
          const athlete = d.data();
          if (submittedUids.has(d.id)) return;
          if (athlete.expoPushToken && Expo.isExpoPushToken(athlete.expoPushToken)) {
            messages.push({ to: athlete.expoPushToken, sound: 'default', title, body, data });
          }
          if (athlete.webPushToken) {
            webMessages.push({ token: athlete.webPushToken, title, body, data });
          }
        });

        const chunks = expo.chunkPushNotifications(messages);
        for (const chunk of chunks) {
          try {
            await expo.sendPushNotificationsAsync(chunk);
          } catch (e) {
            console.error('Weekly reminder push error:', e);
          }
        }
        await sendWebPushNotifications(webMessages);

        console.log(`Sent ${messages.length} native + ${webMessages.length} web weekly reminders to ${school.name || schoolDoc.id}`);
      }
    } catch (error) {
      console.error('weeklyCheckinReminder error:', error);
    }
  });

// ── Push athlete when coach replies to their weekly check-in ─────────────────

exports.onWeeklyCheckinReply = functions
  .runWith({ maxInstances: 10 })
  .firestore
  .document('weeklyCheckins/{docId}')
  .onUpdate(async (change, context) => {
    try {
      const before = change.before.data();
      const after = change.after.data();
      if (!after?.coachReply || !after.userId) return;

      const isNewReply = !before?.coachReply;
      const isEdited = !isNewReply && before.coachReply.text !== after.coachReply.text;
      if (!isNewReply && !isEdited) return;

      if (isEdited && after.athleteViewedReplyAt) {
        await change.after.ref.update({
          athleteViewedReplyAt: admin.firestore.FieldValue.delete(),
        });
      }

      const athleteDoc = await db.collection('users').doc(after.userId).get();
      if (!athleteDoc.exists) return;
      const athlete = athleteDoc.data();

      const replyText = after.coachReply.text || '';
      const preview = replyText.length > 100 ? replyText.slice(0, 97) + '...' : replyText;
      const coachName = after.coachReply.repliedByName || 'Coach';
      const title = isEdited ? `${coachName} updated their reply` : `${coachName} replied`;
      const data = { type: 'weekly_checkin_reply', docId: context.params.docId, edited: isEdited };

      const sends = [];
      if (athlete.expoPushToken && Expo.isExpoPushToken(athlete.expoPushToken)) {
        sends.push(expo.sendPushNotificationsAsync([{
          to: athlete.expoPushToken,
          sound: 'default',
          title, body: preview, data,
        }]));
      }
      if (athlete.webPushToken) {
        sends.push(sendWebPushNotifications([{ token: athlete.webPushToken, title, body: preview, data }]));
      }
      await Promise.all(sends);
      console.log(`Sent weekly ${isEdited ? 'edit' : 'reply'} notification to ${after.userId} (native=${!!athlete.expoPushToken}, web=${!!athlete.webPushToken})`);
    } catch (error) {
      console.error('onWeeklyCheckinReply error:', error);
    }
  });

// ── Parent ↔ athlete links (athlete-approved) ────────────────────────────────
// A parent creates parentLinks/{parentId}_{athleteId} (status 'pending'); the
// athlete approves or declines in the app. Firestore rules stop clients from
// writing linkedAthleteIds / linkedParentIds / a parent's school, so the link
// itself is made here with the Admin SDK once the athlete says yes.

// Push one user on whichever channels they have registered.
async function pushToUser(user, { title, body, data }) {
  const sends = [];
  if (user.expoPushToken && Expo.isExpoPushToken(user.expoPushToken)) {
    sends.push(expo.sendPushNotificationsAsync([{ to: user.expoPushToken, sound: 'default', title, body, data }]));
  }
  if (user.webPushToken) {
    sends.push(sendWebPushNotifications([{ token: user.webPushToken, title, body, data }]));
  }
  await Promise.all(sends);
}

exports.onParentLinkCreate = functions
  .runWith({ maxInstances: 10 })
  .firestore.document('parentLinks/{linkId}')
  .onCreate(async (snap) => {
    const link = snap.data();
    try {
      const athleteDoc = await db.collection('users').doc(link.athleteId).get();
      if (!athleteDoc.exists) return;
      await pushToUser(athleteDoc.data(), {
        title: 'Parent connection request',
        body: `${link.parentName || 'Someone'} wants to follow your training as your parent. Open XCTracker to approve or decline.`,
        data: { type: 'parent_link_request', linkId: snap.id },
      });
    } catch (e) {
      console.error('onParentLinkCreate error:', e);
    }
  });

exports.onParentLinkUpdate = functions
  .runWith({ maxInstances: 10 })
  .firestore.document('parentLinks/{linkId}')
  .onUpdate(async (change) => {
    const before = change.before.data();
    const after = change.after.data();
    if (before.status === after.status || after.status !== 'approved') return;

    const parentRef = db.collection('users').doc(after.parentId);
    const athleteRef = db.collection('users').doc(after.athleteId);
    try {
      const [parentSnap, athleteSnap] = await Promise.all([parentRef.get(), athleteRef.get()]);
      if (!parentSnap.exists || !athleteSnap.exists) return;
      const parent = parentSnap.data();
      const athlete = athleteSnap.data();

      // The parent joins the athlete's school (feed, calendar) unless they
      // already belong to one — a parent of athletes at two schools keeps the
      // first. If the athlete isn't on an approved team yet, the parent picks
      // the school up later (ownerParentAdoptsSchool rule, ParentDashboard).
      const parentUpdate = {
        linkedAthleteIds: admin.firestore.FieldValue.arrayUnion(after.athleteId),
      };
      if (!parent.schoolId && athlete.schoolId && athlete.status === 'approved') {
        parentUpdate.schoolId = athlete.schoolId;
        parentUpdate.status = 'approved';
      }

      const batch = db.batch();
      batch.update(parentRef, parentUpdate);
      batch.update(athleteRef, {
        linkedParentIds: admin.firestore.FieldValue.arrayUnion(after.parentId),
      });
      await batch.commit();

      await pushToUser(parent, {
        title: 'Connection approved',
        body: `${athlete.firstName || 'Your athlete'} approved your request. You can now follow their training in XCTracker.`,
        data: { type: 'parent_link_approved', athleteId: after.athleteId },
      });
    } catch (e) {
      console.error('onParentLinkUpdate error:', e);
    }
  });

// ── Billing kill-switch (cost-abuse backstop) ────────────────────────────────
// Triggered by Cloud Billing budget alerts on the `budget-alerts` Pub/Sub topic.
// Disables billing if actual spend exceeds budget. Recovery: re-link billing
// account in GCP console. See CLAUDE.md for setup instructions.
exports.stopBillingOnBudget = functions
  .runWith({ maxInstances: 1 })
  .pubsub
  .topic('budget-alerts')
  .onPublish(async (message) => {
    const { CloudBillingClient } = require('@google-cloud/billing');
    const billing = new CloudBillingClient();
    const projectName = `projects/${process.env.GCLOUD_PROJECT}`;

    const data = message.json || {};
    if (typeof data.costAmount !== 'number' || typeof data.budgetAmount !== 'number') {
      console.warn('Budget message missing cost/budget amounts; ignoring.', data);
      return;
    }
    if (data.costAmount <= data.budgetAmount) {
      console.log(`Spend ${data.costAmount} within budget ${data.budgetAmount}; no action.`);
      return;
    }

    const [info] = await billing.getProjectBillingInfo({ name: projectName });
    if (!info.billingEnabled) {
      console.log('Billing already disabled; nothing to do.');
      return;
    }

    await billing.updateProjectBillingInfo({
      name: projectName,
      projectBillingInfo: { billingAccountName: '' },
    });
    console.error(
      `BILLING DISABLED for ${projectName}: spend ${data.costAmount} ` +
      `exceeded budget ${data.budgetAmount}. Re-enable manually in GCP console.`
    );
  });
