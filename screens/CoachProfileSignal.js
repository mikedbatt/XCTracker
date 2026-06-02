import { Ionicons } from '@expo/vector-icons';
import { signOut, updateEmail } from 'firebase/auth';
import {
  arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, query, updateDoc, where,
} from 'firebase/firestore';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';
import Button from '../components/Button';
import {
  AVATAR_COLORS, BRAND, BRAND_DARK, BRAND_LIGHT,
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SIGNAL, SPACE, STATUS,
} from '../constants/design';

const SCHOOL_COLORS = [
  { name: 'Navy & Gold', primary: '#1a237e', secondary: '#ffd600' },
  { name: 'Red & White', primary: '#c62828', secondary: '#ffffff' },
  { name: 'Green & White', primary: '#1e6f5c', secondary: '#ffffff' },
  { name: 'Purple & Gold', primary: '#6a1b9a', secondary: '#ffd600' },
  { name: 'Black & Orange', primary: '#212121', secondary: '#f57c00' },
  { name: 'Blue & White', primary: '#1565c0', secondary: '#ffffff' },
  { name: 'Maroon & Gold', primary: '#880e4f', secondary: '#ffd600' },
  { name: 'Custom', primary: null, secondary: null },
];

export default function CoachProfileSignal({ userData, school, pendingAthletes = [], onApproveAthlete, onDenyAthlete, onClose, onUpdated }) {
  const [firstName, setFirstName] = useState(userData.firstName || '');
  const [lastName,  setLastName]  = useState(userData.lastName  || '');
  const [email,     setEmail]     = useState(userData.email     || '');
  const [saving,    setSaving]    = useState(false);
  const [avatarColor, setAvatarColor] = useState(userData.avatarColor || SIGNAL.color.indigo);

  // School editing state
  const [schoolName, setSchoolName]       = useState(school?.name || '');
  const [mascot, setMascot]               = useState(school?.mascot || '');
  const [selectedColors, setSelectedColors] = useState(() => {
    if (!school?.primaryColor) return null;
    const match = SCHOOL_COLORS.find(c => c.primary === school.primaryColor);
    return match || { name: 'Custom', primary: null, secondary: null };
  });
  const [customPrimary, setCustomPrimary]   = useState(school?.primaryColor || '');
  const [customSecondary, setCustomSecondary] = useState(school?.secondaryColor || '');
  const [savingSchool, setSavingSchool]     = useState(false);
  const [editingSchool, setEditingSchool]   = useState(false);

  const isAdmin = userData.role === 'admin_coach';

  // Assistant coach management state
  const [pendingCoaches, setPendingCoaches] = useState([]);
  const [assistantCoaches, setAssistantCoaches] = useState([]);
  const [loadingCoaches, setLoadingCoaches] = useState(false);

  // Load pending + approved assistant coaches
  const loadAssistantCoaches = async () => {
    if (!isAdmin || !userData.schoolId) return;
    setLoadingCoaches(true);
    try {
      const schoolDoc = await getDoc(doc(db, 'schools', userData.schoolId));
      const schoolData = schoolDoc.data();
      const pendingIds = schoolData?.pendingCoachIds || [];
      const coachIds = (schoolData?.coachIds || []).filter(id => id !== schoolData?.adminCoachId);

      // Load pending coaches
      const pending = [];
      for (const uid of pendingIds) {
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists()) pending.push({ id: uid, ...userDoc.data() });
      }
      setPendingCoaches(pending);

      // Load approved assistants
      const approved = [];
      for (const uid of coachIds) {
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists()) approved.push({ id: uid, ...userDoc.data() });
      }
      setAssistantCoaches(approved);
    } catch (e) { console.warn('Failed to load coaches:', e); }
    setLoadingCoaches(false);
  };

  useState(() => { loadAssistantCoaches(); });

  const handleApproveCoach = async (coach) => {
    try {
      await updateDoc(doc(db, 'users', coach.id), { status: 'approved', coachRole: 'assistant' });
      await updateDoc(doc(db, 'schools', userData.schoolId), {
        pendingCoachIds: arrayRemove(coach.id),
        coachIds: arrayUnion(coach.id),
      });
      Alert.alert('Approved!', `${coach.firstName} ${coach.lastName} is now an assistant coach.`);
      loadAssistantCoaches();
    } catch { Alert.alert('Error', 'Could not approve coach.'); }
  };

  const handleDenyCoach = (coach) => {
    Alert.alert('Deny request?', `Remove ${coach.firstName} ${coach.lastName}'s request to join?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Deny', style: 'destructive', onPress: async () => {
        try {
          await updateDoc(doc(db, 'schools', userData.schoolId), {
            pendingCoachIds: arrayRemove(coach.id),
          });
          await updateDoc(doc(db, 'users', coach.id), { schoolId: null, status: 'pending' });
          loadAssistantCoaches();
        } catch { Alert.alert('Error', 'Could not deny coach.'); }
      }},
    ]);
  };

  const handleToggleTraining = async (coach, value) => {
    try {
      await updateDoc(doc(db, 'users', coach.id), { trainingAccess: value });
      setAssistantCoaches(prev => prev.map(c => c.id === coach.id ? { ...c, trainingAccess: value } : c));
    } catch { Alert.alert('Error', 'Could not update training access.'); }
  };

  const handleRemoveCoach = (coach) => {
    Alert.alert('Remove assistant?', `Remove ${coach.firstName} ${coach.lastName} from your coaching staff?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await updateDoc(doc(db, 'schools', userData.schoolId), {
            coachIds: arrayRemove(coach.id),
          });
          await updateDoc(doc(db, 'users', coach.id), { schoolId: null, coachRole: null, trainingAccess: null, status: 'pending' });
          loadAssistantCoaches();
        } catch { Alert.alert('Error', 'Could not remove coach.'); }
      }},
    ]);
  };

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Required', 'Please enter both first and last name.');
      return;
    }
    setSaving(true);
    try {
      const updates = {
        firstName: firstName.trim(),
        lastName:  lastName.trim(),
        avatarColor,
      };

      if (email.trim() !== userData.email) {
        try {
          await updateEmail(auth.currentUser, email.trim());
          updates.email = email.trim();
        } catch (e) {
          setSaving(false);
          if (e.code === 'auth/requires-recent-login') {
            Alert.alert('Sign in required', 'To change your email, please sign out and sign back in first, then try again.');
          } else if (e.code === 'auth/email-already-in-use') {
            Alert.alert('Email taken', 'That email address is already in use by another account.');
          } else {
            Alert.alert('Email error', 'Could not update email. Please try again.');
          }
          return;
        }
      }

      await updateDoc(doc(db, 'users', auth.currentUser.uid), updates);
      Alert.alert('Saved!', 'Your profile has been updated.');
      onUpdated && onUpdated(updates);
    } catch {
      Alert.alert('Error', 'Could not save. Please try again.');
    }
    setSaving(false);
  };

  const handleSaveSchool = async () => {
    if (!schoolName.trim()) {
      Alert.alert('Required', 'Please enter a school name.');
      return;
    }
    setSavingSchool(true);
    try {
      const primaryColor = selectedColors?.name === 'Custom' ? customPrimary : selectedColors?.primary;
      const secondaryColor = selectedColors?.name === 'Custom' ? customSecondary : selectedColors?.secondary;

      await updateDoc(doc(db, 'schools', userData.schoolId), {
        name: schoolName.trim(),
        mascot: mascot.trim(),
        ...(primaryColor && { primaryColor }),
        ...(secondaryColor && { secondaryColor }),
      });
      Alert.alert('Saved!', 'School info has been updated.');
      setEditingSchool(false);
      onUpdated && onUpdated();
    } catch {
      Alert.alert('Error', 'Could not save school info. Please try again.');
    }
    setSavingSchool(false);
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: () => signOut(auth) },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={22} color={SIGNAL.color.inkSoft} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My profile</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Avatar block — solid color from coach's avatarColor */}
      <View style={styles.avatarSection}>
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>
            {(firstName[0] || '?').toUpperCase()}{(lastName[0] || '').toUpperCase()}
          </Text>
        </View>
        <Text style={styles.avatarName}>{firstName} {lastName}</Text>
        <Text style={styles.avatarSub}>
          {school?.name || 'No school'}
          {`  ·  ${isAdmin ? 'Head coach' : 'Assistant coach'}`}
        </Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Personal info card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Personal info</Text>

          <Text style={styles.eyebrow}>First name</Text>
          <TextInput
            style={styles.input}
            value={firstName}
            onChangeText={setFirstName}
            placeholder="First name"
            placeholderTextColor={SIGNAL.color.mute2}
            autoCapitalize="words"
          />

          <Text style={[styles.eyebrow, { marginTop: 14 }]}>Last name</Text>
          <TextInput
            style={styles.input}
            value={lastName}
            onChangeText={setLastName}
            placeholder="Last name"
            placeholderTextColor={SIGNAL.color.mute2}
            autoCapitalize="words"
          />

          <Text style={[styles.eyebrow, { marginTop: 14 }]}>Email address</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={SIGNAL.color.mute2}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.fieldHint}>Changing email requires a recent sign-in</Text>

          <Text style={[styles.eyebrow, { marginTop: 14 }]}>Avatar color</Text>
          <View style={styles.avatarColorRow}>
            {AVATAR_COLORS.map(color => {
              const active = avatarColor === color;
              return (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.avatarColorBtn,
                    { backgroundColor: color },
                    active && styles.avatarColorBtnActive,
                  ]}
                  onPress={() => setAvatarColor(color)}
                  activeOpacity={0.8}
                >
                  {active && <Ionicons name="checkmark" size={16} color="#fff" />}
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, { marginTop: 18 }, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.primaryBtnText}>Save changes</Text>}
          </TouchableOpacity>
        </View>

        {/* School info card */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>School info</Text>
            {isAdmin && !editingSchool && (
              <TouchableOpacity onPress={() => setEditingSchool(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.editLink}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          {editingSchool ? (
            <>
              <Text style={styles.eyebrow}>School name</Text>
              <TextInput
                style={styles.input}
                value={schoolName}
                onChangeText={setSchoolName}
                placeholder="School name"
                placeholderTextColor={SIGNAL.color.mute2}
                autoCapitalize="words"
              />

              <Text style={[styles.eyebrow, { marginTop: 14 }]}>Mascot</Text>
              <TextInput
                style={styles.input}
                value={mascot}
                onChangeText={setMascot}
                placeholder="e.g. Braves, Eagles"
                placeholderTextColor={SIGNAL.color.mute2}
                autoCapitalize="words"
              />

              <Text style={[styles.eyebrow, { marginTop: 14 }]}>Team colors</Text>
              <View style={styles.colorsGrid}>
                {SCHOOL_COLORS.map((colorOption) => {
                  const active = selectedColors?.name === colorOption.name;
                  return (
                    <TouchableOpacity
                      key={colorOption.name}
                      style={[styles.colorCard, active && styles.colorCardActive]}
                      onPress={() => setSelectedColors(colorOption)}
                      activeOpacity={0.8}
                    >
                      {colorOption.primary ? (
                        <View style={styles.colorSwatches}>
                          <View style={[styles.swatch, { backgroundColor: colorOption.primary }]} />
                          <View style={[styles.swatch, { backgroundColor: colorOption.secondary, borderWidth: 1, borderColor: SIGNAL.color.line }]} />
                        </View>
                      ) : (
                        <Text style={styles.colorCustomLabel}>Custom</Text>
                      )}
                      <Text style={styles.colorName}>{colorOption.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {selectedColors?.name === 'Custom' && (
                <View style={styles.customRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eyebrow}>Primary</Text>
                    <TextInput
                      style={styles.input}
                      value={customPrimary}
                      onChangeText={setCustomPrimary}
                      placeholder="#000000"
                      placeholderTextColor={SIGNAL.color.mute2}
                      autoCapitalize="none"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eyebrow}>Secondary</Text>
                    <TextInput
                      style={styles.input}
                      value={customSecondary}
                      onChangeText={setCustomSecondary}
                      placeholder="#ffffff"
                      placeholderTextColor={SIGNAL.color.mute2}
                      autoCapitalize="none"
                    />
                  </View>
                </View>
              )}

              <View style={styles.schoolBtnRow}>
                <TouchableOpacity
                  style={[styles.primaryBtn, { flex: 1 }, savingSchool && { opacity: 0.6 }]}
                  onPress={handleSaveSchool}
                  disabled={savingSchool}
                  activeOpacity={0.85}
                >
                  {savingSchool
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.primaryBtnText}>Save school info</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.outlineBtn}
                  onPress={() => setEditingSchool(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.outlineBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <View style={styles.infoRow}>
                <Ionicons name="school-outline" size={16} color={SIGNAL.color.mute} />
                <Text style={styles.infoText}>{school?.name || 'School not set'}</Text>
              </View>
              {school?.mascot ? (
                <View style={styles.infoRow}>
                  <Ionicons name="ribbon-outline" size={16} color={SIGNAL.color.mute} />
                  <Text style={styles.infoText}>{school.mascot}</Text>
                </View>
              ) : null}
              <View style={styles.infoRow}>
                <Ionicons name="key-outline" size={16} color={SIGNAL.color.mute} />
                <Text style={styles.infoTextMono}>Join code: {school?.joinCode || '—'}</Text>
              </View>
              {school?.primaryColor && (
                <View style={styles.currentColorsRow}>
                  <View style={[styles.currentSwatch, { backgroundColor: school.primaryColor }]} />
                  {school.secondaryColor && (
                    <View style={[styles.currentSwatch, { backgroundColor: school.secondaryColor, borderWidth: 1, borderColor: SIGNAL.color.line }]} />
                  )}
                  <Text style={styles.currentColorsLabel}>Team colors</Text>
                </View>
              )}
              <Text style={styles.fieldHint}>
                Share the join code with athletes so they can join your team.
              </Text>
            </>
          )}
        </View>

        {/* Pending athlete approvals (preserved from original — currently routed via Program → Roster) */}
        {pendingAthletes.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Pending athletes ({pendingAthletes.length})</Text>
            {pendingAthletes.map(athlete => (
              <View key={athlete.id} style={styles.pendingRow}>
                <View style={[styles.pendingAvatar, { backgroundColor: athlete.avatarColor || SIGNAL.color.indigo }]}>
                  <Text style={styles.pendingAvatarText}>
                    {(athlete.firstName?.[0] || '?').toUpperCase()}{(athlete.lastName?.[0] || '').toUpperCase()}
                  </Text>
                </View>
                <View style={styles.pendingInfo}>
                  <Text style={styles.pendingName}>{athlete.firstName} {athlete.lastName}</Text>
                  <Text style={styles.pendingEmail}>{athlete.email}</Text>
                </View>
                <View style={styles.pendingBtns}>
                  <TouchableOpacity
                    style={styles.approveBtn}
                    onPress={() => onApproveAthlete && onApproveAthlete(athlete)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.denyBtn}
                    onPress={() => onDenyAthlete && onDenyAthlete(athlete)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.denyBtnText}>Deny</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Pending coach approvals (admin only) */}
        {isAdmin && pendingCoaches.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Pending coach requests ({pendingCoaches.length})</Text>
            {pendingCoaches.map(coach => (
              <View key={coach.id} style={styles.pendingRow}>
                <View style={[styles.pendingAvatar, { backgroundColor: coach.avatarColor || SIGNAL.color.violet }]}>
                  <Text style={styles.pendingAvatarText}>
                    {(coach.firstName?.[0] || '?').toUpperCase()}{(coach.lastName?.[0] || '').toUpperCase()}
                  </Text>
                </View>
                <View style={styles.pendingInfo}>
                  <Text style={styles.pendingName}>{coach.firstName} {coach.lastName}</Text>
                  <Text style={styles.pendingEmail}>{coach.email} · Assistant</Text>
                </View>
                <View style={styles.pendingBtns}>
                  <TouchableOpacity
                    style={styles.approveBtn}
                    onPress={() => handleApproveCoach(coach)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.denyBtn}
                    onPress={() => handleDenyCoach(coach)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.denyBtnText}>Deny</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Assistant coach management (admin only) */}
        {isAdmin && assistantCoaches.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Assistant coaches</Text>
            {assistantCoaches.map(coach => (
              <View key={coach.id} style={styles.assistantCard}>
                <View style={styles.assistantHeader}>
                  <View style={[styles.pendingAvatar, { backgroundColor: coach.avatarColor || SIGNAL.color.violet }]}>
                    <Text style={styles.pendingAvatarText}>
                      {(coach.firstName?.[0] || '?').toUpperCase()}{(coach.lastName?.[0] || '').toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.assistantInfo}>
                    <Text style={styles.pendingName}>{coach.firstName} {coach.lastName}</Text>
                    <Text style={styles.pendingEmail}>{coach.email}</Text>
                  </View>
                </View>
                <View style={styles.assistantControls}>
                  <View style={styles.trainingToggle}>
                    <Text style={styles.toggleLabel}>Training access</Text>
                    <Switch
                      value={coach.trainingAccess === true}
                      onValueChange={(val) => handleToggleTraining(coach, val)}
                      trackColor={{ false: SIGNAL.color.line, true: SIGNAL.color.indigo + '66' }}
                      thumbColor={coach.trainingAccess ? SIGNAL.color.indigo : SIGNAL.color.mute2}
                    />
                  </View>
                  <TouchableOpacity
                    onPress={() => handleRemoveCoach(coach)}
                    style={styles.removeBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.removeBtnText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Account actions */}
        <View style={styles.accountActions}>
          <TouchableOpacity
            style={styles.destructiveBtn}
            onPress={handleSignOut}
            activeOpacity={0.8}
          >
            <Text style={styles.destructiveBtnText}>Sign out</Text>
          </TouchableOpacity>
          <Text style={styles.actionHint}>
            You'll need your email and password to sign back in.
          </Text>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: 12,
    paddingHorizontal: 18,
    backgroundColor: SIGNAL.color.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    width: 22,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.indigo,
  },

  // ── Avatar block ────────────────────────────────────────────────────────
  avatarSection: {
    backgroundColor: SIGNAL.color.white,
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 18,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 26,
    fontFamily: SIGNAL.font.bodyBold,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  avatarName: {
    fontSize: 18,
    fontFamily: SIGNAL.font.bodyBold,
    fontWeight: '700',
    color: SIGNAL.color.ink,
    marginTop: 10,
  },
  avatarSub: {
    fontSize: 12.5,
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.body,
    marginTop: 2,
  },

  // ── Scroll / layout ─────────────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: {
    padding: 14,
    gap: 12,
  },

  // ── Cards ───────────────────────────────────────────────────────────────
  card: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.indigo,
    marginBottom: 12,
  },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0,
  },
  editLink: {
    fontSize: 13,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.indigo,
    marginBottom: 12,
  },

  // ── Eyebrows / labels ───────────────────────────────────────────────────
  eyebrow: {
    ...SIGNAL.style.eyebrow,
    marginBottom: 6,
  },
  fieldHint: {
    fontSize: 11,
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.body,
    marginTop: 6,
    lineHeight: 16,
  },

  // ── Inputs ──────────────────────────────────────────────────────────────
  input: {
    backgroundColor: SIGNAL.color.paper,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    fontSize: 14.5,
    fontFamily: SIGNAL.font.bodyMedium,
    fontWeight: '500',
    color: SIGNAL.color.ink,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },

  // ── Avatar color picker ─────────────────────────────────────────────────
  avatarColorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  avatarColorBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: 'transparent',
  },
  avatarColorBtnActive: {
    borderColor: SIGNAL.color.indigo,
  },

  // ── Primary / outline / destructive buttons ─────────────────────────────
  primaryBtn: {
    backgroundColor: SIGNAL.color.indigo,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
  },
  outlineBtn: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: SIGNAL.color.line,
  },
  outlineBtnText: {
    color: SIGNAL.color.inkSoft,
    fontSize: 14,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
  },
  destructiveBtn: {
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fecaca',
  },
  destructiveBtnText: {
    color: SIGNAL.color.coral,
    fontSize: 14,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
  },

  // ── School info readout ─────────────────────────────────────────────────
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  infoText: {
    fontSize: 13.5,
    color: SIGNAL.color.inkSoft,
    fontFamily: SIGNAL.font.body,
  },
  infoTextMono: {
    fontSize: 13.5,
    color: SIGNAL.color.inkSoft,
    fontFamily: SIGNAL.font.mono,
  },
  currentColorsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  currentSwatch: {
    width: 22,
    height: 22,
    borderRadius: 999,
  },
  currentColorsLabel: {
    fontSize: 12,
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.body,
  },

  // ── School color picker grid ────────────────────────────────────────────
  colorsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  colorCard: {
    width: '22.5%',
    backgroundColor: SIGNAL.color.paper,
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: SIGNAL.color.line,
  },
  colorCardActive: {
    borderColor: SIGNAL.color.indigo,
  },
  colorSwatches: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 4,
  },
  swatch: {
    width: 16,
    height: 16,
    borderRadius: 999,
  },
  colorCustomLabel: {
    fontSize: 11,
    color: SIGNAL.color.inkSoft,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    marginBottom: 4,
  },
  colorName: {
    fontSize: 9,
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.body,
    textAlign: 'center',
  },
  customRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 6,
  },
  schoolBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },

  // ── Pending rows (athletes + coaches) ───────────────────────────────────
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: SIGNAL.color.line,
  },
  pendingAvatar: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingAvatarText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: SIGNAL.font.bodyBold,
    fontWeight: '700',
  },
  pendingInfo: {
    flex: 1,
  },
  pendingName: {
    fontSize: 13.5,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.ink,
  },
  pendingEmail: {
    fontSize: 11.5,
    fontFamily: SIGNAL.font.body,
    color: SIGNAL.color.mute,
    marginTop: 1,
  },
  pendingBtns: {
    flexDirection: 'row',
    gap: 6,
  },
  approveBtn: {
    backgroundColor: SIGNAL.color.indigo,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  approveBtnText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
  },
  denyBtn: {
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  denyBtnText: {
    color: SIGNAL.color.coral,
    fontSize: 12,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
  },

  // ── Assistant coach card ────────────────────────────────────────────────
  assistantCard: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: SIGNAL.color.line,
  },
  assistantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  assistantInfo: {
    flex: 1,
  },
  assistantControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 4,
  },
  trainingToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toggleLabel: {
    fontSize: 12.5,
    color: SIGNAL.color.inkSoft,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
  },
  removeBtn: {
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  removeBtnText: {
    fontSize: 12.5,
    color: SIGNAL.color.coral,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
  },

  // ── Account actions ─────────────────────────────────────────────────────
  accountActions: {
    marginTop: 14,
    gap: 6,
  },
  actionHint: {
    fontSize: 11.5,
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.body,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 14,
    lineHeight: 16,
    paddingHorizontal: 8,
  },
});
