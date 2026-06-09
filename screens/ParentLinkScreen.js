import { arrayUnion, collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert, Platform, ScrollView,
    StyleSheet,
    Text, TextInput, TouchableOpacity,
    View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';
import { SIGNAL } from '../constants/design';

export default function ParentLinkScreen({ onLinkComplete }) {
  const [athleteEmail, setAthleteEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [foundAthlete, setFoundAthlete] = useState(null);
  // Set on success → shows the linked confirmation. (Not an Alert with a button:
  // its onPress is dropped on web, stranding the parent on this screen.)
  const [linked, setLinked] = useState(false);

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
        linkedParentIds: arrayUnion(user.uid),
      });

      setLinked(true);
    } catch (error) {
      Alert.alert('Error', 'Could not link accounts. Please try again.');
    }
    setLoading(false);
  };

  // Success screen — shown after linking. Confirms the connection and gives an
  // explicit way forward (works on web and native).
  if (linked) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>You're linked</Text>
          <Text style={styles.subtitle}>Connected to your athlete</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.successTitle}>
            You're now connected to {foundAthlete?.firstName}'s training 🎉
          </Text>
          <Text style={styles.successBody}>
            You can view their miles, schedule, and recent runs from your dashboard.
          </Text>
          <TouchableOpacity
            style={styles.successButton}
            onPress={() => onLinkComplete && onLinkComplete()}
          >
            <Text style={styles.successButtonText}>Go to my dashboard</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Parent Setup</Text>
        <Text style={styles.title}>Link to an athlete</Text>
        <Text style={styles.subtitle}>
          Connect your account to your athlete so you can follow their training, races, and weekly mileage.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>What you'll see</Text>
        <View style={styles.infoList}>
          <Text style={styles.infoItem}>Upcoming races and workouts</Text>
          <Text style={styles.infoItem}>Race locations and times</Text>
          <Text style={styles.infoItem}>Your athlete's weekly mileage</Text>
          <Text style={styles.infoItem}>Coach notes and announcements</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Find your athlete</Text>
        <Text style={styles.label}>Athlete email address</Text>
        <TextInput
          style={styles.input}
          placeholder="athlete@email.com"
          placeholderTextColor={SIGNAL.color.mute2}
          value={athleteEmail}
          onChangeText={setAthleteEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
          onPress={handleFindAthlete}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading && !foundAthlete ? (
            <ActivityIndicator color={SIGNAL.color.white} />
          ) : (
            <Text style={styles.primaryButtonText}>Search</Text>
          )}
        </TouchableOpacity>
      </View>

      {foundAthlete && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Match found</Text>
          <View style={styles.athleteRow}>
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
            <TouchableOpacity
              style={[styles.linkButton, loading && styles.primaryButtonDisabled]}
              onPress={handleLinkToAthlete}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={SIGNAL.color.white} size="small" />
              ) : (
                <Text style={styles.linkButtonText}>Link</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Privacy note</Text>
        <Text style={styles.bodyText}>
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
  container: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },
  content: {
    paddingHorizontal: SIGNAL.space.screen,
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: 48,
  },
  header: {
    marginBottom: SIGNAL.space[7],
  },
  eyebrow: {
    ...SIGNAL.style.eyebrow,
    marginBottom: SIGNAL.space[2],
  },
  title: {
    fontFamily: SIGNAL.font.display,
    fontSize: 29,
    color: SIGNAL.color.indigo,
    letterSpacing: SIGNAL.letter.titleTight,
    marginBottom: SIGNAL.space[3],
  },
  subtitle: {
    fontFamily: SIGNAL.font.body,
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.inkSoft,
    letterSpacing: SIGNAL.letter.bodyTight,
    lineHeight: 20,
  },
  card: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: 16,
    padding: SIGNAL.space.card,
    marginBottom: SIGNAL.space[5],
    ...SIGNAL.border.hairline,
  },

  // ── Success state ───────────────────────────────────────────────────────
  successTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 18,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
    lineHeight: 24,
    marginBottom: SIGNAL.space[3],
  },
  successBody: {
    fontFamily: SIGNAL.font.body,
    fontSize: 14,
    color: SIGNAL.color.mute,
    lineHeight: 20,
    letterSpacing: SIGNAL.letter.bodyTight,
    marginBottom: SIGNAL.space[6],
  },
  successButton: {
    backgroundColor: SIGNAL.color.indigo,
    borderRadius: SIGNAL.radius.button,
    paddingVertical: SIGNAL.space[5],
    alignItems: 'center',
    justifyContent: 'center',
  },
  successButtonText: {
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 15,
    color: SIGNAL.color.white,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  sectionTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 18,
    color: SIGNAL.color.indigo,
    letterSpacing: SIGNAL.letter.bodyTight,
    marginBottom: SIGNAL.space[4],
  },
  infoList: {
    gap: SIGNAL.space[2],
  },
  infoItem: {
    fontFamily: SIGNAL.font.body,
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.inkSoft,
    letterSpacing: SIGNAL.letter.bodyTight,
    lineHeight: 20,
  },
  label: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.mute,
    marginBottom: SIGNAL.space[2],
  },
  input: {
    backgroundColor: SIGNAL.color.paper,
    borderRadius: SIGNAL.radius.control,
    paddingHorizontal: SIGNAL.space[4],
    paddingVertical: SIGNAL.space[4],
    fontFamily: SIGNAL.font.body,
    fontSize: SIGNAL.size.bodyLg,
    color: SIGNAL.color.ink,
    marginBottom: SIGNAL.space[5],
    ...SIGNAL.border.hairline,
  },
  primaryButton: {
    backgroundColor: SIGNAL.color.indigo,
    borderRadius: SIGNAL.radius.button,
    paddingVertical: SIGNAL.space[5],
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: SIGNAL.color.white,
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: SIGNAL.size.bodyLg,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  athleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIGNAL.space[4],
  },
  athleteAvatar: {
    width: 44,
    height: 44,
    borderRadius: SIGNAL.radius.chip,
    backgroundColor: SIGNAL.color.indigo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: SIGNAL.color.white,
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: SIGNAL.size.bodyLg,
  },
  athleteInfo: {
    flex: 1,
  },
  athleteName: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: SIGNAL.size.bodyLg,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  athleteEmail: {
    fontFamily: SIGNAL.font.body,
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.mute,
    marginTop: 2,
  },
  linkButton: {
    backgroundColor: SIGNAL.color.indigo,
    borderRadius: SIGNAL.radius.button,
    paddingHorizontal: SIGNAL.space[5],
    paddingVertical: SIGNAL.space[3],
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
  },
  linkButtonText: {
    color: SIGNAL.color.white,
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: SIGNAL.size.body,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  bodyText: {
    fontFamily: SIGNAL.font.body,
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.inkSoft,
    letterSpacing: SIGNAL.letter.bodyTight,
    lineHeight: 20,
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: SIGNAL.space[5],
  },
  skipText: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.indigo,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
});
