// ── Shared compliance utilities ──────────────────────────────────────────────
// Used by both CoachDashboard and CoachAnalytics to compute volume compliance.

/**
 * Get an athlete's weekly mileage target based on their group.
 * Falls back to 110% of their 3-week average if no explicit target is set.
 * Returns null if no target can be determined.
 */
export function getAthleteWeeklyTarget(athlete, groups, athlete3WeekAvg) {
  const group = groups.find(g => g.id === athlete.groupId);
  if (group?.weeklyMilesTarget) return group.weeklyMilesTarget;
  const avg = athlete3WeekAvg?.[athlete.id] || 0;
  return avg > 0 ? Math.round(avg * 1.1 * 10) / 10 : null;
}

/**
 * Determine compliance status for a completed week.
 * under: < 90% of target
 * on:    90–110% of target
 * over:  > 110% of target
 */
export function getWeekStatus(miles, target) {
  if (!target || target <= 0) return 'unknown';
  const pct = miles / target;
  return pct >= 0.9 && pct <= 1.1 ? 'on' : pct < 0.9 ? 'under' : 'over';
}

/**
 * Compute time-proportional compliance for the current (incomplete) week.
 * dayOfWeek: 1 = Monday … 7 = Sunday
 * Returns { pct, status } where pct is how the athlete is pacing
 * relative to where they should be mid-week.
 */
export function getCurrentWeekPace(actualMiles, target, dayOfWeek) {
  if (!target || target <= 0) return { pct: null, status: 'unknown' };
  // What fraction of the week has elapsed (end of today)
  const weekFraction = Math.min(dayOfWeek / 7, 1);
  const expectedSoFar = target * weekFraction;
  if (expectedSoFar <= 0) return { pct: null, status: 'unknown' };
  const pct = Math.round((actualMiles / expectedSoFar) * 100);
  let status;
  if (pct >= 85 && pct <= 115) status = 'on_track';
  else if (pct >= 70 && pct <= 130) status = 'caution';
  else status = pct < 70 ? 'behind' : 'ahead';
  return { pct, status };
}

/**
 * Compute 3-week volume compliance data for an array of athletes.
 * weeklyBreakdown: { [athleteId]: { w1, w2, w3 } } — last 3 completed weeks
 * Returns { volumeData, onTarget, underTarget, overTarget }
 */
export function computeVolumeCompliance(athletes, groups, athlete3WeekAvg, weeklyBreakdown) {
  const volumeData = athletes.map(a => {
    const target = getAthleteWeeklyTarget(a, groups, athlete3WeekAvg);
    const wb = weeklyBreakdown[a.id] || { w1: 0, w2: 0, w3: 0 };
    const w1Status = getWeekStatus(wb.w1, target);
    const w2Status = getWeekStatus(wb.w2, target);
    const w3Status = getWeekStatus(wb.w3, target);
    const weeks = [w1Status, w2Status, w3Status];
    const underCount = weeks.filter(w => w === 'under').length;
    const overCount = weeks.filter(w => w === 'over').length;
    const status = overCount >= 2 ? 'over' : underCount >= 2 ? 'under' : 'on';
    return { ...a, target, wb, w1Status, w2Status, w3Status, status, underCount, overCount };
  });

  return {
    volumeData,
    onTarget: volumeData.filter(a => a.status === 'on'),
    underTarget: volumeData.filter(a => a.status === 'under'),
    overTarget: volumeData.filter(a => a.status === 'over'),
  };
}
