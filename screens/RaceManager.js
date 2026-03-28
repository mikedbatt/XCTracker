import { Ionicons } from '@expo/vector-icons';
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
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE, STATUS,
} from '../constants/design';
import DatePickerField from './DatePickerField';
import MeetDetail from './MeetDetail';

export default function RaceManager({ schoolId, school, athletes, groups, onClose }) {
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
          <Ionicons name="chevron-back" size={22} color={BRAND_DARK} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Races</Text>
        <TouchableOpacity onPress={() => setShowAddForm(true)} style={styles.addHeaderBtn}>
          <Ionicons name="add" size={22} color={BRAND} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={primaryColor} /></View>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Add meet form */}
          {showAddForm && (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Add a Meet</Text>
              <Text style={styles.formLabel}>Meet name</Text>
              <TextInput style={styles.input} value={meetName} onChangeText={setMeetName} placeholder="e.g. Highland Invitational" placeholderTextColor={NEUTRAL.muted} />
              <DatePickerField label="Meet date" value={meetDate} onChange={setMeetDate} primaryColor={primaryColor} />
              <Text style={styles.formLabel}>Location</Text>
              <TextInput style={styles.input} value={meetLocation} onChangeText={setMeetLocation} placeholder="e.g. Highland Park Course" placeholderTextColor={NEUTRAL.muted} />
              <Text style={styles.formLabel}>Course type</Text>
              <View style={styles.courseRow}>
                {['flat', 'rolling', 'hilly'].map(c => (
                  <TouchableOpacity key={c} style={[styles.courseChip, meetCourse === c && { backgroundColor: primaryColor, borderColor: primaryColor }]} onPress={() => setMeetCourse(c)}>
                    <Text style={[styles.courseChipText, meetCourse === c && { color: '#fff' }]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.formLabel}>Notes (optional)</Text>
              <TextInput style={[styles.input, { minHeight: 50, textAlignVertical: 'top' }]} value={meetNotes} onChangeText={setMeetNotes} placeholder="Course details, logistics..." placeholderTextColor={NEUTRAL.muted} multiline />
              <View style={styles.formBtns}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAddForm(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: primaryColor }]} onPress={handleAddMeet} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Create Meet</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Upcoming meets */}
          {upcoming.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Upcoming</Text>
              {upcoming.map(meet => (
                <TouchableOpacity key={meet.id} style={styles.meetCard} activeOpacity={0.7} onPress={() => setSelectedMeet(meet)}>
                  <View style={[styles.meetDateBadge, { backgroundColor: primaryColor }]}>
                    <Text style={styles.meetDateBadgeText}>{daysUntil(meet.date)}</Text>
                  </View>
                  <View style={styles.meetInfo}>
                    <Text style={styles.meetName}>{meet.name}</Text>
                    <Text style={styles.meetMeta}>{formatMeetDate(meet.date)}{meet.location ? ` · ${meet.location}` : ''}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={NEUTRAL.muted} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Past meets */}
          {past.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Past Meets</Text>
              {past.map(meet => (
                <TouchableOpacity key={meet.id} style={styles.meetCard} activeOpacity={0.7} onPress={() => setSelectedMeet(meet)}>
                  <View style={[styles.meetDateBadge, { backgroundColor: NEUTRAL.muted }]}>
                    <Text style={styles.meetDateBadgeText}>{formatMeetDate(meet.date).split(',')[0]}</Text>
                  </View>
                  <View style={styles.meetInfo}>
                    <Text style={styles.meetName}>{meet.name}</Text>
                    <Text style={styles.meetMeta}>{formatMeetDate(meet.date)}{meet.location ? ` · ${meet.location}` : ''}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={NEUTRAL.muted} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {meets.length === 0 && !showAddForm && (
            <View style={styles.emptyCard}>
              <Text style={{ fontSize: 40, marginBottom: SPACE.md }}>🏁</Text>
              <Text style={styles.emptyTitle}>No meets yet</Text>
              <Text style={styles.emptyDesc}>Add your first meet to start tracking race results and pack analysis.</Text>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: primaryColor, marginTop: SPACE.md }]} onPress={() => setShowAddForm(true)}>
                <Text style={styles.saveBtnText}>+ Add First Meet</Text>
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
  container:      { flex: 1, backgroundColor: NEUTRAL.bg },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:         { backgroundColor: '#fff', paddingTop: Platform.OS === 'ios' ? 56 : 32, paddingBottom: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
  backBtn:        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
  backText:       { color: BRAND_DARK, fontSize: 15, fontWeight: '600' },
  headerTitle:    { fontSize: 20, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  addHeaderBtn:   { padding: 6 },
  scroll:         { flex: 1 },
  section:        { padding: SPACE.lg },
  sectionTitle:   { fontSize: 17, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: SPACE.md },
  meetCard:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: SPACE.lg, marginBottom: SPACE.sm, gap: SPACE.md, ...SHADOW.sm },
  meetDateBadge:  { borderRadius: RADIUS.md, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, minWidth: 60, alignItems: 'center' },
  meetDateBadgeText: { color: '#fff', fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold },
  meetInfo:       { flex: 1 },
  meetName:       { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  meetMeta:       { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: 2 },
  // Form
  formCard:       { margin: SPACE.lg, backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: SPACE.lg, ...SHADOW.sm },
  formTitle:      { fontSize: 18, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: SPACE.lg },
  formLabel:      { fontSize: FONT_SIZE.sm, fontWeight: '600', color: NEUTRAL.body, marginBottom: SPACE.sm, marginTop: SPACE.sm },
  input:          { backgroundColor: NEUTRAL.bg, borderRadius: RADIUS.md, padding: SPACE.md, fontSize: FONT_SIZE.base, color: BRAND_DARK, borderWidth: 1, borderColor: NEUTRAL.border, marginBottom: SPACE.xs },
  courseRow:       { flexDirection: 'row', gap: SPACE.sm, marginBottom: SPACE.sm },
  courseChip:      { borderRadius: RADIUS.sm, borderWidth: 1.5, borderColor: NEUTRAL.border, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm },
  courseChipText:  { fontSize: FONT_SIZE.sm, fontWeight: '600', color: NEUTRAL.body, textTransform: 'capitalize' },
  formBtns:       { flexDirection: 'row', gap: SPACE.md, marginTop: SPACE.md },
  cancelBtn:      { flex: 1, borderRadius: RADIUS.md, padding: 14, alignItems: 'center', backgroundColor: '#fee2e2' },
  cancelBtnText:  { fontSize: 15, fontWeight: '600', color: '#dc2626' },
  saveBtn:        { flex: 1, borderRadius: RADIUS.md, padding: 14, alignItems: 'center' },
  saveBtnText:    { color: '#fff', fontSize: 15, fontWeight: FONT_WEIGHT.bold },
  // Empty
  emptyCard:      { margin: SPACE.lg, backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: SPACE['2xl'], alignItems: 'center', ...SHADOW.sm },
  emptyTitle:     { fontSize: 18, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: SPACE.sm },
  emptyDesc:      { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, textAlign: 'center', lineHeight: 20 },
});
