import { Ionicons } from '@expo/vector-icons';
import {
  addDoc, collection, deleteDoc, doc, getDocs, query,
  serverTimestamp, updateDoc, where,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';
import {
  BRAND, BRAND_DARK, BRAND_LIGHT,
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE, STATUS,
} from '../constants/design';
import { parseTime, formatTime, calcPace } from '../utils/raceUtils';

export default function RaceResultsEntry({ race, meet, schoolId, school, athletes, existingResults, onClose }) {
  const [entries, setEntries] = useState([]);
  const [saving, setSaving] = useState(false);

  const primaryColor = school?.primaryColor || BRAND;

  useEffect(() => {
    // Build entry rows from race.entries (pre-assigned athletes)
    const athleteIds = race.entries || [];
    const rows = athleteIds.map(uid => {
      const athlete = athletes.find(a => a.id === uid);
      const existing = existingResults.find(r => r.athleteId === uid);
      return {
        athleteId: uid,
        athleteName: athlete ? `${athlete.firstName} ${athlete.lastName}` : 'Unknown',
        timeInput: existing?.finishTimeDisplay || '',
        placeInput: existing?.place ? String(existing.place) : '',
        status: existing?.status || 'finished',
        existingDocId: existing?.id || null,
      };
    });
    // Sort alphabetically
    rows.sort((a, b) => a.athleteName.localeCompare(b.athleteName));
    setEntries(rows);
  }, []);

  const updateEntry = (idx, field, value) => {
    setEntries(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  const handleSave = async () => {
    // Validate times
    const finishedEntries = entries.filter(e => e.status === 'finished' && e.timeInput.trim());
    for (const e of finishedEntries) {
      if (!parseTime(e.timeInput)) {
        Alert.alert('Invalid time', `"${e.timeInput}" for ${e.athleteName} is not a valid time. Use MM:SS or H:MM:SS format.`);
        return;
      }
    }

    setSaving(true);
    try {
      // Delete existing results for this race (overwrite approach)
      const existingSnap = await getDocs(query(
        collection(db, 'raceResults'),
        where('raceId', '==', race.id)
      ));
      for (const d of existingSnap.docs) {
        await deleteDoc(doc(db, 'raceResults', d.id));
      }

      // Create new results
      for (const e of entries) {
        const seconds = parseTime(e.timeInput);
        if (e.status === 'finished' && !seconds) continue; // skip empty finished entries

        await addDoc(collection(db, 'raceResults'), {
          raceId: race.id,
          meetId: meet.id || race.meetId,
          schoolId,
          athleteId: e.athleteId,
          athleteName: e.athleteName,
          finishTime: seconds || 0,
          finishTimeDisplay: seconds ? formatTime(seconds) : '',
          place: e.placeInput ? parseInt(e.placeInput) : null,
          teamPlace: 0, // will be calculated on display
          splits: [],
          pace: seconds ? calcPace(seconds, race.distanceLabel) : null,
          status: e.status,
          isScorer: false, // calculated on display
          notes: '',
          enteredBy: auth.currentUser.uid,
          createdAt: serverTimestamp(),
        });

        // Update latestRaceTimes on athlete's user doc
        if (seconds && e.status === 'finished' && race.distanceLabel) {
          try {
            await updateDoc(doc(db, 'users', e.athleteId), {
              [`latestRaceTimes.${race.distanceLabel}`]: {
                time: seconds,
                display: formatTime(seconds),
                raceId: race.id,
                date: meet.date?.toDate ? meet.date.toDate().toISOString() : new Date(meet.date).toISOString(),
              },
            });
          } catch (err) { console.warn('Failed to update latestRaceTimes:', err); }
        }
      }

      // Mark race as results entered
      await updateDoc(doc(db, 'races', race.id), { resultsEntered: true });

      Alert.alert('Saved!', 'Race results have been saved.');
      onClose();
    } catch (e) {
      console.error('Failed to save results:', e);
      Alert.alert('Error', 'Could not save results. Please try again.');
    }
    setSaving(false);
  };

  const statusOptions = ['finished', 'DNS', 'DNF', 'DQ'];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={BRAND_DARK} />
          <Text style={styles.backText}>Cancel</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Enter Results</Text>
          <Text style={styles.headerSub}>{race.label} · {race.distanceLabel}</Text>
        </View>
        <TouchableOpacity onPress={handleSave} style={styles.saveHeaderBtn} disabled={saving}>
          {saving ? <ActivityIndicator color={BRAND} size="small" /> : <Text style={styles.saveHeaderText}>Save</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Column headers */}
          <View style={styles.colHeaders}>
            <Text style={[styles.colHeaderText, { flex: 1 }]}>Athlete</Text>
            <Text style={[styles.colHeaderText, { width: 80, textAlign: 'center' }]}>Time</Text>
            <Text style={[styles.colHeaderText, { width: 50, textAlign: 'center' }]}>Place</Text>
            <Text style={[styles.colHeaderText, { width: 55, textAlign: 'center' }]}>Status</Text>
          </View>

          {entries.map((entry, i) => (
            <View key={entry.athleteId} style={styles.entryRow}>
              <Text style={styles.entryName} numberOfLines={1}>{entry.athleteName}</Text>
              <TextInput
                style={[styles.timeInput, entry.status !== 'finished' && { opacity: 0.3 }]}
                value={entry.timeInput}
                onChangeText={(v) => updateEntry(i, 'timeInput', v)}
                placeholder="MM:SS"
                placeholderTextColor={NEUTRAL.muted}
                keyboardType="numbers-and-punctuation"
                editable={entry.status === 'finished'}
                maxLength={8}
              />
              <TextInput
                style={[styles.placeInput, entry.status !== 'finished' && { opacity: 0.3 }]}
                value={entry.placeInput}
                onChangeText={(v) => updateEntry(i, 'placeInput', v)}
                placeholder="#"
                placeholderTextColor={NEUTRAL.muted}
                keyboardType="number-pad"
                editable={entry.status === 'finished'}
                maxLength={4}
              />
              <TouchableOpacity
                style={[styles.statusBtn, entry.status !== 'finished' && { backgroundColor: STATUS.errorBg }]}
                onPress={() => {
                  const nextIdx = (statusOptions.indexOf(entry.status) + 1) % statusOptions.length;
                  updateEntry(i, 'status', statusOptions[nextIdx]);
                }}
              >
                <Text style={[styles.statusBtnText, entry.status !== 'finished' && { color: STATUS.error }]}>
                  {entry.status === 'finished' ? 'Fin' : entry.status}
                </Text>
              </TouchableOpacity>
            </View>
          ))}

          {entries.length === 0 && (
            <View style={styles.emptyMsg}>
              <Text style={styles.emptyText}>No athletes assigned to this race. Go back and add entries first.</Text>
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: NEUTRAL.bg },
  header:         { backgroundColor: '#fff', paddingTop: Platform.OS === 'ios' ? 56 : 32, paddingBottom: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
  backBtn:        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
  backText:       { color: STATUS.error, fontSize: 15, fontWeight: '600' },
  headerCenter:   { alignItems: 'center', flex: 1 },
  headerTitle:    { fontSize: 17, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  headerSub:      { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: 1 },
  saveHeaderBtn:  { paddingVertical: 6, paddingHorizontal: 10 },
  saveHeaderText: { fontSize: 15, fontWeight: FONT_WEIGHT.bold, color: BRAND },
  scroll:         { flex: 1 },
  colHeaders:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm, borderBottomWidth: 1, borderBottomColor: NEUTRAL.border, backgroundColor: '#fff' },
  colHeaderText:  { fontSize: 11, fontWeight: FONT_WEIGHT.bold, color: NEUTRAL.muted, textTransform: 'uppercase' },
  entryRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm, borderBottomWidth: 0.5, borderBottomColor: NEUTRAL.border, backgroundColor: '#fff', gap: SPACE.sm },
  entryName:      { flex: 1, fontSize: FONT_SIZE.sm, color: BRAND_DARK, fontWeight: '600' },
  timeInput:      { width: 80, backgroundColor: NEUTRAL.bg, borderRadius: RADIUS.sm, padding: SPACE.sm, textAlign: 'center', fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, borderWidth: 1, borderColor: NEUTRAL.border },
  placeInput:     { width: 50, backgroundColor: NEUTRAL.bg, borderRadius: RADIUS.sm, padding: SPACE.sm, textAlign: 'center', fontSize: FONT_SIZE.sm, color: BRAND_DARK, borderWidth: 1, borderColor: NEUTRAL.border },
  statusBtn:      { width: 55, borderRadius: RADIUS.sm, padding: SPACE.sm, alignItems: 'center', backgroundColor: NEUTRAL.bg },
  statusBtnText:  { fontSize: 11, fontWeight: FONT_WEIGHT.bold, color: NEUTRAL.body },
  emptyMsg:       { padding: SPACE['2xl'], alignItems: 'center' },
  emptyText:      { fontSize: FONT_SIZE.sm, color: NEUTRAL.muted, textAlign: 'center' },
});
