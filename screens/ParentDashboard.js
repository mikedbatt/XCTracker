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
import ChannelList from './ChannelList';
import ParentLinkScreen from './ParentLinkScreen';

export default function ParentDashboard({ userData }) {
  const [athletes, setAthletes] = useState([]);
  const [selectedAthlete, setSelectedAthlete] = useState(null);
  const [school, setSchool] = useState(null);
  const [teamZoneSettings, setTeamZoneSettings] = useState(null);
  const [groups, setGroups] = useState([]);
  const [athleteRuns, setAthleteRuns] = useState([]);
  const [upcomingMeets, setUpcomingMeets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('home');
  const [unreadFeedCount, setUnreadFeedCount] = useState(0);
  const [feedSchool, setFeedSchool] = useState(null);

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
      { text: 'Sign out', style: 'destructive', onPress: async () => {
        await SecureStore.deleteItemAsync('xctracker_email');
        await SecureStore.deleteItemAsync('xctracker_password');
        signOut(auth);
      }},
    ]);
  };

  const handleSwitchAthlete = (athlete) => {
    setSelectedAthlete(athlete);
    setActiveTab('home');
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

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>Hi, {userData.firstName}!</Text>
            <Text style={styles.schoolName}>{school?.name || 'TeamBase'}</Text>
          </View>
        </View>

        {/* Athlete selector (only show on athlete-specific tabs) */}
        {athletes.length > 0 && (activeTab === 'home' || activeTab === 'calendar') && (
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
          </ScrollView>
        )}
      </View>

      {/* Body */}
      {athletes.length === 0 ? (
        <View style={styles.noAthletes}>
          <Text style={styles.noAthletesTitle}>No athletes linked</Text>
          <Text style={styles.noAthletesText}>
            Ask your athlete to sign up for TeamBase first, then you can link to their account.
          </Text>
          <TouchableOpacity style={styles.linkBtn} onPress={() => setActiveTab('profile')}>
            <Text style={styles.linkBtnText}>Link an Athlete</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Feed tab (independent of athlete selection) */}
          {activeTab === 'feed' && school && (
            <View style={{ flex: 1 }}>
              {[...new Set(athletes.map(a => a.schoolId).filter(Boolean))].length > 1 && (
                <View style={styles.feedSchoolToggle}>
                  {[...new Set(athletes.map(a => a.schoolId).filter(Boolean))].map(sid => {
                    const active = (feedSchool || athletes[0]?.schoolId) === sid;
                    return (
                      <TouchableOpacity key={sid} style={[styles.athleteChip, active && styles.athleteChipActive]} onPress={() => setFeedSchool(sid)}>
                        <Text style={[styles.athleteChipText, active && styles.athleteChipTextActive]}>
                          {athletes.find(a => a.schoolId === sid)?.schoolName || sid.slice(0, 8)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              <ChannelList
                key={feedSchool || athletes[0]?.schoolId}
                userData={{ ...userData, schoolId: feedSchool || athletes[0]?.schoolId }}
                school={school}
                embedded
                onClose={() => setActiveTab('home')}
                onUnreadChange={(count) => setUnreadFeedCount(count)}
              />
            </View>
          )}

          {/* Profile tab (independent of athlete selection) */}
          {activeTab === 'profile' && (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: SPACE.xl, paddingBottom: 100 }}>
              <Text style={styles.profileTitle}>Parent Profile</Text>
              <Text style={styles.profileName}>{userData.firstName} {userData.lastName}</Text>
              <Text style={styles.profileEmail}>{userData.email}</Text>

              <Text style={[styles.profileSectionTitle, { marginTop: SPACE.xl }]}>Linked Athletes</Text>
              {athletes.map(a => (
                <View key={a.id} style={styles.linkedAthleteCard}>
                  <View style={[styles.linkedAvatar, { backgroundColor: a.avatarColor || BRAND }]}>
                    <Text style={styles.linkedAvatarText}>{a.firstName?.[0]}{a.lastName?.[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linkedName}>{a.firstName} {a.lastName}</Text>
                    <Text style={styles.linkedSchool}>{school?.name || ''}</Text>
                  </View>
                </View>
              ))}
              <TouchableOpacity style={styles.addAthleteBtn} onPress={() => setActiveTab('addAthlete')}>
                <Ionicons name="add-circle-outline" size={20} color={BRAND} />
                <Text style={styles.addAthleteBtnText}>Link another athlete</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
                <Ionicons name="log-out-outline" size={20} color={STATUS.error} />
                <Text style={styles.signOutText}>Sign out</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* Add athlete overlay */}
          {activeTab === 'addAthlete' && (
            <View style={styles.overlay}>
              <ParentLinkScreen onLinkComplete={() => { setActiveTab('profile'); loadDashboard(); }} />
            </View>
          )}

          {/* Home tab */}
          {activeTab === 'home' && selectedAthlete && (
            <View style={{ flex: 1 }}>
              {upcomingMeets.length > 0 && (
                <TouchableOpacity style={styles.meetsCard} onPress={() => setActiveTab('calendar')}>
                  <Ionicons name="flag" size={18} color={STATUS.error} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.meetsCardTitle}>Next: {upcomingMeets[0].name}</Text>
                    <Text style={styles.meetsCardSub}>
                      {formatMeetDate(upcomingMeets[0].date)}
                      {upcomingMeets[0].location ? ` · ${upcomingMeets[0].location}` : ''}
                      {' · '}{daysUntil(upcomingMeets[0].date)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={NEUTRAL.muted} />
                </TouchableOpacity>
              )}
              <AthleteDetailScreen
                key={selectedAthlete.id}
                athlete={selectedAthlete}
                school={school}
                teamZoneSettings={teamZoneSettings}
                groups={groups}
                parentMode
              />
            </View>
          )}

          {/* Calendar tab */}
          {activeTab === 'calendar' && selectedAthlete && (
            <View style={{ flex: 1 }}>
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
              <CalendarScreen
                userData={{ ...userData, schoolId: selectedAthlete.schoolId }}
                school={school}
                groups={groups}
                externalAthleteRuns={athleteRuns}
                trainingPaces={selectedAthlete.trainingPaces || null}
                onClose={() => setActiveTab('home')}
              />
            </View>
          )}

        </>
      )}

      {/* Bottom nav */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => setActiveTab('home')}>
          <Ionicons name="home-outline" size={24} color={activeTab === 'home' ? BRAND : NEUTRAL.muted} />
          <Text style={[styles.bottomNavLabel, activeTab === 'home' && { color: BRAND }]}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => setActiveTab('calendar')}>
          <Ionicons name="calendar-outline" size={24} color={activeTab === 'calendar' ? BRAND : NEUTRAL.muted} />
          <Text style={[styles.bottomNavLabel, activeTab === 'calendar' && { color: BRAND }]}>Calendar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => setActiveTab('feed')}>
          <View>
            <Ionicons name="chatbubbles-outline" size={24} color={activeTab === 'feed' ? BRAND : NEUTRAL.muted} />
            {unreadFeedCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadFeedCount > 99 ? '99+' : unreadFeedCount}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.bottomNavLabel, activeTab === 'feed' && { color: BRAND }]}>Feed</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => setActiveTab('profile')}>
          <Ionicons name="person-circle-outline" size={24} color={activeTab === 'profile' ? BRAND : NEUTRAL.muted} />
          <Text style={[styles.bottomNavLabel, activeTab === 'profile' && { color: BRAND }]}>Profile</Text>
        </TouchableOpacity>
      </View>
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
  athleteSelector:    { marginTop: SPACE.md },
  athleteChip:        { paddingHorizontal: SPACE.lg - 2, paddingVertical: SPACE.sm, borderRadius: RADIUS.full, backgroundColor: NEUTRAL.bg, marginRight: SPACE.sm, borderWidth: 1.5, borderColor: NEUTRAL.border },
  athleteChipActive:  { backgroundColor: BRAND, borderColor: BRAND },
  athleteChipText:    { color: NEUTRAL.body, fontWeight: FONT_WEIGHT.semibold, fontSize: FONT_SIZE.sm },
  athleteChipTextActive: { color: '#fff' },
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

  feedSchoolToggle:   { flexDirection: 'row', gap: SPACE.sm, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm },

  // Profile tab
  profileTitle:       { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: SPACE.sm },
  profileName:        { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold, color: BRAND_DARK },
  profileEmail:       { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, marginTop: 2 },
  profileSectionTitle:{ fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: SPACE.md },
  linkedAthleteCard:  { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg, marginBottom: SPACE.sm, ...SHADOW.sm },
  linkedAvatar:       { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  linkedAvatarText:   { color: '#fff', fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },
  linkedName:         { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  linkedSchool:       { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, marginTop: 2 },
  addAthleteBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm, paddingVertical: SPACE.lg, marginTop: SPACE.sm },
  addAthleteBtnText:  { fontSize: FONT_SIZE.sm, color: BRAND, fontWeight: FONT_WEIGHT.semibold },
  signOutBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm, paddingVertical: SPACE.lg, marginTop: SPACE.xl, borderTopWidth: 1, borderTopColor: NEUTRAL.border },
  signOutText:        { color: STATUS.error, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },

  // Bottom nav
  bottomNav:          { flexDirection: 'row', backgroundColor: NEUTRAL.card, borderTopWidth: 1, borderTopColor: NEUTRAL.border, paddingBottom: Platform.OS === 'ios' ? SPACE['2xl'] : SPACE.sm, paddingTop: SPACE.md, ...SHADOW.sm },
  bottomNavBtn:       { flex: 1, alignItems: 'center', gap: 2 },
  bottomNavLabel:     { fontSize: 10, color: NEUTRAL.muted },
  badge:              { position: 'absolute', top: -4, right: -8, backgroundColor: STATUS.error, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText:          { color: '#fff', fontSize: 9, fontWeight: FONT_WEIGHT.bold },
  overlay:            { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: NEUTRAL.bg, zIndex: 10 },
});
