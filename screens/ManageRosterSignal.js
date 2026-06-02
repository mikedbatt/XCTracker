import { Ionicons } from '@expo/vector-icons';
import {
  arrayRemove, arrayUnion, collection, doc, getDocs, query, updateDoc, where,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Platform,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { db } from '../firebaseConfig';
import { SIGNAL } from '../constants/design';

// Coach-facing roster management. Lists every athlete currently associated
// with the school (approved + pending) and lets the head coach remove anyone
// who's transferred or shouldn't be on the team. Removal clears the
// athlete's schoolId/groupId/status and pulls them from the school's
// athleteIds + pendingAthleteIds arrays. The athlete's runs stay in
// Firestore — we just unlink them from the school.

export default function ManageRosterSignal({ schoolId, groups = [], onClose, onPendingResolved }) {
  const [loading, setLoading] = useState(true);
  const [athletes, setAthletes] = useState([]);
  const [removing, setRemoving] = useState(null); // athlete id currently being removed

  useEffect(() => { loadRoster(); }, []);

  const loadRoster = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'users'),
        where('schoolId', '==', schoolId),
        where('role', '==', 'athlete')
      ));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Sort: pending first (so coach sees them quickly), then alphabetical
      list.sort((a, b) => {
        const aPending = a.status === 'pending' ? 0 : 1;
        const bPending = b.status === 'pending' ? 0 : 1;
        if (aPending !== bPending) return aPending - bPending;
        const an = `${a.lastName || ''} ${a.firstName || ''}`.toLowerCase();
        const bn = `${b.lastName || ''} ${b.firstName || ''}`.toLowerCase();
        return an.localeCompare(bn);
      });
      setAthletes(list);
    } catch (e) {
      console.warn('Failed to load roster:', e);
    }
    setLoading(false);
  };

  const handleApprove = async (athlete) => {
    setRemoving(athlete.id);
    try {
      await updateDoc(doc(db, 'users', athlete.id), { status: 'approved' });
      await updateDoc(doc(db, 'schools', schoolId), {
        pendingAthleteIds: arrayRemove(athlete.id),
        athleteIds: arrayUnion(athlete.id),
      });
      // Update local state immediately so the row flips from pending → active
      setAthletes(prev => prev.map(a => a.id === athlete.id ? { ...a, status: 'approved' } : a));
      // Tell the parent to drop this athlete from its pending state, so the
      // Program nav badge and TrainingHub Roster card badge clear right
      // away instead of waiting for the full loadDashboard refresh.
      if (onPendingResolved) onPendingResolved(athlete.id);
    } catch (e) {
      console.warn('Approve athlete failed:', e);
      Alert.alert('Could not approve', 'Something went wrong. Please try again.');
    }
    setRemoving(null);
  };

  const handleDeny = (athlete) => {
    const fullName = `${athlete.firstName || ''} ${athlete.lastName || ''}`.trim() || 'this athlete';
    Alert.alert('Deny request?', `Deny ${fullName}'s request to join the team?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Deny', style: 'destructive', onPress: async () => {
        setRemoving(athlete.id);
        try {
          await updateDoc(doc(db, 'users', athlete.id), { status: 'denied', schoolId: null });
          await updateDoc(doc(db, 'schools', schoolId), {
            pendingAthleteIds: arrayRemove(athlete.id),
          });
          setAthletes(prev => prev.filter(a => a.id !== athlete.id));
          // Drop from parent's pending list so the badges clear immediately.
          if (onPendingResolved) onPendingResolved(athlete.id);
        } catch (e) {
          console.warn('Deny athlete failed:', e);
          Alert.alert('Could not deny', 'Something went wrong. Please try again.');
        }
        setRemoving(null);
      }},
    ]);
  };

  const handleRemove = (athlete) => {
    const fullName = `${athlete.firstName || ''} ${athlete.lastName || ''}`.trim() || 'this athlete';
    Alert.alert(
      'Remove from team?',
      `${fullName} will be removed from the team and lose access to coach plans and team feed. Their account and run history are preserved — they can join a different school anytime.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: async () => {
          setRemoving(athlete.id);
          try {
            // Clear team-link fields on the athlete user doc. Allowed by the
            // Firestore users rule because the rule checks resource.data
            // (the OLD doc state) — at check time the athlete still has the
            // coach's schoolId so isCoachAtSchool passes.
            await updateDoc(doc(db, 'users', athlete.id), {
              schoolId: null,
              groupId: null,
              status: null,
            });

            // Pull the athlete from both school arrays. arrayRemove on a
            // missing entry is a no-op so calling both is safe.
            try {
              await updateDoc(doc(db, 'schools', schoolId), {
                athleteIds: arrayRemove(athlete.id),
                pendingAthleteIds: arrayRemove(athlete.id),
              });
            } catch (e) {
              console.warn('Failed to update school arrays on remove:', e);
            }

            setAthletes(prev => prev.filter(a => a.id !== athlete.id));
          } catch (e) {
            console.warn('Remove athlete failed:', e);
            Alert.alert('Could not remove', 'Something went wrong. Please try again.');
          }
          setRemoving(null);
        }},
      ]
    );
  };

  const groupName = (groupId) => {
    if (!groupId) return 'No group';
    return groups.find(g => g.id === groupId)?.name || 'No group';
  };

  const getInitials = (a) => {
    const f = (a.firstName || '').trim();
    const l = (a.lastName || '').trim();
    if (f && l) return `${f[0]}${l[0]}`.toUpperCase();
    if (f) return f.slice(0, 2).toUpperCase();
    if (l) return l.slice(0, 2).toUpperCase();
    return '??';
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={SIGNAL.color.inkSoft} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Roster</Text>
          <View style={{ width: 60 }} />
        </View>
        <ActivityIndicator style={{ marginTop: 40 }} color={SIGNAL.color.indigo} />
      </View>
    );
  }

  const pendingCount = athletes.filter(a => a.status === 'pending').length;
  const activeCount  = athletes.length - pendingCount;
  const pendingAthletes = athletes.filter(a => a.status === 'pending');
  const activeAthletes  = athletes.filter(a => a.status !== 'pending');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={SIGNAL.color.inkSoft} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Roster</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>
          {activeCount} active · <Text style={styles.eyebrowAmber}>{pendingCount} pending</Text>
        </Text>
        <Text style={styles.hint}>
          Remove athletes who have transferred or shouldn't be on this team. Their account and runs stay intact — they can join a different school.
        </Text>

        {athletes.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No athletes on this team yet.</Text>
          </View>
        ) : (
          <>
            {pendingAthletes.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Pending requests</Text>
                <View style={styles.listGroup}>
                  {pendingAthletes.map(a => {
                    const isBusy = removing === a.id;
                    const avatarBg = a.avatarColor || SIGNAL.color.indigo;
                    return (
                      <View key={a.id} style={[styles.row, styles.rowPending]}>
                        <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
                          <Text style={styles.avatarText}>{getInitials(a)}</Text>
                        </View>
                        <View style={styles.rowMain}>
                          <View style={styles.nameLine}>
                            <Text style={styles.name}>{a.firstName} {a.lastName}</Text>
                            <View style={styles.pendingBadge}>
                              <Text style={styles.pendingBadgeText}>Pending</Text>
                            </View>
                          </View>
                          <Text style={styles.sub} numberOfLines={1}>
                            {a.email || groupName(a.groupId)}
                          </Text>
                        </View>
                        <View style={styles.actionGroup}>
                          <TouchableOpacity
                            style={styles.approveBtn}
                            onPress={() => handleApprove(a)}
                            disabled={isBusy}
                          >
                            {isBusy
                              ? <ActivityIndicator size="small" color="#fff" />
                              : <Text style={styles.approveBtnText}>Approve</Text>
                            }
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.denyBtn}
                            onPress={() => handleDeny(a)}
                            disabled={isBusy}
                          >
                            <Text style={styles.denyBtnText}>Deny</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {activeAthletes.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, pendingAthletes.length > 0 && { marginTop: SIGNAL.space[8] }]}>Active roster</Text>
                <View style={styles.listGroup}>
                  {activeAthletes.map(a => {
                    const isBusy = removing === a.id;
                    const avatarBg = a.avatarColor || SIGNAL.color.indigo;
                    const chipLabel = [a.gender, a.grade ? `Gr ${a.grade}` : null].filter(Boolean).join(' · ');
                    return (
                      <View key={a.id} style={styles.row}>
                        <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
                          <Text style={styles.avatarText}>{getInitials(a)}</Text>
                        </View>
                        <View style={styles.rowMain}>
                          <View style={styles.nameLine}>
                            <Text style={styles.name}>{a.firstName} {a.lastName}</Text>
                            {chipLabel ? (
                              <View style={styles.metaChip}>
                                <Text style={styles.metaChipText}>{chipLabel}</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.sub} numberOfLines={1}>
                            {groupName(a.groupId)}{a.email ? `  ·  ${a.email}` : ''}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.removeBtn}
                          onPress={() => handleRemove(a)}
                          disabled={isBusy}
                        >
                          {isBusy
                            ? <ActivityIndicator size="small" color={SIGNAL.color.coral} />
                            : <Text style={styles.removeBtnText}>Remove</Text>
                          }
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              </>
            )}
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },
  header:         {
    backgroundColor: SIGNAL.color.white,
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: SIGNAL.space[4],
    paddingHorizontal: SIGNAL.space[6],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  backBtn:        {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    width: 60,
  },
  backText:       {
    color: SIGNAL.color.inkSoft,
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
  },
  headerTitle:    {
    fontSize: SIGNAL.size.title,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.titleTight,
  },
  scroll:         { flex: 1 },
  scrollContent:  {
    paddingHorizontal: SIGNAL.space.screen,
    paddingTop: SIGNAL.space[6],
  },
  eyebrow:        {
    ...SIGNAL.style.eyebrow,
    marginBottom: SIGNAL.space[1],
    paddingLeft: 2,
  },
  eyebrowAmber:   {
    color: SIGNAL.color.amber,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
  },
  hint:           {
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.body,
    marginBottom: SIGNAL.space[7],
    paddingLeft: 2,
    lineHeight: 17,
  },
  sectionTitle:   {
    fontSize: SIGNAL.size.heading,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.indigo,
    letterSpacing: SIGNAL.letter.bodyTight,
    marginBottom: SIGNAL.space[3],
    paddingLeft: 2,
  },
  listGroup:      {
    flexDirection: 'column',
    gap: SIGNAL.space[2],
  },
  emptyCard:      {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: SIGNAL.space[8],
    alignItems: 'center',
    ...SIGNAL.border.hairline,
  },
  emptyText:      {
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.body,
    color: SIGNAL.color.mute,
  },
  row:            {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    paddingVertical: SIGNAL.space[4],
    paddingHorizontal: SIGNAL.space[5],
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIGNAL.space[3],
    ...SIGNAL.border.hairline,
  },
  rowPending:     {
    borderColor: SIGNAL.color.amber + '44',
    backgroundColor: SIGNAL.color.amber + '0A',
  },
  avatar:         {
    width: 38,
    height: 38,
    borderRadius: SIGNAL.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText:     {
    color: '#fff',
    fontSize: 12,
    fontFamily: SIGNAL.font.bodyBold,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  rowMain:        {
    flex: 1,
    minWidth: 0,
  },
  nameLine:       {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIGNAL.space[2],
    flexWrap: 'wrap',
  },
  name:           {
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  sub:            {
    fontSize: SIGNAL.size.label - 1,
    fontFamily: SIGNAL.font.body,
    color: SIGNAL.color.mute,
    marginTop: 2,
  },
  pendingBadge:   {
    backgroundColor: '#fff7ed',
    borderColor: '#fb923c',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  pendingBadgeText:{
    fontSize: 9.5,
    color: '#c2410c',
    fontFamily: SIGNAL.font.bodyBold,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  metaChip:       {
    backgroundColor: SIGNAL.color.indigo + SIGNAL.tint.chip,
    borderRadius: SIGNAL.radius.chip,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  metaChipText:   {
    fontSize: 10.5,
    color: SIGNAL.color.indigo,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  removeBtn:      {
    paddingHorizontal: SIGNAL.space[4],
    paddingVertical: SIGNAL.space[2],
    borderRadius: SIGNAL.radius.control,
    borderWidth: 1,
    borderColor: SIGNAL.color.coral + '55',
    backgroundColor: SIGNAL.color.white,
    minWidth: 84,
    alignItems: 'center',
    flexShrink: 0,
  },
  removeBtnText:  {
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.coral,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
  },
  actionGroup:    {
    flexDirection: 'row',
    gap: SIGNAL.space[1] + 2,
    flexShrink: 0,
  },
  approveBtn:     {
    paddingHorizontal: SIGNAL.space[3],
    paddingVertical: SIGNAL.space[2],
    borderRadius: SIGNAL.radius.control,
    backgroundColor: SIGNAL.color.indigo,
    minWidth: 76,
    alignItems: 'center',
  },
  approveBtnText: {
    fontSize: SIGNAL.size.label,
    color: '#fff',
    fontFamily: SIGNAL.font.bodyBold,
    fontWeight: '700',
  },
  denyBtn:        {
    paddingHorizontal: SIGNAL.space[3],
    paddingVertical: SIGNAL.space[2],
    borderRadius: SIGNAL.radius.control,
    borderWidth: 1,
    borderColor: SIGNAL.color.coral + '55',
    backgroundColor: SIGNAL.color.white,
    alignItems: 'center',
  },
  denyBtnText:    {
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.coral,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
  },
});
