// ── Weekly check-in helpers ──────────────────────────────────────────────────
// The weekly check-in is open Saturday 12:00 → Monday 12:00 in each school's
// local timezone. Submissions are anchored to that Saturday's date so each
// athlete has at most one doc per weekly cycle.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

const DEFAULT_TZ = 'America/New_York';
const WEEKDAY_NUM = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// ⚠️ TESTING ONLY — set to true to keep the check-in window open every day so
// you can test the UI without waiting for Saturday. The anchor still resolves
// to the most recent Saturday, so submissions will live under that week's doc.
// FLIP BACK TO false BEFORE SHIPPING TO PRODUCTION.
const TEST_ALWAYS_OPEN = false;

// Extract Y/M/D/H/minute + weekday-number for `date` as it reads in `tz`.
// Uses Intl.DateTimeFormat so we don't depend on a TZ library.
function getLocalParts(date, tz) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'short',
  });
  const parts = {};
  fmt.formatToParts(date).forEach(p => { parts[p.type] = p.value; });
  return {
    year: parseInt(parts.year, 10),
    month: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
    hour: parseInt(parts.hour, 10) % 24, // Intl returns "24" for midnight in some locales
    minute: parseInt(parts.minute, 10),
    weekdayNum: WEEKDAY_NUM[parts.weekday],
  };
}

// ISO date (YYYY-MM-DD) of the Saturday that anchors the weekly cycle
// containing `now`. The cycle runs Sat 12:00 → next Sat 12:00 in school local
// time, so a Saturday before noon still belongs to the PRIOR week.
export function getWeekAnchor(now = new Date(), tz = DEFAULT_TZ) {
  const p = getLocalParts(now, tz);
  let daysBack = (p.weekdayNum - 6 + 7) % 7; // Sat=0, Sun=1, Mon=2, ..., Fri=6
  if (daysBack === 0 && p.hour < 12) daysBack = 7;
  // Build the anchor date by walking back `daysBack` days from local Y/M/D.
  // Date.UTC avoids the parent process's local-TZ shifting the calendar.
  const anchorMs = Date.UTC(p.year, p.month - 1, p.day) - daysBack * 86400000;
  const d = new Date(anchorMs);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// True between Saturday 12:00 and Monday 12:00 in `tz` local time.
export function isInWeeklyWindow(now = new Date(), tz = DEFAULT_TZ) {
  if (TEST_ALWAYS_OPEN) return true; // see TEST_ALWAYS_OPEN comment at top
  const p = getLocalParts(now, tz);
  if (p.weekdayNum === 6 && p.hour >= 12) return true; // Sat afternoon/evening
  if (p.weekdayNum === 0) return true;                  // Sunday all day
  if (p.weekdayNum === 1 && p.hour < 12) return true;   // Monday morning
  return false;
}

export function getWeeklyCheckinDocId(userId, weekStartISO) {
  return `${userId}_${weekStartISO}`;
}

// True if this athlete already submitted for the given week anchor.
export async function hasCheckedInThisWeek(userId, weekStartISO) {
  const ref = doc(db, 'weeklyCheckins', getWeeklyCheckinDocId(userId, weekStartISO));
  const snap = await getDoc(ref);
  return snap.exists();
}

// Most recent weekly check-in for an athlete (used to surface the
// "coach replied" card on the home screen — replies can land any day).
export async function getLatestWeeklyCheckin(userId) {
  const q = query(
    collection(db, 'weeklyCheckins'),
    where('userId', '==', userId),
    orderBy('weekStartISO', 'desc'),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

// Chronological history of an athlete's weekly check-ins, newest first.
// Default cap of 26 covers ~6 months of weeks — enough for a season + offseason.
export async function getWeeklyCheckinHistory(userId, max = 26) {
  const q = query(
    collection(db, 'weeklyCheckins'),
    where('userId', '==', userId),
    orderBy('weekStartISO', 'desc'),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
