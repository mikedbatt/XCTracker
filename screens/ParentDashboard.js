import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator, Alert,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { BRAND, BRAND_DARK } from '../constants/design';
import { auth, db } from '../firebaseConfig';

export default function ParentDashboard({ userData }) {
  const [athletes, setAthletes] = useState([]);
  const [selectedAthlete, setSelectedAthlete] = useState(null);
  const [school, setSchool] = useState(null);
  const [recentRuns, setRecentRuns] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      // Load linked athletes
      if (userData.linkedAthleteIds?.length > 0) {
        const athleteData = [];
        for (const athleteId of userData.linkedAthleteIds) {
          const athleteDoc = await getDoc(doc(db, 'users', athleteId));
          if (athleteDoc.exists()) athleteData.push({ id: athleteDoc.id, ...athleteDoc.data() });
        }
        setAthletes(athleteData);

        // Auto select first athlete
        const firstAthlete = athleteData[0];
        if (firstAthlete) {
          setSelectedAthlete(firstAthlete);
          await loadAthleteData(firstAthlete);
        }
      }
    } catch (error) {
      console.error('Parent dashboard error:', error);
    }
    setLoading(false);
  };

  const loadAthleteData = async (athlete) => {
    try {
      // Load school
      if (athlete.schoolId) {
        const schoolDoc = await getDoc(doc(db, 'schools', athlete.schoolId));
        if (schoolDoc.exists()) setSchool(schoolDoc.data());

        // Load upcoming events
        const eventsQuery = query(
          collection(db, 'events'),
          where('schoolId', '==', athlete.schoolId),
          orderBy('date', 'asc'),
          limit(5)
        );
        const eventsSnap = await getDocs(eventsQuery);
        setUpcomingEvents(eventsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      }

      // Load recent runs
      const runsQuery = query(
        collection(db, 'runs'),
        where('userId', '==', athlete.id),
        orderBy('date', 'desc'),
        limit(5)
      );
      const runsSnap = await getDocs(runsQuery);
      setRecentRuns(runsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error('Athlete data load error:', error);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', onPress: async () => {
        await SecureStore.deleteItemAsync('xctracker_email');
        await SecureStore.deleteItemAsync('xctracker_password');
        signOut(auth);
      }},
    ]);
  };

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={BRAND} /></View>;
  }

  const primaryColor = school?.primaryColor || '#213f96';

  // Weekly miles calculation
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const weeklyMiles = recentRuns
    .filter(r => r.date?.toDate?.() >= oneWeekAgo)
    .reduce((sum, r) => sum + (r.miles || 0), 0);

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>Hi, {userData.firstName}!</Text>
            <Text style={styles.schoolName}>{school?.name || 'XCTracker'}</Text>
          </View>
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>

        {/* Athlete selector */}
        {athletes.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.athleteSelector}>
            {athletes.map((athlete) => (
              <TouchableOpacity
                key={athlete.id}
                style={[styles.athleteChip, selectedAthlete?.id === athlete.id && styles.athleteChipActive]}
                onPress={() => { setSelectedAthlete(athlete); loadAthleteData(athlete); }}
              >
                <Text style={[styles.athleteChipText, selectedAthlete?.id === athlete.id && styles.athleteChipTextActive]}>
                  {athlete.firstName}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {athletes.length === 0 ? (
        <View style={styles.noAthletes}>
          <Text style={styles.noAthletesTitle}>No athletes linked</Text>
          <Text style={styles.noAthletesText}>
            Ask your athlete to sign up for XCTracker first, then you can link to their account.
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll}>

          {/* Athlete stats */}
          {selectedAthlete && (
            <View style={styles.athleteHeader}>
              <View style={[styles.bigAvatar, { backgroundColor: primaryColor }]}>
                <Text style={styles.bigAvatarText}>
                  {selectedAthlete.firstName?.[0]}{selectedAthlete.lastName?.[0]}
                </Text>
              </View>
              <View style={styles.athleteDetails}>
                <Text style={styles.athleteFullName}>
                  {selectedAthlete.firstName} {selectedAthlete.lastName}
                </Text>
                <Text style={styles.athleteStatus}>
                  {selectedAthlete.status === 'approved' ? '✓ Active on team' : 'Awaiting coach approval'}
                </Text>
              </View>
            </View>
          )}

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{Math.round(weeklyMiles * 10) / 10}</Text>
              <Text style={styles.statLabel}>Miles this week</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{selectedAthlete?.totalMiles || 0}</Text>
              <Text style={styles.statLabel}>Total miles</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{recentRuns.length}</Text>
              <Text style={styles.statLabel}>Recent runs</Text>
            </View>
          </View>

          {/* Upcoming events */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upcoming Events</Text>
            {upcomingEvents.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No upcoming events posted yet.</Text>
              </View>
            ) : (
              upcomingEvents.map((event) => (
                <View key={event.id} style={styles.eventCard}>
                  <View style={[styles.eventType, { backgroundColor: event.type === 'race' ? '#dc2626' : BRAND }]}>
                    <Text style={styles.eventTypeText}>{event.type?.toUpperCase() || 'EVENT'}</Text>
                  </View>
                  <View style={styles.eventInfo}>
                    <Text style={styles.eventTitle}>{event.title}</Text>
                    {event.location && <Text style={styles.eventDetail}>{event.location}</Text>}
                    {event.time && <Text style={styles.eventDetail}>{event.time}</Text>}
                    <Text style={styles.eventDate}>
                      {event.date?.toDate?.()?.toLocaleDateString() || event.date}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Recent runs */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{selectedAthlete?.firstName}'s Recent Runs</Text>
            {recentRuns.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No runs logged yet.</Text>
              </View>
            ) : (
              recentRuns.map((run) => (
                <View key={run.id} style={styles.runCard}>
                  <Text style={styles.runMiles}>{run.miles} mi</Text>
                  <Text style={styles.runDate}>{run.date?.toDate?.()?.toLocaleDateString() || 'Today'}</Text>
                  <Text style={[styles.runEffort, { color: BRAND }]}>Effort: {run.effort}/10</Text>
                </View>
              ))
            )}
          </View>

        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { backgroundColor: '#fff', paddingTop: Platform.OS === 'ios' ? 56 : 32, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  greeting: { fontSize: 22, fontWeight: 'bold', color: '#111827' },
  schoolName: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  signOutBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#F5F6FA', borderRadius: 8 },
  signOutText: { color: '#6B7280', fontSize: 13 },
  athleteSelector: { marginTop: 12 },
  athleteChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F5F6FA', marginRight: 8 },
  athleteChipActive: { backgroundColor: '#213f96' },
  athleteChipText: { color: '#6B7280', fontWeight: '600' },
  athleteChipTextActive: { color: '#fff' },
  noAthletes: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  noAthletesTitle: { fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 10 },
  noAthletesText: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22 },
  scroll: { flex: 1 },
  athleteHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  bigAvatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  bigAvatarText: { color: '#fff', fontWeight: 'bold', fontSize: 20 },
  athleteDetails: { flex: 1 },
  athleteFullName: { fontSize: 18, fontWeight: '700', color: '#111827' },
  athleteStatus: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 8 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center' },
  statNumber: { fontSize: 22, fontWeight: 'bold', color: '#111827' },
  statLabel: { fontSize: 11, color: '#9CA3AF', marginTop: 4, textAlign: 'center' },
  section: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 12 },
  emptyCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, alignItems: 'center' },
  emptyText: { color: '#9CA3AF', fontSize: 14, textAlign: 'center' },
  eventCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', gap: 12 },
  eventType: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  eventTypeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  eventInfo: { flex: 1 },
  eventTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  eventDetail: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  eventDate: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
  runCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  runMiles: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  runDate: { fontSize: 13, color: '#9CA3AF' },
  runEffort: { fontSize: 14, fontWeight: '600' },
});
