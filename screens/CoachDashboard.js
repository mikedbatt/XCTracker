import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { LinearGradient } from 'expo-linear-gradient';
import { signOut } from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc, getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import { Suspense, useCallback, useEffect, useState } from 'react';
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
import { bottomInset } from '../utils/safeArea';
import { SIGNAL } from '../constants/design';
import AthleteDetailScreen from '../screens/AthleteDetailScreen';
import AttendanceScreen from '../screens/AttendanceScreen';
import CrossTrainingSettings from '../screens/CrossTrainingSettings';
import CoachProfile from '../screens/CoachProfile';
import CalendarScreen from '../screens/CalendarScreen';
import { SIGNAL_TYPE_COLORS } from '../constants/training';
import ManageGroups from '../screens/ManageGroups';
import ManageRoster from '../screens/ManageRoster';
import ManageSeasons from '../screens/ManageSeasons';
import RaceManager from '../screens/RaceManager';
import { getActiveSeason, getPhaseForSeason, getCompletedSeasons } from '../screens/SeasonPlanner';
import WeeklyPlanner from '../screens/WeeklyPlanner';
import WeeklyCheckinHistory from '../screens/WeeklyCheckinHistory';
import { confirmDestructive } from '../utils/confirmDialog';
import ChannelList from '../screens/ChannelList';
import TimeframePicker, { TIMEFRAMES, getDateRange } from '../screens/TimeframePicker';
import TrainingHub from '../screens/TrainingHub';
import WorkoutDetailModal from '../screens/WorkoutDetailModal';
import { ACWR_STATUS, calcACWR } from '../utils/acwrUtils';
import { batchDocsByIds } from '../utils/batchDocsByIds';
import { aggregateMiles, isCrossTraining, DEFAULT_CT_FACTORS } from '../utils/activityMiles';
import { computeVolumeCompliance, getCurrentWeekPace, getAthleteWeeklyTarget } from '../utils/complianceUtils';
import { computeOvertraining } from '../utils/overtrainingUtils';
import { calcPaceZoneBreakdown, calcPace8020 } from '../utils/vdotUtils';
import { useStaleRefresh } from '../hooks/useStaleRefresh';
import { getRunDate, toLocalISODate } from '../utils/dateUtils';
import { getWeekAnchor } from '../utils/weeklyCheckinUtils';
import { lazyWithReload } from '../utils/lazyWithReload';

// Lazy-loaded (heavy, opened on demand) — kept out of the initial bundle.
const CoachAnalytics = lazyWithReload(() => import('../screens/CoachAnalytics'));
const SeasonReview   = lazyWithReload(() => import('../screens/SeasonReview'));

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
    "This is the phase where most runners get hurt by doing too much. Keep your easy days truly easy — stay in your easy pace zone.",
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
async function checkOvertraining(athleteId, attendanceStats = null) {
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
    const checkins = checkinSnap.docs.map(d => d.data());
    // Shared with the athlete screens so signals are identical everywhere.
    const { alert, signals, latestInjury, latestIllness, latestCheckinDate } =
      computeOvertraining({ runs: allRuns, checkins, attendanceStats, now });
    return { alert, signals, todayInjury: latestInjury, todayIllness: latestIllness, injuryCheckinDate: latestCheckinDate };
  } catch { return { alert: false, signals: [], todayInjury: null, todayIllness: null, injuryCheckinDate: null }; }
}

// ── Pace easy % helper — uses VDOT training paces ────────────────────────────
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
  const [athleteACWR,         setAthleteACWR]         = useState({});
  const [athleteAttendance,   setAthleteAttendance]   = useState({});
  const [athletePaceEasyPct,  setAthletePaceEasyPct]  = useState({});
  const [pendingAthletes,     setPendingAthletes]     = useState([]);
  const [pendingCoachCount,   setPendingCoachCount]   = useState(0);
  const [unreadFeedCount,     setUnreadFeedCount]     = useState(0);
  const [trainingItems,       setTrainingItems]       = useState([]);
  const [activeTab,           setActiveTab]           = useState('team');
  const [profileVisible,      setProfileVisible]      = useState(false);
  const [groups,              setGroups]              = useState([]);
  const [groupFilter,         setGroupFilter]         = useState('all');
  const [trainingSection,     setTrainingSection]     = useState(null); // null | 'hub' | 'groups' | 'roster' | 'seasons' | 'weekly' | 'calendar' | 'races'
  // Bottom nav height is measured at runtime so the sub-screen overlay sits
  // exactly on top of it (no sliver of the underlying dashboard showing
  // through). Initial value is a sensible iOS fallback used only for the
  // first frame before onLayout fires.
  const [navHeight,           setNavHeight]           = useState(Platform.OS === 'ios' ? 82 : 56);
  const [nextMeet,            setNextMeet]            = useState(null);
  const [addFromDashboard,    setAddFromDashboard]    = useState(false);
  const [pendingWorkout,      setPendingWorkout]      = useState(null);
  const [selectedAthlete,     setSelectedAthlete]     = useState(null);
  const [athleteRunMiles,     setAthleteRunMiles]     = useState({}); // running-only (leaderboard toggle)
  const [leaderboardCT,       setLeaderboardCT]       = useState(true);
  const [activeOverrides,     setActiveOverrides]     = useState({}); // athleteId → active workout override
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
  const [acwrExpanded,        setAcwrExpanded]        = useState(false);
  const [paceComplianceData, setPaceComplianceData] = useState({ runningEasy: [], tooHard: [], noPaces: 0, noPacesAthletes: [] });
  const [weeklyCheckins,      setWeeklyCheckins]      = useState({}); // athleteId → checkin doc (this week only)
  const [weeklyCardExpanded,  setWeeklyCardExpanded]  = useState(false);
  const [weeklyReplyAthleteId, setWeeklyReplyAthleteId] = useState(null); // athlete whose row is expanded for reply
  const [weeklyReplyText,     setWeeklyReplyText]     = useState('');
  const [weeklySendingReply,  setWeeklySendingReply]  = useState(false);
  const [weeklyHistoryAthlete, setWeeklyHistoryAthlete] = useState(null); // athlete object whose history is open

  // Load reviewed seasons from Firestore on mount
  useEffect(() => {
    (async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDoc.exists() && userDoc.data().reviewedSeasons) {
          setReviewDismissed(userDoc.data().reviewedSeasons);
        }
      } catch (e) { console.warn('Load reviewed seasons:', e); }
    })();
  }, []);

  const loadDashboard = useCallback(async () => {
    if (!userData.schoolId) return;

    try {
      const isAdmin = userData.role === 'admin_coach';
      const now = new Date();
      const dayOfWeek = now.getDay();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      weekStart.setHours(0, 0, 0, 0);
      const todayKey = now.toISOString().split('T')[0];
      const thirtyDaysAgoKey = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0];

      // ── Phase 1: All independent top-level queries in parallel ──
      const [
        schoolDoc,
        groupsSnap,
        approvedSnap,
        pendingSnap,
        freshUserDoc,
        postsSnap,
        trainingEventsSnap,
        trainingEventsFallbackSnap,
        meetsSnap,
        tipDoc,
        checkinSnap,
        attendanceSnap,
        weeklyCheckinsSnap,
      ] = await Promise.all([
        getDoc(doc(db, 'schools', userData.schoolId)),
        getDocs(query(collection(db, 'groups'), where('schoolId', '==', userData.schoolId)))
          .catch(e => { console.warn('Failed to load groups:', e); return null; }),
        getDocs(query(
          collection(db, 'users'),
          where('schoolId', '==', userData.schoolId),
          where('role', '==', 'athlete'),
          where('status', '==', 'approved')
        )),
        isAdmin
          ? getDocs(query(
              collection(db, 'users'),
              where('schoolId', '==', userData.schoolId),
              where('role', '==', 'athlete'),
              where('status', '==', 'pending')
            )).catch(() => null)
          : Promise.resolve(null),
        getDoc(doc(db, 'users', auth.currentUser.uid)).catch(() => null),
        getDocs(query(collection(db, 'teamPosts'), where('schoolId', '==', userData.schoolId)))
          .catch(e => { console.warn('Unread feed count failed:', e); return null; }),
        getDocs(query(
          collection(db, 'events'),
          where('schoolId', '==', userData.schoolId),
          where('category', '==', 'Training'),
          orderBy('date', 'asc')
        )).catch(() => null),
        getDocs(query(
          collection(db, 'events'),
          where('schoolId', '==', userData.schoolId),
          orderBy('date', 'asc')
        )).catch(() => null),
        getDocs(query(collection(db, 'raceMeets'), where('schoolId', '==', userData.schoolId)))
          .catch(() => null),
        getDoc(doc(db, 'dailyMessages', `${userData.schoolId}_${todayKey}`))
          .catch(e => { console.warn('Failed to check daily tip status:', e); return null; }),
        getDocs(query(
          collection(db, 'checkins'),
          where('schoolId', '==', userData.schoolId),
          where('date', '>=', weekStart)
        )).catch(e => { console.warn('Team pulse check-in query failed:', e); return null; }),
        getDocs(query(
          collection(db, 'attendance'),
          where('schoolId', '==', userData.schoolId),
          where('date', '>=', thirtyDaysAgoKey)
        )).catch(e => { console.warn('Attendance query failed:', e); return null; }),
        // Weekly check-ins are head-coach only; assistant coaches skip this query
        // so they don't hit a permission-denied warning.
        isAdmin
          ? getDocs(query(
              collection(db, 'weeklyCheckins'),
              where('schoolId', '==', userData.schoolId)
            )).catch(e => { console.warn('Weekly check-ins query failed:', e); return null; })
          : Promise.resolve(null),
      ]);

      // School + zone + groups
      const schoolData = schoolDoc.exists() ? schoolDoc.data() : null;
      if (schoolData) setSchool(schoolData);

      // Weekly check-ins for the current week (Sat 12:00 → Mon 12:00 in school TZ).
      // Map athleteId → checkin doc so the triage card can show "received" + "missing" sections.
      if (weeklyCheckinsSnap) {
        const tz = schoolData?.timezone || 'America/New_York';
        const currentAnchor = getWeekAnchor(new Date(), tz);
        const thisWeek = {};
        weeklyCheckinsSnap.docs.forEach(d => {
          const data = d.data();
          if (data.weekStartISO === currentAnchor && data.userId) {
            thisWeek[data.userId] = { id: d.id, ...data };
          }
        });
        setWeeklyCheckins(thisWeek);
      }

      let loadedGroups = [];
      if (groupsSnap) {
        loadedGroups = groupsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        loadedGroups.sort((a, b) => (a.order || 0) - (b.order || 0));
        setGroups(loadedGroups);
      }

      const activeSeason = schoolData ? getActiveSeason(schoolData) : null;
      setActiveSeasonData(activeSeason);
      const { start: cutoff, end: cutoffEnd } = getDateRange(selectedTimeframe, activeSeason, null, null);

      const approvedAthletes = approvedSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAthletes(approvedAthletes);

      if (isAdmin) {
        if (pendingSnap) {
          setPendingAthletes(pendingSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
        const pendingCoachIds = schoolData?.pendingCoachIds || [];
        setPendingCoachCount(pendingCoachIds.length);
      }

      if (tipDoc) setTodayTipSent(tipDoc.exists());

      // ── Build per-athlete attendance stats ──
      // Rate = present / recorded-days (NOT calendar days — a day with no
      // attendance record is not a data point, so coach isn't penalized for
      // non-practice days and athlete isn't penalized for un-recorded days).
      // Recent (last 14 days) drives the absence signal for overtraining.
      const attendanceByAthlete = {};
      const twoWeeksAgoKey = new Date(now.getTime() - 14 * 86400000).toISOString().split('T')[0];
      if (attendanceSnap) {
        const allRecords = attendanceSnap.docs.map(d => d.data());
        approvedAthletes.forEach(a => {
          const theirs = allRecords.filter(r => r.athleteId === a.id);
          const present = theirs.filter(r => r.status === 'present').length;
          const absent  = theirs.filter(r => r.status === 'absent').length;
          const excused = theirs.filter(r => r.status === 'excused').length;
          const recent  = theirs.filter(r => r.date >= twoWeeksAgoKey);
          const recentAbsent = recent.filter(r => r.status === 'absent').length;
          attendanceByAthlete[a.id] = {
            totalRecorded:     theirs.length,
            presentCount:      present,
            absentCount:       absent,
            excusedCount:      excused,
            attendanceRate:    theirs.length > 0 ? present / theirs.length : null,
            recentRecorded:    recent.length,
            recentAbsentCount: recentAbsent,
            recentAbsenceRate: recent.length > 0 ? recentAbsent / recent.length : 0,
          };
        });
      }
      setAthleteAttendance(attendanceByAthlete);

      // ── Phase 2: Athlete-dependent queries in parallel ──
      // Single batched `where-in` query for all athlete runs replaces the old
      // serial per-athlete loop (70 athletes × 1 query → ~3 batched queries).
      const athleteIds = approvedAthletes.map(a => a.id);
      const [runsResult, alertsEntries] = await Promise.all([
        batchDocsByIds({ collectionName: 'runs', field: 'userId', ids: athleteIds }),
        Promise.all(approvedAthletes.map(a =>
          checkOvertraining(a.id, attendanceByAthlete[a.id]).then(result => [a.id, result])
        )),
      ]);

      setOvertTrainingAlerts(Object.fromEntries(alertsEntries));

      // Active workout overrides (coach injury modifications), keyed by athlete.
      let overrideMap = {};
      try {
        const todayISO = toLocalISODate(new Date());
        const ovSnap = await getDocs(query(collection(db, 'workoutOverrides'), where('schoolId', '==', userData.schoolId)));
        ovSnap.docs.forEach(d => {
          const o = d.data();
          if (o.endDate && o.endDate >= todayISO) overrideMap[o.athleteId] = o;
        });
        setActiveOverrides(overrideMap);
      } catch (e) { console.warn('Load overrides:', e); }

      // ── Phase 3: Process athlete run data client-side (no network) ──
      const runsByAthlete = runsResult.byField;

      const milesMap         = {};   // with cross-training credit
      const runMilesMap      = {};   // running only (leaderboard "Runs only" toggle)
      const weeklyMilesMap   = {};
      const threeWeekAvgMap  = {};
      const weekBreakdownMap = {};
      const paceEasyPctMap   = {};
      const lastRunDateMap   = {};
      const acwrMap          = {};
      const factors = schoolData?.crossTrainingFactors || DEFAULT_CT_FACTORS;
      const weekMiles = (runs) => aggregateMiles(runs, factors).totalMiles; // with-CT

      for (const athlete of approvedAthletes) {
        try {
          // Sort desc by date (batch `in` query doesn't preserve order)
          const allRuns = (runsByAthlete[athlete.id] || [])
            .slice()
            .sort((a, b) => (getRunDate(b) || 0) - (getRunDate(a) || 0));

          // Track most recent run date for inactive detection
          if (allRuns.length > 0) {
            const d = getRunDate(allRuns[0]);
            if (d) lastRunDateMap[athlete.id] = d;
          }

          // Timeframe filter for period miles
          const filtered = allRuns.filter(r => {
            const d = getRunDate(r);
            if (!d) return false;
            if (cutoff && d < cutoff) return false;
            if (cutoffEnd && d > cutoffEnd) return false;
            return true;
          });
          const filteredAgg = aggregateMiles(filtered, factors);
          milesMap[athlete.id]    = filteredAgg.totalMiles;       // with cross-training credit
          runMilesMap[athlete.id] = filteredAgg.runningMiles;     // running only

          // Current week miles
          const weekFiltered = allRuns.filter(r => {
            const d = getRunDate(r);
            return d && d >= weekStart;
          });
          weeklyMilesMap[athlete.id] = weekMiles(weekFiltered);

          // 3-week average weekly miles
          const week1Start = new Date(weekStart); // current week (incomplete)
          const week2Start = new Date(weekStart); week2Start.setDate(week2Start.getDate() - 7);
          const week3Start = new Date(weekStart); week3Start.setDate(week3Start.getDate() - 14);
          const week4Start = new Date(weekStart); week4Start.setDate(week4Start.getDate() - 21);

          // Weekly sums count cross-training credit (per the compliance decision).
          const w1 = weekMiles(allRuns.filter(r => { const d = getRunDate(r); return d && d >= week1Start; }));
          const w2 = weekMiles(allRuns.filter(r => { const d = getRunDate(r); return d && d >= week2Start && d < week1Start; }));
          const w3 = weekMiles(allRuns.filter(r => { const d = getRunDate(r); return d && d >= week3Start && d < week2Start; }));
          const w4 = weekMiles(allRuns.filter(r => { const d = getRunDate(r); return d && d >= week4Start && d < week3Start; }));

          threeWeekAvgMap[athlete.id] = Math.round(((w1 + w2 + w3) / 3) * 10) / 10;
          // Store last 3 COMPLETED weeks (skip current incomplete week)
          weekBreakdownMap[athlete.id] = {
            w1: Math.round(w2 * 10) / 10, // last week
            w2: Math.round(w3 * 10) / 10, // 2 weeks ago
            w3: Math.round(w4 * 10) / 10, // 3 weeks ago
          };

          try {
            // Pace + ACWR (training load) are RUNNING-only — exclude cross-training.
            const runningRuns = allRuns.filter(r => !isCrossTraining(r));
            const thirtyDaysAgo = new Date(now - 30 * 86400000);
            const recentRuns = runningRuns.filter(r => {
              const d = getRunDate(r);
              return d && d >= thirtyDaysAgo;
            });
            paceEasyPctMap[athlete.id] = calcAthletePaceEasyPct(recentRuns, athlete.trainingPaces);
            acwrMap[athlete.id] = calcACWR(runningRuns, now);
          } catch (e) { console.warn('Pace easy %% calc failed for athlete:', e); }

        } catch (e) {
          console.warn('Athlete data error:', e);
          milesMap[athlete.id]        = 0;
          runMilesMap[athlete.id]     = 0;
          weeklyMilesMap[athlete.id]  = 0;
          threeWeekAvgMap[athlete.id] = 0;
        }
      }

      setAthleteMiles(milesMap);
      setAthleteRunMiles(runMilesMap);
      setAthleteWeeklyMiles(weeklyMilesMap);
      setAthlete3WeekAvg(threeWeekAvgMap);
      setAthleteWeeklyBreakdown(weekBreakdownMap);
      setAthletePaceEasyPct(paceEasyPctMap);
      setAthleteLastRunDate(lastRunDateMap);
      setAthleteACWR(acwrMap);

      // Compliance computation. An athlete on a coach 'rest' modification isn't
      // "under target" — pull them out of the under-target flag (cross-training
      // overrides already count toward volume via earned credit miles).
      const compliance = computeVolumeCompliance(approvedAthletes, loadedGroups, threeWeekAvgMap, weekBreakdownMap);
      const restIds = new Set(Object.values(overrideMap).filter(o => o.type === 'rest').map(o => o.athleteId));
      if (restIds.size && compliance.underTarget) {
        compliance.underTarget = compliance.underTarget.filter(a => !restIds.has(a.id));
      }
      setComplianceData(compliance);

      // Pace compliance computation
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

      // Team Pulse
      const threeDaysAgo = new Date(now - 3 * 86400000);
      if (checkinSnap) {
        const checkinsByAthlete = {};
        let moodSum = 0;
        let moodCount = 0;
        checkinSnap.docs.forEach(d => {
          const data = d.data();
          checkinsByAthlete[data.userId] = true;
          if (data.mood) { moodSum += data.mood; moodCount++; }
        });
        setTeamPulse({
          checkinCount: Object.keys(checkinsByAthlete).length,
          totalAthletes: approvedAthletes.length,
          teamAvgMood: moodCount > 0 ? Math.round((moodSum / moodCount) * 10) / 10 : null,
          inactiveCount: approvedAthletes.filter(a => !lastRunDateMap[a.id] || lastRunDateMap[a.id] < threeDaysAgo).length,
        });
      } else {
        setTeamPulse({
          checkinCount: 0,
          totalAthletes: approvedAthletes.length,
          teamAvgMood: null,
          inactiveCount: approvedAthletes.filter(a => !lastRunDateMap[a.id] || lastRunDateMap[a.id] < threeDaysAgo).length,
        });
      }

      // Unread feed count
      if (postsSnap && freshUserDoc && freshUserDoc.exists()) {
        const lastSeenChannels = freshUserDoc.data()?.lastSeenChannels || {};
        if (!lastSeenChannels.whole_team && freshUserDoc.data()?.lastSeenFeed) {
          lastSeenChannels.whole_team = freshUserDoc.data().lastSeenFeed;
        }
        const myChannelKeys = new Set(['whole_team', 'boys', 'girls', 'parents', 'coaches']);
        loadedGroups.forEach(g => myChannelKeys.add(`group_${g.id}`));

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
      } else {
        setUnreadFeedCount(0);
      }

      // Training events (prefer indexed query; fall back to post-filter if index missing)
      if (trainingEventsSnap) {
        setTrainingItems(trainingEventsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } else if (trainingEventsFallbackSnap) {
        setTrainingItems(trainingEventsFallbackSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => i.category === 'Training'));
      }

      // Next meet
      if (meetsSnap) {
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
      } else {
        setNextMeet(null);
      }
    } catch (error) { console.error('Coach dashboard error:', error); }
  }, [selectedTimeframe, userData.schoolId, userData.role]);

  // Stale-while-revalidate: first load shows the full-screen spinner; subsequent
  // loads (timeframe change) keep cached data visible and surface a small inline
  // "Updating…" indicator in the leaderboard section instead.
  const { loading, refreshing } = useStaleRefresh(loadDashboard, [selectedTimeframe, userData.schoolId]);

  // ── Share leaderboard ────────────────────────────────────────────────────
  const handleShareLeaderboard = async () => {
    // Share the version the coach is currently viewing (with or without
    // cross-training), not always the total.
    const shareMiles = leaderboardCT ? athleteMiles : athleteRunMiles;
    const sorted = [...filteredAthletes]
      .sort((a, b) => (shareMiles[b.id] || 0) - (shareMiles[a.id] || 0));

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
          const miles = Number(shareMiles[a.id] || 0).toFixed(2);
          lines.push(`${i + 1}. ${a.firstName} ${a.lastName} — ${miles} mi`);
        });
      });
    } else {
      lines = sorted.map((a, i) => {
        const miles = Number(shareMiles[a.id] || 0).toFixed(2);
        return `${i + 1}. ${a.firstName} ${a.lastName} — ${miles} mi`;
      });
    }

    const milesLabel = hasTeamXT ? (leaderboardCT ? ' (incl. cross-training)' : ' (running only)') : '';
    const message = [
      `${school?.name || 'Team'} Leaderboard${groupName ? ' — ' + groupName : ''} — ${period}${milesLabel}`,
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
    confirmDestructive({
      title: 'Deny?',
      message: `Deny ${athlete.firstName}'s request?`,
      confirmLabel: 'Deny',
      onConfirm: async () => {
        await updateDoc(doc(db, 'users', athlete.id), { status: 'denied', schoolId: null });
        await updateDoc(doc(db, 'schools', userData.schoolId), { pendingAthleteIds: arrayRemove(athlete.id) });
        loadDashboard();
      },
    });
  };

  const handleSignOut = () => {
    confirmDestructive({
      title: 'Sign out',
      message: 'Are you sure?',
      confirmLabel: 'Sign out',
      onConfirm: async () => {
        try {
          await SecureStore.deleteItemAsync('xctracker_email');
          await SecureStore.deleteItemAsync('xctracker_password');
        } catch (e) { /* SecureStore unavailable on web — Firebase persistence handles auth */ }
        signOut(auth);
      },
    });
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

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={SIGNAL.color.indigo} /></View>;

  const primaryColor  = SIGNAL.color.indigo;
  const isAdmin       = userData.role === 'admin_coach';
  const hasTrainingAccess = isAdmin || userData.trainingAccess === true;
  const today         = toLocalISODate(new Date());
  const todayItems    = trainingItems.filter(item => toLocalISODate(item.date?.toDate?.()) === today);
  const upcomingItems = trainingItems.filter(item => toLocalISODate(item.date?.toDate?.()) > today).slice(0, 7);
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

  // Leaderboard miles: with cross-training credit, or running-only when toggled.
  const leaderMiles = leaderboardCT ? athleteMiles : athleteRunMiles;
  const hasTeamXT = filteredAthletes.some(a => (athleteMiles[a.id] || 0) !== (athleteRunMiles[a.id] || 0));

  const teamWeeklyMiles = Math.round(
    filteredAthletes.reduce((s, a) => s + (athleteWeeklyMiles[a.id] || 0), 0) * 10
  ) / 10;
  const teamPeriodMiles = Math.round(
    filteredAthletes.reduce((s, a) => s + (athleteMiles[a.id] || 0), 0) * 10
  ) / 10;

  // ── Today's date string for eyebrow label ──
  const todayLabel = (() => {
    const d = new Date();
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  })();

  // ── Format last-run summary line for an athlete card ──
  const formatLastRun = (athleteId) => {
    const d = athleteLastRunDate[athleteId];
    if (!d) return 'No runs yet';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const runDay = new Date(d); runDay.setHours(0, 0, 0, 0);
    const diff = Math.round((today - runDay) / 86400000);
    if (diff === 0) return 'Last run · today';
    if (diff === 1) return 'Last run · yesterday';
    return `Last run · ${diff}d ago`;
  };

  const renderAthleteCard = (athlete, index) => {
    const miles = leaderMiles[athlete.id];
    const runM = athleteRunMiles[athlete.id] || 0;
    const totM = athleteMiles[athlete.id] || 0;
    const xtCredit = Math.round((totM - runM) * 10) / 10;
    const isTop = index < 3;
    return (
      <TouchableOpacity
        key={athlete.id}
        style={styles.athleteCard}
        onPress={() => setSelectedAthlete(athlete)}
        activeOpacity={0.85}
      >
        <Text style={[styles.athleteRank, isTop && { color: SIGNAL.color.indigo }]}>{index + 1}</Text>
        <View style={[styles.athleteAvatar, { backgroundColor: athlete.avatarColor || SIGNAL.color.indigo }]}>
          <Text style={styles.athleteAvatarText}>{athlete.firstName?.[0]}{athlete.lastName?.[0]}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.athleteNameRow}>
            <Text style={styles.athleteName} numberOfLines={1}>
              {athlete.firstName} {athlete.lastName}
            </Text>
            {athlete.gradYear && (
              <Text style={styles.athleteYear}>{athlete.gradYear}</Text>
            )}
          </View>
          <Text style={styles.athleteSub} numberOfLines={1}>{formatLastRun(athlete.id)}</Text>
        </View>
        {hasTeamXT && leaderboardCT ? (
          <View style={styles.athleteMilesBox}>
            <Text style={styles.athleteMilesNum}>{totM.toFixed(1)}</Text>
            <Text style={styles.athleteMilesLabel}>TOTAL</Text>
            {xtCredit > 0 && (
              <Text style={styles.athleteBreakout}>{runM.toFixed(1)} run · +{xtCredit.toFixed(1)} xt</Text>
            )}
          </View>
        ) : (
          <View style={styles.athleteMilesBox}>
            <Text style={styles.athleteMilesNum}>{miles != null ? miles.toFixed(1) : '—'}</Text>
            <Text style={styles.athleteMilesLabel}>MILES</Text>
          </View>
        )}
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  };

  // ── Triage card status logic ────────────────────────────────────────────────
  // Mileage Volume status — % on-target of those with targets
  const volumeTotal = complianceData.onTarget.length + complianceData.underTarget.length + complianceData.overTarget.length;
  const volumeOnPct = volumeTotal > 0 ? Math.round((complianceData.onTarget.length / volumeTotal) * 100) : null;
  const volumeStatus = volumeOnPct == null ? 'nodata'
    : volumeOnPct >= 90 ? 'ok'
    : volumeOnPct >= 70 ? 'warn'
    : 'alert';
  const volumeGradient = volumeStatus === 'ok'
    ? [SIGNAL.color.emerald, SIGNAL.color.cyan]
    : volumeStatus === 'warn'
      ? [SIGNAL.color.amber, SIGNAL.color.coral]
      : [SIGNAL.color.coral, SIGNAL.color.effort10];

  // Easy-Hard status — % running easy
  const easyTotal = paceComplianceData.runningEasy.length + paceComplianceData.tooHard.length;
  const easyOnPct = easyTotal > 0 ? Math.round((paceComplianceData.runningEasy.length / easyTotal) * 100) : null;
  const easyStatus = easyOnPct == null ? 'nodata'
    : easyOnPct >= 78 ? 'ok'
    : easyOnPct >= 60 ? 'warn'
    : 'alert';
  const easyGradient = easyStatus === 'ok'
    ? [SIGNAL.color.emerald, SIGNAL.color.cyan]
    : easyStatus === 'warn'
      ? [SIGNAL.color.amber, SIGNAL.color.coral]
      : [SIGNAL.color.coral, SIGNAL.color.effort10];

  // Injury / illness alert
  const injuredAthletes = athletes.filter(a => overtTrainingAlerts[a.id]?.todayInjury || overtTrainingAlerts[a.id]?.todayIllness);
  // "Managed" = every athlete with an active coach workout modification (they
  // stay visible here until the modification ends, even if their injury
  // check-in ages out). "Needs attention" = reporting injury, not yet modified.
  const managedInjured = athletes.filter(a => activeOverrides[a.id]);
  const needsAttentionInjured = injuredAthletes.filter(a => !activeOverrides[a.id]);
  const showInjuryCard = needsAttentionInjured.length > 0 || managedInjured.length > 0;
  const injuryStatus = injuredAthletes.length > 0 ? 'alert' : 'ok';
  const injuryGradient = injuryStatus === 'alert'
    ? [SIGNAL.color.coral, SIGNAL.color.effort10]
    : [SIGNAL.color.emerald, SIGNAL.color.cyan];

  // ACWR buckets
  const acwrBuckets = { spike: [], elevated: [], sweet: [], under: [], insufficient: 0 };
  filteredAthletes.forEach(a => {
    const data = athleteACWR[a.id];
    if (!data) { acwrBuckets.insufficient++; return; }
    if (data.status === ACWR_STATUS.SPIKE)         acwrBuckets.spike.push({ ...a, acwr: data });
    else if (data.status === ACWR_STATUS.ELEVATED) acwrBuckets.elevated.push({ ...a, acwr: data });
    else if (data.status === ACWR_STATUS.SWEET_SPOT) acwrBuckets.sweet.push({ ...a, acwr: data });
    else if (data.status === ACWR_STATUS.UNDERTRAINING) acwrBuckets.under.push({ ...a, acwr: data });
    else acwrBuckets.insufficient++;
  });
  const acwrHasSignal = acwrBuckets.spike.length || acwrBuckets.elevated.length
    || acwrBuckets.sweet.length || acwrBuckets.under.length;
  const acwrStatus = acwrBuckets.spike.length > 0 ? 'alert'
    : acwrBuckets.elevated.length > 0 ? 'warn'
    : (acwrBuckets.sweet.length > 0 || acwrBuckets.under.length > 0) ? 'ok'
    : 'nodata';
  const acwrGradient = acwrStatus === 'ok'
    ? [SIGNAL.color.emerald, SIGNAL.color.cyan]
    : acwrStatus === 'warn'
      ? [SIGNAL.color.amber, SIGNAL.color.coral]
      : [SIGNAL.color.coral, SIGNAL.color.effort10];

  return (
    <View style={styles.container}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.greeting} numberOfLines={1}>
              Coach {userData.lastName}
            </Text>
            <Text style={styles.headerEyebrow} numberOfLines={1}>
              {school?.name || 'XCTracker'}{school?.sport ? ` · ${school.sport}` : ''}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerAthleteCount}>{athletes.length}</Text>
            <Text style={styles.headerAthleteLabel}>athletes</Text>
            <Text style={styles.headerJoinCode}>
              Code <Text style={styles.headerJoinCodeStrong}>{school?.joinCode || '----'}</Text>
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
      >

        {/* ── Today's plan ── */}
        <View style={styles.todayWrap}>
          <Text style={[styles.eyebrow, { marginBottom: 8, paddingLeft: 4 }]}>
            Today · {todayLabel}
          </Text>
          <View style={styles.todayCard}>
            {todayItems.length > 0 ? todayItems.map((item, idx) => {
              const c = SIGNAL_TYPE_COLORS[item.type] || SIGNAL.color.indigo;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.planRow,
                    { borderLeftColor: c },
                    idx > 0 && { borderTopWidth: 1, borderTopColor: SIGNAL.color.line },
                  ]}
                  onPress={() => setTodayWorkoutDetail(item)}
                  activeOpacity={0.85}
                >
                  <View style={[styles.planChip, { backgroundColor: `${c}${SIGNAL.tint.chip}` }]}>
                    <View style={[styles.planChipDot, { backgroundColor: c }]} />
                    <Text style={[styles.planChipText, { color: c }]}>{item.type}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.planTitle} numberOfLines={1}>
                      {item.title}{item.baseMiles ? ` — ${item.baseMiles} mi` : ''}
                    </Text>
                    {item.description && (
                      <Text style={styles.planDesc} numberOfLines={1}>{item.description}</Text>
                    )}
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              );
            }) : (
              <View style={styles.planEmpty}>
                <Text style={styles.planEmptyText}>No training scheduled today.</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Send daily message (own card) ── */}
        {isAdmin && !todayTipSent && (
          <View style={styles.messageCardWrap}>
            <TouchableOpacity
              style={styles.messageCard}
              onPress={() => handleOpenTip(currentPhase)}
              activeOpacity={0.85}
            >
              <View style={styles.messageCardIcon}>
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={SIGNAL.color.indigo} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.messageCardTitle}>Send daily message</Text>
                <Text style={styles.messageCardDesc}>Share a focus or note with your team.</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Season in Review banner ── */}
        {(() => {
          if (!school) return null;
          const completed = getCompletedSeasons(school);
          const unreviewedSeason = completed.find(s => {
            const key = `${s.sport}_${new Date(s.championshipDate).toISOString().split('T')[0]}`;
            return !reviewDismissed[key];
          });
          if (!unreviewedSeason) return null;
          return (
            <View style={{ paddingHorizontal: 14, marginTop: 12 }}>
              <TouchableOpacity
                style={styles.seasonReviewCard}
                onPress={() => { setSeasonReviewSeason(unreviewedSeason); setSeasonReviewVisible(true); }}
                activeOpacity={0.85}
              >
                <Ionicons name="trophy" size={20} color={SIGNAL.color.emerald} />
                <Text style={styles.seasonReviewTitle} numberOfLines={2}>
                  {unreviewedSeason.name || 'Season'} complete — view Season in Review
                </Text>
                <TouchableOpacity onPress={async (e) => {
                  e.stopPropagation?.();
                  const key = `${unreviewedSeason.sport}_${new Date(unreviewedSeason.championshipDate).toISOString().split('T')[0]}`;
                  setReviewDismissed(prev => ({ ...prev, [key]: true }));
                  try { await updateDoc(doc(db, 'users', auth.currentUser.uid), { [`reviewedSeasons.${key}`]: true }); } catch (e2) { console.warn('Save review dismiss:', e2); }
                }}>
                  <Ionicons name="close" size={18} color={SIGNAL.color.mute} />
                </TouchableOpacity>
              </TouchableOpacity>
            </View>
          );
        })()}

        {/* ── Triage cards ── */}
        <View style={styles.triageStack}>

          {/* Mileage Volume */}
          {(complianceData.underTarget.length > 0 || complianceData.overTarget.length > 0 || complianceData.onTarget.length > 0) && (
            <View style={styles.triageCard}>
              <TouchableOpacity
                style={styles.triageHeader}
                onPress={() => setComplianceExpanded(prev => !prev)}
                activeOpacity={0.85}
              >
                <View style={[styles.triageIcon, { backgroundColor: `${SIGNAL.color.indigo}1A` }]}>
                  <Ionicons name="trending-up" size={16} color={SIGNAL.color.indigo} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.triageTitle}>Mileage Volume</Text>
                  <Text style={styles.triageSummary} numberOfLines={1}>
                    <Text style={{ color: SIGNAL.color.emerald, fontFamily: SIGNAL.font.bodySemi }}>{complianceData.onTarget.length} on track</Text>
                    {complianceData.underTarget.length > 0 ? (
                      <Text>, <Text style={{ color: SIGNAL.color.amber, fontFamily: SIGNAL.font.bodySemi }}>{complianceData.underTarget.length} under</Text></Text>
                    ) : null}
                    {complianceData.overTarget.length > 0 ? (
                      <Text>, <Text style={{ color: SIGNAL.color.coral, fontFamily: SIGNAL.font.bodySemi }}>{complianceData.overTarget.length} over</Text></Text>
                    ) : null}
                  </Text>
                </View>
                <Ionicons name={complianceExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={SIGNAL.color.mute2} />
              </TouchableOpacity>

              {complianceExpanded && (
                <View style={styles.triageBody}>
                  {volumeOnPct != null && (
                    volumeStatus === 'nodata' ? (
                      <View style={[styles.heroPill, { backgroundColor: SIGNAL.color.mute }]}>
                        <Text style={styles.heroPillNum}>—</Text>
                        <Text style={styles.heroPillSub}>No volume data yet</Text>
                      </View>
                    ) : (
                      <LinearGradient
                        colors={volumeGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.heroPill}
                      >
                        <Text style={styles.heroPillNum}>{volumeOnPct}%</Text>
                        <Text style={styles.heroPillSub}>on weekly target</Text>
                      </LinearGradient>
                    )
                  )}

                  {complianceData.underTarget.length > 0 && (
                    <View style={styles.triageGroup}>
                      <Text style={[styles.triageGroupLabel, { color: SIGNAL.color.amber }]}>Under target</Text>
                      {complianceData.underTarget.map(a => (
                        <TouchableOpacity key={a.id} style={styles.triageRow} onPress={() => setSelectedAthlete(a)} activeOpacity={0.85}>
                          <View style={[styles.miniAvatar, { backgroundColor: a.avatarColor || SIGNAL.color.indigo }]}>
                            <Text style={styles.miniAvatarText}>{a.firstName?.[0]}{a.lastName?.[0]}</Text>
                          </View>
                          <Text style={styles.triageRowName} numberOfLines={1}>{a.firstName} {a.lastName}</Text>
                          <View style={styles.weekDots}>
                            <Text style={[styles.weekDot, statusToWeekStyle(a.w3Status)]}>
                              {a.w3Status === 'under' ? '↓' : a.w3Status === 'over' ? '↑' : '✓'}{a.wb.w3}
                            </Text>
                            <Text style={[styles.weekDot, statusToWeekStyle(a.w2Status)]}>
                              {a.w2Status === 'under' ? '↓' : a.w2Status === 'over' ? '↑' : '✓'}{a.wb.w2}
                            </Text>
                            <Text style={[styles.weekDot, statusToWeekStyle(a.w1Status)]}>
                              {a.w1Status === 'under' ? '↓' : a.w1Status === 'over' ? '↑' : '✓'}{a.wb.w1}
                            </Text>
                          </View>
                          {a.target ? <Text style={styles.triageTarget}>{a.target} mi</Text> : null}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {complianceData.overTarget.length > 0 && (
                    <View style={styles.triageGroup}>
                      <Text style={[styles.triageGroupLabel, { color: SIGNAL.color.coral }]}>Over target</Text>
                      {complianceData.overTarget.map(a => (
                        <TouchableOpacity key={a.id} style={styles.triageRow} onPress={() => setSelectedAthlete(a)} activeOpacity={0.85}>
                          <View style={[styles.miniAvatar, { backgroundColor: a.avatarColor || SIGNAL.color.indigo }]}>
                            <Text style={styles.miniAvatarText}>{a.firstName?.[0]}{a.lastName?.[0]}</Text>
                          </View>
                          <Text style={styles.triageRowName} numberOfLines={1}>{a.firstName} {a.lastName}</Text>
                          <View style={styles.weekDots}>
                            <Text style={[styles.weekDot, statusToWeekStyle(a.w3Status)]}>
                              {a.w3Status === 'under' ? '↓' : a.w3Status === 'over' ? '↑' : '✓'}{a.wb.w3}
                            </Text>
                            <Text style={[styles.weekDot, statusToWeekStyle(a.w2Status)]}>
                              {a.w2Status === 'under' ? '↓' : a.w2Status === 'over' ? '↑' : '✓'}{a.wb.w2}
                            </Text>
                            <Text style={[styles.weekDot, statusToWeekStyle(a.w1Status)]}>
                              {a.w1Status === 'under' ? '↓' : a.w1Status === 'over' ? '↑' : '✓'}{a.wb.w1}
                            </Text>
                          </View>
                          {a.target ? <Text style={styles.triageTarget}>{a.target} mi</Text> : null}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Easy-Hard Balance */}
          {(paceComplianceData.tooHard.length > 0 || paceComplianceData.runningEasy.length > 0 || paceComplianceData.noPaces > 0) && (
            <View style={styles.triageCard}>
              <TouchableOpacity
                style={styles.triageHeader}
                onPress={() => setPaceComplianceExpanded(prev => !prev)}
                activeOpacity={0.85}
              >
                <View style={[styles.triageIcon, { backgroundColor: `${SIGNAL.color.indigo}1A` }]}>
                  <Ionicons name="speedometer-outline" size={16} color={SIGNAL.color.indigo} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.triageTitle}>Easy-Hard Balance</Text>
                  <Text style={styles.triageSummary} numberOfLines={1}>
                    <Text style={{ color: SIGNAL.color.emerald, fontFamily: SIGNAL.font.bodySemi }}>{paceComplianceData.runningEasy.length} running easy</Text>
                    {paceComplianceData.tooHard.length > 0 ? (
                      <Text>, <Text style={{ color: SIGNAL.color.coral, fontFamily: SIGNAL.font.bodySemi }}>{paceComplianceData.tooHard.length} too hard</Text></Text>
                    ) : null}
                    {paceComplianceData.noPaces > 0 ? (
                      <Text>, <Text style={{ color: SIGNAL.color.amber, fontFamily: SIGNAL.font.bodySemi }}>{paceComplianceData.noPaces} need paces</Text></Text>
                    ) : null}
                  </Text>
                </View>
                <Ionicons name={paceComplianceExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={SIGNAL.color.mute2} />
              </TouchableOpacity>

              {paceComplianceExpanded && (
                <View style={styles.triageBody}>
                  {easyOnPct != null && (
                    easyStatus === 'nodata' ? (
                      <View style={[styles.heroPill, { backgroundColor: SIGNAL.color.mute }]}>
                        <Text style={styles.heroPillNum}>—</Text>
                        <Text style={styles.heroPillSub}>No pace data yet</Text>
                      </View>
                    ) : (
                      <LinearGradient
                        colors={easyGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.heroPill}
                      >
                        <Text style={styles.heroPillNum}>{easyOnPct}%</Text>
                        <Text style={styles.heroPillSub}>running easy · target 78%+</Text>
                      </LinearGradient>
                    )
                  )}

                  {paceComplianceData.tooHard.length > 0 && (
                    <View style={styles.triageGroup}>
                      <Text style={[styles.triageGroupLabel, { color: SIGNAL.color.coral }]}>Too hard (easy &lt; 68%)</Text>
                      {paceComplianceData.tooHard.map(a => (
                        <TouchableOpacity key={a.id} style={styles.triageRow} onPress={() => setSelectedAthlete(a)} activeOpacity={0.85}>
                          <View style={[styles.miniAvatar, { backgroundColor: a.avatarColor || SIGNAL.color.indigo }]}>
                            <Text style={styles.miniAvatarText}>{a.firstName?.[0]}{a.lastName?.[0]}</Text>
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.triageRowName} numberOfLines={1}>{a.firstName} {a.lastName}</Text>
                            <Text style={styles.triageRowMeta}>Easy {a.easyPct}% · target 80%</Text>
                          </View>
                          <Text style={[styles.easyPctNum, { color: SIGNAL.color.coral }]}>{a.easyPct}%</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {paceComplianceData.runningEasy.length > 0 && (
                    <View style={styles.triageGroup}>
                      <Text style={[styles.triageGroupLabel, { color: SIGNAL.color.emerald }]}>Running easy (≥ 68%)</Text>
                      {paceComplianceData.runningEasy.map(a => (
                        <TouchableOpacity key={a.id} style={styles.triageRow} onPress={() => setSelectedAthlete(a)} activeOpacity={0.85}>
                          <View style={[styles.miniAvatar, { backgroundColor: a.avatarColor || SIGNAL.color.indigo }]}>
                            <Text style={styles.miniAvatarText}>{a.firstName?.[0]}{a.lastName?.[0]}</Text>
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.triageRowName} numberOfLines={1}>{a.firstName} {a.lastName}</Text>
                            <Text style={styles.triageRowMeta}>Easy {a.easyPct}% · target 80%</Text>
                          </View>
                          <Text style={[styles.easyPctNum, { color: SIGNAL.color.emerald }]}>{a.easyPct}%</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {paceComplianceData.noPacesAthletes && paceComplianceData.noPacesAthletes.length > 0 && (
                    <View style={styles.triageGroup}>
                      <Text style={[styles.triageGroupLabel, { color: SIGNAL.color.amber }]}>Need training paces</Text>
                      {paceComplianceData.noPacesAthletes.map(a => (
                        <TouchableOpacity key={a.id} style={styles.triageRow} onPress={() => setSelectedAthlete(a)} activeOpacity={0.85}>
                          <View style={[styles.miniAvatar, { backgroundColor: a.avatarColor || SIGNAL.color.indigo }]}>
                            <Text style={styles.miniAvatarText}>{a.firstName?.[0]}{a.lastName?.[0]}</Text>
                          </View>
                          <Text style={styles.triageRowName} numberOfLines={1}>{a.firstName} {a.lastName}</Text>
                          <Text style={[styles.triageTarget, { color: SIGNAL.color.mute }]}>No paces set</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Injury Risk (ACWR) */}
          {acwrHasSignal ? (
            <View style={styles.triageCard}>
              <TouchableOpacity
                style={styles.triageHeader}
                onPress={() => setAcwrExpanded(prev => !prev)}
                activeOpacity={0.85}
              >
                <View style={[styles.triageIcon, { backgroundColor: `${SIGNAL.color.indigo}1A` }]}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={SIGNAL.color.indigo} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.triageTitle}>Injury Risk · ACWR</Text>
                  <Text style={styles.triageSummary} numberOfLines={1}>
                    {acwrBuckets.sweet.length > 0 ? (
                      <Text><Text style={{ color: SIGNAL.color.emerald, fontFamily: SIGNAL.font.bodySemi }}>{acwrBuckets.sweet.length} sweet</Text></Text>
                    ) : null}
                    {acwrBuckets.elevated.length > 0 ? (
                      <Text>{acwrBuckets.sweet.length > 0 ? ' · ' : ''}<Text style={{ color: SIGNAL.color.amber, fontFamily: SIGNAL.font.bodySemi }}>{acwrBuckets.elevated.length} elevated</Text></Text>
                    ) : null}
                    {acwrBuckets.spike.length > 0 ? (
                      <Text>{(acwrBuckets.sweet.length > 0 || acwrBuckets.elevated.length > 0) ? ' · ' : ''}<Text style={{ color: SIGNAL.color.coral, fontFamily: SIGNAL.font.bodySemi }}>{acwrBuckets.spike.length} spike</Text></Text>
                    ) : null}
                    {acwrBuckets.under.length > 0 ? (
                      <Text>{(acwrBuckets.sweet.length > 0 || acwrBuckets.elevated.length > 0 || acwrBuckets.spike.length > 0) ? ' · ' : ''}<Text style={{ color: SIGNAL.color.cyan, fontFamily: SIGNAL.font.bodySemi }}>{acwrBuckets.under.length} ramping</Text></Text>
                    ) : null}
                  </Text>
                </View>
                <Ionicons name={acwrExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={SIGNAL.color.mute2} />
              </TouchableOpacity>

              {acwrExpanded && (
                <View style={styles.triageBody}>
                  {acwrStatus === 'nodata' ? (
                    <View style={[styles.heroPill, { backgroundColor: SIGNAL.color.mute }]}>
                      <Text style={styles.heroPillNum}>—</Text>
                      <Text style={styles.heroPillSub}>Not enough data</Text>
                    </View>
                  ) : (
                    <LinearGradient
                      colors={acwrGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.heroPill}
                    >
                      <Text style={styles.heroPillNum}>
                        {acwrStatus === 'alert' ? acwrBuckets.spike.length
                          : acwrStatus === 'warn' ? acwrBuckets.elevated.length
                          : acwrBuckets.sweet.length + acwrBuckets.under.length}
                      </Text>
                      <Text style={styles.heroPillSub}>
                        {acwrStatus === 'alert' ? 'at spike (high risk)'
                          : acwrStatus === 'warn' ? 'elevated load'
                          : 'within safe range'}
                      </Text>
                    </LinearGradient>
                  )}

                  {acwrBuckets.spike.length > 0 && (
                    <View style={styles.triageGroup}>
                      <Text style={[styles.triageGroupLabel, { color: SIGNAL.color.coral }]}>Spike (&gt;1.5) — high injury risk</Text>
                      {acwrBuckets.spike.map(a => (
                        <TouchableOpacity key={a.id} style={styles.triageRow} onPress={() => setSelectedAthlete(a)} activeOpacity={0.85}>
                          <View style={[styles.miniAvatar, { backgroundColor: a.avatarColor || SIGNAL.color.indigo }]}>
                            <Text style={styles.miniAvatarText}>{a.firstName?.[0]}{a.lastName?.[0]}</Text>
                          </View>
                          <Text style={styles.triageRowName} numberOfLines={1}>{a.firstName} {a.lastName}</Text>
                          <View style={[styles.acwrBadge, { backgroundColor: `${SIGNAL.color.coral}1A` }]}>
                            <Text style={[styles.acwrBadgeText, { color: SIGNAL.color.coral }]}>{a.acwr.ratio.toFixed(2)}</Text>
                          </View>
                          <Text style={styles.acwrAcute}>{Math.round(a.acwr.acute)}/{Math.round(a.acwr.chronic)} mi</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {acwrBuckets.elevated.length > 0 && (
                    <View style={styles.triageGroup}>
                      <Text style={[styles.triageGroupLabel, { color: SIGNAL.color.amber }]}>Elevated (1.3–1.5)</Text>
                      {acwrBuckets.elevated.map(a => (
                        <TouchableOpacity key={a.id} style={styles.triageRow} onPress={() => setSelectedAthlete(a)} activeOpacity={0.85}>
                          <View style={[styles.miniAvatar, { backgroundColor: a.avatarColor || SIGNAL.color.indigo }]}>
                            <Text style={styles.miniAvatarText}>{a.firstName?.[0]}{a.lastName?.[0]}</Text>
                          </View>
                          <Text style={styles.triageRowName} numberOfLines={1}>{a.firstName} {a.lastName}</Text>
                          <View style={[styles.acwrBadge, { backgroundColor: `${SIGNAL.color.amber}1A` }]}>
                            <Text style={[styles.acwrBadgeText, { color: SIGNAL.color.amber }]}>{a.acwr.ratio.toFixed(2)}</Text>
                          </View>
                          <Text style={styles.acwrAcute}>{Math.round(a.acwr.acute)}/{Math.round(a.acwr.chronic)} mi</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {acwrBuckets.under.length > 0 && (
                    <View style={styles.triageGroup}>
                      <Text style={[styles.triageGroupLabel, { color: SIGNAL.color.cyan }]}>Ramping up (&lt;0.8)</Text>
                      {acwrBuckets.under.map(a => (
                        <TouchableOpacity key={a.id} style={styles.triageRow} onPress={() => setSelectedAthlete(a)} activeOpacity={0.85}>
                          <View style={[styles.miniAvatar, { backgroundColor: a.avatarColor || SIGNAL.color.indigo }]}>
                            <Text style={styles.miniAvatarText}>{a.firstName?.[0]}{a.lastName?.[0]}</Text>
                          </View>
                          <Text style={styles.triageRowName} numberOfLines={1}>{a.firstName} {a.lastName}</Text>
                          <View style={[styles.acwrBadge, { backgroundColor: `${SIGNAL.color.cyan}1A` }]}>
                            <Text style={[styles.acwrBadgeText, { color: SIGNAL.color.cyan }]}>{a.acwr.ratio.toFixed(2)}</Text>
                          </View>
                          <Text style={styles.acwrAcute}>{Math.round(a.acwr.acute)}/{Math.round(a.acwr.chronic)} mi</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {acwrBuckets.sweet.length > 0 && (
                    <View style={styles.triageGroup}>
                      <Text style={[styles.triageGroupLabel, { color: SIGNAL.color.emerald }]}>Sweet spot (0.8–1.3)</Text>
                      {acwrBuckets.sweet.map(a => (
                        <TouchableOpacity key={a.id} style={styles.triageRow} onPress={() => setSelectedAthlete(a)} activeOpacity={0.85}>
                          <View style={[styles.miniAvatar, { backgroundColor: a.avatarColor || SIGNAL.color.indigo }]}>
                            <Text style={styles.miniAvatarText}>{a.firstName?.[0]}{a.lastName?.[0]}</Text>
                          </View>
                          <Text style={styles.triageRowName} numberOfLines={1}>{a.firstName} {a.lastName}</Text>
                          <View style={[styles.acwrBadge, { backgroundColor: `${SIGNAL.color.emerald}1A` }]}>
                            <Text style={[styles.acwrBadgeText, { color: SIGNAL.color.emerald }]}>{a.acwr.ratio.toFixed(2)}</Text>
                          </View>
                          <Text style={styles.acwrAcute}>{Math.round(a.acwr.acute)}/{Math.round(a.acwr.chronic)} mi</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  <Text style={styles.acwrInfo}>
                    ACWR compares last-7-day miles to the 4-week average. Above 1.5 signals a spike vs. the athlete's adapted baseline — the strongest predictor of soft-tissue injury.
                  </Text>
                </View>
              )}
            </View>
          ) : null}

          {/* Injury / Illness alert */}
          {showInjuryCard && (() => {
            const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
            const formatWhen = (d) => {
              if (!d) return '';
              if (d >= todayStart) return 'today';
              const daysAgo = Math.ceil((todayStart - d) / 86400000);
              return daysAgo === 1 ? 'yesterday' : `${daysAgo}d ago`;
            };
            return (
              <View style={[styles.triageCard, styles.triageCardAlert]}>
                <TouchableOpacity
                  style={styles.triageHeader}
                  onPress={() => setInjuryCardExpanded(prev => !prev)}
                  activeOpacity={0.85}
                >
                  <View style={[styles.triageIcon, { backgroundColor: `${SIGNAL.color.coral}18` }]}>
                    <Ionicons name="warning" size={16} color={SIGNAL.color.coral} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.triageTitle, { color: SIGNAL.color.coral }]}>
                      {needsAttentionInjured.length > 0
                        ? `${needsAttentionInjured.length} reporting injury or illness`
                        : 'Injuries — all managed'}
                      {managedInjured.length > 0 ? <Text style={styles.managedCount}>  ·  {managedInjured.length} managed</Text> : null}
                    </Text>
                  </View>
                  <Ionicons name={injuryCardExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={SIGNAL.color.coral} />
                </TouchableOpacity>

                {injuryCardExpanded && (
                  <View style={styles.triageBody}>
                    <LinearGradient
                      colors={injuryGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.heroPill}
                    >
                      <Text style={styles.heroPillNum}>{needsAttentionInjured.length}</Text>
                      <Text style={styles.heroPillSub}>{needsAttentionInjured.length === 1 ? 'athlete needs attention' : 'athletes need attention'}</Text>
                    </LinearGradient>

                    {needsAttentionInjured.map(athlete => {
                      const alerts = overtTrainingAlerts[athlete.id];
                      const inj = alerts?.todayInjury;
                      const ill = alerts?.todayIllness;
                      const when = formatWhen(alerts?.injuryCheckinDate);
                      const worstSeverity = [inj?.severity, ill?.severity]
                        .filter(Boolean)
                        .reduce((w, s) => s === 'severe' || w === 'severe' ? 'severe' : s === 'moderate' || w === 'moderate' ? 'moderate' : 'mild', 'mild');
                      const sevColor = worstSeverity === 'severe' ? SIGNAL.color.coral
                        : worstSeverity === 'moderate' ? SIGNAL.color.amber
                        : SIGNAL.color.inkSoft;
                      const rec = worstSeverity === 'severe' ? 'Recommend rest day'
                        : worstSeverity === 'moderate' ? 'Consider modified workout'
                        : 'Monitor during practice';
                      return (
                        <TouchableOpacity
                          key={athlete.id}
                          style={styles.injuryRow}
                          onPress={() => setSelectedAthlete(athlete)}
                          activeOpacity={0.85}
                        >
                          <View style={[styles.injuryAvatar, { backgroundColor: athlete.avatarColor || SIGNAL.color.indigo }]}>
                            <Text style={styles.injuryAvatarText}>{athlete.firstName?.[0]}{athlete.lastName?.[0]}</Text>
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.injuryName}>
                              {athlete.firstName} {athlete.lastName}
                              {when ? <Text style={styles.injuryWhen}>  ·  {when}</Text> : null}
                            </Text>
                            {inj && (
                              <Text style={styles.injuryDetail}>
                                🩹 {inj.perLocation
                                  ? inj.perLocation.map(p => `${p.location.charAt(0).toUpperCase() + p.location.slice(1)} (${p.severity})`).join(', ')
                                  : `${inj.locations?.map(l => l.charAt(0).toUpperCase() + l.slice(1)).join(', ')} — ${inj.severity}`
                                }{inj.note ? ` — "${inj.note}"` : ''}
                              </Text>
                            )}
                            {ill && (
                              <Text style={styles.injuryDetail}>
                                🤒 {ill.symptoms?.map(s => s.replace(/_/g, ' ')).join(', ')} — <Text style={{ color: sevColor, fontFamily: SIGNAL.font.bodySemi }}>{ill.severity}</Text>
                              </Text>
                            )}
                            <Text style={[styles.injuryRec, { color: sevColor }]}>{rec}</Text>
                          </View>
                          <Text style={styles.chevron}>›</Text>
                        </TouchableOpacity>
                      );
                    })}

                    {/* Managed injured — workout already modified by the coach */}
                    {managedInjured.length > 0 && (
                      <>
                        <Text style={styles.managedHeader}>Managed ({managedInjured.length})</Text>
                        {managedInjured.map(athlete => {
                          const ov = activeOverrides[athlete.id];
                          return (
                            <TouchableOpacity
                              key={athlete.id}
                              style={styles.injuryRow}
                              onPress={() => setSelectedAthlete(athlete)}
                              activeOpacity={0.85}
                            >
                              <View style={[styles.injuryAvatar, { backgroundColor: athlete.avatarColor || SIGNAL.color.indigo }]}>
                                <Text style={styles.injuryAvatarText}>{athlete.firstName?.[0]}{athlete.lastName?.[0]}</Text>
                              </View>
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={styles.injuryName}>{athlete.firstName} {athlete.lastName}</Text>
                                <Text style={[styles.injuryRec, { color: SIGNAL.color.cyan }]}>
                                  {ov?.type === 'rest' ? 'Rest' : 'Cross-training'} until {ov?.endDate}
                                </Text>
                              </View>
                              <Text style={styles.chevron}>›</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </>
                    )}
                  </View>
                )}
              </View>
            );
          })()}

          {/* Weekly check-ins (Sat noon → Mon noon). Head coach only — private
              athlete-to-head-coach thread, intentionally hidden from assistants. */}
          {userData.role === 'admin_coach' && athletes.length > 0 && (() => {
            const submitted = athletes.filter(a => weeklyCheckins[a.id]);
            const missing   = athletes.filter(a => !weeklyCheckins[a.id]);
            const pct = athletes.length > 0 ? Math.round((submitted.length / athletes.length) * 100) : 0;
            const status = pct >= 90 ? 'ok' : pct >= 50 ? 'warn' : 'alert';
            const gradient = status === 'ok'
              ? [SIGNAL.color.emerald, SIGNAL.color.cyan]
              : status === 'warn'
              ? [SIGNAL.color.amber, SIGNAL.color.coral]
              : [SIGNAL.color.coral, '#b91c1c'];
            const accent = status === 'ok' ? SIGNAL.color.emerald
              : status === 'warn' ? SIGNAL.color.amber : SIGNAL.color.coral;

            const handleSendReply = async (athleteId, docId) => {
              const text = weeklyReplyText.trim();
              if (!text || !docId) return;
              setWeeklySendingReply(true);
              try {
                const coachName = [userData.firstName, userData.lastName].filter(Boolean).join(' ').trim() || 'Coach';
                await updateDoc(doc(db, 'weeklyCheckins', docId), {
                  coachReply: {
                    text,
                    repliedByUid: auth.currentUser.uid,
                    repliedByName: coachName,
                    repliedAt: serverTimestamp(),
                  },
                });
                setWeeklyReplyAthleteId(null);
                setWeeklyReplyText('');
                loadDashboard();
              } catch (e) {
                console.warn('Send weekly reply failed:', e);
                Alert.alert('Reply not sent', `Could not send your reply: ${e.message || e}.`);
              } finally {
                setWeeklySendingReply(false);
              }
            };

            return (
              <View style={styles.triageCard}>
                <TouchableOpacity
                  style={styles.triageHeader}
                  onPress={() => setWeeklyCardExpanded(prev => !prev)}
                  activeOpacity={0.85}
                >
                  <View style={[styles.triageIcon, { backgroundColor: `${SIGNAL.color.indigo}1A` }]}>
                    <Ionicons name="chatbubbles" size={16} color={SIGNAL.color.indigo} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.triageTitle}>Weekly check-ins</Text>
                    <Text style={styles.triageSummary} numberOfLines={1}>
                      <Text style={{ color: SIGNAL.color.emerald, fontFamily: SIGNAL.font.bodySemi }}>{submitted.length} received</Text>
                      {missing.length > 0 ? (
                        <Text>, <Text style={{ color: SIGNAL.color.coral, fontFamily: SIGNAL.font.bodySemi }}>{missing.length} missing</Text></Text>
                      ) : null}
                    </Text>
                  </View>
                  <Ionicons name={weeklyCardExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={SIGNAL.color.mute2} />
                </TouchableOpacity>

                {weeklyCardExpanded && (
                  <View style={styles.triageBody}>
                    <LinearGradient
                      colors={gradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.heroPill}
                    >
                      <Text style={styles.heroPillNum}>{pct}%</Text>
                      <Text style={styles.heroPillSub}>{submitted.length} of {athletes.length} submitted</Text>
                    </LinearGradient>

                    {/* Received */}
                    {submitted.length > 0 && (
                      <>
                        <Text style={styles.weeklySectionHead}>Received ({submitted.length})</Text>
                        {submitted.map(athlete => {
                          const checkin = weeklyCheckins[athlete.id];
                          const isExpanded = weeklyReplyAthleteId === athlete.id;
                          const needsReply = !checkin.coachReply;
                          return (
                            <View key={athlete.id} style={styles.weeklyRow}>
                              <TouchableOpacity
                                style={styles.weeklyRowHead}
                                onPress={() => {
                                  if (isExpanded) {
                                    setWeeklyReplyAthleteId(null);
                                    setWeeklyReplyText('');
                                  } else {
                                    setWeeklyReplyAthleteId(athlete.id);
                                    setWeeklyReplyText(checkin.coachReply?.text || '');
                                  }
                                }}
                                activeOpacity={0.85}
                              >
                                <View style={[styles.injuryAvatar, { backgroundColor: athlete.avatarColor || SIGNAL.color.indigo }]}>
                                  <Text style={styles.injuryAvatarText}>{athlete.firstName?.[0]}{athlete.lastName?.[0]}</Text>
                                </View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={styles.injuryName}>{athlete.firstName} {athlete.lastName}</Text>
                                    {needsReply && <View style={styles.weeklyUnreadDot} />}
                                  </View>
                                  <Text style={styles.weeklyPreview} numberOfLines={isExpanded ? 0 : 2}>
                                    {checkin.message}
                                  </Text>
                                </View>
                                <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={SIGNAL.color.mute} />
                              </TouchableOpacity>

                              {isExpanded && (
                                <View style={styles.weeklyReplyArea}>
                                  <TextInput
                                    style={styles.weeklyReplyInput}
                                    value={weeklyReplyText}
                                    onChangeText={setWeeklyReplyText}
                                    placeholder="Write a reply…"
                                    placeholderTextColor={SIGNAL.color.mute2}
                                    multiline
                                    maxLength={500}
                                  />
                                  <TouchableOpacity
                                    style={[styles.weeklyReplySendBtn, (!weeklyReplyText.trim() || weeklySendingReply) && styles.weeklyReplySendBtnDisabled]}
                                    onPress={() => handleSendReply(athlete.id, checkin.id)}
                                    disabled={!weeklyReplyText.trim() || weeklySendingReply}
                                    activeOpacity={0.85}
                                  >
                                    <Text style={styles.weeklyReplySendText}>
                                      {weeklySendingReply ? 'Sending…' : (checkin.coachReply ? 'Update reply' : 'Send reply')}
                                    </Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={styles.weeklyHistoryLink}
                                    onPress={() => setWeeklyHistoryAthlete(athlete)}
                                  >
                                    <Ionicons name="time-outline" size={12} color={SIGNAL.color.indigo} />
                                    <Text style={styles.weeklyHistoryLinkText}>View past check-ins</Text>
                                  </TouchableOpacity>
                                </View>
                              )}
                            </View>
                          );
                        })}
                      </>
                    )}

                    {/* Missing */}
                    {missing.length > 0 && (
                      <>
                        <Text style={styles.weeklySectionHead}>Not yet ({missing.length})</Text>
                        <View style={styles.weeklyMissingGrid}>
                          {missing.map(athlete => (
                            <TouchableOpacity
                              key={athlete.id}
                              style={styles.weeklyMissingChip}
                              onPress={() => setWeeklyHistoryAthlete(athlete)}
                              activeOpacity={0.85}
                            >
                              <View style={[styles.weeklyMissingAvatar, { backgroundColor: athlete.avatarColor || SIGNAL.color.indigo }]}>
                                <Text style={styles.weeklyMissingAvatarText}>{athlete.firstName?.[0]}{athlete.lastName?.[0]}</Text>
                              </View>
                              <Text style={styles.weeklyMissingName} numberOfLines={1}>
                                {athlete.firstName} {athlete.lastName?.[0]}.
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </>
                    )}
                  </View>
                )}
              </View>
            );
          })()}
        </View>

        {/* ── Team roster ── */}
        <View style={styles.teamHeader}>
          <Text style={styles.sectionTitle}>Team</Text>
          <TouchableOpacity onPress={handleShareLeaderboard} activeOpacity={0.7}>
            <Text style={styles.shareLink}>Share ↗</Text>
          </TouchableOpacity>
        </View>

        {/* Timeframe row */}
        <View style={styles.timeframeWrap}>
          <TimeframePicker
            selected={selectedTimeframe}
            onSelect={setSelectedTimeframe}
            activeSeason={activeSeasonData}
            primaryColor={SIGNAL.color.indigo}
          />
        </View>

        {/* Gender filter chips */}
        <View style={styles.chipRow}>
          {[['all', 'All'], ['boys', 'Boys'], ['girls', 'Girls']].map(([key, label]) => {
            const active = genderFilter === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setGenderFilter(key)}
                activeOpacity={0.85}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Group filter chips */}
        {groups.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.groupChipRow}
          >
            {(() => {
              // Counts respect the active gender filter so a "Boys" filter shows
              // boys-per-group counts. "By Group" is a display mode, no count.
              const base = athletes.filter(a => genderFilter === 'all' || a.gender === genderFilter);
              const chipCount = (id) => {
                if (id === 'bygroup') return null;
                if (id === 'all') return base.length;
                if (id === 'unassigned') return base.filter(a => !a.groupId).length;
                return base.filter(a => a.groupId === id).length;
              };
              return [{ id: 'all', name: 'All' }, { id: 'bygroup', name: 'By Group' }, ...groups, { id: 'unassigned', name: 'Unassigned' }].map(g => {
                const active = groupFilter === g.id;
                const count = chipCount(g.id);
                return (
                  <TouchableOpacity
                    key={g.id}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => setGroupFilter(g.id)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                      {g.name}{count != null ? ` (${count})` : ''}
                    </Text>
                  </TouchableOpacity>
                );
              });
            })()}
            <TouchableOpacity
              style={styles.manageGroupsBtn}
              onPress={() => { setFeedVisible(false); setZonesVisible(false); setProfileVisible(false); setAnalyticsVisible(false); setAddFromDashboard(false); setTrainingSection('groups'); }}
              activeOpacity={0.7}
            >
              <Ionicons name="settings-outline" size={14} color={SIGNAL.color.mute} />
            </TouchableOpacity>
          </ScrollView>
        ) : (
          <View style={styles.chipRow}>
            <TouchableOpacity
              style={styles.createGroupsBtn}
              onPress={() => { setFeedVisible(false); setZonesVisible(false); setProfileVisible(false); setAnalyticsVisible(false); setAddFromDashboard(false); setTrainingSection('groups'); }}
              activeOpacity={0.85}
            >
              <Ionicons name="people-outline" size={16} color={SIGNAL.color.indigo} />
              <Text style={styles.createGroupsBtnText}>Create training groups</Text>
            </TouchableOpacity>
          </View>
        )}

        {hasTeamXT && (
          <View style={[styles.chipRow, { marginTop: 4 }]}>
            {[['with', 'With XT', true], ['runs', 'Runs only', false]].map(([k, l, val]) => {
              const active = leaderboardCT === val;
              return (
                <TouchableOpacity
                  key={k}
                  style={[styles.xtToggle, active && styles.xtToggleActive]}
                  onPress={() => setLeaderboardCT(val)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.xtToggleText, active && styles.xtToggleTextActive]}>{l}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {refreshing && (
          <View style={styles.refreshingRow}>
            <ActivityIndicator size="small" color={SIGNAL.color.indigo} />
            <Text style={styles.refreshingText}>Updating…</Text>
          </View>
        )}

        {/* Athlete cards */}
        <View style={styles.rosterWrap}>
          {filteredAthletes.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No approved athletes yet.</Text>
              <Text style={styles.emptySubText}>Share join code: <Text style={styles.emptyCodeMono}>{school?.joinCode || '----'}</Text></Text>
            </View>
          ) : groupFilter === 'bygroup' ? (
            [...groups, { id: null, name: 'Unassigned' }].map(group => {
              const groupAthletes = athletes
                .filter(a => group.id ? a.groupId === group.id : !a.groupId)
                .filter(a => genderFilter === 'all' || a.gender === genderFilter)
                .sort((a, b) => (leaderMiles[b.id] || 0) - (leaderMiles[a.id] || 0));
              if (groupAthletes.length === 0) return null;
              return (
                <View key={group.id || 'unassigned'} style={styles.groupSection}>
                  <Text style={styles.groupHeader}>
                    {group.name}{group.weeklyMilesTarget ? ` · ${group.weeklyMilesTarget} mi/wk target` : ''}
                  </Text>
                  {groupAthletes.map((athlete, index) => renderAthleteCard(athlete, index))}
                </View>
              );
            })
          ) : (
            [...filteredAthletes]
              .sort((a, b) => (leaderMiles[b.id] || 0) - (leaderMiles[a.id] || 0))
              .map((athlete, index) => renderAthleteCard(athlete, index))
          )}
        </View>

        {/* ── Upcoming training ── */}
        <View style={styles.upcomingHeader}>
          <Text style={styles.sectionTitle}>Upcoming training</Text>
        </View>
        <View style={styles.upcomingWrap}>
          {upcomingItems.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No upcoming training scheduled.</Text>
            </View>
          ) : upcomingItems.map(item => {
            const c = SIGNAL_TYPE_COLORS[item.type] || SIGNAL.color.indigo;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.upcomingCard, { borderLeftColor: c, borderLeftWidth: 3 }]}
                onPress={() => setTodayWorkoutDetail(item)}
                activeOpacity={0.85}
              >
                <View style={[styles.planChip, { backgroundColor: `${c}${SIGNAL.tint.chip}` }]}>
                  <View style={[styles.planChipDot, { backgroundColor: c }]} />
                  <Text style={[styles.planChipText, { color: c }]}>{item.type}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.planTitle} numberOfLines={1}>
                    {item.title}{item.baseMiles ? ` — ${item.baseMiles} mi` : ''}
                  </Text>
                  <Text style={styles.upcomingDate}>
                    {item.date?.toDate?.()?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </Text>
                  {item.description && (
                    <Text style={styles.planDesc} numberOfLines={1}>{item.description}</Text>
                  )}
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            );
          })}
        </View>

      </ScrollView>

      {/* ── Sub-screens rendered over content but under nav ── */}
      {/* Training Hub (shown when Training tab active but no sub-section) */}
      {trainingSection === 'hub' && (
        <View style={[styles.subScreen, { bottom: navHeight }]}>
          <TrainingHub
            school={school}
            athletes={athletes}
            pendingAthletes={pendingAthletes}
            groups={groups}
            trainingItems={trainingItems}
            nextMeet={nextMeet}
            onNavigate={(section) => setTrainingSection(section)}
          />
        </View>
      )}
      {/* Training > Manage Groups */}
      {trainingSection === 'groups' && (
        <View style={[styles.subScreen, { bottom: navHeight }]}>
          <ManageGroups
            schoolId={userData.schoolId}
            athletes={athletes}
            onClose={() => { setTrainingSection('hub'); loadDashboard(); }}
          />
        </View>
      )}
      {/* Training > Attendance */}
      {trainingSection === 'attendance' && (
        <View style={[styles.subScreen, { bottom: navHeight }]}>
          <AttendanceScreen
            userData={userData}
            athletes={athletes}
            onClose={() => { setTrainingSection('hub'); loadDashboard(); }}
          />
        </View>
      )}
      {/* Training > Cross Training */}
      {trainingSection === 'crosstraining' && (
        <View style={[styles.subScreen, { bottom: navHeight }]}>
          <CrossTrainingSettings
            school={school}
            schoolId={userData.schoolId}
            onSaved={(factors) => setSchool(prev => ({ ...(prev || {}), crossTrainingFactors: factors }))}
            onClose={() => { setTrainingSection('hub'); loadDashboard(); }}
          />
        </View>
      )}
      {/* Training > Roster */}
      {trainingSection === 'roster' && (
        <View style={[styles.subScreen, { bottom: navHeight }]}>
          <ManageRoster
            schoolId={userData.schoolId}
            groups={groups}
            onPendingResolved={(athleteId) => {
              // Drop the athlete from the dashboard's pending state right
              // away so the Program nav + Roster card badges clear without
              // waiting for the slow loadDashboard refresh on close.
              setPendingAthletes(prev => prev.filter(a => a.id !== athleteId));
            }}
            onClose={() => { setTrainingSection('hub'); loadDashboard(); }}
          />
        </View>
      )}
      {/* Training > Manage Seasons */}
      {trainingSection === 'seasons' && (
        <View style={[styles.subScreen, { bottom: navHeight }]}>
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
        <View style={[styles.subScreen, { bottom: navHeight }]}>
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
        <View style={[styles.subScreen, { bottom: navHeight }]}>
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
        <View style={[styles.subScreen, { bottom: navHeight }]}>
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
        <View style={[styles.subScreen, { bottom: navHeight }]}>
          <ChannelList userData={userData} school={school} groups={groups} athletes={athletes} onClose={() => { setFeedVisible(false); loadDashboard(); }} onUnreadChange={(count) => setUnreadFeedCount(count)} />
        </View>
      )}
      {profileVisible && (
        <View style={[styles.subScreen, { bottom: navHeight }]}>
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
        <View style={[styles.subScreen, { bottom: navHeight }]}>
          <Suspense fallback={<View style={styles.loading}><ActivityIndicator size="large" color={SIGNAL.color.indigo} /></View>}>
            <CoachAnalytics
              athletes={athletes}
              athleteWeeklyMiles={athleteWeeklyMiles}
              athlete3WeekAvg={athlete3WeekAvg}
              athleteWeeklyBreakdown={athleteWeeklyBreakdown}
              athletePaceEasyPct={athletePaceEasyPct}
              overtTrainingAlerts={overtTrainingAlerts}
              athleteMiles={athleteMiles}
              groups={groups}
              school={school}
              schoolId={userData.schoolId}
              userData={userData}
              onClose={() => setAnalyticsVisible(false)}
            />
          </Suspense>
        </View>
      )}

      {/* ── Persistent bottom nav ── */}
      {seasonReviewVisible && seasonReviewSeason && (
        <View style={[styles.subScreen, { bottom: navHeight }]}>
          <Suspense fallback={<View style={styles.loading}><ActivityIndicator size="large" color={SIGNAL.color.indigo} /></View>}>
            <SeasonReview season={seasonReviewSeason} school={school} userData={userData} athletes={athletes} onClose={() => { setSeasonReviewVisible(false); setSeasonReviewSeason(null); }} />
          </Suspense>
        </View>
      )}

      <WorkoutDetailModal
        item={todayWorkoutDetail}
        visible={!!todayWorkoutDetail}
        onClose={() => setTodayWorkoutDetail(null)}
        primaryColor={primaryColor}
        groups={groups}
      />

      <View
        style={styles.bottomNav}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && h !== navHeight) setNavHeight(h);
        }}
      >
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => { setTrainingSection(null); setFeedVisible(false); setZonesVisible(false); setProfileVisible(false); setAnalyticsVisible(false); setAddFromDashboard(false); }}>
          <Ionicons name="home-outline" size={22} color={!trainingSection && !feedVisible && !zonesVisible && !profileVisible && !analyticsVisible && !addFromDashboard ? SIGNAL.color.indigo : SIGNAL.color.mute2} />
          <Text style={[styles.bottomNavLabel, !trainingSection && !feedVisible && !zonesVisible && !profileVisible && !analyticsVisible && !addFromDashboard && styles.bottomNavLabelActive]}>Home</Text>
        </TouchableOpacity>
        {hasTrainingAccess && (
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => { setFeedVisible(false); setZonesVisible(false); setProfileVisible(false); setAnalyticsVisible(false); setAddFromDashboard(false); setTrainingSection('hub'); }}>
          <View>
            <Ionicons name="calendar-outline" size={22} color={trainingSection || addFromDashboard ? SIGNAL.color.indigo : SIGNAL.color.mute2} />
            {pendingAthletes.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{pendingAthletes.length > 99 ? '99+' : pendingAthletes.length}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.bottomNavLabel, (trainingSection || addFromDashboard) && styles.bottomNavLabelActive]}>Program</Text>
        </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => { setTrainingSection(null); setFeedVisible(false); setZonesVisible(false); setProfileVisible(false); setAddFromDashboard(false); setAnalyticsVisible(true); }}>
          <Ionicons name="analytics-outline" size={22} color={analyticsVisible ? SIGNAL.color.indigo : SIGNAL.color.mute2} />
          <Text style={[styles.bottomNavLabel, analyticsVisible && styles.bottomNavLabelActive]}>Analytics</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => { setTrainingSection(null); setZonesVisible(false); setProfileVisible(false); setAnalyticsVisible(false); setAddFromDashboard(false); setFeedVisible(true); }}>
          <View>
            <Ionicons name="chatbubbles-outline" size={22} color={feedVisible ? SIGNAL.color.indigo : SIGNAL.color.mute2} />
            {unreadFeedCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadFeedCount > 99 ? '99+' : unreadFeedCount}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.bottomNavLabel, feedVisible && styles.bottomNavLabelActive]}>Feed</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => { setTrainingSection(null); setFeedVisible(false); setZonesVisible(false); setAnalyticsVisible(false); setAddFromDashboard(false); setProfileVisible(true); }}>
          <View>
            <Ionicons name="person-outline" size={22} color={profileVisible ? SIGNAL.color.indigo : SIGNAL.color.mute2} />
            {pendingCoachCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{pendingCoachCount}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.bottomNavLabel, profileVisible && styles.bottomNavLabelActive]}>Profile</Text>
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
              <Text style={styles.tipModalEyebrow}>To the team</Text>
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
                placeholderTextColor={SIGNAL.color.mute2}
              />
              <Text style={styles.tipModalHint}>
                💡  Auto-generated based on your current training phase. Make it your own.
              </Text>
              <TouchableOpacity
                style={[styles.tipSendBtn, { backgroundColor: tipText.trim() ? SIGNAL.color.indigo : SIGNAL.color.mute2 }]}
                onPress={handleSendTip}
                disabled={sendingTip || !tipText.trim()}
                activeOpacity={0.85}
              >
                {sendingTip
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.tipSendBtnText}>Send to team  →</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <WeeklyCheckinHistory
        visible={!!weeklyHistoryAthlete}
        athleteId={weeklyHistoryAthlete?.id}
        athleteName={weeklyHistoryAthlete
          ? `${weeklyHistoryAthlete.firstName || ''} ${weeklyHistoryAthlete.lastName || ''}`.trim()
          : ''}
        onClose={() => setWeeklyHistoryAthlete(null)}
      />

    </View>
  );
}

// ── Helper: maps a week status string to the colored style for week-dot text ──
function statusToWeekStyle(status) {
  if (status === 'under') return { color: SIGNAL.color.amber };
  if (status === 'over')  return { color: SIGNAL.color.coral };
  return { color: SIGNAL.color.emerald };
}

const styles = StyleSheet.create({
  // ── Container / scroll ──────────────────────────────────────────────────────
  container: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SIGNAL.color.paper2,
  },
  scroll: { flex: 1 },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    backgroundColor: SIGNAL.color.white,
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
  },
  greeting: {
    fontFamily: SIGNAL.font.display,
    fontSize: 29,
    lineHeight: 32,
    color: SIGNAL.color.indigo,
    letterSpacing: -0.58,
  },
  headerEyebrow: {
    ...SIGNAL.style.eyebrow,
    marginTop: 6,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  headerAthleteCount: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 16,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  headerAthleteLabel: {
    fontFamily: SIGNAL.font.body,
    fontSize: 10,
    color: SIGNAL.color.mute,
    marginTop: 1,
  },
  headerJoinCode: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 10,
    color: SIGNAL.color.mute,
    marginTop: 6,
  },
  headerJoinCodeStrong: {
    fontFamily: SIGNAL.font.mono,
    color: SIGNAL.color.ink,
  },

  // ── Eyebrow ────────────────────────────────────────────────────────────────
  eyebrow: { ...SIGNAL.style.eyebrow },

  // ── Today's plan ───────────────────────────────────────────────────────────
  todayWrap: {
    paddingHorizontal: 14,
    paddingTop: 16,
  },
  todayCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    overflow: 'hidden',
    ...SIGNAL.border.hairline,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderLeftWidth: 3,
  },
  planChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: SIGNAL.radius.chip,
    flexShrink: 0,
  },
  planChipDot: { width: 5, height: 5, borderRadius: 999 },
  planChipText: { fontFamily: SIGNAL.font.bodySemi, fontSize: 11 },
  planTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 13.5,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  planDesc: {
    fontFamily: SIGNAL.font.body,
    fontSize: 11,
    color: SIGNAL.color.mute,
    marginTop: 1,
  },
  planEmpty: {
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  planEmptyText: {
    fontFamily: SIGNAL.font.body,
    fontSize: 13,
    color: SIGNAL.color.mute,
  },
  messageCardWrap: {
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  messageCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...SIGNAL.border.hairline,
  },
  messageCardIcon: {
    width: 32,
    height: 32,
    borderRadius: SIGNAL.radius.chip,
    backgroundColor: `${SIGNAL.color.indigo}${SIGNAL.tint.chip}`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageCardTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 14,
    color: SIGNAL.color.ink,
  },
  messageCardDesc: {
    fontFamily: SIGNAL.font.body,
    fontSize: 12,
    color: SIGNAL.color.mute,
    marginTop: 2,
  },

  // ── Season Review banner ───────────────────────────────────────────────────
  seasonReviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    borderWidth: 1,
    borderColor: `${SIGNAL.color.emerald}55`,
  },
  seasonReviewTitle: {
    flex: 1,
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 13.5,
    color: SIGNAL.color.emerald,
    letterSpacing: SIGNAL.letter.bodyTight,
  },

  // ── Triage cards ───────────────────────────────────────────────────────────
  triageStack: {
    paddingHorizontal: 14,
    paddingTop: 14,
    flexDirection: 'column',
    gap: 10,
  },
  triageCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    overflow: 'hidden',
    ...SIGNAL.border.hairline,
  },
  triageCardAlert: {
    borderColor: `${SIGNAL.color.coral}55`,
    backgroundColor: `${SIGNAL.color.coral}08`,
  },
  triageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  triageIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  triageTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 14,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  triageSummary: {
    fontFamily: SIGNAL.font.body,
    fontSize: 11.5,
    color: SIGNAL.color.mute,
    marginTop: 2,
  },
  triageBody: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  triageGroup: {
    marginTop: 10,
  },
  triageGroupLabel: {
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 10.5,
    letterSpacing: 0.42,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  triageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  triageRowName: {
    flex: 1,
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 13,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  triageRowMeta: {
    fontFamily: SIGNAL.font.body,
    fontSize: 10.5,
    color: SIGNAL.color.mute,
    marginTop: 1,
  },
  triageTarget: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 11,
    color: SIGNAL.color.mute,
    minWidth: 50,
    textAlign: 'right',
  },

  // ── Hero status pill (gradient) ────────────────────────────────────────────
  heroPill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: SIGNAL.radius.card,
    marginBottom: 6,
  },
  heroPillNum: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 36,
    lineHeight: 40,
    color: '#fff',
    letterSpacing: SIGNAL.letter.numTight,
  },
  heroPillSub: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
  },

  // ── Mini avatar (triage rows) ──────────────────────────────────────────────
  miniAvatar: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniAvatarText: {
    color: '#fff',
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 11,
  },

  // ── Volume week dots ───────────────────────────────────────────────────────
  weekDots: {
    flexDirection: 'row',
    gap: 9,
  },
  weekDot: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 11,
    minWidth: 32,
    textAlign: 'right',
  },

  // ── Easy-pct number (right-aligned) ────────────────────────────────────────
  easyPctNum: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 15,
    letterSpacing: SIGNAL.letter.bodyTight,
    minWidth: 44,
    textAlign: 'right',
  },

  // ── ACWR row ───────────────────────────────────────────────────────────────
  acwrBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 7,
    alignItems: 'center',
  },
  acwrBadgeText: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 12,
    fontWeight: '700',
  },
  acwrAcute: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 10,
    color: SIGNAL.color.mute,
    minWidth: 54,
    textAlign: 'right',
  },
  acwrInfo: {
    fontFamily: SIGNAL.font.body,
    fontSize: 10.5,
    color: SIGNAL.color.mute,
    marginTop: 10,
    lineHeight: 16,
  },

  // ── Injury row ─────────────────────────────────────────────────────────────
  injuryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: `${SIGNAL.color.coral}22`,
  },
  injuryAvatar: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  injuryAvatarText: {
    color: '#fff',
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 12,
  },
  injuryName: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 13,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  injuryWhen: {
    fontFamily: SIGNAL.font.body,
    fontSize: 10.5,
    color: SIGNAL.color.mute,
  },
  injuryDetail: {
    fontFamily: SIGNAL.font.body,
    fontSize: 11.5,
    color: SIGNAL.color.inkSoft,
    marginTop: 2,
    lineHeight: 16,
  },
  injuryRec: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 11,
    marginTop: 3,
  },
  managedHeader: {
    ...SIGNAL.style.eyebrow,
    color: SIGNAL.color.cyan,
    marginTop: 14,
    marginBottom: 4,
  },
  managedCount: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 12,
    color: SIGNAL.color.cyan,
  },

  // ── Weekly check-in card ───────────────────────────────────────────────────
  weeklySectionHead: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 10.5,
    letterSpacing: 1.36,
    textTransform: 'uppercase',
    color: SIGNAL.color.mute,
    marginTop: 14,
    marginBottom: 8,
  },
  weeklyRow: {
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  weeklyRowHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
  },
  weeklyPreview: {
    fontFamily: SIGNAL.font.body,
    fontSize: 12.5,
    color: SIGNAL.color.inkSoft,
    marginTop: 3,
    lineHeight: 17,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  weeklyUnreadDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: SIGNAL.color.indigo,
  },
  weeklyReplyArea: {
    paddingTop: 4,
    paddingBottom: 12,
  },
  weeklyReplyInput: {
    minHeight: 70,
    padding: 10,
    borderRadius: 10,
    backgroundColor: SIGNAL.color.paper2,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    fontFamily: SIGNAL.font.body,
    fontSize: 13,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
    textAlignVertical: 'top',
  },
  weeklyReplySendBtn: {
    marginTop: 8,
    backgroundColor: SIGNAL.color.indigo,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  weeklyReplySendBtnDisabled: {
    backgroundColor: SIGNAL.color.line,
  },
  weeklyReplySendText: {
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 13,
    color: '#fff',
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  weeklyHistoryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingTop: 10,
  },
  weeklyHistoryLinkText: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 12,
    color: SIGNAL.color.indigo,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  weeklyMissingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  weeklyMissingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 6,
    paddingHorizontal: 10,
    paddingRight: 12,
    borderRadius: 999,
    backgroundColor: SIGNAL.color.paper2,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  weeklyMissingAvatar: {
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weeklyMissingAvatarText: {
    color: '#fff',
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 9.5,
  },
  weeklyMissingName: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 12,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
    maxWidth: 110,
  },

  // ── Section titles ─────────────────────────────────────────────────────────
  sectionTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 18,
    color: SIGNAL.color.indigo,
    letterSpacing: -0.36,
  },
  teamHeader: {
    paddingTop: 22,
    paddingBottom: 6,
    paddingHorizontal: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  shareLink: {
    ...SIGNAL.style.eyebrow,
    color: SIGNAL.color.indigo,
  },
  upcomingHeader: {
    paddingTop: 22,
    paddingBottom: 6,
    paddingHorizontal: 18,
  },

  // ── Timeframe + filters ────────────────────────────────────────────────────
  timeframeWrap: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 0,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingTop: 8,
    flexWrap: 'wrap',
  },
  groupChipRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingTop: 8,
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: SIGNAL.radius.chip,
    backgroundColor: SIGNAL.color.white,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  filterChipActive: {
    backgroundColor: SIGNAL.color.indigo,
    borderColor: SIGNAL.color.indigo,
  },
  filterChipText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 11,
    color: SIGNAL.color.inkSoft,
  },
  filterChipTextActive: {
    color: '#fff',
  },
  manageGroupsBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    justifyContent: 'center',
  },
  createGroupsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: SIGNAL.radius.button,
    backgroundColor: `${SIGNAL.color.indigo}${SIGNAL.tint.chip}`,
    borderWidth: 1,
    borderColor: `${SIGNAL.color.indigo}33`,
  },
  createGroupsBtnText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 13,
    color: SIGNAL.color.indigo,
  },
  refreshingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  refreshingText: {
    fontFamily: SIGNAL.font.body,
    fontSize: 12,
    color: SIGNAL.color.mute,
  },

  // ── Roster ─────────────────────────────────────────────────────────────────
  rosterWrap: {
    paddingHorizontal: 14,
    paddingTop: 12,
    gap: 8,
  },
  groupSection: {
    marginBottom: 14,
  },
  groupHeader: {
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 11,
    letterSpacing: 0.44,
    textTransform: 'uppercase',
    color: SIGNAL.color.indigo,
    marginBottom: 8,
    marginTop: 4,
  },
  athleteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    ...SIGNAL.border.hairline,
  },
  athleteRank: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 13,
    color: SIGNAL.color.mute2,
    width: 18,
    textAlign: 'center',
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  athleteAvatar: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  athleteAvatarText: {
    color: '#fff',
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 13,
  },
  athleteNameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  athleteName: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 14,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
    flexShrink: 1,
  },
  athleteYear: {
    fontFamily: SIGNAL.font.body,
    fontSize: 10.5,
    color: SIGNAL.color.mute,
  },
  athleteSub: {
    fontFamily: SIGNAL.font.body,
    fontSize: 11,
    color: SIGNAL.color.mute,
    marginTop: 1,
  },
  athleteMilesBox: {
    alignItems: 'flex-end',
  },
  athleteMilesNum: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 16,
    color: SIGNAL.color.indigo,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  athleteMilesLabel: {
    fontFamily: SIGNAL.font.body,
    fontSize: 9,
    color: SIGNAL.color.mute,
    letterSpacing: 0.72,
  },
  athleteXtLabel: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 9,
    color: SIGNAL.color.cyan,
    marginTop: 1,
  },
  athleteBreakout: { fontFamily: SIGNAL.font.body, fontSize: 9.5, color: SIGNAL.color.mute, marginTop: 2 },
  xtToggle: {
    paddingVertical: 5, paddingHorizontal: 12,
    borderRadius: SIGNAL.radius.chip,
    backgroundColor: SIGNAL.color.white,
    borderWidth: 1, borderColor: SIGNAL.color.line,
  },
  xtToggleActive: { backgroundColor: SIGNAL.color.indigo, borderColor: SIGNAL.color.indigo },
  xtToggleText: { fontFamily: SIGNAL.font.bodySemi, fontSize: 11, color: SIGNAL.color.inkSoft },
  xtToggleTextActive: { color: '#fff' },
  chevron: {
    fontSize: 18,
    color: SIGNAL.color.mute2,
  },

  // ── Empty / placeholder ────────────────────────────────────────────────────
  emptyCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: 18,
    alignItems: 'center',
    gap: 8,
    ...SIGNAL.border.hairline,
  },
  emptyText: {
    fontFamily: SIGNAL.font.body,
    fontSize: 13,
    color: SIGNAL.color.mute,
    textAlign: 'center',
  },
  emptySubText: {
    fontFamily: SIGNAL.font.body,
    fontSize: 12,
    color: SIGNAL.color.mute,
  },
  emptyCodeMono: {
    fontFamily: SIGNAL.font.mono,
    color: SIGNAL.color.ink,
  },

  // ── Upcoming training ──────────────────────────────────────────────────────
  upcomingWrap: {
    paddingHorizontal: 14,
    gap: 8,
  },
  upcomingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 14,
    ...SIGNAL.border.hairline,
  },
  upcomingDate: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 10.5,
    color: SIGNAL.color.mute,
    marginTop: 1,
  },

  // ── Sub-screen overlay ─────────────────────────────────────────────────────
  subScreen: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    bottom: Platform.OS === 'ios' ? 82 : 56,
    backgroundColor: SIGNAL.color.paper2,
    zIndex: 10,
  },

  // ── Bottom nav ─────────────────────────────────────────────────────────────
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderTopWidth: 1,
    borderTopColor: SIGNAL.color.line,
    paddingTop: 10,
    paddingBottom: bottomInset(10, 24),
    zIndex: 20,
  },
  bottomNavBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  bottomNavLabel: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 11,
    color: SIGNAL.color.mute2,
  },
  bottomNavLabelActive: {
    color: SIGNAL.color.indigo,
  },
  badge: {
    position: 'absolute',
    top: -4, right: -8,
    backgroundColor: SIGNAL.color.coral,
    borderRadius: 9,
    minWidth: 18, height: 18,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 10,
  },

  // ── Daily message modal ────────────────────────────────────────────────────
  tipModal: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },
  tipModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    paddingTop: 60,
    backgroundColor: SIGNAL.color.white,
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  tipModalTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 17,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  tipModalCancel: {
    fontFamily: SIGNAL.font.bodyMedium,
    color: SIGNAL.color.indigo,
    fontSize: 15,
    width: 60,
  },
  tipModalBody: { padding: 18 },
  tipModalEyebrow: {
    ...SIGNAL.style.eyebrow,
    marginBottom: 8,
  },
  tipModalSubtitle: {
    fontFamily: SIGNAL.font.body,
    fontSize: 13,
    color: SIGNAL.color.mute,
    lineHeight: 20,
    marginBottom: 16,
  },
  tipModalInput: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: 16,
    fontFamily: SIGNAL.font.body,
    fontSize: 15,
    color: SIGNAL.color.ink,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    minHeight: 180,
    textAlignVertical: 'top',
    lineHeight: 22,
    marginBottom: 12,
  },
  tipModalHint: {
    fontFamily: SIGNAL.font.body,
    fontSize: 11.5,
    color: SIGNAL.color.mute,
    marginBottom: 22,
    lineHeight: 17,
  },
  tipSendBtn: {
    borderRadius: SIGNAL.radius.button,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 36,
  },
  tipSendBtnText: {
    color: '#fff',
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 15,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
});
