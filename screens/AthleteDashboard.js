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
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert,
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
import {
  DEFAULT_ZONE_BOUNDARIES, ZONE_META,
  calc8020,
  calcMaxHR,
  calcZoneBreakdownFromRuns, calcZoneBreakdownFromStream,
  formatMinutes
} from '../zoneConfig';
import AthleteProfile from './AthleteProfile';
import CalendarScreen from './CalendarScreen';
import DatePickerField from './DatePickerField';
import RunDetailModal from './RunDetailModal';
import { getActiveSeason } from './SeasonPlanner';
import StravaConnect from './StravaConnect';
import TeamFeed from './TeamFeed';
import TeammateProfile from './TeammateProfile';
import TimeframePicker, { TIMEFRAMES, getDateRange } from './TimeframePicker';
import WellnessCheckIn from './WellnessCheckIn';
import WorkoutDetailModal from './WorkoutDetailModal';

const EFFORT_LABELS = ['', 'Very Easy', 'Easy', 'Moderate', 'Moderate', 'Medium',
  'Medium Hard', 'Hard', 'Very Hard', 'Max Effort', 'All Out'];

// ── Weekly mileage target (10% rule) ─────────────────────────────────────────
function calcWeeklyTarget(recentRuns) {
  if (!recentRuns || recentRuns.length === 0) return 20;
  const now = new Date();
  const oneWeekAgo = new Date(now - 7 * 86400000);
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

// ── Get start of current week (Monday) ───────────────────────────────────────
function getWeekStart() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon...
  const diff = (day === 0 ? -6 : 1 - day); // days back to Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export default function AthleteDashboard({ userData }) {
  const [school, setSchool] = useState(null);
  const [recentRuns, setRecentRuns] = useState([]);
  const [upcomingWorkouts, setUpcomingWorkouts] = useState([]);
  const [teamAthletes, setTeamAthletes] = useState([]);
  const [weeklyMiles, setWeeklyMiles] = useState(0);
  const [weeklyTarget, setWeeklyTarget] = useState(20);
  const [totalMiles, setTotalMiles] = useState(0);
  const [teamMiles, setTeamMiles] = useState({}); // athleteId → miles for selected timeframe
  const [pendingParents, setPendingParents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [selectedTimeframe, setSelectedTimeframe] = useState(TIMEFRAMES[0]);
  const [customStart, setCustomStart] = useState(null);
  const [customEnd, setCustomEnd] = useState(null);
  const [selectedRun, setSelectedRun] = useState(null);
  const [runDetailVisible, setRunDetailVisible] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [workoutDetailVisible, setWorkoutDetailVisible] = useState(false);
  const [wellnessVisible, setWellnessVisible] = useState(false);
  const [stravaVisible, setStravaVisible] = useState(false);
  const [selectedTeammate, setSelectedTeammate] = useState(null);
  const [dailyMessage, setDailyMessage] = useState(null);
  const [profileVisible, setProfileVisible] = useState(false);
  const [feedVisible, setFeedVisible] = useState(false);
  const [messageModalVisible, setMessageModalVisible] = useState(false);
  const [pendingWellness, setPendingWellness] = useState(null);
  const [logModalVisible, setLogModalVisible] = useState(false);
  const [athleteAge,      setAthleteAge]      = useState(16);
  const [zoneSettings,    setZoneSettings]    = useState(null); // coach-configured boundaries

  // Log run form
  const [miles, setMiles] = useState('');
  const [duration, setDuration] = useState('');
  const [heartRate, setHeartRate] = useState('');
  const [effort, setEffort] = useState(5);
  const [notes, setNotes] = useState('');
  const [runDate, setRunDate] = useState(new Date());
  const [savingRun, setSavingRun] = useState(false);
  const [editingRunId, setEditingRunId] = useState(null);

  useEffect(() => { loadDashboard(); }, [selectedTimeframe]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const user = auth.currentUser;

      // Calculate athlete age for HR zones
      if (userData.birthdate) {
        const birth = new Date(userData.birthdate);
        const age = Math.floor((new Date() - birth) / (365.25 * 86400000));
        setAthleteAge(age);
      }

      // Load coach-configured zone settings for this athlete
      try {
        const zoneDoc = await getDoc(doc(db, 'zoneSettings', user.uid));
        if (zoneDoc.exists()) setZoneSettings(zoneDoc.data());
      } catch { /* use defaults */ }

      let currentSchool = school;
      if (userData.schoolId) {
        const schoolDoc = await getDoc(doc(db, 'schools', userData.schoolId));
        if (schoolDoc.exists()) {
          currentSchool = schoolDoc.data();
          setSchool(currentSchool);
        }
      }

      // Load runs for selected timeframe using calendar-aware date ranges
      const activeSeason = getActiveSeason(currentSchool);
      const { start: startDate, end: endDate } = getDateRange(selectedTimeframe, activeSeason, customStart, customEnd);

      // Fetch from Firestore with start filter only, then apply end filter in memory
      // This correctly handles last_month and custom ranges that have a hard end date
      const runsQuery = startDate
        ? query(collection(db, 'runs'), where('userId', '==', user.uid), where('date', '>=', startDate), orderBy('date', 'desc'), limit(200))
        : query(collection(db, 'runs'), where('userId', '==', user.uid), orderBy('date', 'desc'), limit(200));

      const runsSnap = await getDocs(runsQuery);
      const allFetched = runsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const runs = allFetched.filter(r => {
        const d = r.date?.toDate?.();
        if (!d) return false;
        if (startDate && d < startDate) return false;
        if (endDate && d > endDate) return false;
        return true;
      });
      setRecentRuns(runs);

      // Total miles = sum of all runs in the selected timeframe
      const tMiles = runs.reduce((s, r) => s + (r.miles || 0), 0);
      setTotalMiles(Math.round(tMiles * 10) / 10);

      // Weekly miles — always use calendar week (Monday to now) regardless of timeframe
      const weekStart = getWeekStart();
      const wMiles = runs.filter(r => {
        const d = r.date?.toDate?.();
        return d && d >= weekStart;
      }).reduce((s, r) => s + (r.miles || 0), 0);
      setWeeklyMiles(Math.round(wMiles * 10) / 10);

      // Calculate weekly target from the past 4 weeks (not just last 7 days)
      // This gives a more stable baseline after a big sync
      const fourWeeksAgo = new Date(Date.now() - 28 * 86400000);
      const recentForTarget = await getDocs(query(
        collection(db, 'runs'),
        where('userId', '==', user.uid),
        where('date', '>=', fourWeeksAgo),
        orderBy('date', 'desc')
      ));
      const targetRuns = recentForTarget.docs.map(d => d.data());
      setWeeklyTarget(calcWeeklyTarget(targetRuns));

      // Load pending parent requests
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const freshData = userDoc.data();
        if (freshData.pendingParentIds?.length > 0) {
          const parentData = [];
          for (const pid of freshData.pendingParentIds) {
            const pDoc = await getDoc(doc(db, 'users', pid));
            if (pDoc.exists()) parentData.push({ id: pDoc.id, ...pDoc.data() });
          }
          setPendingParents(parentData);
        }
      }

      // Load today's coach message — show as pop-up once per day
      if (userData.schoolId) {
        try {
          const today = new Date().toISOString().split('T')[0];
          const msgDoc = await getDoc(doc(db, 'dailyMessages', `${userData.schoolId}_${today}`));
          if (msgDoc.exists()) {
            const msgData = msgDoc.data();
            setDailyMessage(msgData);
            // Check if already shown today using Firestore user doc
            const userDoc2 = await getDoc(doc(db, 'users', user.uid));
            const lastSeen = userDoc2.data()?.lastSeenMessageDate;
            if (lastSeen !== today) {
              setMessageModalVisible(true);
              await updateDoc(doc(db, 'users', user.uid), { lastSeenMessageDate: today });
            }
          } else {
            setDailyMessage(null);
          }
        } catch (e) { console.log('Daily message load:', e); }
      }
      if (userData.status === 'approved' && userData.schoolId) {
        try {
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const wSnap = await getDocs(query(
            collection(db, 'events'),
            where('schoolId', '==', userData.schoolId),
            where('category', '==', 'Training'),
            where('date', '>=', todayStart),
            orderBy('date', 'asc'),
            limit(3)
          ));
          setUpcomingWorkouts(wSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) { console.log('Upcoming workouts:', e); }

        // Load teammates and their miles for the selected timeframe
        try {
          const athleteSnap = await getDocs(query(
            collection(db, 'users'),
            where('schoolId', '==', userData.schoolId),
            where('role', '==', 'athlete'),
            where('status', '==', 'approved')
          ));
          const athletes = athleteSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          setTeamAthletes(athletes);

          // Load each teammate's miles for the selected timeframe
          // Filter in memory to avoid requiring Firestore composite index
          const milesMap = {};
          milesMap[user.uid] = tMiles;
          await Promise.all(athletes.map(async (athlete) => {
            if (athlete.id === user.uid) return;
            try {
              const snap = await getDocs(query(
                collection(db, 'runs'),
                where('userId', '==', athlete.id),
                orderBy('date', 'desc')
              ));
              const filtered = snap.docs.filter(d => {
                if (!startDate && !endDate) return true;
                const runDate = d.data().date?.toDate?.();
                if (!runDate) return false;
                if (startDate && runDate < startDate) return false;
                if (endDate && runDate > endDate) return false;
                return true;
              });
              milesMap[athlete.id] = Math.round(
                filtered.reduce((s, d) => s + (d.data().miles || 0), 0) * 10
              ) / 10;
            } catch (e) {
              console.log('Teammate miles error:', e);
              milesMap[athlete.id] = 0;
            }
          }));
          setTeamMiles(milesMap);
        } catch (e) { console.log('Team athletes:', e); }
      }

    } catch (error) { console.error('Dashboard load error:', error); }
    setLoading(false);
  };

  // ── Sub-screen early returns (after loadDashboard so it's in scope) ────────
  if (calendarVisible) {
    return <CalendarScreen userData={userData} school={school} onClose={() => setCalendarVisible(false)} />;
  }

  if (stravaVisible) {
    return (
      <StravaConnect
        userData={userData}
        school={school}
        onClose={() => setStravaVisible(false)}
        onSynced={() => { setStravaVisible(false); loadDashboard(); }}
      />
    );
  }

  if (feedVisible) {
    return (
      <TeamFeed
        userData={userData}
        school={school}
        onClose={() => setFeedVisible(false)}
      />
    );
  }

  if (selectedTeammate) {
    return (
      <TeammateProfile
        athlete={selectedTeammate}
        school={school}
        onBack={() => setSelectedTeammate(null)}
      />
    );
  }

  if (profileVisible) {
    return (
      <AthleteProfile
        userData={userData}
        school={school}
        onClose={() => setProfileVisible(false)}
        onUpdated={(updates) => {
          // Update will reflect on next login — no live prop update needed
          setProfileVisible(false);
        }}
      />
    );
  }

  // Tap "Log a Run" → show wellness check-in first
  const handleLogRunTap = () => {
    setWellnessVisible(true);
  };

  const handleWellnessComplete = (data) => {
    setPendingWellness(data);
    setWellnessVisible(false);
    setLogModalVisible(true);
  };

  const handleWellnessSkip = () => {
    setPendingWellness(null);
    setWellnessVisible(false);
    setLogModalVisible(true);
  };

  const handleLogRun = async () => {
    if (!miles || isNaN(parseFloat(miles))) {
      Alert.alert('Missing info', 'Please enter the miles for this run.');
      return;
    }
    setSavingRun(true);
    try {
      const user = auth.currentUser;
      const milesFloat = parseFloat(miles);

      if (editingRunId) {
        // ── Edit existing run ──────────────────────────────────────────────
        const { doc: fsDoc, updateDoc: fsUpdate, getDoc: fsGet } = await import('firebase/firestore');
        const oldSnap = await fsGet(fsDoc(db, 'runs', editingRunId));
        const oldMiles = oldSnap.data()?.miles || 0;
        await fsUpdate(fsDoc(db, 'runs', editingRunId), {
          miles: milesFloat,
          duration: duration || null,
          heartRate: heartRate ? parseInt(heartRate) : null,
          effort,
          notes: notes || null,
          date: runDate,
        });
        // Adjust totalMiles
        const newTotal = Math.max(0, Math.round(((totalMiles || 0) - oldMiles + milesFloat) * 10) / 10);
        await updateDoc(doc(db, 'users', user.uid), { totalMiles: newTotal });
        Alert.alert('Updated! ✅', 'Your run has been updated.');
        setEditingRunId(null);
      } else {
        // ── Save new run ───────────────────────────────────────────────────
        if (pendingWellness) {
          await setDoc(doc(collection(db, 'checkins')), {
            userId: user.uid,
            schoolId: userData.schoolId || null,
            date: runDate,
            sleepQuality: pendingWellness.sleep,
            legFatigue: pendingWellness.legs,
            mood: pendingWellness.mood,
          });
        }
        await addDoc(collection(db, 'runs'), {
          userId: user.uid,
          schoolId: userData.schoolId || null,
          miles: milesFloat,
          duration: duration || null,
          heartRate: heartRate ? parseInt(heartRate) : null,
          effort,
          notes: notes || null,
          source: 'manual',
          date: runDate,
        });
        const newTotal = Math.round(((totalMiles || 0) + milesFloat) * 10) / 10;
        await updateDoc(doc(db, 'users', user.uid), { totalMiles: newTotal });
        Alert.alert('Run logged! 🏃', `${miles} miles saved. Great work!`);
      }

      setLogModalVisible(false);
      setPendingWellness(null);
      setMiles(''); setDuration(''); setHeartRate(''); setEffort(5); setNotes(''); setRunDate(new Date());
      loadDashboard();
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Could not save run. Please try again.');
    }
    setSavingRun(false);
  };

  const handleDeleteRun = (run) => {
    Alert.alert(
      'Delete run?',
      `Delete your ${run.miles} mile run on ${run.date?.toDate?.()?.toLocaleDateString()}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            const { deleteDoc, doc: firestoreDoc } = await import('firebase/firestore');
            await deleteDoc(firestoreDoc(db, 'runs', run.id));
            // Subtract miles from total
            const newTotal = Math.max(0, Math.round(((totalMiles || 0) - (run.miles || 0)) * 10) / 10);
            await updateDoc(doc(db, 'users', auth.currentUser.uid), { totalMiles: newTotal });
            Alert.alert('Deleted', 'Run removed.');
            setRunDetailVisible(false);
            setSelectedRun(null);
            loadDashboard();
          } catch { Alert.alert('Error', 'Could not delete run. Please try again.'); }
        }},
      ]
    );
  };

  const handleEditRun = (run) => {
    // Pre-fill the log form with existing run data
    setMiles(String(run.miles || ''));
    setDuration(run.duration || '');
    setHeartRate(run.heartRate ? String(run.heartRate) : '');
    setEffort(run.effort || 5);
    setNotes(run.notes || '');
    setRunDate(run.date?.toDate?.() || new Date());
    setEditingRunId(run.id);
    setRunDetailVisible(false);
    setSelectedRun(null);
    setLogModalVisible(true);
  };

  const handleApproveParent = async (parent, approve) => {
    try {
      const user = auth.currentUser;
      const userSnap = await getDoc(doc(db, 'users', user.uid));
      const currentData = userSnap.data();
      const newPending = (currentData.pendingParentIds || []).filter(id => id !== parent.id);
      if (approve) {
        await updateDoc(doc(db, 'users', user.uid), {
          pendingParentIds: newPending,
          parentIds: [...(currentData.parentIds || []), parent.id],
        });
        await updateDoc(doc(db, 'users', parent.id), { status: 'approved' });
        Alert.alert('Approved!', `${parent.firstName} can now follow your training.`);
      } else {
        await updateDoc(doc(db, 'users', user.uid), { pendingParentIds: newPending });
        Alert.alert('Declined', 'Parent request has been declined.');
      }
      loadDashboard();
    } catch (error) { Alert.alert('Error', 'Could not update parent request.'); }
  };

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut(auth) },
    ]);
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color="#2e7d32" /></View>;

  const primaryColor = school?.primaryColor || '#2e7d32';
  const isApproved = userData.status === 'approved';
  const targetPct = weeklyTarget > 0 ? Math.min(weeklyMiles / weeklyTarget, 1) : 0;
  const targetColor = targetPct >= 1 ? primaryColor : targetPct >= 0.7 ? '#f59e0b' : '#ef4444';

  // Leaderboard — sort teammates by miles in selected timeframe
  const sortedTeam = [...teamAthletes].sort((a, b) => (teamMiles[b.id] || 0) - (teamMiles[a.id] || 0));
  const myRank = sortedTeam.findIndex(a => a.id === auth.currentUser?.uid) + 1;

  return (
    <View style={styles.container}>

      {/* ── Header — greeting + weekly miles + progress ── */}
      <View style={[styles.header, { backgroundColor: primaryColor }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>Hey, {userData.firstName}! 👋</Text>
            <Text style={styles.schoolName}>{school?.name || 'XCTracker'}</Text>
          </View>
          <TouchableOpacity onPress={() => setProfileVisible(true)} style={styles.profileBtn}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarText}>
                {userData.firstName?.[0]}{userData.lastName?.[0]}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {!isApproved && (
          <View style={styles.pendingBanner}>
            <Text style={styles.pendingText}>Awaiting coach approval — you can log runs in the meantime!</Text>
          </View>
        )}

        {/* Weekly miles lives in the header */}
        <View style={styles.headerMilesRow}>
          <View>
            <Text style={styles.headerMilesLabel}>This week</Text>
            <View style={styles.headerMilesNumRow}>
              <Text style={styles.headerMilesNum}>{weeklyMiles}</Text>
              <Text style={styles.headerMilesOf}> / {weeklyTarget} mi</Text>
            </View>
          </View>
          <View style={styles.headerProgressCol}>
            <View style={styles.headerProgressBg}>
              <View style={[styles.headerProgressFill, { width: `${targetPct * 100}%`, backgroundColor: targetPct >= 1 ? '#fff' : 'rgba(255,255,255,0.6)' }]} />
            </View>
            <Text style={styles.headerProgressHint}>
              {targetPct >= 1 ? '✅ Target hit!' : `${Math.round((weeklyTarget - weeklyMiles) * 10) / 10} mi to go`}
            </Text>
          </View>
        </View>
      </View>

      {/* Daily message pop-up modal */}
      <Modal visible={messageModalVisible} transparent animationType="fade">
        <View style={styles.msgModalOverlay}>
          <View style={styles.msgModal}>
            <View style={[styles.msgModalHeader, { backgroundColor: primaryColor }]}>
              <Text style={styles.msgModalTitle}>📣 Message from Coach</Text>
              <Text style={styles.msgModalDate}>Today</Text>
            </View>
            <Text style={styles.msgModalText}>{dailyMessage?.message}</Text>
            <Text style={styles.msgModalFrom}>— {dailyMessage?.sentByName}</Text>
            <TouchableOpacity
              style={[styles.msgModalBtn, { backgroundColor: primaryColor }]}
              onPress={() => setMessageModalVisible(false)}
            >
              <Text style={styles.msgModalBtnText}>Got it 👍</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 90 }}
      >

        {/* Parent approval requests */}
        {pendingParents.length > 0 && pendingParents.map(parent => (
          <View key={parent.id} style={styles.parentCard}>
            <Text style={styles.parentTitle}>Parent follow request</Text>
            <Text style={styles.parentName}>{parent.firstName} {parent.lastName} wants to follow your training.</Text>
            <View style={styles.parentBtns}>
              <TouchableOpacity style={[styles.approveBtn, { backgroundColor: primaryColor }]} onPress={() => handleApproveParent(parent, true)}>
                <Text style={styles.approveBtnText}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.denyBtn} onPress={() => handleApproveParent(parent, false)}>
                <Text style={styles.denyBtnText}>Decline</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* ── Timeframe picker — controls everything below ── */}
        <View style={styles.timeframeRow}>
          <TimeframePicker
            selected={selectedTimeframe}
            onSelect={setSelectedTimeframe}
            customStart={customStart}
            customEnd={customEnd}
            onCustomChange={(s, e) => { setCustomStart(s); setCustomEnd(e); }}
            activeSeason={getActiveSeason(school)}
            primaryColor={primaryColor}
          />
        </View>

        {/* ── Total miles for selected period ── */}
        <View style={[styles.periodMilesCard, { borderColor: `${primaryColor}30` }]}>
          <Text style={[styles.periodMilesNum, { color: primaryColor }]}>{totalMiles}</Text>
          <Text style={styles.periodMilesLabel}>
            miles — {selectedTimeframe.label?.toLowerCase() || 'selected period'}
          </Text>
        </View>

        {/* ── Training zone breakdown for selected period ── */}
        {(() => {
          const boundaries = zoneSettings?.boundaries || DEFAULT_ZONE_BOUNDARIES;
          const customMaxHR = zoneSettings?.customMaxHR || null;
          const maxHR = calcMaxHR(athleteAge, customMaxHR);

          // Priority 1: recalculate from raw HR stream using CURRENT boundaries
          // Priority 2: use stored pre-bucketed zoneSeconds (from sync time — may use old boundaries)
          // Priority 3: fall back to avg HR + duration estimate
          let breakdown = null;
          let hasStreamData = false;

          const runsWithRawStream = recentRuns.filter(r => r.rawHRStream?.length > 0);
          const runsWithStoredZones = recentRuns.filter(r => r.hasStreamData && r.zoneSeconds);

          if (runsWithRawStream.length > 0) {
            // Best path — recalculate fresh from raw data using current team boundaries
            const combined = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
            runsWithRawStream.forEach(r => {
              const runBreakdown = calcZoneBreakdownFromStream(r.rawHRStream, maxHR, boundaries);
              if (runBreakdown) {
                runBreakdown.forEach(z => {
                  combined[`z${z.zone}`] = (combined[`z${z.zone}`] || 0) + z.seconds;
                });
              }
            });
            const totalSecs = Object.values(combined).reduce((s, v) => s + v, 0);
            if (totalSecs > 0) {
              breakdown = Object.entries(combined)
                .filter(([, s]) => s > 0)
                .map(([key, secs]) => {
                  const zone = parseInt(key.replace('z', ''));
                  return { zone, seconds: secs, minutes: Math.round(secs / 60), pct: Math.round((secs / totalSecs) * 100), ...ZONE_META[zone] };
                })
                .sort((a, b) => a.zone - b.zone);
              hasStreamData = true;
            }
          } else if (runsWithStoredZones.length > 0) {
            // Fallback — use stored zone seconds (may reflect old boundaries)
            const combined = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
            runsWithStoredZones.forEach(r => {
              Object.entries(r.zoneSeconds).forEach(([k, v]) => {
                if (combined[k] !== undefined) combined[k] += v;
              });
            });
            const totalSecs = Object.values(combined).reduce((s, v) => s + v, 0);
            if (totalSecs > 0) {
              breakdown = Object.entries(combined)
                .filter(([, s]) => s > 0)
                .map(([key, secs]) => {
                  const zone = parseInt(key.replace('z', ''));
                  return { zone, seconds: secs, minutes: Math.round(secs / 60), pct: Math.round((secs / totalSecs) * 100), ...ZONE_META[zone] };
                })
                .sort((a, b) => a.zone - b.zone);
              hasStreamData = true;
            }
          }

          // Final fallback — avg HR + duration
          if (!breakdown) {
            breakdown = calcZoneBreakdownFromRuns(recentRuns, athleteAge, customMaxHR, boundaries);
          }

          if (!breakdown) return null;

          const analysis = calc8020(breakdown);
          const totalMins = breakdown.reduce((s, z) => s + z.minutes, 0);
          const hasStreamData = runsWithStream.length > 0;

          return (
            <View style={styles.zoneSection}>
              <View style={styles.zoneSectionHeader}>
                <Text style={styles.zoneSectionTitle}>
                  Training zones — {selectedTimeframe.label?.toLowerCase()}
                </Text>
                {hasStreamData && (
                  <View style={styles.streamBadge}>
                    <Text style={styles.streamBadgeText}>Precise ✓</Text>
                  </View>
                )}
              </View>
              <View style={styles.zoneCard}>
                {/* Stacked bar */}
                <View style={styles.zoneStackedBar}>
                  {breakdown.map(z => (
                    <View key={z.zone} style={[styles.zoneStackedSegment, { flex: z.minutes, backgroundColor: ZONE_META[z.zone].color }]} />
                  ))}
                </View>
                {/* Zone rows */}
                {breakdown.map(z => (
                  <View key={z.zone} style={styles.zoneRow}>
                    <View style={[styles.zoneDot, { backgroundColor: ZONE_META[z.zone].color }]} />
                    <Text style={styles.zoneName}>Z{z.zone} {ZONE_META[z.zone].name}</Text>
                    <View style={styles.zoneBarBg}>
                      <View style={[styles.zoneBarFill, { width: `${z.pct}%`, backgroundColor: ZONE_META[z.zone].color }]} />
                    </View>
                    <Text style={styles.zoneTime}>{formatMinutes(z.minutes)}</Text>
                  </View>
                ))}
                {/* 80/20 analysis */}
                {analysis && (
                  <View style={[styles.analysis8020, {
                    backgroundColor: analysis.status === 'great' ? '#e8f5e9' : analysis.status === 'good' ? '#fff8e1' : '#fce4ec'
                  }]}>
                    <Text style={[styles.analysis8020Text, {
                      color: analysis.status === 'great' ? '#2e7d32' : analysis.status === 'good' ? '#f57f17' : '#c62828'
                    }]}>
                      {analysis.message}
                    </Text>
                  </View>
                )}
                <Text style={styles.zoneTotalTime}>
                  {formatMinutes(totalMins)} total · {hasStreamData ? 'second-by-second HR data' : 'estimated from avg HR'}
                </Text>
              </View>
            </View>
          );
        })()}

        {/* Upcoming workouts */}
        {isApproved && upcomingWorkouts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upcoming workouts</Text>
            {upcomingWorkouts.map(workout => (
              <TouchableOpacity key={workout.id} style={styles.workoutCard}
                onPress={() => { setSelectedWorkout(workout); setWorkoutDetailVisible(true); }}>
                <View style={[styles.workoutBadge, { backgroundColor: primaryColor }]}>
                  <Text style={styles.workoutBadgeText}>{workout.type}</Text>
                </View>
                <View style={styles.workoutInfo}>
                  <Text style={styles.workoutTitle}>{workout.title}</Text>
                  {workout.description && <Text style={styles.workoutDesc} numberOfLines={1}>{workout.description}</Text>}
                  <Text style={styles.workoutDate}>
                    {workout.date?.toDate?.()?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Team leaderboard — based on selected timeframe */}
        {isApproved && sortedTeam.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Team leaderboard — {selectedTimeframe.label?.toLowerCase() || 'selected period'}
            </Text>
            {sortedTeam.slice(0, 5).map((athlete, index) => {
              const isMe = athlete.id === auth.currentUser?.uid;
              const miles = teamMiles[athlete.id] || 0;
              return (
                <TouchableOpacity
                  key={athlete.id}
                  style={[styles.leaderRow, isMe && { backgroundColor: `${primaryColor}15`, borderColor: primaryColor, borderWidth: 1.5 }]}
                  onPress={() => !isMe && setSelectedTeammate(athlete)}
                  activeOpacity={isMe ? 1 : 0.7}
                >
                  <Text style={[styles.leaderRank, isMe && { color: primaryColor }]}>#{index + 1}</Text>
                  <View style={[styles.leaderAvatar, { backgroundColor: isMe ? primaryColor : '#ddd' }]}>
                    <Text style={[styles.leaderAvatarText, { color: isMe ? '#fff' : '#666' }]}>
                      {athlete.firstName?.[0]}{athlete.lastName?.[0]}
                    </Text>
                  </View>
                  <View style={styles.leaderInfo}>
                    <Text style={[styles.leaderName, isMe && { color: primaryColor, fontWeight: '700' }]}>
                      {isMe ? 'You' : `${athlete.firstName} ${athlete.lastName}`}
                    </Text>
                    {!isMe && <Text style={styles.leaderTap}>Tap to view profile</Text>}
                  </View>
                  <Text style={[styles.leaderMiles, { color: isMe ? primaryColor : '#333' }]}>
                    {miles} mi
                  </Text>
                </TouchableOpacity>
              );
            })}
            {sortedTeam.length > 5 && myRank > 5 && (
              <View style={[styles.leaderRow, { backgroundColor: `${primaryColor}15`, borderColor: primaryColor, borderWidth: 1.5 }]}>
                <Text style={[styles.leaderRank, { color: primaryColor }]}>#{myRank}</Text>
                <View style={[styles.leaderAvatar, { backgroundColor: primaryColor }]}>
                  <Text style={[styles.leaderAvatarText, { color: '#fff' }]}>
                    {userData.firstName?.[0]}{userData.lastName?.[0]}
                  </Text>
                </View>
                <View style={styles.leaderInfo}>
                  <Text style={[styles.leaderName, { color: primaryColor, fontWeight: '700' }]}>You</Text>
                </View>
                <Text style={[styles.leaderMiles, { color: primaryColor }]}>
                  {totalMiles} mi
                </Text>
              </View>
            )}
          </View>
        )}

        {/* My runs — for selected timeframe */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My runs</Text>
          {recentRuns.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No runs yet — tap "Log a Run" to get started!</Text>
            </View>
          ) : recentRuns.map(run => {
            const boundaries = zoneSettings?.boundaries || DEFAULT_ZONE_BOUNDARIES;
            const maxHR = calcMaxHR(athleteAge, zoneSettings?.customMaxHR);
            return (
              <TouchableOpacity key={run.id} style={styles.runCard}
                onPress={() => { setSelectedRun(run); setRunDetailVisible(true); }}>
                <View style={styles.runLeft}>
                  <Text style={styles.runMiles}>{run.miles} mi</Text>
                  <Text style={styles.runDate}>{run.date?.toDate?.()?.toLocaleDateString() || 'Today'}</Text>
                </View>
                <View style={styles.runMiddle}>
                  {run.duration && <Text style={styles.runDetail}>{run.duration}</Text>}
                </View>
                <View style={styles.runRight}>
                  <Text style={styles.effortLabel}>Effort</Text>
                  <Text style={[styles.effortValue, { color: primaryColor }]}>{run.effort}/10</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

      </ScrollView>

      {/* Wellness check-in modal */}
      <WellnessCheckIn
        visible={wellnessVisible}
        onComplete={handleWellnessComplete}
        onSkip={handleWellnessSkip}
        primaryColor={primaryColor}
      />

      {/* Workout detail modal */}
      <WorkoutDetailModal
        item={selectedWorkout}
        visible={workoutDetailVisible}
        onClose={() => { setWorkoutDetailVisible(false); setSelectedWorkout(null); }}
        primaryColor={primaryColor}
      />

      {/* Run detail modal */}
      <RunDetailModal
        run={selectedRun}
        visible={runDetailVisible}
        primaryColor={primaryColor}
        athleteAge={athleteAge}
        zoneSettings={zoneSettings}
        onClose={() => { setRunDetailVisible(false); setSelectedRun(null); }}
        onDeleted={() => { setRunDetailVisible(false); setSelectedRun(null); loadDashboard(); }}
        onUpdated={() => { setSelectedRun(null); loadDashboard(); }}
      />

      {/* Log Run Modal */}
      <Modal visible={logModalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setLogModalVisible(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{editingRunId ? 'Edit Run' : 'Log a Run'}</Text>
              <View style={{ width: 60 }} />
            </View>
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">

              <DatePickerField label="Run date" value={runDate} onChange={setRunDate} primaryColor={primaryColor} maximumDate={new Date()} />

              <Text style={styles.modalLabel}>Miles *</Text>
              <TextInput style={styles.modalInput} placeholder="e.g. 5.2" placeholderTextColor="#999" value={miles} onChangeText={setMiles} keyboardType="decimal-pad" returnKeyType="next" />

              <Text style={styles.modalLabel}>Duration (optional)</Text>
              <TextInput style={styles.modalInput} placeholder="e.g. 42:30" placeholderTextColor="#999" value={duration} onChangeText={setDuration} returnKeyType="next" />

              <Text style={styles.modalLabel}>Avg heart rate (optional)</Text>
              <TextInput style={styles.modalInput} placeholder="e.g. 155" placeholderTextColor="#999" value={heartRate} onChangeText={setHeartRate} keyboardType="numeric" returnKeyType="next" />

              <Text style={styles.modalLabel}>How did it feel? {effort}/10 — {EFFORT_LABELS[effort]}</Text>
              <View style={styles.effortRow}>
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <TouchableOpacity key={n} style={[styles.effortBtn, effort === n && { backgroundColor: primaryColor }]} onPress={() => setEffort(n)}>
                    <Text style={[styles.effortBtnText, effort === n && { color: '#fff' }]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.modalLabel}>Notes (optional)</Text>
              <TextInput style={[styles.modalInput, { height: 90, textAlignVertical: 'top' }]} placeholder="How did the run go?" placeholderTextColor="#999" value={notes} onChangeText={setNotes} multiline />

              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: primaryColor }]} onPress={handleLogRun} disabled={savingRun}>
                {savingRun ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{editingRunId ? 'Save Changes' : 'Save Run'}</Text>}
              </TouchableOpacity>

            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Bottom navigation bar ── */}
      <View style={[styles.bottomNav, { borderTopColor: `${primaryColor}30` }]}>
        <TouchableOpacity style={styles.bottomNavBtn} onPress={handleLogRunTap}>
          <View style={[styles.bottomNavPlus, { backgroundColor: primaryColor }]}>
            <Text style={styles.bottomNavPlusText}>+</Text>
          </View>
          <Text style={[styles.bottomNavLabel, { color: primaryColor }]}>Log run</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => setStravaVisible(true)}>
          <View style={[styles.bottomNavIcon, { backgroundColor: '#fc4c02' }]}>
            <Text style={styles.bottomNavIconText}>S</Text>
          </View>
          <Text style={styles.bottomNavLabel}>Strava</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => setCalendarVisible(true)}>
          <Text style={styles.bottomNavEmoji}>📅</Text>
          <Text style={styles.bottomNavLabel}>Calendar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => setFeedVisible(true)}>
          <Text style={styles.bottomNavEmoji}>💬</Text>
          <Text style={styles.bottomNavLabel}>Feed</Text>
        </TouchableOpacity>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  greeting: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  schoolName: { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  profileBtn: { padding: 4 },
  profileAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  profileAvatarText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  pendingBanner: { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 10, marginBottom: 12, alignItems: 'center' },
  pendingText: { color: '#fff', fontSize: 13, textAlign: 'center' },
  headerMilesRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  headerMilesLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  headerMilesNumRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  headerMilesNum: { color: '#fff', fontSize: 36, fontWeight: 'bold', lineHeight: 40 },
  headerMilesOf: { color: 'rgba(255,255,255,0.7)', fontSize: 15 },
  headerProgressCol: { flex: 1 },
  headerProgressBg: { height: 8, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 4, overflow: 'hidden', marginBottom: 4 },
  headerProgressFill: { height: '100%', borderRadius: 4 },
  headerProgressHint: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  bottomNav: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, paddingBottom: Platform.OS === 'ios' ? 24 : 8, paddingTop: 10 },
  bottomNavBtn: { flex: 1, alignItems: 'center', gap: 3 },
  bottomNavPlus: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  bottomNavPlusText: { color: '#fff', fontSize: 24, fontWeight: '300', lineHeight: 32 },
  bottomNavIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  bottomNavIconText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  bottomNavEmoji: { fontSize: 24, lineHeight: 32 },
  bottomNavLabel: { fontSize: 11, color: '#888', fontWeight: '500' },
  msgModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  msgModal: { backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', width: '100%' },
  msgModalHeader: { padding: 20, paddingBottom: 16 },
  msgModalTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  msgModalDate: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
  msgModalText: { fontSize: 17, color: '#333', lineHeight: 26, padding: 20, paddingBottom: 8 },
  msgModalFrom: { fontSize: 13, color: '#999', fontStyle: 'italic', paddingHorizontal: 20, paddingBottom: 20 },
  msgModalBtn: { margin: 16, marginTop: 4, borderRadius: 12, padding: 16, alignItems: 'center' },
  msgModalBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  scroll: { flex: 1 },
  targetCard: { margin: 16, marginBottom: 8, backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  targetTop: { marginBottom: 12 },
  targetLabel: { fontSize: 12, color: '#999', marginBottom: 4 },
  targetMiles: {},
  targetMilesBig: { fontSize: 32, fontWeight: 'bold' },
  targetMilesOf: { fontSize: 15, color: '#999' },
  timeframeRow: { marginHorizontal: 16, marginBottom: 4, marginTop: 14 },
  periodMilesCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, gap: 10 },
  periodMilesNum: { fontSize: 28, fontWeight: 'bold' },
  periodMilesLabel: { fontSize: 14, color: '#666', flex: 1 },
  progressBarBg: { height: 10, backgroundColor: '#eee', borderRadius: 5, overflow: 'hidden', marginBottom: 8 },
  progressBarFill: { height: '100%', borderRadius: 5 },
  progressHint: { fontSize: 12, color: '#999' },
  actionRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 8 },
  logBtn: { flex: 1, borderRadius: 12, padding: 16, alignItems: 'center' },
  logBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  stravaBtn: { borderRadius: 12, padding: 16, alignItems: 'center', backgroundColor: '#fc4c02', paddingHorizontal: 14 },
  stravaBtnText: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  calBtn: { borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 2, paddingHorizontal: 14 },
  calBtnText: { fontSize: 14, fontWeight: '600' },
  section: { padding: 16 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#333', marginBottom: 12 },
  workoutCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  workoutBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  workoutBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  workoutInfo: { flex: 1 },
  workoutTitle: { fontSize: 15, fontWeight: '700', color: '#333' },
  workoutDesc: { fontSize: 13, color: '#666', marginTop: 2 },
  workoutDate: { fontSize: 12, color: '#999', marginTop: 4 },
  chevron: { fontSize: 22, color: '#ccc' },
  leaderRow: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  leaderTap: { fontSize: 11, color: '#bbb', marginTop: 1 },
  msgCard: { marginHorizontal: 16, marginBottom: 8, backgroundColor: '#fff', borderRadius: 12, padding: 14, borderLeftWidth: 4, borderLeftColor: '#2e7d32' },
  msgLabel: { fontSize: 12, fontWeight: '700', color: '#2e7d32', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  msgText: { fontSize: 15, color: '#333', lineHeight: 22, marginBottom: 6 },
  msgFrom: { fontSize: 12, color: '#999', fontStyle: 'italic' },
  leaderRank: { fontSize: 14, fontWeight: '700', color: '#999', width: 28 },
  leaderAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  leaderAvatarText: { fontWeight: 'bold', fontSize: 14 },
  leaderInfo: { flex: 1 },
  leaderName: { fontSize: 15, color: '#333' },
  leaderMiles: { fontSize: 16, fontWeight: 'bold' },
  emptyCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, alignItems: 'center' },
  emptyText: { color: '#999', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  runCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
  zoneSection: { marginHorizontal: 16, marginBottom: 8 },
  zoneSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  zoneSectionTitle: { fontSize: 14, fontWeight: '700', color: '#555' },
  streamBadge: { backgroundColor: '#e8f5e9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  streamBadgeText: { fontSize: 11, color: '#2e7d32', fontWeight: '700' },
  analysis8020: { borderRadius: 8, padding: 10, marginTop: 8, marginBottom: 4 },
  analysis8020Text: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  zoneCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14 },
  zoneStackedBar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 12 },
  zoneStackedSegment: { height: '100%' },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  zoneDot: { width: 10, height: 10, borderRadius: 5 },
  zoneName: { fontSize: 12, color: '#555', width: 110 },
  zoneBarBg: { flex: 1, height: 6, backgroundColor: '#f0f0f0', borderRadius: 3, overflow: 'hidden' },
  zoneBarFill: { height: '100%', borderRadius: 3 },
  zoneTime: { fontSize: 12, color: '#666', fontWeight: '600', width: 52, textAlign: 'right' },
  zoneTotalTime: { fontSize: 11, color: '#bbb', textAlign: 'right', marginTop: 4 },
  runLeft: { width: 72 },
  runMiles: { fontSize: 17, fontWeight: 'bold', color: '#333' },
  runDate: { fontSize: 11, color: '#999', marginTop: 2 },
  runMiddle: { flex: 1, paddingHorizontal: 10, gap: 4 },
  runDetail: { fontSize: 13, color: '#666' },
  zoneBadge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 2 },
  zoneBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  runRight: { alignItems: 'center' },
  effortLabel: { fontSize: 11, color: '#999' },
  effortValue: { fontSize: 18, fontWeight: 'bold' },
  parentCard: { margin: 16, marginBottom: 0, backgroundColor: '#fff8e1', borderRadius: 12, padding: 16, borderLeftWidth: 4, borderLeftColor: '#f59e0b' },
  parentTitle: { fontSize: 13, fontWeight: '700', color: '#92400e', marginBottom: 4 },
  parentName: { fontSize: 14, color: '#444', marginBottom: 12 },
  parentBtns: { flexDirection: 'row', gap: 10 },
  approveBtn: { flex: 1, borderRadius: 8, padding: 10, alignItems: 'center' },
  approveBtnText: { color: '#fff', fontWeight: '700' },
  denyBtn: { flex: 1, borderRadius: 8, padding: 10, alignItems: 'center', backgroundColor: '#fee2e2' },
  denyBtnText: { color: '#dc2626', fontWeight: '700' },
  modal: { flex: 1, backgroundColor: '#f5f5f5' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  modalCancel: { color: '#dc2626', fontSize: 16, width: 60 },
  modalScroll: { padding: 20 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: '#444', marginBottom: 8, marginTop: 4 },
  modalInput: { backgroundColor: '#fff', borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 16, borderWidth: 1, borderColor: '#ddd', color: '#333' },
  effortRow: { flexDirection: 'row', gap: 6, marginBottom: 16, flexWrap: 'wrap' },
  effortBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center' },
  effortBtnText: { fontSize: 15, fontWeight: '600', color: '#666' },
  saveBtn: { borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8, marginBottom: 40 },
  saveBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});