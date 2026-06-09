import { Ionicons } from '@expo/vector-icons';
import {
  addDoc, collection, deleteDoc, doc, getDocs, query,
  serverTimestamp, updateDoc, where,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';
import { bottomInset } from '../utils/safeArea';
import { BRAND, SIGNAL } from '../constants/design';
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
        avatarColor: athlete?.avatarColor || SIGNAL.color.indigo,
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

  const initialsOf = (name) => {
    const parts = (name || '').trim().split(/\s+/);
    const first = parts[0]?.[0] || '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase() || '?';
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={SIGNAL.color.ink} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.eyebrow]} numberOfLines={1}>{race.label} · {race.distanceLabel}</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>Enter Results</Text>
        </View>
        <TouchableOpacity onPress={handleSave} style={styles.saveHeaderBtn} disabled={saving} hitSlop={8}>
          {saving
            ? <ActivityIndicator color={SIGNAL.color.indigo} size="small" />
            : <Text style={styles.saveHeaderText}>Save</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Section title */}
          <Text style={styles.sectionTitle}>Athletes</Text>

          {/* Card with athlete rows */}
          <View style={styles.card}>
            {/* Column headers */}
            <View style={styles.colHeaders}>
              <Text style={[styles.colHeaderText, { flex: 1, marginLeft: 40 }]}>Athlete</Text>
              <Text style={[styles.colHeaderText, { width: 50, textAlign: 'center' }]}>Place</Text>
              <Text style={[styles.colHeaderText, { width: 80, textAlign: 'center' }]}>Time</Text>
              <Text style={[styles.colHeaderText, { width: 55, textAlign: 'center' }]}>Status</Text>
            </View>

            {entries.map((entry, i) => {
              const disabled = entry.status !== 'finished';
              return (
                <View
                  key={entry.athleteId}
                  style={[styles.entryRow, i === entries.length - 1 && styles.entryRowLast]}
                >
                  {/* Avatar */}
                  <View style={[styles.avatar, { backgroundColor: entry.avatarColor }]}>
                    <Text style={styles.avatarText}>{initialsOf(entry.athleteName)}</Text>
                  </View>

                  {/* Name */}
                  <Text style={styles.entryName} numberOfLines={1}>{entry.athleteName}</Text>

                  {/* Place */}
                  <TextInput
                    style={[styles.placeInput, disabled && styles.inputDisabled]}
                    value={entry.placeInput}
                    onChangeText={(v) => updateEntry(i, 'placeInput', v)}
                    placeholder="#"
                    placeholderTextColor={SIGNAL.color.mute2}
                    keyboardType="number-pad"
                    editable={!disabled}
                    maxLength={4}
                  />

                  {/* Time */}
                  <TextInput
                    style={[styles.timeInput, disabled && styles.inputDisabled]}
                    value={entry.timeInput}
                    onChangeText={(v) => updateEntry(i, 'timeInput', v)}
                    placeholder="00:00"
                    placeholderTextColor={SIGNAL.color.mute2}
                    keyboardType="numbers-and-punctuation"
                    editable={!disabled}
                    maxLength={8}
                  />

                  {/* Status */}
                  <TouchableOpacity
                    style={[styles.statusBtn, disabled && styles.statusBtnAlt]}
                    onPress={() => {
                      const nextIdx = (statusOptions.indexOf(entry.status) + 1) % statusOptions.length;
                      updateEntry(i, 'status', statusOptions[nextIdx]);
                    }}
                  >
                    <Text style={[styles.statusBtnText, disabled && styles.statusBtnTextAlt]}>
                      {entry.status === 'finished' ? 'Fin' : entry.status}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}

            {entries.length === 0 && (
              <View style={styles.emptyMsg}>
                <Text style={styles.emptyText}>
                  No athletes assigned to this race. Go back and add entries first.
                </Text>
              </View>
            )}
          </View>

          <View style={{ height: 120 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky bottom Save CTA */}
      {entries.length > 0 && (
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color={SIGNAL.color.white} size="small" />
              : <Text style={styles.primaryBtnText}>Save Results</Text>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },

  // ── Header ───────────────────────────────────────────────────────────────
  header: {
    backgroundColor: SIGNAL.color.white,
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: SIGNAL.space[5],
    paddingHorizontal: SIGNAL.space.screen,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: SIGNAL.space[1],
    minWidth: 64,
  },
  backText: {
    color: SIGNAL.color.ink,
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.bodyMedium,
    fontWeight: '500',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: SIGNAL.space[2],
  },
  eyebrow: {
    ...SIGNAL.style.eyebrow,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: SIGNAL.size.heading,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.indigo,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  saveHeaderBtn: {
    paddingVertical: SIGNAL.space[1],
    paddingHorizontal: SIGNAL.space[2],
    minWidth: 64,
    alignItems: 'flex-end',
  },
  saveHeaderText: {
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.indigo,
  },

  // ── Scroll ───────────────────────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: SIGNAL.space.screen,
    paddingTop: SIGNAL.space[6],
  },

  // ── Section title ────────────────────────────────────────────────────────
  sectionTitle: {
    fontSize: SIGNAL.size.heading,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.indigo,
    letterSpacing: SIGNAL.letter.bodyTight,
    marginBottom: SIGNAL.space[3],
    marginLeft: SIGNAL.space[1],
  },

  // ── Card ─────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    ...SIGNAL.border.hairline,
    overflow: 'hidden',
  },

  // ── Column headers ───────────────────────────────────────────────────────
  colHeaders: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIGNAL.space.card,
    paddingVertical: SIGNAL.space[3],
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
    gap: SIGNAL.space[2],
  },
  colHeaderText: {
    fontSize: SIGNAL.size.eyebrow,
    fontFamily: SIGNAL.font.bodyMedium,
    fontWeight: '500',
    color: SIGNAL.color.mute,
    letterSpacing: SIGNAL.letter.eyebrow,
    textTransform: 'uppercase',
  },

  // ── Entry row ────────────────────────────────────────────────────────────
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIGNAL.space.card,
    paddingVertical: SIGNAL.space[3],
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
    gap: SIGNAL.space[2],
  },
  entryRowLast: {
    borderBottomWidth: 0,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: SIGNAL.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: SIGNAL.color.white,
    fontSize: SIGNAL.size.label,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
  },
  entryName: {
    flex: 1,
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.bodyMedium,
    fontWeight: '500',
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },

  // ── Inputs (mono) ────────────────────────────────────────────────────────
  placeInput: {
    width: 50,
    height: 36,
    backgroundColor: SIGNAL.color.paper,
    borderRadius: SIGNAL.radius.control,
    paddingHorizontal: SIGNAL.space[2],
    textAlign: 'center',
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.mono,
    color: SIGNAL.color.ink,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  timeInput: {
    width: 80,
    height: 36,
    backgroundColor: SIGNAL.color.paper,
    borderRadius: SIGNAL.radius.control,
    paddingHorizontal: SIGNAL.space[2],
    textAlign: 'center',
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.mono,
    color: SIGNAL.color.ink,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  inputDisabled: {
    opacity: 0.35,
  },

  // ── Status pill ──────────────────────────────────────────────────────────
  statusBtn: {
    width: 55,
    height: 36,
    borderRadius: SIGNAL.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${SIGNAL.color.emerald}${SIGNAL.tint.chip}`,
  },
  statusBtnAlt: {
    backgroundColor: `${SIGNAL.color.coral}${SIGNAL.tint.chip}`,
  },
  statusBtnText: {
    fontSize: SIGNAL.size.eyebrow,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.emerald,
    letterSpacing: SIGNAL.letter.eyebrow,
    textTransform: 'uppercase',
  },
  statusBtnTextAlt: {
    color: SIGNAL.color.coral,
  },

  // ── Empty ────────────────────────────────────────────────────────────────
  emptyMsg: {
    paddingVertical: SIGNAL.space[8],
    paddingHorizontal: SIGNAL.space[6],
    alignItems: 'center',
  },
  emptyText: {
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.body,
    color: SIGNAL.color.mute,
    textAlign: 'center',
    letterSpacing: SIGNAL.letter.bodyTight,
  },

  // ── Sticky bottom bar ────────────────────────────────────────────────────
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SIGNAL.space.screen,
    paddingTop: SIGNAL.space[4],
    paddingBottom: bottomInset(SIGNAL.space[5], 32),
    backgroundColor: SIGNAL.color.white,
    borderTopWidth: 1,
    borderTopColor: SIGNAL.color.line,
  },
  primaryBtn: {
    height: 50,
    borderRadius: SIGNAL.radius.button,
    backgroundColor: SIGNAL.color.indigo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: SIGNAL.color.white,
    fontSize: SIGNAL.size.bodyLg,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    letterSpacing: SIGNAL.letter.bodyTight,
  },
});
