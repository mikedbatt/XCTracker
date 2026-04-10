import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { signOut, updateEmail } from 'firebase/auth';
import {
  arrayRemove, doc, getDoc, updateDoc
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
import { calcVDOT, getTrainingPaces, formatPace, parseTimeToSeconds, RACE_DISTANCES } from '../utils/vdotUtils';
import StravaConnect from './StravaConnect';

export default function AthleteProfile({ userData, school, coachDisabledHR = false, onClose, onUpdated, refreshUser }) {
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
  const [linkedParents, setLinkedParents] = useState([]);
  const [vdotDistance, setVdotDistance] = useState(userData.vdotDistance || '5K');
  const [vdotTimeStr, setVdotTimeStr] = useState(userData.vdotTime || '');
  const [vdotScore, setVdotScore] = useState(userData.vdot || null);
  const [vdotPaces, setVdotPaces] = useState(userData.vdot ? getTrainingPaces(userData.vdot) : null);
  const [savingVdot, setSavingVdot] = useState(false);

  useEffect(() => {
    loadMessages();
    checkStrava();
    loadHRZonePref();
    loadLinkedParents();
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
    } catch (e) { console.warn('Strava check:', e); }
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
    } catch (e) { console.warn('Messages load:', e); }
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

  const handleVdotCalculate = () => {
    const timeSec = parseTimeToSeconds(vdotTimeStr);
    if (!timeSec || timeSec <= 0) { Alert.alert('Invalid time', 'Enter a valid time in MM:SS or HH:MM:SS format.'); return; }
    const dist = RACE_DISTANCES[vdotDistance];
    if (!dist) return;
    const score = calcVDOT(dist, timeSec);
    if (!score) { Alert.alert('Error', 'Could not calculate VDOT from that time.'); return; }
    setVdotScore(score);
    setVdotPaces(getTrainingPaces(score));
  };

  const handleVdotSave = async () => {
    if (!vdotScore || !vdotPaces) { Alert.alert('Calculate first', 'Enter a race time and tap Calculate before saving.'); return; }
    setSavingVdot(true);
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        vdotDistance,
        vdotTime: vdotTimeStr,
        vdot: vdotScore,
        trainingPaces: vdotPaces,
        vdotUpdatedAt: new Date().toISOString(),
      });
      Alert.alert('Saved!', 'Your training paces have been updated.');
      onUpdated && onUpdated({ vdot: vdotScore, trainingPaces: vdotPaces, vdotDistance, vdotTime: vdotTimeStr, vdotUpdatedAt: new Date().toISOString() });
    } catch (e) {
      console.warn('Failed to save VDOT:', e);
      Alert.alert('Error', 'Could not save. Please try again.');
    }
    setSavingVdot(false);
  };

  const loadLinkedParents = async () => {
    try {
      // Fetch fresh from Firestore — userData prop may be stale
      const freshSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const freshData = freshSnap.exists() ? freshSnap.data() : {};
      const allIds = [...(freshData.linkedParentIds || []), ...(freshData.pendingParentIds || [])];
      const parentIds = [...new Set(allIds)];
      if (parentIds.length === 0) { setLinkedParents([]); return; }
      const parents = [];
      for (const pid of parentIds) {
        const snap = await getDoc(doc(db, 'users', pid));
        if (snap.exists()) parents.push({ id: snap.id, ...snap.data() });
      }
      setLinkedParents(parents);
    } catch (e) { console.warn('Failed to load linked parents:', e); }
  };

  const handleRemoveParent = (parent) => {
    Alert.alert(
      'Remove parent?',
      `${parent.firstName} ${parent.lastName} will no longer be able to see your training data.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await updateDoc(doc(db, 'users', auth.currentUser.uid), {
              linkedParentIds: arrayRemove(parent.id),
            });
            await updateDoc(doc(db, 'users', parent.id), {
              linkedAthleteIds: arrayRemove(auth.currentUser.uid),
            });
            setLinkedParents(prev => prev.filter(p => p.id !== parent.id));
          } catch (e) { console.warn('Failed to remove parent:', e); }
        }},
      ]
    );
  };

  const handleLeaveTeam = () => {
    if (!userData.schoolId) return; // nothing to leave
    Alert.alert(
      'Leave team?',
      `You'll be removed from ${school?.name || 'your school'} and your runs will stop being shared with that coach. You can join a different school right after.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave team', style: 'destructive', onPress: async () => {
          try {
            const uid = auth.currentUser.uid;
            const oldSchoolId = userData.schoolId;

            // Clear school + group + status from the user doc. Leaving null
            // (rather than deleting) keeps the field present so AppNavigator's
            // schoolId check works correctly.
            await updateDoc(doc(db, 'users', uid), {
              schoolId: null,
              groupId: null,
              status: null,
            });

            // Remove from the school's athleteIds and pendingAthleteIds arrays.
            // arrayRemove on a non-existent value is a no-op so it's safe to
            // call both unconditionally.
            try {
              await updateDoc(doc(db, 'schools', oldSchoolId), {
                athleteIds: arrayRemove(uid),
                pendingAthleteIds: arrayRemove(uid),
              });
            } catch (e) {
              // Coach-update permission can be denied here if the rule check
              // happens after the user doc's schoolId is already cleared.
              // Not fatal — the array entry just lingers; the coach roster
              // UI filters by user.schoolId so it won't show.
              console.warn('Failed to remove from school arrays:', e);
            }

            // Trigger AppNavigator to re-evaluate onboarding step. Since
            // schoolId is now null + role is athlete, the user lands in
            // AthleteJoinScreen automatically.
            if (refreshUser) await refreshUser();
          } catch (e) {
            console.warn('Leave team failed:', e);
            Alert.alert('Could not leave team', 'Something went wrong. Please try again.');
          }
        }},
      ]
    );
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: async () => {
          await SecureStore.deleteItemAsync('xctracker_email');
          await SecureStore.deleteItemAsync('xctracker_password');
          signOut(auth);
        }},
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[styles.tabText, activeSection === s && { color: BRAND, fontWeight: '700' }]}>
                {sectionLabels[s]}
                {s === 'messages' && messages.length > 0 ? ` (${messages.length})` : ''}
              </Text>
              {s === 'connections' && linkedParents.length > 0 && (
                <View style={{ backgroundColor: STATUS.error, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{linkedParents.length}</Text>
                </View>
              )}
            </View>
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
              {coachDisabledHR ? (
                <View style={styles.coachDisabledRow}>
                  <Ionicons name="information-circle-outline" size={18} color={NEUTRAL.muted} />
                  <Text style={styles.coachDisabledText}>Heart rate zones are turned off by your coach</Text>
                </View>
              ) : (
                <View style={styles.toggleRow}>
                  <View style={styles.toggleInfo}>
                    <Text style={styles.toggleLabel}>Show heart rate zones</Text>
                    <Text style={styles.toggleHint}>Turn off if you don't use a HR monitor or prefer to train by feel</Text>
                  </View>
                  <Switch
                    value={showHRZones}
                    onValueChange={handleToggleHRZones}
                    disabled={!hrZoneLoaded}
                    trackColor={{ false: NEUTRAL.border, true: BRAND }}
                    thumbColor="#fff"
                  />
                </View>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Training paces (VDOT)</Text>
              <Text style={styles.fieldHint}>Enter a recent race time to calculate your personalized training paces.</Text>

              <Text style={styles.fieldLabel}>Race distance</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACE.sm }}>
                {Object.keys(RACE_DISTANCES).map(d => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.genderBtn, { flex: 0, paddingHorizontal: SPACE.lg - 2, marginRight: SPACE.sm }, vdotDistance === d && { backgroundColor: BRAND, borderColor: BRAND }]}
                    onPress={() => { setVdotDistance(d); setVdotScore(null); setVdotPaces(null); }}
                  >
                    <Text style={[styles.genderBtnText, vdotDistance === d && { color: '#fff' }]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.fieldLabel}>Finish time</Text>
              <TextInput
                style={styles.input}
                value={vdotTimeStr}
                onChangeText={setVdotTimeStr}
                placeholder={vdotDistance === 'Mile' || vdotDistance === '1500m' ? 'e.g. 5:30' : 'e.g. 20:00'}
                placeholderTextColor={NEUTRAL.muted}
                keyboardType="numbers-and-punctuation"
              />

              <Button
                label="Calculate"
                variant="secondary"
                onPress={handleVdotCalculate}
                style={{ marginTop: SPACE.xs }}
              />

              {vdotPaces && (
                <View style={{ marginTop: SPACE.lg }}>
                  <Text style={[styles.fieldLabel, { marginTop: 0 }]}>VDOT: {vdotScore} — Your training paces</Text>
                  <View style={styles.paceGrid}>
                    <View style={[styles.paceRow, { backgroundColor: '#4caf50' + '18' }]}>
                      <Text style={[styles.paceZoneLabel, { color: '#4caf50' }]}>Easy</Text>
                      <Text style={styles.paceValue}>{formatPace(vdotPaces.eLow)} – {formatPace(vdotPaces.eHigh)} /mi</Text>
                    </View>
                    <View style={[styles.paceRow, { backgroundColor: '#2196f3' + '18' }]}>
                      <Text style={[styles.paceZoneLabel, { color: '#2196f3' }]}>Marathon</Text>
                      <Text style={styles.paceValue}>{formatPace(vdotPaces.m)} /mi</Text>
                    </View>
                    <View style={[styles.paceRow, { backgroundColor: '#ff9800' + '18' }]}>
                      <Text style={[styles.paceZoneLabel, { color: '#ff9800' }]}>Threshold</Text>
                      <Text style={styles.paceValue}>{formatPace(vdotPaces.t)} /mi</Text>
                    </View>
                    <View style={[styles.paceRow, { backgroundColor: '#e91e63' + '18' }]}>
                      <Text style={[styles.paceZoneLabel, { color: '#e91e63' }]}>Interval</Text>
                      <Text style={styles.paceValue}>{formatPace(vdotPaces.i)} /mi</Text>
                    </View>
                    <View style={[styles.paceRow, { backgroundColor: '#9c27b0' + '18' }]}>
                      <Text style={[styles.paceZoneLabel, { color: '#9c27b0' }]}>Repetition</Text>
                      <Text style={styles.paceValue}>{formatPace(vdotPaces.r)} /mi</Text>
                    </View>
                  </View>
                  <Button
                    label="Save training paces"
                    onPress={handleVdotSave}
                    loading={savingVdot}
                    style={{ marginTop: SPACE.md }}
                  />
                </View>
              )}
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

            {/* Connected Parents */}
            <Text style={[styles.sectionTitle, { marginTop: SPACE.xl }]}>Connected parents</Text>
            {linkedParents.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No parents connected</Text>
                <Text style={styles.emptySub}>Parents can link to your account using your email address.</Text>
              </View>
            ) : linkedParents.map(parent => (
              <View key={parent.id} style={styles.connectionCard}>
                <View style={[styles.connectionLogo, { backgroundColor: BRAND }]}>
                  <Text style={styles.connectionLogoText}>{parent.firstName?.[0]}{parent.lastName?.[0]}</Text>
                </View>
                <View style={styles.connectionInfo}>
                  <Text style={styles.connectionName}>{parent.firstName} {parent.lastName}</Text>
                  <Text style={styles.connectionStatus}>{parent.email}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.connectionBtn, { borderColor: STATUS.error }]}
                  onPress={() => handleRemoveParent(parent)}
                >
                  <Text style={[styles.connectionBtnText, { color: STATUS.error }]}>Remove</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Leave team — only shown when the athlete is connected to a school */}
        {userData.schoolId && school?.name && (
          <View style={styles.signOutSection}>
            <Button
              label="Leave team"
              variant="destructive"
              onPress={handleLeaveTeam}
              style={{ paddingHorizontal: SPACE['4xl'] }}
            />
            <Text style={styles.signOutHint}>
              Removes you from {school.name} so you can join a different school. You'll keep your account and runs.
            </Text>
          </View>
        )}

        {/* Sign out */}
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
  coachDisabledRow:   { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, backgroundColor: NEUTRAL.bg, borderRadius: RADIUS.md, padding: SPACE.md },
  coachDisabledText:  { fontSize: FONT_SIZE.sm, color: NEUTRAL.muted, flex: 1 },
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
  paceGrid:           { gap: SPACE.xs, marginTop: SPACE.sm },
  paceRow:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: RADIUS.md, paddingVertical: SPACE.sm + 2, paddingHorizontal: SPACE.md },
  paceZoneLabel:      { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },
  paceValue:          { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: BRAND_DARK },
  connectionBtn:      { borderRadius: RADIUS.sm, borderWidth: 1.5, paddingHorizontal: SPACE.lg - 2, paddingVertical: SPACE.sm },
  connectionBtnText:  { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },
});