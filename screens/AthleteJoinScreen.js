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

export default function AthleteJoinScreen({ onJoinComplete }) {
  const [joinCode, setJoinCode] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [activeTab, setActiveTab] = useState('code'); // 'code' or 'search'

  // Search schools by name
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
      setSearchResults(results);
      if (results.length === 0) {
        Alert.alert('No results', 'No schools found. Try a different search or ask your coach for the join code.');
      }
    } catch (error) {
      Alert.alert('Error', 'Search failed. Please try again.');
    }
    setSearching(false);
  };

  // Join by code
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
      setSelectedSchool({ id: schoolDoc.id, ...schoolDoc.data() });
    } catch (error) {
      Alert.alert('Error', 'Could not find that join code. Please try again.');
    }
    setLoading(false);
  };

  // Send join request to a school
  const handleRequestToJoin = async (school) => {
    setLoading(true);
    try {
      const user = auth.currentUser;

      // Update athlete's user document
      await updateDoc(doc(db, 'users', user.uid), {
        schoolId: school.id,
        status: 'pending',
        requestedAt: new Date(),
      });

      // Add athlete to school's pending list
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
            placeholderTextColor="#999"
            value={joinCode}
            onChangeText={setJoinCode}
            autoCapitalize="characters"
            maxLength={8}
          />
          <TouchableOpacity style={styles.primaryButton} onPress={handleJoinByCode} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : (
              <Text style={styles.primaryButtonText}>Find My School</Text>
            )}
          </TouchableOpacity>
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
              placeholderTextColor="#999"
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

          {/* Search results */}
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

      {/* Skip option */}
      <TouchableOpacity
        style={styles.skipButton}
        onPress={() => onJoinComplete && onJoinComplete()}
      >
        <Text style={styles.skipText}>Skip for now — I'll join a school later</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

// School card component
function SchoolCard({ school, onJoin, loading }) {
  return (
    <View style={styles.schoolCard}>
      <View style={styles.schoolColorBar}>
        <View style={[styles.colorDot, { backgroundColor: school.primaryColor || '#2e7d32' }]} />
        <View style={[styles.colorDot, { backgroundColor: school.secondaryColor || '#fff', borderWidth: 1, borderColor: '#ddd' }]} />
      </View>
      <View style={styles.schoolInfo}>
        <Text style={styles.schoolName}>{school.name}</Text>
        {school.mascot ? <Text style={styles.schoolMascot}>{school.mascot}</Text> : null}
        <Text style={styles.schoolLocation}>{school.city}, {school.state}</Text>
      </View>
      <TouchableOpacity style={styles.joinButton} onPress={onJoin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" size="small" /> : (
          <Text style={styles.joinButtonText}>Request to Join</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 24, paddingBottom: 48 },
  header: { marginBottom: 24, marginTop: 20 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#2e7d32' },
  subtitle: { fontSize: 15, color: '#666', marginTop: 6 },
  tabs: {
    flexDirection: 'row', backgroundColor: '#e0e0e0',
    borderRadius: 10, padding: 4, marginBottom: 24,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#fff' },
  tabText: { fontSize: 15, color: '#666', fontWeight: '500' },
  tabTextActive: { color: '#2e7d32', fontWeight: '700' },
  section: { marginBottom: 16 },
  sectionLabel: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 10 },
  sectionDesc: { fontSize: 14, color: '#666', marginBottom: 14, lineHeight: 20 },
  input: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    fontSize: 16, marginBottom: 12, borderWidth: 1, borderColor: '#ddd', color: '#333',
  },
  codeInput: { textAlign: 'center', fontSize: 22, fontWeight: '700', letterSpacing: 4 },
  searchRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  searchInput: { flex: 1, marginBottom: 0 },
  searchButton: {
    backgroundColor: '#2e7d32', borderRadius: 10,
    paddingHorizontal: 16, justifyContent: 'center',
  },
  searchButtonText: { color: '#fff', fontWeight: '700' },
  primaryButton: {
    backgroundColor: '#2e7d32', borderRadius: 10, padding: 16, alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  schoolCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#ddd', flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  schoolColorBar: { flexDirection: 'column', gap: 4 },
  colorDot: { width: 20, height: 20, borderRadius: 10 },
  schoolInfo: { flex: 1 },
  schoolName: { fontSize: 16, fontWeight: '700', color: '#333' },
  schoolMascot: { fontSize: 13, color: '#666', marginTop: 2 },
  schoolLocation: { fontSize: 13, color: '#999', marginTop: 2 },
  joinButton: {
    backgroundColor: '#2e7d32', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  joinButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  skipButton: { marginTop: 20, alignItems: 'center' },
  skipText: { color: '#999', fontSize: 14 },
});