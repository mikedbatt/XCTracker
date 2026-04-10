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
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE, STATUS,
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

export default function CoachProfile({ userData, school, pendingAthletes = [], onApproveAthlete, onDenyAthlete, onClose, onUpdated }) {
  const [firstName, setFirstName] = useState(userData.firstName || '');
  const [lastName,  setLastName]  = useState(userData.lastName  || '');
  const [email,     setEmail]     = useState(userData.email     || '');
  const [saving,    setSaving]    = useState(false);
  const [avatarColor, setAvatarColor] = useState(userData.avatarColor || BRAND);

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
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.avatarSection}>
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>
            {(firstName[0] || '?')}{(lastName[0] || '')}
          </Text>
        </View>
        <Text style={styles.avatarName}>{firstName} {lastName}</Text>
        <Text style={styles.avatarSub}>{school?.name} · Coach</Text>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Personal info</Text>

            <Text style={styles.fieldLabel}>First name</Text>
            <TextInput
              style={styles.input}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="First name"
              placeholderTextColor={NEUTRAL.muted}
              autoCapitalize="words"
            />

            <Text style={styles.fieldLabel}>Last name</Text>
            <TextInput
              style={styles.input}
              value={lastName}
              onChangeText={setLastName}
              placeholder="Last name"
              placeholderTextColor={NEUTRAL.muted}
              autoCapitalize="words"
            />

            <Text style={styles.fieldLabel}>Email address</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={NEUTRAL.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.fieldHint}>Changing email requires a recent sign-in</Text>

            <Text style={styles.fieldLabel}>Avatar color</Text>
            <View style={styles.avatarColorRow}>
              {AVATAR_COLORS.map(color => (
                <TouchableOpacity
                  key={color}
                  style={[styles.avatarColorBtn, { backgroundColor: color }, avatarColor === color && styles.avatarColorBtnActive]}
                  onPress={() => setAvatarColor(color)}
                >
                  {avatarColor === color && <Ionicons name="checkmark" size={16} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>

            <Button
              label="Save changes"
              onPress={handleSave}
              loading={saving}
              style={{ marginTop: SPACE.xs }}
            />
          </View>

          {/* School info card */}
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>School info</Text>
              {isAdmin && !editingSchool && (
                <TouchableOpacity onPress={() => setEditingSchool(true)}>
                  <Text style={styles.editLink}>Edit</Text>
                </TouchableOpacity>
              )}
            </View>

            {editingSchool ? (
              <>
                <Text style={styles.fieldLabel}>School name</Text>
                <TextInput
                  style={styles.input}
                  value={schoolName}
                  onChangeText={setSchoolName}
                  placeholder="School name"
                  placeholderTextColor={NEUTRAL.muted}
                  autoCapitalize="words"
                />

                <Text style={styles.fieldLabel}>Mascot</Text>
                <TextInput
                  style={styles.input}
                  value={mascot}
                  onChangeText={setMascot}
                  placeholder="e.g. Braves, Eagles"
                  placeholderTextColor={NEUTRAL.muted}
                  autoCapitalize="words"
                />

                <Text style={styles.fieldLabel}>Team colors</Text>
                <View style={styles.colorsGrid}>
                  {SCHOOL_COLORS.map((colorOption) => (
                    <TouchableOpacity
                      key={colorOption.name}
                      style={[
                        styles.colorCard,
                        selectedColors?.name === colorOption.name && styles.colorCardActive,
                      ]}
                      onPress={() => setSelectedColors(colorOption)}
                    >
                      {colorOption.primary ? (
                        <View style={styles.colorSwatches}>
                          <View style={[styles.swatch, { backgroundColor: colorOption.primary }]} />
                          <View style={[styles.swatch, { backgroundColor: colorOption.secondary, borderWidth: 1, borderColor: NEUTRAL.border }]} />
                        </View>
                      ) : (
                        <Text style={{ fontSize: FONT_SIZE.sm }}>Custom</Text>
                      )}
                      <Text style={styles.colorName}>{colorOption.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {selectedColors?.name === 'Custom' && (
                  <View style={styles.customRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>Primary</Text>
                      <TextInput
                        style={styles.input}
                        value={customPrimary}
                        onChangeText={setCustomPrimary}
                        placeholder="#000000"
                        placeholderTextColor={NEUTRAL.muted}
                        autoCapitalize="none"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>Secondary</Text>
                      <TextInput
                        style={styles.input}
                        value={customSecondary}
                        onChangeText={setCustomSecondary}
                        placeholder="#ffffff"
                        placeholderTextColor={NEUTRAL.muted}
                        autoCapitalize="none"
                      />
                    </View>
                  </View>
                )}

                <View style={styles.schoolBtnRow}>
                  <Button
                    label="Save school info"
                    onPress={handleSaveSchool}
                    loading={savingSchool}
                    style={{ flex: 1 }}
                  />
                  <Button
                    label="Cancel"
                    variant="secondary"
                    onPress={() => setEditingSchool(false)}
                  />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.infoRow}>{school?.name || 'School not set'}</Text>
                {school?.mascot ? <Text style={styles.infoRowSub}>{school.mascot}</Text> : null}
                <View style={styles.joinCodeRow}>
                  <Ionicons name="key-outline" size={16} color={NEUTRAL.body} />
                  <Text style={styles.infoRow}>Join code: {school?.joinCode || '—'}</Text>
                </View>
                {school?.primaryColor && (
                  <View style={styles.currentColorsRow}>
                    <View style={[styles.currentSwatch, { backgroundColor: school.primaryColor }]} />
                    {school.secondaryColor && (
                      <View style={[styles.currentSwatch, { backgroundColor: school.secondaryColor, borderWidth: 1, borderColor: NEUTRAL.border }]} />
                    )}
                    <Text style={styles.infoRowSub}>Team colors</Text>
                  </View>
                )}
                <Text style={styles.fieldHint}>
                  Share the join code with athletes so they can join your team.
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Pending athlete approvals moved to Program → Roster. */}

        {/* Pending coach approvals (admin only) */}
        {isAdmin && pendingCoaches.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.pendingTitle}>Pending Coach Requests ({pendingCoaches.length})</Text>
            {pendingCoaches.map(coach => (
              <View key={coach.id} style={styles.pendingCard}>
                <View style={styles.pendingInfo}>
                  <Text style={styles.pendingName}>{coach.firstName} {coach.lastName}</Text>
                  <Text style={styles.pendingEmail}>{coach.email} · Assistant Coach</Text>
                </View>
                <View style={styles.pendingBtns}>
                  <TouchableOpacity style={styles.approveBtn} onPress={() => handleApproveCoach(coach)}>
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.denyBtn} onPress={() => handleDenyCoach(coach)}>
                    <Text style={styles.denyBtnText}>Deny</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Assistant coach management (admin only) */}
        {isAdmin && assistantCoaches.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.pendingTitle}>Assistant Coaches</Text>
            {assistantCoaches.map(coach => (
              <View key={coach.id} style={styles.assistantCard}>
                <View style={styles.assistantInfo}>
                  <Text style={styles.pendingName}>{coach.firstName} {coach.lastName}</Text>
                  <Text style={styles.pendingEmail}>{coach.email}</Text>
                </View>
                <View style={styles.assistantControls}>
                  <View style={styles.trainingToggle}>
                    <Text style={styles.toggleLabel}>Training</Text>
                    <Switch
                      value={coach.trainingAccess === true}
                      onValueChange={(val) => handleToggleTraining(coach, val)}
                      trackColor={{ false: NEUTRAL.border, true: BRAND_LIGHT }}
                      thumbColor={coach.trainingAccess ? BRAND : NEUTRAL.muted}
                    />
                  </View>
                  <TouchableOpacity onPress={() => handleRemoveCoach(coach)} style={styles.removeBtn}>
                    <Text style={styles.removeBtnText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.signOutSection}>
          <Button
            label="Sign out"
            variant="destructive"
            onPress={handleSignOut}
            style={{ paddingHorizontal: SPACE['4xl'] }}
          />
          <Text style={styles.signOutHint}>
            You'll need your email and password to sign back in.
          </Text>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: NEUTRAL.bg },
  header:             { backgroundColor: NEUTRAL.card, paddingTop: Platform.OS === 'ios' ? SPACE['5xl'] : SPACE['3xl'], paddingBottom: SPACE.md, paddingHorizontal: SPACE.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
  backBtn:            { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, paddingVertical: SPACE.sm },
  backText:           { color: BRAND_DARK, fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold },
  headerTitle:        { fontSize: FONT_SIZE.xl - 2, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  avatarSection:      { backgroundColor: NEUTRAL.card, alignItems: 'center', paddingBottom: SPACE.xl, paddingTop: SPACE.sm },
  avatar:             { width: 68, height: 68, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.sm },
  avatarText:         { color: '#fff', fontSize: 26, fontWeight: FONT_WEIGHT.bold },
  avatarName:         { color: BRAND_DARK, fontSize: FONT_SIZE.xl - 2, fontWeight: FONT_WEIGHT.bold },
  avatarSub:          { color: NEUTRAL.body, fontSize: FONT_SIZE.sm, marginTop: 3 },
  scroll:             { flex: 1 },
  section:            { padding: SPACE.lg },
  card:               { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg, marginBottom: SPACE.lg, ...SHADOW.sm },
  cardTitleRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.lg - 2 },
  cardTitle:          { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: SPACE.lg - 2 },
  editLink:           { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: BRAND },
  fieldLabel:         { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: NEUTRAL.body, marginBottom: SPACE.sm, marginTop: SPACE.sm },
  fieldHint:          { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: -SPACE.sm, marginBottom: SPACE.sm },
  input:              { backgroundColor: NEUTRAL.bg, borderRadius: RADIUS.md, padding: SPACE.md, fontSize: FONT_SIZE.base, color: BRAND_DARK, borderWidth: 1, borderColor: NEUTRAL.border, marginBottom: SPACE.xs },
  infoRow:            { fontSize: FONT_SIZE.sm, color: NEUTRAL.label },
  infoRowSub:         { fontSize: FONT_SIZE.sm, color: NEUTRAL.muted, marginTop: 2 },
  joinCodeRow:        { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginTop: SPACE.sm },
  currentColorsRow:   { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginTop: SPACE.md },
  currentSwatch:      { width: 24, height: 24, borderRadius: RADIUS.full },
  colorsGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginBottom: SPACE.md },
  colorCard: {
    width: '22%', backgroundColor: NEUTRAL.bg, borderRadius: RADIUS.sm,
    padding: SPACE.sm, alignItems: 'center', borderWidth: 2, borderColor: NEUTRAL.border,
  },
  colorCardActive:    { borderColor: BRAND },
  colorSwatches:      { flexDirection: 'row', gap: SPACE.xs, marginBottom: SPACE.xs },
  swatch:             { width: 18, height: 18, borderRadius: RADIUS.full },
  colorName:          { fontSize: 9, color: NEUTRAL.body, textAlign: 'center' },
  customRow:          { flexDirection: 'row', gap: SPACE.md },
  schoolBtnRow:       { flexDirection: 'row', gap: SPACE.md, marginTop: SPACE.sm },
  pendingTitle:       { fontSize: 17, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: SPACE.md },
  pendingCard:        { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.md, marginBottom: SPACE.sm, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, ...SHADOW.sm },
  pendingInfo:        { flex: 1 },
  pendingName:        { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: BRAND_DARK },
  pendingEmail:       { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: 2 },
  pendingBtns:        { flexDirection: 'row', gap: SPACE.sm },
  approveBtn:         { backgroundColor: BRAND, borderRadius: RADIUS.sm, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
  approveBtnText:     { color: '#fff', fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold },
  denyBtn:            { borderRadius: RADIUS.sm, borderWidth: 1, borderColor: STATUS.error, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
  denyBtnText:        { color: STATUS.error, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold },
  // Assistant coach management
  assistantCard:      { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.md, marginBottom: SPACE.sm, ...SHADOW.sm },
  assistantInfo:      { marginBottom: SPACE.sm },
  assistantControls:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  trainingToggle:     { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  toggleLabel:        { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, fontWeight: FONT_WEIGHT.semibold },
  removeBtn:          { paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
  removeBtnText:      { fontSize: FONT_SIZE.xs, color: STATUS.error, fontWeight: FONT_WEIGHT.semibold },
  signOutSection:     { marginHorizontal: SPACE.lg, marginTop: SPACE.sm, marginBottom: SPACE.sm, alignItems: 'center' },
  signOutHint:        { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, textAlign: 'center', marginTop: SPACE.sm },
  avatarColorRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md, marginBottom: SPACE.lg },
  avatarColorBtn:     { width: 36, height: 36, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
  avatarColorBtnActive: { borderWidth: 3, borderColor: NEUTRAL.card, ...SHADOW.md },
});
