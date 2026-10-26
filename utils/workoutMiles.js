// ── Workout distance per group ───────────────────────────────────────────────
// Training events store a base distance (`baseMiles`) plus the coach's
// per-group distances (`groupMiles: { [groupId]: miles }`, from the Weekly
// Planner or the calendar editor). An athlete — or a parent viewing their
// athlete — should see THEIR group's distance, falling back to the base.
// Returns null when the workout has no distance.

export function workoutMilesForGroup(item, groupId) {
  if (!item) return null;
  const groupMiles = groupId ? item.groupMiles?.[groupId] : null;
  if (groupMiles != null && groupMiles !== '') return groupMiles;
  return item.baseMiles ?? null;
}
