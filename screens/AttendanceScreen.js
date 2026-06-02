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
import { SIGNAL } from '../constants/design';
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

  const STATUS_COLORS = {
    present: SIGNAL.color.emerald,
    absent:  SIGNAL.color.coral,
    excused: SIGNAL.color.amber,
  };

  const renderStatusBtn = (athleteId, status, label) => {
    const active = marks[athleteId] === status;
    const color = STATUS_COLORS[status];
    return (
      <TouchableOpacity
        key={status}
        style={[
          styles.statusBtn,
          active && { backgroundColor: color, borderColor: color },
        ]}
        onPress={() => setMark(athleteId, status)}
        activeOpacity={0.7}
      >
        <Text style={[styles.statusBtnText, active && { color: SIGNAL.color.white }]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const saveDisabled = saving || Object.keys(marks).length === 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.headerBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={SIGNAL.color.indigo} />
          <Text style={styles.headerBackText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.eyebrow}>Coach</Text>
        <View style={{ width: 64 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.screenTitle}>Attendance</Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Date</Text>
          <DatePickerField
            label=""
            value={selectedDate}
            onChange={d => setSelectedDate(d)}
            maximumDate={new Date()}
          />

          <View style={styles.summaryRow}>
            <View style={[styles.summaryPill, { backgroundColor: `${SIGNAL.color.emerald}${SIGNAL.tint.chip}` }]}>
              <Text style={[styles.summaryPillText, { color: SIGNAL.color.emerald }]}>
                {counts.present} present
              </Text>
            </View>
            <View style={[styles.summaryPill, { backgroundColor: `${SIGNAL.color.coral}${SIGNAL.tint.chip}` }]}>
              <Text style={[styles.summaryPillText, { color: SIGNAL.color.coral }]}>
                {counts.absent} absent
              </Text>
            </View>
            <View style={[styles.summaryPill, { backgroundColor: `${SIGNAL.color.amber}${SIGNAL.tint.chip}` }]}>
              <Text style={[styles.summaryPillText, { color: SIGNAL.color.amber }]}>
                {counts.excused} excused
              </Text>
            </View>
            <View style={[styles.summaryPill, { backgroundColor: SIGNAL.color.paper }]}>
              <Text style={[styles.summaryPillText, { color: SIGNAL.color.mute }]}>
                {counts.unmarked} unmarked
              </Text>
            </View>
          </View>

          <View style={styles.shortcutRow}>
            <TouchableOpacity style={styles.shortcutBtn} onPress={markAllPresent} activeOpacity={0.7}>
              <Ionicons name="checkmark-done" size={15} color={SIGNAL.color.indigo} />
              <Text style={styles.shortcutText}>Mark all present</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shortcutBtn} onPress={clearAll} activeOpacity={0.7}>
              <Ionicons name="refresh" size={15} color={SIGNAL.color.mute} />
              <Text style={[styles.shortcutText, { color: SIGNAL.color.mute }]}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sortHeader}>
          <Text style={styles.sectionTitle}>Roster</Text>
          <View style={styles.sortToggle}>
            {[
              { key: 'firstName', label: 'First' },
              { key: 'lastName',  label: 'Last'  },
            ].map(opt => {
              const active = sortBy === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.sortBtn, active && styles.sortBtnActive]}
                  onPress={() => setSortBy(opt.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.sortBtnText, active && styles.sortBtnTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={SIGNAL.color.indigo} style={{ marginTop: SIGNAL.space[8] }} />
        ) : athletes.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No approved athletes on the roster yet.</Text>
          </View>
        ) : (
          <View style={styles.rosterCard}>
            {sortedAthletes.map((a, i) => (
              <View
                key={a.id}
                style={[styles.athleteRow, i === sortedAthletes.length - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={[styles.avatar, { backgroundColor: a.avatarColor || SIGNAL.color.indigo }]}>
                  <Text style={styles.avatarText}>
                    {a.firstName?.[0]}{a.lastName?.[0]}
                  </Text>
                </View>
                <Text style={styles.athleteName} numberOfLines={1}>
                  {sortBy === 'lastName' ? `${a.lastName}, ${a.firstName}` : `${a.firstName} ${a.lastName}`}
                </Text>
                <View style={styles.statusBtnRow}>
                  {renderStatusBtn(a.id, 'present', 'P')}
                  {renderStatusBtn(a.id, 'absent',  'A')}
                  {renderStatusBtn(a.id, 'excused', 'E')}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveBtn, saveDisabled && styles.saveBtnDisabled]}
          disabled={saveDisabled}
          onPress={handleSave}
          activeOpacity={0.85}
        >
          {saving
            ? <ActivityIndicator color={SIGNAL.color.white} />
            : <Text style={styles.saveBtnText}>Save attendance</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIGNAL.space.screen,
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: SIGNAL.space[4],
    backgroundColor: SIGNAL.color.paper2,
  },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 64,
  },
  headerBackText: {
    color: SIGNAL.color.indigo,
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.bodyMedium,
    marginLeft: 2,
  },
  eyebrow: {
    ...SIGNAL.style.eyebrow,
    fontFamily: SIGNAL.font.bodyMedium,
  },
  content: {
    paddingHorizontal: SIGNAL.space.screen,
    paddingBottom: 120,
  },
  screenTitle: {
    fontSize: SIGNAL.size.title,
    fontFamily: SIGNAL.font.bodyBold,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.titleTight,
    marginTop: SIGNAL.space[2],
    marginBottom: SIGNAL.space[5],
  },
  sectionTitle: {
    fontSize: SIGNAL.size.heading,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.indigo,
    marginBottom: SIGNAL.space[3],
  },
  card: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: SIGNAL.space.card,
    marginBottom: SIGNAL.space[5],
    ...SIGNAL.border.hairline,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIGNAL.space[2],
    marginTop: SIGNAL.space[4],
  },
  summaryPill: {
    paddingVertical: 6,
    paddingHorizontal: SIGNAL.space[4],
    borderRadius: SIGNAL.radius.chip,
  },
  summaryPillText: {
    fontSize: SIGNAL.size.label,
    fontFamily: SIGNAL.font.bodySemi,
  },
  shortcutRow: {
    flexDirection: 'row',
    gap: SIGNAL.space[2],
    marginTop: SIGNAL.space[4],
  },
  shortcutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: SIGNAL.space[3],
    paddingHorizontal: SIGNAL.space[4],
    borderRadius: SIGNAL.radius.button,
    backgroundColor: SIGNAL.color.paper,
    ...SIGNAL.border.hairline,
  },
  shortcutText: {
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.indigo,
  },
  sortHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SIGNAL.space[3],
    paddingHorizontal: 2,
  },
  sortToggle: {
    flexDirection: 'row',
    backgroundColor: SIGNAL.color.paper,
    borderRadius: SIGNAL.radius.chip,
    padding: 3,
    ...SIGNAL.border.hairline,
  },
  sortBtn: {
    paddingVertical: 6,
    paddingHorizontal: SIGNAL.space[4],
    borderRadius: SIGNAL.radius.chip,
  },
  sortBtnActive: {
    backgroundColor: SIGNAL.color.indigo,
  },
  sortBtnText: {
    fontSize: SIGNAL.size.label,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.mute,
  },
  sortBtnTextActive: {
    color: SIGNAL.color.white,
  },
  rosterCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    paddingHorizontal: SIGNAL.space.card,
    ...SIGNAL.border.hairline,
  },
  athleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SIGNAL.space[4],
    gap: SIGNAL.space[4],
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: SIGNAL.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: SIGNAL.color.white,
    fontSize: SIGNAL.size.label,
    fontFamily: SIGNAL.font.bodyBold,
  },
  athleteName: {
    flex: 1,
    fontSize: SIGNAL.size.bodyLg,
    fontFamily: SIGNAL.font.bodyMedium,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  statusBtnRow: {
    flexDirection: 'row',
    gap: 6,
  },
  statusBtn: {
    minWidth: 36,
    paddingVertical: 7,
    paddingHorizontal: SIGNAL.space[3],
    borderRadius: SIGNAL.radius.chip,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    backgroundColor: SIGNAL.color.white,
    alignItems: 'center',
  },
  statusBtnText: {
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.bodyBold,
    color: SIGNAL.color.inkSoft,
  },
  emptyCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: SIGNAL.space[8],
    alignItems: 'center',
    ...SIGNAL.border.hairline,
  },
  emptyText: {
    color: SIGNAL.color.mute,
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.body,
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SIGNAL.space.screen,
    paddingTop: SIGNAL.space[4],
    paddingBottom: Platform.OS === 'ios' ? 34 : SIGNAL.space[5],
    backgroundColor: SIGNAL.color.white,
    borderTopWidth: 1,
    borderTopColor: SIGNAL.color.line,
  },
  saveBtn: {
    backgroundColor: SIGNAL.color.indigo,
    borderRadius: SIGNAL.radius.button,
    paddingVertical: SIGNAL.space[5],
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    color: SIGNAL.color.white,
    fontSize: SIGNAL.size.bodyLg,
    fontFamily: SIGNAL.font.bodySemi,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
});
