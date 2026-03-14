import { arrayUnion, collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert, ScrollView,
    StyleSheet,
    Text, TextInput, TouchableOpacity,
    View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';

export default function ParentLinkScreen({ onLinkComplete }) {
  const [athleteEmail, setAthleteEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [foundAthlete, setFoundAthlete] = useState(null);

  const handleFindAthlete = async () => {
    if (!athleteEmail) {
      Alert.alert('Missing info', 'Please enter your athlete\'s email address.');
      return;
    }
    setLoading(true);
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', athleteEmail.toLowerCase().trim()), where('role', '==', 'athlete'));
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        Alert.alert('Not found', 'No athlete account found with that email. Make sure your athlete has already signed up for XCTracker.');
        setLoading(false);
        return;
      }
      const athleteDoc = snapshot.docs[0];
      setFoundAthlete({ id: athleteDoc.id, ...athleteDoc.data() });
    } catch (error) {
      Alert.alert('Error', 'Could not search for athlete. Please try again.');
    }
    setLoading(false);
  };

  const handleLinkToAthlete = async () => {
    if (!foundAthlete) return;
    setLoading(true);
    try {
      const user = auth.currentUser;

      // Update parent's document with linked athlete
      await updateDoc(doc(db, 'users', user.uid), {
        linkedAthleteIds: arrayUnion(foundAthlete.id),
        schoolId: foundAthlete.schoolId || null,
        status: 'approved',
      });

      // Add parent to athlete's PENDING list so athlete can approve
      await updateDoc(doc(db, 'users', foundAthlete.id), {
        pendingParentIds: arrayUnion(user.uid),
      });

      Alert.alert(
        'Request Sent!',
        `A follow request has been sent to ${foundAthlete.firstName}. Once they approve it, you'll be able to see their training calendar and mileage.`,
        [{ text: 'Got it!', onPress: () => onLinkComplete && onLinkComplete() }]
      );
    } catch (error) {
      Alert.alert('Error', 'Could not link accounts. Please try again.');
    }
    setLoading(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      <View style={styles.header}>
        <Text style={styles.title}>Link to Your Athlete</Text>
        <Text style={styles.subtitle}>Stay connected to your athlete's training</Text>
      </View>

      {/* What parents can see */}
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>As a parent you can see:</Text>
        <Text style={styles.infoItem}>📅  Upcoming races and workouts</Text>
        <Text style={styles.infoItem}>📍  Race locations and times</Text>
        <Text style={styles.infoItem}>🏃  Your athlete's weekly mileage</Text>
        <Text style={styles.infoItem}>📋  Coach notes and announcements</Text>
      </View>

      {/* Find athlete */}
      <Text style={styles.label}>Your athlete's email address</Text>
      <TextInput
        style={styles.input}
        placeholder="athlete@email.com"
        placeholderTextColor="#999"
        value={athleteEmail}
        onChangeText={setAthleteEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <TouchableOpacity style={styles.primaryButton} onPress={handleFindAthlete} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : (
          <Text style={styles.primaryButtonText}>Find Athlete</Text>
        )}
      </TouchableOpacity>

      {/* Found athlete confirmation */}
      {foundAthlete && (
        <View style={styles.athleteCard}>
          <View style={styles.athleteAvatar}>
            <Text style={styles.avatarText}>
              {foundAthlete.firstName?.[0]}{foundAthlete.lastName?.[0]}
            </Text>
          </View>
          <View style={styles.athleteInfo}>
            <Text style={styles.athleteName}>
              {foundAthlete.firstName} {foundAthlete.lastName}
            </Text>
            <Text style={styles.athleteEmail}>{foundAthlete.email}</Text>
          </View>
          <TouchableOpacity style={styles.linkButton} onPress={handleLinkToAthlete} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" size="small" /> : (
              <Text style={styles.linkButtonText}>Link</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Privacy note */}
      <View style={styles.privacyBox}>
        <Text style={styles.privacyTitle}>Privacy note</Text>
        <Text style={styles.privacyText}>
          Parents have read-only access. You can view your athlete's schedule and mileage
          but cannot see other athletes' data. Your athlete will be notified that you have
          linked to their account.
        </Text>
      </View>

      {/* Skip */}
      <TouchableOpacity style={styles.skipButton} onPress={() => onLinkComplete && onLinkComplete()}>
        <Text style={styles.skipText}>Skip for now — I'll link an athlete later</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 24, paddingBottom: 48 },
  header: { marginBottom: 24, marginTop: 20 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#2e7d32' },
  subtitle: { fontSize: 15, color: '#666', marginTop: 6 },
  infoBox: {
    backgroundColor: '#e8f5e9', borderRadius: 12, padding: 16,
    marginBottom: 24, borderLeftWidth: 4, borderLeftColor: '#2e7d32',
  },
  infoTitle: { fontWeight: '700', color: '#2e7d32', marginBottom: 10, fontSize: 15 },
  infoItem: { fontSize: 14, color: '#444', marginBottom: 6, lineHeight: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#444', marginBottom: 8 },
  input: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    fontSize: 16, marginBottom: 14, borderWidth: 1, borderColor: '#ddd', color: '#333',
  },
  primaryButton: {
    backgroundColor: '#2e7d32', borderRadius: 10, padding: 16, alignItems: 'center', marginBottom: 20,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  athleteCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 2, borderColor: '#2e7d32',
  },
  athleteAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#2e7d32', alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  athleteInfo: { flex: 1 },
  athleteName: { fontSize: 16, fontWeight: '700', color: '#333' },
  athleteEmail: { fontSize: 13, color: '#999', marginTop: 2 },
  linkButton: {
    backgroundColor: '#2e7d32', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10,
  },
  linkButtonText: { color: '#fff', fontWeight: '700' },
  privacyBox: {
    backgroundColor: '#fff8e1', borderRadius: 10, padding: 14,
    borderLeftWidth: 4, borderLeftColor: '#f59e0b', marginBottom: 20,
  },
  privacyTitle: { fontWeight: '700', color: '#92400e', marginBottom: 6 },
  privacyText: { fontSize: 13, color: '#666', lineHeight: 18 },
  skipButton: { alignItems: 'center', marginTop: 8 },
  skipText: { color: '#999', fontSize: 14 },
});