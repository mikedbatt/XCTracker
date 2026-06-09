import {
    arrayUnion,
    collection,
    doc,
    getDocs,
    query,
    updateDoc,
    where,
} from 'firebase/firestore';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    ScrollView,
    StyleSheet,
    Text, TextInput, TouchableOpacity,
    View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';
import { SIGNAL } from '../constants/design';

export default function AthleteJoinScreen({ onJoinComplete, onSkip }) {
  const [joinCode, setJoinCode] = useState('');
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [loading, setLoading] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  // Look up the head coach (admin_coach) for a school so the post-code-entry
  // confirmation card can show "Coach: Jane Doe" — helps the athlete verify
  // they entered the right code before requesting to join.
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

      // Show an in-app success state (NOT Alert.alert with buttons — the button
      // array is dropped on react-native-web, so the navigation onPress would
      // never fire and the user would be stranded with no confirmation).
      setRequestSent(true);
    } catch (error) {
      Alert.alert('Error', 'Could not send join request. Please try again.');
    }
    setLoading(false);
  };

  // Success screen — shown after a request is sent. Gives clear confirmation and
  // an explicit way forward (works on web and native).
  if (requestSent) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Request sent</Text>
          <Text style={styles.subtitle}>You're almost in</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.successTitle}>
            Your request to join {selectedSchool?.name} is on its way 🎉
          </Text>
          <Text style={styles.successBody}>
            Your coach will approve you shortly — you'll get full team access once
            they do. In the meantime, you can start logging your runs.
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => onJoinComplete && onJoinComplete()}
          >
            <Text style={styles.primaryButtonText}>Go to my dashboard</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Brand header */}
      <View style={styles.header}>
        <Text style={styles.title}>Join your team</Text>
        <Text style={styles.subtitle}>Enter the code your coach gave you</Text>
      </View>

      {/* Join by code section */}
      <View style={styles.section}>
        <View style={styles.card}>
          <TextInput
            style={styles.codeInput}
            placeholder="ABC123"
            placeholderTextColor={SIGNAL.color.mute2}
            value={joinCode}
            onChangeText={setJoinCode}
            autoCapitalize="characters"
            maxLength={8}
          />
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
            onPress={handleJoinByCode}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={SIGNAL.color.white} size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>Find my team</Text>
            )}
          </TouchableOpacity>
        </View>
        <Text style={styles.hintText}>
          Don't have a code? Ask your coach — they can see it under Profile → School info.
        </Text>
      </View>

      {/* Selected school confirmation (from join code) */}
      {selectedSchool && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Found your team</Text>
          <Text style={[styles.eyebrow, styles.eyebrowSpaced]}>Confirm and request to join</Text>
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
    <View style={styles.schoolCard}>
      <View style={[styles.schoolAccent, { backgroundColor: school.primaryColor || SIGNAL.color.indigo }]} />
      <View style={styles.schoolBody}>
        <View style={styles.schoolInfo}>
          <Text style={styles.schoolName}>{school.name}</Text>
          {school.mascot ? (
            <Text style={styles.schoolMeta}>
              {school.mascot}
              {(school.city || school.state) ? ` · ${school.city}, ${school.state}` : ''}
            </Text>
          ) : (
            <Text style={styles.schoolMeta}>{school.city}, {school.state}</Text>
          )}
          {school.headCoachName ? (
            <Text style={styles.schoolCoach}>Coach {school.headCoachName}</Text>
          ) : null}
        </View>
        <TouchableOpacity
          style={[styles.requestButton, loading && styles.requestButtonDisabled]}
          onPress={onJoin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={SIGNAL.color.white} size="small" />
          ) : (
            <Text style={styles.requestButtonText}>Request to join</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },
  content: {
    paddingHorizontal: SIGNAL.space.screen + 6,
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: SIGNAL.space[8] * 2,
  },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    alignItems: 'center',
    marginBottom: SIGNAL.space[8],
  },
  title: {
    fontFamily: SIGNAL.font.display,
    fontSize: 29,
    lineHeight: 32,
    letterSpacing: SIGNAL.letter.titleTight,
    color: SIGNAL.color.indigo,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: SIGNAL.font.body,
    fontSize: 13.5,
    color: SIGNAL.color.mute,
    marginTop: SIGNAL.space[2],
    letterSpacing: SIGNAL.letter.bodyTight,
  },

  // ── Sections ────────────────────────────────────────────────────────────
  section: {
    marginBottom: SIGNAL.space[7],
  },
  sectionTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 18,
    color: SIGNAL.color.indigo,
    letterSpacing: SIGNAL.letter.bodyTight,
    marginBottom: SIGNAL.space[2],
  },
  eyebrow: {
    ...SIGNAL.style.eyebrow,
    fontFamily: SIGNAL.font.bodyMedium,
  },
  eyebrowSpaced: {
    marginBottom: SIGNAL.space[4],
  },

  // ── Cards ───────────────────────────────────────────────────────────────
  card: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    padding: SIGNAL.space[7],
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

  // ── Join code input (mono, large, centered) ─────────────────────────────
  codeInput: {
    backgroundColor: SIGNAL.color.paper,
    borderRadius: SIGNAL.radius.control,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    paddingVertical: SIGNAL.space[6],
    paddingHorizontal: SIGNAL.space[6],
    fontFamily: SIGNAL.font.mono,
    fontSize: 26,
    color: SIGNAL.color.ink,
    textAlign: 'center',
    letterSpacing: 6,
    textTransform: 'uppercase',
    marginBottom: SIGNAL.space[4],
  },

  // ── Primary button (indigo solid) ───────────────────────────────────────
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
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 15,
    color: SIGNAL.color.white,
    letterSpacing: SIGNAL.letter.bodyTight,
  },

  // ── Hint text below the code card ──────────────────────────────────────
  hintText: {
    fontFamily: SIGNAL.font.body,
    fontSize: 12.5,
    color: SIGNAL.color.mute,
    textAlign: 'center',
    marginTop: SIGNAL.space[4],
    paddingHorizontal: SIGNAL.space[3],
    lineHeight: 17,
    letterSpacing: SIGNAL.letter.bodyTight,
  },

  // ── School card ─────────────────────────────────────────────────────────
  schoolCard: {
    flexDirection: 'row',
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    overflow: 'hidden',
  },
  schoolAccent: {
    width: 5,
  },
  schoolBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: SIGNAL.space[5],
    gap: SIGNAL.space[3],
  },
  schoolInfo: {
    flex: 1,
  },
  schoolName: {
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 15,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  schoolMeta: {
    fontFamily: SIGNAL.font.body,
    fontSize: 12,
    color: SIGNAL.color.mute,
    marginTop: 2,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  schoolCoach: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 12,
    color: SIGNAL.color.indigo,
    marginTop: 3,
    letterSpacing: SIGNAL.letter.bodyTight,
  },

  // ── Request button (indigo solid pill) ──────────────────────────────────
  requestButton: {
    backgroundColor: SIGNAL.color.indigo,
    borderRadius: SIGNAL.radius.control,
    paddingVertical: SIGNAL.space[2] + 1,
    paddingHorizontal: SIGNAL.space[5],
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestButtonDisabled: {
    opacity: 0.6,
  },
  requestButtonText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 12.5,
    color: SIGNAL.color.white,
    letterSpacing: SIGNAL.letter.bodyTight,
  },

  // ── Skip link ───────────────────────────────────────────────────────────
  skipButton: {
    marginTop: SIGNAL.space[6],
    alignItems: 'center',
    paddingVertical: SIGNAL.space[4],
  },
  skipText: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 13,
    color: SIGNAL.color.mute,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
});
