import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { signOut } from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc, getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';
import {
  BRAND, BRAND_ACCENT, BRAND_DARK, BRAND_LIGHT,
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE, STATUS, STRAVA_ORANGE,
} from '../constants/design';
import AthleteDetailScreen from '../screens/AthleteDetailScreen';
import CoachAnalytics from '../screens/CoachAnalytics';
import CoachProfile from '../screens/CoachProfile';
import CalendarScreen from '../screens/CalendarScreen';
import { TYPE_COLORS } from '../constants/training';
import ManageGroups from '../screens/ManageGroups';
import ManageSeasons from '../screens/ManageSeasons';
import RaceManager from '../screens/RaceManager';
import { getActiveSeason, getPhaseForSeason, getCompletedSeasons } from '../screens/SeasonPlanner';
import SeasonReview from '../screens/SeasonReview';
import WeeklyPlanner from '../screens/WeeklyPlanner';
import ChannelList from '../screens/ChannelList';
import TimeframePicker, { TIMEFRAMES, getDateRange } from '../screens/TimeframePicker';
import TrainingHub from '../screens/TrainingHub';
import WorkoutDetailModal from '../screens/WorkoutDetailModal';
import ZoneSettings from '../screens/ZoneSettings';
import { computeVolumeCompliance, getCurrentWeekPace, getAthleteWeeklyTarget } from '../utils/complianceUtils';
import { calcPaceZoneBreakdown, calcPace8020 } from '../utils/vdotUtils';
import {
  DEFAULT_ZONE_BOUNDARIES,
  calcMaxHR,
  calcZoneBreakdownFromRuns,
  calcZoneBreakdownFromStream,
  parseBirthdate,
} from '../zoneConfig';

// ── Daily message templates by phase (written as coach → athletes) ────────────
const PHASE_TIPS = {
  'Pre-Season': [
    "Hey team — season is right around the corner. Use this time to get your miles in, build good habits, and come ready to compete. The work you put in now sets the tone for everything ahead.",
    "Quick reminder: log every run, even the easy ones. Consistency is what separates good teams from great ones. Let's build that foundation together.",
    "Off-season miles are championship miles. Stay disciplined, stay consistent, and trust the process. We're building something special this year.",
    "Check in with your training group this week. Run together when you can — the team that trains together races together.",
    "If you haven't set up your account yet, get that done today. I want to see everyone logging miles before our first official practice.",
  ],
  Base: [
    "Today is about building your aerobic engine. Run easy, stay conversational, and log every mile. Consistency this week pays dividends in November.",
    "Base phase is where championships are quietly built. No heroics today — easy effort, good form, and another check in the box.",
    "The goal today is to finish feeling like you could have run more. That's the right effort for base phase. Trust it.",
    "Easy miles aren't junk miles. Every Zone 2 run this week is expanding the engine you'll race on at state. Keep stacking them.",
    "When in doubt, do less. Base phase is about accumulation, not intensity. A slightly easy day now beats an injury in Week 8.",
  ],
  Build: [
    "Build phase is here. Time to introduce quality — keep the easy days easy so the hard days can be hard. No in-between.",
    "You've built the base. Now it's time to teach your body to run fast for longer. Today's tempo is a conversation with your limits — embrace it.",
    "Build phase means the hard days get harder AND the easy days stay easy. No middle-ground running. Discipline on both ends.",
    "Today's quality session is about process, not pace. Consistent splits at threshold effort matter more than hitting a number.",
    "This is the phase where most runners get hurt by doing too much. Keep your easy days truly easy — check your heart rate.",
  ],
  Competition: [
    "Competition phase. Pack work is the priority now. Five of us finishing together beats one of us finishing fast. Run for each other.",
    "Every workout from here is race preparation. Run with intent, run together. This is what we've been building toward.",
    "Championship teams are made right now. The athletes who buy in during competition phase run their best when it counts. That's us.",
    "Focus on running as a pack this week. A tight group at practice becomes a tight group at the state meet. Close the gaps.",
    "Use this week's race as a training effort, not an all-out send. Save your best for the meets that matter most.",
  ],
  Peak: [
    "Peak phase. Short, sharp, and confident. Every workout this week has one job: prove to yourself that you are ready.",
    "Less is more this week. Trust the training you've already done. You're fit — now we sharpen the edge.",
    "The fitness is there. Peak phase is about converting months of work into race-day confidence. Believe in what you've built.",
    "A couple quality sessions this week, then rest. The hay is nearly in the barn. Protect your legs — you'll need them.",
    "Aggressive patience. Hold back just enough this week and you'll have the most left on race day. Trust the plan.",
  ],
  Taper: [
    "Taper week. Easy runs only. The most important things you can do today: sleep well, eat well, and believe in the work you've done.",
    "The hay is in the barn. Your job this week is to keep your legs fresh and your mind confident. Trust the process.",
    "Championship week. If you're feeling nervous, that's good — anxiety is just excitement without direction. Channel it into confidence. You've earned this.",
    "The urge to do more will be strong this week — resist it. Rest is the final workout. Protect your legs.",
    "You didn't get here by accident. Every early morning, every easy mile, every hard workout — this is what it was all for. Go get it.",
  ],
};

function getDailyTip(phaseName) {
  const tips = PHASE_TIPS[phaseName] || PHASE_TIPS["Pre-Season"];
  const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  return tips[dayOfYear % tips.length];
}

// ── Overtraining detection ────────────────────────────────────────────────────
// Uses Monday-aligned weeks and compares this week vs 3-week rolling average
// to avoid false positives from rolling 7-day window misalignment.
async function checkOvertraining(athleteId) {
  try {
    const now = new Date();
    const day = now.getDay();
    // Current Monday at 00:00
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    thisMonday.setHours(0, 0, 0, 0);
    // 4 weeks back to get this week + 3 prior weeks
    const fourWeeksAgo = new Date(thisMonday);
    fourWeeksAgo.setDate(thisMonday.getDate() - 28);

    const [runsSnap, checkinSnap] = await Promise.all([
      getDocs(query(collection(db, 'runs'), where('userId', '==', athleteId),
        where('date', '>=', fourWeeksAgo), orderBy('date', 'desc'))),
      // Query without orderBy to avoid needing a composite index — sort client-side
      getDocs(query(collection(db, 'checkins'), where('userId', '==', athleteId)))
        .catch(() => ({ docs: [] })),
    ]);

    const allRuns = runsSnap.docs.map(d => d.data());
    const getCheckinDate = (c) => c.date?.toDate ? c.date.toDate() : new Date(c.date);
    const checkins = checkinSnap.docs
      .map(d => d.data())
      .filter(c => getCheckinDate(c) >= thisMonday)
      .sort((a, b) => getCheckinDate(b) - getCheckinDate(a));

    // Bucket runs into Monday-aligned weeks
    const getRunDate = (r) => r.date?.toDate ? r.date.toDate() : new Date(r.date);
    const thisWeekRuns = allRuns.filter(r => getRunDate(r) >= thisMonday);
    const thisWeekMiles = thisWeekRuns.reduce((s, r) => s + (r.miles || 0), 0);

    // Prior 3 weeks
    const priorWeekMiles = [];
    for (let w = 1; w <= 3; w++) {
      const wStart = new Date(thisMonday);
      wStart.setDate(thisMonday.getDate() - w * 7);
      const wEnd = new Date(wStart);
      wEnd.setDate(wStart.getDate() + 7);
      const miles = allRuns
        .filter(r => { const d = getRunDate(r); return d >= wStart && d < wEnd; })
        .reduce((s, r) => s + (r.miles || 0), 0);
      priorWeekMiles.push(miles);
    }

    const avg3wk = priorWeekMiles.length > 0
      ? priorWeekMiles.reduce((s, m) => s + m, 0) / priorWeekMiles.length
      : 0;

    const signals = [];

    // Flag if this week is >15% above the 3-week average
    if (avg3wk > 0 && thisWeekMiles > avg3wk * 1.15) {
      const pctOver = Math.round(((thisWeekMiles - avg3wk) / avg3wk) * 100);
      signals.push({ text: `Miles up ${pctOver}% vs 3-week avg (${Math.round(avg3wk)} mi/wk)`, solo: true });
    }

    const highEffortDays = thisWeekRuns.filter(r => (r.effort || 0) >= 8).length;
    if (highEffortDays >= 4) signals.push({ text: `Effort 8+ on ${highEffortDays} of last 7 days` });

    if (checkins.length >= 3) {
      const recentAvgMood  = checkins.slice(0, 3).reduce((s, c) => s + (c.mood || 3), 0) / 3;
      const olderAvgMood   = checkins.slice(-3).reduce((s, c) => s + (c.mood || 3), 0) / 3;
      if (recentAvgMood < olderAvgMood - 0.5) signals.push({ text: 'Mood declining this week' });
      const recentAvgSleep = checkins.slice(0, 3).reduce((s, c) => s + (c.sleepQuality || 3), 0) / 3;
      if (recentAvgSleep < 2.5) signals.push({ text: 'Poor sleep reported' });
    }

    // Most recent injury/illness — use latest check-in this week (not just today)
    // so the coach sees it even if the athlete hasn't checked in yet today
    const latestCheckin = checkins[0] || null; // already sorted desc by date
    const latestInjury = latestCheckin?.injury || null;
    const latestIllness = latestCheckin?.illness || null;
    const latestCheckinDate = latestCheckin?.date?.toDate
      ? latestCheckin.date.toDate()
      : latestCheckin?.date ? new Date(latestCheckin.date) : null;

    // Moderate/severe injury feeds into overtraining signal
    if (latestInjury && (latestInjury.severity === 'moderate' || latestInjury.severity === 'severe')) {
      const loc = latestInjury.locations?.join(', ') || 'unspecified';
      signals.push({ text: `Reported ${latestInjury.severity} injury (${loc})` });
    }

    const hasSoloTrigger = signals.some(s => s.solo);
    const alert = hasSoloTrigger || signals.filter(s => !s.solo).length >= 2;
    return { alert, signals: signals.map(s => s.text), todayInjury: latestInjury, todayIllness: latestIllness, injuryCheckinDate: latestCheckinDate };
  } catch { return { alert: false, signals: [], todayInjury: null, todayIllness: null, injuryCheckinDate: null }; }
}

// ── Zone % helper — same 3-tier system used everywhere else in the app ────────
// FIX: was using only calcZoneBreakdownFromRuns (avg HR estimate) regardless of
// whether precise stream data existed. Now recalculates from rawHRStream first
// so the Z1+Z2 % on each athlete card reflects actual second-by-second HR data
// when available, and dynamically respects the coach's current zone boundaries.
function calcAthleteZonePct(recentRuns, age, teamZoneSettings) {
  const boundaries  = teamZoneSettings?.boundaries  || DEFAULT_ZONE_BOUNDARIES;
  const customMaxHR = teamZoneSettings?.customMaxHR || null;
  const maxHR       = calcMaxHR(age, customMaxHR);

  // Tier 1 — raw HR stream: recalculate on the fly with current boundaries
  const rawStreamRuns = recentRuns.filter(r => r.rawHRStream?.length > 0);
  if (rawStreamRuns.length > 0) {
    const combined = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
    rawStreamRuns.forEach(r => {
      const bd = calcZoneBreakdownFromStream(r.rawHRStream, maxHR, boundaries);
      if (bd) bd.forEach(z => { combined[`z${z.zone}`] = (combined[`z${z.zone}`] || 0) + z.seconds; });
    });
    const total = Object.values(combined).reduce((s, v) => s + v, 0);
    if (total > 0) {
      const easyPct = Object.entries(combined)
        .filter(([key]) => parseInt(key.replace('z', '')) <= 2)
        .reduce((s, [, v]) => s + v, 0);
      return Math.round((easyPct / total) * 100);
    }
  }

  // Tier 2 — stored zone seconds (reflect boundaries at sync time)
  const storedZoneRuns = recentRuns.filter(r => r.hasStreamData && r.zoneSeconds);
  if (storedZoneRuns.length > 0) {
    const combined = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
    storedZoneRuns.forEach(r => {
      Object.entries(r.zoneSeconds).forEach(([k, v]) => {
        if (combined[k] !== undefined) combined[k] += v;
      });
    });
    const total = Object.values(combined).reduce((s, v) => s + v, 0);
    if (total > 0) {
      const easyPct = (combined.z1 + combined.z2);
      return Math.round((easyPct / total) * 100);
    }
  }

  // Tier 3 — avg HR + duration estimate
  const breakdown = calcZoneBreakdownFromRuns(recentRuns, age, customMaxHR, boundaries);
  if (breakdown) {
    return breakdown.filter(z => z.zone <= 2).reduce((s, z) => s + z.pct, 0);
  }

  return null;
}

// ── Pace easy % helper — uses VDOT training paces instead of HR zones ────────
function calcAthletePaceEasyPct(recentRuns, trainingPaces) {
  if (!trainingPaces) return null;
  const combined = { e: 0, m: 0, t: 0, i: 0, r: 0 };
  let hasData = false;
  recentRuns.forEach(r => {
    if (r.rawPaceStream?.length > 0) {
      const zones = calcPaceZoneBreakdown(r.rawPaceStream, trainingPaces);
      Object.keys(zones).forEach(k => { combined[k] += zones[k]; });
      hasData = true;
    } else if (r.paceZoneSeconds) {
      Object.keys(r.paceZoneSeconds).forEach(k => { combined[k] += (r.paceZoneSeconds[k] || 0); });
      hasData = true;
    }
  });
  if (!hasData) return null;
  const result = calcPace8020(combined);
  return result ? result.easyPct : null;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function CoachDashboard({ userData }) {
  const [school,              setSchool]              = useState(null);
  const [activeSeasonData,    setActiveSeasonData]    = useState(null);
  const [athletes,            setAthletes]            = useState([]);
  const [athleteMiles,        setAthleteMiles]        = useState({});
  const [athleteWeeklyMiles,  setAthleteWeeklyMiles]  = useState({});
  const [athlete3WeekAvg,     setAthlete3WeekAvg]     = useState({});
  const [athleteWeeklyBreakdown, setAthleteWeeklyBreakdown] = useState({});
  const [athleteZonePct,      setAthleteZonePct]      = useState({});
  const [athletePaceEasyPct,  setAthletePaceEasyPct]  = useState({});
  const [pendingAthletes,     setPendingAthletes]     = useState([]);
  const [pendingCoachCount,   setPendingCoachCount]   = useState(0);
  const [unreadFeedCount,     setUnreadFeedCount]     = useState(0);
  const [trainingItems,       setTrainingItems]       = useState([]);
  const [loading,             setLoading]             = useState(true);
  const [activeTab,           setActiveTab]           = useState('team');
  const [profileVisible,      setProfileVisible]      = useState(false);
  const [groups,              setGroups]              = useState([]);
  const [groupFilter,         setGroupFilter]         = useState('all');
  const [trainingSection,     setTrainingSection]     = useState(null); // null | 'hub' | 'groups' | 'seasons' | 'weekly' | 'calendar' | 'races'
  const [nextMeet,            setNextMeet]            = useState(null);
  const [addFromDashboard,    setAddFromDashboard]    = useState(false);
  const [pendingWorkout,      setPendingWorkout]      = useState(null);
  const [selectedAthlete,     setSelectedAthlete]     = useState(null);
  const [selectedTimeframe,   setSelectedTimeframe]   = useState(TIMEFRAMES[0]);
  const [genderFilter,        setGenderFilter]        = useState('all');
  const [overtTrainingAlerts, setOvertTrainingAlerts] = useState({});
  const [tipModalVisible,     setTipModalVisible]     = useState(false);
  const [tipText,             setTipText]             = useState('');
  const [sendingTip,          setSendingTip]          = useState(false);
  const [todayTipSent,        setTodayTipSent]        = useState(false);
  const [injuryCardExpanded,  setInjuryCardExpanded]  = useState(false);
  const [feedVisible,         setFeedVisible]         = useState(false);
  const [zonesVisible,        setZonesVisible]        = useState(false);
  const [analyticsVisible,    setAnalyticsVisible]    = useState(false);
  const [teamZoneSettings,    setTeamZoneSettings]    = useState(null);
  const [complianceData,      setComplianceData]      = useState({ onTarget: [], underTarget: [], overTarget: [], volumeData: [] });
  const [athleteLastRunDate,  setAthleteLastRunDate]  = useState({});
  const [athleteWeekPace,     setAthleteWeekPace]     = useState({});
  const [teamPulse,           setTeamPulse]           = useState({ checkinCount: 0, totalAthletes: 0, teamAvgMood: null, inactiveCount: 0 });
  const [complianceExpanded,  setComplianceExpanded]  = useState(false);
  const [todayWorkoutDetail,  setTodayWorkoutDetail]  = useState(null);
  const [seasonReviewVisible, setSeasonReviewVisible] = useState(false);
  const [seasonReviewSeason,  setSeasonReviewSeason]  = useState(null);
  const [reviewDismissed,     setReviewDismissed]     = useState({});
  const [paceComplianceExpanded, setPaceComplianceExpanded] = useState(false);
  const [paceComplianceData, setPaceComplianceData] = useState({ runningEasy: [], tooHard: [], noPaces: 0, noPacesAthletes: [] });

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      if (!userData.schoolId) { setLoading(false); return; }

      const schoolDoc = await getDoc(doc(db, 'schools', userData.schoolId));
      const schoolData = schoolDoc.exists() ? schoolDoc.data() : null;
      if (schoolData) setSchool(schoolData);

      // Load team-wide zone settings — needed before per-athlete zone calc
      let currentZoneSettings = null;
      try {
        const zoneDoc = await getDoc(doc(db, 'teamZoneSettings', userData.schoolId));
        if (zoneDoc.exists()) {
          currentZoneSettings = zoneDoc.data();
          setTeamZoneSettings(currentZoneSettings);
        }
      } catch (e) { console.warn('Failed to load team zone settings, using defaults:', e); }

      // Load training groups
      let loadedGroups = [];
      try {
        const groupsSnap = await getDocs(query(
          collection(db, 'groups'),
          where('schoolId', '==', userData.schoolId)
        ));
        loadedGroups = groupsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        loadedGroups.sort((a, b) => (a.order || 0) - (b.order || 0));
        setGroups(loadedGroups);
      } catch (e) { console.warn('Failed to load groups:', e); }

      const activeSeason = schoolData ? getActiveSeason(schoolData) : null;
      setActiveSeasonData(activeSeason);
      const { start: cutoff, end: cutoffEnd } = getDateRange(selectedTimeframe, activeSeason, null, null);

      const approvedSnap = await getDocs(query(
        collection(db, 'users'),
        where('schoolId', '==', userData.schoolId),
        where('role', '==', 'athlete'),
        where('status', '==', 'approved')
      ));
      const approvedAthletes = approvedSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAthletes(approvedAthletes);

      const now = new Date();
      const dayOfWeek = now.getDay();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      weekStart.setHours(0, 0, 0, 0);

      const milesMap        = {};
      const weeklyMilesMap  = {};
      const threeWeekAvgMap = {};
      const weekBreakdownMap = {};
      const zonePctMap      = {};
      const paceEasyPctMap  = {};
      const lastRunDateMap  = {};

      for (const athlete of approvedAthletes) {
        try {
          const runsSnap = await getDocs(query(
            collection(db, 'runs'),
            where('userId', '==', athlete.id),
            orderBy('date', 'desc')
          ));
          const allRuns = runsSnap.docs.map(d => ({ ...d.data() }));

          // Track most recent run date for inactive detection
          if (allRuns.length > 0) {
            const d = allRuns[0].date?.toDate?.();
            if (d) lastRunDateMap[athlete.id] = d;
          }

          // Timeframe filter for period miles
          const filtered = allRuns.filter(r => {
            const d = r.date?.toDate?.();
            if (!d) return false;
            if (cutoff && d < cutoff) return false;
            if (cutoffEnd && d > cutoffEnd) return false;
            return true;
          });
          milesMap[athlete.id] = Math.round(filtered.reduce((s, r) => s + (r.miles || 0), 0) * 10) / 10;

          // Current week miles
          const weekFiltered = allRuns.filter(r => {
            const d = r.date?.toDate?.();
            return d && d >= weekStart;
          });
          weeklyMilesMap[athlete.id] = Math.round(
            weekFiltered.reduce((s, r) => s + (r.miles || 0), 0) * 10
          ) / 10;

          // 3-week average weekly miles
          const week1Start = new Date(weekStart); // current week (incomplete)
          const week2Start = new Date(weekStart); week2Start.setDate(week2Start.getDate() - 7);
          const week3Start = new Date(weekStart); week3Start.setDate(week3Start.getDate() - 14);
          const week4Start = new Date(weekStart); week4Start.setDate(week4Start.getDate() - 21);

          const w1 = allRuns.filter(r => { const d = r.date?.toDate?.(); return d && d >= week1Start; })
            .reduce((s, r) => s + (r.miles || 0), 0);
          const w2 = allRuns.filter(r => { const d = r.date?.toDate?.(); return d && d >= week2Start && d < week1Start; })
            .reduce((s, r) => s + (r.miles || 0), 0);
          const w3 = allRuns.filter(r => { const d = r.date?.toDate?.(); return d && d >= week3Start && d < week2Start; })
            .reduce((s, r) => s + (r.miles || 0), 0);
          const w4 = allRuns.filter(r => { const d = r.date?.toDate?.(); return d && d >= week4Start && d < week3Start; })
            .reduce((s, r) => s + (r.miles || 0), 0);

          threeWeekAvgMap[athlete.id] = Math.round(((w1 + w2 + w3) / 3) * 10) / 10;
          // Store last 3 COMPLETED weeks (skip current incomplete week)
          weekBreakdownMap[athlete.id] = {
            w1: Math.round(w2 * 10) / 10, // last week
            w2: Math.round(w3 * 10) / 10, // 2 weeks ago
            w3: Math.round(w4 * 10) / 10, // 3 weeks ago
          };

          // ── Zone 1+2 % — FIX: now uses 3-tier stream recalculation ──────────
          // Previously only used calcZoneBreakdownFromRuns (avg HR estimate).
          // Now calls calcAthleteZonePct which tries rawHRStream first, then
          // stored zoneSeconds, then falls back to the avg HR estimate.
          // This means the Z1+Z2 % on each athlete card is as accurate as the
          // data available and always reflects the coach's current zone boundaries.
          try {
            const age = athlete.birthdate
              ? Math.floor((new Date() - parseBirthdate(athlete.birthdate)) / (365.25 * 86400000))
              : 16;
            const thirtyDaysAgo = new Date(now - 30 * 86400000);
            const recentRuns = allRuns.filter(r => {
              const d = r.date?.toDate?.();
              return d && d >= thirtyDaysAgo;
            });
            // Store null explicitly so the card can show "No HR data" vs hiding
            zonePctMap[athlete.id] = calcAthleteZonePct(recentRuns, age, currentZoneSettings);

            // Pace-based easy % (uses VDOT training paces instead of HR)
            paceEasyPctMap[athlete.id] = calcAthletePaceEasyPct(recentRuns, athlete.trainingPaces);
          } catch (e) { console.warn('Zone pct calc failed for athlete:', e); }

        } catch (e) {
          console.log('Athlete data error:', e);
          milesMap[athlete.id]        = 0;
          weeklyMilesMap[athlete.id]  = 0;
          threeWeekAvgMap[athlete.id] = 0;
        }
      }

      setAthleteMiles(milesMap);
      setAthleteWeeklyMiles(weeklyMilesMap);
      setAthlete3WeekAvg(threeWeekAvgMap);
      setAthleteWeeklyBreakdown(weekBreakdownMap);
      setAthleteZonePct(zonePctMap);
      setAthletePaceEasyPct(paceEasyPctMap);
      setAthleteLastRunDate(lastRunDateMap);

      // ── Compliance computation ──
      const compliance = computeVolumeCompliance(approvedAthletes, loadedGroups, threeWeekAvgMap, weekBreakdownMap);
      setComplianceData(compliance);

      // ── Pace compliance computation ──
      const paceComp = { runningEasy: [], tooHard: [], noPaces: 0, noPacesAthletes: [] };
      for (const a of approvedAthletes) {
        if (!a.trainingPaces) { paceComp.noPaces++; paceComp.noPacesAthletes.push(a); continue; }
        const easyPct = paceEasyPctMap[a.id];
        if (easyPct == null) continue;
        const entry = { ...a, easyPct };
        if (easyPct >= 68) paceComp.runningEasy.push(entry);
        else paceComp.tooHard.push(entry);
      }
      paceComp.tooHard.sort((a, b) => a.easyPct - b.easyPct);
      setPaceComplianceData(paceComp);

      // Current-week pace per athlete (time-proportional)
      const mondayDay = dayOfWeek === 0 ? 7 : dayOfWeek; // 1=Mon … 7=Sun
      const paceMap = {};
      for (const a of approvedAthletes) {
        const target = getAthleteWeeklyTarget(a, loadedGroups, threeWeekAvgMap);
        paceMap[a.id] = getCurrentWeekPace(weeklyMilesMap[a.id] || 0, target, mondayDay);
      }
      setAthleteWeekPace(paceMap);

      // ── Team Pulse: bulk check-in query for this week ──
      try {
        const checkinSnap = await getDocs(query(
          collection(db, 'checkins'),
          where('schoolId', '==', userData.schoolId),
          where('date', '>=', weekStart)
        ));
        const checkinsByAthlete = {};
        let moodSum = 0;
        let moodCount = 0;
        checkinSnap.docs.forEach(d => {
          const data = d.data();
          checkinsByAthlete[data.userId] = true;
          if (data.mood) { moodSum += data.mood; moodCount++; }
        });
        const checkinCount = Object.keys(checkinsByAthlete).length;
        const threeDaysAgo = new Date(now - 3 * 86400000);
        const inactiveCount = approvedAthletes.filter(a => {
          const lastRun = lastRunDateMap[a.id];
          return !lastRun || lastRun < threeDaysAgo;
        }).length;
        setTeamPulse({
          checkinCount,
          totalAthletes: approvedAthletes.length,
          teamAvgMood: moodCount > 0 ? Math.round((moodSum / moodCount) * 10) / 10 : null,
          inactiveCount,
        });
      } catch (e) {
        console.warn('Team pulse check-in query failed:', e);
        const threeDaysAgo = new Date(now - 3 * 86400000);
        setTeamPulse({
          checkinCount: 0,
          totalAthletes: approvedAthletes.length,
          teamAvgMood: null,
          inactiveCount: approvedAthletes.filter(a => !lastRunDateMap[a.id] || lastRunDateMap[a.id] < threeDaysAgo).length,
        });
      }

      const alertsMap = {};
      for (const athlete of approvedAthletes) {
        alertsMap[athlete.id] = await checkOvertraining(athlete.id);
      }
      setOvertTrainingAlerts(alertsMap);

      if (userData.coachRole === 'admin') {
        const pendingSnap = await getDocs(query(
          collection(db, 'users'),
          where('schoolId', '==', userData.schoolId),
          where('role', '==', 'athlete'),
          where('status', '==', 'pending')
        ));
        setPendingAthletes(pendingSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        // Count pending assistant coaches
        const pendingCoachIds = schoolData?.pendingCoachIds || [];
        setPendingCoachCount(pendingCoachIds.length);
      }

      // Count total unread across channels the user belongs to
      try {
        const freshUserDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        const lastSeenChannels = freshUserDoc.data()?.lastSeenChannels || {};
        if (!lastSeenChannels.whole_team && freshUserDoc.data()?.lastSeenFeed) {
          lastSeenChannels.whole_team = freshUserDoc.data().lastSeenFeed;
        }
        // Build set of channels this coach belongs to
        const myChannelKeys = new Set(['whole_team', 'boys', 'girls', 'parents', 'coaches']);
        loadedGroups.forEach(g => myChannelKeys.add(`group_${g.id}`));

        const postsSnap = await getDocs(query(
          collection(db, 'teamPosts'),
          where('schoolId', '==', userData.schoolId)
        ));
        let totalUnread = 0;
        postsSnap.docs.forEach(d => {
          const data = d.data();
          const ch = data.channel || 'whole_team';
          if (!myChannelKeys.has(ch)) return;
          const lastSeen = lastSeenChannels[ch];
          const lastSeenDate = lastSeen ? (lastSeen.toDate ? lastSeen.toDate() : new Date(lastSeen)) : new Date(0);
          const created = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || 0);
          if (created > lastSeenDate && data.authorId !== auth.currentUser.uid) totalUnread++;
        });
        setUnreadFeedCount(totalUnread);
      } catch (e) { console.warn('Unread feed count failed:', e); setUnreadFeedCount(0); }

      try {
        const trainingSnap = await getDocs(query(
          collection(db, 'events'),
          where('schoolId', '==', userData.schoolId),
          where('category', '==', 'Training'),
          orderBy('date', 'asc')
        ));
        setTrainingItems(trainingSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch {
        try {
          const allSnap = await getDocs(query(
            collection(db, 'events'),
            where('schoolId', '==', userData.schoolId),
            orderBy('date', 'asc')
          ));
          setTrainingItems(allSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => i.category === 'Training'));
        } catch (e2) { console.error('Training load error:', e2.message); }
      }

      // Load next upcoming meet for Training Hub card
      try {
        const meetsSnap = await getDocs(query(
          collection(db, 'raceMeets'),
          where('schoolId', '==', userData.schoolId)
        ));
        const allMeets = meetsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const upcoming = allMeets
          .filter(m => { const d = m.date?.toDate ? m.date.toDate() : new Date(m.date); return d >= todayStart; })
          .sort((a, b) => {
            const aD = a.date?.toDate ? a.date.toDate() : new Date(a.date);
            const bD = b.date?.toDate ? b.date.toDate() : new Date(b.date);
            return aD - bD;
          });
        setNextMeet(upcoming[0] || null);
      } catch { setNextMeet(null); }

      try {
        const today = new Date().toISOString().split('T')[0];
        const tipDoc = await getDoc(doc(db, 'dailyMessages', `${userData.schoolId}_${today}`));
        setTodayTipSent(tipDoc.exists());
      } catch (e) { console.warn('Failed to check daily tip status:', e); }

    } catch (error) { console.error('Coach dashboard error:', error); }
    setLoading(false);
  }, [selectedTimeframe, userData.schoolId]);

  useEffect(() => {
    if (!trainingSection && !addFromDashboard) loadDashboard();
  }, [selectedTimeframe, trainingSection, addFromDashboard]);

  // ── Share leaderboard ────────────────────────────────────────────────────
  const handleShareLeaderboard = async () => {
    const sorted = [...filteredAthletes]
      .sort((a, b) => (athleteMiles[b.id] || 0) - (athleteMiles[a.id] || 0));

    if (sorted.length === 0) {
      Alert.alert('Nothing to share', 'No athlete data for this timeframe.');
      return;
    }

    const period = selectedTimeframe.label || 'Selected period';
    const groupName = groupFilter !== 'all' && groupFilter !== 'bygroup'
      ? (groupFilter === 'unassigned' ? 'Unassigned' : groups.find(g => g.id === groupFilter)?.name)
      : null;

    let lines;
    if (groupFilter === 'bygroup') {
      // Format by group with headers
      lines = [];
      [...groups, { id: null, name: 'Unassigned' }].forEach(group => {
        const groupAthletes = sorted.filter(a => group.id ? a.groupId === group.id : !a.groupId);
        if (groupAthletes.length === 0) return;
        lines.push('');
        lines.push(`── ${group.name}${group.weeklyMilesTarget ? ` (${group.weeklyMilesTarget} mi/wk target)` : ''} ──`);
        groupAthletes.forEach((a, i) => {
          const miles = Number(athleteMiles[a.id] || 0).toFixed(2);
          lines.push(`${i + 1}. ${a.firstName} ${a.lastName} — ${miles} mi`);
        });
      });
    } else {
      lines = sorted.map((a, i) => {
        const miles = Number(athleteMiles[a.id] || 0).toFixed(2);
        return `${i + 1}. ${a.firstName} ${a.lastName} — ${miles} mi`;
      });
    }

    const message = [
      `${school?.name || 'Team'} Leaderboard${groupName ? ' — ' + groupName : ''} — ${period}`,
      '',
      ...lines,
      '',
      `Sent from XCTracker`,
    ].join('\n');

    try {
      await Share.share({ message });
    } catch (e) { console.warn('Share failed:', e); }
  };

  // ── Deep drill-down (full replacement — not a tab) ──────────────────────
  if (selectedAthlete) {
    return <AthleteDetailScreen
      athlete={selectedAthlete}
      school={school}
      teamZoneSettings={teamZoneSettings}
      groups={groups}
      onBack={() => setSelectedAthlete(null)}
    />;
  }

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleApproveAthlete = async (athlete) => {
    try {
      await updateDoc(doc(db, 'users', athlete.id), { status: 'approved' });
      await updateDoc(doc(db, 'schools', userData.schoolId), {
        pendingAthleteIds: arrayRemove(athlete.id),
        athleteIds: arrayUnion(athlete.id),
      });
      Alert.alert('Approved!', `${athlete.firstName} ${athlete.lastName} has been approved.`);
      loadDashboard();
    } catch { Alert.alert('Error', 'Could not approve athlete.'); }
  };

  const handleDenyAthlete = async (athlete) => {
    Alert.alert('Deny?', `Deny ${athlete.firstName}'s request?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Deny', style: 'destructive', onPress: async () => {
        await updateDoc(doc(db, 'users', athlete.id), { status: 'denied', schoolId: null });
        await updateDoc(doc(db, 'schools', userData.schoolId), { pendingAthleteIds: arrayRemove(athlete.id) });
        loadDashboard();
      }},
    ]);
  };

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: async () => {
        await SecureStore.deleteItemAsync('xctracker_email');
        await SecureStore.deleteItemAsync('xctracker_password');
        signOut(auth);
      }},
    ]);
  };

  const handleOpenTip = (phase) => {
    setTipText(getDailyTip(phase.name));
    setTipModalVisible(true);
  };

  const handleSendTip = async () => {
    if (!tipText.trim()) return;
    setSendingTip(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      await setDoc(doc(db, 'dailyMessages', `${userData.schoolId}_${today}`), {
        schoolId:    userData.schoolId,
        message:     tipText.trim(),
        sentBy:      auth.currentUser.uid,
        sentByName:  `Coach ${userData.lastName}`,
        date:        today,
        sentAt:      new Date(),
      });
      setTodayTipSent(true);
      setTipModalVisible(false);
      Alert.alert('Sent! ✅', "Your message has been pinned to every athlete's dashboard.");
    } catch {
      Alert.alert('Error', 'Could not send message. Please try again.');
    }
    setSendingTip(false);
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={BRAND} /></View>;

  const primaryColor  = school?.primaryColor || BRAND;
  const isAdmin       = userData.coachRole === 'admin';
  const hasTrainingAccess = isAdmin || userData.trainingAccess === true;
  const today         = new Date().toISOString().split('T')[0];
  const todayItems    = trainingItems.filter(item => item.date?.toDate?.()?.toISOString().split('T')[0] === today);
  const upcomingItems = trainingItems.filter(item => item.date?.toDate?.()?.toISOString().split('T')[0] > today).slice(0, 7);
  const activeSeason  = getActiveSeason(school);
  const currentPhase  = activeSeason ? getPhaseForSeason(activeSeason) : getPhaseForSeason(null);
  const alertCount    = Object.values(overtTrainingAlerts).filter(a => a.alert).length;
  const injuredCount  = Object.values(overtTrainingAlerts).filter(a => a.todayInjury).length;
  const sickCount     = Object.values(overtTrainingAlerts).filter(a => a.todayIllness).length;
  const filteredAthletes = athletes.filter(a => {
    if (genderFilter !== 'all' && a.gender !== genderFilter) return false;
    if (groupFilter !== 'all' && groupFilter !== 'bygroup') {
      if (groupFilter === 'unassigned') return !a.groupId;
      if (a.groupId !== groupFilter) return false;
    }
    return true;
  });

  const teamWeeklyMiles = Math.round(
    filteredAthletes.reduce((s, a) => s + (athleteWeeklyMiles[a.id] || 0), 0) * 10
  ) / 10;
  const teamPeriodMiles = Math.round(
    filteredAthletes.reduce((s, a) => s + (athleteMiles[a.id] || 0), 0) * 10
  ) / 10;

  const renderAthleteCard = (athlete, index) => {
    const weekMiles   = athleteWeeklyMiles[athlete.id] || 0;
    const avg3        = athlete3WeekAvg[athlete.id] || 0;
    const mileageHigh = avg3 > 0 && weekMiles > avg3 * 1.20;
    const paceEasy    = athletePaceEasyPct[athlete.id];
    const hasPaceData = paceEasy !== undefined && paceEasy !== null;
    const noVdot      = !athlete.trainingPaces;
    const easyLow     = hasPaceData && paceEasy < 70;
    const pace        = athleteWeekPace[athlete.id];
    const paceDotColor = pace?.status === 'on_track' ? STATUS.success
      : pace?.status === 'caution' ? STATUS.warning
      : pace?.status === 'behind' || pace?.status === 'ahead' ? STATUS.error
      : null;
    const line1 = `Wk: ${weekMiles} mi${avg3 > 0 ? ` (avg ${avg3})` : ''}${mileageHigh ? '  ↑' : ''}`;
    const line2 = hasPaceData
      ? `Easy: ${paceEasy}%${easyLow ? '  ⚠' : ''}`
      : noVdot ? 'No paces set' : null;

    return (
      <TouchableOpacity
        key={athlete.id}
        style={styles.athleteCard}
        onPress={() => setSelectedAthlete(athlete)}
      >
        <View style={styles.athleteCardTop}>
          <Text style={styles.rankNum}>#{index + 1}</Text>
          <View style={[styles.avatar, { backgroundColor: athlete.avatarColor || BRAND }]}>
            <Text style={styles.avatarText}>{athlete.firstName?.[0]}{athlete.lastName?.[0]}</Text>
            {paceDotColor && <View style={[styles.paceDot, { backgroundColor: paceDotColor }]} />}
          </View>
          <View style={styles.athleteInfo}>
            <View style={styles.athleteNameRow}>
              <Text style={styles.athleteName}>{athlete.firstName} {athlete.lastName}</Text>
            </View>
            <Text style={styles.athleteSub}>{line1}</Text>
            {line2 && <Text style={[styles.athleteSub, noVdot && !hasPaceData && { color: NEUTRAL.muted, fontStyle: 'italic' }]}>{line2}</Text>}
          </View>
          <View style={styles.milesBox}>
            <Text style={[styles.milesNum, { color: BRAND }]}>
              {athleteMiles[athlete.id] ?? '—'}
            </Text>
            <Text style={styles.milesLabel}>miles</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Coach {userData.lastName}</Text>
            <Text style={styles.schoolName}>{school?.name || 'XCTracker'}</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerRightText}>{athletes.length} athletes  ·  Code: {school?.joinCode || '--'}</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 90 }}
      >

        {/* ── Today's Plan (top of dashboard) ── */}
        <View style={{ paddingHorizontal: SPACE.lg, paddingTop: SPACE.md }}>
          <View style={styles.todaySection}>
            <Text style={styles.todayLabel}>TODAY</Text>
            {todayItems.length > 0 ? todayItems.map(item => (
              <TouchableOpacity key={item.id} style={[styles.todayCard, { borderLeftColor: TYPE_COLORS[item.type] || primaryColor }]} onPress={() => setTodayWorkoutDetail(item)}>
                <View style={styles.todayCardRow}>
                  <View style={[styles.typeBadge, { backgroundColor: TYPE_COLORS[item.type] || primaryColor, marginBottom: 0 }]}>
                    <Text style={styles.typeBadgeText}>{item.type}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.trainingTitle} numberOfLines={1}>{item.title}{item.baseMiles ? ` — ${item.baseMiles} mi` : ''}</Text>
                    {item.description && <Text style={styles.todayCardDesc} numberOfLines={1}>{item.description}</Text>}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={NEUTRAL.input} />
                </View>
              </TouchableOpacity>
            )) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No training scheduled today.</Text>
              </View>
            )}
            {isAdmin && !todayTipSent && (
              <TouchableOpacity
                style={styles.msgBtn}
                onPress={() => handleOpenTip(currentPhase)}
              >
                <Text style={styles.msgBtnText}>
                  💬 Send daily message to team
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Injury / illness alert card ── */}
        {(() => {
          const injuredAthletes = athletes.filter(a => overtTrainingAlerts[a.id]?.todayInjury || overtTrainingAlerts[a.id]?.todayIllness);
          if (injuredAthletes.length === 0) return null;
          const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
          const formatWhen = (d) => {
            if (!d) return '';
            if (d >= todayStart) return 'today';
            const daysAgo = Math.ceil((todayStart - d) / 86400000);
            return daysAgo === 1 ? 'yesterday' : `${daysAgo}d ago`;
          };
          return (
            <View style={styles.injuryAlertCard}>
              <TouchableOpacity style={styles.injuryAlertHeader} onPress={() => setInjuryCardExpanded(prev => !prev)}>
                <Ionicons name="warning" size={20} color={STATUS.error} />
                <Text style={styles.injuryAlertTitle}>
                  {injuredAthletes.length} athlete{injuredAthletes.length > 1 ? 's' : ''} reporting injury or illness
                </Text>
                <Ionicons name={injuryCardExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={STATUS.error} />
              </TouchableOpacity>
              {injuryCardExpanded && injuredAthletes.map(athlete => {
                const alerts = overtTrainingAlerts[athlete.id];
                const inj = alerts?.todayInjury;
                const ill = alerts?.todayIllness;
                const when = formatWhen(alerts?.injuryCheckinDate);
                const worstSeverity = [inj?.severity, ill?.severity]
                  .filter(Boolean)
                  .reduce((w, s) => s === 'severe' || w === 'severe' ? 'severe' : s === 'moderate' || w === 'moderate' ? 'moderate' : 'mild', 'mild');
                const sevColor = worstSeverity === 'severe' ? STATUS.error : worstSeverity === 'moderate' ? STATUS.warning : NEUTRAL.label;
                const rec = worstSeverity === 'severe' ? 'Recommend rest day'
                  : worstSeverity === 'moderate' ? 'Consider modified workout'
                  : 'Monitor during practice';
                return (
                  <TouchableOpacity key={athlete.id} style={styles.injuryAlertRow} onPress={() => setSelectedAthlete(athlete)}>
                    <View style={[styles.avatar, { backgroundColor: athlete.avatarColor || BRAND, width: 32, height: 32 }]}>
                      <Text style={[styles.avatarText, { fontSize: FONT_SIZE.xs }]}>{athlete.firstName?.[0]}{athlete.lastName?.[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.injuryAlertName}>{athlete.firstName} {athlete.lastName}{when ? <Text style={styles.injuryAlertWhen}> — reported {when}</Text> : ''}</Text>
                      {inj && (
                        <Text style={styles.injuryAlertDetail}>
                          🩹 {inj.perLocation
                            ? inj.perLocation.map(p => `${p.location.charAt(0).toUpperCase() + p.location.slice(1)} (${p.severity})`).join(', ')
                            : `${inj.locations?.map(l => l.charAt(0).toUpperCase() + l.slice(1)).join(', ')} — ${inj.severity}`
                          }{inj.note ? ` — "${inj.note}"` : ''}
                        </Text>
                      )}
                      {ill && (
                        <Text style={styles.injuryAlertDetail}>
                          🤒 {ill.symptoms?.map(s => s.replace(/_/g, ' ')).join(', ')} — <Text style={{ color: sevColor, fontWeight: FONT_WEIGHT.bold }}>{ill.severity}</Text>
                        </Text>
                      )}
                      <Text style={[styles.injuryAlertRec, { color: sevColor }]}>{rec}</Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })()}

        {/* ── Season in Review banner ── */}
        {(() => {
          if (!school) return null;
          const completed = getCompletedSeasons(school);
          const unreviewedSeason = completed.find(s => !reviewDismissed[`${s.sport}_${s.championshipDate}`]);
          if (!unreviewedSeason) return null;
          return (
            <TouchableOpacity
              style={[styles.complianceCard, { borderColor: STATUS.success + '60' }]}
              onPress={() => { setSeasonReviewSeason(unreviewedSeason); setSeasonReviewVisible(true); }}
            >
              <View style={styles.complianceHeader}>
                <Ionicons name="trophy" size={20} color={STATUS.success} />
                <Text style={[styles.complianceTitle, { color: STATUS.success }]}>
                  {unreviewedSeason.name || 'Season'} Complete — View Season in Review
                </Text>
                <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); setReviewDismissed(prev => ({ ...prev, [`${unreviewedSeason.sport}_${unreviewedSeason.championshipDate}`]: true })); }}>
                  <Ionicons name="close" size={18} color={NEUTRAL.muted} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })()}

        {/* ── Mileage Volume card (expandable, like injury card) ── */}
        {(complianceData.underTarget.length > 0 || complianceData.overTarget.length > 0) && (
          <View style={styles.complianceCard}>
            <TouchableOpacity style={styles.complianceHeader} onPress={() => setComplianceExpanded(prev => !prev)}>
              <Ionicons name="trending-up" size={20} color={BRAND} />
              <Text style={styles.complianceTitle}>
                Mileage Volume — {complianceData.onTarget.length} on track
                {complianceData.underTarget.length > 0 ? `, ${complianceData.underTarget.length} under` : ''}
                {complianceData.overTarget.length > 0 ? `, ${complianceData.overTarget.length} over` : ''}
              </Text>
              <Ionicons name={complianceExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={NEUTRAL.muted} />
            </TouchableOpacity>
            {complianceExpanded && (
              <View style={{ marginTop: SPACE.sm }}>
                {complianceData.underTarget.length > 0 && (
                  <View style={{ marginBottom: SPACE.sm }}>
                    <Text style={[styles.complianceGroupLabel, { color: STATUS.error }]}>Under target</Text>
                    {complianceData.underTarget.map(a => (
                      <TouchableOpacity key={a.id} style={styles.complianceRow} onPress={() => setSelectedAthlete(a)}>
                        <View style={[styles.avatar, { backgroundColor: a.avatarColor || BRAND, width: 28, height: 28 }]}>
                          <Text style={[styles.avatarText, { fontSize: 10 }]}>{a.firstName?.[0]}{a.lastName?.[0]}</Text>
                        </View>
                        <Text style={styles.complianceRowName}>{a.firstName} {a.lastName}</Text>
                        <View style={styles.complianceWeeks}>
                          <Text style={[styles.complianceWeekVal, a.w3Status === 'under' && styles.complianceUnder, a.w3Status === 'over' && styles.complianceOver]}>
                            {a.w3Status === 'under' ? '↓' : a.w3Status === 'over' ? '↑' : '✓'} {a.wb.w3}
                          </Text>
                          <Text style={[styles.complianceWeekVal, a.w2Status === 'under' && styles.complianceUnder, a.w2Status === 'over' && styles.complianceOver]}>
                            {a.w2Status === 'under' ? '↓' : a.w2Status === 'over' ? '↑' : '✓'} {a.wb.w2}
                          </Text>
                          <Text style={[styles.complianceWeekVal, a.w1Status === 'under' && styles.complianceUnder, a.w1Status === 'over' && styles.complianceOver]}>
                            {a.w1Status === 'under' ? '↓' : a.w1Status === 'over' ? '↑' : '✓'} {a.wb.w1}
                          </Text>
                        </View>
                        {a.target && <Text style={styles.complianceTarget}>{a.target} mi</Text>}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {complianceData.overTarget.length > 0 && (
                  <View style={{ marginBottom: SPACE.sm }}>
                    <Text style={[styles.complianceGroupLabel, { color: STATUS.warning }]}>Over target</Text>
                    {complianceData.overTarget.map(a => (
                      <TouchableOpacity key={a.id} style={styles.complianceRow} onPress={() => setSelectedAthlete(a)}>
                        <View style={[styles.avatar, { backgroundColor: a.avatarColor || BRAND, width: 28, height: 28 }]}>
                          <Text style={[styles.avatarText, { fontSize: 10 }]}>{a.firstName?.[0]}{a.lastName?.[0]}</Text>
                        </View>
                        <Text style={styles.complianceRowName}>{a.firstName} {a.lastName}</Text>
                        <View style={styles.complianceWeeks}>
                          <Text style={[styles.complianceWeekVal, a.w3Status === 'under' && styles.complianceUnder, a.w3Status === 'over' && styles.complianceOver]}>
                            {a.w3Status === 'under' ? '↓' : a.w3Status === 'over' ? '↑' : '✓'} {a.wb.w3}
                          </Text>
                          <Text style={[styles.complianceWeekVal, a.w2Status === 'under' && styles.complianceUnder, a.w2Status === 'over' && styles.complianceOver]}>
                            {a.w2Status === 'under' ? '↓' : a.w2Status === 'over' ? '↑' : '✓'} {a.wb.w2}
                          </Text>
                          <Text style={[styles.complianceWeekVal, a.w1Status === 'under' && styles.complianceUnder, a.w1Status === 'over' && styles.complianceOver]}>
                            {a.w1Status === 'under' ? '↓' : a.w1Status === 'over' ? '↑' : '✓'} {a.wb.w1}
                          </Text>
                        </View>
                        {a.target && <Text style={styles.complianceTarget}>{a.target} mi</Text>}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* ── Easy-Hard Balance card (expandable) ── */}
        {(paceComplianceData.tooHard.length > 0 || paceComplianceData.runningEasy.length > 0 || paceComplianceData.noPaces > 0) && (
          <View style={styles.complianceCard}>
            <TouchableOpacity style={styles.complianceHeader} onPress={() => setPaceComplianceExpanded(prev => !prev)}>
              <Ionicons name="speedometer-outline" size={20} color={BRAND} />
              <Text style={styles.complianceTitle}>
                Easy-Hard Balance — {paceComplianceData.runningEasy.length} running easy
                {paceComplianceData.tooHard.length > 0 ? `, ${paceComplianceData.tooHard.length} too hard` : ''}
                {paceComplianceData.noPaces > 0 ? `, ${paceComplianceData.noPaces} need paces` : ''}
              </Text>
              <Ionicons name={paceComplianceExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={NEUTRAL.muted} />
            </TouchableOpacity>
            {paceComplianceExpanded && (
              <View style={{ marginTop: SPACE.sm }}>
                {paceComplianceData.tooHard.length > 0 && (
                  <View style={{ marginBottom: SPACE.sm }}>
                    <Text style={[styles.complianceGroupLabel, { color: STATUS.error }]}>Too hard (easy &lt; 68%)</Text>
                    {paceComplianceData.tooHard.map(a => (
                      <TouchableOpacity key={a.id} style={styles.complianceRow} onPress={() => setSelectedAthlete(a)}>
                        <View style={[styles.avatar, { backgroundColor: a.avatarColor || BRAND, width: 28, height: 28 }]}>
                          <Text style={[styles.avatarText, { fontSize: 10 }]}>{a.firstName?.[0]}{a.lastName?.[0]}</Text>
                        </View>
                        <Text style={styles.complianceRowName}>{a.firstName} {a.lastName}</Text>
                        <Text style={[styles.complianceTarget, { color: STATUS.error }]}>Easy: {a.easyPct}%</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {paceComplianceData.runningEasy.length > 0 && (
                  <View style={{ marginBottom: SPACE.sm }}>
                    <Text style={[styles.complianceGroupLabel, { color: STATUS.success }]}>Running easy (≥ 68%)</Text>
                    {paceComplianceData.runningEasy.map(a => (
                      <TouchableOpacity key={a.id} style={styles.complianceRow} onPress={() => setSelectedAthlete(a)}>
                        <View style={[styles.avatar, { backgroundColor: a.avatarColor || BRAND, width: 28, height: 28 }]}>
                          <Text style={[styles.avatarText, { fontSize: 10 }]}>{a.firstName?.[0]}{a.lastName?.[0]}</Text>
                        </View>
                        <Text style={styles.complianceRowName}>{a.firstName} {a.lastName}</Text>
                        <Text style={[styles.complianceTarget, { color: STATUS.success }]}>Easy: {a.easyPct}%</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {paceComplianceData.noPacesAthletes && paceComplianceData.noPacesAthletes.length > 0 && (
                  <View style={{ marginBottom: SPACE.sm }}>
                    <Text style={[styles.complianceGroupLabel, { color: STATUS.warning }]}>Need training paces</Text>
                    {paceComplianceData.noPacesAthletes.map(a => (
                      <TouchableOpacity key={a.id} style={styles.complianceRow} onPress={() => setSelectedAthlete(a)}>
                        <View style={[styles.avatar, { backgroundColor: a.avatarColor || BRAND, width: 28, height: 28 }]}>
                          <Text style={[styles.avatarText, { fontSize: 10 }]}>{a.firstName?.[0]}{a.lastName?.[0]}</Text>
                        </View>
                        <Text style={styles.complianceRowName}>{a.firstName} {a.lastName}</Text>
                        <Text style={[styles.complianceTarget, { color: NEUTRAL.muted, fontStyle: 'italic' }]}>No paces set</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* ── Team ── */}
        <View style={styles.section}>

          <View style={styles.timeframeRow}>
            <View style={{ flex: 1 }}>
              <TimeframePicker
                selected={selectedTimeframe}
                onSelect={setSelectedTimeframe}
                activeSeason={activeSeasonData}
                primaryColor={primaryColor}
              />
            </View>
            <TouchableOpacity style={styles.shareBtn} onPress={handleShareLeaderboard}>
              <Text style={styles.shareBtnText}>Share</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.genderRow}>
            {['all', 'boys', 'girls'].map(g => (
              <TouchableOpacity
                key={g}
                style={[styles.genderBtn, genderFilter === g && { backgroundColor: BRAND, borderColor: BRAND }]}
                onPress={() => setGenderFilter(g)}
              >
                <Text style={[styles.genderBtnText, genderFilter === g && { color: '#fff' }]}>
                  {g === 'all' ? 'All' : g === 'boys' ? 'Boys' : 'Girls'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {groups.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupFilterRow}>
              {[{ id: 'all', name: 'All' }, { id: 'bygroup', name: 'By Group' }, ...groups, { id: 'unassigned', name: 'Unassigned' }].map(g => (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.groupFilterBtn, groupFilter === g.id && { backgroundColor: BRAND, borderColor: BRAND }]}
                  onPress={() => setGroupFilter(g.id)}
                >
                  <Text style={[styles.groupFilterBtnText, groupFilter === g.id && { color: '#fff' }]}>
                    {g.name}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.manageGroupsBtn} onPress={() => { setFeedVisible(false); setZonesVisible(false); setProfileVisible(false); setAnalyticsVisible(false); setAddFromDashboard(false); setTrainingSection('groups'); }}>
                <Ionicons name="settings-outline" size={14} color={NEUTRAL.muted} />
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <TouchableOpacity style={styles.createGroupsBtn} onPress={() => { setFeedVisible(false); setZonesVisible(false); setProfileVisible(false); setAnalyticsVisible(false); setAddFromDashboard(false); setTrainingSection('groups'); }}>
              <Ionicons name="people-outline" size={16} color={BRAND} />
              <Text style={styles.createGroupsBtnText}>Create training groups</Text>
            </TouchableOpacity>
          )}

            {filteredAthletes.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No approved athletes yet.</Text>
                <Text style={styles.emptySubText}>Share join code: {school?.joinCode}</Text>
              </View>
            ) : groupFilter === 'bygroup' ? (
              // ── By Group view: athletes grouped under headers ──
              [...groups, { id: null, name: 'Unassigned' }].map(group => {
                const groupAthletes = athletes
                  .filter(a => group.id ? a.groupId === group.id : !a.groupId)
                  .filter(a => genderFilter === 'all' || a.gender === genderFilter)
                  .sort((a, b) => (athleteMiles[b.id] || 0) - (athleteMiles[a.id] || 0));
                if (groupAthletes.length === 0) return null;
                return (
                  <View key={group.id || 'unassigned'} style={styles.groupSection}>
                    <Text style={[styles.groupHeader, group.id && { color: BRAND }]}>
                      {group.name}{group.weeklyMilesTarget ? ` · ${group.weeklyMilesTarget} mi/wk target` : ''}
                    </Text>
                    {groupAthletes.map((athlete, index) => renderAthleteCard(athlete, index))}
                  </View>
                );
              })
            ) : (
              // ── Flat sorted view ──
              [...filteredAthletes]
                .sort((a, b) => (athleteMiles[b.id] || 0) - (athleteMiles[a.id] || 0))
                .map((athlete, index) => renderAthleteCard(athlete, index))
            )}

          </View>

          {/* ── Upcoming training ── */}
          <View style={styles.section}>
            <View style={styles.upcomingSection}>
              <View style={styles.upcomingHeader}>
                <Text style={styles.upcomingSectionTitle}>Upcoming training</Text>
              </View>
              {upcomingItems.length === 0 ? (
                <View style={styles.emptyCard}><Text style={styles.emptyText}>No upcoming training scheduled.</Text></View>
              ) : upcomingItems.map(item => (
                <TouchableOpacity key={item.id} style={styles.trainingCard} onPress={() => setTodayWorkoutDetail(item)}>
                  <View style={[styles.typeBadge, { backgroundColor: TYPE_COLORS[item.type] || primaryColor }]}>
                    <Text style={styles.typeBadgeText}>{item.type}</Text>
                  </View>
                  <View style={styles.trainingInfo}>
                    <Text style={styles.trainingTitle}>{item.title}{item.baseMiles ? ` — ${item.baseMiles} mi` : ''}</Text>
                    {item.description && <Text style={styles.trainingDesc} numberOfLines={1}>{item.description}</Text>}
                    <Text style={styles.trainingDate}>
                      {item.date?.toDate?.()?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={NEUTRAL.input} />
                </TouchableOpacity>
              ))}
            </View>
          </View>

      </ScrollView>

      {/* ── Sub-screens rendered over content but under nav ── */}
      {/* Training Hub (shown when Training tab active but no sub-section) */}
      {trainingSection === 'hub' && (
        <View style={styles.subScreen}>
          <TrainingHub
            school={school}
            athletes={athletes}
            groups={groups}
            trainingItems={trainingItems}
            nextMeet={nextMeet}
            onNavigate={(section) => setTrainingSection(section)}
          />
        </View>
      )}
      {/* Training > Manage Groups */}
      {trainingSection === 'groups' && (
        <View style={styles.subScreen}>
          <ManageGroups
            schoolId={userData.schoolId}
            athletes={athletes}
            onClose={() => { setTrainingSection('hub'); loadDashboard(); }}
          />
        </View>
      )}
      {/* Training > Manage Seasons */}
      {trainingSection === 'seasons' && (
        <View style={styles.subScreen}>
          <ManageSeasons
            school={school}
            schoolId={userData.schoolId}
            groups={groups}
            onClose={() => { setTrainingSection('hub'); loadDashboard(); }}
            onSaved={(data) => {
              setSchool(prev => ({ ...prev, seasons: data.seasons }));
            }}
          />
        </View>
      )}
      {/* Training > Races */}
      {trainingSection === 'races' && (
        <View style={styles.subScreen}>
          <RaceManager
            schoolId={userData.schoolId}
            school={school}
            athletes={athletes}
            groups={groups}
            onClose={() => { setTrainingSection('hub'); loadDashboard(); }}
          />
        </View>
      )}
      {/* Training > Weekly Plans */}
      {(trainingSection === 'weekly' && !addFromDashboard) && (
        <View style={styles.subScreen}>
          <WeeklyPlanner
            schoolId={userData.schoolId}
            userData={userData}
            school={school}
            groups={groups}
            activeSeason={getActiveSeason(school)}
            onClose={() => { setTrainingSection('hub'); loadDashboard(); }}
          />
        </View>
      )}
      {/* Training > Calendar */}
      {(trainingSection === 'calendar' || addFromDashboard) && (
        <View style={styles.subScreen}>
          <CalendarScreen
            userData={userData} school={school}
            groups={groups}
            autoOpenAdd={addFromDashboard}
            prefillWorkout={pendingWorkout}
            onClose={() => { setTrainingSection(addFromDashboard ? null : 'hub'); setAddFromDashboard(false); setPendingWorkout(null); loadDashboard(); }}
          />
        </View>
      )}
      {feedVisible && (
        <View style={styles.subScreen}>
          <ChannelList userData={userData} school={school} groups={groups} athletes={athletes} onClose={() => { setFeedVisible(false); loadDashboard(); }} />
        </View>
      )}
      {zonesVisible && (
        <View style={styles.subScreen}>
          <ZoneSettings
            school={school}
            schoolId={userData.schoolId}
            onClose={() => setZonesVisible(false)}
            onSaved={(newBoundaries, newHrZonesDisabled) => {
              setTeamZoneSettings(prev => ({ ...prev, boundaries: newBoundaries, hrZonesDisabled: newHrZonesDisabled }));
              setZonesVisible(false);
              loadDashboard();
            }}
          />
        </View>
      )}
      {profileVisible && (
        <View style={styles.subScreen}>
          <CoachProfile
            userData={userData}
            school={school}
            pendingAthletes={pendingAthletes}
            onApproveAthlete={handleApproveAthlete}
            onDenyAthlete={handleDenyAthlete}
            onClose={() => { setProfileVisible(false); loadDashboard(); }}
            onUpdated={() => { setProfileVisible(false); loadDashboard(); }}
          />
        </View>
      )}
      {analyticsVisible && (
        <View style={styles.subScreen}>
          <CoachAnalytics
            athletes={athletes}
            athleteWeeklyMiles={athleteWeeklyMiles}
            athlete3WeekAvg={athlete3WeekAvg}
            athleteWeeklyBreakdown={athleteWeeklyBreakdown}
            athleteZonePct={athleteZonePct}
            athletePaceEasyPct={athletePaceEasyPct}
            overtTrainingAlerts={overtTrainingAlerts}
            athleteMiles={athleteMiles}
            groups={groups}
            school={school}
            schoolId={userData.schoolId}
            onClose={() => setAnalyticsVisible(false)}
          />
        </View>
      )}

      {/* ── Persistent bottom nav ── */}
      {seasonReviewVisible && seasonReviewSeason && (
        <View style={styles.subScreen}>
          <SeasonReview season={seasonReviewSeason} school={school} userData={userData} athletes={athletes} onClose={() => { setSeasonReviewVisible(false); setSeasonReviewSeason(null); }} />
        </View>
      )}

      <WorkoutDetailModal
        item={todayWorkoutDetail}
        visible={!!todayWorkoutDetail}
        onClose={() => setTodayWorkoutDetail(null)}
        primaryColor={primaryColor}
        groups={groups}
      />

      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => { setTrainingSection(null); setFeedVisible(false); setZonesVisible(false); setProfileVisible(false); setAnalyticsVisible(false); setAddFromDashboard(false); }}>
          <Ionicons name="home-outline" size={24} color={!trainingSection && !feedVisible && !zonesVisible && !profileVisible && !analyticsVisible && !addFromDashboard ? BRAND : NEUTRAL.muted} />
          <Text style={[styles.bottomNavLabel, !trainingSection && !feedVisible && !zonesVisible && !profileVisible && !analyticsVisible && !addFromDashboard && { color: BRAND }]}>Home</Text>
        </TouchableOpacity>
        {hasTrainingAccess && (
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => { setFeedVisible(false); setZonesVisible(false); setProfileVisible(false); setAnalyticsVisible(false); setAddFromDashboard(false); setTrainingSection('hub'); }}>
          <Ionicons name="calendar-outline" size={24} color={trainingSection || addFromDashboard ? BRAND : NEUTRAL.muted} />
          <Text style={[styles.bottomNavLabel, (trainingSection || addFromDashboard) && { color: BRAND }]}>Program</Text>
        </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => { setTrainingSection(null); setFeedVisible(false); setZonesVisible(false); setProfileVisible(false); setAddFromDashboard(false); setAnalyticsVisible(true); }}>
          <Ionicons name="analytics-outline" size={24} color={analyticsVisible ? BRAND : NEUTRAL.muted} />
          <Text style={[styles.bottomNavLabel, analyticsVisible && { color: BRAND }]}>Analytics</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => { setTrainingSection(null); setZonesVisible(false); setProfileVisible(false); setAnalyticsVisible(false); setAddFromDashboard(false); setFeedVisible(true); }}>
          <View>
            <Ionicons name="chatbubbles-outline" size={24} color={feedVisible ? BRAND : NEUTRAL.muted} />
            {unreadFeedCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadFeedCount > 99 ? '99+' : unreadFeedCount}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.bottomNavLabel, feedVisible && { color: BRAND }]}>Feed</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => { setTrainingSection(null); setFeedVisible(false); setZonesVisible(false); setAnalyticsVisible(false); setAddFromDashboard(false); setProfileVisible(true); }}>
          <View>
            <Ionicons name="person-outline" size={24} color={profileVisible ? BRAND : NEUTRAL.muted} />
            {(pendingAthletes.length + pendingCoachCount) > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{pendingAthletes.length + pendingCoachCount}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.bottomNavLabel, profileVisible && { color: BRAND }]}>Profile</Text>
        </TouchableOpacity>
      </View>

      {/* ── Daily Message Modal ── */}
      <Modal visible={tipModalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.tipModal}>
            <View style={styles.tipModalHeader}>
              <TouchableOpacity onPress={() => setTipModalVisible(false)}>
                <Text style={styles.tipModalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.tipModalTitle}>Daily message</Text>
              <View style={{ width: 60 }} />
            </View>
            <ScrollView style={styles.tipModalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.tipModalSubtitle}>
                This message will be pinned to every athlete's dashboard today.
              </Text>
              <TextInput
                style={styles.tipModalInput}
                value={tipText}
                onChangeText={setTipText}
                multiline
                autoFocus
                placeholder="Write your message to the team..."
                placeholderTextColor="#999"
              />
              <Text style={styles.tipModalHint}>
                💡 Auto-generated based on your current training phase. Make it your own.
              </Text>
              <TouchableOpacity
                style={[styles.tipSendBtn, { backgroundColor: tipText.trim() ? BRAND : NEUTRAL.input }]}
                onPress={handleSendTip}
                disabled={sendingTip || !tipText.trim()}
              >
                {sendingTip
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.tipSendBtnText}>Send to team →</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  groupSection:         { marginBottom: SPACE.lg },
  groupHeader:          { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: NEUTRAL.label, marginBottom: SPACE.sm, marginTop: SPACE.xs },
  groupFilterRow:       { flexDirection: 'row', marginBottom: SPACE.md, maxHeight: 36 },
  groupFilterBtn:       { borderRadius: RADIUS.sm, borderWidth: 1.5, borderColor: NEUTRAL.border, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, marginRight: SPACE.sm, backgroundColor: NEUTRAL.card },
  groupFilterBtnText:   { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: NEUTRAL.body },
  manageGroupsBtn:     { justifyContent: 'center', paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, marginRight: SPACE.sm },
  createGroupsBtn:     { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, backgroundColor: BRAND_LIGHT, borderRadius: RADIUS.md, padding: SPACE.md, marginBottom: SPACE.md },
  createGroupsBtnText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: BRAND },
  timeframeRow:         { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACE.md, marginBottom: 0 },
  shareBtn:             { borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: BRAND, paddingHorizontal: SPACE.lg - 2, paddingVertical: SPACE.md, backgroundColor: NEUTRAL.card },
  shareBtnText:         { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: BRAND },
  container:            { flex: 1, backgroundColor: NEUTRAL.bg },
  loading:              { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:               { backgroundColor: NEUTRAL.card, paddingTop: Platform.OS === 'ios' ? SPACE['5xl'] : SPACE['3xl'], paddingBottom: SPACE.md, paddingHorizontal: SPACE.xl, borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
  headerRow:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greeting:             { fontSize: FONT_SIZE.xl - 2, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  schoolName:           { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, marginTop: 1 },
  headerRight:          { alignItems: 'flex-end' },
  headerRightText:      { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, fontWeight: FONT_WEIGHT.semibold },
  headerAlertText:      { fontSize: FONT_SIZE.xs, color: STATUS.error, fontWeight: FONT_WEIGHT.bold, marginTop: 2 },
  headerInjuryText:     { fontSize: FONT_SIZE.xs, color: STATUS.warning, fontWeight: FONT_WEIGHT.bold, marginTop: 2 },
  profileBtn:           { paddingVertical: SPACE.sm, paddingHorizontal: SPACE.md, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: RADIUS.sm },
  profileBtnText:       { color: '#fff', fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  headerStats:          { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg - 2 },
  headerStat:           { alignItems: 'center' },
  headerStatNum:        { fontSize: FONT_SIZE.xl - 2, fontWeight: FONT_WEIGHT.bold, color: '#fff' },
  headerStatLabel:      { fontSize: FONT_SIZE.xs, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  alertStatBox:         { backgroundColor: 'rgba(239,68,68,0.3)', borderRadius: RADIUS.sm, paddingHorizontal: SPACE.sm, paddingVertical: SPACE.xs },
  alertStatNum:         { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: '#fff' },
  alertStatLabel:       { fontSize: 10, color: 'rgba(255,255,255,0.9)', marginTop: 1 },
  tabs:                 { flexDirection: 'row', backgroundColor: NEUTRAL.card, borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
  tab:                  { flex: 1, paddingVertical: SPACE.lg - 2, alignItems: 'center' },
  tabActive:            { borderBottomWidth: 2, borderBottomColor: BRAND },
  tabText:              { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: NEUTRAL.muted },
  scroll:               { flex: 1 },
  msgRow:               { paddingHorizontal: SPACE.lg, marginTop: SPACE.md, marginBottom: SPACE.xs },
  msgBtn:               { backgroundColor: BRAND_LIGHT, borderRadius: RADIUS.md, paddingVertical: SPACE.md, paddingHorizontal: SPACE.lg - 2, alignItems: 'center' },
  msgBtnText:           { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND },
  section:              { padding: SPACE.lg },
  genderRow:            { flexDirection: 'row', gap: SPACE.sm, marginBottom: SPACE.md },
  genderBtn:            { flex: 1, borderRadius: RADIUS.md, paddingVertical: SPACE.md, alignItems: 'center', backgroundColor: NEUTRAL.card, borderWidth: 1.5, borderColor: NEUTRAL.border },
  genderBtnText:        { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: NEUTRAL.body },
  emptyCard:            { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.xl, alignItems: 'center', gap: SPACE.md, ...SHADOW.sm },
  emptyText:            { color: NEUTRAL.muted, fontSize: FONT_SIZE.sm, textAlign: 'center' },
  emptySubText:         { color: NEUTRAL.muted, fontSize: FONT_SIZE.sm },
  athleteCard:          { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.md, marginBottom: SPACE.sm, ...SHADOW.sm },
  athleteCardAlert:     { borderWidth: 1.5, borderColor: STATUS.error, backgroundColor: STATUS.errorBg },
  athleteCardTop:       { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  athleteCardStats:     { flexDirection: 'row', gap: SPACE.md, paddingTop: SPACE.md, borderTopWidth: 1, borderTopColor: NEUTRAL.bg },
  athleteStatChip:      { flex: 1, backgroundColor: NEUTRAL.bg, borderRadius: RADIUS.sm, padding: SPACE.sm },
  athleteStatChipLabel: { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginBottom: 2 },
  athleteStatChipVal:   { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  statValRed:           { color: STATUS.error },
  statFlagRed:          { fontSize: FONT_SIZE.xs, color: STATUS.error, fontWeight: FONT_WEIGHT.semibold, marginTop: 2 },
  rankNum:              { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: NEUTRAL.muted, width: 24 },
  avatar:               { width: 38, height: 38, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
  paceDot:              { position: 'absolute', bottom: -1, right: -1, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: NEUTRAL.card },
  avatarText:           { color: '#fff', fontWeight: FONT_WEIGHT.bold, fontSize: FONT_SIZE.sm },
  athleteInfo:          { flex: 1 },
  athleteNameRow:       { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  athleteName:          { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  injuryBadge:          { fontSize: 14 },
  athleteSub:           { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: 2 },
  alertText:            { fontSize: FONT_SIZE.xs, color: STATUS.error, marginTop: 2, fontWeight: FONT_WEIGHT.semibold },
  milesBox:             { alignItems: 'center' },
  milesNum:             { fontSize: FONT_SIZE.xl - 2, fontWeight: FONT_WEIGHT.bold },
  milesLabel:           { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted },
  chevron:              { fontSize: 22, color: NEUTRAL.input },
  injuryAlertCard:      { marginHorizontal: SPACE.lg, marginTop: SPACE.md, backgroundColor: STATUS.errorBg, borderRadius: RADIUS.lg, padding: SPACE.lg, borderWidth: 1.5, borderColor: STATUS.error + '40' },
  injuryAlertHeader:    { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  injuryAlertTitle:     { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: STATUS.error, flex: 1 },
  injuryAlertRow:       { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.md, borderTopWidth: 1, borderTopColor: STATUS.error + '20' },
  injuryAlertName:      { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  injuryAlertDetail:    { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, marginTop: 2 },
  injuryAlertRec:       { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, marginTop: SPACE.xs },
  injuryAlertWhen:      { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium, color: NEUTRAL.body },
  alertSection:         { marginTop: SPACE.sm },
  alertSectionTitle:    { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: STATUS.error, marginBottom: SPACE.md },
  alertCard:            { backgroundColor: STATUS.errorBg, borderRadius: RADIUS.lg, padding: SPACE.lg - 2, marginBottom: SPACE.md, borderLeftWidth: 4, borderLeftColor: STATUS.error },
  alertAthleteName:     { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: SPACE.sm },
  alertSignal:          { fontSize: FONT_SIZE.sm, color: STATUS.error, marginBottom: 3 },
  alertRec:             { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, marginTop: SPACE.sm, fontStyle: 'italic' },
  paceSetupNote:        { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginHorizontal: SPACE.lg, marginTop: SPACE.md, paddingVertical: SPACE.sm, paddingHorizontal: SPACE.md, backgroundColor: '#fff8e1', borderRadius: RADIUS.md },
  paceSetupNoteText:    { fontSize: FONT_SIZE.sm, color: STATUS.warning, fontWeight: FONT_WEIGHT.medium },
  complianceCard:       { marginHorizontal: SPACE.lg, marginTop: SPACE.md, backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg, borderWidth: 1.5, borderColor: NEUTRAL.border, ...SHADOW.sm },
  complianceHeader:     { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  complianceTitle:      { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, flex: 1 },
  complianceGroupLabel: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, marginBottom: SPACE.xs, letterSpacing: 0.5 },
  complianceRow:        { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingVertical: SPACE.xs + 2 },
  complianceRowName:    { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: BRAND_DARK },
  complianceWeeks:      { flexDirection: 'row', gap: SPACE.sm },
  complianceWeekVal:    { fontSize: FONT_SIZE.xs, color: STATUS.success, fontWeight: FONT_WEIGHT.semibold, minWidth: 40, textAlign: 'right' },
  complianceUnder:      { color: STATUS.error },
  complianceOver:       { color: STATUS.warning },
  complianceTarget:     { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, minWidth: 40, textAlign: 'right' },
  pulseRow:             { flexDirection: 'row', marginHorizontal: SPACE.lg, marginTop: SPACE.md, gap: SPACE.sm },
  pulseCard:            { flex: 1, backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.md, alignItems: 'center', borderWidth: 1, borderColor: NEUTRAL.border, ...SHADOW.sm },
  pulseValue:           { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  pulseLabel:           { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: 2 },
  groupMilesRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginTop: SPACE.sm },
  groupMilesChip:       { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, backgroundColor: NEUTRAL.bg, borderRadius: RADIUS.sm, paddingHorizontal: SPACE.sm, paddingVertical: 3, overflow: 'hidden' },
  todaySection:         { marginBottom: SPACE.sm },
  todayLabel:           { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, color: NEUTRAL.muted, letterSpacing: 1, marginBottom: SPACE.sm },
  todayCard:            { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, paddingVertical: SPACE.md, paddingHorizontal: SPACE.lg - 2, borderLeftWidth: 4, marginBottom: SPACE.xs, ...SHADOW.sm },
  todayCardRow:         { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  todayCardMiles:       { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, fontWeight: FONT_WEIGHT.semibold },
  todayCardDesc:        { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: 2 },
  upcomingSection:      { marginBottom: SPACE.lg },
  upcomingHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.md },
  upcomingSectionTitle: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  typeBadge:            { alignSelf: 'flex-start', borderRadius: RADIUS.sm, paddingHorizontal: SPACE.md, paddingVertical: 5, marginBottom: SPACE.sm },
  typeBadgeText:        { color: '#fff', fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold },
  trainingCard:         { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg - 2, marginBottom: SPACE.md, flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md, ...SHADOW.sm },
  trainingInfo:         { flex: 1 },
  trainingTitle:        { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  trainingDesc:         { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, marginTop: 2 },
  trainingNotes:        { fontSize: FONT_SIZE.sm, color: NEUTRAL.muted, marginTop: SPACE.xs, fontStyle: 'italic' },
  trainingDate:         { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: SPACE.xs },
  pendingCard:          { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg - 2, marginBottom: SPACE.md, gap: SPACE.md },
  minorTag:             { fontSize: FONT_SIZE.xs, color: STATUS.warning, marginTop: SPACE.xs, fontWeight: FONT_WEIGHT.semibold },
  approvalBtns:         { flexDirection: 'row', gap: SPACE.sm },
  approveBtn:           { flex: 1, borderRadius: RADIUS.sm, padding: SPACE.md, alignItems: 'center' },
  approveBtnText:       { color: '#fff', fontWeight: FONT_WEIGHT.bold },
  denyBtn:              { flex: 1, borderRadius: RADIUS.sm, padding: SPACE.md, alignItems: 'center', backgroundColor: STATUS.errorBg },
  denyBtnText:          { color: STATUS.error, fontWeight: FONT_WEIGHT.bold },
  subScreen:            { position: 'absolute', top: 0, left: 0, right: 0, bottom: Platform.OS === 'ios' ? 82 : 56, backgroundColor: NEUTRAL.bg, zIndex: 10 },
  bottomNav:            { flexDirection: 'row', backgroundColor: NEUTRAL.card, borderTopWidth: 1, borderTopColor: NEUTRAL.border, paddingBottom: Platform.OS === 'ios' ? SPACE['2xl'] : SPACE.sm, paddingTop: SPACE.md, ...SHADOW.sm, zIndex: 20 },
  bottomNavBtn:         { flex: 1, alignItems: 'center', gap: 2 },
  bottomNavLabel:       { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, fontWeight: FONT_WEIGHT.medium },
  badge:                { position: 'absolute', top: -4, right: -8, backgroundColor: STATUS.error, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText:            { color: '#fff', fontSize: 10, fontWeight: FONT_WEIGHT.bold },
  tipModal:             { flex: 1, backgroundColor: NEUTRAL.bg },
  tipModalHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACE.xl, paddingTop: 60, backgroundColor: NEUTRAL.card, borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
  tipModalTitle:        { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  tipModalCancel:       { color: STATUS.error, fontSize: FONT_SIZE.md, width: 60 },
  tipModalBody:         { padding: SPACE.xl },
  tipModalSubtitle:     { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, lineHeight: 20, marginBottom: SPACE.lg },
  tipModalInput:        { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg, fontSize: FONT_SIZE.md, color: BRAND_DARK, borderWidth: 1, borderColor: NEUTRAL.input, minHeight: 180, textAlignVertical: 'top', lineHeight: 24, marginBottom: SPACE.md },
  tipModalHint:         { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginBottom: SPACE['2xl'], lineHeight: 18 },
  tipSendBtn:           { borderRadius: RADIUS.lg, padding: SPACE.lg + 2, alignItems: 'center', marginBottom: SPACE['4xl'] },
  tipSendBtnText:       { color: '#fff', fontSize: 17, fontWeight: FONT_WEIGHT.bold },
});