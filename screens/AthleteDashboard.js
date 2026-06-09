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
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import React, { memo, lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import { auth, db } from '../firebaseConfig';
import { autoSyncStrava } from '../stravaConfig';
import { BRAND, EFFORT_COLORS as DESIGN_EFFORT_COLORS, EFFORT_LABELS as DESIGN_EFFORT_LABELS, SIGNAL } from '../constants/design';
import { batchDocsByIds } from '../utils/batchDocsByIds';
import { useStaleRefresh } from '../hooks/useStaleRefresh';
import { PACE_ZONES, calcPaceZoneBreakdown, calcPaceZoneSecondsForRun, calcPace8020, formatPace, formatMinutes } from '../utils/vdotUtils';
import AthleteProfile from './AthleteProfile';
import CalendarScreen from './CalendarScreen';
import { SIGNAL_TYPE_COLORS, TYPE_COLORS, WORKOUT_PACE_ZONE } from '../constants/training';
import DatePickerField from './DatePickerField';
import RunDetailModal from './RunDetailModal';
import { getActiveSeason, getCompletedSeasons } from './SeasonPlanner';
import StravaConnect from './StravaConnect';
import ChannelList from './ChannelList';
import TeammateProfile from './TeammateProfile';
import TimeframePicker, { TIMEFRAMES, getDateRange } from './TimeframePicker';
import WellnessCheckIn from './WellnessCheckIn';
import WeeklyCheckIn from './WeeklyCheckIn';
import WeeklyCheckinHistory from './WeeklyCheckinHistory';
import { confirmDestructive } from '../utils/confirmDialog';
import {
  getLatestWeeklyCheckin,
  getWeekAnchor,
  getWeeklyCheckinDocId,
  isInWeeklyWindow,
} from '../utils/weeklyCheckinUtils';
import WorkoutDetailModal from './WorkoutDetailModal';

const EFFORT_LABELS = DESIGN_EFFORT_LABELS;
const EFFORT_COLORS = DESIGN_EFFORT_COLORS;

// Memoized sub-screen wrappers. Since we keep these mounted across nav taps
// (see calendarMounted/statsMounted/feedMounted), wrapping in React.memo means
// they skip re-rendering when their props haven't changed — which is the case
// on every bottom-nav tap. Callbacks passed in must be stable refs (useCallback).
const MemoCalendarScreen   = memo(CalendarScreen);
// Lazy-loaded on web to keep them out of the initial bundle (they're heavy and
// only opened on demand). Suspense fallback below covers the brief first load.
const SeasonReview         = lazy(() => import('./SeasonReview'));
const AthleteAnalytics     = lazy(() => import('./AthleteAnalytics'));
const MemoAthleteAnalytics = memo(AthleteAnalytics);
const MemoChannelList      = memo(ChannelList);

function getWeekStart() {
  const now  = new Date();
  const day  = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export default function AthleteDashboard({ userData: userDataProp, refreshUser, goToJoinScreen }) {
  const [userOverrides,        setUserOverrides]        = useState({});
  const userData = { ...userDataProp, ...userOverrides };
  const [school,               setSchool]               = useState(null);
  const [recentRuns,           setRecentRuns]           = useState([]);
  const [weekRuns,             setWeekRuns]             = useState([]);
  const [upcomingWorkouts,     setUpcomingWorkouts]     = useState([]);
  const [teamAthletes,         setTeamAthletes]         = useState([]);
  const [weeklyMiles,          setWeeklyMiles]          = useState(0);
  const [weeklyTarget,         setWeeklyTarget]         = useState(null);
  const [totalMiles,           setTotalMiles]           = useState(0);
  const [teamMiles,            setTeamMiles]            = useState({});
  const [pendingParents,       setPendingParents]       = useState([]);
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
  // Track which sub-screens have ever been opened. Once opened they stay mounted
  // (hidden with display: 'none' when inactive) so returning to them is instant
  // instead of remounting with a fresh spinner + full data refetch.
  const [calendarMounted,      setCalendarMounted]      = useState(false);
  const [statsMounted,         setStatsMounted]         = useState(false);
  const [feedMounted,          setFeedMounted]          = useState(false);
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
  const [reviewDismissed,      setReviewDismissed]      = useState({});
  const [todayCheckinDone,     setTodayCheckinDone]     = useState(true); // default true to avoid flash
  const [wellnessCardDismissed, setWellnessCardDismissed] = useState(false);
  const [zoneExpanded, setZoneExpanded] = useState(false);
  const [dailyWellnessVisible, setDailyWellnessVisible] = useState(false);
  const [weeklyCheckinVisible, setWeeklyCheckinVisible] = useState(false);
  // True when the modal was opened to COMPOSE this week's message (vs. opened
  // to READ a coach reply). Determines whether the modal gets this week's doc
  // (editable) or the latest doc (which may be last week's, locked).
  const [weeklyComposeMode,    setWeeklyComposeMode]    = useState(false);
  const [latestWeeklyCheckin,  setLatestWeeklyCheckin]  = useState(null);
  const [weeklyCardDismissed,  setWeeklyCardDismissed]  = useState(false);
  const [weeklyHistoryVisible, setWeeklyHistoryVisible] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [miles,        setMiles]        = useState('');
  const [duration,     setDuration]     = useState('');
  const [effort,       setEffort]       = useState(5);
  const [notes,        setNotes]        = useState('');
  const [runDate,      setRunDate]      = useState(new Date());
  const [savingRun,    setSavingRun]    = useState(false);
  const [editingRunId, setEditingRunId] = useState(null);
  const [myGroup,      setMyGroup]      = useState(null);
  const [leaderboardFilter, setLeaderboardFilter] = useState('all');
  // Bottom nav height is measured at runtime so the sub-screen overlay sits
  // exactly on top of it (no sliver of the underlying dashboard showing
  // through). Initial value is a sensible iOS fallback used only for the
  // first frame before onLayout fires.
  const [navHeight, setNavHeight] = useState(Platform.OS === 'ios' ? 82 : 56);

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

  // Reset zone expansion UI when timeframe changes (separate from data load).
  useEffect(() => { setZoneExpanded(false); }, [selectedTimeframe]);

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
      // On web, Strava sync is webhook-driven (server-side) — the client doesn't
      // auto-pull (browser→Strava data-API calls may be CORS-blocked; the initial
      // backfill path is settled at go-live). New runs arrive via the webhook.
      if (Platform.OS === 'web') return;
      const user = auth.currentUser;
      if (!user) return;
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists() || !userDoc.data().stravaAccessToken) return;
      setAutoSyncing(true);
      const result = await autoSyncStrava(user.uid, userData);
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
    try {
      const user = auth.currentUser;

      // Phase 1: parallelize the user doc with the school doc (neither depends on the other).
      const [userDoc, schoolDoc] = await Promise.all([
        getDoc(doc(db, 'users', user.uid)),
        userData.schoolId
          ? getDoc(doc(db, 'schools', userData.schoolId))
          : Promise.resolve(null),
      ]);

      let currentSchool = school;
      if (schoolDoc?.exists()) { currentSchool = schoolDoc.data(); setSchool(currentSchool); }

      const userDocData = userDoc.exists() ? userDoc.data() : null;

      // Phase 2: group lookup is sequential — needs groupId from the user doc above.
      let loadedGroup = null;
      if (userData.schoolId && userDocData) {
        try {
          const groupId = userDocData.groupId;
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
              // null = coach hasn't set a target; hero card shows a clean
              // "no target" state rather than a fabricated goal.
              setWeeklyTarget(weekTarget ?? null);
            }
          } else {
            setMyGroup(null);
            setWeeklyTarget(null);
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

      // Reuse the user doc already fetched in Phase 1 — avoids a duplicate Firestore read.
      if (userDocData) {
        setStravaLinked(!!userDocData.stravaAccessToken);
        const allParentIds = [...(userDocData.linkedParentIds || []), ...(userDocData.pendingParentIds || [])];
        const uniqueParentIds = [...new Set(allParentIds)];
        if (uniqueParentIds.length > 0) {
          const pDocs = await Promise.all(
            uniqueParentIds.map(pid => getDoc(doc(db, 'users', pid)))
          );
          const parentData = pDocs
            .filter(d => d.exists())
            .map(d => ({ id: d.id, ...d.data() }));
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

      // Latest weekly check-in (drives both the "send this week" prompt and the
      // "coach replied" card on the home screen).
      try {
        const latest = await getLatestWeeklyCheckin(user.uid);
        setLatestWeeklyCheckin(latest);
      } catch (e) {
        console.warn('Weekly check-in query failed:', e);
        setLatestWeeklyCheckin(null);
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
          const otherIds = athletes.filter(a => a.id !== user.uid).map(a => a.id);
          if (otherIds.length > 0) {
            try {
              const { byField } = await batchDocsByIds({
                collectionName: 'runs',
                field: 'userId',
                ids: otherIds,
              });
              for (const id of otherIds) {
                const athleteRuns = byField[id] || [];
                const filtered = athleteRuns.filter(r => {
                  if (!startDate && !endDate) return true;
                  const rd = r.date?.toDate?.();
                  if (!rd) return false;
                  if (startDate && rd < startDate) return false;
                  if (endDate && rd > endDate) return false;
                  return true;
                });
                milesMap[id] = Math.round(filtered.reduce((s, r) => s + (r.miles || 0), 0) * 10) / 10;
              }
            } catch (e) {
              console.warn('Failed to batch-load team miles:', e);
              otherIds.forEach(id => { milesMap[id] = 0; });
            }
          }
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
  };

  // Stale-while-revalidate: first load shows spinner; timeframe changes keep
  // cached data visible and surface a small "Updating…" indicator in the team
  // leaderboard section. Declared after loadDashboard so the function reference
  // is defined (const arrow functions are not hoisted).
  const { loading, refreshing } = useStaleRefresh(loadDashboard, [selectedTimeframe, customStart, customEnd]);

  // Stable callbacks for memoized sub-screens. Without these, every render
  // would pass new function identities and defeat React.memo. The Feed close
  // handler calls loadDashboard, which changes identity every render, so we
  // route through a ref that's kept current.
  const loadDashboardRef = useRef(loadDashboard);
  loadDashboardRef.current = loadDashboard;
  const handleCloseCalendar = useCallback(() => setCalendarVisible(false), []);
  const handleCloseStats    = useCallback(() => setStatsVisible(false), []);
  const handleCloseFeed     = useCallback(() => {
    setFeedVisible(false);
    loadDashboardRef.current?.();
  }, []);

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
        await fsUpdate(fsDoc(db, 'runs', editingRunId), { miles: milesFloat, duration: duration || null, effort, notes: notes || null, date: runDate });
        await updateDoc(doc(db, 'users', user.uid), { totalMiles: Math.max(0, Math.round(((totalMiles || 0) - oldMiles + milesFloat) * 10) / 10) });
        Alert.alert('Updated! ✅', 'Your run has been updated.');
        setEditingRunId(null);
      } else {
        // Wellness check-ins are now handled via the daily card, not per-run
        await addDoc(collection(db, 'runs'), { userId: user.uid, schoolId: userData.schoolId || null, miles: milesFloat, duration: duration || null, effort, notes: notes || null, source: 'manual', date: runDate });
        await updateDoc(doc(db, 'users', user.uid), { totalMiles: Math.round(((totalMiles || 0) + milesFloat) * 10) / 10 });
        Alert.alert('Run logged! 🏃', miles + ' miles saved. Great work!');
      }
      setLogModalVisible(false); setPendingWellness(null);
      setMiles(''); setDuration(''); setEffort(5); setNotes(''); setRunDate(new Date());
      loadDashboard();
    } catch (error) { console.error(error); Alert.alert('Error', 'Could not save run. Please try again.'); }
    setSavingRun(false);
  };

  const handleDeleteRun = (run) => {
    confirmDestructive({
      title: 'Delete run?',
      message: 'Delete your ' + run.miles + ' mile run? This cannot be undone.',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          const { deleteDoc, doc: firestoreDoc } = await import('firebase/firestore');
          await deleteDoc(firestoreDoc(db, 'runs', run.id));
          await updateDoc(doc(db, 'users', auth.currentUser.uid), { totalMiles: Math.max(0, Math.round(((totalMiles || 0) - (run.miles || 0)) * 10) / 10) });
          Alert.alert('Deleted', 'Run removed.');
          setRunDetailVisible(false); setSelectedRun(null); loadDashboard();
        } catch { Alert.alert('Error', 'Could not delete run.'); }
      },
    });
  };

  const handleSignOut = () => {
    confirmDestructive({
      title: 'Sign out',
      message: 'Are you sure?',
      confirmLabel: 'Sign out',
      onConfirm: () => signOut(auth),
    });
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={SIGNAL.color.indigo} /></View>;

  const primaryColor = school?.primaryColor || BRAND;
  // Three distinct states for an athlete:
  //   - !hasSchool                            → not on a team (skipped or removed)
  //   - hasSchool && status === 'pending'     → awaiting coach approval
  //   - hasSchool && status === 'approved'    → fully on the team
  const hasSchool  = !!userData.schoolId;
  const isPending  = hasSchool && userData.status === 'pending';
  const isApproved = hasSchool && userData.status === 'approved';
  // weeklyTarget is null until a coach sets a group/weekly target. With no
  // target we show miles only — no ring, no over/under hints (no fabricated goal).
  const hasTarget = weeklyTarget > 0;
  const targetPct = hasTarget ? Math.min(weeklyMiles / weeklyTarget, 1) : 0;
  const rawPct = hasTarget ? weeklyMiles / weeklyTarget : 0;
  const overPct = rawPct > 1 ? Math.round((rawPct - 1) * 100) : 0;
  const isOverWarning = hasTarget && rawPct > 1.1;   // >110% — red warning
  const isOverBuffer = hasTarget && rawPct > 1 && rawPct <= 1.1;  // 100-110% — gentle note
  const sortedTeam = [...teamAthletes].sort((a, b) => (teamMiles[b.id] || 0) - (teamMiles[a.id] || 0));
  const myRank = sortedTeam.findIndex(a => a.id === auth.currentUser?.uid) + 1;

  // Pace zones — compute from runs that have rawPaceStream data
  const trainingPaces = userData.trainingPaces || null;

  // Helper to compute pace breakdown from a set of runs. Falls back to
  // deriving avg pace from miles+duration for manual runs (no Strava stream)
  // so athletes who log manually still get pace-based zones.
  const computePaceBreakdown = (runs) => {
    if (!trainingPaces) return { breakdown: null, analysis: null };
    const combined = { e: 0, m: 0, t: 0, i: 0, r: 0 };
    for (const r of runs) {
      const zones = calcPaceZoneSecondsForRun(r, trainingPaces);
      if (zones) Object.keys(zones).forEach(k => { combined[k] += zones[k]; });
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

  // Check if VDOT paces are stale (>30 days since last update)
  const vdotStale = (() => {
    if (!userData.trainingPaces || !userData.vdotUpdatedAt) return false;
    const updatedAt = new Date(userData.vdotUpdatedAt);
    return (Date.now() - updatedAt.getTime()) > 30 * 86400000;
  })();

  const avatarColor = localAvatarColor;
  // Signal: indigo is the canonical avatar background per the design ref's
  // gradient fallback. We keep localAvatarColor for back-compat in any inline use.

  // Effort color helper (Signal palette mirrors the design ref's effort logic)
  const effortColorFor = (e) => {
    if (e == null) return SIGNAL.color.mute2;
    if (e <= 3) return SIGNAL.color.emerald;
    if (e <= 6) return SIGNAL.color.amber;
    if (e <= 8) return SIGNAL.color.coral;
    return SIGNAL.color.effort10;
  };

  const unseenParentBadge = (() => {
    const seenIds = userData.seenParentIds || [];
    return pendingParents.filter(p => !seenIds.includes(p.id)).length;
  })();

  return (
    <View style={styles.container}>
      {/* ── Clean header ── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>
              Hey, <Text style={styles.greetingAccent}>{userData.firstName || 'Athlete'}</Text>
            </Text>
            <Text style={styles.eyebrow}>
              {isPending ? 'Pending approval' : (school?.name || 'TeamBase')}
            </Text>
          </View>
          <TouchableOpacity onPress={() => { setActiveTab('home'); setProfileVisible(true); }} style={styles.profileBtn} activeOpacity={0.8}>
            <View style={[styles.profileAvatar, { backgroundColor: avatarColor }]}>
              <Text style={styles.profileAvatarText}>
                {userData.firstName?.[0]}{userData.lastName?.[0]}
              </Text>
            </View>
            {unseenParentBadge > 0 && (
              <View style={styles.profileBadge}>
                <Text style={styles.profileBadgeText}>{unseenParentBadge}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Coach message modal ── */}
      <Modal visible={messageModalVisible} transparent animationType="fade">
        <View style={styles.msgModalOverlay}>
          <View style={styles.msgModal}>
            <View style={styles.msgModalHeader}>
              <Text style={styles.msgModalEyebrow}>Message from coach</Text>
              <Text style={styles.msgModalDate}>Today</Text>
            </View>
            <Text style={styles.msgModalText}>{dailyMessage?.message}</Text>
            <Text style={styles.msgModalFrom}>— {dailyMessage?.sentByName}</Text>
            <TouchableOpacity style={styles.msgModalBtn} onPress={() => setMessageModalVisible(false)} activeOpacity={0.85}>
              <Text style={styles.msgModalBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

        {/* ── Strava auto-sync banner ── */}
        {autoSyncing && (
          <View style={[styles.bannerCard, styles.cardSpacer]}>
            <ActivityIndicator size="small" color={SIGNAL.color.indigo} />
            <Text style={styles.bannerText}>Syncing Strava…</Text>
          </View>
        )}

        {/* ── Pending approval banner ── */}
        {isPending && (
          <View style={[styles.bannerCard, styles.cardSpacer, { gap: SIGNAL.space[3] }]}>
            <View style={[styles.bannerIcon, { backgroundColor: `${SIGNAL.color.amber}${SIGNAL.tint.chip}` }]}>
              <Ionicons name="hourglass-outline" size={16} color={SIGNAL.color.amber} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerEyebrow}>Awaiting approval</Text>
              <Text style={styles.bannerBody}>Your coach hasn’t added you yet — you can still log runs.</Text>
            </View>
          </View>
        )}

        {/* ── No-school banner ── */}
        {!hasSchool && (
          <TouchableOpacity
            style={[styles.bannerCard, styles.cardSpacer, { gap: SIGNAL.space[3] }]}
            activeOpacity={0.85}
            onPress={() => goToJoinScreen && goToJoinScreen()}
          >
            <View style={[styles.bannerIcon, { backgroundColor: `${SIGNAL.color.indigo}${SIGNAL.tint.chip}` }]}>
              <Ionicons name="school-outline" size={16} color={SIGNAL.color.indigo} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerEyebrow}>Not on a team yet</Text>
              <Text style={styles.bannerBody}>Find your school to share runs with your coach and teammates.</Text>
            </View>
            <Text style={styles.bannerCta}>Find</Text>
          </TouchableOpacity>
        )}

        {/* ── Weekly miles hero card ── */}
        <View style={[styles.cardSpacer]}>
          <View style={[styles.heroCard, isOverWarning && styles.heroCardOver]}>
            <View style={styles.heroBody}>
              <View style={styles.heroTopRow}>
                <Text style={styles.eyebrow}>This week</Text>
                {!hasTarget ? (
                  <Text style={[styles.heroHint, { color: SIGNAL.color.mute }]}>No target set</Text>
                ) : isOverWarning ? (
                  <View style={styles.heroOverRow}>
                    <Ionicons name="warning-outline" size={12} color={SIGNAL.color.coral} />
                    <Text style={[styles.heroHint, { color: SIGNAL.color.coral }]}>{overPct}% over</Text>
                  </View>
                ) : isOverBuffer ? (
                  <Text style={[styles.heroHint, { color: SIGNAL.color.amber }]}>{overPct}% over</Text>
                ) : targetPct >= 1 ? (
                  <Text style={[styles.heroHint, { color: SIGNAL.color.emerald }]}>Target hit</Text>
                ) : (
                  <Text style={[styles.heroHint, { color: SIGNAL.color.amber }]}>
                    {Math.round((weeklyTarget - weeklyMiles) * 10) / 10} mi to go
                  </Text>
                )}
              </View>
              <View style={styles.heroMilesRow}>
                <Text style={[styles.heroMilesNum, isOverWarning && { color: SIGNAL.color.coral }]}>
                  {weeklyMiles}
                </Text>
                {hasTarget ? (
                  <>
                    <Text style={styles.heroMilesOf}>/ {weeklyTarget} mi</Text>
                    <View style={{ flex: 1 }} />
                    <View style={styles.heroProgressBg}>
                      <Animated.View style={[styles.heroProgressFill, {
                        width: progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'], extrapolate: 'clamp' }),
                      }]}>
                        <LinearGradient
                          colors={isOverWarning
                            ? [SIGNAL.color.coral, SIGNAL.color.coral]
                            : isOverBuffer
                              ? [SIGNAL.color.amber, SIGNAL.color.amber]
                              : [SIGNAL.color.indigo, SIGNAL.color.cyan]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={StyleSheet.absoluteFill}
                        />
                      </Animated.View>
                    </View>
                  </>
                ) : (
                  <Text style={styles.heroMilesOf}>mi this week</Text>
                )}
              </View>
              {!hasTarget && (
                <Text style={styles.heroNoTargetNote}>Coach hasn't set a weekly target yet.</Text>
              )}
            </View>

            {/* Pace zone toggle (always shows this week's data regardless of timeframe picker) */}
            {weekPaceBreakdown && (
              <>
                <TouchableOpacity
                  style={styles.zoneToggle}
                  onPress={() => setZoneExpanded(e => !e)}
                  activeOpacity={0.75}
                >
                  <View style={styles.zoneStackedBarSmall}>
                    {weekPaceBreakdown.map(z => (
                      <View key={z.key} style={[styles.zoneStackedSegment, { flex: z.minutes || 1, backgroundColor: z.color }]} />
                    ))}
                  </View>
                  <Text style={styles.zoneToggleText}>Pace zones</Text>
                  <Ionicons
                    name={zoneExpanded ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color={SIGNAL.color.mute2}
                  />
                </TouchableOpacity>
                {zoneExpanded && (
                  <View style={styles.zoneDropdown}>
                    {weekPaceBreakdown.map(z => (
                      <View key={z.key} style={styles.zoneRow}>
                        <View style={[styles.zoneDot, { backgroundColor: z.color }]} />
                        <Text style={styles.zoneName}>{z.short} · {z.name}</Text>
                        <View style={styles.zoneBarBg}>
                          <View style={[styles.zoneBarFill, { width: z.pct + '%', backgroundColor: z.color }]} />
                        </View>
                        <Text style={styles.zoneTime}>{formatMinutes(z.minutes)}</Text>
                      </View>
                    ))}
                    {weekPaceAnalysis && (() => {
                      const status = weekPaceAnalysis.status;
                      const statusColor = status === 'great'
                        ? SIGNAL.color.emerald
                        : status === 'good'
                        ? SIGNAL.color.amber
                        : SIGNAL.color.coral;
                      const tail = status === 'great'
                        ? '— great balance'
                        : status === 'good'
                        ? '— good, aim for more easy'
                        : '— too hard, slow easy days';
                      return (
                        <View style={[styles.analysisChip, { backgroundColor: `${statusColor}${SIGNAL.tint.chip}` }]}>
                          <Text style={[styles.analysisText, { color: statusColor }]}>
                            Easy {weekPaceAnalysis.easyPct}% · Hard {weekPaceAnalysis.hardPct}% {tail}
                          </Text>
                        </View>
                      );
                    })()}
                  </View>
                )}
              </>
            )}
          </View>
        </View>

        {/* ── Season in Review banner ── */}
        {(() => {
          if (!school) return null;
          const completed = getCompletedSeasons(school);
          const unreviewedSeason = completed.find(s => {
            const key = `${s.sport}_${new Date(s.championshipDate).toISOString().split('T')[0]}`;
            return !reviewDismissed[key];
          });
          if (!unreviewedSeason) return null;
          const sportDef = { cross_country: 'Cross Country', indoor_track: 'Indoor Track', outdoor_track: 'Outdoor Track' };
          return (
            <View style={[styles.cardSpacer]}>
              <View style={[styles.promptCard, { backgroundColor: `${SIGNAL.color.emerald}${SIGNAL.tint.chip}`, borderColor: `${SIGNAL.color.emerald}55` }]}>
                <View style={styles.promptTop}>
                  <View style={[styles.promptIcon, { backgroundColor: SIGNAL.color.white }]}>
                    <Ionicons name="trophy-outline" size={18} color={SIGNAL.color.emerald} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.promptTitle}>Season complete</Text>
                    <Text style={styles.promptDesc}>
                      Your {sportDef[unreviewedSeason.sport] || 'season'} season is in the books. See your recap.
                    </Text>
                  </View>
                  <TouchableOpacity onPress={async () => {
                    const key = `${unreviewedSeason.sport}_${new Date(unreviewedSeason.championshipDate).toISOString().split('T')[0]}`;
                    setReviewDismissed(prev => ({ ...prev, [key]: true }));
                    try { await updateDoc(doc(db, 'users', auth.currentUser.uid), { [`reviewedSeasons.${key}`]: true }); } catch (e) { console.warn('Save review dismiss:', e); }
                  }} style={styles.promptClose} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <Ionicons name="close" size={16} color={SIGNAL.color.mute} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[styles.promptCta, { backgroundColor: SIGNAL.color.emerald }]}
                  onPress={() => { setSeasonReviewSeason(unreviewedSeason); setSeasonReviewVisible(true); }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.promptCtaText}>View season recap</Text>
                  <Ionicons name="arrow-forward" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          );
        })()}

        {/* ── Daily wellness check-in prompt (indigo accent card) ── */}
        {!todayCheckinDone && !wellnessCardDismissed && (
          <View style={[styles.cardSpacer]}>
            <LinearGradient
              colors={[SIGNAL.color.indigo, SIGNAL.color.violet]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.checkinCard}
            >
              <TouchableOpacity
                onPress={() => setWellnessCardDismissed(true)}
                style={styles.checkinClose}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Ionicons name="close" size={16} color="rgba(255,255,255,0.85)" />
              </TouchableOpacity>
              <Text style={styles.checkinEyebrow}>Daily check-in</Text>
              <Text style={styles.checkinTitle}>How are you feeling today?</Text>
              <Text style={styles.checkinDesc}>Quick check-in helps your coach keep you healthy.</Text>
              <TouchableOpacity
                style={styles.checkinBtn}
                onPress={() => setDailyWellnessVisible(true)}
                activeOpacity={0.85}
              >
                <Text style={styles.checkinBtnText}>Check in</Text>
                <Ionicons name="arrow-forward" size={14} color={SIGNAL.color.indigo} />
              </TouchableOpacity>
            </LinearGradient>
          </View>
        )}

        {/* ── Weekly check-in: "coach replied" card (persistent until viewed) ── */}
        {latestWeeklyCheckin?.coachReply && !latestWeeklyCheckin?.athleteViewedReplyAt && (
          <View style={[styles.cardSpacer]}>
            <View style={styles.weeklyReplyCard}>
              <View style={styles.weeklyReplyTop}>
                <View style={styles.weeklyReplyIcon}>
                  <Ionicons name="chatbubble-ellipses" size={18} color={SIGNAL.color.indigo} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.weeklyReplyEyebrow}>Coach replied</Text>
                  <Text style={styles.weeklyReplyPreview} numberOfLines={2}>
                    {latestWeeklyCheckin.coachReply.text}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.weeklyReplyBtn}
                onPress={() => { setWeeklyComposeMode(false); setWeeklyCheckinVisible(true); }}
                activeOpacity={0.85}
              >
                <Text style={styles.weeklyReplyBtnText}>Read coach&apos;s message</Text>
                <Ionicons name="arrow-forward" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Weekly check-in: "send weekly check-in" prompt (Sat noon → Mon noon) ── */}
        {(() => {
          const tz = school?.timezone || 'America/New_York';
          if (!isInWeeklyWindow(new Date(), tz)) return null;
          if (weeklyCardDismissed) return null;
          const anchor = getWeekAnchor(new Date(), tz);
          // Already submitted this week? The latest checkin's weekStartISO matches anchor.
          if (latestWeeklyCheckin?.weekStartISO === anchor) return null;
          return (
            <View style={[styles.cardSpacer]}>
              <LinearGradient
                colors={[SIGNAL.color.indigo, SIGNAL.color.violet]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.checkinCard}
              >
                <TouchableOpacity
                  onPress={() => setWeeklyCardDismissed(true)}
                  style={styles.checkinClose}
                  hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                >
                  <Ionicons name="close" size={16} color="rgba(255,255,255,0.85)" />
                </TouchableOpacity>
                <Text style={styles.checkinEyebrow}>Weekly check-in</Text>
                <Text style={styles.checkinTitle}>How was your week?</Text>
                <Text style={styles.checkinDesc}>Send your coach a quick update — training, school, anything.</Text>
                <TouchableOpacity
                  style={styles.checkinBtn}
                  onPress={() => { setWeeklyComposeMode(true); setWeeklyCheckinVisible(true); }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.checkinBtnText}>Share with coach</Text>
                  <Ionicons name="arrow-forward" size={14} color={SIGNAL.color.indigo} />
                </TouchableOpacity>
              </LinearGradient>
            </View>
          );
        })()}

        {/* ── VDOT setup prompt ── */}
        {!userData.trainingPaces && (
          <View style={[styles.cardSpacer]}>
            <View style={styles.promptCard}>
              <View style={styles.promptTop}>
                <View style={[styles.promptIcon, { backgroundColor: `${SIGNAL.color.indigo}${SIGNAL.tint.chip}` }]}>
                  <Ionicons name="speedometer-outline" size={18} color={SIGNAL.color.indigo} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.promptTitle}>Set your training paces</Text>
                  <Text style={styles.promptDesc}>Enter a recent race time to unlock pace-based training zones.</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.promptCta, { backgroundColor: SIGNAL.color.ink }]}
                onPress={() => { setActiveTab('home'); setProfileVisible(true); }}
                activeOpacity={0.85}
              >
                <Text style={styles.promptCtaText}>Set up paces</Text>
                <Ionicons name="arrow-forward" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Benchmark refresh prompt (stale VDOT) ── */}
        {vdotStale && !benchmarkDismissed && (
          <View style={[styles.cardSpacer]}>
            <View style={styles.promptCard}>
              <View style={styles.promptTop}>
                <View style={[styles.promptIcon, { backgroundColor: `${SIGNAL.color.emerald}${SIGNAL.tint.chip}` }]}>
                  <Ionicons name="trophy-outline" size={18} color={SIGNAL.color.emerald} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.promptTitle}>Review your training paces</Text>
                  <Text style={styles.promptDesc}>It’s been a while since you updated. A recent race time can sharpen your zones.</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setBenchmarkDismissed(true)}
                  style={styles.promptClose}
                  hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                >
                  <Ionicons name="close" size={16} color={SIGNAL.color.mute} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.promptCta, { backgroundColor: SIGNAL.color.ink }]}
                onPress={() => { setActiveTab('home'); setProfileVisible(true); }}
                activeOpacity={0.85}
              >
                <Text style={styles.promptCtaText}>Update paces</Text>
                <Ionicons name="arrow-forward" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Strava connect prompt (compact row per design ref) ── */}
        {/* Shown on web too for the PWA beta — web OAuth runs via /strava-callback. */}
        {!stravaLinked && !stravaDismissed && (
          <View style={[styles.cardSpacer]}>
            <View style={styles.stravaRow}>
              <View style={styles.stravaLogo}>
                <Text style={styles.stravaLogoText}>S</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stravaTitle}>Connect Strava</Text>
                <Text style={styles.stravaDesc}>Auto-sync runs so you never log manually.</Text>
              </View>
              <TouchableOpacity
                style={styles.stravaCta}
                onPress={() => setStravaVisible(true)}
                activeOpacity={0.85}
              >
                <Text style={styles.stravaCtaText}>Connect</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setStravaDismissed(true)}
                style={styles.stravaClose}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Ionicons name="close" size={14} color={SIGNAL.color.mute} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Coach messages quick link (always-on, low-footprint) ── */}
        <TouchableOpacity
          style={styles.coachMsgsLink}
          onPress={() => setWeeklyHistoryVisible(true)}
          activeOpacity={0.7}
          hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
        >
          <Ionicons name="chatbubble-outline" size={12} color={SIGNAL.color.mute} />
          <Text style={styles.coachMsgsLinkText}>Coach messages</Text>
          <Ionicons name="chevron-forward" size={11} color={SIGNAL.color.mute2} />
        </TouchableOpacity>

        {/* ── Upcoming workouts ── */}
        {isApproved && upcomingWorkouts.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Upcoming <Text style={styles.sectionTitleAccent}>workouts</Text>
              </Text>
            </View>
            <View style={styles.sectionBody}>
              {upcomingWorkouts.slice(0, 2).map(workout => {
                const c = SIGNAL_TYPE_COLORS[workout.type] || TYPE_COLORS[workout.type] || SIGNAL.color.indigo;
                const wkMiles = myGroup && workout.groupMiles?.[myGroup.id]
                  ? workout.groupMiles[myGroup.id]
                  : workout.baseMiles || null;
                let paceText = null;
                if (userData.trainingPaces && WORKOUT_PACE_ZONE[workout.type]) {
                  const zone = WORKOUT_PACE_ZONE[workout.type];
                  const tp = userData.trainingPaces;
                  paceText = zone === 'easy' ? `${formatPace(tp.eLow)}–${formatPace(tp.eHigh)}/mi`
                    : zone === 'threshold' ? `${formatPace(tp.t)}/mi`
                    : zone === 'interval' ? `${formatPace(tp.i)}/mi`
                    : zone === 'repetition' ? `${formatPace(tp.r)}/mi` : null;
                }
                const dateLabel = workout.date?.toDate?.()?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                return (
                  <TouchableOpacity
                    key={workout.id}
                    style={[styles.workoutCard, { borderLeftColor: c, borderLeftWidth: 3 }]}
                    onPress={() => { setSelectedWorkout(workout); setWorkoutDetailVisible(true); }}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.workoutChip, { backgroundColor: `${c}${SIGNAL.tint.chip}` }]}>
                      <View style={[styles.workoutChipDot, { backgroundColor: c }]} />
                      <Text style={[styles.workoutChipText, { color: c }]}>{workout.type}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.workoutTitle}>
                        {workout.title}{wkMiles ? ` — ${wkMiles} mi` : ''}
                      </Text>
                      {paceText && (
                        <Text style={styles.workoutPace}>Target {paceText}</Text>
                      )}
                      {(dateLabel || workout.description) && (
                        <Text style={styles.workoutMeta} numberOfLines={1}>
                          {dateLabel}{dateLabel && workout.description ? ' · ' : ''}{workout.description || ''}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* ── Timeframe picker ── */}
        <View style={styles.timeframeRow}>
          <TimeframePicker
            selected={selectedTimeframe}
            onSelect={setSelectedTimeframe}
            customStart={customStart}
            customEnd={customEnd}
            onCustomChange={(s, e) => { setCustomStart(s); setCustomEnd(e); }}
            activeSeason={getActiveSeason(school)}
            primaryColor={SIGNAL.color.indigo}
          />
        </View>

        {/* ── Team leaderboard ── */}
        {isApproved && sortedTeam.length > 0 && (() => {
          const displayTeam = leaderboardFilter === 'mygroup' && myGroup
            ? sortedTeam.filter(a => a.groupId === myGroup.id)
            : sortedTeam;
          const displayRank = displayTeam.findIndex(a => a.id === auth.currentUser?.uid) + 1;
          return (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  Team <Text style={styles.sectionTitleAccent}>leaderboard</Text>
                </Text>
                <Text style={styles.sectionSub}>{selectedTimeframe.label?.toLowerCase() || 'selected period'}</Text>
              </View>
              {myGroup && (
                <View style={styles.pillRow}>
                  {[['all', 'All'], ['mygroup', myGroup.name]].map(([k, l]) => {
                    const active = leaderboardFilter === k;
                    return (
                      <TouchableOpacity
                        key={k}
                        style={[styles.pill, active && styles.pillActive]}
                        onPress={() => setLeaderboardFilter(k)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.pillText, active && styles.pillTextActive]}>{l}</Text>
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
              <View style={styles.sectionBody}>
                {displayTeam.slice(0, 5).map((athlete, index) => {
                  const isMe = athlete.id === auth.currentUser?.uid;
                  const m = teamMiles[athlete.id] || 0;
                  return (
                    <View key={athlete.id}>
                      <TouchableOpacity
                        style={[styles.leaderRow, isMe && styles.leaderRowMe]}
                        onPress={() => isMe ? (paceBreakdown && setLeaderPaceExpanded(e => !e)) : setSelectedTeammate(athlete)}
                        activeOpacity={isMe && !paceBreakdown ? 1 : 0.75}
                      >
                        <Text style={[styles.leaderRank, isMe && { color: SIGNAL.color.indigo }]}>#{index + 1}</Text>
                        <View style={[styles.leaderAvatar, { backgroundColor: athlete.avatarColor || SIGNAL.color.indigo }]}>
                          <Text style={styles.leaderAvatarText}>
                            {athlete.firstName?.[0]}{athlete.lastName?.[0]}
                          </Text>
                        </View>
                        <View style={styles.leaderInfo}>
                          <Text style={[styles.leaderName, isMe && { color: SIGNAL.color.indigo, fontFamily: SIGNAL.font.bodyBold }]}>
                            {isMe ? 'You' : `${athlete.firstName} ${athlete.lastName}`}
                          </Text>
                          {!isMe && <Text style={styles.leaderSub}>Tap to view profile</Text>}
                        </View>
                        <View style={styles.leaderMilesWrap}>
                          <Text style={[styles.leaderMiles, { color: isMe ? SIGNAL.color.indigo : SIGNAL.color.ink }]}>
                            {(Math.round(m * 10) / 10).toFixed(1)}
                          </Text>
                          <Text style={styles.leaderMilesUnit}> mi</Text>
                        </View>
                        {isMe && paceBreakdown && (
                          <Ionicons
                            name={leaderPaceExpanded ? 'chevron-up' : 'chevron-down'}
                            size={14}
                            color={SIGNAL.color.indigo}
                            style={{ marginLeft: 4 }}
                          />
                        )}
                      </TouchableOpacity>
                      {isMe && leaderPaceExpanded && paceBreakdown && (
                        <View style={[styles.zoneDropdown, { marginTop: -2, marginBottom: SIGNAL.space[2] }]}>
                          {paceBreakdown.map(z => (
                            <View key={z.key} style={styles.zoneRow}>
                              <View style={[styles.zoneDot, { backgroundColor: z.color }]} />
                              <Text style={styles.zoneName}>{z.short} · {z.name}</Text>
                              <View style={styles.zoneBarBg}>
                                <View style={[styles.zoneBarFill, { width: z.pct + '%', backgroundColor: z.color }]} />
                              </View>
                              <Text style={styles.zoneTime}>{formatMinutes(z.minutes)}</Text>
                            </View>
                          ))}
                          {paceAnalysis && (() => {
                            const statusColor = paceAnalysis.status === 'great'
                              ? SIGNAL.color.emerald
                              : paceAnalysis.status === 'good'
                              ? SIGNAL.color.amber
                              : SIGNAL.color.coral;
                            return (
                              <View style={[styles.analysisChip, { backgroundColor: `${statusColor}${SIGNAL.tint.chip}` }]}>
                                <Text style={[styles.analysisText, { color: statusColor }]}>
                                  Easy {paceAnalysis.easyPct}% · Hard {paceAnalysis.hardPct}%
                                </Text>
                              </View>
                            );
                          })()}
                        </View>
                      )}
                    </View>
                  );
                })}
                {displayTeam.length > 5 && displayRank > 5 && (
                  <View style={[styles.leaderRow, styles.leaderRowMe]}>
                    <Text style={[styles.leaderRank, { color: SIGNAL.color.indigo }]}>#{displayRank}</Text>
                    <View style={[styles.leaderAvatar, { backgroundColor: SIGNAL.color.indigo }]}>
                      <Text style={styles.leaderAvatarText}>
                        {userData.firstName?.[0]}{userData.lastName?.[0]}
                      </Text>
                    </View>
                    <View style={styles.leaderInfo}>
                      <Text style={[styles.leaderName, { color: SIGNAL.color.indigo, fontFamily: SIGNAL.font.bodyBold }]}>You</Text>
                    </View>
                    <View style={styles.leaderMilesWrap}>
                      <Text style={[styles.leaderMiles, { color: SIGNAL.color.indigo }]}>
                        {(Math.round(totalMiles * 10) / 10).toFixed(1)}
                      </Text>
                      <Text style={styles.leaderMilesUnit}> mi</Text>
                    </View>
                  </View>
                )}
              </View>
            </>
          );
        })()}

        {/* ── My runs ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            My <Text style={styles.sectionTitleAccent}>runs</Text>
          </Text>
        </View>
        <View style={styles.sectionBody}>
          {recentRuns.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No runs yet — tap “Log run” to get started.</Text>
            </View>
          ) : recentRuns.map(run => {
            const dateStr = run.date?.toDate?.()?.toLocaleDateString() || 'Today';
            const eColor = effortColorFor(run.effort);
            return (
              <TouchableOpacity
                key={run.id}
                style={styles.runCard}
                activeOpacity={0.8}
                onPress={() => { setSelectedRun(run); setRunDetailVisible(true); }}
              >
                <View style={styles.runLeft}>
                  <View style={styles.runMilesRow}>
                    <Text style={styles.runMilesNum}>{run.miles}</Text>
                    <Text style={styles.runMilesUnit}>mi</Text>
                  </View>
                  <Text style={styles.runDate}>{dateStr}</Text>
                </View>
                <View style={styles.runMiddle}>
                  {run.duration && <Text style={styles.runDuration}>{run.duration}</Text>}
                </View>
                {run.effort != null ? (
                  <View style={styles.runRight}>
                    <Text style={styles.runEffortEyebrow}>Effort</Text>
                    <Text style={[styles.runEffortValue, { color: eColor }]}>{run.effort}/10</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.rateEffortBtn}
                    onPress={(e) => { e.stopPropagation(); setEffortPickerRun(run); }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.rateEffortText}>Rate effort</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

      </ScrollView>

      {/* ── Quick effort picker modal ── */}
      <Modal visible={!!effortPickerRun} transparent animationType="fade" onRequestClose={() => setEffortPickerRun(null)}>
        <TouchableOpacity style={styles.effortOverlay} activeOpacity={1} onPress={() => setEffortPickerRun(null)}>
          <View style={styles.effortPickerCard}>
            <Text style={styles.effortPickerTitle}>How did it feel?</Text>
            <Text style={styles.effortPickerSub}>
              {effortPickerRun?.miles} mi — {effortPickerRun?.date?.toDate?.()?.toLocaleDateString() || 'Today'}
            </Text>
            <View style={styles.effortPickerRow}>
              {[1,2,3,4,5,6,7,8,9,10].map(val => {
                const c = effortColorFor(val);
                return (
                  <TouchableOpacity
                    key={val}
                    style={[styles.effortPickerBtn, { backgroundColor: `${c}${SIGNAL.tint.chip}` }]}
                    onPress={() => handleQuickEffort(effortPickerRun, val)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.effortPickerBtnText, { color: c }]}>{val}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.effortPickerHint}>1 = Very Easy   ·   10 = All Out</Text>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Wellness check-in sheet (custom component) ── */}
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
          // Force a fresh dashboard load so the wellness card hides immediately
          // even if the local state update gets lost in a render race.
          loadDashboard();
        } catch (e) {
          console.warn('Failed to save daily check-in:', e);
          Alert.alert('Check-in not saved', `Could not save your check-in: ${e.message || e}. Please try again.`);
        }
      }} onSkip={() => { setDailyWellnessVisible(false); setTodayCheckinDone(true); }} onClose={() => setDailyWellnessVisible(false)} />

      {/* ── Weekly check-in modal ── */}
      <WeeklyCheckIn
        visible={weeklyCheckinVisible}
        existingCheckin={(() => {
          // Reading a coach reply → always the latest doc (may be last week's).
          if (!weeklyComposeMode) return latestWeeklyCheckin;
          // Composing → only treat the latest doc as "this week's" when its
          // anchor matches; otherwise pass null so the input starts fresh and
          // isn't locked by last week's coach reply.
          const tz = school?.timezone || 'America/New_York';
          const anchor = getWeekAnchor(new Date(), tz);
          return latestWeeklyCheckin?.weekStartISO === anchor ? latestWeeklyCheckin : null;
        })()}
        onSubmit={async (messageText) => {
          try {
            const tz = school?.timezone || 'America/New_York';
            const anchor = getWeekAnchor(new Date(), tz);
            const docId = getWeeklyCheckinDocId(auth.currentUser.uid, anchor);
            const isEdit = latestWeeklyCheckin?.weekStartISO === anchor;
            if (isEdit) {
              await updateDoc(doc(db, 'weeklyCheckins', docId), {
                message: messageText,
                submittedAt: serverTimestamp(),
              });
            } else {
              await setDoc(doc(db, 'weeklyCheckins', docId), {
                userId: auth.currentUser.uid,
                schoolId: userData.schoolId || null,
                weekStartISO: anchor,
                message: messageText,
                submittedAt: serverTimestamp(),
                createdAt: serverTimestamp(),
              });
            }
            setWeeklyCheckinVisible(false);
            loadDashboard();
          } catch (e) {
            console.warn('Weekly check-in save failed:', e);
            Alert.alert('Check-in not saved', `Could not send your message: ${e.message || e}. Please try again.`);
          }
        }}
        onMarkReplyRead={async () => {
          if (!latestWeeklyCheckin?.id) return;
          try {
            await updateDoc(doc(db, 'weeklyCheckins', latestWeeklyCheckin.id), {
              athleteViewedReplyAt: serverTimestamp(),
            });
            loadDashboard();
          } catch (e) {
            console.warn('Mark weekly reply read failed:', e);
          }
        }}
        onViewHistory={() => setWeeklyHistoryVisible(true)}
        onClose={() => setWeeklyCheckinVisible(false)}
      />

      <WeeklyCheckinHistory
        visible={weeklyHistoryVisible}
        athleteId={auth.currentUser?.uid}
        athleteName="Your check-ins"
        onClose={() => setWeeklyHistoryVisible(false)}
      />

      <WorkoutDetailModal
        item={selectedWorkout}
        visible={workoutDetailVisible}
        onClose={() => { setWorkoutDetailVisible(false); setSelectedWorkout(null); }}
        primaryColor={SIGNAL.color.indigo}
        athleteMiles={selectedWorkout && myGroup ? (selectedWorkout.groupMiles?.[myGroup.id] || selectedWorkout.baseMiles || null) : (selectedWorkout?.baseMiles || null)}
        groupName={myGroup?.name}
        trainingPaces={userData.trainingPaces || null}
      />

      <RunDetailModal
        run={selectedRun}
        visible={runDetailVisible}
        primaryColor={SIGNAL.color.indigo}
        trainingPaces={userData.trainingPaces || null}
        onClose={() => { setRunDetailVisible(false); setSelectedRun(null); }}
        onDeleted={() => { setRunDetailVisible(false); setSelectedRun(null); loadDashboard(); }}
        onUpdated={() => { setSelectedRun(null); loadDashboard(); }}
      />

      {/* ── Log run modal ── */}
      <Modal visible={logModalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.logModal}>
            <View style={styles.logModalHeader}>
              <TouchableOpacity onPress={() => { setLogModalVisible(false); setEditingRunId(null); }}>
                <Text style={styles.logModalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.logModalTitle}>{editingRunId ? 'Edit run' : 'Log a run'}</Text>
              <View style={{ width: 60 }} />
            </View>
            <ScrollView style={styles.logModalScroll} keyboardShouldPersistTaps="handled">
              <DatePickerField label="Run date" value={runDate} onChange={setRunDate} primaryColor={SIGNAL.color.indigo} maximumDate={new Date()} />
              <Text style={styles.logLabel}>Miles *</Text>
              <TextInput
                style={styles.logInput}
                placeholder="e.g. 5.2"
                placeholderTextColor={SIGNAL.color.mute2}
                value={miles}
                onChangeText={setMiles}
                keyboardType="decimal-pad"
                returnKeyType="next"
              />
              <Text style={styles.logLabel}>Duration (optional)</Text>
              <TextInput
                style={styles.logInput}
                placeholder="e.g. 42:30"
                placeholderTextColor={SIGNAL.color.mute2}
                value={duration}
                onChangeText={setDuration}
                returnKeyType="next"
              />
              <Text style={styles.logLabel}>How did it feel? {effort}/10 — {EFFORT_LABELS[effort]}</Text>
              <View style={styles.effortRow}>
                {[1,2,3,4,5,6,7,8,9,10].map(n => {
                  const c = effortColorFor(n);
                  const active = effort === n;
                  return (
                    <TouchableOpacity
                      key={n}
                      style={[
                        styles.effortBtn,
                        { backgroundColor: active ? c : `${c}${SIGNAL.tint.chip}` },
                      ]}
                      onPress={() => setEffort(n)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.effortBtnText, { color: active ? '#fff' : c }]}>{n}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.logLabel}>Notes (optional)</Text>
              <TextInput
                style={[styles.logInput, { height: 90, textAlignVertical: 'top' }]}
                placeholder="How did the run go?"
                placeholderTextColor={SIGNAL.color.mute2}
                value={notes}
                onChangeText={setNotes}
                multiline
              />
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: SIGNAL.color.indigo }]}
                onPress={handleLogRun}
                disabled={savingRun}
                activeOpacity={0.85}
              >
                {savingRun
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveBtnText}>{editingRunId ? 'Save changes' : 'Save run'}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Sub-screens rendered over content but under nav ── */}
      {seasonReviewVisible && seasonReviewSeason && (
        <View style={[styles.subScreen, { bottom: navHeight }]}>
          <Suspense fallback={<View style={styles.loading}><ActivityIndicator size="large" color={SIGNAL.color.indigo} /></View>}>
            <SeasonReview season={seasonReviewSeason} school={school} userData={userData} onClose={() => { setSeasonReviewVisible(false); setSeasonReviewSeason(null); }} />
          </Suspense>
        </View>
      )}
      {calendarMounted && (
        <View style={[styles.subScreen, { bottom: navHeight }, !calendarVisible && { display: 'none' }]}>
          <MemoCalendarScreen userData={userData} school={school} trainingPaces={userData.trainingPaces || null} onClose={handleCloseCalendar} />
        </View>
      )}
      {stravaVisible && (
        <View style={[styles.subScreen, { bottom: navHeight }]}>
          <StravaConnect userData={userData} school={school} onClose={() => { setStravaVisible(false); loadDashboard(); }} onSynced={() => { setStravaVisible(false); setStravaLinked(true); loadDashboard(); }} />
        </View>
      )}
      {feedMounted && (
        <View style={[styles.subScreen, { bottom: navHeight }, !feedVisible && { display: 'none' }]}>
          <MemoChannelList userData={userData} school={school} onClose={handleCloseFeed} onUnreadChange={setUnreadFeedCount} />
        </View>
      )}
      {statsMounted && (
        <View style={[styles.subScreen, { bottom: navHeight }, !statsVisible && { display: 'none' }]}>
          <Suspense fallback={<View style={styles.loading}><ActivityIndicator size="large" color={SIGNAL.color.indigo} /></View>}>
            <MemoAthleteAnalytics
              userData={userData}
              school={school}
              myGroup={myGroup}
              onClose={handleCloseStats}
            />
          </Suspense>
        </View>
      )}
      {profileVisible && (
        <View style={[styles.subScreen, { bottom: navHeight }]}>
          <AthleteProfile userData={userData} school={school} refreshUser={refreshUser} goToJoinScreen={goToJoinScreen} onClose={async () => {
            try {
              const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
              if (userDoc.exists()) {
                const d = userDoc.data();
                setLocalAvatarColor(d.avatarColor || BRAND);
                setUserOverrides(prev => ({
                  ...prev,
                  vdot: d.vdot, vdotDistance: d.vdotDistance, vdotTime: d.vdotTime,
                  trainingPaces: d.trainingPaces, vdotUpdatedAt: d.vdotUpdatedAt,
                  avatarColor: d.avatarColor,
                  // Pick up the latest seenParentIds so the dashboard avatar
                  // badge clears as soon as the profile closes after the
                  // athlete visited the Connections tab.
                  seenParentIds: d.seenParentIds,
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

      {/* ── Persistent bottom nav ── */}
      <View
        style={styles.bottomNav}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && h !== navHeight) setNavHeight(h);
        }}
      >
        {(() => {
          const onHome = !calendarVisible && !stravaVisible && !feedVisible && !profileVisible && !statsVisible;
          const tabs = [
            { key: 'home',     icon: 'home-outline',      label: 'Home',     active: onHome,         onPress: () => { setCalendarVisible(false); setStravaVisible(false); setFeedVisible(false); setProfileVisible(false); setStatsVisible(false); } },
            { key: 'log',      icon: 'add-circle-outline', label: 'Log',     active: false,          onPress: handleLogRunTap },
            { key: 'calendar', icon: 'calendar-outline',  label: 'Calendar', active: calendarVisible, onPress: () => { setStravaVisible(false); setFeedVisible(false); setProfileVisible(false); setStatsVisible(false); setCalendarMounted(true); setCalendarVisible(true); } },
            { key: 'stats',    icon: 'stats-chart-outline', label: 'Stats', active: statsVisible,   onPress: () => { setCalendarVisible(false); setStravaVisible(false); setFeedVisible(false); setProfileVisible(false); setStatsMounted(true); setStatsVisible(true); } },
            { key: 'feed',     icon: 'chatbubbles-outline', label: 'Feed',  active: feedVisible,    onPress: () => { setCalendarVisible(false); setStravaVisible(false); setProfileVisible(false); setStatsVisible(false); setFeedMounted(true); setFeedVisible(true); } },
          ];
          return tabs.map(t => (
            <TouchableOpacity key={t.key} style={styles.bottomNavBtn} onPress={t.onPress} activeOpacity={0.7}>
              <View>
                <Ionicons name={t.icon} size={22} color={t.active ? SIGNAL.color.indigo : SIGNAL.color.mute2} />
                {t.key === 'feed' && unreadFeedCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unreadFeedCount > 99 ? '99+' : unreadFeedCount}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.bottomNavLabel, t.active && styles.bottomNavLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          ));
        })()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Layout ──────────────────────────────────────────────────────────────────
  container: { flex: 1, backgroundColor: SIGNAL.color.paper2 },
  loading:   { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: SIGNAL.color.paper2 },
  scroll:    { flex: 1 },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    backgroundColor: SIGNAL.color.paper2,
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: 14,
    paddingHorizontal: 18,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  greeting: {
    fontFamily: SIGNAL.font.display,
    fontSize: 29,
    lineHeight: 33,
    color: SIGNAL.color.indigo,
    letterSpacing: -0.58,
  },
  greetingAccent: {
    fontFamily: SIGNAL.font.display,
    color: SIGNAL.color.indigo,
  },
  eyebrow: {
    ...SIGNAL.style.eyebrow,
    marginTop: 6,
  },
  profileBtn: { padding: 2, position: 'relative' },
  profileAvatar: {
    width: 40, height: 40, borderRadius: SIGNAL.radius.chip,
    alignItems: 'center', justifyContent: 'center',
  },
  profileAvatarText: { color: '#fff', fontFamily: SIGNAL.font.bodyBold, fontSize: 13 },
  profileBadge: {
    position: 'absolute', top: -2, right: -2,
    minWidth: 16, height: 16, paddingHorizontal: 4,
    borderRadius: SIGNAL.radius.chip,
    backgroundColor: SIGNAL.color.coral,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: SIGNAL.color.paper2,
  },
  profileBadgeText: { color: '#fff', fontSize: 10, fontFamily: SIGNAL.font.bodyBold },

  // ── Generic card spacing ────────────────────────────────────────────────────
  cardSpacer: { paddingHorizontal: 14, marginTop: 10 },

  // ── Banner card (sync / pending / no-school) ────────────────────────────────
  bannerCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    paddingVertical: 12, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', gap: SIGNAL.space[2],
    ...SIGNAL.border.hairline,
  },
  bannerIcon: {
    width: 32, height: 32, borderRadius: SIGNAL.radius.chip,
    alignItems: 'center', justifyContent: 'center',
  },
  bannerEyebrow: { ...SIGNAL.style.eyebrow, fontSize: 10 },
  bannerBody: {
    fontFamily: SIGNAL.font.body, fontSize: 12.5, color: SIGNAL.color.inkSoft,
    marginTop: 2, lineHeight: 17,
  },
  bannerText: {
    fontFamily: SIGNAL.font.bodyMedium, fontSize: 13, color: SIGNAL.color.inkSoft,
  },
  bannerCta: {
    fontFamily: SIGNAL.font.bodySemi, fontSize: 12, color: SIGNAL.color.indigo,
  },

  // ── Hero weekly miles card ──────────────────────────────────────────────────
  heroCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    overflow: 'hidden',
    ...SIGNAL.border.hairline,
  },
  heroCardOver: { borderColor: `${SIGNAL.color.coral}77` },
  heroBody: { padding: 16, paddingBottom: 14 },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  heroHint: { fontSize: 12, fontFamily: SIGNAL.font.bodySemi },
  heroMilesRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6 },
  heroMilesNum: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 46, lineHeight: 46,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.numTight,
  },
  heroMilesOf: { fontFamily: SIGNAL.font.body, fontSize: 14, color: SIGNAL.color.mute },
  heroNoTargetNote: { fontFamily: SIGNAL.font.body, fontSize: 12, color: SIGNAL.color.mute2, marginTop: 6 },
  heroProgressBg: {
    flex: 3, height: 8,
    marginLeft: 4,
    backgroundColor: SIGNAL.color.line,
    borderRadius: SIGNAL.radius.chip, overflow: 'hidden',
    alignSelf: 'center',
  },
  heroProgressFill: { height: '100%', borderRadius: SIGNAL.radius.chip },
  heroOverRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  // ── Zone toggle (hero footer) ───────────────────────────────────────────────
  zoneToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 18, paddingVertical: 11,
    backgroundColor: SIGNAL.color.paper,
    borderTopWidth: 1, borderTopColor: SIGNAL.color.line,
  },
  zoneStackedBarSmall: {
    flex: 1, flexDirection: 'row', height: 8,
    borderRadius: SIGNAL.radius.chip, overflow: 'hidden', gap: 1.5,
  },
  zoneStackedSegment: { height: '100%' },
  zoneToggleText: {
    fontFamily: SIGNAL.font.bodySemi, fontSize: 11.5, color: SIGNAL.color.inkSoft,
  },
  zoneDropdown: {
    paddingHorizontal: 18, paddingVertical: 12,
    backgroundColor: SIGNAL.color.white,
    borderTopWidth: 1, borderTopColor: SIGNAL.color.line,
  },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  zoneDot: { width: 9, height: 9, borderRadius: 999 },
  zoneName: { flex: 1, fontFamily: SIGNAL.font.body, fontSize: 12, color: SIGNAL.color.inkSoft },
  zoneBarBg: {
    width: 70, height: 5, backgroundColor: SIGNAL.color.line,
    borderRadius: SIGNAL.radius.chip, overflow: 'hidden',
  },
  zoneBarFill: { height: '100%', borderRadius: SIGNAL.radius.chip },
  zoneTime: {
    fontFamily: SIGNAL.font.mono, fontSize: 11, color: SIGNAL.color.mute,
    minWidth: 48, textAlign: 'right',
  },
  analysisChip: {
    marginTop: 10, paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: SIGNAL.radius.control,
  },
  analysisText: { fontFamily: SIGNAL.font.bodySemi, fontSize: 11.5 },

  // ── Daily check-in card (indigo → violet gradient) ─────────────────────────
  checkinCard: {
    borderRadius: SIGNAL.radius.card,
    padding: 16, position: 'relative', overflow: 'hidden',
  },
  checkinClose: {
    position: 'absolute', top: 10, right: 10, padding: 4, zIndex: 2,
  },
  checkinEyebrow: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 10.5, letterSpacing: 1.36,
    textTransform: 'uppercase', color: 'rgba(255,255,255,0.78)',
  },
  checkinTitle: {
    fontFamily: SIGNAL.font.displayItalic,
    fontSize: 23, lineHeight: 26, color: '#fff', marginTop: 4,
  },
  checkinDesc: {
    fontFamily: SIGNAL.font.body, fontSize: 12,
    color: 'rgba(255,255,255,0.85)', marginTop: 6, lineHeight: 17,
  },
  checkinBtn: {
    marginTop: 13, backgroundColor: '#fff',
    paddingVertical: 12, borderRadius: 11,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  checkinBtnText: {
    fontFamily: SIGNAL.font.bodySemi, fontSize: 14, color: SIGNAL.color.indigo,
  },

  // ── Weekly check-in: "coach replied" card (indigo accent, persistent) ──────
  weeklyReplyCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: 14,
    borderWidth: 1,
    borderColor: `${SIGNAL.color.indigo}40`,
    borderLeftWidth: 3,
    borderLeftColor: SIGNAL.color.indigo,
  },
  weeklyReplyTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  weeklyReplyIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: `${SIGNAL.color.indigo}15`,
    alignItems: 'center', justifyContent: 'center',
  },
  weeklyReplyEyebrow: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 10.5, letterSpacing: 1.36,
    textTransform: 'uppercase', color: SIGNAL.color.indigo,
    marginBottom: 4,
  },
  weeklyReplyPreview: {
    fontFamily: SIGNAL.font.body, fontSize: 13,
    color: SIGNAL.color.ink, lineHeight: 18,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  weeklyReplyBtn: {
    marginTop: 12, backgroundColor: SIGNAL.color.indigo,
    paddingVertical: 11, borderRadius: 11,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  weeklyReplyBtnText: {
    fontFamily: SIGNAL.font.bodySemi, fontSize: 13.5, color: '#fff',
    letterSpacing: SIGNAL.letter.bodyTight,
  },

  // Small "Coach messages" link — opens weekly check-in history (always visible)
  coachMsgsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 6,
  },
  coachMsgsLinkText: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 11.5,
    color: SIGNAL.color.mute,
    letterSpacing: SIGNAL.letter.bodyTight,
  },

  // ── Prompt card (VDOT / season review / etc.) ──────────────────────────────
  promptCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: 14,
    ...SIGNAL.border.hairline,
  },
  promptTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  promptIcon: {
    width: 34, height: 34, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  promptTitle: {
    fontFamily: SIGNAL.font.bodySemi, fontSize: 13.5, color: SIGNAL.color.ink,
  },
  promptDesc: {
    fontFamily: SIGNAL.font.body, fontSize: 11.5, color: SIGNAL.color.mute,
    marginTop: 2, lineHeight: 16,
  },
  promptClose: { padding: 2 },
  promptCta: {
    marginTop: 12, paddingVertical: 11,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: SIGNAL.radius.button,
  },
  promptCtaText: { color: '#fff', fontFamily: SIGNAL.font.bodySemi, fontSize: 13 },

  // ── Strava compact row ──────────────────────────────────────────────────────
  stravaRow: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    ...SIGNAL.border.hairline,
  },
  stravaLogo: {
    width: 34, height: 34, borderRadius: 9,
    backgroundColor: '#FC4C0218',
    alignItems: 'center', justifyContent: 'center',
  },
  stravaLogoText: {
    fontFamily: SIGNAL.font.bodyBold, fontSize: 16, color: '#FC4C02',
  },
  stravaTitle: { fontFamily: SIGNAL.font.bodySemi, fontSize: 13.5, color: SIGNAL.color.ink },
  stravaDesc:  { fontFamily: SIGNAL.font.body, fontSize: 11, color: SIGNAL.color.mute, marginTop: 1 },
  stravaCta: {
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: SIGNAL.radius.control,
    backgroundColor: SIGNAL.color.ink,
  },
  stravaCtaText: { color: '#fff', fontFamily: SIGNAL.font.bodySemi, fontSize: 12 },
  stravaClose: { padding: 2 },

  // ── Section header + body ───────────────────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingTop: 22, paddingBottom: 8,
  },
  sectionTitle: {
    fontFamily: SIGNAL.font.bodySemi, fontSize: 18, color: SIGNAL.color.indigo,
    letterSpacing: -0.36,
  },
  sectionTitleAccent: {
    fontFamily: SIGNAL.font.bodySemi, color: SIGNAL.color.indigo,
  },
  sectionSub: {
    fontFamily: SIGNAL.font.bodyMedium, fontSize: 11.5, color: SIGNAL.color.mute,
  },
  sectionBody: { paddingHorizontal: 14, gap: 8 },

  // ── Pills (timeframe + leaderboard filter) ──────────────────────────────────
  pillRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 14, marginBottom: 10 },
  pill: {
    paddingVertical: 5, paddingHorizontal: 12,
    borderRadius: SIGNAL.radius.chip,
    backgroundColor: SIGNAL.color.white,
    borderWidth: 1, borderColor: SIGNAL.color.line,
  },
  pillActive: { backgroundColor: SIGNAL.color.indigo, borderColor: SIGNAL.color.indigo },
  pillText: { fontFamily: SIGNAL.font.bodySemi, fontSize: 11, color: SIGNAL.color.inkSoft },
  pillTextActive: { color: '#fff' },
  timeframeRow: { paddingHorizontal: 14, paddingTop: 22, paddingBottom: 4 },

  // ── Workout card ────────────────────────────────────────────────────────────
  workoutCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: 14, paddingLeft: 12,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    ...SIGNAL.border.hairline,
  },
  workoutChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 3,
    borderRadius: SIGNAL.radius.chip,
  },
  workoutChipDot: { width: 5, height: 5, borderRadius: 999 },
  workoutChipText: { fontFamily: SIGNAL.font.bodySemi, fontSize: 11 },
  workoutTitle: {
    fontFamily: SIGNAL.font.bodySemi, fontSize: 14, color: SIGNAL.color.ink,
  },
  workoutPace: {
    fontFamily: SIGNAL.font.mono, fontSize: 11, color: SIGNAL.color.indigo, marginTop: 2,
  },
  workoutMeta: { fontFamily: SIGNAL.font.body, fontSize: 11, color: SIGNAL.color.mute, marginTop: 2 },
  chevron: { fontSize: 18, color: SIGNAL.color.mute2 },

  // ── Leaderboard ─────────────────────────────────────────────────────────────
  refreshingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 8,
  },
  refreshingText: { fontFamily: SIGNAL.font.body, fontSize: 12, color: SIGNAL.color.mute },
  leaderRow: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12,
    flexDirection: 'row', alignItems: 'center', gap: 11,
    borderWidth: 1, borderColor: SIGNAL.color.line,
  },
  leaderRowMe: {
    backgroundColor: `${SIGNAL.color.indigo}0D`,
    borderColor: `${SIGNAL.color.indigo}55`,
  },
  leaderRank: {
    fontFamily: SIGNAL.font.bodySemi, fontSize: 13, width: 22,
    color: SIGNAL.color.mute2,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  leaderAvatar: {
    width: 32, height: 32, borderRadius: SIGNAL.radius.chip,
    alignItems: 'center', justifyContent: 'center',
  },
  leaderAvatarText: { color: '#fff', fontFamily: SIGNAL.font.bodyBold, fontSize: 11 },
  leaderInfo: { flex: 1, minWidth: 0 },
  leaderName: {
    fontFamily: SIGNAL.font.bodySemi, fontSize: 13.5, color: SIGNAL.color.ink,
  },
  leaderSub: { fontFamily: SIGNAL.font.body, fontSize: 10.5, color: SIGNAL.color.mute, marginTop: 1 },
  leaderMilesWrap: { flexDirection: 'row', alignItems: 'baseline' },
  leaderMiles: {
    fontFamily: SIGNAL.font.bodySemi, fontSize: 15,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  leaderMilesUnit: { fontFamily: SIGNAL.font.body, fontSize: 10, color: SIGNAL.color.mute },

  // ── Empty state ─────────────────────────────────────────────────────────────
  emptyCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    paddingVertical: 22, paddingHorizontal: 18,
    alignItems: 'center',
    ...SIGNAL.border.hairline,
  },
  emptyText: {
    fontFamily: SIGNAL.font.body, fontSize: 12.5, color: SIGNAL.color.mute,
    textAlign: 'center', lineHeight: 18,
  },

  // ── Run card ────────────────────────────────────────────────────────────────
  runCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    paddingVertical: 13, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    ...SIGNAL.border.hairline,
  },
  runLeft: { minWidth: 54 },
  runMilesRow: { flexDirection: 'row', alignItems: 'baseline' },
  runMilesNum: {
    fontFamily: SIGNAL.font.bodySemi, fontSize: 18, color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  runMilesUnit: {
    fontFamily: SIGNAL.font.body, fontSize: 10, color: SIGNAL.color.mute, marginLeft: 2,
  },
  runDate: { fontFamily: SIGNAL.font.body, fontSize: 10.5, color: SIGNAL.color.mute, marginTop: 1 },
  runMiddle: { flex: 1 },
  runDuration: { fontFamily: SIGNAL.font.mono, fontSize: 12, color: SIGNAL.color.inkSoft },
  runRight: { alignItems: 'flex-end' },
  runEffortEyebrow: {
    fontFamily: SIGNAL.font.bodyMedium, fontSize: 9, letterSpacing: 1.17,
    textTransform: 'uppercase', color: SIGNAL.color.mute,
  },
  runEffortValue: {
    fontFamily: SIGNAL.font.bodySemi, fontSize: 15,
    letterSpacing: SIGNAL.letter.bodyTight, marginTop: 1,
  },
  rateEffortBtn: {
    paddingVertical: 7, paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: SIGNAL.color.paper,
    borderWidth: 1, borderColor: SIGNAL.color.line,
  },
  rateEffortText: { fontFamily: SIGNAL.font.bodySemi, fontSize: 11, color: SIGNAL.color.indigo },

  // ── Sub-screen overlay ──────────────────────────────────────────────────────
  subScreen: {
    position: 'absolute', top: 0, left: 0, right: 0,
    bottom: Platform.OS === 'ios' ? 82 : 56,
    backgroundColor: SIGNAL.color.paper2,
    zIndex: 10,
  },

  // ── Bottom nav ──────────────────────────────────────────────────────────────
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderTopWidth: 1, borderTopColor: SIGNAL.color.line,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 22 : 10,
    zIndex: 20,
  },
  bottomNavBtn: { flex: 1, alignItems: 'center', gap: 4 },
  bottomNavLabel: {
    fontFamily: SIGNAL.font.bodySemi, fontSize: 11, color: SIGNAL.color.mute2,
  },
  bottomNavLabelActive: { color: SIGNAL.color.indigo },

  // ── Badge (feed unread) ─────────────────────────────────────────────────────
  badge: {
    position: 'absolute', top: -4, right: -8,
    minWidth: 16, height: 16, paddingHorizontal: 4,
    borderRadius: SIGNAL.radius.chip,
    backgroundColor: SIGNAL.color.coral,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  badgeText: { color: '#fff', fontFamily: SIGNAL.font.bodyBold, fontSize: 9 },

  // ── Coach message modal ────────────────────────────────────────────────────
  msgModalOverlay: {
    flex: 1, backgroundColor: 'rgba(11,13,18,0.55)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  msgModal: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.sheet,
    overflow: 'hidden', width: '100%',
    ...SIGNAL.border.hairline,
  },
  msgModalHeader: {
    backgroundColor: SIGNAL.color.indigo,
    paddingHorizontal: 20, paddingVertical: 16,
  },
  msgModalEyebrow: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 11, letterSpacing: 1.43, textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.85)',
  },
  msgModalDate: {
    fontFamily: SIGNAL.font.body, fontSize: 12,
    color: 'rgba(255,255,255,0.7)', marginTop: 4,
  },
  msgModalText: {
    fontFamily: SIGNAL.font.body, fontSize: 16, lineHeight: 24,
    color: SIGNAL.color.ink, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 6,
  },
  msgModalFrom: {
    fontFamily: SIGNAL.font.body, fontSize: 12, color: SIGNAL.color.mute,
    fontStyle: 'italic', paddingHorizontal: 20, paddingBottom: 18,
  },
  msgModalBtn: {
    backgroundColor: SIGNAL.color.indigo,
    marginHorizontal: 16, marginBottom: 16,
    paddingVertical: 14, borderRadius: SIGNAL.radius.button,
    alignItems: 'center',
  },
  msgModalBtnText: { color: '#fff', fontFamily: SIGNAL.font.bodySemi, fontSize: 14 },

  // ── Log run modal ──────────────────────────────────────────────────────────
  logModal: { flex: 1, backgroundColor: SIGNAL.color.paper2 },
  logModalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, paddingTop: 60,
    backgroundColor: SIGNAL.color.white,
    borderBottomWidth: 1, borderBottomColor: SIGNAL.color.line,
  },
  logModalTitle: {
    fontFamily: SIGNAL.font.display, fontSize: 20, color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.titleTight,
  },
  logModalCancel: { color: SIGNAL.color.coral, fontFamily: SIGNAL.font.bodyMedium, fontSize: 14, width: 60 },
  logModalScroll: { padding: 18 },
  logLabel: {
    fontFamily: SIGNAL.font.bodySemi, fontSize: 12, color: SIGNAL.color.inkSoft,
    marginTop: 4, marginBottom: 8,
  },
  logInput: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.control,
    paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: SIGNAL.font.body, fontSize: 15, color: SIGNAL.color.ink,
    marginBottom: 16,
    borderWidth: 1, borderColor: SIGNAL.color.line,
  },
  effortRow: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  effortBtn: {
    width: 44, height: 44, borderRadius: SIGNAL.radius.chip,
    alignItems: 'center', justifyContent: 'center',
  },
  effortBtnText: { fontFamily: SIGNAL.font.bodySemi, fontSize: 14 },
  saveBtn: {
    borderRadius: SIGNAL.radius.button,
    paddingVertical: 16, alignItems: 'center',
    marginTop: 8, marginBottom: 40,
  },
  saveBtnText: { color: '#fff', fontFamily: SIGNAL.font.bodySemi, fontSize: 16 },

  // ── Effort picker modal ────────────────────────────────────────────────────
  effortOverlay: {
    flex: 1, backgroundColor: 'rgba(11,13,18,0.45)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  effortPickerCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.sheet,
    padding: 22, width: '100%', alignItems: 'center',
    ...SIGNAL.border.hairline,
  },
  effortPickerTitle: {
    fontFamily: SIGNAL.font.display, fontSize: 20, color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.titleTight, marginBottom: 4,
  },
  effortPickerSub: {
    fontFamily: SIGNAL.font.body, fontSize: 12, color: SIGNAL.color.mute, marginBottom: 16,
  },
  effortPickerRow: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 8, justifyContent: 'center', marginBottom: 12,
  },
  effortPickerBtn: {
    width: 40, height: 40, borderRadius: SIGNAL.radius.chip,
    alignItems: 'center', justifyContent: 'center',
  },
  effortPickerBtnText: { fontFamily: SIGNAL.font.bodyBold, fontSize: 15 },
  effortPickerHint: { fontFamily: SIGNAL.font.body, fontSize: 11, color: SIGNAL.color.mute },
});
