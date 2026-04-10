import { Ionicons } from '@expo/vector-icons';
import {
  arrayRemove, collection, doc, getDocs, query, updateDoc, where,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Platform,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { db } from '../firebaseConfig';
import {
  BRAND, BRAND_DARK, FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE, STATUS,
} from '../constants/design';

// Coach-facing roster management. Lists every athlete currently associated
// with the school (approved + pending) and lets the head coach remove anyone
// who's transferred or shouldn't be on the team. Removal clears the
// athlete's schoolId/groupId/status and pulls them from the school's
// athleteIds + pendingAthleteIds arrays. The athlete's runs stay in
// Firestore — we just unlink them from the school.

export default function ManageRoster({ schoolId, groups = [], onClose }) {
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

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={BRAND_DARK} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Roster</Text>
          <View style={{ width: 60 }} />
        </View>
        <ActivityIndicator style={{ marginTop: 40 }} color={BRAND} />
      </View>
    );
  }

  const pendingCount = athletes.filter(a => a.status === 'pending').length;
  const activeCount  = athletes.length - pendingCount;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={BRAND_DARK} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Roster</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.summary}>
          {activeCount} active · {pendingCount} pending
        </Text>
        <Text style={styles.hint}>
          Remove athletes who have transferred or shouldn't be on this team. Their account and runs stay intact — they can join a different school.
        </Text>

        {athletes.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No athletes on this team yet.</Text>
          </View>
        ) : athletes.map(a => {
          const isPending = a.status === 'pending';
          const isRemoving = removing === a.id;
          return (
            <View key={a.id} style={styles.row}>
              <View style={styles.rowMain}>
                <View style={styles.nameLine}>
                  <Text style={styles.name}>{a.firstName} {a.lastName}</Text>
                  {isPending && (
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingBadgeText}>Pending</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.sub}>{groupName(a.groupId)}{a.email ? `  ·  ${a.email}` : ''}</Text>
              </View>
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => handleRemove(a)}
                disabled={isRemoving}
              >
                {isRemoving
                  ? <ActivityIndicator size="small" color={STATUS.error} />
                  : <Text style={styles.removeBtnText}>Remove</Text>
                }
              </TouchableOpacity>
            </View>
          );
        })}

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: NEUTRAL.bg },
  header:         { backgroundColor: NEUTRAL.card, paddingTop: Platform.OS === 'ios' ? 56 : 32, paddingBottom: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
  backBtn:        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
  backText:       { color: BRAND_DARK, fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold },
  headerTitle:    { fontSize: FONT_SIZE.xl - 2, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  scroll:         { flex: 1 },
  scrollContent:  { padding: SPACE.lg },
  summary:        { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, fontWeight: FONT_WEIGHT.semibold, marginBottom: SPACE.xs },
  hint:           { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginBottom: SPACE.lg, lineHeight: 16 },
  emptyCard:      { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE['2xl'], alignItems: 'center', ...SHADOW.sm },
  emptyText:      { fontSize: FONT_SIZE.sm, color: NEUTRAL.muted },
  row:            { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg, marginBottom: SPACE.sm, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, ...SHADOW.sm },
  rowMain:        { flex: 1 },
  nameLine:       { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  name:           { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  sub:            { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: 2 },
  pendingBadge:   { backgroundColor: '#fff7ed', borderColor: '#fb923c', borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: 6, paddingVertical: 2 },
  pendingBadgeText:{ fontSize: 10, color: '#c2410c', fontWeight: FONT_WEIGHT.bold },
  removeBtn:      { paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, borderRadius: RADIUS.md, borderWidth: 1, borderColor: STATUS.error, minWidth: 84, alignItems: 'center' },
  removeBtnText:  { fontSize: FONT_SIZE.sm, color: STATUS.error, fontWeight: FONT_WEIGHT.bold },
});
