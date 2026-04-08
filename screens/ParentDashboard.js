import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, orderBy, query, where } from 'firebase/firestore';
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
import {
  BRAND, BRAND_DARK, BRAND_LIGHT,
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE, STATUS,
} from '../constants/design';
import { auth, db } from '../firebaseConfig';
import AthleteDetailScreen from './AthleteDetailScreen';
import CalendarScreen from './CalendarScreen';
import ParentLinkScreen from './ParentLinkScreen';

export default function ParentDashboard({ userData }) {
  const [athletes, setAthletes] = useState([]);
  const [selectedAthlete, setSelectedAthlete] = useState(null);
  const [addAthleteVisible, setAddAthleteVisible] = useState(false);
  const [school, setSchool] = useState(null);
  const [teamZoneSettings, setTeamZoneSettings] = useState(null);
  const [groups, setGroups] = useState([]);
  const [athleteRuns, setAthleteRuns] = useState([]);
  const [upcomingMeets, setUpcomingMeets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('training');

  useEffect(() => { loadDashboard(); }, []);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const parentSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const parentData = parentSnap.exists() ? parentSnap.data() : userData;
      const linkedIds = parentData.linkedAthleteIds || [];

      if (linkedIds.length > 0) {
        const athleteData = [];
        for (const athleteId of linkedIds) {
          const athleteDoc = await getDoc(doc(db, 'users', athleteId));
          if (athleteDoc.exists()) athleteData.push({ id: athleteDoc.id, ...athleteDoc.data() });
        }
        setAthletes(athleteData);
        const first = athleteData[0];
        if (first) {
          setSelectedAthlete(first);
          await loadAthleteData(first);
        }
      }
    } catch (error) {
      console.error('Parent dashboard error:', error);
    }
    setLoading(false);
  };

  const loadAthleteData = async (athlete) => {
    try {
      if (athlete.schoolId) {
        const [schoolDoc, zoneDoc, groupsSnap, meetsSnap] = await Promise.all([
          getDoc(doc(db, 'schools', athlete.schoolId)),
          getDoc(doc(db, 'teamZoneSettings', athlete.schoolId)).catch(() => null),
          getDocs(query(collection(db, 'groups'), where('schoolId', '==', athlete.schoolId))).catch(() => ({ docs: [] })),
          getDocs(query(collection(db, 'raceMeets'), where('schoolId', '==', athlete.schoolId))).catch(() => ({ docs: [] })),
        ]);

        if (schoolDoc.exists()) setSchool({ id: schoolDoc.id, ...schoolDoc.data() });
        if (zoneDoc?.exists()) setTeamZoneSettings(zoneDoc.data());
        setGroups(groupsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        // Upcoming meets
        const now = new Date();
        const allMeets = meetsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const upcoming = allMeets
          .filter(m => { const d = m.date?.toDate ? m.date.toDate() : new Date(m.date); return d >= now; })
          .sort((a, b) => {
            const da = a.date?.toDate ? a.date.toDate() : new Date(a.date);
            const db2 = b.date?.toDate ? b.date.toDate() : new Date(b.date);
            return da - db2;
          });
        setUpcomingMeets(upcoming);
      }

      // Load athlete's runs for calendar overlay
      const runsSnap = await getDocs(query(
        collection(db, 'runs'),
        where('userId', '==', athlete.id),
        orderBy('date', 'desc')
      ));
      setAthleteRuns(runsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
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

  const handleSwitchAthlete = (athlete) => {
    setSelectedAthlete(athlete);
    setActiveView('training');
    loadAthleteData(athlete);
  };

  const formatMeetDate = (d) => {
    const date = d?.toDate ? d.toDate() : new Date(d);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const daysUntil = (d) => {
    const date = d?.toDate ? d.toDate() : new Date(d);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.ceil((date - today) / 86400000);
    return diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : `${diff} days`;
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={BRAND} /></View>;

  const primaryColor = school?.primaryColor || BRAND;

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
        {athletes.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.athleteSelector}>
            {athletes.map((athlete) => (
              <TouchableOpacity
                key={athlete.id}
                style={[styles.athleteChip, selectedAthlete?.id === athlete.id && styles.athleteChipActive]}
                onPress={() => handleSwitchAthlete(athlete)}
              >
                <Text style={[styles.athleteChipText, selectedAthlete?.id === athlete.id && styles.athleteChipTextActive]}>
                  {athlete.firstName}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.athleteChip, { borderStyle: 'dashed' }]}
              onPress={() => setAddAthleteVisible(true)}
            >
              <Text style={styles.athleteChipText}>+ Add</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* View toggle */}
        {selectedAthlete && (
          <View style={styles.viewToggle}>
            {[{ key: 'training', icon: 'bar-chart-outline', label: 'Training' }, { key: 'calendar', icon: 'calendar-outline', label: 'Calendar' }].map(v => (
              <TouchableOpacity
                key={v.key}
                style={[styles.toggleBtn, activeView === v.key && { backgroundColor: BRAND, borderColor: BRAND }]}
                onPress={() => setActiveView(v.key)}
              >
                <Ionicons name={v.icon} size={14} color={activeView === v.key ? '#fff' : NEUTRAL.body} />
                <Text style={[styles.toggleBtnText, activeView === v.key && { color: '#fff' }]}>{v.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Body */}
      {athletes.length === 0 ? (
        <View style={styles.noAthletes}>
          <Text style={styles.noAthletesTitle}>No athletes linked</Text>
          <Text style={styles.noAthletesText}>
            Ask your athlete to sign up for XCTracker first, then you can link to their account.
          </Text>
          <TouchableOpacity style={styles.linkBtn} onPress={() => setAddAthleteVisible(true)}>
            <Text style={styles.linkBtnText}>Link an Athlete</Text>
          </TouchableOpacity>
        </View>
      ) : activeView === 'training' ? (
        <View style={{ flex: 1 }}>
          {/* Upcoming meets compact card */}
          {upcomingMeets.length > 0 && (
            <TouchableOpacity style={styles.meetsCard} onPress={() => setActiveView('calendar')}>
              <Ionicons name="flag" size={18} color={STATUS.error} />
              <View style={{ flex: 1 }}>
                <Text style={styles.meetsCardTitle}>
                  Next: {upcomingMeets[0].name}
                </Text>
                <Text style={styles.meetsCardSub}>
                  {formatMeetDate(upcomingMeets[0].date)}
                  {upcomingMeets[0].location ? ` · ${upcomingMeets[0].location}` : ''}
                  {' · '}{daysUntil(upcomingMeets[0].date)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={NEUTRAL.muted} />
            </TouchableOpacity>
          )}

          {/* Athlete detail (parentMode) */}
          <AthleteDetailScreen
            key={selectedAthlete.id}
            athlete={selectedAthlete}
            school={school}
            teamZoneSettings={teamZoneSettings}
            groups={groups}
            parentMode
          />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Upcoming meets expanded */}
          {upcomingMeets.length > 0 && (
            <View style={styles.meetsSection}>
              <Text style={styles.meetsSectionTitle}>Upcoming Meets</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {upcomingMeets.map(meet => (
                  <View key={meet.id} style={styles.meetCard}>
                    <Text style={styles.meetCardDate}>{formatMeetDate(meet.date)}</Text>
                    <Text style={styles.meetCardName}>{meet.name}</Text>
                    {meet.location && <Text style={styles.meetCardLocation}>{meet.location}</Text>}
                    <Text style={styles.meetCardDays}>{daysUntil(meet.date)}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Calendar */}
          <CalendarScreen
            userData={{ ...userData, schoolId: selectedAthlete.schoolId }}
            school={school}
            groups={groups}
            externalAthleteRuns={athleteRuns}
            trainingPaces={selectedAthlete.trainingPaces || null}
            onClose={() => setActiveView('training')}
          />
        </View>
      )}

      {/* Add athlete overlay */}
      {addAthleteVisible && (
        <View style={styles.overlay}>
          <ParentLinkScreen onLinkComplete={() => { setAddAthleteVisible(false); loadDashboard(); }} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: NEUTRAL.bg },
  loading:            { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:             { backgroundColor: NEUTRAL.card, paddingTop: Platform.OS === 'ios' ? SPACE['5xl'] : SPACE['3xl'], paddingBottom: SPACE.md, paddingHorizontal: SPACE.xl, borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
  headerTop:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  greeting:           { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  schoolName:         { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, marginTop: 2 },
  signOutBtn:         { paddingVertical: SPACE.xs, paddingHorizontal: SPACE.md, backgroundColor: NEUTRAL.bg, borderRadius: RADIUS.sm },
  signOutText:        { color: NEUTRAL.body, fontSize: FONT_SIZE.sm },
  athleteSelector:    { marginTop: SPACE.md },
  athleteChip:        { paddingHorizontal: SPACE.lg - 2, paddingVertical: SPACE.sm, borderRadius: RADIUS.full, backgroundColor: NEUTRAL.bg, marginRight: SPACE.sm, borderWidth: 1.5, borderColor: NEUTRAL.border },
  athleteChipActive:  { backgroundColor: BRAND, borderColor: BRAND },
  athleteChipText:    { color: NEUTRAL.body, fontWeight: FONT_WEIGHT.semibold, fontSize: FONT_SIZE.sm },
  athleteChipTextActive: { color: '#fff' },
  viewToggle:         { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.md },
  toggleBtn:          { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.xs, borderRadius: RADIUS.md, paddingVertical: SPACE.sm, borderWidth: 1.5, borderColor: NEUTRAL.border, backgroundColor: NEUTRAL.card },
  toggleBtnText:      { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: NEUTRAL.body },
  noAthletes:         { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE['3xl'] },
  noAthletesTitle:    { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: SPACE.md },
  noAthletesText:     { fontSize: FONT_SIZE.base, color: NEUTRAL.body, textAlign: 'center', lineHeight: 22, marginBottom: SPACE.xl },
  linkBtn:            { backgroundColor: BRAND, borderRadius: RADIUS.md, paddingVertical: SPACE.md, paddingHorizontal: SPACE['3xl'] },
  linkBtnText:        { color: '#fff', fontWeight: FONT_WEIGHT.bold, fontSize: FONT_SIZE.base },
  meetsCard:          { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, marginHorizontal: SPACE.lg, marginTop: SPACE.md, backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, paddingVertical: SPACE.md, paddingHorizontal: SPACE.lg, borderLeftWidth: 4, borderLeftColor: STATUS.error, ...SHADOW.sm },
  meetsCardTitle:     { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  meetsCardSub:       { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, marginTop: 2 },
  meetsSection:       { paddingHorizontal: SPACE.lg, paddingTop: SPACE.md, paddingBottom: SPACE.xs },
  meetsSectionTitle:  { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: SPACE.sm },
  meetCard:           { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg, marginRight: SPACE.md, width: 200, borderLeftWidth: 4, borderLeftColor: STATUS.error, ...SHADOW.sm },
  meetCardDate:       { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, fontWeight: FONT_WEIGHT.semibold, marginBottom: SPACE.xs },
  meetCardName:       { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: SPACE.xs },
  meetCardLocation:   { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, marginBottom: SPACE.xs },
  meetCardDays:       { fontSize: FONT_SIZE.xs, color: STATUS.error, fontWeight: FONT_WEIGHT.bold },
  overlay:            { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: NEUTRAL.bg, zIndex: 10 },
});
