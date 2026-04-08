// ── Strava API Configuration ──────────────────────────────────────────────────
// IMPORTANT: Before launching to production, move STRAVA_CLIENT_SECRET
// to a Firebase Cloud Function. Never ship a client secret in a production app.

export const STRAVA_CONFIG = {
  clientId:     process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID,
  clientSecret: process.env.EXPO_PUBLIC_STRAVA_CLIENT_SECRET,
  scopes:       'activity:read_all',
  tokenUrl:     'https://www.strava.com/oauth/token',
  authUrl:      'https://www.strava.com/oauth/authorize',
  activitiesUrl:'https://www.strava.com/api/v3/athlete/activities',
};

// ── Token exchange: code → access + refresh tokens ───────────────────────────
export async function exchangeStravaCode(code, redirectUri) {
  const response = await fetch(STRAVA_CONFIG.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     STRAVA_CONFIG.clientId,
      client_secret: STRAVA_CONFIG.clientSecret,
      code,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Token exchange failed: ${err}`);
  }
  return response.json();
  // Returns: { access_token, refresh_token, expires_at, athlete: { id, ... } }
}

// ── Refresh expired access token ─────────────────────────────────────────────
export async function refreshStravaToken(refreshToken) {
  const response = await fetch(STRAVA_CONFIG.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     STRAVA_CONFIG.clientId,
      client_secret: STRAVA_CONFIG.clientSecret,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
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

// ── Convert Strava activity to XCTracker run format ───────────────────────────
export function stravaActivityToRun(activity, userId, schoolId) {
  // Only import running activities
  const runTypes = ['Run', 'TrailRun', 'VirtualRun'];
  if (!runTypes.includes(activity.type)) return null;

  const miles = (activity.distance / 1609.344);
  if (miles < 0.1) return null; // skip tiny activities

  // Convert seconds to MM:SS
  const totalSeconds = activity.moving_time;
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const duration = `${mins}:${secs.toString().padStart(2, '0')}`;

  // Calculate average pace from speed (sec/mile)
  const averagePace = activity.average_speed > 0
    ? Math.round(1609.344 / activity.average_speed)
    : null;

  return {
    userId,
    schoolId: schoolId || null,
    miles: Math.round(miles * 100) / 100,
    duration,
    heartRate: activity.average_heartrate ? Math.round(activity.average_heartrate) : null,
    maxHeartRate: activity.max_heartrate ? Math.round(activity.max_heartrate) : null,
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

// ── Fetch activity streams (HR + velocity) ───────────────────────────────────
// Returns { hrStream, paceStream } where each is an array of { value, seconds }
// hrStream entries: { hr, seconds }
// paceStream entries: { pace (sec/mile), seconds }
export async function fetchStravaStreams(accessToken, activityId) {
  const url = `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=heartrate,time,velocity_smooth&key_by_type=true`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return { hrStream: null, paceStream: null };
  const data = await response.json();

  const timeData = data.time?.data;
  if (!timeData) return { hrStream: null, paceStream: null };

  // Build HR stream
  let hrStream = null;
  if (data.heartrate?.data) {
    const hrData = data.heartrate.data;
    const stream = [];
    for (let i = 0; i < hrData.length; i++) {
      const duration = i < hrData.length - 1 ? timeData[i + 1] - timeData[i] : 1;
      if (hrData[i] > 0) stream.push({ hr: hrData[i], seconds: duration });
    }
    hrStream = stream.length > 0 ? stream : null;
  }

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

  return { hrStream, paceStream };
}

// Legacy alias for backward compatibility
export async function fetchStravaHRStream(accessToken, activityId) {
  const { hrStream } = await fetchStravaStreams(accessToken, activityId);
  return hrStream;
}

// ── Enhanced activity converter with stream data ──────────────────────────────
export async function fetchRunWithZones(accessToken, activity, userId, schoolId, maxHR, boundaries) {
  const baseRun = stravaActivityToRun(activity, userId, schoolId);
  if (!baseRun) return null;

  try {
    const stream = await fetchStravaHRStream(accessToken, activity.id);
    if (stream && maxHR) {
      const { calcZoneBreakdownFromStream } = await import('./zoneConfig.js');
      const breakdown = calcZoneBreakdownFromStream(stream, maxHR, boundaries);
      if (breakdown) {
        const zoneSeconds = {};
        breakdown.forEach(z => { zoneSeconds[`z${z.zone}`] = z.seconds; });
        return { ...baseRun, zoneSeconds, hasStreamData: true };
      }
    }
  } catch (e) {
    console.log('HR stream fetch failed, using average HR:', e);
  }

  return { ...baseRun, hasStreamData: false };
}

// ── Auto-sync Strava on app load ──────────────────────────────────────────────
// Called silently from AthleteDashboard on mount. Does not block the UI.
// Returns { imported, miles } or null if Strava is not connected / error.
export async function autoSyncStrava(userId, userData, teamZoneSettings) {
  try {
    const {
      getDoc, doc, getDocs, collection,
      query, where, setDoc, updateDoc,
    } = await import('firebase/firestore');
    const { db } = await import('./firebaseConfig');
    const {
      calcMaxHR, calcZoneBreakdownFromStream, DEFAULT_ZONE_BOUNDARIES,
    } = await import('./zoneConfig');

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
        console.log('Auto-sync token refresh failed:', e);
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

    // Zone calculation setup — uses coach-configured team boundaries
    const boundaries  = teamZoneSettings?.boundaries  || DEFAULT_ZONE_BOUNDARIES;
    const customMaxHR = teamZoneSettings?.customMaxHR || null;
    const age = userData?.birthdate
      ? Math.floor((new Date() - new Date(userData.birthdate)) / (365.25 * 86400000))
      : 16;
    const maxHR = calcMaxHR(age, customMaxHR);

    let imported           = 0;
    let totalMilesImported = 0;

    for (const activity of activities) {
      // Skip already-imported runs
      if (existingIds.has(activity.id.toString())) continue;

      const run = stravaActivityToRun(activity, userId, userData?.schoolId);
      if (!run) continue;

      // Fetch streams (HR + velocity) for zone data
      let zoneSeconds = null;
      let rawHRStream = null;
      let rawPaceStream = null;
      let paceZoneSeconds = null;
      try {
        const { hrStream, paceStream } = await fetchStravaStreams(accessToken, activity.id);

        // HR zones
        if (hrStream && maxHR) {
          rawHRStream = hrStream;
          const breakdown = calcZoneBreakdownFromStream(hrStream, maxHR, boundaries);
          if (breakdown) {
            zoneSeconds = {};
            breakdown.forEach(z => { zoneSeconds[`z${z.zone}`] = z.seconds; });
          }
        }

        // Pace zones (if athlete has VDOT set)
        if (paceStream) {
          rawPaceStream = paceStream;
          if (userData?.trainingPaces) {
            const { calcPaceZoneBreakdown } = await import('./utils/vdotUtils.js');
            paceZoneSeconds = calcPaceZoneBreakdown(paceStream, userData.trainingPaces);
          }
        }

        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        console.log('Auto-sync stream fetch:', e);
      }

      // Write the run to Firestore
      await setDoc(doc(collection(db, 'runs')), {
        ...run,
        ...(zoneSeconds ? { zoneSeconds, hasStreamData: true } : { hasStreamData: false }),
        ...(rawHRStream ? { rawHRStream } : {}),
        ...(rawPaceStream ? { rawPaceStream, hasPaceData: true } : { hasPaceData: false }),
        ...(paceZoneSeconds ? { paceZoneSeconds } : {}),
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
    console.log('Auto-sync error:', e);
    return null;
  }
}