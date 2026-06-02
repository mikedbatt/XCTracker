import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  collection, doc, getDocs, query, updateDoc, where,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  Alert, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { db } from '../firebaseConfig';
import { SIGNAL } from '../constants/design';
import DatePickerField from './DatePickerField';
import {
  generateVolumeCurve,
  getActiveSeason, getPhaseForSeason,
  SPORTS, SPORT_PHASES,
} from './SeasonPlanner';

// Build a stable key for a season: "sport_YYYY-MM-DD"
function seasonKey(season) {
  const start = season.seasonStart ? new Date(season.seasonStart).toISOString().split('T')[0] : 'unknown';
  return `${season.sport || 'cross_country'}_${start}`;
}

export default function ManageSeasons({ school, schoolId, groups: initialGroups, onClose, onSaved }) {
  const toISO = (val) => {
    if (!val) return null;
    if (typeof val === 'string') return val;
    if (val?.toDate) return val.toDate().toISOString();
    if (val instanceof Date) return val.toISOString();
    return null;
  };

  const initialSeasons = () => {
    if (school?.seasons?.length > 0) return school.seasons;
    const start = toISO(school?.seasonStart);
    const champ = toISO(school?.championshipDate);
    if (start && champ) {
      return [{
        sport: 'cross_country',
        name: `Cross Country ${new Date(start).getFullYear()}`,
        seasonStart: start,
        championshipDate: champ,
      }];
    }
    return [];
  };

  const [seasons, setSeasons] = useState(initialSeasons());
  const [groups, setGroups] = useState(initialGroups || []);
  const [editingIdx, setEditingIdx] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState(null);

  // Season form fields
  const [sport, setSport] = useState('cross_country');
  const [name, setName] = useState('');
  const [seasonStart, setSeasonStart] = useState(null);
  const [championshipDate, setChampionshipDate] = useState(null);

  // Reload groups when we modify them
  const reloadGroups = async () => {
    try {
      const snap = await getDocs(query(
        collection(db, 'groups'),
        where('schoolId', '==', schoolId)
      ));
      const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      loaded.sort((a, b) => (a.order || 0) - (b.order || 0));
      setGroups(loaded);
    } catch (e) { console.warn('Failed to reload groups:', e); }
  };

  useEffect(() => { reloadGroups(); }, []);

  // ── Season CRUD ────────────────────────────────────────────────────────────

  const openAdd = () => {
    setSport('cross_country');
    setName('');
    setSeasonStart(null);
    setChampionshipDate(null);
    setEditingIdx(null);
    setShowForm(true);
  };

  const openEdit = (idx) => {
    const s = seasons[idx];
    setSport(s.sport);
    setName(s.name);
    setSeasonStart(s.seasonStart ? new Date(s.seasonStart) : null);
    setChampionshipDate(s.championshipDate ? new Date(s.championshipDate) : null);
    setEditingIdx(idx);
    setShowForm(true);
  };

  const handleSaveSeason = async () => {
    if (!seasonStart || !championshipDate) {
      Alert.alert('Missing dates', 'Please set both a start date and championship date.');
      return;
    }
    if (championshipDate <= seasonStart) {
      Alert.alert('Invalid dates', 'Championship date must be after the start date.');
      return;
    }
    const sportDef = SPORTS[sport];
    const newSeason = {
      sport,
      name: name.trim() || `${sportDef.label} ${new Date(seasonStart).getFullYear()}`,
      seasonStart: seasonStart.toISOString(),
      championshipDate: championshipDate.toISOString(),
    };

    // Preserve peakMileage and startingMileage if editing
    if (editingIdx !== null) {
      if (seasons[editingIdx].peakMileage) newSeason.peakMileage = seasons[editingIdx].peakMileage;
      if (seasons[editingIdx].startingMileage) newSeason.startingMileage = seasons[editingIdx].startingMileage;
    }

    const updated = [...seasons];
    if (editingIdx !== null) {
      updated[editingIdx] = newSeason;
    } else {
      // Check if there's a previous season of the same sport to import from
      const prevSameSport = [...seasons]
        .filter(s => s.sport === sport && s.peakMileage)
        .sort((a, b) => new Date(b.seasonStart) - new Date(a.seasonStart))[0];

      if (prevSameSport) {
        // Offer to import
        const doImport = await new Promise(resolve => {
          Alert.alert(
            'Import from previous season?',
            `Would you like to import the peak mileage plan from ${prevSameSport.name} as a starting point?`,
            [
              { text: 'Start fresh', onPress: () => resolve(false) },
              { text: 'Import', onPress: () => resolve(true) },
            ]
          );
        });
        if (doImport) {
          newSeason.peakMileage = { ...prevSameSport.peakMileage };
          if (prevSameSport.startingMileage) newSeason.startingMileage = { ...prevSameSport.startingMileage };
          // Also copy volume curves for each group
          const prevKey = seasonKey(prevSameSport);
          const newKey = seasonKey(newSeason);
          for (const g of groups) {
            const prevCurve = g.seasonPlans?.[prevKey];
            if (prevCurve) {
              // Regenerate the curve with the new season dates but same peak/starting
              const peak = prevSameSport.peakMileage?.[g.id];
              if (peak) {
                const starting = prevSameSport.startingMileage?.[g.id] || null;
                const curve = generateVolumeCurve(newSeason, peak, starting);
                const plans = { ...(g.seasonPlans || {}), [newKey]: curve };
                try {
                  await updateDoc(doc(db, 'groups', g.id), { seasonPlans: plans });
                } catch (e) { console.warn('Failed to copy curve:', e); }
              }
            }
          }
          await reloadGroups();
        }
      }

      updated.push(newSeason);
    }

    updated.sort((a, b) => new Date(a.seasonStart) - new Date(b.seasonStart));
    setSeasons(updated);

    try {
      await updateDoc(doc(db, 'schools', schoolId), { seasons: updated });
      onSaved && onSaved({ seasons: updated });
    } catch {
      Alert.alert('Error', 'Could not save to server. Check your connection and try again.');
    }
    setShowForm(false);
  };

  const handleDelete = (idx) => {
    Alert.alert('Delete season?', `Remove ${seasons[idx].name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const updated = seasons.filter((_, i) => i !== idx);
        setSeasons(updated);
        if (expandedIdx === idx) setExpandedIdx(null);
        try {
          await updateDoc(doc(db, 'schools', schoolId), { seasons: updated });
          onSaved && onSaved({ seasons: updated });
        } catch { Alert.alert('Error', 'Could not delete. Please try again.'); }
      }},
    ]);
  };

  // ── Peak mileage & volume curve ────────────────────────────────────────────

  const handleStartingChange = async (seasonIdx, groupId, value) => {
    const s = { ...seasons[seasonIdx] };
    const startingMileage = { ...(s.startingMileage || {}) };
    if (value === '' || value == null) {
      delete startingMileage[groupId];
    } else {
      startingMileage[groupId] = parseInt(value);
    }
    s.startingMileage = startingMileage;
    const updated = [...seasons];
    updated[seasonIdx] = s;
    setSeasons(updated);

    try {
      await updateDoc(doc(db, 'schools', schoolId), { seasons: updated });
      onSaved && onSaved({ seasons: updated });
    } catch (e) { console.warn('Failed to save starting mileage:', e); }
  };

  const handlePeakChange = async (seasonIdx, groupId, value) => {
    const s = { ...seasons[seasonIdx] };
    const peakMileage = { ...(s.peakMileage || {}) };
    if (value === '' || value == null) {
      delete peakMileage[groupId];
    } else {
      peakMileage[groupId] = parseInt(value);
    }
    s.peakMileage = peakMileage;
    const updated = [...seasons];
    updated[seasonIdx] = s;
    setSeasons(updated);

    try {
      await updateDoc(doc(db, 'schools', schoolId), { seasons: updated });
      onSaved && onSaved({ seasons: updated });
    } catch (e) { console.warn('Failed to save peak mileage:', e); }
  };

  const handleGenerateCurve = (seasonIdx) => {
    const s = seasons[seasonIdx];
    const key = seasonKey(s);
    const groupsWithPeak = groups.filter(g => (s.peakMileage?.[g.id] || 0) > 0);

    if (groupsWithPeak.length === 0) {
      Alert.alert('Set peak mileage', 'Set a championship week peak for at least one group first.');
      return;
    }
    Alert.alert(
      'Generate Volume Plan?',
      `Auto-fill weekly targets for ${groupsWithPeak.length} group${groupsWithPeak.length > 1 ? 's' : ''} based on peak mileage and training phases.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Generate', onPress: async () => {
          for (const g of groupsWithPeak) {
            const peak = s.peakMileage[g.id];
            const starting = s.startingMileage?.[g.id] || null;
            const curve = generateVolumeCurve(s, peak, starting);
            const plans = { ...(g.seasonPlans || {}), [key]: curve };
            try {
              await updateDoc(doc(db, 'groups', g.id), { seasonPlans: plans });
            } catch (e) { console.warn('Failed to save volume plan:', e); }
          }
          await reloadGroups();
          Alert.alert('Done', `Volume plan generated for ${groupsWithPeak.length} group${groupsWithPeak.length > 1 ? 's' : ''}.`);
        }},
      ]
    );
  };

  const handleVolumeSave = async (groupId, sKey, weekISO, value) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    const plans = { ...(group.seasonPlans || {}) };
    const curve = { ...(plans[sKey] || {}) };
    if (value === '' || value == null) {
      delete curve[weekISO];
    } else {
      curve[weekISO] = parseFloat(value);
    }
    plans[sKey] = curve;
    try {
      await updateDoc(doc(db, 'groups', groupId), { seasonPlans: plans });
      setGroups(prev => prev.map(g => g.id === groupId ? { ...g, seasonPlans: plans } : g));
    } catch (e) { console.warn('Failed to save volume plan:', e); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const [showArchive, setShowArchive] = useState(false);

  const activeSeason = getActiveSeason({ seasons });
  const activePhase = activeSeason ? getPhaseForSeason(activeSeason) : getPhaseForSeason(null);

  // Categorize seasons
  const now = new Date();
  const categorized = seasons.map((s, idx) => {
    const champEnd = new Date(new Date(s.championshipDate).getTime() + 7 * 86400000);
    const isActive = activeSeason && activeSeason.seasonStart === s.seasonStart && activeSeason.sport === s.sport;
    const isFuture = new Date(s.seasonStart) > now && !isActive;
    const isCompleted = now > champEnd;
    return { ...s, idx, isActive, isFuture, isCompleted };
  });

  // Most recent completed season (show on main page)
  const completedSeasons = categorized.filter(s => s.isCompleted).sort((a, b) => new Date(b.championshipDate) - new Date(a.championshipDate));
  const lastSeason = completedSeasons[0] || null;
  const archivedSeasons = completedSeasons.slice(1);

  // Visible on main page: last completed + active + future — chronological order
  const visibleSeasons = categorized.filter(s => s.isActive || s.isFuture || s === lastSeason)
    .sort((a, b) => new Date(a.seasonStart) - new Date(b.seasonStart));

  const renderVolumePlan = (seasonIdx) => {
    const s = seasons[seasonIdx];
    const key = seasonKey(s);
    if (!s.seasonStart || !s.championshipDate) return null;
    if (groups.length === 0) {
      return (
        <View style={styles.volumeSection}>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No groups yet</Text>
            <Text style={styles.emptySubtitle}>Create groups in Manage Groups first.</Text>
          </View>
        </View>
      );
    }

    const start = new Date(s.seasonStart);
    const champ = new Date(s.championshipDate);
    const startDay = start.getDay();
    const firstMonday = new Date(start);
    firstMonday.setDate(start.getDate() - (startDay === 0 ? 6 : startDay - 1));
    firstMonday.setHours(0, 0, 0, 0);

    const weeks = [];
    const mon = new Date(firstMonday);
    while (mon <= champ) {
      weeks.push(new Date(mon));
      mon.setDate(mon.getDate() + 7);
    }

    const now = new Date();
    const currentDay = now.getDay();
    const currentMonday = new Date(now);
    currentMonday.setDate(now.getDate() - (currentDay === 0 ? 6 : currentDay - 1));
    const currentMondayISO = currentMonday.toISOString().split('T')[0];

    const groupsWithPeak = groups.filter(g => (s.peakMileage?.[g.id] || 0) > 0);

    // Find most recent prior season (any sport) for reference
    const priorSeason = seasons
      .filter(ps => ps !== s && ps.peakMileage && new Date(ps.championshipDate) < new Date(s.seasonStart))
      .sort((a, b) => new Date(b.championshipDate) - new Date(a.championshipDate))[0] || null;

    return (
      <View style={styles.volumeSection}>
        {/* Starting + Peak mileage per group */}
        <Text style={styles.eyebrow}>Mileage per group</Text>
        <Text style={styles.volumeHint}>Starting = where the group is now. Peak = championship week target.</Text>
        <View style={styles.groupMileageList}>
          {groups.map(g => {
            const priorPeak = priorSeason?.peakMileage?.[g.id];
            return (
              <View key={g.id} style={styles.groupMileageRow}>
                <View style={styles.groupMileageNameCol}>
                  <Text style={styles.groupMileageName} numberOfLines={1}>{g.name}</Text>
                  {priorPeak ? (
                    <Text style={styles.priorSeasonHint}>
                      Prior peak: <Text style={styles.mono}>{priorPeak}</Text> mi/wk
                    </Text>
                  ) : null}
                </View>
                <View style={styles.groupMileageInputs}>
                  <TextInput
                    style={styles.mileageInput}
                    value={s.startingMileage?.[g.id] != null ? String(s.startingMileage[g.id]) : ''}
                    onChangeText={(text) => {
                      const num = text === '' ? null : parseInt(text);
                      const updated = [...seasons];
                      updated[seasonIdx] = { ...s, startingMileage: { ...(s.startingMileage || {}), [g.id]: num } };
                      setSeasons(updated);
                    }}
                    onBlur={() => handleStartingChange(seasonIdx, g.id, s.startingMileage?.[g.id])}
                    placeholder="Start"
                    placeholderTextColor={SIGNAL.color.mute2}
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                  <Text style={styles.mileageArrow}>→</Text>
                  <TextInput
                    style={styles.mileageInput}
                    value={s.peakMileage?.[g.id] != null ? String(s.peakMileage[g.id]) : ''}
                    onChangeText={(text) => {
                      const num = text === '' ? null : parseInt(text);
                      const updated = [...seasons];
                      updated[seasonIdx] = { ...s, peakMileage: { ...(s.peakMileage || {}), [g.id]: num } };
                      setSeasons(updated);
                    }}
                    onBlur={() => handlePeakChange(seasonIdx, g.id, s.peakMileage?.[g.id])}
                    placeholder="Peak"
                    placeholderTextColor={SIGNAL.color.mute2}
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                  <Text style={styles.mileageUnit}>mi/wk</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Generate button */}
        {groupsWithPeak.length > 0 && (
          <TouchableOpacity style={styles.generateBtn} onPress={() => handleGenerateCurve(seasonIdx)} activeOpacity={0.85}>
            <Ionicons name="sparkles-outline" size={18} color={SIGNAL.color.indigo} />
            <Text style={styles.generateBtnText}>Generate volume plan from peak mileage</Text>
          </TouchableOpacity>
        )}

        {/* Weekly volume table */}
        <Text style={[styles.eyebrow, { marginTop: 14 }]}>Weekly volume targets</Text>
        {weeks.map((weekMon, wi) => {
          const weekISO = weekMon.toISOString().split('T')[0];
          const weekLabel = weekMon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const isCurrent = weekISO === currentMondayISO;
          const isPast = weekMon < currentMonday && !isCurrent;
          return (
            <View
              key={weekISO}
              style={[
                styles.volumeWeek,
                isCurrent && {
                  backgroundColor: `${SIGNAL.color.indigo}0A`,
                  borderColor: SIGNAL.color.indigo,
                },
              ]}
            >
              <View style={styles.volumeWeekHeader}>
                <Text style={[styles.volumeWeekNum, isCurrent && { color: SIGNAL.color.indigo }]}>
                  Wk <Text style={styles.mono}>{wi + 1}</Text>
                </Text>
                <Text style={[styles.volumeWeekDate, isCurrent && { color: SIGNAL.color.indigo }]}>
                  {weekLabel}
                </Text>
                {isCurrent && (
                  <View style={styles.nowChip}>
                    <View style={styles.nowDot} />
                    <Text style={styles.nowChipText}>THIS WEEK</Text>
                  </View>
                )}
              </View>
              <View style={styles.volumeGroupRow}>
                {groups.map(g => {
                  const planVal = g.seasonPlans?.[key]?.[weekISO];
                  const displayVal = planVal != null ? String(planVal) : '';
                  return (
                    <View key={g.id} style={styles.volumeCell}>
                      <Text style={styles.volumeCellLabel} numberOfLines={1}>{g.name}</Text>
                      <TextInput
                        style={[styles.volumeCellInput, isPast && { opacity: 0.5 }]}
                        value={displayVal}
                        onChangeText={(text) => {
                          const num = text === '' ? null : parseFloat(text);
                          setGroups(prev => prev.map(gr => {
                            if (gr.id !== g.id) return gr;
                            const plans = { ...(gr.seasonPlans || {}) };
                            const curve = { ...(plans[key] || {}) };
                            if (num == null || isNaN(num)) delete curve[weekISO]; else curve[weekISO] = num;
                            plans[key] = curve;
                            return { ...gr, seasonPlans: plans };
                          }));
                        }}
                        onBlur={() => handleVolumeSave(g.id, key, weekISO, groups.find(gr => gr.id === g.id)?.seasonPlans?.[key]?.[weekISO])}
                        placeholder="--"
                        placeholderTextColor={SIGNAL.color.mute2}
                        keyboardType="decimal-pad"
                        maxLength={5}
                      />
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={SIGNAL.color.inkSoft} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Season plans</Text>
        {!showForm ? (
          <TouchableOpacity onPress={openAdd} style={styles.headerAddBtn} activeOpacity={0.85}>
            <Text style={styles.headerAddText}>+ Add</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      {/* Active phase badge */}
      {activeSeason && !activePhase.isPreSeason && (
        <View style={[styles.activeBadge, { backgroundColor: `${activePhase.color}14`, borderColor: `${activePhase.color}33` }]}>
          <Text style={[styles.activeBadgeText, { color: activePhase.color }]}>
            {activePhase.icon} {activeSeason.name} · {activePhase.name} · Week <Text style={styles.mono}>{activePhase.weekNum}</Text>
          </Text>
        </View>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {showForm ? (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>{editingIdx !== null ? 'Edit season' : 'Add a season'}</Text>

            <Text style={styles.eyebrow}>Sport</Text>
            <View style={styles.sportGrid}>
              {Object.values(SPORTS).map(s => {
                const selected = sport === s.key;
                return (
                  <TouchableOpacity
                    key={s.key}
                    style={[
                      styles.sportBtn,
                      selected && { backgroundColor: `${s.color}10`, borderColor: s.color, borderWidth: 2 },
                    ]}
                    onPress={() => setSport(s.key)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.sportRow}>
                      <Text style={styles.sportIcon}>{s.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.sportLabel, selected && { color: s.color }]}>{s.label}</Text>
                        <Text style={styles.sportMonths}>{s.months}</Text>
                      </View>
                      {selected && (
                        <View style={[styles.selectedDot, { backgroundColor: s.color }]} />
                      )}
                    </View>
                    <Text style={styles.sportDesc}>{s.description}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.eyebrow}>Season name (optional)</Text>
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder={`e.g. ${SPORTS[sport].label} 2026`}
              placeholderTextColor={SIGNAL.color.mute2}
            />

            <View style={{ height: 12 }} />
            <DatePickerField
              label={sport === 'cross_country' ? 'Season start (June for summer base)' : 'Season start date'}
              value={seasonStart}
              onChange={setSeasonStart}
              primaryColor={SPORTS[sport].color}
              maximumDate={championshipDate || undefined}
            />
            <DatePickerField
              label="Championship / state meet date"
              value={championshipDate}
              onChange={setChampionshipDate}
              primaryColor={SPORTS[sport].color}
              minimumDate={seasonStart || undefined}
            />

            {seasonStart && championshipDate && (
              <View style={[styles.weeksBadge, { borderColor: `${SPORTS[sport].color}55`, backgroundColor: `${SPORTS[sport].color}0A` }]}>
                <Text style={[styles.weeksText, { color: SPORTS[sport].color }]}>
                  <Text style={styles.mono}>{Math.round((championshipDate - seasonStart) / (7 * 86400000))}</Text>
                  {' weeks · '}{SPORTS[sport].events.slice(0, 3).join(', ')}
                </Text>
              </View>
            )}

            <View style={styles.formBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowForm(false)} activeOpacity={0.85}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveSeasonBtn}
                onPress={handleSaveSeason}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={[SIGNAL.color.indigo, SIGNAL.color.violet]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.saveSeasonGradient}
                >
                  <Text style={styles.saveSeasonBtnText}>Save season</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.eyebrowSection}>Your seasons</Text>

            {seasons.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No seasons set up yet</Text>
                <Text style={styles.emptySubtitle}>
                  Start with Cross Country — set June as your start date to include summer base building.
                </Text>
                <TouchableOpacity style={styles.emptyAddBtn} onPress={openAdd} activeOpacity={0.9}>
                  <LinearGradient
                    colors={[SIGNAL.color.indigo, SIGNAL.color.violet]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.emptyAddGradient}
                  >
                    <Text style={styles.emptyAddText}>+ Add first season</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {(showArchive ? archivedSeasons : visibleSeasons).map((cs) => {
                  const idx = cs.idx;
                  const s = seasons[idx];
                  const sportDef = SPORTS[s.sport] || SPORTS.cross_country;
                  const phase = getPhaseForSeason(s);
                  const start = new Date(s.seasonStart);
                  const champ = new Date(s.championshipDate);
                  const isExpanded = expandedIdx === idx;

                  return (
                    <View key={idx} style={styles.seasonGroup}>
                      <TouchableOpacity
                        style={[
                          styles.seasonCard,
                          cs.isActive && { borderColor: sportDef.color, borderWidth: 2 },
                          isExpanded && { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
                        ]}
                        activeOpacity={0.85}
                        onPress={() => setExpandedIdx(isExpanded ? null : idx)}
                      >
                        <View style={[styles.seasonStripe, { backgroundColor: sportDef.color }]} />
                        <View style={styles.seasonBody}>
                          <View style={styles.seasonTop}>
                            <Text style={styles.seasonIcon}>{sportDef.icon}</Text>
                            <View style={styles.seasonInfo}>
                              <Text style={styles.seasonName}>{s.name}</Text>
                              <Text style={styles.seasonDates}>
                                <Text style={styles.mono}>
                                  {start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  {' – '}
                                  {champ.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </Text>
                              </Text>
                            </View>
                            {cs.isActive && (
                              <View style={[styles.activePill, { backgroundColor: `${sportDef.color}18` }]}>
                                <Text style={[styles.activePillText, { color: sportDef.color }]}>ACTIVE</Text>
                              </View>
                            )}
                            {cs === lastSeason && !cs.isActive && (
                              <View style={[styles.activePill, { backgroundColor: `${SIGNAL.color.mute}18` }]}>
                                <Text style={[styles.activePillText, { color: SIGNAL.color.mute }]}>LAST</Text>
                              </View>
                            )}
                            <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={SIGNAL.color.mute} />
                          </View>

                          {cs.isActive && !phase.isPreSeason && (
                            <View style={styles.metaRow}>
                              <View style={[styles.phaseChip, { backgroundColor: `${phase.color}18` }]}>
                                <View style={[styles.phaseDot, { backgroundColor: phase.color }]} />
                                <Text style={[styles.phaseChipText, { color: phase.color }]}>
                                  {phase.name} · Wk <Text style={styles.mono}>{phase.weekNum}</Text>
                                </Text>
                              </View>
                              <Text style={styles.countdownText}>
                                🏆 <Text style={styles.mono}>{phase.daysToChamp}d</Text> to champs
                              </Text>
                            </View>
                          )}

                          <View style={styles.seasonActions}>
                            <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(idx)} activeOpacity={0.85}>
                              <Text style={styles.editBtnText}>Edit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(idx)} activeOpacity={0.85}>
                              <Text style={styles.deleteBtnText}>Delete</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </TouchableOpacity>

                      {/* Expanded: peak mileage + volume curve */}
                      {isExpanded && renderVolumePlan(idx)}
                    </View>
                  );
                })}
              </View>
            )}

            {/* Archive link */}
            {!showArchive && archivedSeasons.length > 0 && (
              <TouchableOpacity style={styles.archiveLink} onPress={() => setShowArchive(true)} activeOpacity={0.7}>
                <Ionicons name="time-outline" size={16} color={SIGNAL.color.indigo} />
                <Text style={styles.archiveLinkText}>
                  View {archivedSeasons.length} past season{archivedSeasons.length > 1 ? 's' : ''}
                </Text>
              </TouchableOpacity>
            )}
            {showArchive && (
              <TouchableOpacity style={styles.archiveLink} onPress={() => setShowArchive(false)} activeOpacity={0.7}>
                <Ionicons name="arrow-back" size={16} color={SIGNAL.color.indigo} />
                <Text style={styles.archiveLinkText}>Back to current seasons</Text>
              </TouchableOpacity>
            )}
          </>
        )}
        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    backgroundColor: SIGNAL.color.white,
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: 14,
    paddingHorizontal: 18,
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
    paddingVertical: 6,
    minWidth: 60,
  },
  backText: {
    color: SIGNAL.color.inkSoft,
    fontSize: 15,
    fontFamily: SIGNAL.font.bodyMedium,
  },
  headerTitle: {
    fontSize: SIGNAL.size.heading,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.indigo,
    letterSpacing: SIGNAL.letter.titleTight,
  },
  headerAddBtn: {
    minWidth: 60,
    alignItems: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: SIGNAL.color.indigo,
  },
  headerAddText: {
    color: SIGNAL.color.white,
    fontSize: 12.5,
    fontFamily: SIGNAL.font.bodySemi,
  },

  // ── Active phase badge ────────────────────────────────────────────────────
  activeBadge: {
    marginHorizontal: 14,
    marginTop: 14,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  activeBadgeText: {
    fontSize: 13,
    fontFamily: SIGNAL.font.bodyBold,
  },

  // ── Scroll ────────────────────────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: { padding: 14, paddingTop: 18 },

  // ── Eyebrows ──────────────────────────────────────────────────────────────
  eyebrow: {
    ...SIGNAL.style.eyebrow,
    marginBottom: 8,
    marginTop: 4,
  },
  eyebrowSection: {
    ...SIGNAL.style.eyebrow,
    marginBottom: 10,
    paddingLeft: 4,
  },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: SIGNAL.font.bodyBold,
    color: SIGNAL.color.ink,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: SIGNAL.font.body,
    color: SIGNAL.color.mute,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyAddBtn: {
    borderRadius: SIGNAL.radius.button,
    overflow: 'hidden',
    marginTop: 4,
  },
  emptyAddGradient: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyAddText: {
    color: SIGNAL.color.white,
    fontSize: 14,
    fontFamily: SIGNAL.font.bodySemi,
  },

  // ── Season cards ──────────────────────────────────────────────────────────
  seasonGroup: {},
  seasonCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    overflow: 'hidden',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  seasonStripe: { width: 5 },
  seasonBody: { flex: 1, padding: 14 },
  seasonTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 6,
  },
  seasonIcon: { fontSize: 24 },
  seasonInfo: { flex: 1 },
  seasonName: {
    fontSize: 14.5,
    fontFamily: SIGNAL.font.bodyBold,
    color: SIGNAL.color.ink,
  },
  seasonDates: {
    fontSize: 11.5,
    color: SIGNAL.color.mute,
    marginTop: 2,
  },
  activePill: {
    borderRadius: SIGNAL.radius.chip,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  activePillText: {
    fontSize: 10,
    fontFamily: SIGNAL.font.bodyBold,
    letterSpacing: 0.6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  phaseChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: SIGNAL.radius.chip,
  },
  phaseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  phaseChipText: {
    fontSize: 11.5,
    fontFamily: SIGNAL.font.bodySemi,
  },
  countdownText: {
    fontSize: 12,
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.bodyMedium,
  },
  seasonActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  editBtn: {
    borderRadius: SIGNAL.radius.control,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: SIGNAL.color.paper2,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  editBtnText: {
    fontSize: 13,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.inkSoft,
  },
  deleteBtn: {
    borderRadius: SIGNAL.radius.control,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: SIGNAL.color.white,
    borderWidth: 1,
    borderColor: `${SIGNAL.color.coral}55`,
  },
  deleteBtnText: {
    fontSize: 13,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.coral,
  },

  // ── Form card ─────────────────────────────────────────────────────────────
  formCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: 16,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  formTitle: {
    fontSize: SIGNAL.size.heading,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.indigo,
    marginBottom: 16,
    letterSpacing: SIGNAL.letter.titleTight,
  },

  sportGrid: { gap: 8, marginBottom: 14 },
  sportBtn: {
    borderRadius: SIGNAL.radius.button,
    padding: 12,
    backgroundColor: SIGNAL.color.paper,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  sportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sportIcon: { fontSize: 22 },
  sportLabel: {
    fontSize: 14,
    fontFamily: SIGNAL.font.bodyBold,
    color: SIGNAL.color.ink,
  },
  sportMonths: {
    fontSize: 11.5,
    color: SIGNAL.color.mute,
    marginTop: 1,
    fontFamily: SIGNAL.font.mono,
  },
  sportDesc: {
    fontSize: 12,
    color: SIGNAL.color.mute,
    marginTop: 6,
    fontFamily: SIGNAL.font.body,
    lineHeight: 17,
  },
  selectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  nameInput: {
    backgroundColor: SIGNAL.color.paper,
    borderRadius: SIGNAL.radius.control,
    padding: 13,
    fontSize: 15,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    color: SIGNAL.color.ink,
    fontFamily: SIGNAL.font.body,
  },

  weeksBadge: {
    borderRadius: SIGNAL.radius.control,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginVertical: 12,
  },
  weeksText: {
    fontSize: 13.5,
    fontFamily: SIGNAL.font.bodySemi,
  },

  formBtns: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: SIGNAL.radius.button,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: SIGNAL.color.white,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  cancelBtnText: {
    fontSize: 15,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.inkSoft,
  },
  saveSeasonBtn: {
    flex: 1,
    borderRadius: SIGNAL.radius.button,
    overflow: 'hidden',
  },
  saveSeasonGradient: {
    paddingVertical: 13,
    alignItems: 'center',
  },
  saveSeasonBtnText: {
    color: SIGNAL.color.white,
    fontSize: 15,
    fontFamily: SIGNAL.font.bodyBold,
  },

  // ── Volume plan (expanded under season card) ──────────────────────────────
  volumeSection: {
    backgroundColor: SIGNAL.color.paper,
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 6,
    borderBottomLeftRadius: SIGNAL.radius.card,
    borderBottomRightRadius: SIGNAL.radius.card,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: SIGNAL.color.line,
    marginTop: -1,
  },
  volumeHint: {
    fontSize: 12,
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.body,
    marginBottom: 12,
    lineHeight: 17,
  },

  groupMileageList: { gap: 8, marginBottom: 12 },
  groupMileageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.control,
    padding: 12,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  groupMileageNameCol: { width: 100 },
  groupMileageName: {
    fontSize: 13,
    fontFamily: SIGNAL.font.bodyBold,
    color: SIGNAL.color.ink,
  },
  priorSeasonHint: {
    fontSize: 10.5,
    color: SIGNAL.color.mute,
    marginTop: 2,
    fontFamily: SIGNAL.font.body,
  },
  groupMileageInputs: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  mileageInput: {
    width: 54,
    fontSize: 15,
    fontFamily: SIGNAL.font.mono,
    color: SIGNAL.color.ink,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    borderRadius: SIGNAL.radius.control,
    paddingVertical: 6,
    backgroundColor: SIGNAL.color.paper2,
  },
  mileageArrow: {
    fontSize: 13,
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.bodyMedium,
  },
  mileageUnit: {
    fontSize: 11,
    color: SIGNAL.color.mute,
    width: 34,
    fontFamily: SIGNAL.font.bodyMedium,
  },

  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: `${SIGNAL.color.indigo}10`,
    borderRadius: SIGNAL.radius.control,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: `${SIGNAL.color.indigo}33`,
  },
  generateBtnText: {
    fontSize: 13,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.indigo,
  },

  // ── Weekly volume rows ────────────────────────────────────────────────────
  volumeWeek: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.control,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  volumeWeekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  volumeWeekNum: {
    fontSize: 13,
    color: SIGNAL.color.inkSoft,
    fontFamily: SIGNAL.font.bodySemi,
  },
  volumeWeekDate: {
    flex: 1,
    fontSize: 12,
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.bodyMedium,
  },
  nowChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: SIGNAL.radius.chip,
    backgroundColor: `${SIGNAL.color.indigo}18`,
  },
  nowDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: SIGNAL.color.indigo,
  },
  nowChipText: {
    fontSize: 9.5,
    fontFamily: SIGNAL.font.bodyBold,
    color: SIGNAL.color.indigo,
    letterSpacing: 0.6,
  },
  volumeGroupRow: {
    flexDirection: 'row',
    gap: 8,
  },
  volumeCell: {
    flex: 1,
    alignItems: 'center',
  },
  volumeCellLabel: {
    fontSize: 10.5,
    color: SIGNAL.color.mute,
    marginBottom: 4,
    fontFamily: SIGNAL.font.bodyMedium,
  },
  volumeCellInput: {
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    borderRadius: SIGNAL.radius.control,
    padding: 7,
    width: '100%',
    textAlign: 'center',
    fontSize: 14,
    fontFamily: SIGNAL.font.mono,
    backgroundColor: SIGNAL.color.paper2,
    color: SIGNAL.color.ink,
  },

  // ── Archive link ──────────────────────────────────────────────────────────
  archiveLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    marginTop: 4,
  },
  archiveLinkText: {
    fontSize: 13,
    color: SIGNAL.color.indigo,
    fontFamily: SIGNAL.font.bodySemi,
  },

  // ── Mono helper ───────────────────────────────────────────────────────────
  mono: {
    fontFamily: SIGNAL.font.mono,
  },
});
