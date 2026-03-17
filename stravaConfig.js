// ── Strava API Configuration ──────────────────────────────────────────────────
// IMPORTANT: Before launching to production, move STRAVA_CLIENT_SECRET
// to a Firebase Cloud Function. Never ship a client secret in a production app.

export const STRAVA_CONFIG = {
  clientId:     '211521',
  clientSecret: '3f2fe7dbba6b93814d3477f7f0d48cb1e83b2051',
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

  return {
    userId,
    schoolId: schoolId || null,
    miles: Math.round(miles * 100) / 100,
    duration,
    heartRate: activity.average_heartrate ? Math.round(activity.average_heartrate) : null,
    maxHeartRate: activity.max_heartrate ? Math.round(activity.max_heartrate) : null,
    elevationGain: activity.total_elevation_gain ? Math.round(activity.total_elevation_gain * 3.281) : null, // meters to feet
    effort: null,   // athlete fills this in after import
    notes: activity.name !== 'Morning Run' && activity.name !== 'Afternoon Run' && activity.name !== 'Evening Run'
      ? activity.name : null,
    source: 'strava',
    stravaId: activity.id.toString(),
    date: new Date(activity.start_date),
  };
}