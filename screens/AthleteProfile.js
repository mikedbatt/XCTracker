import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import { signOut, updateEmail } from 'firebase/auth';
import {
  arrayRemove, collection, doc, getDoc, getDocs, orderBy, query, updateDoc, where
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';
import {
  AVATAR_COLORS, BRAND, BRAND_DARK, BRAND_LIGHT,
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SIGNAL, SPACE, STATUS, STRAVA_ORANGE,
} from '../constants/design';
import { calcVDOT, getTrainingPaces, formatPace, parseTimeToSeconds, RACE_DISTANCES } from '../utils/vdotUtils';
import StravaConnect from './StravaConnect';

export default function AthleteProfile({ userData, school, onClose, onUpdated, refreshUser, goToJoinScreen }) {
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
  const [avatarColor,   setAvatarColor]   = useState(userData.avatarColor || SIGNAL.color.indigo);
  const [linkedParents, setLinkedParents] = useState([]);
  // Tracks which connected parent IDs the athlete has already acknowledged.
  // Persisted on the user doc so the badge stays cleared across sessions.
  // When a new parent connects, their ID won't be in this list yet, so the
  // unseen badge appears until the athlete visits the Connections tab.
  const [seenParentIds, setSeenParentIds] = useState(userData.seenParentIds || []);
  const [vdotDistance, setVdotDistance] = useState(userData.vdotDistance || '5K');
  const [vdotTimeStr, setVdotTimeStr] = useState(userData.vdotTime || '');
  const [vdotScore, setVdotScore] = useState(userData.vdot || null);
  const [vdotPaces, setVdotPaces] = useState(userData.vdot ? getTrainingPaces(userData.vdot) : null);
  const [savingVdot, setSavingVdot] = useState(false);

  useEffect(() => {
    loadMessages();
    checkStrava();
    loadLinkedParents();
  }, []);

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

      // Single range query replaces 30 serial getDoc calls.
      // Needs a composite index on (schoolId, date) — Firestore will prompt on first run.
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const cutoff = thirtyDaysAgo.toISOString().split('T')[0];

      const snap = await getDocs(query(
        collection(db, 'dailyMessages'),
        where('schoolId', '==', userData.schoolId),
        where('date', '>=', cutoff),
        orderBy('date', 'desc')
      ));
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
      Alert.alert('Saved', 'Your profile has been updated.');
      onUpdated && onUpdated(updates);
    } catch {
      Alert.alert('Error', 'Could not save. Please try again.');
    }
    setSaving(false);
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

  // Compute how many of the currently-loaded parents the athlete has not
  // yet acknowledged. Used to show the badge on the Connections tab AND
  // on the Connected Parents section header.
  const unseenParentCount = linkedParents.filter(p => !seenParentIds.includes(p.id)).length;

  // Write the current parent IDs into the user doc as "seen". Called when
  // the athlete opens the Connections tab — this is the moment we treat as
  // acknowledgment. Idempotent: bails if there are no new IDs to add.
  const markParentsSeen = async () => {
    if (linkedParents.length === 0) return;
    const allIds = linkedParents.map(p => p.id);
    const hasNew = allIds.some(id => !seenParentIds.includes(id));
    if (!hasNew) return;
    setSeenParentIds(allIds);
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), { seenParentIds: allIds });
    } catch (e) { console.warn('Failed to mark parents seen:', e); }
  };

  // Mark seen as soon as the user lands on the Connections tab AND parents
  // have finished loading. Re-runs if the loaded parent list changes (e.g.
  // a new parent connects while the user is on the tab).
  useEffect(() => {
    if (activeSection === 'connections' && linkedParents.length > 0) {
      markParentsSeen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, linkedParents]);

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
  const sectionLabels = {
    profile: 'Profile',
    messages: messages.length > 0 ? `Messages (${messages.length})` : 'Messages',
    connections: 'Connections',
  };

  // Pace zone rows — color-keyed indicator + label + pace value
  const paceRows = vdotPaces ? [
    { key: 'E', name: 'Easy',      pace: `${formatPace(vdotPaces.eLow)} – ${formatPace(vdotPaces.eHigh)}`, color: SIGNAL.color.lime },
    { key: 'M', name: 'Marathon',  pace: formatPace(vdotPaces.m),                                          color: SIGNAL.color.emerald },
    { key: 'T', name: 'Threshold', pace: formatPace(vdotPaces.t),                                          color: SIGNAL.color.amber },
    { key: 'I', name: 'Interval',  pace: formatPace(vdotPaces.i),                                          color: SIGNAL.color.coral },
    { key: 'R', name: 'Rep',       pace: formatPace(vdotPaces.r),                                          color: SIGNAL.color.violet },
  ] : [];

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

      {/* Avatar block — solid color from athlete's avatarColor */}
      <View style={styles.avatarSection}>
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>
            {(firstName[0] || '?').toUpperCase()}{(lastName[0] || '').toUpperCase()}
          </Text>
        </View>
        <Text style={styles.avatarName}>{firstName} {lastName}</Text>
        <Text style={styles.avatarSub}>
          {school?.name || 'No school'}
          {gender ? `  ·  ${gender === 'boys' ? 'Boys team' : 'Girls team'}` : ''}
        </Text>
      </View>

      {/* Section tabs */}
      <View style={styles.tabRow}>
        {sections.map(s => {
          const active = activeSection === s;
          return (
            <TouchableOpacity
              key={s}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setActiveSection(s)}
              activeOpacity={0.7}
            >
              <View style={styles.tabInner}>
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {sectionLabels[s]}
                </Text>
                {s === 'connections' && unseenParentCount > 0 && (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{unseenParentCount}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Profile section ── */}
        {activeSection === 'profile' && (
          <>
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

              <Text style={[styles.eyebrow, { marginTop: 14 }]}>I compete on the</Text>
              <View style={styles.segmentRow}>
                {['boys', 'girls'].map(g => {
                  const active = gender === g;
                  return (
                    <TouchableOpacity
                      key={g}
                      style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                      onPress={() => setGender(g)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.segmentBtnText, active && styles.segmentBtnTextActive]}>
                        {g === 'boys' ? 'Boys' : 'Girls'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

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

            {/* VDOT paces */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Training paces (VDOT)</Text>
              <Text style={styles.cardSub}>Enter a recent race time to calculate personalized paces.</Text>

              <Text style={[styles.eyebrow, { marginTop: 12 }]}>Race distance</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ gap: 7 }}>
                {Object.keys(RACE_DISTANCES).map(d => {
                  const active = vdotDistance === d;
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[styles.pill, active && styles.pillActive]}
                      onPress={() => { setVdotDistance(d); setVdotScore(null); setVdotPaces(null); }}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.pillText, active && styles.pillTextActive]}>{d}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={[styles.eyebrow, { marginTop: 14 }]}>Finish time</Text>
              <View style={styles.timeRow}>
                <TextInput
                  style={styles.timeInput}
                  value={vdotTimeStr}
                  onChangeText={setVdotTimeStr}
                  placeholder={vdotDistance === 'Mile' || vdotDistance === '1500m' ? '5:30' : '20:00'}
                  placeholderTextColor={SIGNAL.color.mute2}
                  keyboardType="numbers-and-punctuation"
                />
                <TouchableOpacity
                  style={styles.calcBtn}
                  onPress={handleVdotCalculate}
                  activeOpacity={0.85}
                >
                  <Text style={styles.calcBtnText}>Calculate</Text>
                </TouchableOpacity>
              </View>

              {vdotPaces && (
                <LinearGradient
                  colors={[SIGNAL.color.indigo + '14', SIGNAL.color.violet + '10']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.vdotResult}
                >
                  <View style={styles.vdotResultHeader}>
                    <Text style={[styles.eyebrow, { color: SIGNAL.color.indigo, marginTop: 0 }]}>VDOT score</Text>
                    <Text style={styles.vdotScoreNum}>{vdotScore}</Text>
                  </View>
                  {paceRows.map(row => (
                    <View key={row.key} style={styles.paceRow}>
                      <View style={[styles.paceTag, { backgroundColor: row.color + '1A' }]}>
                        <Text style={[styles.paceTagText, { color: row.color }]}>{row.key}</Text>
                      </View>
                      <Text style={styles.paceName}>{row.name}</Text>
                      <Text style={styles.paceValue}>{row.pace}/mi</Text>
                    </View>
                  ))}
                  <TouchableOpacity
                    style={[styles.primaryBtn, { marginTop: 14 }, savingVdot && { opacity: 0.6 }]}
                    onPress={handleVdotSave}
                    disabled={savingVdot}
                    activeOpacity={0.85}
                  >
                    {savingVdot
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.primaryBtnText}>Save paces</Text>}
                  </TouchableOpacity>
                </LinearGradient>
              )}
            </View>

            {/* Account info */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Account info</Text>
              <View style={styles.infoRow}>
                <Ionicons name="school-outline" size={16} color={SIGNAL.color.mute} />
                <Text style={styles.infoText}>{school?.name || 'School not set'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="key-outline" size={16} color={SIGNAL.color.mute} />
                <Text style={styles.infoText}>Join code: {school?.joinCode || '—'}</Text>
              </View>
              <Text style={styles.fieldHint}>
                To switch schools, sign out and sign up again with a different school join code.
              </Text>
            </View>
          </>
        )}

        {/* ── Messages section ── */}
        {activeSection === 'messages' && (
          <>
            <Text style={[styles.eyebrow, { marginTop: 0, marginBottom: 10, paddingLeft: 4 }]}>
              Coach messages — last 30 days
            </Text>
            {loadingMsgs ? (
              <ActivityIndicator color={SIGNAL.color.indigo} style={{ marginTop: 20 }} />
            ) : messages.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No messages yet</Text>
                <Text style={styles.emptySub}>Your coach's daily messages will appear here.</Text>
              </View>
            ) : messages.map(msg => {
              const today = new Date().toISOString().split('T')[0];
              const isToday = msg.date === today;
              const msgDate = new Date(msg.date + 'T12:00:00')
                .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              return (
                <View key={msg.id} style={styles.messageCard}>
                  <View style={styles.messageHeader}>
                    <Text style={styles.messageSender}>{msg.sentByName || 'Coach'}</Text>
                    <Text style={[styles.messageDate, isToday && { color: SIGNAL.color.indigo, fontFamily: SIGNAL.font.bodySemi }]}>
                      {isToday ? 'Today' : msgDate}
                    </Text>
                  </View>
                  <Text style={styles.messageText}>{msg.message}</Text>
                </View>
              );
            })}
          </>
        )}

        {/* ── Connections section ── */}
        {activeSection === 'connections' && (
          <>
            <Text style={[styles.eyebrow, { marginTop: 0, marginBottom: 10, paddingLeft: 4 }]}>Connected apps</Text>

            {/* Strava */}
            <View style={styles.connectionCard}>
              <View style={[styles.connectionLogo, { backgroundColor: STRAVA_ORANGE + '1A' }]}>
                <Text style={[styles.connectionLogoText, { color: STRAVA_ORANGE }]}>S</Text>
              </View>
              <View style={styles.connectionInfo}>
                <Text style={styles.connectionName}>Strava</Text>
                <Text style={[
                  styles.connectionStatus,
                  { color: stravaLinked ? SIGNAL.color.emerald : SIGNAL.color.mute },
                ]}>
                  {stravaLinked ? '● Connected · auto-syncing' : 'Not connected'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setStravaVisible(true)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[
                  styles.connectionAction,
                  { color: stravaLinked ? SIGNAL.color.coral : SIGNAL.color.indigo },
                ]}>
                  {stravaLinked ? 'Disconnect' : 'Connect'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Garmin — coming soon */}
            <View style={[styles.connectionCard, { opacity: 0.5 }]}>
              <View style={[styles.connectionLogo, { backgroundColor: '#00305718' }]}>
                <Text style={[styles.connectionLogoText, { color: '#003057' }]}>G</Text>
              </View>
              <View style={styles.connectionInfo}>
                <Text style={styles.connectionName}>Garmin</Text>
                <Text style={[styles.connectionStatus, { color: SIGNAL.color.mute }]}>Coming soon</Text>
              </View>
              <Text style={[styles.connectionAction, { color: SIGNAL.color.mute2 }]}>Soon</Text>
            </View>

            {/* Apple Health — coming soon */}
            <View style={[styles.connectionCard, { opacity: 0.5 }]}>
              <View style={[styles.connectionLogo, { backgroundColor: '#ff3b3018' }]}>
                <Text style={[styles.connectionLogoText, { color: '#ff3b30' }]}>♥</Text>
              </View>
              <View style={styles.connectionInfo}>
                <Text style={styles.connectionName}>Apple Health</Text>
                <Text style={[styles.connectionStatus, { color: SIGNAL.color.mute }]}>Coming soon — iOS only</Text>
              </View>
              <Text style={[styles.connectionAction, { color: SIGNAL.color.mute2 }]}>Soon</Text>
            </View>

            {/* Connected parents */}
            <View style={styles.parentsHeader}>
              <Text style={[styles.eyebrow, { marginTop: 0, paddingLeft: 4 }]}>Connected parents</Text>
              {unseenParentCount > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{unseenParentCount}</Text>
                </View>
              )}
            </View>
            {linkedParents.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No parents connected</Text>
                <Text style={styles.emptySub}>Parents can link to your account using your email address.</Text>
              </View>
            ) : linkedParents.map(parent => (
              <View key={parent.id} style={styles.connectionCard}>
                <View style={[styles.parentAvatar, { backgroundColor: parent.avatarColor || SIGNAL.color.pink }]}>
                  <Text style={styles.parentAvatarText}>
                    {(parent.firstName?.[0] || '').toUpperCase()}{(parent.lastName?.[0] || '').toUpperCase()}
                  </Text>
                </View>
                <View style={styles.connectionInfo}>
                  <Text style={styles.connectionName}>{parent.firstName} {parent.lastName}</Text>
                  <Text style={[styles.connectionStatus, { color: SIGNAL.color.mute }]}>{parent.email}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleRemoveParent(parent)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.connectionAction, { color: SIGNAL.color.coral }]}>Remove</Text>
                </TouchableOpacity>
              </View>
            ))}

            {/* Account actions */}
            <View style={styles.accountActions}>
              {/* Leave team — only when athlete is on a team */}
              {userData.schoolId && school?.name && (
                <>
                  <TouchableOpacity
                    style={styles.outlineBtn}
                    onPress={handleLeaveTeam}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.outlineBtnText}>Leave team</Text>
                  </TouchableOpacity>
                  <Text style={styles.actionHint}>
                    Removes you from {school.name} so you can join a different school. You'll keep your account and runs.
                  </Text>
                </>
              )}

              {/* Find a school — when athlete has no school */}
              {!userData.schoolId && goToJoinScreen && (
                <>
                  <TouchableOpacity
                    style={[styles.primaryBtn, { marginTop: 0 }]}
                    onPress={() => { onClose && onClose(); goToJoinScreen(); }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.primaryBtnText}>Find a school</Text>
                  </TouchableOpacity>
                  <Text style={styles.actionHint}>
                    Search for your school by name or enter a join code from your coach.
                  </Text>
                </>
              )}

              {/* Sign out — destructive, always shown */}
              <TouchableOpacity
                style={styles.destructiveBtn}
                onPress={handleSignOut}
                activeOpacity={0.8}
              >
                <Text style={styles.destructiveBtnText}>Sign out</Text>
              </TouchableOpacity>
              <Text style={styles.actionHint}>You'll need your email and password to sign back in.</Text>
            </View>
          </>
        )}

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

  // ── Tabs ────────────────────────────────────────────────────────────────
  tabRow: {
    flexDirection: 'row',
    backgroundColor: SIGNAL.color.white,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  tab: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: SIGNAL.color.indigo,
  },
  tabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabText: {
    fontSize: 18,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.mute,
  },
  tabTextActive: {
    color: SIGNAL.color.indigo,
  },
  tabBadge: {
    backgroundColor: SIGNAL.color.coral,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  tabBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: SIGNAL.font.bodyBold,
    fontWeight: '700',
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
  cardSub: {
    fontSize: 11.5,
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.body,
    marginBottom: 4,
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

  // ── Segment / pill buttons ──────────────────────────────────────────────
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 9,
    backgroundColor: SIGNAL.color.paper,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  segmentBtnActive: {
    backgroundColor: SIGNAL.color.indigo,
    borderColor: SIGNAL.color.indigo,
  },
  segmentBtnText: {
    fontSize: 12.5,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.inkSoft,
  },
  segmentBtnTextActive: {
    color: '#fff',
  },

  pill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: SIGNAL.color.white,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  pillActive: {
    backgroundColor: SIGNAL.color.indigo,
    borderColor: SIGNAL.color.indigo,
  },
  pillText: {
    fontSize: 12,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.inkSoft,
  },
  pillTextActive: {
    color: '#fff',
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

  // ── Primary action button ───────────────────────────────────────────────
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

  // ── Toggle (custom RN switch matching Signal spec) ──────────────────────
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleInfo: { flex: 1 },
  toggleLabel: {
    fontSize: 13.5,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.ink,
  },
  toggleHint: {
    fontSize: 11.5,
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.body,
    marginTop: 2,
    lineHeight: 16,
  },
  switchTrack: {
    width: 46,
    height: 28,
    borderRadius: 999,
    position: 'relative',
    justifyContent: 'center',
  },
  switchKnob: {
    position: 'absolute',
    top: 3,
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },

  coachDisabledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: SIGNAL.color.paper,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  coachDisabledText: {
    fontSize: 13,
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.body,
    flex: 1,
  },

  // ── VDOT result card ────────────────────────────────────────────────────
  timeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  timeInput: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: SIGNAL.font.mono,
    fontWeight: '600',
    color: SIGNAL.color.ink,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  calcBtn: {
    backgroundColor: SIGNAL.color.indigo,
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calcBtnText: {
    color: '#fff',
    fontSize: 13.5,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
  },

  vdotResult: {
    marginTop: 14,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SIGNAL.color.indigo + '22',
  },
  vdotResultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  vdotScoreNum: {
    fontSize: 22,
    fontFamily: SIGNAL.font.bodyBold,
    fontWeight: '700',
    color: SIGNAL.color.indigo,
    letterSpacing: -0.5,
  },
  paceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 5,
  },
  paceTag: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paceTagText: {
    fontSize: 10,
    fontFamily: SIGNAL.font.bodyBold,
    fontWeight: '700',
  },
  paceName: {
    flex: 1,
    fontSize: 12.5,
    color: SIGNAL.color.inkSoft,
    fontFamily: SIGNAL.font.body,
  },
  paceValue: {
    fontSize: 12.5,
    fontFamily: SIGNAL.font.mono,
    fontWeight: '600',
    color: SIGNAL.color.ink,
  },

  // ── Account info ────────────────────────────────────────────────────────
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

  // ── Empty state ─────────────────────────────────────────────────────────
  emptyCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  emptyTitle: {
    fontSize: 14,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.ink,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 12.5,
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.body,
    textAlign: 'center',
    lineHeight: 18,
  },

  // ── Messages ────────────────────────────────────────────────────────────
  messageCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    marginBottom: 10,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  messageSender: {
    fontSize: 12,
    fontFamily: SIGNAL.font.bodyBold,
    fontWeight: '700',
    color: SIGNAL.color.indigo,
  },
  messageDate: {
    fontSize: 11,
    color: SIGNAL.color.mute2,
    fontFamily: SIGNAL.font.body,
  },
  messageText: {
    fontSize: 14,
    color: SIGNAL.color.inkSoft,
    fontFamily: SIGNAL.font.body,
    lineHeight: 20,
  },

  // ── Connections ─────────────────────────────────────────────────────────
  connectionCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  connectionLogo: {
    width: 36,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectionLogoText: {
    fontSize: 17,
    fontFamily: SIGNAL.font.bodyBold,
    fontWeight: '800',
  },
  connectionInfo: { flex: 1 },
  connectionName: {
    fontSize: 13.5,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.ink,
  },
  connectionStatus: {
    fontSize: 11.5,
    fontFamily: SIGNAL.font.body,
    marginTop: 1,
  },
  connectionAction: {
    fontSize: 12.5,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
  },

  parentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 8,
  },
  parentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  parentAvatarText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: SIGNAL.font.bodyBold,
    fontWeight: '700',
  },

  // ── Account actions (Leave team / Sign out) ─────────────────────────────
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
