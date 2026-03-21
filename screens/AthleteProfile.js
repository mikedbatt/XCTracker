import { signOut, updateEmail } from 'firebase/auth';
import {
  doc, getDoc, updateDoc
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';
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

  const primaryColor = school?.primaryColor || '#2e7d32';

  useEffect(() => {
    loadMessages();
    checkStrava();
  }, []);

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
      <View style={[styles.header, { backgroundColor: primaryColor }]}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Avatar block */}
      <View style={[styles.avatarSection, { backgroundColor: primaryColor }]}>
        <View style={styles.avatar}>
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
            style={[styles.tab, activeSection === s && { borderBottomColor: primaryColor, borderBottomWidth: 2 }]}
            onPress={() => setActiveSection(s)}
          >
            <Text style={[styles.tabText, activeSection === s && { color: primaryColor, fontWeight: '700' }]}>
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
                    style={[styles.genderBtn, gender === g && { backgroundColor: primaryColor, borderColor: primaryColor }]}
                    onPress={() => setGender(g)}
                  >
                    <Text style={[styles.genderBtnText, gender === g && { color: '#fff' }]}>
                      {g === 'boys' ? 'Boys team' : 'Girls team'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: primaryColor }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveBtnText}>Save changes</Text>
                }
              </TouchableOpacity>
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
              <ActivityIndicator color={primaryColor} style={{ marginTop: 20 }} />
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
                <View key={msg.id} style={[styles.messageCard, isToday && { borderLeftColor: primaryColor }]}>
                  <View style={styles.messageHeader}>
                    <Text style={[styles.messageDate, isToday && { color: primaryColor, fontWeight: '700' }]}>
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
                style={[styles.connectionBtn, { borderColor: stravaLinked ? '#dc2626' : primaryColor }]}
                onPress={() => setStravaVisible(true)}
              >
                <Text style={[styles.connectionBtnText, { color: stravaLinked ? '#dc2626' : primaryColor }]}>
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
  container:          { flex: 1, backgroundColor: '#f5f5f5' },
  header:             { paddingTop: 60, paddingBottom: 12, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:            { paddingVertical: 6, paddingHorizontal: 10 },
  backText:           { color: '#fff', fontSize: 17, fontWeight: '600' },
  headerTitle:        { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  avatarSection:      { alignItems: 'center', paddingBottom: 20, paddingTop: 4 },
  avatar:             { width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  avatarText:         { color: '#fff', fontSize: 26, fontWeight: 'bold' },
  avatarName:         { color: '#fff', fontSize: 20, fontWeight: '700' },
  avatarSub:          { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 3 },
  tabRow:             { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  tab:                { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText:            { fontSize: 13, color: '#666' },
  scroll:             { flex: 1 },
  section:            { padding: 16 },
  sectionTitle:       { fontSize: 17, fontWeight: '700', color: '#333', marginBottom: 12 },
  card:               { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 16 },
  cardTitle:          { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 14 },
  fieldLabel:         { fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 6, marginTop: 8 },
  fieldHint:          { fontSize: 11, color: '#bbb', marginTop: -8, marginBottom: 8 },
  input:              { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 13, fontSize: 15, color: '#333', borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 4 },
  genderRow:          { flexDirection: 'row', gap: 10, marginBottom: 16 },
  genderBtn:          { flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: '#ddd', padding: 12, alignItems: 'center', backgroundColor: '#f5f5f5' },
  genderBtnText:      { fontSize: 14, fontWeight: '700', color: '#444' },
  saveBtn:            { borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4 },
  saveBtnText:        { color: '#fff', fontSize: 16, fontWeight: '700' },
  infoCard:           { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 8 },
  infoCardTitle:      { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 4 },
  infoRow:            { fontSize: 14, color: '#555' },
  infoHint:           { fontSize: 12, color: '#999', marginTop: 4, lineHeight: 18 },
  emptyCard:          { backgroundColor: '#fff', borderRadius: 14, padding: 32, alignItems: 'center' },
  emptyTitle:         { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 6 },
  emptySub:           { fontSize: 14, color: '#999', textAlign: 'center' },
  messageCard:        { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#ddd' },
  messageHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  messageDate:        { fontSize: 13, color: '#666', fontWeight: '600' },
  messageSender:      { fontSize: 12, color: '#999' },
  messageText:        { fontSize: 15, color: '#333', lineHeight: 22 },
  signOutSection:     { marginHorizontal: 16, marginTop: 8, marginBottom: 8, alignItems: 'center' },
  signOutBtn:         { borderRadius: 12, borderWidth: 1.5, borderColor: '#dc2626', paddingVertical: 14, paddingHorizontal: 40, marginBottom: 8 },
  signOutBtnText:     { color: '#dc2626', fontSize: 16, fontWeight: '700' },
  signOutHint:        { fontSize: 12, color: '#bbb', textAlign: 'center' },
  // FIX: connectionCard was referenced in JSX but was missing from StyleSheet entirely
  connectionCard:     { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  connectionLogo:     { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  connectionLogoText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  connectionInfo:     { flex: 1 },
  connectionName:     { fontSize: 15, fontWeight: '700', color: '#333' },
  connectionStatus:   { fontSize: 12, color: '#666', marginTop: 2 },
  connectionBtn:      { borderRadius: 8, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 7 },
  connectionBtnText:  { fontSize: 13, fontWeight: '700' },
});