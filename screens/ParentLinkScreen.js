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
import Button from '../components/Button';
import Card from '../components/Card';
import {
  BRAND, BRAND_DARK, BRAND_LIGHT,
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SPACE, STATUS,
} from '../constants/design';

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

      await updateDoc(doc(db, 'users', user.uid), {
        linkedAthleteIds: arrayUnion(foundAthlete.id),
        schoolId: foundAthlete.schoolId || null,
        status: 'approved',
      });

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

      <Card style={styles.infoBox}>
        <Text style={styles.infoTitle}>As a parent you can see:</Text>
        <Text style={styles.infoItem}>Upcoming races and workouts</Text>
        <Text style={styles.infoItem}>Race locations and times</Text>
        <Text style={styles.infoItem}>Your athlete's weekly mileage</Text>
        <Text style={styles.infoItem}>Coach notes and announcements</Text>
      </Card>

      <Text style={styles.label}>Your athlete's email address</Text>
      <TextInput
        style={styles.input}
        placeholder="athlete@email.com"
        placeholderTextColor={NEUTRAL.muted}
        value={athleteEmail}
        onChangeText={setAthleteEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Button
        label="Find Athlete"
        onPress={handleFindAthlete}
        loading={loading}
        size="lg"
        style={{ marginBottom: SPACE.xl }}
      />

      {foundAthlete && (
        <Card style={styles.athleteCard}>
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
          <Button label="Link" onPress={handleLinkToAthlete} loading={loading} size="sm" />
        </Card>
      )}

      <View style={styles.privacyBox}>
        <Text style={styles.privacyTitle}>Privacy note</Text>
        <Text style={styles.privacyText}>
          Parents have read-only access. You can view your athlete's schedule and mileage
          but cannot see other athletes' data. Your athlete will be notified that you have
          linked to their account.
        </Text>
      </View>

      <TouchableOpacity style={styles.skipButton} onPress={() => onLinkComplete && onLinkComplete()}>
        <Text style={styles.skipText}>Skip for now — I'll link an athlete later</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: NEUTRAL.bg },
  content:       { padding: SPACE['2xl'], paddingBottom: SPACE['4xl'] },
  header:        { marginBottom: SPACE['2xl'], marginTop: SPACE.xl },
  title:         { fontSize: 26, fontWeight: FONT_WEIGHT.bold, color: BRAND },
  subtitle:      { fontSize: FONT_SIZE.base, color: NEUTRAL.body, marginTop: SPACE.sm },
  infoBox:       { backgroundColor: BRAND_LIGHT, borderLeftWidth: 4, borderLeftColor: BRAND },
  infoTitle:     { fontWeight: FONT_WEIGHT.bold, color: BRAND, marginBottom: SPACE.md, fontSize: FONT_SIZE.base },
  infoItem:      { fontSize: FONT_SIZE.sm, color: NEUTRAL.label, marginBottom: SPACE.sm, lineHeight: 20 },
  label:         { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: NEUTRAL.label, marginBottom: SPACE.sm },
  input: {
    backgroundColor: NEUTRAL.card, borderRadius: RADIUS.md, padding: SPACE.lg - 2,
    fontSize: FONT_SIZE.md, marginBottom: SPACE.lg - 2, borderWidth: 1, borderColor: NEUTRAL.input, color: BRAND_DARK,
  },
  athleteCard:   { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, borderWidth: 2, borderColor: BRAND },
  athleteAvatar: {
    width: 48, height: 48, borderRadius: RADIUS.full,
    backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center',
  },
  avatarText:    { color: '#fff', fontWeight: FONT_WEIGHT.bold, fontSize: FONT_SIZE.lg },
  athleteInfo:   { flex: 1 },
  athleteName:   { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  athleteEmail:  { fontSize: FONT_SIZE.sm, color: NEUTRAL.muted, marginTop: 2 },
  privacyBox: {
    backgroundColor: STATUS.warningBg, borderRadius: RADIUS.md, padding: SPACE.lg - 2,
    borderLeftWidth: 4, borderLeftColor: STATUS.warning, marginBottom: SPACE.xl,
  },
  privacyTitle:  { fontWeight: FONT_WEIGHT.bold, color: '#92400e', marginBottom: SPACE.sm },
  privacyText:   { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, lineHeight: 18 },
  skipButton:    { alignItems: 'center', marginTop: SPACE.sm },
  skipText:      { color: NEUTRAL.muted, fontSize: FONT_SIZE.sm },
});
