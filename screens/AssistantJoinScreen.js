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

export default function AssistantJoinScreen({ onJoinComplete }) {
  const [joinCode, setJoinCode] = useState('');  const [selectedSchool, setSelectedSchool] = useState(null);
  const [loading, setLoading] = useState(false);  const [requested, setRequested] = useState(false);

  // Look up the head coach (admin_coach) for a school so the search results
  // can show "Coach: Jane Doe" alongside each school. Helps disambiguate
  // when multiple schools share the same name.
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
      const school = { id: schoolDoc.id, ...schoolDoc.data() };
      school.headCoachName = await loadHeadCoachName(school.id);
      setSelectedSchool(school);
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
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>PENDING APPROVAL</Text>
          </View>
          <Text style={styles.pendingTitle}>Request sent</Text>
          <Text style={styles.pendingDesc}>
            Your request to join {selectedSchool?.name || 'the school'} has been sent to the head coach. You'll have access once they approve you.
          </Text>
          <TouchableOpacity
            style={styles.pendingBtn}
            onPress={() => onJoinComplete && onJoinComplete()}
          >
            <Text style={styles.pendingBtnText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Brand header */}
      <View style={styles.header}>
        <Text style={styles.title}>Join a team</Text>
        <Text style={styles.subtitle}>Assist a head coach's program</Text>
      </View>
              <View style={styles.section}>
          <Text style={styles.sectionTitle}>Have a join code?</Text>
          <Text style={[styles.eyebrow, styles.eyebrowSpaced]}>Enter the code from your head coach</Text>

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
                <Text style={styles.primaryButtonText}>Find my school</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      
      {/* Selected school confirmation (from join code) */}
      {selectedSchool && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Found your school</Text>
          <Text style={[styles.eyebrow, styles.eyebrowSpaced]}>Confirm and request to join</Text>
          <SchoolCard
            school={selectedSchool}
            onJoin={() => handleRequestToJoin(selectedSchool)}
            loading={loading}
          />
        </View>
      )}

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

  // ── Tabs ────────────────────────────────────────────────────────────────
  tabs: {
    flexDirection: 'row',
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    padding: SIGNAL.space[1],
    marginBottom: SIGNAL.space[7],
  },
  tab: {
    flex: 1,
    paddingVertical: SIGNAL.space[3] + 1,
    alignItems: 'center',
    borderRadius: SIGNAL.radius.control,
  },
  tabActive: {
    backgroundColor: SIGNAL.color.indigo,
  },
  tabText: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 13.5,
    color: SIGNAL.color.mute,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  tabTextActive: {
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.white,
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

  // ── OR divider ──────────────────────────────────────────────────────────
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIGNAL.space[4],
    marginBottom: SIGNAL.space[7],
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: SIGNAL.color.line,
  },
  dividerText: {
    ...SIGNAL.style.eyebrow,
    fontFamily: SIGNAL.font.bodyMedium,
    color: SIGNAL.color.mute2,
  },

  // ── Search row ──────────────────────────────────────────────────────────
  searchRow: {
    flexDirection: 'row',
    gap: SIGNAL.space[3],
  },
  searchInput: {
    flex: 1,
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.control,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    paddingVertical: SIGNAL.space[4] + 1,
    paddingHorizontal: SIGNAL.space[5] + 1,
    fontFamily: SIGNAL.font.body,
    fontSize: 15,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  searchButton: {
    backgroundColor: SIGNAL.color.indigo,
    borderRadius: SIGNAL.radius.control,
    paddingHorizontal: SIGNAL.space[6],
    minWidth: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchButtonText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 14,
    color: SIGNAL.color.white,
    letterSpacing: SIGNAL.letter.bodyTight,
  },

  // ── Results list ────────────────────────────────────────────────────────
  resultsList: {
    marginTop: SIGNAL.space[4],
    gap: SIGNAL.space[2],
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

  // ── Pending approval state ──────────────────────────────────────────────
  pendingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SIGNAL.space.screen + 6,
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
  },
  pendingBadge: {
    backgroundColor: `${SIGNAL.color.amber}${SIGNAL.tint.chip}`,
    borderRadius: SIGNAL.radius.chip,
    paddingVertical: SIGNAL.space[2],
    paddingHorizontal: SIGNAL.space[4],
    marginBottom: SIGNAL.space[6],
  },
  pendingBadgeText: {
    ...SIGNAL.style.eyebrow,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.amber,
  },
  pendingTitle: {
    fontFamily: SIGNAL.font.display,
    fontSize: 29,
    lineHeight: 32,
    letterSpacing: SIGNAL.letter.titleTight,
    color: SIGNAL.color.indigo,
    textAlign: 'center',
    marginBottom: SIGNAL.space[4],
  },
  pendingDesc: {
    fontFamily: SIGNAL.font.body,
    fontSize: 14,
    color: SIGNAL.color.inkSoft,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SIGNAL.space[8],
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  pendingBtn: {
    backgroundColor: SIGNAL.color.indigo,
    borderRadius: SIGNAL.radius.button,
    paddingVertical: SIGNAL.space[5],
    paddingHorizontal: SIGNAL.space[8] + SIGNAL.space[6],
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingBtnText: {
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 15,
    color: SIGNAL.color.white,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
});
