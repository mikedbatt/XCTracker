import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { auth, db } from '../firebaseConfig';
import { signOut } from 'firebase/auth';
import {
  doc, getDoc, collection, query, where,
  orderBy, limit, getDocs, addDoc, updateDoc,
} from 'firebase/firestore';
import TimeframePicker, { TIMEFRAMES, getDateRange } from './TimeframePicker';
import RunDetailModal from './RunDetailModal';
import DatePickerField from './DatePickerField';
import CalendarScreen from './CalendarScreen';
import WorkoutDetailModal from './WorkoutDetailModal';

const EFFORT_LABELS = ['', 'Very Easy', 'Easy', 'Moderate', 'Moderate', 'Medium',
  'Medium Hard', 'Hard', 'Very Hard', 'Max Effort', 'All Out'];

export default function AthleteDashboard({ userData }) {
  const [school, setSchool] = useState(null);
  const [recentRuns, setRecentRuns] = useState([]);
  const [upcomingWorkouts, setUpcomingWorkouts] = useState([]);
  const [weeklyMiles, setWeeklyMiles] = useState(0);
  const [pendingParents, setPendingParents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logModalVisible, setLogModalVisible] = useState(false);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [selectedTimeframe, setSelectedTimeframe] = useState(TIMEFRAMES[0]);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [selectedRun, setSelectedRun] = useState(null);
  const [runDetailVisible, setRunDetailVisible] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [workoutDetailVisible, setWorkoutDetailVisible] = useState(false);

  // Log run form
  const [miles, setMiles] = useState('');
  const [duration, setDuration] = useState('');
  const [heartRate, setHeartRate] = useState('');
  const [effort, setEffort] = useState(5);
  const [notes, setNotes] = useState('');
  const [runDate, setRunDate] = useState(new Date());
  const [savingRun, setSavingRun] = useState(false);

  useEffect(() => { loadDashboard(); }, [selectedTimeframe]);

  if (calendarVisible) {
    return <CalendarScreen userData={userData} school={school} onClose={() => setCalendarVisible(false)} />;
  }

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (userData.schoolId) {
        const schoolDoc = await getDoc(doc(db, 'schools', userData.schoolId));
        if (schoolDoc.exists()) setSchool(schoolDoc.data());
      }

      // Load runs for selected timeframe
      let startDate = null;
      if (selectedTimeframe.days && selectedTimeframe.days !== 'custom' && selectedTimeframe.days !== 'season') {
        startDate = new Date(Date.now() - selectedTimeframe.days * 86400000);
      } else if (selectedTimeframe.days === 'season') {
        startDate = new Date(new Date().getFullYear(), 7, 1);
      }

      let runsQuery = startDate
        ? query(collection(db, 'runs'), where('userId', '==', user.uid), where('date', '>=', startDate), orderBy('date', 'desc'), limit(20))
        : query(collection(db, 'runs'), where('userId', '==', user.uid), orderBy('date', 'desc'), limit(20));

      const runsSnapshot = await getDocs(runsQuery);
      const runs = runsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setRecentRuns(runs);

      const oneWeekAgo = new Date(Date.now() - 7 * 86400000);
      setWeeklyMiles(Math.round(runs.filter(r => r.date?.toDate?.() >= oneWeekAgo).reduce((sum, r) => sum + (r.miles || 0), 0) * 10) / 10);

      if (userData.status === 'approved' && userData.schoolId) {
        try {
          const workoutsSnap = await getDocs(query(
            collection(db, 'events'),
            where('schoolId', '==', userData.schoolId),
            where('category', '==', 'Training'),
            orderBy('date', 'asc'),
            limit(3)
          ));
          setUpcomingWorkouts(workoutsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) { console.log('Upcoming training:', e); }
      }

      // Load pending parent requests
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        if (data.pendingParentIds?.length > 0) {
          const parentData = [];
          for (const parentId of data.pendingParentIds) {
            const parentDoc = await getDoc(doc(db, 'users', parentId));
            if (parentDoc.exists()) parentData.push({ id: parentDoc.id, ...parentDoc.data() });
          }
          setPendingParents(parentData);
        }
      }
    } catch (error) { console.error('Dashboard load error:', error); }
    setLoading(false);
  };

  const handleApproveParent = async (parent, approve) => {
    try {
      const user = auth.currentUser;
      if (approve) {
        await updateDoc(doc(db, 'users', user.uid), {
          pendingParentIds: (await getDoc(doc(db, 'users', user.uid))).data().pendingParentIds?.filter(id => id !== parent.id) || [],
          parentIds: [...((await getDoc(doc(db, 'users', user.uid))).data().parentIds || []), parent.id],
        });
        await updateDoc(doc(db, 'users', parent.id), { status: 'approved' });
        Alert.alert('Approved!', `${parent.firstName} can now follow your training.`);
      } else {
        await updateDoc(doc(db, 'users', user.uid), {
          pendingParentIds: (await getDoc(doc(db, 'users', user.uid))).data().pendingParentIds?.filter(id => id !== parent.id) || [],
        });
        Alert.alert('Declined', 'Parent request has been declined.');
      }
      loadDashboard();
    } catch (error) { Alert.alert('Error', 'Could not update parent request.'); }
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
      await addDoc(collection(db, 'runs'), {
        userId: user.uid,
        schoolId: userData.schoolId || null,
        miles: milesFloat,
        duration: duration || null,
        heartRate: heartRate ? parseInt(heartRate) : null,
        effort,
        notes: notes || null,
        source: 'manual',
        date: runDate, // Using date picker value
      });
      const newTotal = Math.round(((userData.totalMiles || 0) + milesFloat) * 10) / 10;
      await updateDoc(doc(db, 'users', user.uid), { totalMiles: newTotal });
      Alert.alert('Run logged!', `Great work! ${miles} miles logged.`);
      setLogModalVisible(false);
      setMiles(''); setDuration(''); setHeartRate(''); setEffort(5); setNotes(''); setRunDate(new Date());
      loadDashboard();
    } catch (error) { Alert.alert('Error', 'Could not save run. Please try again.'); }
    setSavingRun(false);
  };

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', onPress: () => signOut(auth) },
    ]);
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color="#2e7d32" /></View>;

  const primaryColor = school?.primaryColor || '#2e7d32';
  const isApproved = userData.status === 'approved';

  return (
    <View style={styles.container}>
      <View style={[styles.header, { backgroundColor: primaryColor }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>Hey, {userData.firstName}!</Text>
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
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Parent approval requests */}
        {pendingParents.length > 0 && (
          <View style={styles.parentRequests}>
            {pendingParents.map(parent => (
              <View key={parent.id} style={styles.parentRequestCard}>
                <Text style={styles.parentRequestTitle}>Parent follow request</Text>
                <Text style={styles.parentRequestName}>{parent.firstName} {parent.lastName} wants to follow your training.</Text>
                <View style={styles.parentRequestBtns}>
                  <TouchableOpacity style={[styles.approveParentBtn, { backgroundColor: primaryColor }]} onPress={() => handleApproveParent(parent, true)}>
                    <Text style={styles.approveParentBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.denyParentBtn} onPress={() => handleApproveParent(parent, false)}>
                    <Text style={styles.denyParentBtnText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{weeklyMiles}</Text>
            <Text style={styles.statLabel}>This week</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{recentRuns.length}</Text>
            <Text style={styles.statLabel}>Recent runs</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{userData.totalMiles || 0}</Text>
            <Text style={styles.statLabel}>Total miles</Text>
          </View>
        </View>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.logRunButton, { backgroundColor: primaryColor }]} onPress={() => setLogModalVisible(true)}>
            <Text style={styles.logRunButtonText}>+ Log a Run</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.calendarButton, { borderColor: primaryColor }]} onPress={() => setCalendarVisible(true)}>
            <Text style={[styles.calendarButtonText, { color: primaryColor }]}>📅 Calendar</Text>
          </TouchableOpacity>
        </View>

        {/* Upcoming workouts */}
        {isApproved && upcomingWorkouts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upcoming Workouts</Text>
            {upcomingWorkouts.map(workout => (
              <TouchableOpacity
                key={workout.id}
                style={styles.workoutCard}
                onPress={() => { setSelectedWorkout(workout); setWorkoutDetailVisible(true); }}
              >
                <View style={[styles.workoutType, { backgroundColor: primaryColor }]}>
                  <Text style={styles.workoutTypeText}>{workout.type?.toUpperCase() || 'RUN'}</Text>
                </View>
                <View style={styles.workoutInfo}>
                  <Text style={styles.workoutTitle}>{workout.title}</Text>
                  <Text style={styles.workoutDesc}>{workout.description}</Text>
                  <Text style={styles.workoutDate}>{workout.date?.toDate?.()?.toLocaleDateString() || ''}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Recent runs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Runs</Text>
          <TimeframePicker
            selected={selectedTimeframe}
            onSelect={setSelectedTimeframe}
            customStart={customStart}
            customEnd={customEnd}
            onCustomChange={(s, e) => { setCustomStart(s); setCustomEnd(e); }}
            seasonStart={school?.seasonStart}
            seasonEnd={school?.seasonEnd}
            primaryColor={primaryColor}
          />
          {recentRuns.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No runs logged yet — tap "Log a Run" to get started!</Text>
            </View>
          ) : recentRuns.map(run => (
            <TouchableOpacity key={run.id} style={styles.runCard} onPress={() => { setSelectedRun(run); setRunDetailVisible(true); }}>
              <View style={styles.runLeft}>
                <Text style={styles.runMiles}>{run.miles} mi</Text>
                <Text style={styles.runDate}>{run.date?.toDate?.()?.toLocaleDateString() || 'Today'}</Text>
              </View>
              <View style={styles.runMiddle}>
                {run.duration && <Text style={styles.runDetail}>{run.duration}</Text>}
                {run.heartRate && <Text style={styles.runDetail}>{run.heartRate} bpm</Text>}
              </View>
              <View style={styles.runRight}>
                <Text style={styles.effortLabel}>Effort</Text>
                <Text style={[styles.effortValue, { color: primaryColor }]}>{run.effort}/10</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Workout Detail Modal */}
      <WorkoutDetailModal
        item={selectedWorkout}
        visible={workoutDetailVisible}
        onClose={() => { setWorkoutDetailVisible(false); setSelectedWorkout(null); }}
        primaryColor={primaryColor}
      />

      {/* Run Detail Modal */}
      <RunDetailModal run={selectedRun} visible={runDetailVisible} onClose={() => { setRunDetailVisible(false); setSelectedRun(null); }} primaryColor={primaryColor} />

      {/* Log Run Modal - FIXED with KeyboardAvoidingView and DatePickerField */}
      <Modal visible={logModalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setLogModalVisible(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Log a Run</Text>
              <View style={{ width: 60 }} />
            </View>
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">

              {/* Date picker - athletes can now back-date runs */}
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
                    <Text style={[styles.effortBtnText, effort === n && styles.effortBtnTextActive]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.modalLabel}>Notes (optional)</Text>
              <TextInput style={[styles.modalInput, styles.notesInput]} placeholder="How did the run go?" placeholderTextColor="#999" value={notes} onChangeText={setNotes} multiline />

              <TouchableOpacity style={[styles.saveButton, { backgroundColor: primaryColor }]} onPress={handleLogRun} disabled={savingRun}>
                {savingRun ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save Run</Text>}
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
  header: { paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  greeting: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  schoolName: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  signOutBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8 },
  signOutText: { color: '#fff', fontSize: 13 },
  pendingBanner: { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 10, marginTop: 12 },
  pendingText: { color: '#fff', fontSize: 13, textAlign: 'center' },
  scroll: { flex: 1 },
  parentRequests: { margin: 16, marginBottom: 0 },
  parentRequestCard: { backgroundColor: '#fff8e1', borderRadius: 12, padding: 16, borderLeftWidth: 4, borderLeftColor: '#f59e0b' },
  parentRequestTitle: { fontSize: 13, fontWeight: '700', color: '#92400e', marginBottom: 4 },
  parentRequestName: { fontSize: 14, color: '#444', marginBottom: 12 },
  parentRequestBtns: { flexDirection: 'row', gap: 10 },
  approveParentBtn: { flex: 1, borderRadius: 8, padding: 10, alignItems: 'center' },
  approveParentBtnText: { color: '#fff', fontWeight: '700' },
  denyParentBtn: { flex: 1, borderRadius: 8, padding: 10, alignItems: 'center', backgroundColor: '#fee2e2' },
  denyParentBtnText: { color: '#dc2626', fontWeight: '700' },
  statsRow: { flexDirection: 'row', padding: 16, gap: 10 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center' },
  statNumber: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  statLabel: { fontSize: 11, color: '#999', marginTop: 4, textAlign: 'center' },
  actionRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 8 },
  logRunButton: { flex: 1, borderRadius: 12, padding: 16, alignItems: 'center' },
  logRunButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  calendarButton: { borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 2, paddingHorizontal: 16 },
  calendarButtonText: { fontSize: 14, fontWeight: '600' },
  section: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 12 },
  workoutCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', gap: 12, alignItems: 'center' },
  chevron: { fontSize: 22, color: '#ccc' },
  workoutType: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, justifyContent: 'center' },
  workoutTypeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  workoutInfo: { flex: 1 },
  workoutTitle: { fontSize: 15, fontWeight: '700', color: '#333' },
  workoutDesc: { fontSize: 13, color: '#666', marginTop: 2 },
  workoutDate: { fontSize: 12, color: '#999', marginTop: 4 },
  emptyCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, alignItems: 'center' },
  emptyText: { color: '#999', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  runCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
  runLeft: { width: 70 },
  runMiles: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  runDate: { fontSize: 12, color: '#999', marginTop: 2 },
  runMiddle: { flex: 1, paddingHorizontal: 10 },
  runDetail: { fontSize: 13, color: '#666', marginBottom: 2 },
  runRight: { alignItems: 'center' },
  effortLabel: { fontSize: 11, color: '#999' },
  effortValue: { fontSize: 18, fontWeight: 'bold' },
  modal: { flex: 1, backgroundColor: '#f5f5f5' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  modalCancel: { color: '#999', fontSize: 16, width: 60 },
  modalScroll: { padding: 20 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: '#444', marginBottom: 8, marginTop: 4 },
  modalInput: { backgroundColor: '#fff', borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 16, borderWidth: 1, borderColor: '#ddd', color: '#333' },
  notesInput: { height: 100, textAlignVertical: 'top' },
  effortRow: { flexDirection: 'row', gap: 6, marginBottom: 16, flexWrap: 'wrap' },
  effortBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center' },
  effortBtnText: { fontSize: 15, fontWeight: '600', color: '#666' },
  effortBtnTextActive: { color: '#fff' },
  saveButton: { borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8, marginBottom: 40 },
  saveButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});