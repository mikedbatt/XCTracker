import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc, getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';
import { autoSyncStrava } from '../stravaConfig';
import {
  BRAND, BRAND_ACCENT, BRAND_DARK, BRAND_LIGHT,
  EFFORT_COLORS as DESIGN_EFFORT_COLORS, EFFORT_LABELS as DESIGN_EFFORT_LABELS,
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE, STATUS, STRAVA_ORANGE,
  getTeamAccent,
} from '../constants/design';
import {
  DEFAULT_ZONE_BOUNDARIES, ZONE_META,
  calc8020,
  calcMaxHR,
  calcZoneBreakdownFromRuns, calcZoneBreakdownFromStream,
  formatMinutes,
  parseBirthdate,
} from '../zoneConfig';
import { PACE_ZONES, calcPaceZoneBreakdown, calcPace8020, formatPace } from '../utils/vdotUtils';
import AthleteProfile from './AthleteProfile';
import CalendarScreen from './CalendarScreen';
import { TYPE_COLORS, WORKOUT_PACE_ZONE } from '../constants/training';
import DatePickerField from './DatePickerField';
import RunDetailModal from './RunDetailModal';
import { getActiveSeason, getCompletedSeasons } from './SeasonPlanner';
import SeasonReview from './SeasonReview';
import StravaConnect from './StravaConnect';
import ChannelList from './ChannelList';
import TeammateProfile from './TeammateProfile';
import TimeframePicker, { TIMEFRAMES, getDateRange } from './TimeframePicker';
import WellnessCheckIn from './WellnessCheckIn';
import WorkoutDetailModal from './WorkoutDetailModal';
import AthleteAnalytics from './AthleteAnalytics';

const EFFORT_LABELS = DESIGN_EFFORT_LABELS;
const EFFORT_COLORS = DESIGN_EFFORT_COLORS;

function calcWeeklyTarget(recentRuns) {
  if (!recentRuns || recentRuns.length === 0) return 20;
  const now = new Date();
  const oneWeekAgo  = new Date(now - 7  * 86400000);
  const twoWeeksAgo = new Date(now - 14 * 86400000);
  const lastWeekMiles = recentRuns
    .filter(r => { const d = r.date?.toDate?.(); return d >= oneWeekAgo; })
    .reduce((s, r) => s + (r.miles || 0), 0);
  const prevWeekMiles = recentRuns
    .filter(r => { const d = r.date?.toDate?.(); return d >= twoWeeksAgo && d < oneWeekAgo; })
    .reduce((s, r) => s + (r.miles || 0), 0);
  const baseline = lastWeekMiles || prevWeekMiles || 15;
  return Math.round(baseline * 1.10 * 10) / 10;
}

function getWeekStart() {
  const now  = new Date();
  const day  = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function buildZoneBreakdown(runs, maxHR, boundaries, athleteAge, customMaxHR) {
  const combined = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
  let hasAnyStreamData = false;

  runs.forEach(run => {
    if (run.rawHRStream?.length > 0) {
      const bd = calcZoneBreakdownFromStream(run.rawHRStream, maxHR, boundaries);
      if (bd) {
        bd.forEach(z => { combined['z' + z.zone] = (combined['z' + z.zone] || 0) + z.seconds; });
        hasAnyStreamData = true;
      }
    } else if (run.hasStreamData && run.zoneSeconds) {
      Object.entries(run.zoneSeconds).forEach(([k, v]) => {
        if (combined[k] !== undefined) combined[k] += v;
      });
      hasAnyStreamData = true;
    } else if (run.heartRate && run.duration) {
      const bd = calcZoneBreakdownFromRuns([run], athleteAge, customMaxHR, boundaries);
      if (bd) {
        bd.forEach(z => { combined['z' + z.zone] = (combined['z' + z.zone] || 0) + z.seconds; });
      }
    }
  });

  const totalSecs = Object.values(combined).reduce((s, v) => s + v, 0);
  if (totalSecs === 0) return null;

  const breakdown = Object.entries(combined)
    .filter(([, s]) => s > 0)
    .map(([key, secs]) => {
      const zone = parseInt(key.replace('z', ''));
      return { zone, seconds: secs, minutes: Math.round(secs / 60), pct: Math.round((secs / totalSecs) * 100), ...ZONE_META[zone] };
    })
    .sort((a, b) => a.zone - b.zone);

  return { breakdown, hasStreamData: hasAnyStreamData };
}

export default function AthleteDashboard({ userData: userDataProp }) {
  const [userOverrides,        setUserOverrides]        = useState({});
  const userData = { ...userDataProp, ...userOverrides };
  const [school,               setSchool]               = useState(null);
  const [recentRuns,           setRecentRuns]           = useState([]);
  const [weekRuns,             setWeekRuns]             = useState([]);
  const [upcomingWorkouts,     setUpcomingWorkouts]     = useState([]);
  const [teamAthletes,         setTeamAthletes]         = useState([]);
  const [weeklyMiles,          setWeeklyMiles]          = useState(0);
  const [weeklyTarget,         setWeeklyTarget]         = useState(20);
  const [totalMiles,           setTotalMiles]           = useState(0);
  const [teamMiles,            setTeamMiles]            = useState({});
  const [pendingParents,       setPendingParents]       = useState([]);
  const [loading,              setLoading]              = useState(true);
  const [autoSyncing,          setAutoSyncing]          = useState(false);
  const [calendarVisible,      setCalendarVisible]      = useState(false);
  const [selectedTimeframe,    setSelectedTimeframe]    = useState(TIMEFRAMES[0]);
  const [customStart,          setCustomStart]          = useState(null);
  const [customEnd,            setCustomEnd]            = useState(null);
  const [selectedRun,          setSelectedRun]          = useState(null);
  const [runDetailVisible,     setRunDetailVisible]     = useState(false);
  const [selectedWorkout,      setSelectedWorkout]      = useState(null);
  const [workoutDetailVisible, setWorkoutDetailVisible] = useState(false);
  const [wellnessVisible,      setWellnessVisible]      = useState(false);
  const [stravaVisible,        setStravaVisible]        = useState(false);
  const [selectedTeammate,     setSelectedTeammate]     = useState(null);
  const [dailyMessage,         setDailyMessage]         = useState(null);
  const [profileVisible,       setProfileVisible]       = useState(false);
  const [statsVisible,         setStatsVisible]         = useState(false);
  const [feedVisible,          setFeedVisible]          = useState(false);
  const [unreadFeedCount,      setUnreadFeedCount]      = useState(0);
  const [messageModalVisible,  setMessageModalVisible]  = useState(false);
  const [pendingWellness,      setPendingWellness]      = useState(null);
  const [logModalVisible,      setLogModalVisible]      = useState(false);
  const [effortPickerRun,      setEffortPickerRun]      = useState(null);
  const [activeTab,            setActiveTab]            = useState('home');
  const [localAvatarColor,     setLocalAvatarColor]     = useState(userData.avatarColor || BRAND);
  const [stravaLinked,         setStravaLinked]         = useState(true); // default true to avoid flash
  const [stravaDismissed,      setStravaDismissed]      = useState(false);
  const [benchmarkDismissed,   setBenchmarkDismissed]   = useState(false);
  const [leaderPaceExpanded,   setLeaderPaceExpanded]   = useState(false);
  const [seasonReviewVisible,  setSeasonReviewVisible]  = useState(false);
  const [seasonReviewSeason,   setSeasonReviewSeason]   = useState(null);
  const [reviewDismissed,      setReviewDismissed]      = useState(userData.reviewedSeasons || {});
  const [todayCheckinDone,     setTodayCheckinDone]     = useState(true); // default true to avoid flash
  const [wellnessCardDismissed, setWellnessCardDismissed] = useState(false);
  const [zoneExpanded, setZoneExpanded] = useState(false);
  const [dailyWellnessVisible, setDailyWellnessVisible] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [athleteAge,           setAthleteAge]           = useState(16);
  const [teamZoneSettings,     setTeamZoneSettings]     = useState(null);
  const [miles,        setMiles]        = useState('');
  const [duration,     setDuration]     = useState('');
  const [heartRate,    setHeartRate]    = useState('');
  const [effort,       setEffort]       = useState(5);
  const [notes,        setNotes]        = useState('');
  const [runDate,      setRunDate]      = useState(new Date());
  const [savingRun,    setSavingRun]    = useState(false);
  const [editingRunId, setEditingRunId] = useState(null);
  const [hrZonePref,   setHrZonePref]   = useState(userData.showHRZones);
  const [myGroup,      setMyGroup]      = useState(null);
  const [leaderboardFilter, setLeaderboardFilter] = useState('all');

  useEffect(() => {
    setZoneExpanded(false);
    loadDashboard();
  }, [selectedTimeframe]);

  // Animate progress bar when weeklyMiles or target changes
  useEffect(() => {
    const pct = weeklyTarget > 0 ? Math.min(weeklyMiles / weeklyTarget, 1) : 0;
    const target = pct * 100;
    // Don't reset to 0 — animate from current position to new target
    Animated.timing(progressAnim, {
      toValue: target,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [weeklyMiles, weeklyTarget]);

  useEffect(() => {
    triggerAutoSync();
  }, []);

  const triggerAutoSync = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists() || !userDoc.data().stravaAccessToken) return;
      setAutoSyncing(true);
      const result = await autoSyncStrava(user.uid, userData, teamZoneSettings);
      if (result?.imported > 0) {
        await loadDashboard();
      }
    } catch (e) {
      console.warn('Auto-sync trigger:', e);
    } finally {
      setAutoSyncing(false);
    }
  };

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const user = auth.currentUser;

      if (userData.birthdate) {
        const birth = parseBirthdate(userData.birthdate);
        setAthleteAge(Math.floor((new Date() - birth) / (365.25 * 86400000)));
      }

      if (userData.schoolId) {
        try {
          const teamZoneDoc = await getDoc(doc(db, 'teamZoneSettings', userData.schoolId));
          if (teamZoneDoc.exists()) setTeamZoneSettings(teamZoneDoc.data());
        } catch (e) { console.warn('Failed to load team zone settings, using defaults:', e); }
      }

      let currentSchool = school;
      let loadedGroup = null;
      if (userData.schoolId) {
        const schoolDoc = await getDoc(doc(db, 'schools', userData.schoolId));
        if (schoolDoc.exists()) { currentSchool = schoolDoc.data(); setSchool(currentSchool); }

        // Load athlete's group and its weekly target
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          const groupId = userDoc.data()?.groupId;
          if (groupId) {
            const groupDoc = await getDoc(doc(db, 'groups', groupId));
            if (groupDoc.exists()) {
              loadedGroup = { id: groupDoc.id, ...groupDoc.data() };
              setMyGroup(loadedGroup);
              // Use week-specific plan target, fall back to default
              const now = new Date();
              const d = now.getDay();
              const mon = new Date(now);
              mon.setDate(now.getDate() - (d === 0 ? 6 : d - 1));
              const mondayISO = mon.toISOString().split('T')[0];
              const weekTarget = loadedGroup.weeklyPlan?.[mondayISO] ?? loadedGroup.weeklyMilesTarget;
              if (weekTarget) setWeeklyTarget(weekTarget);
            }
          } else {
            setMyGroup(null);
          }
        } catch (e) { console.warn('Failed to load athlete group:', e); }
      }

      const activeSeason = getActiveSeason(currentSchool);
      const { start: startDate, end: endDate } = getDateRange(selectedTimeframe, activeSeason, customStart, customEnd);

      const runsQuery = startDate
        ? query(collection(db, 'runs'), where('userId', '==', user.uid), where('date', '>=', startDate), orderBy('date', 'desc'), limit(200))
        : query(collection(db, 'runs'), where('userId', '==', user.uid), orderBy('date', 'desc'), limit(200));

      const runsSnap = await getDocs(runsQuery);
      const runs = runsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => {
        const d = r.date?.toDate?.();
        if (!d) return false;
        if (startDate && d < startDate) return false;
        if (endDate && d > endDate) return false;
        return true;
      });
      setRecentRuns(runs);

      const tMiles = runs.reduce((s, r) => s + (r.miles || 0), 0);
      setTotalMiles(Math.round(tMiles * 10) / 10);

      // Always fetch current week miles separately (independent of timeframe picker)
      const weekStart = getWeekStart();
      try {
        const weekRunsSnap = await getDocs(query(
          collection(db, 'runs'), where('userId', '==', user.uid),
          where('date', '>=', weekStart), orderBy('date', 'desc')
        ));
        const wRunDocs = weekRunsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setWeekRuns(wRunDocs);
        const wMiles = wRunDocs.reduce((s, r) => s + (r.miles || 0), 0);
        setWeeklyMiles(Math.round(wMiles * 10) / 10);
      } catch (e) {
        // Fallback: use filtered runs if separate query fails
        const wFiltered = runs.filter(r => { const d = r.date?.toDate?.(); return d && d >= weekStart; });
        setWeekRuns(wFiltered);
        const wMiles = wFiltered.reduce((s, r) => s + (r.miles || 0), 0);
        setWeeklyMiles(Math.round(wMiles * 10) / 10);
      }

      // Only use 110% fallback target if athlete isn't in a group with a target
      if (!loadedGroup?.weeklyMilesTarget) {
        const fourWeeksAgo = new Date(Date.now() - 28 * 86400000);
        const recentForTarget = await getDocs(query(collection(db, 'runs'), where('userId', '==', user.uid), where('date', '>=', fourWeeksAgo), orderBy('date', 'desc')));
        setWeeklyTarget(calcWeeklyTarget(recentForTarget.docs.map(d => d.data())));
      }

      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const freshData = userDoc.data();
        setStravaLinked(!!freshData.stravaAccessToken);
        const allParentIds = [...(freshData.linkedParentIds || []), ...(freshData.pendingParentIds || [])];
        const uniqueParentIds = [...new Set(allParentIds)];
        if (uniqueParentIds.length > 0) {
          const parentData = [];
          for (const pid of uniqueParentIds) {
            const pDoc = await getDoc(doc(db, 'users', pid));
            if (pDoc.exists()) parentData.push({ id: pDoc.id, ...pDoc.data() });
          }
          setPendingParents(parentData);
        } else {
          setPendingParents([]);
        }
      }

      // Check if daily wellness check-in has been done
      try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const checkinSnap = await getDocs(query(
          collection(db, 'checkins'),
          where('userId', '==', user.uid)
        ));
        const doneToday = checkinSnap.docs.some(d => {
          const ts = d.data().date;
          const dt = ts && ts.toDate ? ts.toDate() : new Date(ts);
          return dt >= todayStart;
        });
        setTodayCheckinDone(doneToday);
      } catch (e) {
        console.warn('Check-in query failed:', e);
        setTodayCheckinDone(false);
      }

      if (userData.schoolId) {
        try {
          const today = new Date().toISOString().split('T')[0];
          const msgDoc = await getDoc(doc(db, 'dailyMessages', userData.schoolId + '_' + today));
          if (msgDoc.exists()) {
            setDailyMessage(msgDoc.data());
            const userDoc2 = await getDoc(doc(db, 'users', user.uid));
            if (userDoc2.data()?.lastSeenMessageDate !== today) {
              setMessageModalVisible(true);
              await updateDoc(doc(db, 'users', user.uid), { lastSeenMessageDate: today });
            }
          } else { setDailyMessage(null); }
        } catch (e) { console.warn('Daily message load:', e); }
      }

      if (userData.status === 'approved' && userData.schoolId) {
        try {
          const todayStart = new Date(); todayStart.setHours(0,0,0,0);
          const wSnap = await getDocs(query(collection(db, 'events'), where('schoolId', '==', userData.schoolId), where('category', '==', 'Training'), where('date', '>=', todayStart), orderBy('date', 'asc'), limit(3)));
          setUpcomingWorkouts(wSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) { console.warn('Upcoming workouts:', e); }

        try {
          const athleteSnap = await getDocs(query(collection(db, 'users'), where('schoolId', '==', userData.schoolId), where('role', '==', 'athlete'), where('status', '==', 'approved')));
          const athletes = athleteSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          setTeamAthletes(athletes);
          const milesMap = {};
          milesMap[user.uid] = tMiles;
          await Promise.all(athletes.map(async (athlete) => {
            if (athlete.id === user.uid) return;
            try {
              const snap = await getDocs(query(collection(db, 'runs'), where('userId', '==', athlete.id), orderBy('date', 'desc')));
              const filtered = snap.docs.filter(d => {
                if (!startDate && !endDate) return true;
                const rd = d.data().date?.toDate?.();
                if (!rd) return false;
                if (startDate && rd < startDate) return false;
                if (endDate && rd > endDate) return false;
                return true;
              });
              milesMap[athlete.id] = Math.round(filtered.reduce((s, d) => s + (d.data().miles || 0), 0) * 10) / 10;
            } catch (e) { console.warn('Failed to load miles for athlete:', e); milesMap[athlete.id] = 0; }
          }));
          setTeamMiles(milesMap);
        } catch (e) { console.warn('Team athletes:', e); }
      }
    } catch (error) { console.error('Dashboard load error:', error); }

    // Count unread feed posts (single-field query to avoid composite index requirement)
    try {
      if (userData.schoolId) {
        const freshUserDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        const lastSeenChannels = freshUserDoc.data()?.lastSeenChannels || {};
        if (!lastSeenChannels.whole_team && freshUserDoc.data()?.lastSeenFeed) {
          lastSeenChannels.whole_team = freshUserDoc.data().lastSeenFeed;
        }
        // Build set of channels this athlete belongs to
        const myChannelKeys = new Set(['whole_team']);
        if (userData.groupId) myChannelKeys.add(`group_${userData.groupId}`);
        if (userData.gender) myChannelKeys.add(userData.gender);

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
      }
    } catch (e) { console.warn('Unread feed count failed:', e); setUnreadFeedCount(0); }

    setLoading(false);
  };

  if (selectedTeammate) return <TeammateProfile athlete={selectedTeammate} school={school} onBack={() => setSelectedTeammate(null)} />;

  const handleQuickEffort = async (run, effortValue) => {
    try {
      await updateDoc(doc(db, 'runs', run.id), { effort: effortValue });
      setEffortPickerRun(null);
      loadDashboard();
    } catch (e) {
      console.error('Failed to save effort:', e);
      Alert.alert('Error', 'Could not save effort rating.');
    }
  };

  const handleLogRunTap = () => setLogModalVisible(true);

  const handleLogRun = async () => {
    if (!miles || isNaN(parseFloat(miles))) { Alert.alert('Missing info', 'Please enter the miles for this run.'); return; }
    setSavingRun(true);
    try {
      const user = auth.currentUser;
      const milesFloat = parseFloat(miles);
      if (editingRunId) {
        const { doc: fsDoc, updateDoc: fsUpdate, getDoc: fsGet } = await import('firebase/firestore');
        const oldSnap = await fsGet(fsDoc(db, 'runs', editingRunId));
        const oldMiles = oldSnap.data()?.miles || 0;
        await fsUpdate(fsDoc(db, 'runs', editingRunId), { miles: milesFloat, duration: duration || null, heartRate: heartRate ? parseInt(heartRate) : null, effort, notes: notes || null, date: runDate });
        await updateDoc(doc(db, 'users', user.uid), { totalMiles: Math.max(0, Math.round(((totalMiles || 0) - oldMiles + milesFloat) * 10) / 10) });
        Alert.alert('Updated! ✅', 'Your run has been updated.');
        setEditingRunId(null);
      } else {
        // Wellness check-ins are now handled via the daily card, not per-run
        await addDoc(collection(db, 'runs'), { userId: user.uid, schoolId: userData.schoolId || null, miles: milesFloat, duration: duration || null, heartRate: heartRate ? parseInt(heartRate) : null, effort, notes: notes || null, source: 'manual', date: runDate });
        await updateDoc(doc(db, 'users', user.uid), { totalMiles: Math.round(((totalMiles || 0) + milesFloat) * 10) / 10 });
        Alert.alert('Run logged! 🏃', miles + ' miles saved. Great work!');
      }
      setLogModalVisible(false); setPendingWellness(null);
      setMiles(''); setDuration(''); setHeartRate(''); setEffort(5); setNotes(''); setRunDate(new Date());
      loadDashboard();
    } catch (error) { console.error(error); Alert.alert('Error', 'Could not save run. Please try again.'); }
    setSavingRun(false);
  };

  const handleDeleteRun = (run) => {
    Alert.alert('Delete run?', 'Delete your ' + run.miles + ' mile run? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          const { deleteDoc, doc: firestoreDoc } = await import('firebase/firestore');
          await deleteDoc(firestoreDoc(db, 'runs', run.id));
          await updateDoc(doc(db, 'users', auth.currentUser.uid), { totalMiles: Math.max(0, Math.round(((totalMiles || 0) - (run.miles || 0)) * 10) / 10) });
          Alert.alert('Deleted', 'Run removed.');
          setRunDetailVisible(false); setSelectedRun(null); loadDashboard();
        } catch { Alert.alert('Error', 'Could not delete run.'); }
      }},
    ]);
  };

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => signOut(auth) }]);
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color="#2e7d32" /></View>;

  const primaryColor = school?.primaryColor || BRAND;
  const isApproved = userData.status === 'approved';
  const targetPct = weeklyTarget > 0 ? Math.min(weeklyMiles / weeklyTarget, 1) : 0;
  const rawPct = weeklyTarget > 0 ? weeklyMiles / weeklyTarget : 0;
  const overPct = rawPct > 1 ? Math.round((rawPct - 1) * 100) : 0;
  const isOverWarning = rawPct > 1.1;   // >110% — red warning
  const isOverBuffer = rawPct > 1 && rawPct <= 1.1;  // 100-110% — gentle note
  const sortedTeam = [...teamAthletes].sort((a, b) => (teamMiles[b.id] || 0) - (teamMiles[a.id] || 0));
  const myRank = sortedTeam.findIndex(a => a.id === auth.currentUser?.uid) + 1;

  const boundaries = teamZoneSettings?.boundaries || DEFAULT_ZONE_BOUNDARIES;
  const customMaxHR = teamZoneSettings?.customMaxHR || null;
  const maxHR = calcMaxHR(athleteAge, customMaxHR);
  const zoneResult = buildZoneBreakdown(recentRuns, maxHR, boundaries, athleteAge, customMaxHR);
  const breakdown = zoneResult?.breakdown || null;
  const hasStreamData = zoneResult?.hasStreamData || false;
  const analysis = breakdown ? calc8020(breakdown) : null;
  const totalZoneMins = breakdown ? breakdown.reduce((s, z) => s + z.minutes, 0) : 0;

  // Pace zones — compute from runs that have rawPaceStream data
  const trainingPaces = userData.trainingPaces || null;

  // Helper to compute pace breakdown from a set of runs
  const computePaceBreakdown = (runs) => {
    if (!trainingPaces) return { breakdown: null, analysis: null };
    const combined = { e: 0, m: 0, t: 0, i: 0, r: 0 };
    for (const r of runs) {
      if (r.rawPaceStream?.length > 0) {
        const zones = calcPaceZoneBreakdown(r.rawPaceStream, trainingPaces);
        Object.keys(zones).forEach(k => { combined[k] += zones[k]; });
      } else if (r.paceZoneSeconds) {
        Object.keys(r.paceZoneSeconds).forEach(k => { combined[k] += (r.paceZoneSeconds[k] || 0); });
      }
    }
    const total = Object.values(combined).reduce((s, v) => s + v, 0);
    if (total <= 0) return { breakdown: null, analysis: null };
    return {
      breakdown: PACE_ZONES.map(z => ({
        ...z,
        seconds: combined[z.key],
        minutes: Math.round(combined[z.key] / 60),
        pct: Math.round((combined[z.key] / total) * 100),
      })).filter(z => z.seconds > 0),
      analysis: calcPace8020(combined),
    };
  };

  // Hero card: always this week's pace data
  const { breakdown: weekPaceBreakdown, analysis: weekPaceAnalysis } = computePaceBreakdown(weekRuns);
  // Leaderboard: selected timeframe pace data
  const { breakdown: paceBreakdown, analysis: paceAnalysis } = computePaceBreakdown(recentRuns);

  // Show HR zones if explicitly enabled, or auto-show when preference not yet set and HR data exists
  const coachDisabledHR = teamZoneSettings?.hrZonesDisabled === true;
  const showHRZones = !coachDisabledHR && !paceBreakdown && (hrZonePref === true || (hrZonePref !== false && breakdown !== null));

  // Check if VDOT paces are stale (>30 days since last update)
  const vdotStale = (() => {
    if (!userData.trainingPaces || !userData.vdotUpdatedAt) return false;
    const updatedAt = new Date(userData.vdotUpdatedAt);
    return (Date.now() - updatedAt.getTime()) > 30 * 86400000;
  })();

  const avatarColor = localAvatarColor;
  // No interpolation needed — just multiply by 100 for percentage display
  // The Animated.View width is set inline below

  return (
    <View style={styles.container}>
      {/* ── Clean white header ── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>Hey, {userData.firstName}</Text>
            <Text style={styles.schoolName}>{school?.name || 'TeamBase'}</Text>
          </View>
          <TouchableOpacity onPress={() => { setActiveTab('home'); setProfileVisible(true); }} style={styles.profileBtn}>
            <View style={[styles.profileAvatar, { backgroundColor: avatarColor }]}>
              <Text style={styles.profileAvatarText}>{userData.firstName?.[0]}{userData.lastName?.[0]}</Text>
            </View>
            {pendingParents.length > 0 && (
              <View style={styles.profileBadge}>
                <Text style={styles.profileBadgeText}>{pendingParents.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={messageModalVisible} transparent animationType="fade">
        <View style={styles.msgModalOverlay}>
          <View style={styles.msgModal}>
            <View style={styles.msgModalHeader}>
              <Text style={styles.msgModalTitle}>📣 Message from Coach</Text>
              <Text style={styles.msgModalDate}>Today</Text>
            </View>
            <Text style={styles.msgModalText}>{dailyMessage?.message}</Text>
            <Text style={styles.msgModalFrom}>— {dailyMessage?.sentByName}</Text>
            <TouchableOpacity style={styles.msgModalBtn} onPress={() => setMessageModalVisible(false)}>
              <Text style={styles.msgModalBtnText}>Got it 👍</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {autoSyncing && (
          <View style={styles.syncingBar}>
            <ActivityIndicator size="small" color={BRAND} />
            <Text style={styles.syncingText}>Syncing Strava...</Text>
          </View>
        )}

        {!isApproved && (
          <View style={styles.pendingBanner}>
            <Text style={styles.pendingText}>Awaiting coach approval — you can log runs in the meantime!</Text>
          </View>
        )}

        {/* ── Weekly miles card (compact) ── */}
        <View style={[styles.heroCard, isOverWarning && styles.heroCardOver]}>
          <View style={styles.heroTopRow}>
            <Text style={styles.heroLabel}>This week</Text>
            {isOverWarning ? (
              <View style={styles.heroOverRow}>
                <Ionicons name="warning-outline" size={12} color={STATUS.error} />
                <Text style={styles.heroOverText}>{overPct}% over</Text>
              </View>
            ) : isOverBuffer ? (
              <Text style={[styles.heroProgressHint, { color: STATUS.warning }]}>{overPct}% over</Text>
            ) : targetPct >= 1 ? (
              <Text style={[styles.heroProgressHint, { color: BRAND }]}>Target hit!</Text>
            ) : (
              <Text style={styles.heroProgressHint}>{Math.round((weeklyTarget - weeklyMiles) * 10) / 10} mi to go</Text>
            )}
          </View>
          <View style={styles.heroMilesRow}>
            <Text style={[styles.heroMilesNum, isOverWarning && { color: STATUS.error }]}>{weeklyMiles}</Text>
            <Text style={styles.heroMilesOf}> / {weeklyTarget} mi</Text>
            <View style={{ flex: 1 }} />
            <View style={[styles.heroProgressBg, isOverWarning && { backgroundColor: STATUS.errorBg }]}>
              <Animated.View style={[styles.heroProgressFill, {
                width: progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'], extrapolate: 'clamp' }),
                backgroundColor: isOverWarning ? STATUS.error : isOverBuffer ? STATUS.warning : BRAND,
              }]} />
            </View>
          </View>

          {/* Pace zone dropdown (always shows this week's data regardless of timeframe picker) */}
          {weekPaceBreakdown && (
            <>
              <TouchableOpacity style={styles.zoneToggle} onPress={() => setZoneExpanded(e => !e)} activeOpacity={0.7}>
                <View style={styles.zoneToggleLeft}>
                  <View style={styles.zoneStackedBarSmall}>
                    {weekPaceBreakdown.map(z => <View key={z.key} style={[styles.zoneStackedSegment, { flex: z.minutes || 1, backgroundColor: z.color }]} />)}
                  </View>
                  <Text style={styles.zoneToggleText}>Pace zones</Text>
                  <View style={styles.streamBadge}><Text style={styles.streamBadgeText}>GPS</Text></View>
                </View>
                <Ionicons name={zoneExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={NEUTRAL.muted} />
              </TouchableOpacity>
              {zoneExpanded && (
                <View style={styles.zoneDropdown}>
                  {weekPaceBreakdown.map(z => (
                    <View key={z.key} style={styles.zoneRow}>
                      <View style={[styles.zoneDot, { backgroundColor: z.color }]} />
                      <Text style={styles.zoneName}>{z.short} {z.name}</Text>
                      <View style={styles.zoneBarBg}><View style={[styles.zoneBarFill, { width: z.pct + '%', backgroundColor: z.color }]} /></View>
                      <Text style={styles.zoneTime}>{formatMinutes(z.minutes)}</Text>
                    </View>
                  ))}
                  {weekPaceAnalysis && (
                    <View style={[styles.analysis8020, { backgroundColor: weekPaceAnalysis.status === 'great' ? '#e8f5e9' : weekPaceAnalysis.status === 'good' ? '#fff8e1' : '#fce4ec' }]}>
                      <Text style={[styles.analysis8020Text, { color: weekPaceAnalysis.status === 'great' ? BRAND : weekPaceAnalysis.status === 'good' ? STATUS.warning : STATUS.error }]}>
                        Easy: {weekPaceAnalysis.easyPct}% · Hard: {weekPaceAnalysis.hardPct}% {weekPaceAnalysis.status === 'great' ? '— Great balance!' : weekPaceAnalysis.status === 'good' ? '— Good, aim for more easy' : '— Too hard, slow down easy days'}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </>
          )}

        </View>

        {/* ── Season in Review banner ── */}
        {(() => {
          if (!school) return null;
          const completed = getCompletedSeasons(school);
          const unreviewedSeason = completed.find(s => !reviewDismissed[`${s.sport}_${s.championshipDate}`]);
          if (!unreviewedSeason) return null;
          const sportDef = { cross_country: 'Cross Country', indoor_track: 'Indoor Track', outdoor_track: 'Outdoor Track' };
          return (
            <View style={styles.vdotCard}>
              <View style={styles.stravaCardTop}>
                <View style={styles.stravaCardLeft}>
                  <View style={[styles.stravaLogo, { backgroundColor: '#e8f5e9' }]}>
                    <Ionicons name="trophy-outline" size={18} color={STATUS.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stravaCardTitle}>Season Complete!</Text>
                    <Text style={styles.stravaCardDesc}>Your {sportDef[unreviewedSeason.sport] || 'season'} season is in the books. See your recap.</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={async () => {
                  const key = `${unreviewedSeason.sport}_${unreviewedSeason.championshipDate}`;
                  setReviewDismissed(prev => ({ ...prev, [key]: true }));
                  try { await updateDoc(doc(db, 'users', auth.currentUser.uid), { [`reviewedSeasons.${key}`]: true }); } catch (e) { console.warn('Save review dismiss:', e); }
                }} style={styles.stravaCloseBtn}>
                  <Ionicons name="close" size={18} color={NEUTRAL.muted} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={[styles.stravaConnectBtn, { backgroundColor: STATUS.success }]} onPress={() => { setSeasonReviewSeason(unreviewedSeason); setSeasonReviewVisible(true); }}>
                <Text style={styles.stravaConnectText}>View Season in Review</Text>
                <Ionicons name="arrow-forward" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          );
        })()}

        {/* ── Daily wellness check-in prompt ── */}
        {!todayCheckinDone && !wellnessCardDismissed && (
          <View style={styles.wellnessCard}>
            <View style={styles.wellnessCardTop}>
              <View style={styles.wellnessCardLeft}>
                <View style={styles.wellnessIcon}><Ionicons name="heart-circle-outline" size={24} color={BRAND} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.wellnessCardTitle}>How are you feeling today?</Text>
                  <Text style={styles.wellnessCardDesc}>Quick daily check-in helps your coach keep you healthy.</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setWellnessCardDismissed(true)} style={styles.wellnessCloseBtn}>
                <Ionicons name="close" size={18} color={NEUTRAL.muted} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.wellnessCheckInBtn} onPress={() => setDailyWellnessVisible(true)}>
              <Text style={styles.wellnessCheckInText}>Check in</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── VDOT setup prompt ── */}
        {!userData.trainingPaces && (
          <View style={styles.vdotCard}>
            <View style={styles.stravaCardTop}>
              <View style={styles.stravaCardLeft}>
                <View style={[styles.stravaLogo, { backgroundColor: BRAND_LIGHT }]}>
                  <Ionicons name="speedometer-outline" size={18} color={BRAND} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stravaCardTitle}>Set Your Training Paces</Text>
                  <Text style={styles.stravaCardDesc}>Enter a recent race time to unlock pace-based training zones.</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity style={[styles.stravaConnectBtn, { backgroundColor: BRAND }]} onPress={() => { setActiveTab('home'); setProfileVisible(true); }}>
              <Text style={styles.stravaConnectText}>Set up now</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Benchmark update prompt ── */}
        {vdotStale && !benchmarkDismissed && (
          <View style={styles.vdotCard}>
            <View style={styles.stravaCardTop}>
              <View style={styles.stravaCardLeft}>
                <View style={[styles.stravaLogo, { backgroundColor: '#e8f5e9' }]}>
                  <Ionicons name="trophy-outline" size={18} color={STATUS.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stravaCardTitle}>Review your training paces</Text>
                  <Text style={styles.stravaCardDesc}>It's been a while since you updated. A recent race time can sharpen your zones.</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setBenchmarkDismissed(true)} style={styles.stravaCloseBtn}>
                <Ionicons name="close" size={18} color={NEUTRAL.muted} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[styles.stravaConnectBtn, { backgroundColor: BRAND }]} onPress={() => { setActiveTab('home'); setProfileVisible(true); }}>
              <Text style={styles.stravaConnectText}>Update paces</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Strava connect prompt ── */}
        {!stravaLinked && !stravaDismissed && (
          <View style={styles.stravaCard}>
            <View style={styles.stravaCardTop}>
              <View style={styles.stravaCardLeft}>
                <View style={styles.stravaLogo}><Text style={styles.stravaLogoText}>S</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stravaCardTitle}>Connect Strava</Text>
                  <Text style={styles.stravaCardDesc}>Auto-sync your runs so you never have to log manually.</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setStravaDismissed(true)} style={styles.stravaCloseBtn}>
                <Ionicons name="close" size={18} color={NEUTRAL.muted} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.stravaConnectBtn} onPress={() => setStravaVisible(true)}>
              <Text style={styles.stravaConnectText}>Connect now</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {isApproved && upcomingWorkouts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upcoming workouts</Text>
            {upcomingWorkouts.slice(0, 2).map(workout => {
              const wkMiles = myGroup && workout.groupMiles?.[myGroup.id]
                ? workout.groupMiles[myGroup.id]
                : workout.baseMiles || null;
              return (
                <TouchableOpacity key={workout.id} style={styles.workoutCard} onPress={() => { setSelectedWorkout(workout); setWorkoutDetailVisible(true); }}>
                  <View style={[styles.workoutBadge, { backgroundColor: TYPE_COLORS[workout.type] || BRAND }]}><Text style={styles.workoutBadgeText}>{workout.type}</Text></View>
                  <View style={styles.workoutInfo}>
                    <Text style={styles.workoutTitle}>{workout.title}{wkMiles ? ` — ${wkMiles} mi` : ''}</Text>
                    {userData.trainingPaces && WORKOUT_PACE_ZONE[workout.type] && (() => {
                      const zone = WORKOUT_PACE_ZONE[workout.type];
                      const tp = userData.trainingPaces;
                      const paceText = zone === 'easy' ? `${formatPace(tp.eLow)}–${formatPace(tp.eHigh)}/mi`
                        : zone === 'threshold' ? `${formatPace(tp.t)}/mi`
                        : zone === 'interval' ? `${formatPace(tp.i)}/mi`
                        : zone === 'repetition' ? `${formatPace(tp.r)}/mi` : null;
                      return paceText ? <Text style={styles.workoutPace}>Target: {paceText}</Text> : null;
                    })()}
                    {workout.description && <Text style={styles.workoutDesc} numberOfLines={1}>{workout.description}</Text>}
                    <Text style={styles.workoutDate}>{workout.date?.toDate?.()?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={styles.timeframeRow}>
          <TimeframePicker selected={selectedTimeframe} onSelect={setSelectedTimeframe} customStart={customStart} customEnd={customEnd} onCustomChange={(s, e) => { setCustomStart(s); setCustomEnd(e); }} activeSeason={getActiveSeason(school)} primaryColor={primaryColor} />
        </View>

        {isApproved && sortedTeam.length > 0 && (() => {
          const displayTeam = leaderboardFilter === 'mygroup' && myGroup
            ? sortedTeam.filter(a => a.groupId === myGroup.id)
            : sortedTeam;
          const displayRank = displayTeam.findIndex(a => a.id === auth.currentUser?.uid) + 1;
          return (
          <View style={styles.section}>
            {myGroup && (
              <View style={styles.leaderboardToggle}>
                {['all', 'mygroup'].map(f => (
                  <TouchableOpacity
                    key={f}
                    style={[styles.leaderboardToggleBtn, leaderboardFilter === f && { backgroundColor: BRAND, borderColor: BRAND }]}
                    onPress={() => setLeaderboardFilter(f)}
                  >
                    <Text style={[styles.leaderboardToggleBtnText, leaderboardFilter === f && { color: '#fff' }]}>
                      {f === 'all' ? 'All' : myGroup.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <Text style={styles.sectionTitle}>
              {leaderboardFilter === 'mygroup' && myGroup ? myGroup.name : 'Team'} leaderboard — {selectedTimeframe.label?.toLowerCase() || 'selected period'}
            </Text>
            {displayTeam.slice(0, 5).map((athlete, index) => {
              const isMe = athlete.id === auth.currentUser?.uid;
              const miles = teamMiles[athlete.id] || 0;
              return (
                <View key={athlete.id}>
                  <TouchableOpacity style={[styles.leaderRow, isMe && { backgroundColor: BRAND_LIGHT, borderColor: BRAND, borderWidth: 1.5 }]} onPress={() => isMe ? (paceBreakdown && setLeaderPaceExpanded(e => !e)) : setSelectedTeammate(athlete)} activeOpacity={isMe && !paceBreakdown ? 1 : 0.7}>
                    <Text style={[styles.leaderRank, isMe && { color: BRAND }]}>#{index + 1}</Text>
                    <View style={[styles.leaderAvatar, { backgroundColor: athlete.avatarColor || BRAND }]}>
                      <Text style={styles.leaderAvatarText}>{athlete.firstName?.[0]}{athlete.lastName?.[0]}</Text>
                    </View>
                    <View style={styles.leaderInfo}>
                      <Text style={[styles.leaderName, isMe && { color: BRAND, fontWeight: '700' }]}>{isMe ? 'You' : athlete.firstName + ' ' + athlete.lastName}</Text>
                      {!isMe && <Text style={styles.leaderTap}>Tap to view profile</Text>}
                    </View>
                    <Text style={[styles.leaderMiles, { color: isMe ? BRAND : BRAND_DARK }]}>{(Math.round(miles * 10) / 10).toFixed(1)} mi</Text>
                    {isMe && paceBreakdown && <Ionicons name={leaderPaceExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={BRAND} style={{ marginLeft: 4 }} />}
                  </TouchableOpacity>
                  {isMe && leaderPaceExpanded && paceBreakdown && (
                    <View style={[styles.zoneDropdown, { marginHorizontal: SPACE.lg, marginBottom: SPACE.sm }]}>
                      {paceBreakdown.map(z => (
                        <View key={z.key} style={styles.zoneRow}>
                          <View style={[styles.zoneDot, { backgroundColor: z.color }]} />
                          <Text style={styles.zoneName}>{z.short} {z.name}</Text>
                          <View style={styles.zoneBarBg}><View style={[styles.zoneBarFill, { width: z.pct + '%', backgroundColor: z.color }]} /></View>
                          <Text style={styles.zoneTime}>{formatMinutes(z.minutes)}</Text>
                        </View>
                      ))}
                      {paceAnalysis && (
                        <View style={[styles.analysis8020, { backgroundColor: paceAnalysis.status === 'great' ? '#e8f5e9' : paceAnalysis.status === 'good' ? '#fff8e1' : '#fce4ec' }]}>
                          <Text style={[styles.analysis8020Text, { color: paceAnalysis.status === 'great' ? BRAND : paceAnalysis.status === 'good' ? STATUS.warning : STATUS.error }]}>
                            Easy: {paceAnalysis.easyPct}% · Hard: {paceAnalysis.hardPct}%
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
            {displayTeam.length > 5 && displayRank > 5 && (
              <View style={[styles.leaderRow, { backgroundColor: BRAND_LIGHT, borderColor: BRAND, borderWidth: 1.5 }]}>
                <Text style={[styles.leaderRank, { color: BRAND }]}>#{displayRank}</Text>
                <View style={[styles.leaderAvatar, { backgroundColor: avatarColor }]}><Text style={styles.leaderAvatarText}>{userData.firstName?.[0]}{userData.lastName?.[0]}</Text></View>
                <View style={styles.leaderInfo}><Text style={[styles.leaderName, { color: BRAND, fontWeight: '700' }]}>You</Text></View>
                <Text style={[styles.leaderMiles, { color: BRAND }]}>{(Math.round(totalMiles * 10) / 10).toFixed(1)} mi</Text>
                {paceBreakdown && <Ionicons name="chevron-down" size={16} color={BRAND} style={{ marginLeft: 4 }} />}
              </View>
            )}
          </View>
          );
        })()}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My runs</Text>
          {recentRuns.length === 0 ? (
            <View style={styles.emptyCard}><Text style={styles.emptyText}>No runs yet — tap "Log a Run" to get started!</Text></View>
          ) : recentRuns.map(run => (
            <TouchableOpacity key={run.id} style={styles.runCard} activeOpacity={0.7} onPress={() => { setSelectedRun(run); setRunDetailVisible(true); }}>
              <View style={styles.runLeft}>
                <Text style={styles.runMiles}>{run.miles} mi</Text>
                <Text style={styles.runDate}>{run.date?.toDate?.()?.toLocaleDateString() || 'Today'}</Text>
              </View>
              <View style={styles.runMiddle}>{run.duration && <Text style={styles.runDetail}>{run.duration}</Text>}</View>
              {run.effort != null ? (
                <View style={styles.runRight}>
                  <Text style={styles.effortLabel}>Effort</Text>
                  <Text style={styles.effortValue}>{run.effort}/10</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.rateEffortBtn} onPress={(e) => { e.stopPropagation(); setEffortPickerRun(run); }}>
                  <Text style={styles.rateEffortText}>Rate effort</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          ))}
        </View>

      </ScrollView>

      {/* Quick effort picker */}
      <Modal visible={!!effortPickerRun} transparent animationType="fade" onRequestClose={() => setEffortPickerRun(null)}>
        <TouchableOpacity style={styles.effortOverlay} activeOpacity={1} onPress={() => setEffortPickerRun(null)}>
          <View style={styles.effortPickerCard}>
            <Text style={styles.effortPickerTitle}>How did it feel?</Text>
            <Text style={styles.effortPickerSub}>{effortPickerRun?.miles} mi — {effortPickerRun?.date?.toDate?.()?.toLocaleDateString() || 'Today'}</Text>
            <View style={styles.effortPickerRow}>
              {[1,2,3,4,5,6,7,8,9,10].map(val => (
                <TouchableOpacity key={val} style={[styles.effortPickerBtn, { backgroundColor: EFFORT_COLORS[val] + '30' }]} onPress={() => handleQuickEffort(effortPickerRun, val)}>
                  <Text style={[styles.effortPickerBtnText, { color: EFFORT_COLORS[val] }]}>{val}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.effortPickerHint}>1 = Very Easy  —  10 = All Out</Text>
          </View>
        </TouchableOpacity>
      </Modal>

      <WellnessCheckIn visible={dailyWellnessVisible} onComplete={async (data) => {
        setDailyWellnessVisible(false);
        try {
          await addDoc(collection(db, 'checkins'), {
            userId: auth.currentUser.uid,
            schoolId: userData.schoolId || null,
            date: new Date(),
            sleepQuality: data.sleep,
            legFatigue: data.legs,
            mood: data.mood,
            ...(data.injury && { injury: data.injury }),
            ...(data.illness && { illness: data.illness }),
          });
          setTodayCheckinDone(true);
        } catch (e) { console.warn('Failed to save daily check-in:', e); }
      }} onSkip={() => { setDailyWellnessVisible(false); setTodayCheckinDone(true); }} onClose={() => setDailyWellnessVisible(false)} />
      <WorkoutDetailModal
        item={selectedWorkout}
        visible={workoutDetailVisible}
        onClose={() => { setWorkoutDetailVisible(false); setSelectedWorkout(null); }}
        primaryColor={primaryColor}
        athleteMiles={selectedWorkout && myGroup ? (selectedWorkout.groupMiles?.[myGroup.id] || selectedWorkout.baseMiles || null) : (selectedWorkout?.baseMiles || null)}
        groupName={myGroup?.name}
        trainingPaces={userData.trainingPaces || null}
      />
      <RunDetailModal run={selectedRun} visible={runDetailVisible} primaryColor={primaryColor} athleteAge={athleteAge} zoneSettings={teamZoneSettings} showHRZones={showHRZones} trainingPaces={userData.trainingPaces || null} onClose={() => { setRunDetailVisible(false); setSelectedRun(null); }} onDeleted={() => { setRunDetailVisible(false); setSelectedRun(null); loadDashboard(); }} onUpdated={() => { setSelectedRun(null); loadDashboard(); }} />

      <Modal visible={logModalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => { setLogModalVisible(false); setEditingRunId(null); }}><Text style={styles.modalCancel}>Cancel</Text></TouchableOpacity>
              <Text style={styles.modalTitle}>{editingRunId ? 'Edit Run' : 'Log a Run'}</Text>
              <View style={{ width: 60 }} />
            </View>
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <DatePickerField label="Run date" value={runDate} onChange={setRunDate} primaryColor={primaryColor} maximumDate={new Date()} />
              <Text style={styles.modalLabel}>Miles *</Text>
              <TextInput style={styles.modalInput} placeholder="e.g. 5.2" placeholderTextColor={NEUTRAL.muted} value={miles} onChangeText={setMiles} keyboardType="decimal-pad" returnKeyType="next" />
              <Text style={styles.modalLabel}>Duration (optional)</Text>
              <TextInput style={styles.modalInput} placeholder="e.g. 42:30" placeholderTextColor={NEUTRAL.muted} value={duration} onChangeText={setDuration} returnKeyType="next" />
              <Text style={styles.modalLabel}>Avg heart rate (optional)</Text>
              <TextInput style={styles.modalInput} placeholder="e.g. 155" placeholderTextColor={NEUTRAL.muted} value={heartRate} onChangeText={setHeartRate} keyboardType="numeric" returnKeyType="next" />
              <Text style={styles.modalLabel}>How did it feel? {effort}/10 — {EFFORT_LABELS[effort]}</Text>
              <View style={styles.effortRow}>
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <TouchableOpacity key={n} style={[styles.effortBtn, effort === n && { backgroundColor: BRAND }]} onPress={() => setEffort(n)}>
                    <Text style={[styles.effortBtnText, effort === n && { color: '#fff' }]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.modalLabel}>Notes (optional)</Text>
              <TextInput style={[styles.modalInput, { height: 90, textAlignVertical: 'top' }]} placeholder="How did the run go?" placeholderTextColor={NEUTRAL.muted} value={notes} onChangeText={setNotes} multiline />
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: BRAND }]} onPress={handleLogRun} disabled={savingRun}>
                {savingRun ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{editingRunId ? 'Save Changes' : 'Save Run'}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Persistent bottom nav ── */}
      {/* ── Sub-screens rendered over content but under nav ── */}
      {seasonReviewVisible && seasonReviewSeason && (
        <View style={styles.subScreen}>
          <SeasonReview season={seasonReviewSeason} school={school} userData={userData} onClose={() => { setSeasonReviewVisible(false); setSeasonReviewSeason(null); }} />
        </View>
      )}
      {calendarVisible && (
        <View style={styles.subScreen}>
          <CalendarScreen userData={userData} school={school} trainingPaces={userData.trainingPaces || null} onClose={() => setCalendarVisible(false)} />
        </View>
      )}
      {stravaVisible && (
        <View style={styles.subScreen}>
          <StravaConnect userData={userData} school={school} onClose={() => { setStravaVisible(false); loadDashboard(); }} onSynced={() => { setStravaVisible(false); setStravaLinked(true); loadDashboard(); }} />
        </View>
      )}
      {feedVisible && (
        <View style={styles.subScreen}>
          <ChannelList userData={userData} school={school} onClose={() => { setFeedVisible(false); loadDashboard(); }} onUnreadChange={(count) => setUnreadFeedCount(count)} />
        </View>
      )}
      {statsVisible && (
        <View style={styles.subScreen}>
          <AthleteAnalytics
            userData={userData}
            school={school}
            myGroup={myGroup}
            athleteAge={athleteAge}
            teamZoneSettings={teamZoneSettings}
            onClose={() => setStatsVisible(false)}
          />
        </View>
      )}
      {profileVisible && (
        <View style={styles.subScreen}>
          <AthleteProfile userData={userData} school={school} coachDisabledHR={coachDisabledHR} onClose={async () => {
            try {
              const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
              if (userDoc.exists()) {
                const d = userDoc.data();
                setHrZonePref(d.showHRZones);
                setLocalAvatarColor(d.avatarColor || BRAND);
                setUserOverrides(prev => ({
                  ...prev,
                  vdot: d.vdot, vdotDistance: d.vdotDistance, vdotTime: d.vdotTime,
                  trainingPaces: d.trainingPaces, vdotUpdatedAt: d.vdotUpdatedAt,
                  avatarColor: d.avatarColor,
                }));
              }
            } catch (e) { console.warn('Failed to refresh user prefs:', e); }
            setProfileVisible(false);
          }} onUpdated={(updates) => {
            if (updates) setUserOverrides(prev => ({ ...prev, ...updates }));
            setProfileVisible(false);
            loadDashboard();
          }} />
        </View>
      )}

      {/* ── Persistent bottom nav (rendered last = on top) ── */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => { setCalendarVisible(false); setStravaVisible(false); setFeedVisible(false); setProfileVisible(false); setStatsVisible(false); }}>
          <Ionicons name="home-outline" size={24} color={!calendarVisible && !stravaVisible && !feedVisible && !profileVisible && !statsVisible ? BRAND : NEUTRAL.muted} />
          <Text style={[styles.bottomNavLabel, !calendarVisible && !stravaVisible && !feedVisible && !profileVisible && !statsVisible && { color: BRAND }]}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => { handleLogRunTap(); }}>
          <Ionicons name="add-circle-outline" size={24} color={NEUTRAL.muted} />
          <Text style={styles.bottomNavLabel}>Log run</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => { setStravaVisible(false); setFeedVisible(false); setProfileVisible(false); setStatsVisible(false); setCalendarVisible(true); }}>
          <Ionicons name="calendar-outline" size={24} color={calendarVisible ? BRAND : NEUTRAL.muted} />
          <Text style={[styles.bottomNavLabel, calendarVisible && { color: BRAND }]}>Calendar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => { setCalendarVisible(false); setStravaVisible(false); setFeedVisible(false); setProfileVisible(false); setStatsVisible(true); }}>
          <Ionicons name="stats-chart-outline" size={24} color={statsVisible ? BRAND : NEUTRAL.muted} />
          <Text style={[styles.bottomNavLabel, statsVisible && { color: BRAND }]}>Stats</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => { setCalendarVisible(false); setStravaVisible(false); setProfileVisible(false); setStatsVisible(false); setFeedVisible(true); }}>
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  leaderboardToggle:       { flexDirection: 'row', gap: SPACE.sm, marginBottom: SPACE.sm },
  leaderboardToggleBtn:    { borderRadius: RADIUS.sm, borderWidth: 1.5, borderColor: NEUTRAL.border, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, backgroundColor: NEUTRAL.card },
  leaderboardToggleBtnText:{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: NEUTRAL.body },
  container:           { flex: 1, backgroundColor: NEUTRAL.bg },
  loading:             { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:              { backgroundColor: NEUTRAL.card, paddingTop: Platform.OS === 'ios' ? SPACE['5xl'] : SPACE['3xl'], paddingBottom: SPACE.md, paddingHorizontal: SPACE.xl, borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
  headerTop:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greeting:            { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  schoolName:          { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, marginTop: 2 },
  profileBtn:          { padding: SPACE.xs },
  profileAvatar:       { width: 40, height: 40, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
  profileAvatarText:   { color: '#fff', fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold },
  profileBadge:        { position: 'absolute', top: 0, right: 0, backgroundColor: STATUS.error, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  profileBadgeText:    { color: '#fff', fontSize: 10, fontWeight: FONT_WEIGHT.bold },
  syncingBar:          { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginHorizontal: SPACE.lg, marginTop: SPACE.md },
  syncingText:         { color: NEUTRAL.body, fontSize: FONT_SIZE.xs },
  pendingBanner:       { backgroundColor: STATUS.warningBg, borderRadius: RADIUS.md, padding: SPACE.md, marginHorizontal: SPACE.lg, marginTop: SPACE.md, alignItems: 'center', borderLeftWidth: 3, borderLeftColor: STATUS.warning },
  pendingText:         { color: '#92400e', fontSize: FONT_SIZE.sm, textAlign: 'center' },
  heroCard:            { marginHorizontal: SPACE.lg, marginTop: SPACE.md, backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg, ...SHADOW.sm },
  heroTopRow:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.xs },
  heroLabel:           { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color: NEUTRAL.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  heroMilesRow:        { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  heroMilesNum:        { fontSize: FONT_SIZE['2xl'], fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, fontVariant: ['tabular-nums'] },
  heroMilesOf:         { fontSize: FONT_SIZE.sm, color: NEUTRAL.body },
  heroCardOver:        { borderWidth: 1.5, borderColor: STATUS.error },
  heroProgressBg:      { flex: 1, height: 8, backgroundColor: NEUTRAL.bg, borderRadius: 4, overflow: 'hidden' },
  heroProgressFill:    { height: '100%', borderRadius: 4 },
  heroProgressHint:    { fontSize: FONT_SIZE.xs, color: NEUTRAL.body },
  heroOverRow:         { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroOverText:        { fontSize: FONT_SIZE.xs, color: STATUS.error, fontWeight: FONT_WEIGHT.semibold },
  wellnessCard:        { marginHorizontal: SPACE.lg, marginTop: SPACE.md, backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg, ...SHADOW.sm },
  wellnessCardTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  wellnessCardLeft:    { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md, flex: 1 },
  wellnessIcon:        { width: 36, height: 36, borderRadius: RADIUS.full, backgroundColor: BRAND_LIGHT, alignItems: 'center', justifyContent: 'center' },
  wellnessCardTitle:   { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  wellnessCardDesc:    { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, marginTop: 2, lineHeight: 18 },
  wellnessCloseBtn:    { padding: SPACE.xs },
  wellnessCheckInBtn:  { backgroundColor: BRAND, borderRadius: RADIUS.md, paddingVertical: SPACE.md, alignItems: 'center', marginTop: SPACE.md },
  wellnessCheckInText: { color: '#fff', fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },
  vdotCard:            { marginHorizontal: SPACE.lg, marginTop: SPACE.md, backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg, ...SHADOW.sm },
  stravaCard:          { marginHorizontal: SPACE.lg, marginTop: SPACE.md, backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg, ...SHADOW.sm },
  stravaCardTop:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  stravaCardLeft:      { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md, flex: 1 },
  stravaLogo:          { width: 36, height: 36, borderRadius: RADIUS.sm, backgroundColor: STRAVA_ORANGE, alignItems: 'center', justifyContent: 'center' },
  stravaLogoText:      { color: '#fff', fontSize: FONT_SIZE.md, fontWeight: '900' },
  stravaCardTitle:     { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  stravaCardDesc:      { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, marginTop: 2, lineHeight: 18 },
  stravaCloseBtn:      { padding: SPACE.xs },
  stravaConnectBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm, backgroundColor: STRAVA_ORANGE, borderRadius: RADIUS.md, paddingVertical: SPACE.md, marginTop: SPACE.md },
  stravaConnectText:   { color: '#fff', fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },
  subScreen:           { position: 'absolute', top: 0, left: 0, right: 0, bottom: Platform.OS === 'ios' ? 82 : 56, backgroundColor: NEUTRAL.bg, zIndex: 10 },
  bottomNav:           { flexDirection: 'row', backgroundColor: NEUTRAL.card, borderTopWidth: 1, borderTopColor: NEUTRAL.border, paddingBottom: Platform.OS === 'ios' ? SPACE['2xl'] : SPACE.sm, paddingTop: SPACE.md, ...SHADOW.sm, zIndex: 20 },
  bottomNavBtn:        { flex: 1, alignItems: 'center', gap: 2 },
  bottomNavStravaIcon: { width: 28, height: 28, borderRadius: RADIUS.sm, backgroundColor: STRAVA_ORANGE, alignItems: 'center', justifyContent: 'center' },
  bottomNavStravaText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  bottomNavLabel:      { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, fontWeight: FONT_WEIGHT.medium },
  badge:               { position: 'absolute', top: -4, right: -8, backgroundColor: STATUS.error, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText:           { color: '#fff', fontSize: 10, fontWeight: FONT_WEIGHT.bold },
  msgModalOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: SPACE['2xl'] },
  msgModal:            { backgroundColor: NEUTRAL.card, borderRadius: SPACE.xl, overflow: 'hidden', width: '100%' },
  msgModalHeader:      { backgroundColor: BRAND, padding: SPACE.xl, paddingBottom: SPACE.lg },
  msgModalTitle:       { color: '#fff', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  msgModalDate:        { color: 'rgba(255,255,255,0.7)', fontSize: FONT_SIZE.xs, marginTop: 2 },
  msgModalText:        { fontSize: 17, color: BRAND_DARK, lineHeight: 26, padding: SPACE.xl, paddingBottom: SPACE.sm },
  msgModalFrom:        { fontSize: FONT_SIZE.sm, color: NEUTRAL.muted, fontStyle: 'italic', paddingHorizontal: SPACE.xl, paddingBottom: SPACE.xl },
  msgModalBtn:         { backgroundColor: BRAND, margin: SPACE.lg, marginTop: SPACE.xs, borderRadius: RADIUS.lg, padding: SPACE.lg, alignItems: 'center' },
  msgModalBtnText:     { color: '#fff', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  scroll:              { flex: 1 },
  timeframeRow:        { marginHorizontal: SPACE.lg, marginBottom: SPACE.xs, marginTop: SPACE.lg - 2 },
  periodMilesCard:     { marginHorizontal: SPACE.lg, marginBottom: SPACE.sm, backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg, borderWidth: 1, borderColor: NEUTRAL.border, ...SHADOW.sm },
  periodMilesRow:      { flexDirection: 'row', alignItems: 'baseline', gap: SPACE.md },
  periodMilesNum:      { fontSize: FONT_SIZE['2xl'], fontWeight: FONT_WEIGHT.bold, color: BRAND },
  periodMilesLabel:    { fontSize: FONT_SIZE.sm, color: NEUTRAL.body },
  section:             { padding: SPACE.lg },
  sectionTitle:        { fontSize: 17, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: SPACE.md },
  workoutCard:         { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg - 2, marginBottom: SPACE.md, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, ...SHADOW.sm },
  workoutBadge:        { borderRadius: RADIUS.sm, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, alignSelf: 'flex-start' },
  workoutBadgeText:    { color: '#fff', fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold },
  workoutInfo:         { flex: 1 },
  workoutTitle:        { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  workoutPace:         { fontSize: FONT_SIZE.xs, color: BRAND_ACCENT, fontWeight: FONT_WEIGHT.semibold, marginTop: 2 },
  workoutDesc:         { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, marginTop: 2 },
  workoutDate:         { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: SPACE.xs },
  chevron:             { fontSize: 22, color: NEUTRAL.input },
  leaderRow:           { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.md, marginBottom: SPACE.sm, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, ...SHADOW.sm },
  leaderTap:           { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: 1 },
  leaderRank:          { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: NEUTRAL.muted, width: 28 },
  leaderAvatar:        { width: 38, height: 38, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
  leaderAvatarText:    { fontWeight: FONT_WEIGHT.bold, fontSize: FONT_SIZE.sm, color: '#fff' },
  leaderInfo:          { flex: 1 },
  leaderName:          { fontSize: FONT_SIZE.base, color: BRAND_DARK },
  leaderMiles:         { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  emptyCard:           { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.xl, alignItems: 'center', ...SHADOW.sm },
  emptyText:           { color: NEUTRAL.muted, fontSize: FONT_SIZE.sm, textAlign: 'center', lineHeight: 20 },
  runCard:             { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg - 2, marginBottom: SPACE.md, flexDirection: 'row', alignItems: 'center', ...SHADOW.sm },
  // Zone toggle (inside mileage cards)
  zoneToggle:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACE.md, paddingTop: SPACE.md, borderTopWidth: 1, borderTopColor: NEUTRAL.border },
  zoneToggleLeft:      { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, flex: 1 },
  zoneToggleText:      { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color: NEUTRAL.label },
  zoneStackedBarSmall: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', width: 60 },
  zoneDropdown:        { marginTop: SPACE.md },
  // Zone shared styles
  streamBadge:         { backgroundColor: BRAND_LIGHT, borderRadius: RADIUS.sm, paddingHorizontal: SPACE.sm, paddingVertical: 2 },
  streamBadgeText:     { fontSize: 10, color: BRAND, fontWeight: FONT_WEIGHT.bold },
  analysis8020:        { borderRadius: RADIUS.sm, padding: SPACE.md, marginTop: SPACE.sm, marginBottom: SPACE.xs },
  analysis8020Text:    { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, textAlign: 'center' },
  zoneStackedSegment:  { height: '100%' },
  zoneRow:             { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.sm },
  zoneDot:             { width: 10, height: 10, borderRadius: 5 },
  zoneName:            { fontSize: FONT_SIZE.xs, color: NEUTRAL.label, width: 110 },
  zoneBarBg:           { flex: 1, height: 6, backgroundColor: NEUTRAL.bg, borderRadius: 3, overflow: 'hidden' },
  zoneBarFill:         { height: '100%', borderRadius: 3 },
  zoneTime:            { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, fontWeight: FONT_WEIGHT.semibold, width: 52, textAlign: 'right' },
  zoneTotalTime:       { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, textAlign: 'right', marginTop: SPACE.xs },
  runLeft:             { width: 72 },
  runMiles:            { fontSize: 17, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  runDate:             { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: 2 },
  runMiddle:           { flex: 1, paddingHorizontal: SPACE.md, gap: SPACE.xs },
  runDetail:           { fontSize: FONT_SIZE.sm, color: NEUTRAL.body },
  runRight:            { alignItems: 'center' },
  effortLabel:         { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted },
  effortValue:         { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: BRAND },
  parentCard:          { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginHorizontal: SPACE.lg, marginBottom: 0, backgroundColor: BRAND_LIGHT, borderRadius: RADIUS.lg, paddingVertical: SPACE.md, paddingHorizontal: SPACE.lg },
  parentName:          { fontSize: FONT_SIZE.sm, color: BRAND_DARK, flex: 1 },
  modal:               { flex: 1, backgroundColor: NEUTRAL.bg },
  modalHeader:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACE.xl, paddingTop: 60, backgroundColor: NEUTRAL.card, borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
  modalTitle:          { fontSize: FONT_SIZE.xl - 2, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  modalCancel:         { color: STATUS.error, fontSize: FONT_SIZE.md, width: 60 },
  modalScroll:         { padding: SPACE.xl },
  modalLabel:          { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: NEUTRAL.label, marginBottom: SPACE.sm, marginTop: SPACE.xs },
  modalInput:          { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.md, padding: SPACE.lg - 2, fontSize: FONT_SIZE.md, marginBottom: SPACE.lg, borderWidth: 1, borderColor: NEUTRAL.input, color: BRAND_DARK },
  effortRow:           { flexDirection: 'row', gap: SPACE.sm, marginBottom: SPACE.lg, flexWrap: 'wrap' },
  effortBtn:           { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: NEUTRAL.border, alignItems: 'center', justifyContent: 'center' },
  effortBtnText:       { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: NEUTRAL.body },
  saveBtn:             { borderRadius: RADIUS.lg, padding: SPACE.lg, alignItems: 'center', marginTop: SPACE.sm, marginBottom: SPACE['4xl'] },
  saveBtnText:         { color: '#fff', fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  rateEffortBtn:       { borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, alignSelf: 'center', borderStyle: 'dashed', backgroundColor: BRAND_LIGHT, borderColor: BRAND },
  rateEffortText:      { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color: BRAND },
  effortOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  effortPickerCard:    { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE['2xl'], width: '85%', alignItems: 'center' },
  effortPickerTitle:   { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: SPACE.xs },
  effortPickerSub:     { fontSize: FONT_SIZE.sm, color: NEUTRAL.muted, marginBottom: SPACE.lg },
  effortPickerRow:     { flexDirection: 'row', gap: SPACE.sm, flexWrap: 'wrap', justifyContent: 'center', marginBottom: SPACE.md },
  effortPickerBtn:     { width: 40, height: 40, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
  effortPickerBtnText: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  effortPickerHint:    { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted },
});