const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const { Expo } = require('expo-server-sdk');

admin.initializeApp();
const db = admin.firestore();
const expo = new Expo();

// ── Strava Token Exchange ────────────────────────────────────────────────────
// Moves client_secret server-side so it never ships in the app bundle.

exports.stravaTokenExchange = functions.https.onCall(async (data, context) => {
  const { code, redirectUri } = data;
  if (!code) throw new functions.https.HttpsError('invalid-argument', 'Missing code');

  const config = functions.config().strava || {};
  const clientId = config.client_id;
  const clientSecret = config.client_secret;

  if (!clientId || !clientSecret) {
    throw new functions.https.HttpsError('failed-precondition', 'Strava config not set');
  }

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
    throw new functions.https.HttpsError('internal', `Strava token exchange failed: ${err}`);
  }

  return response.json();
});

// ── Strava Token Refresh ─────────────────────────────────────────────────────

exports.stravaTokenRefresh = functions.https.onCall(async (data, context) => {
  const { refreshToken } = data;
  if (!refreshToken) throw new functions.https.HttpsError('invalid-argument', 'Missing refreshToken');

  const config = functions.config().strava || {};
  const clientId = config.client_id;
  const clientSecret = config.client_secret;

  if (!clientId || !clientSecret) {
    throw new functions.https.HttpsError('failed-precondition', 'Strava config not set');
  }

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

  if (!response.ok) {
    throw new functions.https.HttpsError('internal', 'Strava token refresh failed');
  }

  return response.json();
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
