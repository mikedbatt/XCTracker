// ── Attendance marking screen ────────────────────────────────────────────────
// Coach opens this to take roll for a given date. Rows default to "not marked"
// so a straight-through roll check works (tap Present on each athlete present,
// Absent on the rest). A "Mark all present" shortcut flips everyone to Present
// in one tap — useful when most of the team is there.
//
// Data model:
//   collection: attendance
//   docId:      {schoolId}_{athleteId}_{YYYY-MM-DD}   (idempotent)
//   fields:     { schoolId, athleteId, date, status, markedAt, markedBy }
//
// Attendance % is computed across days where attendance was recorded, not
// calendar days — so coaches aren't penalized for non-practice days and
// athletes aren't penalized for days the coach didn't record.

import { Ionicons } from '@expo/vector-icons';
import {
  collection, doc, getDocs, query, serverTimestamp, setDoc, where,
} from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';
import {
  BRAND, BRAND_DARK, FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE, STATUS,
} from '../constants/design';
import DatePickerField from './DatePickerField';

const STATUS_VALUES = ['present', 'absent', 'excused'];

function toDateKey(d) {
  const yr  = d.getFullYear();
  const mo  = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${day}`;
}

export default function AttendanceScreen({ userData, athletes = [], onClose }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [sortBy, setSortBy] = useState('firstName'); // 'firstName' | 'lastName'
  const [marks, setMarks] = useState({});           // { athleteId: 'present' | 'absent' | 'excused' }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const dateKey = toDateKey(selectedDate);

  // Load existing attendance for this date
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        if (!userData.schoolId) { setLoading(false); return; }
        const snap = await getDocs(query(
          collection(db, 'attendance'),
          where('schoolId', '==', userData.schoolId),
          where('date', '==', dateKey),
        ));
        const loaded = {};
        snap.docs.forEach(d => {
          const data = d.data();
          loaded[data.athleteId] = data.status;
        });
        setMarks(loaded);
      } catch (e) {
        console.warn('Failed to load attendance:', e);
      }
      setLoading(false);
    })();
  }, [dateKey, userData.schoolId]);

  const sortedAthletes = useMemo(() => {
    const field = sortBy === 'lastName' ? 'lastName' : 'firstName';
    return [...athletes].sort((a, b) => {
      const av = (a[field] || '').toLowerCase();
      const bv = (b[field] || '').toLowerCase();
      if (av !== bv) return av < bv ? -1 : 1;
      // Tiebreak on the other name
      const other = field === 'firstName' ? 'lastName' : 'firstName';
      return (a[other] || '').toLowerCase().localeCompare((b[other] || '').toLowerCase());
    });
  }, [athletes, sortBy]);

  const setMark = (athleteId, status) => {
    setMarks(prev => {
      // Tapping the same status again clears the mark (undo).
      if (prev[athleteId] === status) {
        const next = { ...prev };
        delete next[athleteId];
        return next;
      }
      return { ...prev, [athleteId]: status };
    });
  };

  const markAllPresent = () => {
    const next = {};
    athletes.forEach(a => { next[a.id] = 'present'; });
    setMarks(next);
  };

  const clearAll = () => {
    setMarks({});
  };

  const counts = useMemo(() => {
    let present = 0, absent = 0, excused = 0, unmarked = 0;
    athletes.forEach(a => {
      const s = marks[a.id];
      if (s === 'present') present++;
      else if (s === 'absent') absent++;
      else if (s === 'excused') excused++;
      else unmarked++;
    });
    return { present, absent, excused, unmarked };
  }, [marks, athletes]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const coachId = auth.currentUser?.uid;
      // Save only marked entries. Unmarked = no record for this athlete/date
      // (matches the "only days attendance was taken" model).
      const writes = Object.entries(marks).map(([athleteId, status]) => {
        const id = `${userData.schoolId}_${athleteId}_${dateKey}`;
        return setDoc(doc(db, 'attendance', id), {
          schoolId:  userData.schoolId,
          athleteId,
          date:      dateKey,
          status,
          markedAt:  serverTimestamp(),
          markedBy:  coachId,
        });
      });
      await Promise.all(writes);
      Alert.alert('Saved', `Attendance recorded for ${dateKey}.`);
      if (onClose) onClose();
    } catch (e) {
      console.error('Save attendance error:', e);
      Alert.alert('Error', 'Could not save attendance. Please try again.');
    }
    setSaving(false);
  };

  const renderStatusBtn = (athleteId, status, label, color) => {
    const active = marks[athleteId] === status;
    return (
      <TouchableOpacity
        key={status}
        style={[styles.statusBtn, active && { backgroundColor: color, borderColor: color }]}
        onPress={() => setMark(athleteId, status)}
      >
        <Text style={[styles.statusBtnText, active && { color: '#fff' }]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={BRAND} />
          <Text style={styles.headerBackText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Attendance</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <DatePickerField
            label="Date"
            value={selectedDate}
            onChange={d => setSelectedDate(d)}
            maximumDate={new Date()}
          />

          <View style={styles.summaryRow}>
            <Text style={styles.summaryPill}>{counts.present} present</Text>
            <Text style={[styles.summaryPill, { color: STATUS.error }]}>{counts.absent} absent</Text>
            <Text style={[styles.summaryPill, { color: STATUS.warning }]}>{counts.excused} excused</Text>
            <Text style={[styles.summaryPill, { color: NEUTRAL.muted }]}>{counts.unmarked} unmarked</Text>
          </View>

          <View style={styles.shortcutRow}>
            <TouchableOpacity style={styles.shortcutBtn} onPress={markAllPresent}>
              <Ionicons name="checkmark-done" size={16} color={BRAND} />
              <Text style={styles.shortcutText}>Mark all present</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shortcutBtn} onPress={clearAll}>
              <Ionicons name="refresh" size={16} color={NEUTRAL.muted} />
              <Text style={[styles.shortcutText, { color: NEUTRAL.muted }]}>Clear</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sortRow}>
            <Text style={styles.sortLabel}>Sort by:</Text>
            {[
              { key: 'firstName', label: 'First name' },
              { key: 'lastName',  label: 'Last name'  },
            ].map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.sortBtn, sortBy === opt.key && { backgroundColor: BRAND, borderColor: BRAND }]}
                onPress={() => setSortBy(opt.key)}
              >
                <Text style={[styles.sortBtnText, sortBy === opt.key && { color: '#fff' }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={BRAND} style={{ marginTop: SPACE.xl }} />
        ) : athletes.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No approved athletes on the roster yet.</Text>
          </View>
        ) : (
          sortedAthletes.map(a => (
            <View key={a.id} style={styles.athleteRow}>
              <View style={[styles.avatar, { backgroundColor: a.avatarColor || BRAND }]}>
                <Text style={styles.avatarText}>{a.firstName?.[0]}{a.lastName?.[0]}</Text>
              </View>
              <Text style={styles.athleteName} numberOfLines={1}>
                {sortBy === 'lastName' ? `${a.lastName}, ${a.firstName}` : `${a.firstName} ${a.lastName}`}
              </Text>
              <View style={styles.statusBtnRow}>
                {renderStatusBtn(a.id, 'present', 'P', STATUS.success)}
                {renderStatusBtn(a.id, 'absent',  'A', STATUS.error)}
                {renderStatusBtn(a.id, 'excused', 'E', STATUS.warning)}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveBtn, (saving || Object.keys(marks).length === 0) && { opacity: 0.5 }]}
          disabled={saving || Object.keys(marks).length === 0}
          onPress={handleSave}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>Save attendance</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: NEUTRAL.bg },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.lg, paddingTop: Platform.OS === 'ios' ? 56 : 20, paddingBottom: SPACE.md, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
  headerBtn:        { flexDirection: 'row', alignItems: 'center' },
  headerBackText:   { color: BRAND, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.medium },
  headerTitle:      { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  content:          { padding: SPACE.lg, paddingBottom: 100 },
  card:             { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.md, marginBottom: SPACE.md, ...SHADOW.sm },
  summaryRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginTop: SPACE.sm },
  summaryPill:      { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color: STATUS.success },
  shortcutRow:      { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.md },
  shortcutBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: SPACE.sm, paddingHorizontal: SPACE.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: NEUTRAL.border },
  shortcutText:     { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: BRAND },
  sortRow:          { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginTop: SPACE.md },
  sortLabel:        { fontSize: FONT_SIZE.sm, color: NEUTRAL.muted },
  sortBtn:          { paddingVertical: 6, paddingHorizontal: SPACE.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: NEUTRAL.border, backgroundColor: NEUTRAL.card },
  sortBtnText:      { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color: NEUTRAL.body },
  athleteRow:       { flexDirection: 'row', alignItems: 'center', backgroundColor: NEUTRAL.card, borderRadius: RADIUS.md, padding: SPACE.md, marginBottom: SPACE.sm, gap: SPACE.md, ...SHADOW.sm },
  avatar:           { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText:       { color: '#fff', fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold },
  athleteName:      { flex: 1, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, color: BRAND_DARK },
  statusBtnRow:     { flexDirection: 'row', gap: 6 },
  statusBtn:        { minWidth: 36, paddingVertical: 6, paddingHorizontal: SPACE.sm, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: NEUTRAL.border, backgroundColor: NEUTRAL.card, alignItems: 'center' },
  statusBtnText:    { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: NEUTRAL.body },
  emptyCard:        { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.xl, alignItems: 'center' },
  emptyText:        { color: NEUTRAL.muted, fontSize: FONT_SIZE.sm, textAlign: 'center' },
  footer:           { position: 'absolute', bottom: 0, left: 0, right: 0, padding: SPACE.lg, paddingBottom: Platform.OS === 'ios' ? 34 : SPACE.lg, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: NEUTRAL.border },
  saveBtn:          { backgroundColor: BRAND, borderRadius: RADIUS.md, paddingVertical: SPACE.md, alignItems: 'center' },
  saveBtnText:      { color: '#fff', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
});
