// ── XCTracker Heart Rate Zone System ─────────────────────────────────────────
//
// Zones are defined as percentages of Max HR.
// Max HR is calculated as 220 - age (default) or coach-entered value.
// Coaches can adjust zone boundaries per athlete in the app.
//
// Standard default boundaries (used by most endurance coaches):
//   Zone 1 — Recovery:      < 60% max HR
//   Zone 2 — Aerobic Base:  60–70% max HR  ← THE MOST IMPORTANT ZONE
//   Zone 3 — Aerobic Power: 70–80% max HR
//   Zone 4 — Threshold:     80–90% max HR
//   Zone 5 — Anaerobic:     > 90% max HR
//
// The 80/20 principle: elite endurance programs target ~80% Zone 1-2, ~20% Zone 3-5.

export const DEFAULT_ZONE_BOUNDARIES = {
  // Each value is the LOWER boundary of that zone (as % of max HR, 0–1)
  z1: 0.00,   // Zone 1 starts at 0%
  z2: 0.60,   // Zone 2 starts at 60%
  z3: 0.70,   // Zone 3 starts at 70%
  z4: 0.80,   // Zone 4 starts at 80%
  z5: 0.90,   // Zone 5 starts at 90%
};

export const ZONE_META = {
  1: { name: 'Recovery',      color: '#64b5f6', description: 'Very easy. Full conversation possible. Active recovery.' },
  2: { name: 'Aerobic Base',  color: '#4caf50', description: 'Comfortable. Can speak in sentences. The base-building zone.' },
  3: { name: 'Aerobic Power', color: '#ff9800', description: 'Moderately hard. Tempo effort. Sentences become difficult.' },
  4: { name: 'Threshold',     color: '#f44336', description: 'Hard. Lactate threshold. Only a few words at a time.' },
  5: { name: 'Anaerobic',     color: '#9c27b0', description: 'Maximum effort. Cannot speak. Short intervals only.' },
};

// ── Calculate max HR ──────────────────────────────────────────────────────────
export function calcMaxHR(age, customMaxHR = null) {
  if (customMaxHR && customMaxHR > 0) return customMaxHR;
  return 220 - (age || 16);
}

// ── Get zone for a given heart rate ──────────────────────────────────────────
// boundaries: zoneConfig.boundaries or DEFAULT_ZONE_BOUNDARIES
// Returns: { zone: 1-5, name, color } or null
export function getZoneForHR(heartRate, maxHR, boundaries = DEFAULT_ZONE_BOUNDARIES) {
  if (!heartRate || !maxHR) return null;
  const pct = heartRate / maxHR;
  if (pct < boundaries.z2) return { zone: 1, ...ZONE_META[1] };
  if (pct < boundaries.z3) return { zone: 2, ...ZONE_META[2] };
  if (pct < boundaries.z4) return { zone: 3, ...ZONE_META[3] };
  if (pct < boundaries.z5) return { zone: 4, ...ZONE_META[4] };
  return                          { zone: 5, ...ZONE_META[5] };
}

// ── Legacy helper — age-based, uses default boundaries ───────────────────────
// Keep this for backward compatibility with existing code
export function getHRZone(heartRate, age, customMaxHR = null, boundaries = DEFAULT_ZONE_BOUNDARIES) {
  if (!heartRate || !age) return null;
  const maxHR = calcMaxHR(age, customMaxHR);
  return getZoneForHR(heartRate, maxHR, boundaries);
}

// ── Calculate zone breakdown from an array of HR data points ─────────────────
// hrStream: array of { hr, seconds } — one entry per second from Strava stream
// OR: array of run objects with { heartRate, duration } — for average-HR fallback
// Returns: array of { zone, minutes, seconds, pct } sorted by zone
export function calcZoneBreakdownFromStream(hrStream, maxHR, boundaries = DEFAULT_ZONE_BOUNDARIES) {
  if (!hrStream || hrStream.length === 0) return null;

  const zoneSecs = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  hrStream.forEach(point => {
    const zone = getZoneForHR(point.hr, maxHR, boundaries);
    if (zone) zoneSecs[zone.zone] += point.seconds || 1;
  });

  const totalSecs = Object.values(zoneSecs).reduce((s, v) => s + v, 0);
  if (totalSecs === 0) return null;

  return Object.entries(zoneSecs)
    .filter(([, s]) => s > 0)
    .map(([zone, secs]) => ({
      zone:    parseInt(zone),
      seconds: secs,
      minutes: Math.round(secs / 60),
      pct:     Math.round((secs / totalSecs) * 100),
      ...ZONE_META[parseInt(zone)],
    }))
    .sort((a, b) => a.zone - b.zone);
}

// ── Calculate zone breakdown from runs with avg HR (fallback) ─────────────────
// Allocates the full run duration to the zone of the average HR
export function calcZoneBreakdownFromRuns(runs, age, customMaxHR = null, boundaries = DEFAULT_ZONE_BOUNDARIES) {
  const maxHR = calcMaxHR(age, customMaxHR);
  const zoneSecs = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  runs.forEach(run => {
    const zone = getZoneForHR(run.heartRate, maxHR, boundaries);
    if (!zone) return;
    const secs = parseDurationSeconds(run.duration);
    if (secs > 0) zoneSecs[zone.zone] += secs;
  });

  const totalSecs = Object.values(zoneSecs).reduce((s, v) => s + v, 0);
  if (totalSecs === 0) return null;

  return Object.entries(zoneSecs)
    .filter(([, s]) => s > 0)
    .map(([zone, secs]) => ({
      zone:    parseInt(zone),
      seconds: secs,
      minutes: Math.round(secs / 60),
      pct:     Math.round((secs / totalSecs) * 100),
      ...ZONE_META[parseInt(zone)],
    }))
    .sort((a, b) => a.zone - b.zone);
}

// ── Parse duration string to seconds ─────────────────────────────────────────
export function parseDurationSeconds(durationStr) {
  if (!durationStr) return 0;
  const parts = durationStr.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

// ── Format seconds to human-readable ─────────────────────────────────────────
export function formatMinutes(minutes) {
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes}m`;
}

// ── 80/20 analysis ────────────────────────────────────────────────────────────
export function calc8020(breakdown) {
  if (!breakdown || breakdown.length === 0) return null;
  const easyPct = breakdown.filter(z => z.zone <= 2).reduce((s, z) => s + z.pct, 0);
  const hardPct = breakdown.filter(z => z.zone >= 3).reduce((s, z) => s + z.pct, 0);
  return {
    easyPct,
    hardPct,
    status: easyPct >= 75 ? 'great' : easyPct >= 65 ? 'good' : 'too_hard',
    message: easyPct >= 75
      ? `${easyPct}% easy — great 80/20 balance`
      : easyPct >= 65
        ? `${easyPct}% easy — slightly more Zone 2 recommended`
        : `${easyPct}% easy — too much intensity, prioritize Zone 2`,
  };
}