// ── Acute:Chronic Workload Ratio (ACWR) ──────────────────────────────────────
// Compares recent training load (last 7 days) to the athlete's adapted baseline
// (28-day average). Spikes above the adapted baseline are the strongest
// predictor of soft-tissue injury risk in endurance sports (Gabbett 2016 +
// follow-ups). Load unit here is miles (kept simple, no effort weighting in v1).
//
//   acute   = sum of miles in last 7 days
//   chronic = sum of miles in last 28 days / 4    (weekly average)
//   ratio   = acute / chronic
//
// Status bands:
//   < 0.8   undertraining (detraining risk, not typically injury risk)
//   0.8–1.3 sweet spot    (lower injury incidence in studies)
//   1.3–1.5 elevated      (moderate risk increase)
//   > 1.5   spike         (significant injury-risk elevation)
//
// Edge cases:
//   - <21 days of run history → insufficient data (don't compute)
//   - chronic load < LOW_BASELINE → show ratio with "low baseline" note so
//     coaches don't panic over returning-from-injury athletes with tiny
//     denominators.

import { STATUS } from '../constants/design';

export const ACWR_STATUS = {
  INSUFFICIENT:  'insufficient',
  UNDERTRAINING: 'undertraining',
  SWEET_SPOT:    'sweet_spot',
  ELEVATED:      'elevated',
  SPIKE:         'spike',
};

const MIN_DAYS_OF_HISTORY = 21;
const LOW_BASELINE_MILES  = 5; // chronic avg under 5 mi/wk → flag as low baseline

function getRunDate(r) {
  return r.date?.toDate?.() ?? (r.date ? new Date(r.date) : null);
}

/**
 * Compute ACWR for a runner given their recent runs.
 *
 * @param {object[]} runs        - run docs (with a `date` and `miles` field)
 * @param {Date}     [reference] - "now" reference (defaults to current time)
 * @returns {{
 *   status: string,
 *   ratio: number | null,
 *   acute: number,
 *   chronic: number,
 *   lowBaseline: boolean,
 * }}
 */
export function calcACWR(runs, reference = new Date()) {
  const now = reference;
  const sevenDaysAgo    = new Date(now.getTime() - 7  * 86400000);
  const twentyEightAgo  = new Date(now.getTime() - 28 * 86400000);

  // Do we have enough history? Look at the oldest run date we can find.
  let oldestRunDate = null;
  for (const r of runs) {
    const d = getRunDate(r);
    if (d && (!oldestRunDate || d < oldestRunDate)) oldestRunDate = d;
  }
  if (!oldestRunDate || (now - oldestRunDate) < MIN_DAYS_OF_HISTORY * 86400000) {
    return { status: ACWR_STATUS.INSUFFICIENT, ratio: null, acute: 0, chronic: 0, lowBaseline: false };
  }

  let acute = 0;
  let chronic28 = 0;
  for (const r of runs) {
    const d = getRunDate(r);
    if (!d) continue;
    if (d >= sevenDaysAgo   && d <= now) acute     += (r.miles || 0);
    if (d >= twentyEightAgo && d <= now) chronic28 += (r.miles || 0);
  }
  const chronic = chronic28 / 4;

  if (chronic < LOW_BASELINE_MILES) {
    return { status: ACWR_STATUS.INSUFFICIENT, ratio: null, acute, chronic, lowBaseline: true };
  }

  const ratio = acute / chronic;
  let status;
  if (ratio < 0.8)       status = ACWR_STATUS.UNDERTRAINING;
  else if (ratio <= 1.3) status = ACWR_STATUS.SWEET_SPOT;
  else if (ratio <= 1.5) status = ACWR_STATUS.ELEVATED;
  else                   status = ACWR_STATUS.SPIKE;

  return { status, ratio, acute, chronic, lowBaseline: false };
}

export function getACWRLabel(status) {
  switch (status) {
    case ACWR_STATUS.SWEET_SPOT:    return 'Sweet spot';
    case ACWR_STATUS.ELEVATED:      return 'Elevated';
    case ACWR_STATUS.SPIKE:         return 'Spike';
    case ACWR_STATUS.UNDERTRAINING: return 'Ramping up';
    case ACWR_STATUS.INSUFFICIENT:  return 'Need more data';
    default:                        return '';
  }
}

export function getACWRColor(status) {
  switch (status) {
    case ACWR_STATUS.SWEET_SPOT:    return STATUS.success;
    case ACWR_STATUS.ELEVATED:      return STATUS.warning;
    case ACWR_STATUS.SPIKE:         return STATUS.error;
    case ACWR_STATUS.UNDERTRAINING: return STATUS.info;
    case ACWR_STATUS.INSUFFICIENT:  return '#9CA3AF';
    default:                        return '#9CA3AF';
  }
}

export function getACWRColorBg(status) {
  switch (status) {
    case ACWR_STATUS.SWEET_SPOT:    return STATUS.successBg;
    case ACWR_STATUS.ELEVATED:      return STATUS.warningBg;
    case ACWR_STATUS.SPIKE:         return STATUS.errorBg;
    case ACWR_STATUS.UNDERTRAINING: return STATUS.infoBg;
    default:                        return '#F3F4F6';
  }
}
