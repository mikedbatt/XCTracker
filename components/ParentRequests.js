// ── ParentRequests ───────────────────────────────────────────────────────────
// Pending parent → athlete link requests, with Approve / Decline. The athlete
// decides (they know the family situation best). Approving flips the
// parentLinks doc to 'approved'; the onParentLinkUpdate Cloud Function then
// writes linkedParentIds / linkedAthleteIds, which takes a moment, so
// `onChanged` is called again shortly after to pick up the new link.
//
// Renders nothing when there are no pending requests.

import { Ionicons } from '@expo/vector-icons';
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SIGNAL } from '../constants/design';
import { auth, db } from '../firebaseConfig';
import { notify } from '../utils/notify';

export default function ParentRequests({ onChanged, style }) {
  const [requests, setRequests] = useState([]);
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      const snap = await getDocs(query(
        collection(db, 'parentLinks'),
        where('athleteId', '==', uid),
        where('status', '==', 'pending'),
      ));
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.warn('Parent requests load:', e);
    }
  };

  useEffect(() => { load(); }, []);

  const respond = async (request, status) => {
    setBusyId(request.id);
    try {
      await updateDoc(doc(db, 'parentLinks', request.id), { status, respondedAt: new Date() });
      setRequests(prev => prev.filter(r => r.id !== request.id));
      if (status === 'approved') {
        notify('Parent connected', `${request.parentName || 'Your parent'} can now follow your training. You can remove them anytime in Profile → Connections.`);
        // The link itself is written server-side — refresh once it has landed.
        setTimeout(() => onChanged && onChanged(), 3000);
      } else if (onChanged) {
        onChanged();
      }
    } catch (e) {
      console.error('Parent request respond:', e);
      notify('Error', 'Could not save your answer. Please try again.');
    }
    setBusyId(null);
  };

  if (requests.length === 0) return null;

  return (
    <View style={style}>
      {requests.map(r => (
        <View key={r.id} style={styles.card}>
          <View style={styles.row}>
            <View style={styles.icon}>
              <Ionicons name="people-outline" size={18} color={SIGNAL.color.indigo} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>Parent request</Text>
              <Text style={styles.title}>{r.parentName || 'Someone'} wants to follow your training</Text>
              {!!r.parentEmail && <Text style={styles.email}>{r.parentEmail}</Text>}
              <Text style={styles.body}>
                They'd see your runs, schedule, races and team announcements. Only approve someone you know.
              </Text>
            </View>
          </View>
          {busyId === r.id ? (
            <ActivityIndicator color={SIGNAL.color.indigo} style={{ marginTop: SIGNAL.space[4] }} />
          ) : (
            <View style={styles.actions}>
              <TouchableOpacity style={[styles.btn, styles.declineBtn]} onPress={() => respond(r, 'declined')} activeOpacity={0.85}>
                <Text style={styles.declineText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.approveBtn]} onPress={() => respond(r, 'approved')} activeOpacity={0.85}>
                <Text style={styles.approveText}>Approve</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: SIGNAL.space.card,
    marginBottom: SIGNAL.space[4],
    ...SIGNAL.border.hairline,
  },
  row: { flexDirection: 'row', gap: SIGNAL.space[3] },
  icon: {
    width: 36, height: 36, borderRadius: SIGNAL.radius.chip,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: `${SIGNAL.color.indigo}${SIGNAL.tint.chip}`,
  },
  eyebrow: { ...SIGNAL.style.eyebrow },
  title: {
    fontFamily: SIGNAL.font.bodySemi, fontSize: SIGNAL.size.bodyLg, color: SIGNAL.color.ink,
    marginTop: 2, letterSpacing: SIGNAL.letter.bodyTight,
  },
  email: { fontFamily: SIGNAL.font.body, fontSize: SIGNAL.size.label, color: SIGNAL.color.mute, marginTop: 2 },
  body: {
    fontFamily: SIGNAL.font.body, fontSize: SIGNAL.size.body, color: SIGNAL.color.inkSoft,
    lineHeight: 20, marginTop: SIGNAL.space[2],
  },
  actions: { flexDirection: 'row', gap: SIGNAL.space[3], marginTop: SIGNAL.space[4] },
  btn: {
    flex: 1, borderRadius: SIGNAL.radius.button, paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  declineBtn: { borderWidth: 1, borderColor: SIGNAL.color.line, backgroundColor: SIGNAL.color.white },
  declineText: { fontFamily: SIGNAL.font.bodySemi, fontSize: SIGNAL.size.body, color: SIGNAL.color.inkSoft },
  approveBtn: { backgroundColor: SIGNAL.color.indigo },
  approveText: { fontFamily: SIGNAL.font.bodySemi, fontSize: SIGNAL.size.body, color: SIGNAL.color.white },
});
