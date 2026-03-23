import { signOut, updateEmail } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import React, { useState } from 'react';
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

export default function CoachProfile({ userData, school, pendingAthletes = [], onApproveAthlete, onDenyAthlete, onClose, onUpdated }) {
  const [firstName, setFirstName] = useState(userData.firstName || '');
  const [lastName,  setLastName]  = useState(userData.lastName  || '');
  const [email,     setEmail]     = useState(userData.email     || '');
  const [saving,    setSaving]    = useState(false);

  const primaryColor = school?.primaryColor || '#2e7d32';

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
      <View style={[styles.header, { backgroundColor: primaryColor }]}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={[styles.avatarSection, { backgroundColor: primaryColor }]}>
        <View style={styles.avatar}>
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
            <Text style={styles.infoCardTitle}>School info</Text>
            <Text style={styles.infoRow}>🏫  {school?.name || 'School not set'}</Text>
            <Text style={styles.infoRow}>🔑  Join code: {school?.joinCode || '—'}</Text>
            <Text style={styles.infoHint}>
              Share this join code with athletes so they can join your team.
            </Text>
          </View>
        </View>

        {pendingAthletes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.pendingTitle}>Pending Approvals ({pendingAthletes.length})</Text>
            {pendingAthletes.map(athlete => (
              <View key={athlete.id} style={styles.pendingCard}>
                <View style={styles.pendingInfo}>
                  <Text style={styles.pendingName}>{athlete.firstName} {athlete.lastName}</Text>
                  <Text style={styles.pendingEmail}>{athlete.email}</Text>
                </View>
                <View style={styles.pendingBtns}>
                  <TouchableOpacity style={[styles.approveBtn, { backgroundColor: primaryColor }]} onPress={() => onApproveAthlete && onApproveAthlete(athlete)}>
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.denyBtn} onPress={() => onDenyAthlete && onDenyAthlete(athlete)}>
                    <Text style={styles.denyBtnText}>Deny</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

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
  scroll:             { flex: 1 },
  section:            { padding: 16 },
  card:               { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 16 },
  cardTitle:          { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 14 },
  fieldLabel:         { fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 6, marginTop: 8 },
  fieldHint:          { fontSize: 11, color: '#bbb', marginTop: -8, marginBottom: 8 },
  input:              { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 13, fontSize: 15, color: '#333', borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 4 },
  saveBtn:            { borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4 },
  saveBtnText:        { color: '#fff', fontSize: 16, fontWeight: '700' },
  infoCard:           { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 8 },
  infoCardTitle:      { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 4 },
  infoRow:            { fontSize: 14, color: '#555' },
  infoHint:           { fontSize: 12, color: '#999', marginTop: 4, lineHeight: 18 },
  section:            { padding: 16 },
  pendingTitle:       { fontSize: 17, fontWeight: '700', color: '#333', marginBottom: 10 },
  pendingCard:        { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  pendingInfo:        { flex: 1 },
  pendingName:        { fontSize: 14, fontWeight: '600', color: '#333' },
  pendingEmail:       { fontSize: 12, color: '#999', marginTop: 2 },
  pendingBtns:        { flexDirection: 'row', gap: 6 },
  approveBtn:         { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  approveBtnText:     { color: '#fff', fontSize: 12, fontWeight: '700' },
  denyBtn:            { borderRadius: 8, borderWidth: 1, borderColor: '#dc2626', paddingHorizontal: 12, paddingVertical: 6 },
  denyBtnText:        { color: '#dc2626', fontSize: 12, fontWeight: '700' },
  signOutSection:     { marginHorizontal: 16, marginTop: 8, marginBottom: 8, alignItems: 'center' },
  signOutBtn:         { borderRadius: 12, borderWidth: 1.5, borderColor: '#dc2626', paddingVertical: 14, paddingHorizontal: 40, marginBottom: 8 },
  signOutBtnText:     { color: '#dc2626', fontSize: 16, fontWeight: '700' },
  signOutHint:        { fontSize: 12, color: '#bbb', textAlign: 'center' },
});
