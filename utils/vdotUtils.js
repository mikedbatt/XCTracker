// ── VDOT Pace Calculator ─────────────────────────────────────────────────────
// Based on Jack Daniels' Running Formula. Uses the actual Daniels/Gilbert
// VO2max estimation formulas to calculate VDOT from any race performance
// and derive training paces for 5 zones.

// ── Standard race distances (meters) ─────────────────────────────────────────
export const RACE_DISTANCES = {
  'Mile':   1609.344,
  '1500m':  1500,
  '3K':     3000,
  '2 Mile': 3218.688,
  '5K':     5000,
  '8K':     8000,
  '10K':    10000,
};

// ── Daniels/Gilbert VO2 Formulas ─────────────────────────────────────────────

/**
 * Oxygen cost of running at a given velocity (Daniels & Gilbert formula).
 * @param {number} v — velocity in meters per minute
 * @returns {number} VO2 in ml/kg/min
 */
function oxygenCost(v) {
  return -4.60 + 0.182258 * v + 0.000104 * v * v;
}

/**
 * Fraction of VO2max sustainable for a given duration (Daniels & Gilbert).
 * @param {number} t — duration in minutes
 * @returns {number} fraction (0–1)
 */
function vo2maxFraction(t) {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
}

/**
 * Given a target VO2 (ml/kg/min), find the running velocity (m/min).
 * Inverts the oxygenCost formula using the quadratic formula.
 * @param {number} vo2 — target VO2
 * @returns {number} velocity in meters per minute
 */
function velocityFromVO2(vo2) {
  // 0.000104*v^2 + 0.182258*v + (-4.60 - vo2) = 0
  const a = 0.000104;
  const b = 0.182258;
  const c = -4.60 - vo2;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return 0;
  return (-b + Math.sqrt(discriminant)) / (2 * a);
}

// ── Core VDOT Calculation ────────────────────────────────────────────────────

/**
 * Calculate VDOT from a race performance using Daniels/Gilbert formulas.
 * @param {number} distanceMeters — race distance in meters
 * @param {number} timeSeconds — finish time in seconds
 * @returns {number} VDOT score (rounded to 1 decimal)
 */
export function calcVDOT(distanceMeters, timeSeconds) {
  if (!distanceMeters || !timeSeconds || timeSeconds <= 0) return null;

  const t = timeSeconds / 60; // duration in minutes
  const v = distanceMeters / t; // velocity in m/min

  const vo2 = oxygenCost(v);
  const fraction = vo2maxFraction(t);
  const vdot = vo2 / fraction;

  return Math.round(vdot * 10) / 10;
}

/**
 * Get training paces for a given VDOT score.
 * Uses Daniels' training intensity zones (% of VO2max) and inverts
 * the oxygen cost formula to find the corresponding velocity/pace.
 *
 * Zone intensities (% of VO2max):
 *   Easy:       59–74%  → eLow (74%), eHigh (59%)
 *   Marathon:   75–84%  → midpoint 80%
 *   Threshold:  83–88%  → midpoint 86%
 *   Interval:   95–100% → midpoint 98%
 *   Repetition: ~105% of vVO2max velocity
 *
 * @param {number} vdot — VDOT score
 * @returns {{ eLow, eHigh, m, t, i, r }} paces in seconds/mile
 */
export function getTrainingPaces(vdot) {
  if (!vdot || vdot <= 0) return null;

  const toSecPerMile = (velocityMperMin) => {
    if (velocityMperMin <= 0) return 999;
    return Math.round(1609.344 / velocityMperMin * 60);
  };

  // Find velocity for each zone by inverting VO2 formula at % of VDOT
  const eLowV  = velocityFromVO2(vdot * 0.74);  // fast end of easy
  const eHighV = velocityFromVO2(vdot * 0.59);  // slow end of easy
  const mV     = velocityFromVO2(vdot * 0.80);  // marathon pace
  const tV     = velocityFromVO2(vdot * 0.86);  // threshold pace
  const iV     = velocityFromVO2(vdot * 0.98);  // interval pace
  const rV     = iV * 1.07;                     // rep pace ~7% faster than interval

  return {
    eLow:  toSecPerMile(eLowV),   // faster easy (shorter pace = faster)
    eHigh: toSecPerMile(eHighV),  // slower easy
    m:     toSecPerMile(mV),
    t:     toSecPerMile(tV),
    i:     toSecPerMile(iV),
    r:     toSecPerMile(rV),
  };
}

// ── Pace Zone Classification ─────────────────────────────────────────────────

export const PACE_ZONES = [
  { key: 'r', name: 'Repetition', color: '#9c27b0', short: 'R' },
  { key: 'i', name: 'Interval',   color: '#e91e63', short: 'I' },
  { key: 't', name: 'Threshold',  color: '#ff9800', short: 'T' },
  { key: 'm', name: 'Marathon',   color: '#2196f3', short: 'M' },
  { key: 'e', name: 'Easy',       color: '#4caf50', short: 'E' },
];

/**
 * Classify a pace (sec/mile) into a VDOT training zone.
 * Boundaries are midpoints between adjacent zone paces.
 * @param {number} paceSecPerMile
 * @param {object} trainingPaces — from getTrainingPaces()
 * @returns {string} zone key: 'e', 'm', 't', 'i', or 'r'
 */
export function getPaceZone(paceSecPerMile, trainingPaces) {
  if (!trainingPaces || !paceSecPerMile || paceSecPerMile <= 0) return 'e';

  const riBoundary = (trainingPaces.r + trainingPaces.i) / 2;
  const itBoundary = (trainingPaces.i + trainingPaces.t) / 2;
  const tmBoundary = (trainingPaces.t + trainingPaces.m) / 2;
  const meBoundary = trainingPaces.eHigh;

  if (paceSecPerMile <= riBoundary) return 'r';
  if (paceSecPerMile <= itBoundary) return 'i';
  if (paceSecPerMile <= tmBoundary) return 't';
  if (paceSecPerMile <= meBoundary) return 'm';
  return 'e';
}

/**
 * Calculate pace zone breakdown from a raw pace stream.
 * @param {Array<{pace: number, seconds: number}>} paceStream — sec/mile + duration per point
 * @param {object} trainingPaces — from getTrainingPaces()
 * @returns {{ e, m, t, i, r }} seconds spent in each zone
 */
export function calcPaceZoneBreakdown(paceStream, trainingPaces) {
  const zones = { e: 0, m: 0, t: 0, i: 0, r: 0 };
  if (!paceStream || !trainingPaces) return zones;

  for (const point of paceStream) {
    if (!point.pace || point.pace <= 0 || point.pace > 1800) continue; // skip stopped (>30 min/mi)
    const zone = getPaceZone(point.pace, trainingPaces);
    zones[zone] += point.seconds || 1;
  }
  return zones;
}

/**
 * Compute pace-zone seconds for a single run, with sensible fallbacks.
 * Tiered priority (most precise first):
 *   1. rawPaceStream  — per-second pace data from Strava
 *   2. paceZoneSeconds — pre-computed at sync time
 *   3. miles + duration — derive avg pace, assign whole run to one zone
 *      (used for manual run entries with no pace stream)
 *
 * Returns `{ e, m, t, i, r }` seconds, or null if the run has neither
 * pace data nor miles+duration to derive from.
 */
export function calcPaceZoneSecondsForRun(run, trainingPaces) {
  if (!run || !trainingPaces) return null;

  // 1. Raw stream — most precise
  if (run.rawPaceStream && run.rawPaceStream.length > 0) {
    return calcPaceZoneBreakdown(run.rawPaceStream, trainingPaces);
  }

  // 2. Pre-computed zone seconds
  if (run.paceZoneSeconds) {
    return {
      e: run.paceZoneSeconds.e || 0,
      m: run.paceZoneSeconds.m || 0,
      t: run.paceZoneSeconds.t || 0,
      i: run.paceZoneSeconds.i || 0,
      r: run.paceZoneSeconds.r || 0,
    };
  }

  // 3. Manual fallback — derive avg pace from miles + duration
  const miles = parseFloat(run.miles);
  if (!miles || miles <= 0) return null;
  let durationSec = null;
  if (typeof run.duration === 'string' && run.duration.includes(':')) {
    const parts = run.duration.split(':').map(p => parseInt(p, 10));
    if (parts.length === 2) durationSec = parts[0] * 60 + parts[1];
    else if (parts.length === 3) durationSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (typeof run.duration === 'number') {
    durationSec = run.duration;
  }
  if (!durationSec || durationSec <= 0) return null;

  const avgPaceSecPerMile = durationSec / miles;
  const zone = getPaceZone(avgPaceSecPerMile, trainingPaces);
  return {
    e: zone === 'e' ? durationSec : 0,
    m: zone === 'm' ? durationSec : 0,
    t: zone === 't' ? durationSec : 0,
    i: zone === 'i' ? durationSec : 0,
    r: zone === 'r' ? durationSec : 0,
  };
}

/**
 * Calculate 80/20 compliance from pace zone breakdown.
 * Easy% = (e + m) / total — marathon pace counts as "easy" intensity.
 * @param {{ e, m, t, i, r }} paceZones — seconds per zone
 * @returns {{ easyPct, hardPct, status, total }}
 */
export function calcPace8020(paceZones) {
  if (!paceZones) return null;
  const total = paceZones.e + paceZones.m + paceZones.t + paceZones.i + paceZones.r;
  if (total === 0) return null;
  const easyPct = Math.round(((paceZones.e + paceZones.m) / total) * 100);
  const hardPct = 100 - easyPct;
  const status = easyPct >= 78 ? 'great' : easyPct >= 68 ? 'good' : 'too_hard';
  return { easyPct, hardPct, status, total };
}

// ── Formatting Helpers ───────────────────────────────────────────────────────

/**
 * Format pace in seconds/mile to M:SS string.
 * @param {number} secPerMile
 * @returns {string} e.g. "7:28"
 */
export function formatPace(secPerMile) {
  if (!secPerMile || secPerMile <= 0) return '--:--';
  const min = Math.floor(secPerMile / 60);
  const sec = Math.round(secPerMile % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

/**
 * Format a minute count to a human-readable duration.
 * @param {number} minutes
 * @returns {string} e.g. "45m" or "1h 12m"
 */
export function formatMinutes(minutes) {
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes}m`;
}

/**
 * Parse a time string (MM:SS or HH:MM:SS) to total seconds.
 * @param {string} timeStr
 * @returns {number} seconds
 */
export function parseTimeToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}
