import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { auth, db } from '../firebaseConfig';
import { signOut } from 'firebase/auth';
import {
  doc, getDoc, collection, query, where,
  orderBy, limit, getDocs, addDoc, updateDoc, setDoc,
} from 'firebase/firestore';
import TimeframePicker, { TIMEFRAMES, getDateRange } from './TimeframePicker';
import RunDetailModal from './RunDetailModal';
import DatePickerField from './DatePickerField';
import CalendarScreen from './CalendarScreen';
import WorkoutDetailModal from './WorkoutDetailModal';
import WellnessCheckIn from './WellnessCheckIn';
import StravaConnect from './StravaConnect';
import { getActiveSeason, getPhaseForSeason, SPORTS, PhasePill } from './SeasonPlanner';

const EFFORT_LABELS = ['', 'Very Easy', 'Easy', 'Moderate', 'Moderate', 'Medium',
  'Medium Hard', 'Hard', 'Very Hard', 'Max Effort', 'All Out'];

// ── Heart rate zone calculation ───────────────────────────────────────────────
function getHRZone(heartRate, age) {
  if (!heartRate || !age) return null;
  const maxHR = 220 - age;
  const pct = heartRate / maxHR;
  if (pct < 0.60) return { zone: 1, name: 'Recovery', color: '#64b5f6' };
  if (pct < 0.70) return { zone: 2, name: 'Aerobic Base', color: '#4caf50' };
  if (pct < 0.80) return { zone: 3, name: 'Aerobic Power', color: '#ffb300' };
  if (pct < 0.90) return { zone: 4, name: 'Threshold', color: '#ff7043' };
  return { zone: 5, name: 'Anaerobic', color: '#e53935' };
}

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
  const [pendingWellness, setPendingWellness] = useState(null);
  const [logModalVisible, setLogModalVisible] = useState(false);
  const [athleteAge, setAthleteAge] = useState(16);

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
      const { start: startDate } = getDateRange(selectedTimeframe, activeSeason, customStart, customEnd);

      const runsQuery = startDate
        ? query(collection(db, 'runs'), where('userId', '==', user.uid), where('date', '>=', startDate), orderBy('date', 'desc'), limit(100))
        : query(collection(db, 'runs'), where('userId', '==', user.uid), orderBy('date', 'desc'), limit(100));

      const runsSnap = await getDocs(runsQuery);
      const runs = runsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
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

      // Upcoming workouts
      if (userData.status === 'approved' && userData.schoolId) {
        try {
          const wSnap = await getDocs(query(
            collection(db, 'events'),
            where('schoolId', '==', userData.schoolId),
            where('category', '==', 'Training'),
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
                if (!startDate) return true;
                const runDate = d.data().date?.toDate?.();
                return runDate && runDate >= startDate;
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

      {/* Header */}
      <View style={[styles.header, { backgroundColor: primaryColor }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>Hey, {userData.firstName}! 👋</Text>
            <Text style={styles.schoolName}>{school?.name || 'XCTracker'}</Text>
          </View>
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
        {!isApproved && (
          <View style={styles.pendingBanner}>
            <Text style={styles.pendingText}>Awaiting coach approval — you can log runs in the meantime!</Text>
          </View>
        )}
        {isApproved && myRank > 0 && (
          <View style={styles.rankBanner}>
            <Text style={styles.rankBannerText}>
              You're ranked #{myRank} of {sortedTeam.length} on the team this season
            </Text>
          </View>
        )}
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

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

        {/* ── This week's miles — always fixed, never changes ── */}
        <View style={styles.targetCard}>
          <View style={styles.targetTop}>
            <View>
              <Text style={styles.targetLabel}>This week's miles</Text>
              <Text style={styles.targetMiles}>
                <Text style={[styles.targetMilesBig, { color: primaryColor }]}>{weeklyMiles}</Text>
                <Text style={styles.targetMilesOf}> / {weeklyTarget} mi target</Text>
              </Text>
            </View>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${targetPct * 100}%`, backgroundColor: targetColor }]} />
          </View>
          <Text style={styles.progressHint}>
            {targetPct >= 1 ? '✅ Weekly target hit!' : `${Math.round((weeklyTarget - weeklyMiles) * 10) / 10} miles to go`}
          </Text>
        </View>

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

        {/* Compact phase pill */}
        <PhasePill school={school} />

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.logBtn, { backgroundColor: primaryColor }]} onPress={handleLogRunTap}>
            <Text style={styles.logBtnText}>+ Log a Run</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.stravaBtn]} onPress={() => setStravaVisible(true)}>
            <Text style={styles.stravaBtnText}>STRAVA</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.calBtn, { borderColor: primaryColor }]} onPress={() => setCalendarVisible(true)}>
            <Text style={[styles.calBtnText, { color: primaryColor }]}>📅</Text>
          </TouchableOpacity>
        </View>

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
                <View key={athlete.id} style={[styles.leaderRow, isMe && { backgroundColor: `${primaryColor}15`, borderColor: primaryColor, borderWidth: 1.5 }]}>
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
                  </View>
                  <Text style={[styles.leaderMiles, { color: isMe ? primaryColor : '#333' }]}>
                    {miles} mi
                  </Text>
                </View>
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
            const zone = getHRZone(run.heartRate, athleteAge);
            return (
              <TouchableOpacity key={run.id} style={styles.runCard}
                onPress={() => { setSelectedRun(run); setRunDetailVisible(true); }}>
                <View style={styles.runLeft}>
                  <Text style={styles.runMiles}>{run.miles} mi</Text>
                  <Text style={styles.runDate}>{run.date?.toDate?.()?.toLocaleDateString() || 'Today'}</Text>
                </View>
                <View style={styles.runMiddle}>
                  {run.duration && <Text style={styles.runDetail}>{run.duration}</Text>}
                  {zone && (
                    <View style={[styles.zoneBadge, { backgroundColor: zone.color }]}>
                      <Text style={styles.zoneBadgeText}>Z{zone.zone} {zone.name}</Text>
                    </View>
                  )}
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
        onClose={() => { setRunDetailVisible(false); setSelectedRun(null); }}
        onDeleted={() => { setRunDetailVisible(false); setSelectedRun(null); loadDashboard(); }}
        onUpdated={() => { setSelectedRun(null); loadDashboard(); }}
        primaryColor={primaryColor}
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

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  greeting: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  schoolName: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  signOutBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8 },
  signOutText: { color: '#fff', fontSize: 13 },
  pendingBanner: { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 10, marginTop: 12 },
  pendingText: { color: '#fff', fontSize: 13, textAlign: 'center' },
  rankBanner: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, padding: 8, marginTop: 10 },
  rankBannerText: { color: '#fff', fontSize: 13, textAlign: 'center', fontWeight: '600' },
  scroll: { flex: 1 },
  targetCard: { margin: 16, marginBottom: 8, backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  targetTop: { marginBottom: 12 },
  targetLabel: { fontSize: 12, color: '#999', marginBottom: 4 },
  targetMiles: {},
  targetMilesBig: { fontSize: 32, fontWeight: 'bold' },
  targetMilesOf: { fontSize: 15, color: '#999' },
  timeframeRow: { marginHorizontal: 16, marginBottom: 4 },
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
  leaderRank: { fontSize: 14, fontWeight: '700', color: '#999', width: 28 },
  leaderAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  leaderAvatarText: { fontWeight: 'bold', fontSize: 14 },
  leaderInfo: { flex: 1 },
  leaderName: { fontSize: 15, color: '#333' },
  leaderMiles: { fontSize: 16, fontWeight: 'bold' },
  emptyCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, alignItems: 'center' },
  emptyText: { color: '#999', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  runCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
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