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
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE, STATUS,
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

  const primaryColor = school?.primaryColor || BRAND;
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
            <Ionicons name="chevron-back" size={22} color={BRAND_DARK} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.headerTitle}>{editingEntries.label}</Text>
            <Text style={{ fontSize: FONT_SIZE.xs, color: NEUTRAL.muted }}>{entries.length} entries</Text>
          </View>
          <TouchableOpacity onPress={() => { setSelectedRace(editingEntries); setEditingEntries(null); }} style={{ padding: 6 }}>
            <Text style={{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND }}>Results</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.formLabel, { marginLeft: SPACE.lg, marginTop: SPACE.lg }]}>
            Tap to add or remove athletes
          </Text>
          {eligible.map(a => {
            const isSelected = entries.includes(a.id);
            const otherRace = assignedElsewhere[a.id];
            const groupName = groups.find(g => g.id === a.groupId)?.name || 'Unassigned';
            return (
              <TouchableOpacity
                key={a.id}
                style={[styles.entryAthleteRow, isSelected && { backgroundColor: BRAND_LIGHT, borderColor: BRAND }, otherRace && !isSelected && { opacity: 0.4 }]}
                onPress={() => {
                  if (otherRace && !isSelected) {
                    Alert.alert('Already assigned', `${a.firstName} ${a.lastName} is already in ${otherRace}. Remove them from that race first.`);
                    return;
                  }
                  handleToggleEntry(editingEntries, a.id);
                }}
              >
                <Ionicons name={isSelected ? 'checkmark-circle' : otherRace ? 'remove-circle-outline' : 'ellipse-outline'} size={22} color={isSelected ? BRAND : otherRace ? NEUTRAL.muted : NEUTRAL.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.entryAthleteName, isSelected && { color: BRAND_DARK }]}>{a.firstName} {a.lastName}</Text>
                  <Text style={styles.entryAthleteGroup}>
                    {groupName}{otherRace ? ` · In ${otherRace}` : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 60 }} />
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
          <Ionicons name="chevron-back" size={22} color={BRAND_DARK} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{meet.name}</Text>
        <TouchableOpacity onPress={() => setShowAddRace(true)} style={styles.addHeaderBtn}>
          <Ionicons name="add" size={22} color={BRAND} />
        </TouchableOpacity>
      </View>

      {/* Meet info bar */}
      <View style={styles.meetInfoBar}>
        <Text style={styles.meetInfoText}>
          {meetDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </Text>
        {meet.location && <Text style={styles.meetInfoText}>{meet.location}{meet.course ? ` · ${meet.course}` : ''}</Text>}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={primaryColor} /></View>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Add race form */}
          {showAddRace && (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Add a Race</Text>

              <Text style={styles.formLabel}>Gender</Text>
              <View style={styles.chipRow}>
                {[{ key: 'boys', label: 'Boys' }, { key: 'girls', label: 'Girls' }, { key: 'mixed', label: 'Mixed' }].map(g => (
                  <TouchableOpacity key={g.key} style={[styles.chip, raceGender === g.key && { backgroundColor: primaryColor, borderColor: primaryColor }]} onPress={() => setRaceGender(g.key)}>
                    <Text style={[styles.chipText, raceGender === g.key && { color: '#fff' }]}>{g.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.formLabel}>Level</Text>
              <View style={styles.chipRow}>
                {RACE_LEVELS.map(l => (
                  <TouchableOpacity key={l.key} style={[styles.chip, raceLevel === l.key && { backgroundColor: primaryColor, borderColor: primaryColor }]} onPress={() => setRaceLevel(l.key)}>
                    <Text style={[styles.chipText, raceLevel === l.key && { color: '#fff' }]}>{l.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.formLabel}>Distance</Text>
              <View style={styles.chipRow}>
                {RACE_DISTANCES.filter(d => d.key !== 'Custom').map(d => (
                  <TouchableOpacity key={d.key} style={[styles.chip, raceDistance === d.key && { backgroundColor: primaryColor, borderColor: primaryColor }]} onPress={() => setRaceDistance(d.key)}>
                    <Text style={[styles.chipText, raceDistance === d.key && { color: '#fff' }]}>{d.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.formLabel}>Label (optional — auto-generated if blank)</Text>
              <TextInput style={styles.input} value={raceLabel} onChangeText={setRaceLabel} placeholder={`e.g. Varsity Boys 5K`} placeholderTextColor={NEUTRAL.muted} />

              <Text style={styles.entryHint}>
                {suggestEntries(raceGender, raceLevel).length} athletes will be auto-assigned based on gender and group
              </Text>

              <View style={styles.formBtns}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAddRace(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: primaryColor }]} onPress={handleAddRace} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Add Race</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Race list */}
          {races.length === 0 && !showAddRace ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No races added yet</Text>
              <Text style={styles.emptyDesc}>Add individual races for this meet (Varsity Boys, Girls, JV, etc.)</Text>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: primaryColor, marginTop: SPACE.md }]} onPress={() => setShowAddRace(true)}>
                <Text style={styles.saveBtnText}>+ Add First Race</Text>
              </TouchableOpacity>
            </View>
          ) : races.map(race => (
            <TouchableOpacity key={race.id} style={styles.raceCard} activeOpacity={0.7} onPress={() => setEditingEntries(race)}>
              <View style={styles.raceInfo}>
                <Text style={styles.raceName}>{race.label}</Text>
                <Text style={styles.raceMeta}>
                  {race.distanceLabel} · {race.entries?.length || 0} entries
                  {race.resultsEntered ? ` · ${race.resultCount || 0} results` : isPast ? ' · Results pending' : ''}
                </Text>
              </View>
              {race.resultsEntered ? (
                <TouchableOpacity style={[styles.statusBadge, { backgroundColor: '#d1fae5' }]} onPress={() => setSelectedRace(race)}>
                  <Text style={[styles.statusText, { color: '#065f46' }]}>Results</Text>
                </TouchableOpacity>
              ) : isPast ? (
                <TouchableOpacity style={[styles.statusBadge, { backgroundColor: '#fef3c7' }]} onPress={() => setSelectedRace(race)}>
                  <Text style={[styles.statusText, { color: '#92400e' }]}>Enter</Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.statusBadge, { backgroundColor: BRAND_LIGHT }]}>
                  <Text style={[styles.statusText, { color: BRAND }]}>Entries</Text>
                </View>
              )}
              <TouchableOpacity onPress={() => handleDeleteRace(race)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="trash-outline" size={16} color={NEUTRAL.muted} />
              </TouchableOpacity>
              <Ionicons name="chevron-forward" size={16} color={NEUTRAL.muted} />
            </TouchableOpacity>
          ))}

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
  headerTitle:    { fontSize: 18, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, flex: 1, textAlign: 'center' },
  addHeaderBtn:   { padding: 6 },
  meetInfoBar:    { backgroundColor: '#fff', paddingHorizontal: SPACE.lg, paddingBottom: SPACE.md, borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
  meetInfoText:   { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, lineHeight: 18 },
  scroll:         { flex: 1 },
  // Race cards
  raceCard:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: SPACE.lg, marginHorizontal: SPACE.lg, marginTop: SPACE.sm, gap: SPACE.sm, ...SHADOW.sm },
  raceInfo:       { flex: 1 },
  raceName:       { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  raceMeta:       { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: 2 },
  statusBadge:    { borderRadius: RADIUS.sm, paddingHorizontal: SPACE.sm, paddingVertical: 3 },
  statusText:     { fontSize: 11, fontWeight: FONT_WEIGHT.bold },
  // Form
  formCard:       { margin: SPACE.lg, backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: SPACE.lg, ...SHADOW.sm },
  formTitle:      { fontSize: 18, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: SPACE.md },
  formLabel:      { fontSize: FONT_SIZE.sm, fontWeight: '600', color: NEUTRAL.body, marginBottom: SPACE.sm, marginTop: SPACE.sm },
  input:          { backgroundColor: NEUTRAL.bg, borderRadius: RADIUS.md, padding: SPACE.md, fontSize: FONT_SIZE.base, color: BRAND_DARK, borderWidth: 1, borderColor: NEUTRAL.border, marginBottom: SPACE.xs },
  chipRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginBottom: SPACE.xs },
  chip:           { borderRadius: RADIUS.sm, borderWidth: 1.5, borderColor: NEUTRAL.border, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
  chipText:       { fontSize: FONT_SIZE.sm, fontWeight: '600', color: NEUTRAL.body },
  entryHint:      { fontSize: FONT_SIZE.xs, color: BRAND, fontWeight: '600', marginTop: SPACE.sm, marginBottom: SPACE.sm },
  formBtns:       { flexDirection: 'row', gap: SPACE.md, marginTop: SPACE.md },
  cancelBtn:      { flex: 1, borderRadius: RADIUS.md, padding: 14, alignItems: 'center', backgroundColor: '#fee2e2' },
  cancelBtnText:  { fontSize: 15, fontWeight: '600', color: '#dc2626' },
  saveBtn:        { flex: 1, borderRadius: RADIUS.md, padding: 14, alignItems: 'center' },
  saveBtnText:    { color: '#fff', fontSize: 15, fontWeight: FONT_WEIGHT.bold },
  emptyCard:      { margin: SPACE.lg, backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: SPACE['2xl'], alignItems: 'center', ...SHADOW.sm },
  emptyTitle:     { fontSize: 18, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: SPACE.sm },
  emptyDesc:      { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, textAlign: 'center', lineHeight: 20 },
  // Entries management
  entryAthleteRow:{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, backgroundColor: '#fff', borderBottomWidth: 0.5, borderBottomColor: NEUTRAL.border, borderWidth: 1, borderColor: 'transparent' },
  entryAthleteName:{ fontSize: FONT_SIZE.sm, fontWeight: '600', color: NEUTRAL.body },
  entryAthleteGroup:{ fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: 1 },
});
