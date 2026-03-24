import { Ionicons } from '@expo/vector-icons';
import { signOut, updateEmail } from 'firebase/auth';
import {
  doc, getDoc, updateDoc
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
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
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE, STATUS, STRAVA_ORANGE,
} from '../constants/design';
import StravaConnect from './StravaConnect';

export default function AthleteProfile({ userData, school, onClose, onUpdated }) {
  const [firstName,     setFirstName]     = useState(userData.firstName || '');
  const [lastName,      setLastName]      = useState(userData.lastName  || '');
  const [email,         setEmail]         = useState(userData.email     || '');
  const [gender,        setGender]        = useState(userData.gender    || 'boys');
  const [saving,        setSaving]        = useState(false);
  const [messages,      setMessages]      = useState([]);
  const [loadingMsgs,   setLoadingMsgs]   = useState(true);
  const [stravaVisible, setStravaVisible] = useState(false);
  const [stravaLinked,  setStravaLinked]  = useState(false);
  const [activeSection, setActiveSection] = useState('profile');
  const [showHRZones,   setShowHRZones]   = useState(userData.showHRZones !== false);
  const [hrZoneLoaded,  setHrZoneLoaded]  = useState(false);
  const [avatarColor,   setAvatarColor]   = useState(userData.avatarColor || BRAND);

  useEffect(() => {
    loadMessages();
    checkStrava();
    loadHRZonePref();
  }, []);

  const loadHRZonePref = async () => {
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (userDoc.exists()) {
        const val = userDoc.data().showHRZones;
        setShowHRZones(val !== false);
      }
      setHrZoneLoaded(true);
    } catch (e) { console.warn('Failed to load HR zone pref:', e); setHrZoneLoaded(true); }
  };

  const checkStrava = async () => {
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (userDoc.exists()) setStravaLinked(!!userDoc.data().stravaAccessToken);
    } catch (e) { console.log('Strava check:', e); }
  };

  const loadMessages = async () => {
    setLoadingMsgs(true);
    try {
      if (!userData.schoolId) { setLoadingMsgs(false); return; }

      // Build keys for last 30 days and fetch each one directly
      const msgs = [];
      const now = new Date();
      for (let i = 0; i < 30; i++) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const key = `${userData.schoolId}_${dateStr}`;
        try {
          const msgDoc = await getDoc(doc(db, 'dailyMessages', key));
          if (msgDoc.exists()) msgs.push({ id: msgDoc.id, date: dateStr, ...msgDoc.data() });
        } catch { /* no message for this day */ }
      }
      setMessages(msgs);
    } catch (e) { console.log('Messages load:', e); }
    setLoadingMsgs(false);
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
        gender,
        avatarColor,
      };

      // Update email if changed
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
      Alert.alert('Saved! ✅', 'Your profile has been updated.');
      onUpdated && onUpdated(updates);
    } catch {
      Alert.alert('Error', 'Could not save. Please try again.');
    }
    setSaving(false);
  };

  const handleToggleHRZones = async (value) => {
    setShowHRZones(value);
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), { showHRZones: value });
    } catch (e) { console.warn('Failed to save HR zone preference:', e); }
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

  if (stravaVisible) {
    return (
      <StravaConnect
        userData={userData}
        school={school}
        onClose={() => { setStravaVisible(false); checkStrava(); }}
        onSynced={() => { setStravaVisible(false); checkStrava(); }}
      />
    );
  }

  const sections = ['profile', 'messages', 'connections'];
  const sectionLabels = { profile: 'Profile', messages: 'Messages', connections: 'Connections' };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={BRAND_DARK} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Avatar block */}
      <View style={styles.avatarSection}>
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>
            {(firstName[0] || '?')}{(lastName[0] || '')}
          </Text>
        </View>
        <Text style={styles.avatarName}>{firstName} {lastName}</Text>
        <Text style={styles.avatarSub}>
          {school?.name}
          {gender ? `  ·  ${gender === 'boys' ? 'Boys team' : 'Girls team'}` : ''}
        </Text>
      </View>

      {/* Section tabs */}
      <View style={styles.tabRow}>
        {sections.map(s => (
          <TouchableOpacity
            key={s}
            style={[styles.tab, activeSection === s && { borderBottomColor: BRAND, borderBottomWidth: 2 }]}
            onPress={() => setActiveSection(s)}
          >
            <Text style={[styles.tabText, activeSection === s && { color: BRAND, fontWeight: '700' }]}>
              {sectionLabels[s]}
              {s === 'messages' && messages.length > 0 ? ` (${messages.length})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Profile section ── */}
        {activeSection === 'profile' && (
          <View style={styles.section}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Personal info</Text>

              <Text style={styles.fieldLabel}>First name</Text>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="First name"
                placeholderTextColor="#999"
                autoCapitalize="words"
              />

              <Text style={styles.fieldLabel}>Last name</Text>
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Last name"
                placeholderTextColor="#999"
                autoCapitalize="words"
              />

              <Text style={styles.fieldLabel}>Email address</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor="#999"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.fieldHint}>Changing email requires a recent sign-in</Text>

              <Text style={styles.fieldLabel}>I compete on the</Text>
              <View style={styles.genderRow}>
                {['boys', 'girls'].map(g => (
                  <TouchableOpacity
                    key={g}
                    style={[styles.genderBtn, gender === g && { backgroundColor: BRAND, borderColor: BRAND }]}
                    onPress={() => setGender(g)}
                  >
                    <Text style={[styles.genderBtnText, gender === g && { color: '#fff' }]}>
                      {g === 'boys' ? 'Boys team' : 'Girls team'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

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
                style={{ marginTop: SPACE.sm }}
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Training preferences</Text>
              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleLabel}>Show heart rate zones</Text>
                  <Text style={styles.toggleHint}>Turn off if you don't use a HR monitor or prefer to train by feel</Text>
                </View>
                <Switch
                  value={showHRZones}
                  onValueChange={handleToggleHRZones}
                  disabled={!hrZoneLoaded}
                  trackColor={{ false: '#ddd', true: BRAND }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.infoCardTitle}>Account info</Text>
              <Text style={styles.infoRow}>🏫  {school?.name || 'School not set'}</Text>
              <Text style={styles.infoRow}>🔑  Join code: {school?.joinCode || '—'}</Text>
              <Text style={styles.infoHint}>
                To switch schools, sign out and sign up again with a different school join code.
              </Text>
            </View>
          </View>
        )}

        {/* ── Messages section ── */}
        {activeSection === 'messages' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Coach messages — last 30 days</Text>
            {loadingMsgs ? (
              <ActivityIndicator color={BRAND} style={{ marginTop: 20 }} />
            ) : messages.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No messages yet</Text>
                <Text style={styles.emptySub}>Your coach's daily messages will appear here.</Text>
              </View>
            ) : messages.map(msg => {
              const today = new Date().toISOString().split('T')[0];
              const isToday = msg.date === today;
              const msgDate = new Date(msg.date + 'T12:00:00')
                .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
              return (
                <View key={msg.id} style={[styles.messageCard, isToday && { borderLeftColor: BRAND }]}>
                  <View style={styles.messageHeader}>
                    <Text style={[styles.messageDate, isToday && { color: BRAND, fontWeight: '700' }]}>
                      {isToday ? '📣 Today' : msgDate}
                    </Text>
                    <Text style={styles.messageSender}>{msg.sentByName}</Text>
                  </View>
                  <Text style={styles.messageText}>{msg.message}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Connections section ── */}
        {activeSection === 'connections' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Connected apps</Text>

            {/* FIX: connectionCard was used in JSX but missing from StyleSheet — added below */}
            <View style={styles.connectionCard}>
              <View style={[styles.connectionLogo, { backgroundColor: '#fc4c02' }]}>
                <Text style={styles.connectionLogoText}>S</Text>
              </View>
              <View style={styles.connectionInfo}>
                <Text style={styles.connectionName}>Strava</Text>
                <Text style={styles.connectionStatus}>
                  {stravaLinked ? '✅ Connected — runs sync automatically' : 'Not connected'}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.connectionBtn, { borderColor: stravaLinked ? '#dc2626' : BRAND }]}
                onPress={() => setStravaVisible(true)}
              >
                <Text style={[styles.connectionBtnText, { color: stravaLinked ? '#dc2626' : BRAND }]}>
                  {stravaLinked ? 'Manage' : 'Connect'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.connectionCard, { opacity: 0.5 }]}>
              <View style={[styles.connectionLogo, { backgroundColor: '#003057' }]}>
                <Text style={styles.connectionLogoText}>G</Text>
              </View>
              <View style={styles.connectionInfo}>
                <Text style={styles.connectionName}>Garmin</Text>
                <Text style={styles.connectionStatus}>Coming soon</Text>
              </View>
              <View style={[styles.connectionBtn, { borderColor: '#ddd' }]}>
                <Text style={[styles.connectionBtnText, { color: '#ccc' }]}>Soon</Text>
              </View>
            </View>

            <View style={[styles.connectionCard, { opacity: 0.5 }]}>
              <View style={[styles.connectionLogo, { backgroundColor: '#ff3b30' }]}>
                <Text style={styles.connectionLogoText}>♥</Text>
              </View>
              <View style={styles.connectionInfo}>
                <Text style={styles.connectionName}>Apple Health</Text>
                <Text style={styles.connectionStatus}>Coming soon — iOS only</Text>
              </View>
              <View style={[styles.connectionBtn, { borderColor: '#ddd' }]}>
                <Text style={[styles.connectionBtnText, { color: '#ccc' }]}>Soon</Text>
              </View>
            </View>
          </View>
        )}

        {/* Sign out */}
        <View style={styles.signOutSection}>
          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
            <Text style={styles.signOutBtnText}>Sign out</Text>
          </TouchableOpacity>
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
  tabRow:             { flexDirection: 'row', backgroundColor: NEUTRAL.card, borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
  tab:                { flex: 1, paddingVertical: SPACE.md, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText:            { fontSize: FONT_SIZE.sm, color: NEUTRAL.body },
  scroll:             { flex: 1 },
  section:            { padding: SPACE.lg },
  sectionTitle:       { fontSize: 17, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: SPACE.md },
  card:               { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg, marginBottom: SPACE.lg, ...SHADOW.sm },
  cardTitle:          { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: SPACE.lg - 2 },
  fieldLabel:         { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: NEUTRAL.body, marginBottom: SPACE.sm, marginTop: SPACE.sm },
  fieldHint:          { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: -SPACE.sm, marginBottom: SPACE.sm },
  input:              { backgroundColor: NEUTRAL.bg, borderRadius: RADIUS.md, padding: SPACE.md, fontSize: FONT_SIZE.base, color: BRAND_DARK, borderWidth: 1, borderColor: NEUTRAL.border, marginBottom: SPACE.xs },
  genderRow:          { flexDirection: 'row', gap: SPACE.md, marginBottom: SPACE.lg },
  genderBtn:          { flex: 1, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: NEUTRAL.border, padding: SPACE.md, alignItems: 'center', backgroundColor: NEUTRAL.bg },
  genderBtnText:      { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: NEUTRAL.label },
  avatarColorRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md, marginBottom: SPACE.lg },
  avatarColorBtn:     { width: 36, height: 36, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
  avatarColorBtnActive: { borderWidth: 3, borderColor: NEUTRAL.card, ...SHADOW.md },
  toggleRow:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md },
  toggleInfo:         { flex: 1 },
  toggleLabel:        { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: BRAND_DARK, marginBottom: 3 },
  toggleHint:         { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, lineHeight: 17 },
  infoCard:           { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg, gap: SPACE.sm, ...SHADOW.sm },
  infoCardTitle:      { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: SPACE.xs },
  infoRow:            { fontSize: FONT_SIZE.sm, color: NEUTRAL.label },
  infoHint:           { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: SPACE.xs, lineHeight: 18 },
  emptyCard:          { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE['3xl'], alignItems: 'center', ...SHADOW.sm },
  emptyTitle:         { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, color: BRAND_DARK, marginBottom: SPACE.sm },
  emptySub:           { fontSize: FONT_SIZE.sm, color: NEUTRAL.muted, textAlign: 'center' },
  messageCard:        { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg - 2, marginBottom: SPACE.md, borderLeftWidth: 3, borderLeftColor: NEUTRAL.border, ...SHADOW.sm },
  messageHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.sm },
  messageDate:        { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, fontWeight: FONT_WEIGHT.semibold },
  messageSender:      { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted },
  messageText:        { fontSize: FONT_SIZE.base, color: BRAND_DARK, lineHeight: 22 },
  signOutSection:     { marginHorizontal: SPACE.lg, marginTop: SPACE.sm, marginBottom: SPACE.sm, alignItems: 'center' },
  signOutHint:        { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, textAlign: 'center', marginTop: SPACE.sm },
  connectionCard:     { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg - 2, marginBottom: SPACE.md, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, ...SHADOW.sm },
  connectionLogo:     { width: 44, height: 44, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  connectionLogoText: { color: '#fff', fontSize: FONT_SIZE.lg, fontWeight: '900' },
  connectionInfo:     { flex: 1 },
  connectionName:     { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  connectionStatus:   { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, marginTop: 2 },
  connectionBtn:      { borderRadius: RADIUS.sm, borderWidth: 1.5, paddingHorizontal: SPACE.lg - 2, paddingVertical: SPACE.sm },
  connectionBtnText:  { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },
});