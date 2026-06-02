import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  addDoc, collection, doc, getDocs, orderBy, query,
  serverTimestamp, where,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';
import {
  BRAND, BRAND_DARK, BRAND_LIGHT,
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SIGNAL, SPACE, STATUS,
} from '../constants/design';
import DatePickerField from './DatePickerField';
import MeetDetail from './MeetDetailSignal';

export default function RaceManagerSignal({ schoolId, school, athletes, groups, onClose }) {
  const [meets, setMeets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedMeet, setSelectedMeet] = useState(null);

  // Add meet form
  const [meetName, setMeetName] = useState('');
  const [meetDate, setMeetDate] = useState(null);
  const [meetLocation, setMeetLocation] = useState('');
  const [meetCourse, setMeetCourse] = useState('');
  const [meetNotes, setMeetNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const primaryColor = school?.primaryColor || BRAND;

  useEffect(() => { loadMeets(); }, []);

  const loadMeets = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'raceMeets'),
        where('schoolId', '==', schoolId),
      ));
      const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      loaded.sort((a, b) => {
        const aDate = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        const bDate = b.date?.toDate ? b.date.toDate() : new Date(b.date);
        return bDate - aDate;
      });
      setMeets(loaded);
    } catch (e) { console.warn('Failed to load meets:', e); }
    setLoading(false);
  };

  const handleAddMeet = async () => {
    if (!meetName.trim()) { Alert.alert('Name required', 'Please enter a meet name.'); return; }
    if (!meetDate) { Alert.alert('Date required', 'Please select a meet date.'); return; }
    setSaving(true);
    try {
      // Create meet doc
      const meetRef = await addDoc(collection(db, 'raceMeets'), {
        schoolId,
        name: meetName.trim(),
        date: meetDate,
        location: meetLocation.trim() || null,
        course: meetCourse || null,
        notes: meetNotes.trim() || null,
        createdBy: auth.currentUser.uid,
        createdAt: serverTimestamp(),
      });

      // Auto-create calendar event
      await addDoc(collection(db, 'events'), {
        schoolId,
        category: 'Event',
        type: 'Race',
        title: meetName.trim(),
        date: meetDate,
        location: meetLocation.trim() || null,
        description: meetNotes.trim() || null,
        notes: null,
        baseMiles: null,
        groupMiles: null,
        isMultiDay: false,
        endDate: null,
        time: null,
        meetId: meetRef.id,
        postedBy: auth.currentUser.uid,
        postedByName: `Coach`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Reset form
      setMeetName(''); setMeetDate(null); setMeetLocation('');
      setMeetCourse(''); setMeetNotes('');
      setShowAddForm(false);
      await loadMeets();
    } catch (e) {
      console.warn('Failed to create meet:', e);
      Alert.alert('Error', 'Could not create meet. Please try again.');
    }
    setSaving(false);
  };

  const now = new Date();
  const upcoming = meets.filter(m => {
    const d = m.date?.toDate ? m.date.toDate() : new Date(m.date);
    return d >= new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });
  const past = meets.filter(m => {
    const d = m.date?.toDate ? m.date.toDate() : new Date(m.date);
    return d < new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });

  const formatMeetDate = (d) => {
    const date = d?.toDate ? d.toDate() : new Date(d);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const daysUntil = (d) => {
    const date = d?.toDate ? d.toDate() : new Date(d);
    const diff = Math.ceil((date - now) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return `${diff} days`;
  };

  // If a meet is selected, show its detail
  if (selectedMeet) {
    return (
      <MeetDetail
        meet={selectedMeet}
        schoolId={schoolId}
        school={school}
        athletes={athletes}
        groups={groups}
        onClose={() => { setSelectedMeet(null); loadMeets(); }}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={SIGNAL.color.inkSoft} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Races</Text>
        <TouchableOpacity onPress={() => setShowAddForm(true)} activeOpacity={0.85} style={styles.addHeaderBtn}>
          <LinearGradient
            colors={[SIGNAL.color.indigo, SIGNAL.color.violet]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.addHeaderBtnGradient}
          >
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.addHeaderBtnText}>Add meet</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={SIGNAL.color.indigo} /></View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          {/* Add meet form */}
          {showAddForm && (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Add a Meet</Text>
              <Text style={styles.formLabel}>Meet name</Text>
              <TextInput
                style={styles.input}
                value={meetName}
                onChangeText={setMeetName}
                placeholder="e.g. Highland Invitational"
                placeholderTextColor={SIGNAL.color.mute2}
              />
              <DatePickerField label="Meet date" value={meetDate} onChange={setMeetDate} primaryColor={SIGNAL.color.indigo} />
              <Text style={styles.formLabel}>Location</Text>
              <TextInput
                style={styles.input}
                value={meetLocation}
                onChangeText={setMeetLocation}
                placeholder="e.g. Highland Park Course"
                placeholderTextColor={SIGNAL.color.mute2}
              />
              <Text style={styles.formLabel}>Course type</Text>
              <View style={styles.courseRow}>
                {['flat', 'rolling', 'hilly'].map(c => {
                  const active = meetCourse === c;
                  return (
                    <TouchableOpacity
                      key={c}
                      style={[styles.courseChip, active && styles.courseChipActive]}
                      onPress={() => setMeetCourse(c)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.courseChipText, active && styles.courseChipTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.formLabel}>Notes (optional)</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={meetNotes}
                onChangeText={setMeetNotes}
                placeholder="Course details, logistics..."
                placeholderTextColor={SIGNAL.color.mute2}
                multiline
              />
              <View style={styles.formBtns}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAddForm(false)} activeOpacity={0.8}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.85} style={styles.saveBtn} onPress={handleAddMeet} disabled={saving}>
                  <LinearGradient
                    colors={[SIGNAL.color.indigo, SIGNAL.color.violet]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.saveBtnGradient}
                  >
                    {saving
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.saveBtnText}>Create Meet</Text>}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Upcoming meets */}
          {upcoming.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.eyebrow}>Upcoming</Text>
              {upcoming.map(meet => (
                <TouchableOpacity
                  key={meet.id}
                  style={styles.meetCard}
                  activeOpacity={0.75}
                  onPress={() => setSelectedMeet(meet)}
                >
                  <View style={styles.daysBadge}>
                    <LinearGradient
                      colors={[SIGNAL.color.indigo, SIGNAL.color.violet]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.daysBadgeInner}
                    >
                      <Text style={styles.daysBadgeNum}>{daysUntil(meet.date)}</Text>
                      <Text style={styles.daysBadgeLabel}>OUT</Text>
                    </LinearGradient>
                  </View>
                  <View style={styles.meetInfo}>
                    <Text style={styles.meetName}>{meet.name}</Text>
                    <Text style={styles.meetMeta}>
                      <Text style={styles.meetMetaAccent}>{formatMeetDate(meet.date)}</Text>
                      {meet.location ? ` · ${meet.location}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={SIGNAL.color.mute2} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Past meets */}
          {past.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.eyebrow}>Past meets</Text>
              {past.map(meet => (
                <TouchableOpacity
                  key={meet.id}
                  style={styles.meetCardPast}
                  activeOpacity={0.75}
                  onPress={() => setSelectedMeet(meet)}
                >
                  <View style={styles.pastDateBadge}>
                    <Text style={styles.pastDateBadgeText}>{formatMeetDate(meet.date).split(',')[0]}</Text>
                  </View>
                  <View style={styles.meetInfo}>
                    <Text style={styles.meetName}>{meet.name}</Text>
                    <Text style={styles.meetMeta}>
                      {formatMeetDate(meet.date)}{meet.location ? ` · ${meet.location}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={SIGNAL.color.mute2} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {meets.length === 0 && !showAddForm && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>🏁</Text>
              <Text style={styles.emptyTitle}>No meets yet</Text>
              <Text style={styles.emptyDesc}>
                Add your first meet to start tracking race results and pack analysis.
              </Text>
              <TouchableOpacity activeOpacity={0.85} style={styles.emptyCta} onPress={() => setShowAddForm(true)}>
                <LinearGradient
                  colors={[SIGNAL.color.indigo, SIGNAL.color.violet]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.emptyCtaGradient}
                >
                  <Text style={styles.emptyCtaText}>+ Add First Meet</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 60 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Header ───────────────────────────────────────────────────────────────
  header: {
    backgroundColor: SIGNAL.color.white,
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: 14,
    paddingHorizontal: SIGNAL.space.screen,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
    gap: 10,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 6,
    paddingRight: 4,
  },
  backText: {
    color: SIGNAL.color.inkSoft,
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
  },
  headerTitle: {
    flex: 1,
    fontSize: SIGNAL.size.title,
    fontFamily: SIGNAL.font.bodyBold,
    fontWeight: '700',
    color: SIGNAL.color.indigo,
    letterSpacing: SIGNAL.letter.titleTight,
  },
  addHeaderBtn: {
    borderRadius: SIGNAL.radius.button,
    overflow: 'hidden',
  },
  addHeaderBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addHeaderBtnText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
  },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  // ── Sections ─────────────────────────────────────────────────────────────
  section: {
    paddingHorizontal: SIGNAL.space.screen,
    paddingTop: SIGNAL.space[6],
  },
  eyebrow: {
    ...SIGNAL.style.eyebrow,
    marginBottom: SIGNAL.space[3],
    paddingLeft: 2,
  },
  sectionTitle: {
    fontSize: SIGNAL.size.heading,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.indigo,
    marginBottom: SIGNAL.space[3],
    letterSpacing: SIGNAL.letter.bodyTight,
  },

  // ── Upcoming meet card ───────────────────────────────────────────────────
  meetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: SIGNAL.space[5],
    marginBottom: SIGNAL.space[2],
    gap: SIGNAL.space[4],
    ...SIGNAL.border.hairline,
  },
  daysBadge: {
    minWidth: 58,
    borderRadius: SIGNAL.radius.control,
    overflow: 'hidden',
  },
  daysBadgeInner: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daysBadgeNum: {
    color: '#fff',
    fontSize: 14,
    fontFamily: SIGNAL.font.bodyBold,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  daysBadgeLabel: {
    color: '#fff',
    fontSize: 8.5,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    letterSpacing: 1,
    opacity: 0.9,
    marginTop: 1,
  },
  meetInfo: { flex: 1, minWidth: 0 },
  meetName: {
    fontSize: 15,
    fontFamily: SIGNAL.font.bodyBold,
    fontWeight: '700',
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  meetMeta: {
    fontSize: 12,
    fontFamily: SIGNAL.font.body,
    color: SIGNAL.color.mute,
    marginTop: 3,
  },
  meetMetaAccent: {
    fontFamily: SIGNAL.font.mono,
    color: SIGNAL.color.pink,
    fontWeight: '600',
  },

  // ── Past meet card ───────────────────────────────────────────────────────
  meetCardPast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: SIGNAL.space[5],
    marginBottom: SIGNAL.space[2],
    gap: SIGNAL.space[4],
    ...SIGNAL.border.hairline,
  },
  pastDateBadge: {
    minWidth: 58,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: SIGNAL.radius.control,
    backgroundColor: SIGNAL.color.paper2,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pastDateBadgeText: {
    fontSize: 12,
    fontFamily: SIGNAL.font.mono,
    color: SIGNAL.color.inkSoft,
    fontWeight: '600',
  },

  // ── Form card ────────────────────────────────────────────────────────────
  formCard: {
    marginHorizontal: SIGNAL.space.screen,
    marginTop: SIGNAL.space[6],
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: SIGNAL.space[6],
    ...SIGNAL.border.hairline,
  },
  formTitle: {
    fontSize: SIGNAL.size.heading,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.indigo,
    marginBottom: SIGNAL.space[5],
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  formLabel: {
    fontSize: SIGNAL.size.label,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.inkSoft,
    marginTop: SIGNAL.space[3],
    marginBottom: SIGNAL.space[2],
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  input: {
    backgroundColor: SIGNAL.color.paper,
    borderRadius: SIGNAL.radius.control,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.body,
    color: SIGNAL.color.ink,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    marginBottom: SIGNAL.space[1],
  },
  inputMultiline: {
    minHeight: 60,
    textAlignVertical: 'top',
    paddingTop: 11,
  },

  courseRow: {
    flexDirection: 'row',
    gap: SIGNAL.space[2],
    marginBottom: SIGNAL.space[2],
  },
  courseChip: {
    paddingHorizontal: SIGNAL.space[5],
    paddingVertical: SIGNAL.space[2],
    borderRadius: SIGNAL.radius.chip,
    backgroundColor: SIGNAL.color.paper2,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  courseChipActive: {
    backgroundColor: SIGNAL.color.indigo,
    borderColor: SIGNAL.color.indigo,
  },
  courseChipText: {
    fontSize: 12,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.inkSoft,
    textTransform: 'capitalize',
  },
  courseChipTextActive: {
    color: '#fff',
  },

  formBtns: {
    flexDirection: 'row',
    gap: SIGNAL.space[3],
    marginTop: SIGNAL.space[5],
  },
  cancelBtn: {
    flex: 1,
    borderRadius: SIGNAL.radius.button,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: SIGNAL.color.paper2,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  cancelBtnText: {
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.inkSoft,
  },
  saveBtn: {
    flex: 1,
    borderRadius: SIGNAL.radius.button,
    overflow: 'hidden',
  },
  saveBtnGradient: {
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.bodyBold,
    fontWeight: '700',
  },

  // ── Empty state ──────────────────────────────────────────────────────────
  emptyCard: {
    marginHorizontal: SIGNAL.space.screen,
    marginTop: SIGNAL.space[6],
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: SIGNAL.space[8] + 8,
    alignItems: 'center',
    ...SIGNAL.border.hairline,
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: SIGNAL.space[4],
  },
  emptyTitle: {
    fontSize: SIGNAL.size.heading,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.indigo,
    marginBottom: SIGNAL.space[2],
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  emptyDesc: {
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.body,
    color: SIGNAL.color.mute,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyCta: {
    marginTop: SIGNAL.space[5],
    borderRadius: SIGNAL.radius.button,
    overflow: 'hidden',
  },
  emptyCtaGradient: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCtaText: {
    color: '#fff',
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.bodyBold,
    fontWeight: '700',
  },
});
