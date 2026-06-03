// Shared date helpers for run/training data.
// Runs come from Firestore with `date` as a Timestamp (preferred), but legacy
// docs may store an ISO string or JS Date — getRunDate handles all three and
// returns null if the field is missing, so callers can safely chain comparisons.

export function getMondayISO(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

// YYYY-MM-DD in the user's LOCAL timezone. Use this instead of
// `.toISOString().split('T')[0]` whenever you're comparing calendar dates —
// toISOString uses UTC, so in evening Eastern (or afternoon Pacific) hours it
// returns tomorrow's date and breaks "is this today?" filters.
export function toLocalISODate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function getRunDate(r) {
  return r.date?.toDate?.() ?? (r.date ? new Date(r.date) : null);
}

export function groupRunsByWeek(runs) {
  const weeks = {};
  runs.forEach(r => {
    const d = getRunDate(r);
    if (!d) return;
    const mon = getMondayISO(d);
    if (!weeks[mon]) weeks[mon] = [];
    weeks[mon].push(r);
  });
  return weeks;
}
