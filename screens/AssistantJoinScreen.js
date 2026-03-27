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
  BRAND, BRAND_DARK, BRAND_LIGHT,
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE,
} from '../constants/design';

export default function AssistantJoinScreen({ onJoinComplete }) {
  const [joinCode, setJoinCode] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [activeTab, setActiveTab] = useState('code');
  const [requested, setRequested] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery || searchQuery.length < 3) {
      Alert.alert('Search', 'Please enter at least 3 characters to search.');
      return;
    }
    setSearching(true);
    setSearchResults([]);
    try {
      const q = query(
        collection(db, 'schools'),
        where('name', '>=', searchQuery),
        where('name', '<=', searchQuery + '\uf8ff')
      );
      const snapshot = await getDocs(q);
      const results = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setSearchResults(results);
      if (results.length === 0) {
        Alert.alert('No results', 'No schools found. Try a different search or ask your head coach for the join code.');
      }
    } catch {
      Alert.alert('Error', 'Search failed. Please try again.');
    }
    setSearching(false);
  };

  const handleJoinByCode = async () => {
    if (!joinCode || joinCode.length < 6) {
      Alert.alert('Invalid code', 'Please enter the 6-character join code from your head coach.');
      return;
    }
    setLoading(true);
    try {
      const q = query(collection(db, 'schools'), where('joinCode', '==', joinCode.toUpperCase().trim()));
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        Alert.alert('Code not found', 'That join code was not found. Please check with your head coach.');
        setLoading(false);
        return;
      }
      const schoolDoc = snapshot.docs[0];
      setSelectedSchool({ id: schoolDoc.id, ...schoolDoc.data() });
    } catch {
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
        coachRole: 'assistant',
        requestedAt: new Date(),
      });

      await updateDoc(doc(db, 'schools', school.id), {
        pendingCoachIds: arrayUnion(user.uid),
      });

      setRequested(true);
    } catch {
      Alert.alert('Error', 'Could not send join request. Please try again.');
    }
    setLoading(false);
  };

  if (requested) {
    return (
      <View style={styles.container}>
        <View style={styles.pendingContainer}>
          <View style={styles.pendingIcon}>
            <Text style={{ fontSize: 40 }}>⏳</Text>
          </View>
          <Text style={styles.pendingTitle}>Request Sent!</Text>
          <Text style={styles.pendingDesc}>
            Your request to join {selectedSchool?.name || 'the school'} has been sent to the head coach. You'll have access once they approve you.
          </Text>
          <TouchableOpacity style={styles.pendingBtn} onPress={() => onJoinComplete && onJoinComplete()}>
            <Text style={styles.pendingBtnText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Join Your School</Text>
        <Text style={styles.subtitle}>Connect with your head coach's program as an assistant</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'code' && styles.tabActive]}
          onPress={() => setActiveTab('code')}
        >
          <Text style={[styles.tabText, activeTab === 'code' && styles.tabTextActive]}>Join Code</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'search' && styles.tabActive]}
          onPress={() => setActiveTab('search')}
        >
          <Text style={[styles.tabText, activeTab === 'search' && styles.tabTextActive]}>Search School</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'code' && (
        <View style={styles.section}>
          <Text style={styles.sectionDesc}>
            Ask your head coach for the team's 6-character join code
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

      {activeTab === 'search' && (
        <View style={styles.section}>
          <Text style={styles.sectionDesc}>Search for your school by name</Text>
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
            <SchoolCard key={school.id} school={school} onJoin={() => handleRequestToJoin(school)} loading={loading} />
          ))}
        </View>
      )}

      {selectedSchool && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Found your school!</Text>
          <SchoolCard school={selectedSchool} onJoin={() => handleRequestToJoin(selectedSchool)} loading={loading} />
        </View>
      )}
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
  tabs:          { flexDirection: 'row', backgroundColor: NEUTRAL.border, borderRadius: RADIUS.md, padding: SPACE.xs, marginBottom: SPACE['2xl'] },
  tab:           { flex: 1, paddingVertical: SPACE.md, alignItems: 'center', borderRadius: RADIUS.sm },
  tabActive:     { backgroundColor: NEUTRAL.card },
  tabText:       { fontSize: FONT_SIZE.base, color: NEUTRAL.body, fontWeight: FONT_WEIGHT.medium },
  tabTextActive: { color: BRAND, fontWeight: FONT_WEIGHT.bold },
  section:       { marginBottom: SPACE.lg },
  sectionLabel:  { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: BRAND_DARK, marginBottom: SPACE.md },
  sectionDesc:   { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, marginBottom: SPACE.lg - 2, lineHeight: 20 },
  input:         { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.md, padding: SPACE.lg - 2, fontSize: FONT_SIZE.md, marginBottom: SPACE.md, borderWidth: 1, borderColor: NEUTRAL.input, color: BRAND_DARK },
  codeInput:     { textAlign: 'center', fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, letterSpacing: 4 },
  searchRow:     { flexDirection: 'row', gap: SPACE.md, marginBottom: SPACE.md },
  searchInput:   { flex: 1, marginBottom: 0 },
  searchButton:  { backgroundColor: BRAND, borderRadius: RADIUS.md, paddingHorizontal: SPACE.lg, justifyContent: 'center' },
  searchButtonText: { color: '#fff', fontWeight: FONT_WEIGHT.bold },
  schoolCard:    { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  schoolColorBar:{ flexDirection: 'column', gap: SPACE.xs },
  colorDot:      { width: 20, height: 20, borderRadius: RADIUS.full },
  schoolInfo:    { flex: 1 },
  schoolName:    { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  schoolMascot:  { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, marginTop: 2 },
  schoolLocation:{ fontSize: FONT_SIZE.sm, color: NEUTRAL.muted, marginTop: 2 },
  // Pending approval state
  pendingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACE['2xl'] },
  pendingIcon:   { marginBottom: SPACE.lg },
  pendingTitle:  { fontSize: 22, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: SPACE.md },
  pendingDesc:   { fontSize: FONT_SIZE.base, color: NEUTRAL.body, textAlign: 'center', lineHeight: 22, marginBottom: SPACE.xl },
  pendingBtn:    { backgroundColor: BRAND, borderRadius: RADIUS.md, paddingVertical: SPACE.md, paddingHorizontal: SPACE['2xl'] },
  pendingBtnText:{ color: '#fff', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
});
