import { signOut } from 'firebase/auth';
import {
    arrayRemove,
    arrayUnion,
    collection,
    doc, getDoc,
    getDocs,
    orderBy,
    query,
    updateDoc,
    where,
} from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator, Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';
import AthleteDetailScreen from '../screens/AthleteDetailScreen';
import CalendarScreen, { TYPE_COLORS } from '../screens/CalendarScreen';
import TimeframePicker, { TIMEFRAMES } from '../screens/TimeframePicker';

export default function CoachDashboard({ userData }) {
  const [school, setSchool] = useState(null);
  const [athletes, setAthletes] = useState([]);
  const [athleteMiles, setAthleteMiles] = useState({});
  const [pendingAthletes, setPendingAthletes] = useState([]);
  const [trainingItems, setTrainingItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('team');
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [addFromDashboard, setAddFromDashboard] = useState(false);
  const [selectedAthlete, setSelectedAthlete] = useState(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState(TIMEFRAMES[0]);

  // loadDashboard defined BEFORE any early returns so it's always accessible
  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      if (!userData.schoolId) { setLoading(false); return; }

      const schoolDoc = await getDoc(doc(db, 'schools', userData.schoolId));
      if (schoolDoc.exists()) setSchool(schoolDoc.data());

      // Approved athletes
      const approvedSnap = await getDocs(query(
        collection(db, 'users'),
        where('schoolId', '==', userData.schoolId),
        where('role', '==', 'athlete'),
        where('status', '==', 'approved')
      ));
      const approvedAthletes = approvedSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAthletes(approvedAthletes);

      // Miles per athlete for selected timeframe
      const cutoff = selectedTimeframe.days && selectedTimeframe.days !== 'season' && selectedTimeframe.days !== 'custom'
        ? new Date(Date.now() - selectedTimeframe.days * 86400000)
        : selectedTimeframe.days === 'season' ? new Date(new Date().getFullYear(), 7, 1) : null;

      const milesMap = {};
      for (const athlete of approvedAthletes) {
        try {
          const runsSnap = await getDocs(
            cutoff
              ? query(collection(db, 'runs'), where('userId', '==', athlete.id), where('date', '>=', cutoff), orderBy('date', 'desc'))
              : query(collection(db, 'runs'), where('userId', '==', athlete.id), orderBy('date', 'desc'))
          );
          milesMap[athlete.id] = Math.round(runsSnap.docs.reduce((sum, d) => sum + (d.data().miles || 0), 0) * 10) / 10;
        } catch { milesMap[athlete.id] = 0; }
      }
      setAthleteMiles(milesMap);

      // Pending athletes (admin only)
      if (userData.coachRole === 'admin') {
        const pendingSnap = await getDocs(query(
          collection(db, 'users'),
          where('schoolId', '==', userData.schoolId),
          where('role', '==', 'athlete'),
          where('status', '==', 'pending')
        ));
        setPendingAthletes(pendingSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      }

      // Training items from unified events collection
      try {
        const trainingSnap = await getDocs(query(
          collection(db, 'events'),
          where('schoolId', '==', userData.schoolId),
          where('category', '==', 'Training'),
          orderBy('date', 'asc')
        ));
        setTrainingItems(trainingSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        // Fallback: load all events and filter client-side if index not ready
        try {
          const allSnap = await getDocs(query(
            collection(db, 'events'),
            where('schoolId', '==', userData.schoolId),
            orderBy('date', 'asc')
          ));
          setTrainingItems(allSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => i.category === 'Training'));
        } catch (e2) { console.error('Training load error:', e2.message); }
      }

    } catch (error) { console.error('Coach dashboard error:', error); }
    setLoading(false);
  }, [selectedTimeframe, userData.schoolId]);

  // Reload when timeframe changes OR when returning from calendar
  useEffect(() => {
    if (!calendarVisible && !addFromDashboard) {
      loadDashboard();
    }
  }, [selectedTimeframe, calendarVisible, addFromDashboard]);

  // ── Early returns for sub-screens ──────────────────────────────────────────
  if (selectedAthlete) {
    return (
      <AthleteDetailScreen
        athlete={selectedAthlete}
        school={school}
        onBack={() => setSelectedAthlete(null)}
      />
    );
  }

  if (calendarVisible || addFromDashboard) {
    return (
      <CalendarScreen
        userData={userData}
        school={school}
        autoOpenAdd={addFromDashboard}
        onClose={() => {
          setCalendarVisible(false);
          setAddFromDashboard(false);
        }}
      />
    );
  }

  // ── Handlers ───────────────────────────────────────────────────────────────
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
      { text: 'Sign out', onPress: () => signOut(auth) },
    ]);
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color="#2e7d32" /></View>;

  const primaryColor = school?.primaryColor || '#2e7d32';
  const isAdmin = userData.coachRole === 'admin';
  const today = new Date().toISOString().split('T')[0];
  const todayItems = trainingItems.filter(item => item.date?.toDate?.()?.toISOString().split('T')[0] === today);
  const upcomingItems = trainingItems.filter(item => item.date?.toDate?.()?.toISOString().split('T')[0] > today).slice(0, 7);

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={[styles.header, { backgroundColor: primaryColor }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>Coach {userData.lastName}</Text>
            <Text style={styles.schoolName}>{school?.name || 'XCTracker'}</Text>
          </View>
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.headerStats}>
          <View style={styles.headerStat}>
            <Text style={styles.headerStatNum}>{athletes.length}</Text>
            <Text style={styles.headerStatLabel}>Athletes</Text>
          </View>
          <View style={styles.headerStat}>
            <Text style={styles.headerStatNum}>{pendingAthletes.length}</Text>
            <Text style={styles.headerStatLabel}>Pending</Text>
          </View>
          <View style={styles.headerStat}>
            <Text style={styles.headerStatNum}>{school?.joinCode || '--'}</Text>
            <Text style={styles.headerStatLabel}>Join Code</Text>
          </View>
          <TouchableOpacity style={styles.calendarBtn} onPress={() => setCalendarVisible(true)}>
            <Text style={styles.calendarBtnText}>📅 Calendar</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {['team', 'training', isAdmin && 'pending'].filter(Boolean).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && { color: primaryColor }]}>
              {tab === 'team' ? 'Team' : tab === 'training' ? 'Training' : `Pending (${pendingAthletes.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scroll}>

        {/* ── Team tab ── */}
        {activeTab === 'team' && (
          <View style={styles.section}>
            <TimeframePicker
              selected={selectedTimeframe}
              onSelect={setSelectedTimeframe}
              seasonStart={school?.seasonStart}
              seasonEnd={school?.seasonEnd}
              primaryColor={primaryColor}
            />
            {athletes.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No approved athletes yet.</Text>
                <Text style={styles.emptySubText}>Share join code: {school?.joinCode}</Text>
              </View>
            ) : [...athletes]
                .sort((a, b) => (athleteMiles[b.id] || 0) - (athleteMiles[a.id] || 0))
                .map((athlete, index) => (
                <TouchableOpacity
                  key={athlete.id}
                  style={styles.athleteCard}
                  onPress={() => setSelectedAthlete(athlete)}
                >
                  <Text style={styles.rankNum}>#{index + 1}</Text>
                  <View style={[styles.avatar, { backgroundColor: primaryColor }]}>
                    <Text style={styles.avatarText}>{athlete.firstName?.[0]}{athlete.lastName?.[0]}</Text>
                  </View>
                  <View style={styles.athleteInfo}>
                    <Text style={styles.athleteName}>{athlete.firstName} {athlete.lastName}</Text>
                    <Text style={styles.athleteSub}>{selectedTimeframe.label}</Text>
                  </View>
                  <View style={styles.milesBox}>
                    <Text style={[styles.milesNum, { color: primaryColor }]}>{athleteMiles[athlete.id] ?? '—'}</Text>
                    <Text style={styles.milesLabel}>miles</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              ))
            }
          </View>
        )}

        {/* ── Training tab ── */}
        {activeTab === 'training' && (
          <View style={styles.section}>

            {/* Today */}
            <View style={styles.todaySection}>
              <Text style={styles.todayLabel}>TODAY</Text>
              {todayItems.length > 0 ? todayItems.map(item => (
                <View key={item.id} style={[styles.todayCard, { borderLeftColor: TYPE_COLORS[item.type] || primaryColor }]}>
                  <View style={[styles.typeBadge, { backgroundColor: TYPE_COLORS[item.type] || primaryColor }]}>
                    <Text style={styles.typeBadgeText}>{item.type}</Text>
                  </View>
                  <Text style={styles.trainingTitle}>{item.title}</Text>
                  {item.description && <Text style={styles.trainingDesc}>{item.description}</Text>}
                  {item.notes && <Text style={styles.trainingNotes}>{item.notes}</Text>}
                </View>
              )) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No training scheduled today.</Text>
                  <TouchableOpacity
                    style={[styles.addBtn, { backgroundColor: primaryColor }]}
                    onPress={() => setAddFromDashboard(true)}
                  >
                    <Text style={styles.addBtnText}>+ Add</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Upcoming */}
            <View style={styles.upcomingSection}>
              <View style={styles.upcomingHeader}>
                <Text style={styles.upcomingSectionTitle}>Upcoming training</Text>
                <TouchableOpacity
                  style={[styles.addBtn, { backgroundColor: primaryColor }]}
                  onPress={() => setAddFromDashboard(true)}
                >
                  <Text style={styles.addBtnText}>+ Add</Text>
                </TouchableOpacity>
              </View>
              {upcomingItems.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No upcoming training scheduled.</Text>
                </View>
              ) : upcomingItems.map(item => (
                <View key={item.id} style={styles.trainingCard}>
                  <View style={[styles.typeBadge, { backgroundColor: TYPE_COLORS[item.type] || primaryColor }]}>
                    <Text style={styles.typeBadgeText}>{item.type}</Text>
                  </View>
                  <View style={styles.trainingInfo}>
                    <Text style={styles.trainingTitle}>{item.title}</Text>
                    {item.description && <Text style={styles.trainingDesc} numberOfLines={1}>{item.description}</Text>}
                    <Text style={styles.trainingDate}>
                      {item.date?.toDate?.()?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) || ''}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

          </View>
        )}

        {/* ── Pending tab ── */}
        {activeTab === 'pending' && isAdmin && (
          <View style={styles.section}>
            {pendingAthletes.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No pending requests.</Text>
              </View>
            ) : pendingAthletes.map(athlete => (
              <View key={athlete.id} style={styles.pendingCard}>
                <View style={[styles.avatar, { backgroundColor: primaryColor }]}>
                  <Text style={styles.avatarText}>{athlete.firstName?.[0]}{athlete.lastName?.[0]}</Text>
                </View>
                <View style={styles.athleteInfo}>
                  <Text style={styles.athleteName}>{athlete.firstName} {athlete.lastName}</Text>
                  <Text style={styles.athleteSub}>{athlete.email}</Text>
                  {athlete.isMinor && <Text style={styles.minorTag}>Minor — parent consent required</Text>}
                </View>
                <View style={styles.approvalBtns}>
                  <TouchableOpacity
                    style={[styles.approveBtn, { backgroundColor: primaryColor }]}
                    onPress={() => handleApproveAthlete(athlete)}
                  >
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.denyBtn} onPress={() => handleDenyAthlete(athlete)}>
                    <Text style={styles.denyBtnText}>Deny</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  greeting: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  schoolName: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  signOutBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8 },
  signOutText: { color: '#fff', fontSize: 13 },
  headerStats: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  headerStat: { alignItems: 'center' },
  headerStatNum: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  headerStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  calendarBtn: { marginLeft: 'auto', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  calendarBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#2e7d32' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#999' },
  scroll: { flex: 1 },
  section: { padding: 16 },
  emptyCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, alignItems: 'center', gap: 10 },
  emptyText: { color: '#999', fontSize: 14, textAlign: 'center' },
  emptySubText: { color: '#bbb', fontSize: 13 },
  addBtn: { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  athleteCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rankNum: { fontSize: 14, fontWeight: '700', color: '#999', width: 24 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  athleteInfo: { flex: 1 },
  athleteName: { fontSize: 15, fontWeight: '700', color: '#333' },
  athleteSub: { fontSize: 12, color: '#999', marginTop: 2 },
  milesBox: { alignItems: 'center' },
  milesNum: { fontSize: 20, fontWeight: 'bold' },
  milesLabel: { fontSize: 11, color: '#999' },
  chevron: { fontSize: 22, color: '#ccc' },
  todaySection: { marginBottom: 24 },
  todayLabel: { fontSize: 11, fontWeight: '700', color: '#999', letterSpacing: 1, marginBottom: 10 },
  todayCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderLeftWidth: 4, marginBottom: 8 },
  upcomingSection: { marginBottom: 16 },
  upcomingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  upcomingSectionTitle: { fontSize: 16, fontWeight: '700', color: '#333' },
  typeBadge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 8 },
  typeBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  trainingCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  trainingInfo: { flex: 1 },
  trainingTitle: { fontSize: 15, fontWeight: '700', color: '#333' },
  trainingDesc: { fontSize: 13, color: '#666', marginTop: 2 },
  trainingNotes: { fontSize: 13, color: '#888', marginTop: 4, fontStyle: 'italic' },
  trainingDate: { fontSize: 12, color: '#999', marginTop: 4 },
  pendingCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, gap: 10 },
  minorTag: { fontSize: 11, color: '#f59e0b', marginTop: 4, fontWeight: '600' },
  approvalBtns: { flexDirection: 'row', gap: 8 },
  approveBtn: { flex: 1, borderRadius: 8, padding: 10, alignItems: 'center' },
  approveBtnText: { color: '#fff', fontWeight: '700' },
  denyBtn: { flex: 1, borderRadius: 8, padding: 10, alignItems: 'center', backgroundColor: '#fee2e2' },
  denyBtnText: { color: '#dc2626', fontWeight: '700' },
});