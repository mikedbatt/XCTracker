import { Ionicons } from '@expo/vector-icons';
import {
  addDoc, collection, deleteDoc, doc, getDocs, query,
  serverTimestamp, updateDoc, where,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActionSheetIOS, ActivityIndicator, Alert, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';
import {
  BRAND, BRAND_DARK, BRAND_LIGHT,
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SIGNAL, SPACE, STATUS,
} from '../constants/design';
import { RACE_DISTANCES, RACE_LEVELS } from '../utils/raceUtils';
import RaceResults from './RaceResults';

export default function MeetDetail({ meet, schoolId, school, athletes, groups, onClose }) {
  const [races, setRaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddRace, setShowAddRace] = useState(false);
  const [selectedRace, setSelectedRace] = useState(null);
  const [editingEntries, setEditingEntries] = useState(null); // race being edited for entries

  // Add race form
  const [raceLabel, setRaceLabel] = useState('');
  const [raceGender, setRaceGender] = useState('boys');
  const [raceLevel, setRaceLevel] = useState('varsity');
  const [raceDistance, setRaceDistance] = useState('5K');
  const [saving, setSaving] = useState(false);

  const primaryColor = school?.primaryColor || SIGNAL.color.indigo;
  const meetDate = meet.date?.toDate ? meet.date.toDate() : new Date(meet.date);
  const isPast = meetDate < new Date(new Date().setHours(0, 0, 0, 0));

  useEffect(() => { loadRaces(); }, []);

  const loadRaces = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'races'),
        where('meetId', '==', meet.id)
      ));
      const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Also load result counts per race
      for (const race of loaded) {
        try {
          const resSnap = await getDocs(query(
            collection(db, 'raceResults'),
            where('raceId', '==', race.id)
          ));
          race.resultCount = resSnap.size;
        } catch { race.resultCount = 0; }
      }
      setRaces(loaded);
    } catch (e) { console.warn('Failed to load races:', e); }
    setLoading(false);
  };

  // Auto-suggest athletes based on gender + level
  const suggestEntries = (gender, level) => {
    return athletes.filter(a => {
      if (a.status !== 'approved') return false;
      if (gender !== 'mixed' && a.gender !== gender) return false;
      if (level !== 'open') {
        // Match level to group name (heuristic: group name contains "varsity" or "jv")
        if (!a.groupId) return level === 'jv'; // unassigned → JV by default
        const group = groups.find(g => g.id === a.groupId);
        if (!group) return true;
        const gName = group.name.toLowerCase();
        if (level === 'varsity' && gName.includes('jv')) return false;
        if (level === 'jv' && gName.includes('varsity')) return false;
      }
      return true;
    }).map(a => a.id);
  };

  const handleAddRace = async () => {
    const label = raceLabel.trim() || `${RACE_LEVELS.find(l => l.key === raceLevel)?.label || ''} ${raceGender === 'boys' ? 'Boys' : raceGender === 'girls' ? 'Girls' : 'Mixed'} ${RACE_DISTANCES.find(d => d.key === raceDistance)?.label || ''}`.trim();
    const entries = suggestEntries(raceGender, raceLevel);

    setSaving(true);
    try {
      await addDoc(collection(db, 'races'), {
        meetId: meet.id,
        schoolId,
        label,
        gender: raceGender,
        level: raceLevel,
        distance: RACE_DISTANCES.find(d => d.key === raceDistance)?.meters || null,
        distanceLabel: raceDistance,
        entries,
        resultsEntered: false,
        createdAt: serverTimestamp(),
      });
      setShowAddRace(false);
      setRaceLabel('');
      await loadRaces();
    } catch (e) {
      console.warn('Failed to create race:', e);
      Alert.alert('Error', 'Could not create race.');
    }
    setSaving(false);
  };

  const handleDeleteRace = (race) => {
    Alert.alert('Delete race?', `Remove "${race.label}" and all its results?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          // Delete results first
          const resSnap = await getDocs(query(collection(db, 'raceResults'), where('raceId', '==', race.id)));
          for (const d of resSnap.docs) await deleteDoc(doc(db, 'raceResults', d.id));
          await deleteDoc(doc(db, 'races', race.id));
          await loadRaces();
        } catch { Alert.alert('Error', 'Could not delete race.'); }
      }},
    ]);
  };

  const handleToggleEntry = async (race, athleteId) => {
    const currentEntries = race.entries || [];
    const updated = currentEntries.includes(athleteId)
      ? currentEntries.filter(id => id !== athleteId)
      : [...currentEntries, athleteId];
    try {
      await updateDoc(doc(db, 'races', race.id), { entries: updated });
      // Update local state
      setRaces(prev => prev.map(r => r.id === race.id ? { ...r, entries: updated } : r));
      if (editingEntries?.id === race.id) setEditingEntries(prev => ({ ...prev, entries: updated }));
    } catch (e) { console.warn('Failed to update entries:', e); }
  };

  const getEligibleAthletes = (race) => {
    return athletes.filter(a => {
      if (a.status !== 'approved') return false;
      if (race.gender !== 'mixed' && a.gender !== race.gender) return false;
      return true;
    });
  };

  // Helper: chip accent color by gender / level
  const genderAccent = (g) => g === 'boys' ? SIGNAL.color.cyan : g === 'girls' ? SIGNAL.color.pink : SIGNAL.color.violet;
  const levelAccent  = (l) => l === 'varsity' ? SIGNAL.color.indigo : l === 'jv' ? SIGNAL.color.amber : SIGNAL.color.emerald;

  // If editing entries for a race
  if (editingEntries) {
    const eligible = getEligibleAthletes(editingEntries);
    const entries = editingEntries.entries || [];

    // Build map of athletes already in OTHER races in this meet
    const assignedElsewhere = {};
    races.forEach(r => {
      if (r.id === editingEntries.id) return;
      (r.entries || []).forEach(uid => { assignedElsewhere[uid] = r.label; });
    });

    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setEditingEntries(null)} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={20} color={SIGNAL.color.inkSoft} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>{editingEntries.label}</Text>
            <Text style={styles.headerEyebrow}>{entries.length} ENTRIES</Text>
          </View>
          <TouchableOpacity onPress={() => { setSelectedRace(editingEntries); setEditingEntries(null); }} style={styles.headerAction}>
            <Text style={styles.headerActionText}>Results</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
          <Text style={styles.eyebrow}>Tap to add or remove</Text>
          <View style={styles.entriesCard}>
            {eligible.map((a, idx) => {
              const isSelected = entries.includes(a.id);
              const otherRace = assignedElsewhere[a.id];
              const groupName = groups.find(g => g.id === a.groupId)?.name || 'Unassigned';
              const isLast = idx === eligible.length - 1;
              return (
                <TouchableOpacity
                  key={a.id}
                  style={[
                    styles.entryAthleteRow,
                    !isLast && styles.entryAthleteRowDivider,
                    isSelected && { backgroundColor: `${SIGNAL.color.indigo}0A` },
                    otherRace && !isSelected && { opacity: 0.45 },
                  ]}
                  onPress={() => {
                    if (otherRace && !isSelected) {
                      Alert.alert('Already assigned', `${a.firstName} ${a.lastName} is already in ${otherRace}. Remove them from that race first.`);
                      return;
                    }
                    handleToggleEntry(editingEntries, a.id);
                  }}
                >
                  <Ionicons
                    name={isSelected ? 'checkmark-circle' : otherRace ? 'remove-circle-outline' : 'ellipse-outline'}
                    size={22}
                    color={isSelected ? SIGNAL.color.indigo : SIGNAL.color.mute2}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.entryAthleteName, isSelected && { color: SIGNAL.color.ink }]}>
                      {a.firstName} {a.lastName}
                    </Text>
                    <Text style={styles.entryAthleteGroup}>
                      {groupName}{otherRace ? `  ·  In ${otherRace}` : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </View>
    );
  }

  // If a race is selected, show its results
  if (selectedRace) {
    return (
      <RaceResults
        race={selectedRace}
        meet={meet}
        schoolId={schoolId}
        school={school}
        athletes={athletes}
        onClose={() => { setSelectedRace(null); loadRaces(); }}
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
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{meet.name}</Text>
          <Text style={styles.headerEyebrow}>
            {meetDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setShowAddRace(true)} style={styles.headerAction}>
          <Text style={[styles.headerActionText, { color: SIGNAL.color.pink }]}>+ Add race</Text>
        </TouchableOpacity>
      </View>

      {/* Meet info bar */}
      <View style={styles.meetInfoBar}>
        <Text style={styles.meetInfoText}>
          {meetDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </Text>
        {meet.location && (
          <Text style={styles.meetInfoMuted}>
            {meet.location}{meet.course ? `  ·  ${meet.course}` : ''}
          </Text>
        )}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={SIGNAL.color.indigo} /></View>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>

          {/* Add race form */}
          {showAddRace && (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Add a Race</Text>

              <Text style={styles.formLabel}>Gender</Text>
              <View style={styles.chipRow}>
                {[{ key: 'boys', label: 'Boys' }, { key: 'girls', label: 'Girls' }, { key: 'mixed', label: 'Mixed' }].map(g => {
                  const accent = genderAccent(g.key);
                  const active = raceGender === g.key;
                  return (
                    <TouchableOpacity
                      key={g.key}
                      style={[styles.chip, active && { backgroundColor: `${accent}${SIGNAL.tint.chip}`, borderColor: accent }]}
                      onPress={() => setRaceGender(g.key)}
                    >
                      <Text style={[styles.chipText, active && { color: accent }]}>{g.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.formLabel}>Level</Text>
              <View style={styles.chipRow}>
                {RACE_LEVELS.map(l => {
                  const accent = levelAccent(l.key);
                  const active = raceLevel === l.key;
                  return (
                    <TouchableOpacity
                      key={l.key}
                      style={[styles.chip, active && { backgroundColor: `${accent}${SIGNAL.tint.chip}`, borderColor: accent }]}
                      onPress={() => setRaceLevel(l.key)}
                    >
                      <Text style={[styles.chipText, active && { color: accent }]}>{l.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.formLabel}>Distance</Text>
              <View style={styles.chipRow}>
                {RACE_DISTANCES.filter(d => d.key !== 'Custom').map(d => {
                  const active = raceDistance === d.key;
                  return (
                    <TouchableOpacity
                      key={d.key}
                      style={[styles.chip, active && { backgroundColor: `${SIGNAL.color.indigo}${SIGNAL.tint.chip}`, borderColor: SIGNAL.color.indigo }]}
                      onPress={() => setRaceDistance(d.key)}
                    >
                      <Text style={[styles.chipMono, active && { color: SIGNAL.color.indigo }]}>{d.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.formLabel}>Label (optional — auto-generated if blank)</Text>
              <TextInput
                style={styles.input}
                value={raceLabel}
                onChangeText={setRaceLabel}
                placeholder="e.g. Varsity Boys 5K"
                placeholderTextColor={SIGNAL.color.mute2}
              />

              <Text style={styles.entryHint}>
                {suggestEntries(raceGender, raceLevel).length} athletes will be auto-assigned based on gender and group
              </Text>

              <View style={styles.formBtns}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAddRace(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleAddRace} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Add Race</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Race list */}
          {races.length > 0 && (
            <Text style={styles.eyebrow}>Races</Text>
          )}

          {races.length === 0 && !showAddRace ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No races added yet</Text>
              <Text style={styles.emptyDesc}>
                Add individual races for this meet (Varsity Boys, Girls, JV, etc.)
              </Text>
              <TouchableOpacity style={[styles.saveBtn, { marginTop: SIGNAL.space.6, alignSelf: 'stretch' }]} onPress={() => setShowAddRace(true)}>
                <Text style={styles.saveBtnText}>+ Add First Race</Text>
              </TouchableOpacity>
            </View>
          ) : races.map(race => {
            const gAccent = genderAccent(race.gender);
            const lAccent = levelAccent(race.level);
            const genderLabel = race.gender === 'boys' ? 'Boys' : race.gender === 'girls' ? 'Girls' : 'Mixed';
            const levelLabel  = RACE_LEVELS.find(l => l.key === race.level)?.label || race.level;
            return (
              <TouchableOpacity key={race.id} style={styles.raceCard} activeOpacity={0.7} onPress={() => setEditingEntries(race)}>
                <View style={styles.raceInfo}>
                  <Text style={styles.raceName} numberOfLines={1}>{race.label}</Text>
                  <View style={styles.raceChips}>
                    <View style={[styles.miniChip, { backgroundColor: `${gAccent}${SIGNAL.tint.chip}` }]}>
                      <Text style={[styles.miniChipText, { color: gAccent }]}>{genderLabel}</Text>
                    </View>
                    <View style={[styles.miniChip, { backgroundColor: `${lAccent}${SIGNAL.tint.chip}` }]}>
                      <Text style={[styles.miniChipText, { color: lAccent }]}>{levelLabel}</Text>
                    </View>
                    <View style={[styles.miniChip, { backgroundColor: SIGNAL.color.paper2 }]}>
                      <Text style={[styles.miniChipMono, { color: SIGNAL.color.inkSoft }]}>{race.distanceLabel}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.raceRight}>
                  {race.resultsEntered ? (
                    <TouchableOpacity
                      style={[styles.statusBadge, { backgroundColor: `${SIGNAL.color.emerald}${SIGNAL.tint.chip}` }]}
                      onPress={() => setSelectedRace(race)}
                    >
                      <Text style={[styles.statusText, { color: SIGNAL.color.emerald }]}>
                        {race.resultCount || 0} results
                      </Text>
                    </TouchableOpacity>
                  ) : isPast ? (
                    <TouchableOpacity
                      style={[styles.statusBadge, { backgroundColor: `${SIGNAL.color.amber}${SIGNAL.tint.chip}` }]}
                      onPress={() => setSelectedRace(race)}
                    >
                      <Text style={[styles.statusText, { color: SIGNAL.color.amber }]}>Enter results</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={[styles.statusBadge, { backgroundColor: SIGNAL.color.paper2 }]}>
                      <Text style={[styles.statusText, { color: SIGNAL.color.mute }]}>
                        {race.entries?.length || 0} entries
                      </Text>
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={() => handleDeleteRace(race)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={{ marginLeft: SIGNAL.space.3 }}
                  >
                    <Ionicons name="trash-outline" size={15} color={SIGNAL.color.mute2} />
                  </TouchableOpacity>
                  <Ionicons name="chevron-forward" size={16} color={SIGNAL.color.mute2} style={{ marginLeft: SIGNAL.space.2 }} />
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: SIGNAL.color.paper2 },
  center:           { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  header:           {
    backgroundColor: SIGNAL.color.white,
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: SIGNAL.space.4,
    paddingHorizontal: SIGNAL.space.6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIGNAL.space.2,
  },
  backBtn:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, minWidth: 60 },
  backText:         { color: SIGNAL.color.inkSoft, fontSize: 14, fontFamily: SIGNAL.font.bodySemi, fontWeight: '600' },
  headerCenter:     { flex: 1, alignItems: 'center' },
  headerTitle:      {
    fontSize: SIGNAL.size.heading,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.indigo,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  headerEyebrow:    {
    fontSize: 10,
    letterSpacing: SIGNAL.letter.eyebrow,
    textTransform: 'uppercase',
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.bodyMedium,
    fontWeight: '500',
    marginTop: 2,
  },
  headerAction:     { minWidth: 80, alignItems: 'flex-end', paddingVertical: 4 },
  headerActionText: {
    fontSize: 13,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.indigo,
  },

  // Meet info bar
  meetInfoBar:      {
    backgroundColor: SIGNAL.color.white,
    paddingHorizontal: SIGNAL.space.6,
    paddingBottom: SIGNAL.space.5,
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  meetInfoText:     {
    fontSize: 13,
    color: SIGNAL.color.inkSoft,
    fontFamily: SIGNAL.font.body,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  meetInfoMuted:    {
    fontSize: 12.5,
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.body,
    marginTop: 3,
  },

  scroll:           { flex: 1 },

  // Eyebrow section labels
  eyebrow:          {
    fontSize: 10.5,
    letterSpacing: SIGNAL.letter.eyebrow,
    textTransform: 'uppercase',
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.bodyMedium,
    fontWeight: '500',
    marginTop: SIGNAL.space.6,
    marginBottom: SIGNAL.space.3,
    marginHorizontal: SIGNAL.space.screen + 4,
  },

  // Race cards (Signal)
  raceCard:         {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    paddingVertical: SIGNAL.space.5,
    paddingHorizontal: SIGNAL.space.6,
    marginHorizontal: SIGNAL.space.screen,
    marginTop: SIGNAL.space.2,
    gap: SIGNAL.space.3,
  },
  raceInfo:         { flex: 1, minWidth: 0 },
  raceName:         {
    fontSize: 14.5,
    fontFamily: SIGNAL.font.bodyBold,
    fontWeight: '700',
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  raceChips:        { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  miniChip:         {
    paddingHorizontal: SIGNAL.space.2,
    paddingVertical: 2,
    borderRadius: SIGNAL.radius.chip,
  },
  miniChipText:     {
    fontSize: 10.5,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
  },
  miniChipMono:     {
    fontSize: 10.5,
    fontFamily: SIGNAL.font.mono,
    fontWeight: '600',
  },
  raceRight:        { flexDirection: 'row', alignItems: 'center' },
  statusBadge:      {
    paddingHorizontal: SIGNAL.space.3,
    paddingVertical: 4,
    borderRadius: SIGNAL.radius.chip,
  },
  statusText:       {
    fontSize: 11,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '700',
  },

  // Form
  formCard:         {
    marginHorizontal: SIGNAL.space.screen,
    marginTop: SIGNAL.space.6,
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    padding: SIGNAL.space.6,
  },
  formTitle:        {
    fontSize: SIGNAL.size.heading,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.indigo,
    marginBottom: SIGNAL.space.5,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  formLabel:        {
    fontSize: 11,
    letterSpacing: SIGNAL.letter.eyebrow,
    textTransform: 'uppercase',
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.bodyMedium,
    fontWeight: '500',
    marginBottom: SIGNAL.space.2,
    marginTop: SIGNAL.space.4,
  },
  input:            {
    backgroundColor: SIGNAL.color.paper,
    borderRadius: SIGNAL.radius.control,
    paddingHorizontal: SIGNAL.space.4,
    paddingVertical: SIGNAL.space.4,
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.body,
    color: SIGNAL.color.ink,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  chipRow:          { flexDirection: 'row', flexWrap: 'wrap', gap: SIGNAL.space.2 },
  chip:             {
    borderRadius: SIGNAL.radius.chip,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    backgroundColor: SIGNAL.color.white,
    paddingHorizontal: SIGNAL.space.4,
    paddingVertical: SIGNAL.space.2,
  },
  chipText:         {
    fontSize: 12.5,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.inkSoft,
  },
  chipMono:         {
    fontSize: 12.5,
    fontFamily: SIGNAL.font.mono,
    fontWeight: '600',
    color: SIGNAL.color.inkSoft,
  },
  entryHint:        {
    fontSize: 12,
    color: SIGNAL.color.indigo,
    fontFamily: SIGNAL.font.bodyMedium,
    fontWeight: '500',
    marginTop: SIGNAL.space.5,
    marginBottom: SIGNAL.space.2,
  },
  formBtns:         { flexDirection: 'row', gap: SIGNAL.space.4, marginTop: SIGNAL.space.5 },
  cancelBtn:        {
    flex: 1,
    borderRadius: SIGNAL.radius.button,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: SIGNAL.color.paper2,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  cancelBtnText:    {
    fontSize: 14,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.inkSoft,
  },
  saveBtn:          {
    flex: 1,
    borderRadius: SIGNAL.radius.button,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: SIGNAL.color.ink,
  },
  saveBtnText:      {
    color: SIGNAL.color.white,
    fontSize: 14,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
  },

  // Empty
  emptyCard:        {
    marginHorizontal: SIGNAL.space.screen,
    marginTop: SIGNAL.space.6,
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    paddingVertical: SIGNAL.space.8 + 6,
    paddingHorizontal: SIGNAL.space.6,
    alignItems: 'center',
  },
  emptyTitle:       {
    fontSize: SIGNAL.size.heading,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.indigo,
    marginBottom: SIGNAL.space.2,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  emptyDesc:        {
    fontSize: 13,
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.body,
    textAlign: 'center',
    lineHeight: 19,
  },

  // Entries management
  entriesCard:      {
    marginHorizontal: SIGNAL.space.screen,
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    overflow: 'hidden',
  },
  entryAthleteRow:  {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIGNAL.space.4,
    paddingHorizontal: SIGNAL.space.5,
    paddingVertical: SIGNAL.space.4,
  },
  entryAthleteRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  entryAthleteName: {
    fontSize: 14,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.inkSoft,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  entryAthleteGroup:{
    fontSize: 11.5,
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.body,
    marginTop: 2,
  },
});
