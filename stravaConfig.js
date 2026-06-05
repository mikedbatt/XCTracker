// ── Strava API Configuration ──────────────────────────────────────────────────
// Token exchange and refresh are handled by Firebase Cloud Functions (onRequest
// HTTP endpoints). The client secret never ships in the app bundle. NOTE: kept
// on onRequest (NOT onCall) so client and deployed functions stay matched — a
// protocol change breaks every un-updated build. Revisit onCall only paired with
// App Check, shipped together with a new build.

const FUNCTIONS_BASE = 'https://us-central1-xctracker-a2532.cloudfunctions.net';

export const STRAVA_CONFIG = {
  clientId:     process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID,
  scopes:       'activity:read_all',
  authUrl:      'https://www.strava.com/oauth/authorize',
  activitiesUrl:'https://www.strava.com/api/v3/athlete/activities',
};

// ── Token exchange via Cloud Function ────────────────────────────────────────
export async function exchangeStravaCode(code, redirectUri) {
  const response = await fetch(`${FUNCTIONS_BASE}/stravaTokenExchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirectUri }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Token exchange failed: ${err}`);
  }
  return response.json();
}

// ── Token refresh via Cloud Function ─────────────────────────────────────────
export async function refreshStravaToken(refreshToken) {
  const response = await fetch(`${FUNCTIONS_BASE}/stravaTokenRefresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) throw new Error('Token refresh failed');
  return response.json();
}

// ── Fetch ALL activities from Strava with pagination ──────────────────────────
export async function fetchStravaActivities(accessToken, afterTimestamp = null) {
  const allActivities = [];
  let page = 1;

  while (true) {
    let url = `${STRAVA_CONFIG.activitiesUrl}?per_page=50&page=${page}`;
    if (afterTimestamp) url += `&after=${afterTimestamp}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error('Failed to fetch Strava activities');

    const activities = await response.json();
    if (!activities || activities.length === 0) break;

    allActivities.push(...activities);

    // If we got less than 50 results this page, we've reached the end
    if (activities.length < 50) break;

    page++;

    // Safety limit — never fetch more than 10 pages (500 activities)
    if (page > 10) break;
  }

  return allActivities;
}

// ── Convert Strava activity to TeamBase run format ───────────────────────────
export function stravaActivityToRun(activity, userId, schoolId) {
  // Only import running activities
  const runTypes = ['Run', 'TrailRun', 'VirtualRun'];
  if (!runTypes.includes(activity.type)) return null;

  const miles = (activity.distance / 1609.344);
  if (miles < 0.1) return null; // skip tiny activities

  // Convert seconds to MM:SS, or HH:MM:SS for runs ≥ 1 hour
  const totalSeconds = activity.moving_time;
  const hours = Math.floor(totalSeconds / 3600);
  const mins  = Math.floor((totalSeconds % 3600) / 60);
  const secs  = totalSeconds % 60;
  const duration = hours > 0
    ? `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    : `${mins}:${secs.toString().padStart(2, '0')}`;

  // Calculate average pace from speed (sec/mile)
  const averagePace = activity.average_speed > 0
    ? Math.round(1609.344 / activity.average_speed)
    : null;

  return {
    userId,
    schoolId: schoolId || null,
    miles: Math.round(miles * 100) / 100,
    duration,
    elevationGain: activity.total_elevation_gain ? Math.round(activity.total_elevation_gain * 3.281) : null, // meters to feet
    averagePace,
    effort: null,   // athlete fills this in after import
    notes: activity.name !== 'Morning Run' && activity.name !== 'Afternoon Run' && activity.name !== 'Evening Run'
      ? activity.name : null,
    source: 'strava',
    stravaId: activity.id.toString(),
    date: new Date(activity.start_date),
  };
}

// ── Fetch activity pace stream (velocity) ────────────────────────────────────
// Returns { paceStream } — an array of { pace (sec/mile), seconds } per point.
export async function fetchStravaStreams(accessToken, activityId) {
  const url = `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=time,velocity_smooth&key_by_type=true`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return { paceStream: null };
  const data = await response.json();

  const timeData = data.time?.data;
  if (!timeData) return { paceStream: null };

  // Build pace stream (velocity m/s → sec/mile)
  let paceStream = null;
  if (data.velocity_smooth?.data) {
    const velData = data.velocity_smooth.data;
    const stream = [];
    for (let i = 0; i < velData.length; i++) {
      const duration = i < velData.length - 1 ? timeData[i + 1] - timeData[i] : 1;
      if (velData[i] > 0.5) { // Skip near-zero velocity (stopped/walking very slow)
        const paceSecPerMile = 1609.344 / velData[i];
        stream.push({ pace: Math.round(paceSecPerMile), seconds: duration });
      }
    }
    paceStream = stream.length > 0 ? stream : null;
  }

  return { paceStream };
}

// ── Auto-sync Strava on app load ──────────────────────────────────────────────
// Called silently from AthleteDashboard on mount. Does not block the UI.
// Returns { imported, miles } or null if Strava is not connected / error.
export async function autoSyncStrava(userId, userData) {
  try {
    const {
      getDoc, doc, getDocs, collection,
      query, where, setDoc, updateDoc,
    } = await import('firebase/firestore');
    const { db } = await import('./firebaseConfig');

    // Load user doc to get Strava tokens
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) return null;
    const data = userDoc.data();

    // Bail out early if Strava is not connected
    if (!data.stravaAccessToken) return null;

    // Refresh token if expired or expiring within 5 minutes
    let accessToken = data.stravaAccessToken;
    const nowSecs = Math.floor(Date.now() / 1000);
    if (data.stravaTokenExpiry && data.stravaTokenExpiry <= nowSecs + 300) {
      try {
        const refreshed = await refreshStravaToken(data.stravaRefreshToken);
        await updateDoc(doc(db, 'users', userId), {
          stravaAccessToken:  refreshed.access_token,
          stravaRefreshToken: refreshed.refresh_token,
          stravaTokenExpiry:  refreshed.expires_at,
        });
        accessToken = refreshed.access_token;
      } catch (e) {
        console.warn('Auto-sync token refresh failed:', e);
        return null;
      }
    }

    // Work out the sync window — fetch everything since last sync
    const ninetyDaysAgo = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
    const lastSyncStr   = data.stravaLastSync;

    let lastSync;
    if (!lastSyncStr) {
      // First sync ever — go back 90 days
      lastSync = ninetyDaysAgo;
    } else {
      // Parse the stored ISO timestamp and fetch everything since then
      const lastSyncTime = Math.floor(new Date(lastSyncStr).getTime() / 1000);
      // Clamp to 90 days max to avoid pulling too much history
      lastSync = Math.max(lastSyncTime, ninetyDaysAgo);
    }

    // Fetch new activities from Strava
    const activities = await fetchStravaActivities(accessToken, lastSync);
    if (!activities || activities.length === 0) return { imported: 0, miles: 0 };

    // Get existing Strava run IDs to skip duplicates
    const existingSnap = await getDocs(query(
      collection(db, 'runs'),
      where('userId', '==', userId),
      where('source', '==', 'strava')
    ));
    const existingIds = new Set(existingSnap.docs.map(d => d.data().stravaId));

    let imported           = 0;
    let totalMilesImported = 0;

    for (const activity of activities) {
      // Skip already-imported runs
      if (existingIds.has(activity.id.toString())) continue;

      const run = stravaActivityToRun(activity, userId, userData?.schoolId);
      if (!run) continue;

      // Fetch the pace stream only to compute the zone breakdown at sync
      // time. We do NOT persist the raw stream — storing one entry per
      // second of activity inline on the run doc was OOM-crashing the app
      // for users with lots of synced runs. paceZoneSeconds is the durable
      // summary.
      let paceZoneSeconds = null;
      try {
        const { paceStream } = await fetchStravaStreams(accessToken, activity.id);

        if (paceStream && userData?.trainingPaces) {
          const { calcPaceZoneBreakdown } = await import('./utils/vdotUtils.js');
          paceZoneSeconds = calcPaceZoneBreakdown(paceStream, userData.trainingPaces);
        }

        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        console.warn('Auto-sync stream fetch:', e);
      }

      // Write the run to Firestore using a deterministic doc ID
      // (`strava_<userId>_<stravaId>`). Concurrent syncs that race each other
      // will overwrite the same doc instead of creating duplicate runs.
      await setDoc(doc(db, 'runs', `strava_${userId}_${activity.id}`), {
        ...run,
        ...(paceZoneSeconds ? { paceZoneSeconds, hasPaceData: true } : { hasPaceData: false }),
      });

      totalMilesImported += run.miles;
      imported++;
    }

    // Always update sync timestamp so the window advances even when no new runs
    const updateFields = { stravaLastSync: new Date().toISOString() };
    if (imported > 0) {
      updateFields.totalMiles = Math.round(((data.totalMiles || 0) + totalMilesImported) * 10) / 10;
    }
    await updateDoc(doc(db, 'users', userId), updateFields);

    return {
      imported,
      miles: Math.round(totalMilesImported * 10) / 10,
    };
  } catch (e) {
    // Auto-sync failures are silent — never crash the dashboard
    console.warn('Auto-sync error:', e);
    return null;
  }
}