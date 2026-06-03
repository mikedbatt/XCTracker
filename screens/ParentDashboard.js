import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, orderBy, query, where } from 'firebase/firestore';
import { useState } from 'react';
import {
  ActivityIndicator, Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SIGNAL } from '../constants/design';
import { auth, db } from '../firebaseConfig';
import { confirmDestructive } from '../utils/confirmDialog';
import AthleteDetailScreen from './AthleteDetailScreen';
import CalendarScreen from './CalendarScreen';
import ChannelList from './ChannelList';
import ParentLinkScreen from './ParentLinkScreen';
import { useStaleRefresh } from '../hooks/useStaleRefresh';

export default function ParentDashboard({ userData }) {
  const [athletes, setAthletes] = useState([]);
  const [selectedAthlete, setSelectedAthlete] = useState(null);
  const [school, setSchool] = useState(null);
  const [teamZoneSettings, setTeamZoneSettings] = useState(null);
  const [groups, setGroups] = useState([]);
  const [athleteRuns, setAthleteRuns] = useState([]);
  const [upcomingMeets, setUpcomingMeets] = useState([]);
  const [activeTab, setActiveTab] = useState('home');
  const [unreadFeedCount, setUnreadFeedCount] = useState(0);
  const [feedSchool, setFeedSchool] = useState(null);

  const loadDashboard = async () => {
    try {
      const parentSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const parentData = parentSnap.exists() ? parentSnap.data() : userData;
      const linkedIds = parentData.linkedAthleteIds || [];

      if (linkedIds.length > 0) {
        const athleteDocs = await Promise.all(
          linkedIds.map(id => getDoc(doc(db, 'users', id)))
        );
        const athleteData = athleteDocs
          .filter(d => d.exists())
          .map(d => ({ id: d.id, ...d.data() }));
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
  };

  // Stale-while-revalidate: first load shows spinner; return-to-dashboard is
  // instant with any refresh running silently in the background.
  const { loading } = useStaleRefresh(loadDashboard, []);

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

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={SIGNAL.color.indigo} /></View>;

  const uniqueSchoolIds = [...new Set(athletes.map(a => a.schoolId).filter(Boolean))];

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Parent view{school?.name ? ` · ${school.name}` : ''}</Text>
        <Text style={styles.greeting}>Hey, {userData.firstName}</Text>

        {/* Athlete switcher chips (only show on athlete-specific tabs) */}
        {athletes.length > 0 && (activeTab === 'home' || activeTab === 'calendar') && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.athleteSelector} contentContainerStyle={{ gap: SIGNAL.space[2] }}>
            {athletes.map((athlete) => {
              const active = selectedAthlete?.id === athlete.id;
              return (
                <TouchableOpacity
                  key={athlete.id}
                  style={[styles.athleteChip, active && styles.athleteChipActive]}
                  onPress={() => handleSwitchAthlete(athlete)}
                >
                  <View style={[styles.athleteChipAvatar, { backgroundColor: athlete.avatarColor || SIGNAL.color.indigo }]}>
                    <Text style={styles.athleteChipAvatarText}>{athlete.firstName?.[0]}{athlete.lastName?.[0]}</Text>
                  </View>
                  <Text style={[styles.athleteChipText, active && styles.athleteChipTextActive]}>
                    {athlete.firstName}
                  </Text>
                </TouchableOpacity>
              );
            })}
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
            <Text style={styles.linkBtnText}>Link an athlete</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Feed tab (independent of athlete selection) */}
          {activeTab === 'feed' && school && (
            <View style={{ flex: 1 }}>
              {uniqueSchoolIds.length > 1 && (
                <View style={styles.feedSchoolToggle}>
                  {uniqueSchoolIds.map(sid => {
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
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: SIGNAL.space.screen, paddingBottom: 120 }}>
              <Text style={styles.profileTitle}>Parent profile</Text>
              <Text style={styles.profileName}>{userData.firstName} {userData.lastName}</Text>
              <Text style={styles.profileEmail}>{userData.email}</Text>

              <Text style={styles.sectionTitle}>Linked athletes</Text>
              {athletes.map(a => (
                <View key={a.id} style={styles.linkedAthleteCard}>
                  <View style={[styles.linkedAvatar, { backgroundColor: a.avatarColor || SIGNAL.color.indigo }]}>
                    <Text style={styles.linkedAvatarText}>{a.firstName?.[0]}{a.lastName?.[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linkedName}>{a.firstName} {a.lastName}</Text>
                    <Text style={styles.linkedSchool}>{school?.name || ''}</Text>
                  </View>
                  <Text style={styles.linkedChevron}>›</Text>
                </View>
              ))}
              <TouchableOpacity style={styles.addAthleteBtn} onPress={() => setActiveTab('addAthlete')}>
                <Ionicons name="add-circle-outline" size={18} color={SIGNAL.color.indigo} />
                <Text style={styles.addAthleteBtnText}>Link another athlete</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
                <Ionicons name="log-out-outline" size={18} color={SIGNAL.color.coral} />
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
              <ScrollView contentContainerStyle={styles.homeScroll}>

                {/* Active athlete summary card */}
                <View style={styles.summaryCard}>
                  <View style={styles.summaryHeader}>
                    <View style={[styles.summaryAvatar, { backgroundColor: selectedAthlete.avatarColor || SIGNAL.color.indigo }]}>
                      <Text style={styles.summaryAvatarText}>
                        {selectedAthlete.firstName?.[0]}{selectedAthlete.lastName?.[0]}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.summaryName}>{selectedAthlete.firstName} {selectedAthlete.lastName}</Text>
                      <Text style={styles.summarySub}>
                        {selectedAthlete.gradYear ? `Class of ${selectedAthlete.gradYear} · ` : ''}{school?.name || 'TeamBase'}
                      </Text>
                    </View>
                  </View>

                  {(() => {
                    const now = new Date();
                    const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7); weekStart.setHours(0, 0, 0, 0);
                    const weekRuns = athleteRuns.filter(r => {
                      const d = r.date?.toDate ? r.date.toDate() : new Date(r.date);
                      return d >= weekStart;
                    });
                    const weekMiles = weekRuns.reduce((sum, r) => sum + (Number(r.miles) || 0), 0);
                    const easyRuns = weekRuns.filter(r => (r.effort || 0) <= 4).length;
                    const easyPct = weekRuns.length > 0 ? Math.round((easyRuns / weekRuns.length) * 100) : 0;
                    const lastRun = athleteRuns[0];
                    const lastDate = lastRun?.date?.toDate ? lastRun.date.toDate() : (lastRun?.date ? new Date(lastRun.date) : null);
                    const lastLabel = lastDate ? lastDate.toLocaleDateString('en-US', { weekday: 'short' }) : '—';
                    return (
                      <>
                        <View style={styles.statsRow}>
                          <View style={styles.statPill}>
                            <Text style={styles.statValue}>{weekMiles.toFixed(1)}</Text>
                            <Text style={styles.statLabel}>MI THIS WEEK</Text>
                          </View>
                          <View style={styles.statPill}>
                            <Text style={[styles.statValue, { color: easyPct >= 70 ? SIGNAL.color.emerald : SIGNAL.color.amber }]}>{easyPct}%</Text>
                            <Text style={styles.statLabel}>EASY MIX</Text>
                          </View>
                          <View style={styles.statPill}>
                            <Text style={styles.statValue}>{weekRuns.length}</Text>
                            <Text style={styles.statLabel}>RUNS</Text>
                          </View>
                        </View>
                        {lastRun && (
                          <View style={styles.lastActivity}>
                            <Text style={styles.lastActivityDot}>● </Text>
                            <Text style={styles.lastActivityText}>
                              Last activity: {(Number(lastRun.distance) || 0).toFixed(1)} mi · {lastLabel}
                            </Text>
                          </View>
                        )}
                      </>
                    );
                  })()}
                </View>

                {/* Upcoming meets card */}
                {upcomingMeets.length > 0 && (
                  <>
                    <Text style={styles.eyebrowSection}>Upcoming meets</Text>
                    <TouchableOpacity onPress={() => setActiveTab('calendar')}>
                      <View style={styles.meetsCard}>
                        <View style={styles.meetsAccent} />
                        <View style={{ flex: 1, paddingVertical: SIGNAL.space.card, paddingHorizontal: SIGNAL.space.card }}>
                          <Text style={styles.meetsDate}>{formatMeetDate(upcomingMeets[0].date)}</Text>
                          <Text style={styles.meetsName}>{upcomingMeets[0].name}</Text>
                          <Text style={styles.meetsSub}>
                            {upcomingMeets[0].location ? `${upcomingMeets[0].location} · ` : ''}{daysUntil(upcomingMeets[0].date)}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={SIGNAL.color.mute2} style={{ marginRight: SIGNAL.space.card }} />
                      </View>
                    </TouchableOpacity>
                  </>
                )}

                {/* Coach feed glimpse */}
                <Text style={styles.eyebrowSection}>From the coach</Text>
                <TouchableOpacity style={styles.feedCard} onPress={() => setActiveTab('feed')}>
                  <View style={styles.feedHeader}>
                    <Text style={styles.feedAuthor}>Team feed</Text>
                    <Text style={styles.feedDate}>Tap to open</Text>
                  </View>
                  <Text style={styles.feedBody}>
                    Stay current with practice plans, race-day logistics, and notes from the coaching staff.
                  </Text>
                </TouchableOpacity>

                {/* Linked athletes */}
                {athletes.length > 1 && (
                  <>
                    <Text style={styles.eyebrowSection}>Linked athletes</Text>
                    {athletes.map(a => (
                      <TouchableOpacity key={a.id} style={styles.linkedAthleteCard} onPress={() => handleSwitchAthlete(a)}>
                        <View style={[styles.linkedAvatar, { backgroundColor: a.avatarColor || SIGNAL.color.indigo }]}>
                          <Text style={styles.linkedAvatarText}>{a.firstName?.[0]}{a.lastName?.[0]}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.linkedName}>{a.firstName} {a.lastName}</Text>
                          <Text style={styles.linkedSchool}>{a.schoolName || school?.name || ''}</Text>
                        </View>
                        <Text style={styles.linkedChevron}>›</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={styles.addAthleteBtn} onPress={() => setActiveTab('addAthlete')}>
                      <Ionicons name="add-circle-outline" size={18} color={SIGNAL.color.indigo} />
                      <Text style={styles.addAthleteBtnText}>Link another athlete</Text>
                    </TouchableOpacity>
                  </>
                )}

                {/* Full athlete detail underneath */}
                <View style={{ marginTop: SIGNAL.space[6], minHeight: 400 }}>
                  <AthleteDetailScreen
                    key={selectedAthlete.id}
                    athlete={selectedAthlete}
                    school={school}
                    teamZoneSettings={teamZoneSettings}
                    groups={groups}
                    parentMode
                  />
                </View>
              </ScrollView>
            </View>
          )}

          {/* Calendar tab */}
          {activeTab === 'calendar' && selectedAthlete && (
            <View style={{ flex: 1 }}>
              {upcomingMeets.length > 0 && (
                <View style={styles.meetsSection}>
                  <Text style={styles.eyebrowSection}>Upcoming meets</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: SIGNAL.space.screen, gap: SIGNAL.space[3] }}>
                    {upcomingMeets.map(meet => (
                      <View key={meet.id} style={styles.meetCard}>
                        <View style={styles.meetCardAccent} />
                        <View style={{ padding: SIGNAL.space.card, flex: 1 }}>
                          <Text style={styles.meetCardDate}>{formatMeetDate(meet.date)}</Text>
                          <Text style={styles.meetCardName}>{meet.name}</Text>
                          {meet.location && <Text style={styles.meetCardLocation}>{meet.location}</Text>}
                          <Text style={styles.meetCardDays}>{daysUntil(meet.date)}</Text>
                        </View>
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
        {[
          { key: 'home',     icon: 'home-outline',        label: 'Home' },
          { key: 'calendar', icon: 'calendar-outline',    label: 'Calendar' },
          { key: 'feed',     icon: 'chatbubbles-outline', label: 'Feed', badge: unreadFeedCount },
          { key: 'profile',  icon: 'person-circle-outline', label: 'Profile' },
        ].map(item => {
          const active = activeTab === item.key;
          return (
            <TouchableOpacity key={item.key} style={styles.bottomNavBtn} onPress={() => setActiveTab(item.key)}>
              <View>
                <Ionicons name={item.icon} size={22} color={active ? SIGNAL.color.indigo : SIGNAL.color.mute2} />
                {item.badge > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.badge > 99 ? '99+' : item.badge}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.bottomNavLabel, active && { color: SIGNAL.color.indigo, fontFamily: SIGNAL.font.bodySemi }]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: SIGNAL.color.paper2 },
  loading:            { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: SIGNAL.color.paper2 },

  // Header
  header:             {
    backgroundColor: SIGNAL.color.white,
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: SIGNAL.space[4],
    paddingHorizontal: SIGNAL.space.screen,
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  eyebrow:            { ...SIGNAL.style.eyebrow },
  greeting:           {
    fontFamily: SIGNAL.font.display,
    fontSize: 29,
    lineHeight: 32,
    color: SIGNAL.color.indigo,
    marginTop: 4,
    letterSpacing: SIGNAL.letter.titleTight,
  },

  // Athlete switcher chips
  athleteSelector:    { marginTop: SIGNAL.space[4] },
  athleteChip:        {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIGNAL.space[2],
    paddingHorizontal: SIGNAL.space[4],
    paddingVertical: SIGNAL.space[2],
    borderRadius: SIGNAL.radius.chip,
    backgroundColor: SIGNAL.color.white,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  athleteChipActive:  { backgroundColor: SIGNAL.color.indigo, borderColor: SIGNAL.color.indigo },
  athleteChipAvatar:  { width: 20, height: 20, borderRadius: SIGNAL.radius.chip, alignItems: 'center', justifyContent: 'center' },
  athleteChipAvatarText: { color: '#fff', fontSize: 9, fontFamily: SIGNAL.font.bodyBold },
  athleteChipText:    { color: SIGNAL.color.inkSoft, fontFamily: SIGNAL.font.bodySemi, fontSize: 13 },
  athleteChipTextActive: { color: '#fff' },

  // Empty state
  noAthletes:         { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SIGNAL.space[8] },
  noAthletesTitle:    {
    fontFamily: SIGNAL.font.display,
    fontSize: SIGNAL.size.title,
    color: SIGNAL.color.indigo,
    marginBottom: SIGNAL.space[4],
    letterSpacing: SIGNAL.letter.titleTight,
  },
  noAthletesText:     {
    fontFamily: SIGNAL.font.body,
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.mute,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SIGNAL.space[6],
  },
  linkBtn:            {
    backgroundColor: SIGNAL.color.indigo,
    borderRadius: SIGNAL.radius.button,
    paddingVertical: SIGNAL.space[4],
    paddingHorizontal: SIGNAL.space[8],
  },
  linkBtnText:        { color: '#fff', fontFamily: SIGNAL.font.bodyBold, fontSize: SIGNAL.size.bodyLg },

  // Home scroll content
  homeScroll:         { padding: SIGNAL.space.screen, paddingBottom: 120, gap: SIGNAL.space[4] },

  eyebrowSection:     { ...SIGNAL.style.eyebrow, marginTop: SIGNAL.space[2], marginBottom: SIGNAL.space[2] },
  sectionTitle:       {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: SIGNAL.size.heading,
    color: SIGNAL.color.indigo,
    marginTop: SIGNAL.space[6],
    marginBottom: SIGNAL.space[3],
  },

  // Summary card
  summaryCard:        {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: SIGNAL.space.card,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  summaryHeader:      { flexDirection: 'row', alignItems: 'center', gap: SIGNAL.space[4], marginBottom: SIGNAL.space[5] },
  summaryAvatar:      { width: 46, height: 46, borderRadius: SIGNAL.radius.chip, alignItems: 'center', justifyContent: 'center' },
  summaryAvatarText:  { color: '#fff', fontSize: 16, fontFamily: SIGNAL.font.bodyBold },
  summaryName:        { fontFamily: SIGNAL.font.bodyBold, fontSize: SIGNAL.size.bodyLg, color: SIGNAL.color.ink },
  summarySub:         { fontFamily: SIGNAL.font.body, fontSize: 12, color: SIGNAL.color.mute, marginTop: 2 },

  statsRow:           { flexDirection: 'row', gap: SIGNAL.space[3] },
  statPill:           {
    flex: 1,
    paddingVertical: SIGNAL.space[4],
    paddingHorizontal: SIGNAL.space[3],
    borderRadius: 11,
    backgroundColor: SIGNAL.color.paper2,
    alignItems: 'center',
  },
  statValue:          {
    fontFamily: SIGNAL.font.mono,
    fontSize: 22,
    color: SIGNAL.color.ink,
    letterSpacing: -0.5,
  },
  statLabel:          {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 9.5,
    color: SIGNAL.color.mute,
    marginTop: 2,
    letterSpacing: 1.0,
  },

  lastActivity:       {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SIGNAL.space[4],
    padding: SIGNAL.space[3],
    borderRadius: 10,
    backgroundColor: SIGNAL.color.emerald + SIGNAL.tint.chip,
  },
  lastActivityDot:    { color: SIGNAL.color.emerald, fontFamily: SIGNAL.font.bodyBold, fontSize: 12 },
  lastActivityText:   { color: SIGNAL.color.inkSoft, fontFamily: SIGNAL.font.body, fontSize: 12, flex: 1 },

  // Upcoming meets — single (home)
  meetsCard:          {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    overflow: 'hidden',
  },
  meetsAccent:        { width: 4, alignSelf: 'stretch', backgroundColor: SIGNAL.color.pink },
  meetsDate:          { fontFamily: SIGNAL.font.bodySemi, fontSize: 10.5, color: SIGNAL.color.mute, letterSpacing: 0.5 },
  meetsName:          { fontFamily: SIGNAL.font.bodyBold, fontSize: 14, color: SIGNAL.color.ink, marginTop: 3 },
  meetsSub:           { fontFamily: SIGNAL.font.body, fontSize: 11.5, color: SIGNAL.color.mute, marginTop: 2 },

  // Meets section (calendar)
  meetsSection:       { paddingHorizontal: SIGNAL.space.screen, paddingTop: SIGNAL.space[4], paddingBottom: SIGNAL.space[2] },
  meetCard:           {
    flexDirection: 'row',
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    width: 200,
    overflow: 'hidden',
  },
  meetCardAccent:     { width: 4, backgroundColor: SIGNAL.color.pink },
  meetCardDate:       { fontFamily: SIGNAL.font.bodySemi, fontSize: 10.5, color: SIGNAL.color.mute, letterSpacing: 0.5 },
  meetCardName:       { fontFamily: SIGNAL.font.bodyBold, fontSize: 14, color: SIGNAL.color.ink, marginTop: SIGNAL.space[1] },
  meetCardLocation:   { fontFamily: SIGNAL.font.body, fontSize: 12, color: SIGNAL.color.mute, marginTop: SIGNAL.space[1] },
  meetCardDays:       { fontFamily: SIGNAL.font.bodySemi, fontSize: 11, color: SIGNAL.color.pink, marginTop: SIGNAL.space[2] },

  feedSchoolToggle:   { flexDirection: 'row', gap: SIGNAL.space[2], paddingHorizontal: SIGNAL.space.screen, paddingVertical: SIGNAL.space[2] },

  // Feed glimpse card
  feedCard:           {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: SIGNAL.space.card,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  feedHeader:         { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SIGNAL.space[2] },
  feedAuthor:         { fontFamily: SIGNAL.font.bodyBold, fontSize: 12, color: SIGNAL.color.indigo },
  feedDate:           { fontFamily: SIGNAL.font.body, fontSize: 11, color: SIGNAL.color.mute2 },
  feedBody:           { fontFamily: SIGNAL.font.body, fontSize: 13.5, color: SIGNAL.color.inkSoft, lineHeight: 20 },

  // Profile tab
  profileTitle:       {
    fontFamily: SIGNAL.font.display,
    fontSize: SIGNAL.size.title,
    color: SIGNAL.color.indigo,
    marginBottom: SIGNAL.space[2],
    letterSpacing: SIGNAL.letter.titleTight,
  },
  profileName:        { fontFamily: SIGNAL.font.bodySemi, fontSize: SIGNAL.size.bodyLg, color: SIGNAL.color.ink },
  profileEmail:       { fontFamily: SIGNAL.font.body, fontSize: 13, color: SIGNAL.color.mute, marginTop: 2 },

  linkedAthleteCard:  {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIGNAL.space[3],
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: SIGNAL.space[4],
    marginBottom: SIGNAL.space[2],
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  linkedAvatar:       { width: 36, height: 36, borderRadius: SIGNAL.radius.chip, alignItems: 'center', justifyContent: 'center' },
  linkedAvatarText:   { color: '#fff', fontFamily: SIGNAL.font.bodyBold, fontSize: 12 },
  linkedName:         { fontFamily: SIGNAL.font.bodySemi, fontSize: 14, color: SIGNAL.color.ink },
  linkedSchool:       { fontFamily: SIGNAL.font.body, fontSize: 11, color: SIGNAL.color.mute, marginTop: 1 },
  linkedChevron:      { color: SIGNAL.color.mute2, fontSize: 20 },

  addAthleteBtn:      {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SIGNAL.space[2],
    paddingVertical: SIGNAL.space[4],
    marginTop: SIGNAL.space[2],
  },
  addAthleteBtnText:  { fontFamily: SIGNAL.font.bodySemi, fontSize: 13, color: SIGNAL.color.indigo },

  signOutBtn:         {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SIGNAL.space[2],
    paddingVertical: SIGNAL.space[4],
    marginTop: SIGNAL.space[6],
    borderTopWidth: 1,
    borderTopColor: SIGNAL.color.line,
  },
  signOutText:        { color: SIGNAL.color.coral, fontFamily: SIGNAL.font.bodySemi, fontSize: 13 },

  // Bottom nav
  bottomNav:          {
    flexDirection: 'row',
    backgroundColor: SIGNAL.color.white,
    borderTopWidth: 1,
    borderTopColor: SIGNAL.color.line,
    paddingBottom: Platform.OS === 'ios' ? 24 : SIGNAL.space[2],
    paddingTop: SIGNAL.space[3],
  },
  bottomNavBtn:       { flex: 1, alignItems: 'center', gap: 3 },
  bottomNavLabel:     { fontFamily: SIGNAL.font.body, fontSize: 10, color: SIGNAL.color.mute2 },

  badge:              {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: SIGNAL.color.coral,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText:          { color: '#fff', fontSize: 9, fontFamily: SIGNAL.font.bodyBold },

  overlay:            {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: SIGNAL.color.paper2,
    zIndex: 10,
  },
});
