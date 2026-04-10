import {
    arrayUnion,
    collection,
    doc,
    getDocs,
    query,
    updateDoc,
    where,
} from 'firebase/firestore';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert, ScrollView,
    StyleSheet,
    Text, TextInput, TouchableOpacity,
    View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';
import Button from '../components/Button';
import Card from '../components/Card';
import {
  BRAND, BRAND_ACCENT, BRAND_DARK, BRAND_LIGHT,
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE,
} from '../constants/design';

export default function AthleteJoinScreen({ onJoinComplete, onSkip }) {
  const [joinCode, setJoinCode] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [activeTab, setActiveTab] = useState('code');

  // Look up the head coach (admin_coach) for a school so the search results
  // can show "Coach: Jane Doe" alongside each school. Helps disambiguate
  // when multiple schools share the same name (e.g. two Davis High Schools).
  // Returns null if no head coach found or on error — never throws.
  const loadHeadCoachName = async (schoolId) => {
    try {
      const snap = await getDocs(query(
        collection(db, 'users'),
        where('schoolId', '==', schoolId),
        where('role', '==', 'admin_coach')
      ));
      if (snap.empty) return null;
      const c = snap.docs[0].data();
      const name = `${c.firstName || ''} ${c.lastName || ''}`.trim();
      return name || null;
    } catch (e) {
      console.warn('Head coach lookup failed for', schoolId, e);
      return null;
    }
  };

  const handleSearch = async () => {
    if (!searchQuery || searchQuery.length < 3) {
      Alert.alert('Search', 'Please enter at least 3 characters to search.');
      return;
    }
    setSearching(true);
    setSearchResults([]);
    try {
      const schoolsRef = collection(db, 'schools');
      const q = query(
        schoolsRef,
        where('name', '>=', searchQuery),
        where('name', '<=', searchQuery + '\uf8ff')
      );
      const snapshot = await getDocs(q);
      const results = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

      // Decorate each result with its head coach's name in parallel.
      const enriched = await Promise.all(results.map(async (s) => ({
        ...s,
        headCoachName: await loadHeadCoachName(s.id),
      })));

      setSearchResults(enriched);
      if (enriched.length === 0) {
        Alert.alert('No results', 'No schools found. Try a different search or ask your coach for the join code.');
      }
    } catch (error) {
      Alert.alert('Error', 'Search failed. Please try again.');
    }
    setSearching(false);
  };

  const handleJoinByCode = async () => {
    if (!joinCode || joinCode.length < 6) {
      Alert.alert('Invalid code', 'Please enter the 6-character join code from your coach.');
      return;
    }
    setLoading(true);
    try {
      const schoolsRef = collection(db, 'schools');
      const q = query(schoolsRef, where('joinCode', '==', joinCode.toUpperCase().trim()));
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        Alert.alert('Code not found', 'That join code was not found. Please check with your coach.');
        setLoading(false);
        return;
      }
      const schoolDoc = snapshot.docs[0];
      const school = { id: schoolDoc.id, ...schoolDoc.data() };
      school.headCoachName = await loadHeadCoachName(school.id);
      setSelectedSchool(school);
    } catch (error) {
      Alert.alert('Error', 'Could not find that join code. Please try again.');
    }
    setLoading(false);
  };

  const handleRequestToJoin = async (school) => {
    setLoading(true);
    try {
      const user = auth.currentUser;

      await updateDoc(doc(db, 'users', user.uid), {
        schoolId: school.id,
        status: 'pending',
        requestedAt: new Date(),
      });

      await updateDoc(doc(db, 'schools', school.id), {
        pendingAthleteIds: arrayUnion(user.uid),
      });

      Alert.alert(
        'Request Sent!',
        `Your request to join ${school.name} has been sent to the coach. You'll be notified when approved!\n\nIn the meantime, you can start logging your runs.`,
        [{ text: 'Start Logging!', onPress: () => onJoinComplete && onJoinComplete() }]
      );
    } catch (error) {
      Alert.alert('Error', 'Could not send join request. Please try again.');
    }
    setLoading(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      <View style={styles.header}>
        <Text style={styles.title}>Find Your School</Text>
        <Text style={styles.subtitle}>Join your cross country program</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'code' && styles.tabActive]}
          onPress={() => setActiveTab('code')}
        >
          <Text style={[styles.tabText, activeTab === 'code' && styles.tabTextActive]}>
            Join Code
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'search' && styles.tabActive]}
          onPress={() => setActiveTab('search')}
        >
          <Text style={[styles.tabText, activeTab === 'search' && styles.tabTextActive]}>
            Search School
          </Text>
        </TouchableOpacity>
      </View>

      {/* Join by code */}
      {activeTab === 'code' && (
        <View style={styles.section}>
          <Text style={styles.sectionDesc}>
            Ask your coach for your team's 6-character join code
          </Text>
          <TextInput
            style={[styles.input, styles.codeInput]}
            placeholder="Enter code (e.g. BHS2025)"
            placeholderTextColor={NEUTRAL.muted}
            value={joinCode}
            onChangeText={setJoinCode}
            autoCapitalize="characters"
            maxLength={8}
          />
          <Button label="Find My School" onPress={handleJoinByCode} loading={loading} size="lg" />
        </View>
      )}

      {/* Search by name */}
      {activeTab === 'search' && (
        <View style={styles.section}>
          <Text style={styles.sectionDesc}>
            Search for your school by name
          </Text>
          <View style={styles.searchRow}>
            <TextInput
              style={[styles.input, styles.searchInput]}
              placeholder="School name..."
              placeholderTextColor={NEUTRAL.muted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="words"
            />
            <TouchableOpacity style={styles.searchButton} onPress={handleSearch} disabled={searching}>
              {searching ? <ActivityIndicator color="#fff" size="small" /> : (
                <Text style={styles.searchButtonText}>Search</Text>
              )}
            </TouchableOpacity>
          </View>

          {searchResults.map((school) => (
            <SchoolCard
              key={school.id}
              school={school}
              onJoin={() => handleRequestToJoin(school)}
              loading={loading}
            />
          ))}
        </View>
      )}

      {/* Selected school confirmation */}
      {selectedSchool && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Found your school!</Text>
          <SchoolCard
            school={selectedSchool}
            onJoin={() => handleRequestToJoin(selectedSchool)}
            loading={loading}
          />
        </View>
      )}

      {/* Skip option — drops the athlete into the dashboard without a
          school. Uses the dedicated onSkip path so AppNavigator's
          refreshUser doesn't immediately re-route back here. */}
      <TouchableOpacity
        style={styles.skipButton}
        onPress={() => (onSkip || onJoinComplete)?.()}
      >
        <Text style={styles.skipText}>Skip for now — I'll join a school later</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

function SchoolCard({ school, onJoin, loading }) {
  return (
    <Card style={styles.schoolCard}>
      <View style={styles.schoolColorBar}>
        <View style={[styles.colorDot, { backgroundColor: school.primaryColor || BRAND }]} />
        <View style={[styles.colorDot, { backgroundColor: school.secondaryColor || '#fff', borderWidth: 1, borderColor: NEUTRAL.border }]} />
      </View>
      <View style={styles.schoolInfo}>
        <Text style={styles.schoolName}>{school.name}</Text>
        {school.mascot ? <Text style={styles.schoolMascot}>{school.mascot}</Text> : null}
        <Text style={styles.schoolLocation}>{school.city}, {school.state}</Text>
        {school.headCoachName ? (
          <Text style={styles.schoolCoach}>Coach: {school.headCoachName}</Text>
        ) : null}
      </View>
      <Button label="Request to Join" onPress={onJoin} loading={loading} size="sm" />
    </Card>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: NEUTRAL.bg },
  content:       { padding: SPACE['2xl'], paddingBottom: SPACE['4xl'] },
  header:        { marginBottom: SPACE['2xl'], marginTop: SPACE.xl },
  title:         { fontSize: 26, fontWeight: FONT_WEIGHT.bold, color: BRAND },
  subtitle:      { fontSize: FONT_SIZE.base, color: NEUTRAL.body, marginTop: SPACE.sm },
  tabs: {
    flexDirection: 'row', backgroundColor: NEUTRAL.border,
    borderRadius: RADIUS.md, padding: SPACE.xs, marginBottom: SPACE['2xl'],
  },
  tab:           { flex: 1, paddingVertical: SPACE.md, alignItems: 'center', borderRadius: RADIUS.sm },
  tabActive:     { backgroundColor: NEUTRAL.card },
  tabText:       { fontSize: FONT_SIZE.base, color: NEUTRAL.body, fontWeight: FONT_WEIGHT.medium },
  tabTextActive: { color: BRAND, fontWeight: FONT_WEIGHT.bold },
  section:       { marginBottom: SPACE.lg },
  sectionLabel:  { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: BRAND_DARK, marginBottom: SPACE.md },
  sectionDesc:   { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, marginBottom: SPACE.lg - 2, lineHeight: 20 },
  input: {
    backgroundColor: NEUTRAL.card, borderRadius: RADIUS.md, padding: SPACE.lg - 2,
    fontSize: FONT_SIZE.md, marginBottom: SPACE.md, borderWidth: 1, borderColor: NEUTRAL.input, color: BRAND_DARK,
  },
  codeInput:     { textAlign: 'center', fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, letterSpacing: 4 },
  searchRow:     { flexDirection: 'row', gap: SPACE.md, marginBottom: SPACE.md },
  searchInput:   { flex: 1, marginBottom: 0 },
  searchButton: {
    backgroundColor: BRAND, borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.lg, justifyContent: 'center',
  },
  searchButtonText: { color: '#fff', fontWeight: FONT_WEIGHT.bold },
  schoolCard:    { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  schoolColorBar: { flexDirection: 'column', gap: SPACE.xs },
  colorDot:      { width: 20, height: 20, borderRadius: RADIUS.full },
  schoolInfo:    { flex: 1 },
  schoolName:    { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  schoolMascot:  { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, marginTop: 2 },
  schoolLocation: { fontSize: FONT_SIZE.sm, color: NEUTRAL.muted, marginTop: 2 },
  schoolCoach:    { fontSize: FONT_SIZE.sm, color: BRAND, fontWeight: FONT_WEIGHT.semibold, marginTop: 2 },
  skipButton:    { marginTop: SPACE.xl, alignItems: 'center' },
  skipText:      { color: NEUTRAL.muted, fontSize: FONT_SIZE.sm },
});
