// ── Overtraining / load signals (shared) ─────────────────────────────────────
// Single source of truth for the overtraining signal set so the coach dashboard
// and the athlete-facing screens (AthleteAnalytics, AthleteDetailScreen) show
// IDENTICAL signals. Previously these had drifted: the coach used ACWR while the
// athlete screens still used an old "miles up 15%" heuristic.
//
// Pure function (no I/O) — each caller passes already-loaded runs + checkins so
// the same logic runs everywhere. Monday-aligned weeks match the rest of the app.

import { calcACWR, ACWR_STATUS } from './acwrUtils';
import { getRunDate } from './dateUtils';
import { isCrossTraining } from './activityMiles';

/**
 * @param {object}   opts
 * @param {object[]} opts.runs            - run docs (date + miles)
 * @param {object[]} opts.checkins        - wellness check-in docs (date, mood, sleepQuality, injury, illness)
 * @param {object}   [opts.attendanceStats] - { recentRecorded, recentAbsenceRate } (coach only; omit for athletes)
 * @param {Date}     [opts.now]
 * @returns {{
 *   alert: boolean,
 *   signals: string[],
 *   thisWeekMiles: number,
 *   avg3wk: number,
 *   latestInjury: object|null,
 *   latestIllness: object|null,
 *   latestCheckinDate: Date|null,
 * }}
 */
export function computeOvertraining({ runs = [], checkins = [], attendanceStats = null, now = new Date() }) {
  const day = now.getDay();
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  thisMonday.setHours(0, 0, 0, 0);

  // Overtraining is a RUNNING mechanical-load signal — exclude cross-training
  // (a bike ride doesn't carry running impact load).
  const runningRuns = runs.filter(r => !isCrossTraining(r));
  const thisWeekRuns = runningRuns.filter(r => { const d = getRunDate(r); return d && d >= thisMonday; });
  const thisWeekMiles = thisWeekRuns.reduce((s, r) => s + (r.miles || 0), 0);

  const priorWeekMiles = [];
  for (let w = 1; w <= 3; w++) {
    const wStart = new Date(thisMonday); wStart.setDate(thisMonday.getDate() - w * 7);
    const wEnd = new Date(wStart); wEnd.setDate(wStart.getDate() + 7);
    const miles = runningRuns
      .filter(r => { const d = getRunDate(r); return d && d >= wStart && d < wEnd; })
      .reduce((s, r) => s + (r.miles || 0), 0);
    priorWeekMiles.push(miles);
  }
  const avg3wk = priorWeekMiles.length
    ? priorWeekMiles.reduce((s, m) => s + m, 0) / priorWeekMiles.length
    : 0;

  const getCheckinDate = (c) => (c.date?.toDate ? c.date.toDate() : new Date(c.date));
  const weekCheckins = checkins
    .filter(c => getCheckinDate(c) >= thisMonday)
    .sort((a, b) => getCheckinDate(b) - getCheckinDate(a));

  const signals = [];

  // ACWR-based load-spike signal (>1.5 spike, >1.3 elevated). Replaces the old
  // "miles up 15% vs 3-week avg" heuristic so athletes + coaches agree.
  const acwr = calcACWR(runs, now);
  if (acwr.status === ACWR_STATUS.SPIKE) {
    signals.push({ text: `Training load spike (ACWR ${acwr.ratio.toFixed(2)})`, solo: true });
  } else if (acwr.status === ACWR_STATUS.ELEVATED) {
    signals.push({ text: `Elevated training load (ACWR ${acwr.ratio.toFixed(2)})` });
  }

  // Attendance absence (coach-only — needs ≥4 recorded days to be meaningful).
  if (attendanceStats && attendanceStats.recentRecorded >= 4 && attendanceStats.recentAbsenceRate >= 0.25) {
    signals.push({ text: `Missed ${Math.round(attendanceStats.recentAbsenceRate * 100)}% of recent practices` });
  }

  const highEffortDays = thisWeekRuns.filter(r => (r.effort || 0) >= 8).length;
  if (highEffortDays >= 4) signals.push({ text: `Effort 8+ on ${highEffortDays} of last 7 days` });

  if (weekCheckins.length >= 3) {
    const recentAvgMood = weekCheckins.slice(0, 3).reduce((s, c) => s + (c.mood || 3), 0) / 3;
    const olderAvgMood = weekCheckins.slice(-3).reduce((s, c) => s + (c.mood || 3), 0) / 3;
    if (recentAvgMood < olderAvgMood - 0.5) signals.push({ text: 'Mood declining this week' });
    const recentAvgSleep = weekCheckins.slice(0, 3).reduce((s, c) => s + (c.sleepQuality || 3), 0) / 3;
    if (recentAvgSleep < 2.5) signals.push({ text: 'Poor sleep reported' });
  }

  const latestCheckin = weekCheckins[0] || null;
  const latestInjury = latestCheckin?.injury || null;
  const latestIllness = latestCheckin?.illness || null;
  const latestCheckinDate = latestCheckin?.date?.toDate
    ? latestCheckin.date.toDate()
    : latestCheckin?.date ? new Date(latestCheckin.date) : null;

  if (latestInjury && (latestInjury.severity === 'moderate' || latestInjury.severity === 'severe')) {
    const loc = latestInjury.locations?.join(', ') || 'unspecified';
    signals.push({ text: `Reported ${latestInjury.severity} injury (${loc})` });
  }

  const hasSoloTrigger = signals.some(s => s.solo);
  const alert = hasSoloTrigger || signals.filter(s => !s.solo).length >= 2;

  return {
    alert,
    signals: signals.map(s => s.text),
    thisWeekMiles,
    avg3wk,
    latestInjury,
    latestIllness,
    latestCheckinDate,
  };
}
