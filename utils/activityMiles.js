// ── Activity miles (running + cross-training credit) ─────────────────────────
// Single source of truth for splitting a set of run/activity docs into running
// miles vs. cross-training CREDIT miles. Cross-training is logged in the same
// `runs` collection but with `activityType` set to a non-run value and a
// `creditMiles` snapshot (the running-equivalent earned at log time).
//
// Why one helper: mileage is summed in ~12 places across the dashboards,
// compliance, and analytics. Routing all of them through this keeps the
// run/CT split consistent and prevents raw CT miles from being counted as
// running miles.
//
// Legacy/run-only docs have no `activityType` → treated as running, so this
// returns identical numbers for existing data.

// Coach-configurable conversion: 1 cross-training mile of this type earns this
// many running-equivalent credit miles. Stored per-school on
// `schools/{id}.crossTrainingFactors`; these are the fallback defaults.
export const DEFAULT_CT_FACTORS = {
  bike:       0.3,
  swim:       4,
  arc:        1,     // arc trainer
  elliptical: 0.75,
  pool_run:   1,
  other:      0.5,
};

// The cross-training activity types, in display order. `run` is handled
// separately (it's the default, not a cross-training type).
export const CROSS_TRAINING_TYPES = [
  { key: 'bike',       label: 'Bike',        unit: 'mi', icon: 'bicycle-outline' },
  { key: 'swim',       label: 'Swim',        unit: 'mi', icon: 'water-outline' },
  { key: 'arc',        label: 'Arc Trainer', unit: 'mi', icon: 'fitness-outline' },
  { key: 'elliptical', label: 'Elliptical',  unit: 'mi', icon: 'fitness-outline' },
  { key: 'pool_run',   label: 'Pool Run',    unit: 'mi', icon: 'water-outline' },
  { key: 'other',      label: 'Other',       unit: 'mi', icon: 'fitness-outline' },
];

// Label + icon for a run/activity doc ('run' or a cross-training type).
export function activityMeta(run) {
  if (!isCrossTraining(run)) return { label: 'Run', icon: 'walk-outline' };
  const t = CROSS_TRAINING_TYPES.find(x => x.key === run.activityType);
  return { label: t?.label || 'Cross-train', icon: t?.icon || 'fitness-outline' };
}

// True when a run doc represents cross-training (anything other than running).
export function isCrossTraining(run) {
  return !!run && !!run.activityType && run.activityType !== 'run';
}

// Running-equivalent miles a single doc contributes:
//   • run → its running miles
//   • cross-training → the snapshot `creditMiles` if present, else
//     miles × factor (back-compat for any doc written before snapshotting).
export function creditForRun(run, factors = DEFAULT_CT_FACTORS) {
  if (!run) return 0;
  if (!isCrossTraining(run)) return run.miles || 0;
  if (typeof run.creditMiles === 'number') return run.creditMiles;
  const factor = (factors && factors[run.activityType]) ?? DEFAULT_CT_FACTORS[run.activityType] ?? 0;
  return (run.miles || 0) * factor;
}

// Sum of RUNNING miles only — for load/pace/ACWR math that must exclude
// cross-training entirely.
export function runningMilesOnly(runs = []) {
  let m = 0;
  for (const r of runs) if (!isCrossTraining(r)) m += r.miles || 0;
  return Math.round(m * 10) / 10;
}

// Split a set of docs into running vs cross-training.
//   runningMiles  — running miles only
//   xtMiles       — raw cross-training miles entered (for display)
//   xtCreditMiles — running-equivalent credit from cross-training
//   totalMiles    — runningMiles + xtCreditMiles (the "with cross-training" number)
export function aggregateMiles(runs = [], factors = DEFAULT_CT_FACTORS) {
  let runningMiles = 0;
  let xtMiles = 0;
  let xtCreditMiles = 0;
  for (const r of runs) {
    if (isCrossTraining(r)) {
      xtMiles += r.miles || 0;
      xtCreditMiles += creditForRun(r, factors);
    } else {
      runningMiles += r.miles || 0;
    }
  }
  const round = (n) => Math.round(n * 10) / 10;
  return {
    runningMiles: round(runningMiles),
    xtMiles: round(xtMiles),
    xtCreditMiles: round(xtCreditMiles),
    totalMiles: round(runningMiles + xtCreditMiles),
  };
}
