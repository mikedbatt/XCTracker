const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const { Expo } = require('expo-server-sdk');

admin.initializeApp();
const db = admin.firestore();
const expo = new Expo();

// ── FCM web push helper ──────────────────────────────────────────────────────
// Parallel to expo.sendPushNotificationsAsync but for web users whose token
// comes from Firebase Cloud Messaging (stored on user doc as webPushToken).
// Errors per token are logged but don't throw so a single stale token won't
// kill the whole batch.
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
    }).catch(e => console.warn('FCM web send error:', e.message))
  ));
}

// ── Strava Token Exchange ────────────────────────────────────────────────────
// Public onRequest endpoint — matches the fetch() client shipped in the live
// TestFlight build. Kept on onRequest (NOT onCall) so existing installs can
// refresh tokens and keep syncing. maxInstances caps cost-abuse exposure.
//
// NOTE: the onCall (auth-required) version is a breaking change for every
// un-updated client — only flip back to onCall in the SAME release that ships
// a build whose stravaConfig.js uses httpsCallable. See commit 03025d8.

const STRAVA_RUNTIME = { maxInstances: 10 };

exports.stravaTokenExchange = functions
  .runWith(STRAVA_RUNTIME)
  .https.onRequest(async (req, res) => {
    // Allow CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

    const { code, redirectUri } = req.body;
    if (!code) { res.status(400).json({ error: 'Missing code' }); return; }

    const clientId = process.env.STRAVA_CLIENT_ID;
    const clientSecret = process.env.STRAVA_CLIENT_SECRET;
    if (!clientId || !clientSecret) { res.status(500).json({ error: 'Strava env vars not set' }); return; }

    const response = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      res.status(response.status).json({ error: `Strava token exchange failed: ${err}` });
      return;
    }

    const data = await response.json();
    res.json(data);
  });

// ── Strava Token Refresh ─────────────────────────────────────────────────────

exports.stravaTokenRefresh = functions
  .runWith(STRAVA_RUNTIME)
  .https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

    const { refreshToken } = req.body;
    if (!refreshToken) { res.status(400).json({ error: 'Missing refreshToken' }); return; }

    const clientId = process.env.STRAVA_CLIENT_ID;
    const clientSecret = process.env.STRAVA_CLIENT_SECRET;
    if (!clientId || !clientSecret) { res.status(500).json({ error: 'Strava env vars not set' }); return; }

    const response = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) { res.status(response.status).json({ error: 'Strava token refresh failed' }); return; }

    const data = await response.json();
    res.json(data);
  });

// ── Strava Webhooks (event-driven sync) ──────────────────────────────────────
// One push subscription per app points Strava at `stravaWebhook`. To stay under
// Strava's 2-second ack SLA, the webhook just enqueues each event to the
// `stravaEvents` collection and returns 200; `processStravaEvent` (Firestore
// onCreate) does the real work async with automatic retries.
//
// Purely additive: the token functions above and the client-side polling sync
// are untouched, so this is INERT until the push subscription is registered
// (see the curl in the project notes). Registering it later only *adds*
// event-driven sync on top of polling — totalMiles is guarded against
// double-counting below.

const STRAVA_VERIFY_TOKEN = process.env.STRAVA_VERIFY_TOKEN;

exports.stravaWebhook = functions
  .runWith(STRAVA_RUNTIME)
  .https.onRequest(async (req, res) => {
    // 1) Subscription validation handshake (GET): echo hub.challenge if the
    //    verify token matches. Strava calls this once, at subscription creation.
    if (req.method === 'GET') {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];
      if (mode === 'subscribe' && STRAVA_VERIFY_TOKEN && token === STRAVA_VERIFY_TOKEN) {
        res.status(200).json({ 'hub.challenge': challenge });
      } else {
        res.status(403).send('Forbidden');
      }
      return;
    }

    // 2) Event delivery (POST): enqueue + ack 200 immediately (well under 2s).
    //    All heavy work happens in processStravaEvent.
    if (req.method === 'POST') {
      try {
        const evt = req.body || {};
        await db.collection('stravaEvents').add({
          objectType:     evt.object_type || null,           // 'activity' | 'athlete'
          objectId:       evt.object_id != null ? String(evt.object_id) : null,
          aspectType:     evt.aspect_type || null,           // 'create' | 'update' | 'delete'
          ownerId:        evt.owner_id != null ? String(evt.owner_id) : null,
          subscriptionId: evt.subscription_id || null,
          updates:        evt.updates || {},
          eventTime:      evt.event_time || null,
          status:         'pending',
          receivedAt:     admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        // Never let an enqueue error turn into a non-200 (Strava would retry).
        console.error('stravaWebhook enqueue failed:', e);
      }
      res.status(200).send('EVENT_RECEIVED');
      return;
    }

    res.status(405).send('Method Not Allowed');
  });

// ── Strava webhook processor ─────────────────────────────────────────────────
// Pace-zone math ported from utils/vdotUtils.js (functions/ is a separate
// package and can't import app code). Pace zones are the only training-zone
// model — runs are written pace-only, matching the client.
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
    if (!point.pace || point.pace <= 0 || point.pace > 1800) continue; // skip stopped
    zones[getPaceZone(point.pace, tp)] += point.seconds || 1;
  }
  return zones;
}

// Pace-only activity→run (port of stravaActivityToRun in stravaConfig.js).
function stravaActivityToRunServer(activity, userId, schoolId) {
  const runTypes = ['Run', 'TrailRun', 'VirtualRun'];
  if (!runTypes.includes(activity.type)) return null;
  const miles = activity.distance / 1609.344;
  if (miles < 0.1) return null;

  const totalSeconds = activity.moving_time;
  const hours = Math.floor(totalSeconds / 3600);
  const mins  = Math.floor((totalSeconds % 3600) / 60);
  const secs  = totalSeconds % 60;
  const duration = hours > 0
    ? `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${mins}:${String(secs).padStart(2, '0')}`;

  const averagePace = activity.average_speed > 0
    ? Math.round(1609.344 / activity.average_speed)
    : null;

  const genericNames = ['Morning Run', 'Afternoon Run', 'Evening Run'];
  return {
    userId,
    schoolId: schoolId || null,
    miles: Math.round(miles * 100) / 100,
    duration,
    elevationGain: activity.total_elevation_gain ? Math.round(activity.total_elevation_gain * 3.281) : null,
    averagePace,
    effort: null,
    notes: genericNames.includes(activity.name) ? null : activity.name,
    source: 'strava',
    stravaId: String(activity.id),
    date: new Date(activity.start_date),
  };
}

// Return a valid access token for the user, refreshing + persisting if needed.
async function getValidStravaToken(userRef, data) {
  const nowSecs = Math.floor(Date.now() / 1000);
  if (data.stravaTokenExpiry && data.stravaTokenExpiry > nowSecs + 300) {
    return data.stravaAccessToken;
  }
  const resp = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: data.stravaRefreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!resp.ok) throw new Error('Strava token refresh failed');
  const t = await resp.json();
  await userRef.update({
    stravaAccessToken:  t.access_token,
    stravaRefreshToken: t.refresh_token,
    stravaTokenExpiry:  t.expires_at,
  });
  return t.access_token;
}

async function fetchStravaActivity(accessToken, activityId) {
  const resp = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) return null;
  return resp.json();
}

// Activities within the last `afterTimestamp` (unix secs), NEWEST FIRST.
//
// IMPORTANT: we deliberately do NOT pass Strava's `after` param. With `after`,
// Strava returns activities in ASCENDING order (oldest first), so the most
// recent runs land on the LAST page — and if a later page gets rate-limited
// (429), the recent runs are exactly what gets dropped. Instead we use Strava's
// default DESCENDING order (newest first) and stop once we walk past the window.
// A partial fetch then keeps the recent runs, which matter most; older
// stragglers can be picked up by re-running the import.
async function fetchStravaActivitiesServer(accessToken, afterTimestamp) {
  const all = [];
  for (let page = 1; page <= 10; page++) {
    const url = `https://www.strava.com/api/v3/athlete/activities?per_page=50&page=${page}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!resp.ok) {
      // 429 = rate limited; return what we have (the most recent runs).
      if (resp.status === 429) break;
      throw new Error(`Strava activities fetch failed (${resp.status})`);
    }
    const batch = await resp.json();
    if (!batch || batch.length === 0) break;

    // Keep only activities within the window; stop once we pass the cutoff
    // (the list is newest-first, so everything after is older still).
    let reachedCutoff = false;
    for (const act of batch) {
      const startSecs = Math.floor(new Date(act.start_date).getTime() / 1000);
      if (!afterTimestamp || startSecs >= afterTimestamp) all.push(act);
      else reachedCutoff = true;
    }
    if (reachedCutoff) { return all; }
    if (batch.length < 50) break;
  }
  return all;
}

async function fetchStravaPaceStream(accessToken, activityId) {
  const url = `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=time,velocity_smooth&key_by_type=true`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) return null;
  const data = await resp.json();
  const timeData = data.time && data.time.data;
  if (!timeData || !(data.velocity_smooth && data.velocity_smooth.data)) return null;
  const vel = data.velocity_smooth.data;
  const stream = [];
  for (let i = 0; i < vel.length; i++) {
    const dur = i < vel.length - 1 ? timeData[i + 1] - timeData[i] : 1;
    if (vel[i] > 0.5) stream.push({ pace: Math.round(1609.344 / vel[i]), seconds: dur });
  }
  return stream.length ? stream : null;
}

exports.processStravaEvent = functions
  .runWith(STRAVA_RUNTIME)
  .firestore.document('stravaEvents/{eventId}')
  .onCreate(async (snap) => {
    const evt = snap.data();
    try {
      if (!evt.ownerId) { await snap.ref.update({ status: 'ignored', reason: 'no ownerId' }); return; }

      // Route Strava athlete id → our user.
      const usersSnap = await db.collection('users')
        .where('stravaAthleteId', '==', evt.ownerId).limit(1).get();
      if (usersSnap.empty) { await snap.ref.update({ status: 'ignored', reason: 'no matching user' }); return; }
      const userDoc = usersSnap.docs[0];
      const userRef = userDoc.ref;
      const user = userDoc.data();

      // Athlete deauthorization → clear stored tokens.
      if (evt.objectType === 'athlete') {
        const deauthed = evt.updates && (evt.updates.authorized === 'false' || evt.updates.authorized === false);
        if (deauthed) {
          await userRef.update({
            stravaAccessToken:  admin.firestore.FieldValue.delete(),
            stravaRefreshToken: admin.firestore.FieldValue.delete(),
            stravaTokenExpiry:  admin.firestore.FieldValue.delete(),
          });
          await snap.ref.update({ status: 'done', action: 'deauthorized' });
        } else {
          await snap.ref.update({ status: 'ignored', reason: 'athlete update (not deauth)' });
        }
        return;
      }

      if (evt.objectType !== 'activity') { await snap.ref.update({ status: 'ignored', reason: 'unknown objectType' }); return; }

      const runRef = db.collection('runs').doc(`strava_${userDoc.id}_${evt.objectId}`);

      // Activity deleted → remove the run + decrement totalMiles.
      if (evt.aspectType === 'delete') {
        const existing = await runRef.get();
        if (existing.exists) {
          const miles = existing.data().miles || 0;
          await runRef.delete();
          if (miles > 0) {
            // Atomic decrement — avoids clobbering concurrent webhook/poller writes.
            await userRef.update({
              totalMiles: admin.firestore.FieldValue.increment(-miles),
            });
          }
        }
        await snap.ref.update({ status: 'done', action: 'deleted' });
        return;
      }

      // Create / update — fetch the activity with the user's token.
      if (!user.stravaAccessToken) { await snap.ref.update({ status: 'ignored', reason: 'user not connected' }); return; }
      const accessToken = await getValidStravaToken(userRef, user);

      const activity = await fetchStravaActivity(accessToken, evt.objectId);
      if (!activity) { await snap.ref.update({ status: 'error', error: 'activity fetch failed' }); return; }

      const run = stravaActivityToRunServer(activity, userDoc.id, user.schoolId);
      if (!run) { await snap.ref.update({ status: 'ignored', reason: 'not a run / too short' }); return; }

      // Pace zones from the athlete's stored VDOT paces (if set).
      let paceZoneSeconds = null;
      if (user.trainingPaces) {
        const paceStream = await fetchStravaPaceStream(accessToken, evt.objectId);
        if (paceStream) paceZoneSeconds = calcPaceZoneBreakdown(paceStream, user.trainingPaces);
      }

      const existing = await runRef.get();
      const isNew = !existing.exists;
      await runRef.set({
        ...run,
        ...(paceZoneSeconds ? { paceZoneSeconds, hasPaceData: true } : { hasPaceData: false }),
      }, { merge: true });

      // Only touch totalMiles when creating a brand-new run doc — mirrors the
      // client poller's existing-id de-dupe so the webhook and the fallback
      // poller can never double-count the same activity.
      if (isNew) {
        // Atomic increment — two concurrent new-activity events can't clobber
        // each other's count (the isNew guard already prevents same-activity dupes).
        await userRef.update({
          totalMiles: admin.firestore.FieldValue.increment(run.miles),
        });
      }

      await snap.ref.update({ status: 'done', action: isNew ? 'created' : 'updated' });
    } catch (e) {
      console.error('processStravaEvent failed:', e);
      try { await snap.ref.update({ status: 'error', error: String((e && e.message) || e) }); } catch (_) {}
    }
  });

// ── Strava backfill (server-side history import) ─────────────────────────────
// The browser can't pull activity history directly (Strava's data API is
// CORS-blocked), so the web app calls this endpoint to import the last N days
// server-side. Native could use it too, but currently keeps its client poller.
//
// Auth: requires the caller's Firebase ID token in the Authorization header and
// only ever touches THAT user's own runs — so it stays on onRequest (consistent
// with the other Strava endpoints) without exposing anyone else's data.
// Dedupe + atomic totalMiles increment mirror the webhook so history import and
// the event-driven webhook can't double-count the same activity.
exports.stravaBackfill = functions
  .runWith({ maxInstances: 10, timeoutSeconds: 300 })
  .https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return; }

    // Verify the Firebase ID token → the uid we'll import for.
    const authHeader = req.headers.authorization || '';
    const m = authHeader.match(/^Bearer (.+)$/);
    if (!m) { res.status(401).json({ error: 'Missing auth token' }); return; }
    let uid;
    try {
      const decoded = await admin.auth().verifyIdToken(m[1]);
      uid = decoded.uid;
    } catch (e) {
      res.status(401).json({ error: 'Invalid auth token' }); return;
    }

    // Clamp the window to 1–90 days (Strava history we're willing to pull).
    const days = Math.min(Math.max(parseInt(req.body && req.body.days, 10) || 60, 1), 90);

    try {
      const userRef = db.collection('users').doc(uid);
      const userSnap = await userRef.get();
      if (!userSnap.exists) { res.status(404).json({ error: 'User not found' }); return; }
      const user = userSnap.data();
      if (!user.stravaAccessToken) { res.status(400).json({ error: 'Strava not connected' }); return; }

      const accessToken = await getValidStravaToken(userRef, user);
      const after = Math.floor((Date.now() - days * 86400000) / 1000);
      const activities = await fetchStravaActivitiesServer(accessToken, after);

      let imported = 0;
      let skipped = 0;
      let milesImported = 0;
      let streamsRateLimited = false; // once true, import miles-only for the rest

      for (const activity of activities) {
        const run = stravaActivityToRunServer(activity, uid, user.schoolId);
        if (!run) { skipped++; continue; }

        const runRef = db.collection('runs').doc(`strava_${uid}_${activity.id}`);
        const existing = await runRef.get();
        const isNew = !existing.exists;

        // Pace zones from the athlete's stored VDOT paces, unless we've started
        // hitting Strava rate limits (then just import the mileage).
        let paceZoneSeconds = null;
        if (user.trainingPaces && !streamsRateLimited) {
          const stream = await fetchStravaPaceStream(accessToken, activity.id);
          if (stream) paceZoneSeconds = calcPaceZoneBreakdown(stream, user.trainingPaces);
          else streamsRateLimited = true; // null can mean 429 — stop hammering streams
          await new Promise(r => setTimeout(r, 120)); // gentle pacing under the rate limit
        }

        await runRef.set({
          ...run,
          ...(paceZoneSeconds ? { paceZoneSeconds, hasPaceData: true } : { hasPaceData: false }),
        }, { merge: true });

        if (isNew) {
          milesImported += run.miles;
          imported++;
        } else {
          skipped++;
        }
      }

      // Atomic increment so backfill can't clobber concurrent webhook writes.
      if (milesImported > 0) {
        await userRef.update({
          totalMiles: admin.firestore.FieldValue.increment(Math.round(milesImported * 10) / 10),
        });
      }

      res.json({
        imported,
        skipped,
        miles: Math.round(milesImported * 10) / 10,
        partial: streamsRateLimited, // true → some runs imported without pace zones
      });
    } catch (e) {
      console.error('stravaBackfill failed:', e);
      res.status(500).json({ error: String((e && e.message) || e) });
    }
  });

// ── Push Notification on New Team Post ───────────────────────────────────────
// Triggered when a new document is created in the teamPosts collection.
// Sends push notifications to all relevant users based on the channel.

exports.onNewTeamPost = functions.firestore
  .document('teamPosts/{postId}')
  .onCreate(async (snap, context) => {
    const post = snap.data();
    if (!post.schoolId || !post.text) return;

    const { schoolId, channel, authorId, authorName, text } = post;
    const channelKey = channel || 'whole_team';

    try {
      // Query users who should receive this notification
      const usersSnap = await db.collection('users')
        .where('schoolId', '==', schoolId)
        .get();

      // Also query parents with linked athletes at this school
      const parentSnap = await db.collection('users')
        .where('role', '==', 'parent')
        .get();

      const allUsers = [
        ...usersSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      ];

      // Add parents whose linked athletes are at this school
      const schoolAthleteIds = usersSnap.docs
        .filter(d => d.data().role === 'athlete')
        .map(d => d.id);

      parentSnap.docs.forEach(d => {
        const parent = { id: d.id, ...d.data() };
        const linked = parent.linkedAthleteIds || [];
        if (linked.some(id => schoolAthleteIds.includes(id))) {
          // Only add if not already in the list
          if (!allUsers.find(u => u.id === parent.id)) {
            allUsers.push(parent);
          }
        }
      });

      // Filter by channel
      const recipients = allUsers.filter(user => {
        // Never notify the author
        if (user.id === authorId) return false;
        // Must have a push token (either native Expo OR web FCM)
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
            // Group channel (e.g., "group_ABC123")
            if (channelKey.startsWith('group_')) {
              const groupId = channelKey.replace('group_', '');
              return isCoach || user.groupId === groupId;
            }
            return true;
        }
      });

      if (recipients.length === 0) return;

      // Build push messages — native Expo and web FCM in parallel arrays.
      const title = authorName || 'New message';
      const body = text.length > 100 ? text.slice(0, 97) + '...' : text;
      const data = { channel: channelKey, postId: context.params.postId };

      const messages = [];
      const webMessages = [];
      for (const user of recipients) {
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

      // Send in chunks (Expo limit: 100 per batch)
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
// Runs once daily at 4 PM Eastern (3 PM CT, 2 PM MT, 1 PM PT).
// Sends a push only to athletes who haven't checked in today.

exports.dailyCheckinReminder = functions.pubsub
  .schedule('0 16 * * *')
  .timeZone('America/New_York')
  .onRun(async (context) => {
    try {
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

      const athletesSnap = await db.collection('users')
        .where('role', '==', 'athlete')
        .where('status', '==', 'approved')
        .get();

      if (athletesSnap.empty) return;

      const checkinsSnap = await db.collection('checkins')
        .where('date', '>=', admin.firestore.Timestamp.fromDate(todayStart))
        .get();

      const checkedInUserIds = new Set(
        checkinsSnap.docs.map(d => d.data().userId).filter(Boolean)
      );

      const title = 'Daily Check-In';
      const body = 'How are you feeling? A quick check-in helps your coach keep you healthy.';
      const data = { type: 'checkin_reminder' };

      const messages = [];
      const webMessages = [];
      athletesSnap.docs.forEach(doc => {
        const athlete = doc.data();
        if (checkedInUserIds.has(doc.id)) return;
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
// Runs every hour on Saturday (UTC). For each school, checks the school's local
// time and fires pushes only when local hour is 12:00 on Saturday. This means
// every school gets exactly one push per Saturday at their own noon, regardless
// of timezone. Athletes who've already submitted this week are skipped.
//
// Note: schools in timezones where Saturday-noon-local falls on Friday UTC
// (UTC+12 and beyond) are NOT supported by this Saturday-only cron. US-only
// timezones all sit within Saturday UTC so this is fine for current scope.

exports.weeklyCheckinReminder = functions.pubsub
  .schedule('0 * * * 6')
  .onRun(async () => {
    try {
      const now = new Date();
      const schoolsSnap = await db.collection('schools').get();
      if (schoolsSnap.empty) return;

      for (const schoolDoc of schoolsSnap.docs) {
        const school = schoolDoc.data();
        const tz = school.timezone || 'America/New_York';

        // Compute the school's local hour + weekday
        const localFmt = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          hour: '2-digit', hour12: false, weekday: 'short',
        });
        const parts = {};
        localFmt.formatToParts(now).forEach(p => { parts[p.type] = p.value; });
        const localHour = parseInt(parts.hour, 10) % 24;
        if (parts.weekday !== 'Sat' || localHour !== 12) continue;

        // The Saturday-noon date in the school's TZ — anchors weekly checkins
        const dateFmt = new Intl.DateTimeFormat('en-CA', {
          timeZone: tz,
          year: 'numeric', month: '2-digit', day: '2-digit',
        });
        const anchor = dateFmt.format(now); // en-CA → YYYY-MM-DD

        const athletesSnap = await db.collection('users')
          .where('schoolId', '==', schoolDoc.id)
          .where('role', '==', 'athlete')
          .where('status', '==', 'approved')
          .get();
        if (athletesSnap.empty) continue;

        // Skip athletes who already submitted this week
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

exports.onWeeklyCheckinReply = functions.firestore
  .document('weeklyCheckins/{docId}')
  .onUpdate(async (change, context) => {
    try {
      const before = change.before.data();
      const after = change.after.data();
      if (!after?.coachReply || !after.userId) return;

      // Fire on either a brand-new reply OR a text edit. Skip everything else
      // (athlete editing their message, athleteViewedReplyAt clearing, etc.).
      const isNewReply = !before?.coachReply;
      const isEdited = !isNewReply && before.coachReply.text !== after.coachReply.text;
      if (!isNewReply && !isEdited) return;

      // On an edit, clear the athlete's "viewed" timestamp so the home-screen
      // "Coach replied" card resurfaces. Coaches can't write this field via
      // Firestore rules (intentional), so the Function does it admin-side.
      // This re-triggers onUpdate but the next pass will short-circuit because
      // coachReply.text is unchanged.
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

// ── Billing kill-switch (cost-abuse backstop) ────────────────────────────────
// Triggered by Cloud Billing budget alerts published to the `budget-alerts`
// Pub/Sub topic. When ACTUAL spend exceeds the budget, it DISABLES billing on
// the project — a deliberate nuclear backstop against a runaway cost-abuse loop.
//
// ⚠️ DISABLING BILLING TAKES THE WHOLE APP OFFLINE (Firestore, Functions, FCM
// all stop serving). This is intentional: a surprise multi-thousand-dollar bill
// is worse than a brief outage. The 50% / 90% budget alerts are email-only and
// warn first; this handler only acts once spend is AT/OVER 100% of budget. To
// recover, re-link the billing account in the GCP console (Billing → Account
// management) — nothing here re-enables billing automatically.
//
// ONE-TIME SETUP (see walkthrough):
//   1. Create the Pub/Sub topic `budget-alerts`.
//   2. Create a Cloud Billing budget and set its notifications to that topic.
//   3. Grant this function's runtime service account
//      (PROJECT_ID@appspot.gserviceaccount.com) the "Billing Account
//      Administrator" role ON THE BILLING ACCOUNT — without it,
//      updateProjectBillingInfo() is permission-denied and the switch no-ops.
exports.stopBillingOnBudget = functions.pubsub
  .topic('budget-alerts')
  .onPublish(async (message) => {
    const { CloudBillingClient } = require('@google-cloud/billing');
    const billing = new CloudBillingClient();
    const projectName = `projects/${process.env.GCLOUD_PROJECT}`;

    const data = message.json || {};
    // Budget alert payload includes costAmount + budgetAmount (same currency).
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

    // Empty billingAccountName detaches the billing account → billing disabled.
    await billing.updateProjectBillingInfo({
      name: projectName,
      projectBillingInfo: { billingAccountName: '' },
    });
    console.error(
      `BILLING DISABLED for ${projectName}: spend ${data.costAmount} ` +
      `exceeded budget ${data.budgetAmount}. Re-enable manually in GCP console.`
    );
  });
