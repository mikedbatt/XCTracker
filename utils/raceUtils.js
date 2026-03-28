// ── Race Utilities ─────────────────────────────────────────────────────────────

export const RACE_DISTANCES = [
  { key: '5K', meters: 5000, label: '5K', miles: 3.1 },
  { key: 'Mile', meters: 1609, label: 'Mile', miles: 1.0 },
  { key: '1500m', meters: 1500, label: '1500m', miles: 0.93 },
  { key: '3200m', meters: 3200, label: '3200m', miles: 1.99 },
  { key: '3000m', meters: 3000, label: '3000m', miles: 1.86 },
  { key: '800m', meters: 800, label: '800m', miles: 0.5 },
  { key: 'Custom', meters: null, label: 'Custom', miles: null },
];

export const RACE_LEVELS = [
  { key: 'varsity', label: 'Varsity' },
  { key: 'jv', label: 'JV' },
  { key: 'open', label: 'Open' },
];

// ── Time parsing & formatting ─────────────────────────────────────────────────

// Parse time string (MM:SS or HH:MM:SS) to total seconds
export function parseTime(str) {
  if (!str || typeof str !== 'string') return null;
  const parts = str.trim().split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

// Format total seconds to display string (MM:SS or H:MM:SS)
export function formatTime(seconds) {
  if (seconds == null || isNaN(seconds)) return '--:--';
  const s = Math.round(seconds);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// Calculate pace (seconds per mile) from finish time and distance
export function calcPace(finishTimeSeconds, distanceKey) {
  const dist = RACE_DISTANCES.find(d => d.key === distanceKey);
  if (!dist?.miles || !finishTimeSeconds) return null;
  return Math.round(finishTimeSeconds / dist.miles);
}

// Format pace as M:SS/mi
export function formatPace(paceSeconds) {
  if (!paceSeconds) return '--:--';
  const mins = Math.floor(paceSeconds / 60);
  const secs = paceSeconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}/mi`;
}

// ── Pack analysis ─────────────────────────────────────────────────────────────

// Calculate pack analysis from sorted results (sorted by finishTime ascending)
export function calcPackAnalysis(results) {
  // Filter to finished athletes only
  const finished = results.filter(r => r.status === 'finished' && r.finishTime > 0);
  if (finished.length === 0) return null;

  // Sort by finish time
  const sorted = [...finished].sort((a, b) => a.finishTime - b.finishTime);

  // Assign team places
  sorted.forEach((r, i) => { r.teamPlace = i + 1; });

  // Top 5 scorers
  const scorers = sorted.slice(0, 5);
  const top5Times = scorers.map(r => r.finishTime);

  // 1-5 spread
  const spread15 = scorers.length >= 5
    ? top5Times[4] - top5Times[0]
    : null;

  // 6-7 displacement
  const runner6 = sorted[5] || null;
  const runner7 = sorted[6] || null;
  const gap6to5 = runner6 && scorers.length >= 5
    ? runner6.finishTime - top5Times[4]
    : null;
  const gap7to5 = runner7 && scorers.length >= 5
    ? runner7.finishTime - top5Times[4]
    : null;

  // Team average (top 5)
  const teamAvg = scorers.length > 0
    ? Math.round(top5Times.reduce((s, t) => s + t, 0) / scorers.length)
    : null;

  // Team score (sum of overall places for top 5, if places entered)
  const placesEntered = scorers.every(r => r.place > 0);
  const teamScore = placesEntered
    ? scorers.reduce((s, r) => s + r.place, 0)
    : null;

  return {
    spread15,
    gap6to5,
    gap7to5,
    runner6: runner6 ? { name: runner6.athleteName, time: runner6.finishTime } : null,
    runner7: runner7 ? { name: runner7.athleteName, time: runner7.finishTime } : null,
    teamAvg,
    teamScore,
    scorerCount: scorers.length,
    totalFinished: finished.length,
    sorted,
  };
}

// Detect negative/positive splits from mile split array
export function analyzeSplits(splits) {
  if (!splits || splits.length < 2) return null;
  const mid = Math.floor(splits.length / 2);
  const firstHalf = splits.slice(0, mid).reduce((s, sp) => s + sp.time, 0);
  const secondHalf = splits.slice(mid).reduce((s, sp) => s + sp.time, 0);
  // Normalize if odd number of splits
  const firstAvg = firstHalf / mid;
  const secondAvg = secondHalf / (splits.length - mid);
  const diff = secondAvg - firstAvg;
  if (diff < -2) return 'negative'; // second half faster
  if (diff > 2) return 'positive';  // second half slower
  return 'even';
}
