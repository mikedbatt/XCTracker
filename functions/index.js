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
