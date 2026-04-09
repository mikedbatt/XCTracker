const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const { Expo } = require('expo-server-sdk');

admin.initializeApp();
const db = admin.firestore();
const expo = new Expo();

// ── Strava Token Exchange ────────────────────────────────────────────────────
// Moves client_secret server-side so it never ships in the app bundle.

exports.stravaTokenExchange = functions.https.onRequest(async (req, res) => {
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

exports.stravaTokenRefresh = functions.https.onRequest(async (req, res) => {
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
        // Must have a push token
        if (!user.expoPushToken) return false;

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

      // Build push messages
      const messages = [];
      for (const user of recipients) {
        if (!Expo.isExpoPushToken(user.expoPushToken)) continue;

        // Compute unread count for badge
        const lastSeen = user.lastSeenChannels?.[channelKey];
        // Simple badge: just set 1 for now (computing full unread count per user is expensive)
        // A more sophisticated approach would query all unread posts per user

        messages.push({
          to: user.expoPushToken,
          sound: 'default',
          title: authorName || 'New message',
          body: text.length > 100 ? text.slice(0, 97) + '...' : text,
          data: { channel: channelKey, postId: context.params.postId },
          badge: 1,
        });
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

      console.log(`Sent ${messages.length} push notifications for post in ${channelKey}`);
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

      const messages = [];
      athletesSnap.docs.forEach(doc => {
        const athlete = doc.data();
        if (checkedInUserIds.has(doc.id)) return;
        if (!athlete.expoPushToken || !Expo.isExpoPushToken(athlete.expoPushToken)) return;

        messages.push({
          to: athlete.expoPushToken,
          sound: 'default',
          title: 'Daily Check-In',
          body: 'How are you feeling? A quick check-in helps your coach keep you healthy.',
          data: { type: 'checkin_reminder' },
        });
      });

      if (messages.length === 0) return;

      const chunks = expo.chunkPushNotifications(messages);
      for (const chunk of chunks) {
        try {
          await expo.sendPushNotificationsAsync(chunk);
        } catch (error) {
          console.error('Checkin reminder push error:', error);
        }
      }

      console.log(`Sent ${messages.length} check-in reminders`);
    } catch (error) {
      console.error('dailyCheckinReminder error:', error);
    }
  });
