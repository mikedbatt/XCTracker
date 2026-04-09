import { Ionicons } from '@expo/vector-icons';
import {
  collection, doc, getDocs, query, updateDoc, where,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  Alert, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { db } from '../firebaseConfig';
import {
  BRAND, BRAND_DARK, BRAND_LIGHT,
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE,
} from '../constants/design';
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
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No groups yet</Text>
          <Text style={styles.emptySubtitle}>Create groups in Manage Groups first.</Text>
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
        <Text style={styles.volumeLabel}>Mileage per group</Text>
        <Text style={styles.volumeHint}>Starting = where the group is now. Peak = championship week target.</Text>
        <View style={styles.groupMileageList}>
          {groups.map(g => {
            const priorPeak = priorSeason?.peakMileage?.[g.id];
            return (
              <View key={g.id} style={styles.groupMileageRow}>
                <View style={styles.groupMileageNameCol}>
                  <Text style={styles.groupMileageName} numberOfLines={1}>{g.name}</Text>
                  {priorPeak && <Text style={styles.priorSeasonHint}>Prior peak: {priorPeak} mi/wk</Text>}
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
                    placeholderTextColor={NEUTRAL.muted}
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
                    placeholderTextColor={NEUTRAL.muted}
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
          <TouchableOpacity style={styles.generateBtn} onPress={() => handleGenerateCurve(seasonIdx)}>
            <Ionicons name="sparkles-outline" size={18} color={BRAND} />
            <Text style={styles.generateBtnText}>Generate volume plan from peak mileage</Text>
          </TouchableOpacity>
        )}

        {/* Weekly volume table */}
        <Text style={[styles.volumeLabel, { marginTop: SPACE.md }]}>Weekly volume targets</Text>
        {weeks.map((weekMon, wi) => {
          const weekISO = weekMon.toISOString().split('T')[0];
          const weekLabel = weekMon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const isCurrent = weekISO === currentMondayISO;
          const isPast = weekMon < currentMonday && !isCurrent;
          return (
            <View key={weekISO} style={[styles.volumeWeek, isCurrent && { backgroundColor: BRAND + '08', borderColor: BRAND, borderWidth: 1 }]}>
              <Text style={[styles.volumeWeekLabel, isCurrent && { color: BRAND, fontWeight: '700' }]}>
                Wk {wi + 1} · {weekLabel}{isCurrent ? '  ← this week' : ''}
              </Text>
              <View style={styles.volumeGroupRow}>
                {groups.map(g => {
                  const planVal = g.seasonPlans?.[key]?.[weekISO];
                  const displayVal = planVal != null ? String(planVal) : '';
                  return (
                    <View key={g.id} style={styles.volumeCell}>
                      <Text style={styles.volumeCellLabel}>{g.name}</Text>
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
                        placeholderTextColor="#ccc"
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
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={BRAND_DARK} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Manage Seasons</Text>
        <View style={{ width: 60 }} />
      </View>

      {activeSeason && !activePhase.isPreSeason && (
        <View style={[styles.activeBadge, { backgroundColor: `${activePhase.color}18` }]}>
          <Text style={[styles.activeBadgeText, { color: activePhase.color }]}>
            {activePhase.icon} {activeSeason.name} · {activePhase.name} · Week {activePhase.weekNum}
          </Text>
        </View>
      )}

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {showForm ? (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>{editingIdx !== null ? 'Edit season' : 'Add a season'}</Text>

            <Text style={styles.formLabel}>Sport</Text>
            <View style={styles.sportGrid}>
              {Object.values(SPORTS).map(s => (
                <TouchableOpacity
                  key={s.key}
                  style={[styles.sportBtn, sport === s.key && { backgroundColor: s.color, borderColor: s.color }]}
                  onPress={() => setSport(s.key)}
                >
                  <Text style={styles.sportIcon}>{s.icon}</Text>
                  <Text style={[styles.sportLabel, sport === s.key && { color: '#fff' }]}>{s.label}</Text>
                  <Text style={[styles.sportMonths, sport === s.key && { color: 'rgba(255,255,255,0.8)' }]}>{s.months}</Text>
                  <Text style={[styles.sportDesc, sport === s.key && { color: 'rgba(255,255,255,0.7)' }]}>{s.description}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.formLabel}>Season name (optional)</Text>
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder={`e.g. ${SPORTS[sport].label} 2026`}
              placeholderTextColor="#9CA3AF"
            />

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
              <View style={[styles.weeksBadge, { borderColor: SPORTS[sport].color }]}>
                <Text style={[styles.weeksText, { color: SPORTS[sport].color }]}>
                  {Math.round((championshipDate - seasonStart) / (7 * 86400000))} weeks · {SPORTS[sport].events.slice(0, 3).join(', ')}
                </Text>
              </View>
            )}

            <View style={styles.formBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowForm(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveSeasonBtn, { backgroundColor: SPORTS[sport].color }]}
                onPress={handleSaveSeason}
              >
                <Text style={styles.saveSeasonBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Your seasons</Text>
                <TouchableOpacity style={[styles.addSeasonBtn, { backgroundColor: activePhase?.color || BRAND }]} onPress={openAdd}>
                  <Text style={styles.addSeasonBtnText}>+ Add</Text>
                </TouchableOpacity>
              </View>

              {seasons.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>No seasons set up yet</Text>
                  <Text style={styles.emptySubtitle}>Start with Cross Country — set June as your start date to include summer base building.</Text>
                  <TouchableOpacity style={[styles.addSeasonBtn, { backgroundColor: BRAND, paddingHorizontal: 20 }]} onPress={openAdd}>
                    <Text style={styles.addSeasonBtnText}>+ Add first season</Text>
                  </TouchableOpacity>
                </View>
              ) : (showArchive ? archivedSeasons : visibleSeasons).map((cs) => {
                const idx = cs.idx;
                const s = seasons[idx];
                const sportDef = SPORTS[s.sport] || SPORTS.cross_country;
                const phase = getPhaseForSeason(s);
                const start = new Date(s.seasonStart);
                const champ = new Date(s.championshipDate);
                const isExpanded = expandedIdx === idx;

                return (
                  <View key={idx}>
                    <TouchableOpacity
                      style={[styles.seasonCard, cs.isActive && { borderColor: sportDef.color, borderWidth: 2 }]}
                      activeOpacity={0.7}
                      onPress={() => setExpandedIdx(isExpanded ? null : idx)}
                    >
                      <View style={[styles.seasonStripe, { backgroundColor: sportDef.color }]} />
                      <View style={styles.seasonBody}>
                        <View style={styles.seasonTop}>
                          <Text style={styles.seasonIcon}>{sportDef.icon}</Text>
                          <View style={styles.seasonInfo}>
                            <Text style={styles.seasonName}>{s.name}</Text>
                            <Text style={styles.seasonDates}>
                              {start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {champ.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </Text>
                          </View>
                          {cs.isActive && (
                            <View style={[styles.activePill, { backgroundColor: sportDef.color }]}>
                              <Text style={styles.activePillText}>Active</Text>
                            </View>
                          )}
                          {cs === lastSeason && !cs.isActive && (
                            <View style={[styles.activePill, { backgroundColor: NEUTRAL.muted }]}>
                              <Text style={styles.activePillText}>Last</Text>
                            </View>
                          )}
                          <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={NEUTRAL.muted} />
                        </View>
                        {cs.isActive && !phase.isPreSeason && (
                          <Text style={[styles.phaseTag, { color: phase.color }]}>
                            {phase.icon} {phase.name} · Wk {phase.weekNum} · {phase.daysToChamp}d to champs
                          </Text>
                        )}
                        <View style={styles.seasonActions}>
                          <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(idx)}>
                            <Text style={styles.editBtnText}>Edit</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.deleteSeasonBtn} onPress={() => handleDelete(idx)}>
                            <Text style={styles.deleteSeasonBtnText}>Delete</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </TouchableOpacity>

                    {/* Expanded: peak mileage + volume curve */}
                    {isExpanded && renderVolumePlan(idx)}
                  </View>
                );
              })}

              {/* Archive link */}
              {!showArchive && archivedSeasons.length > 0 && (
                <TouchableOpacity style={styles.archiveLink} onPress={() => setShowArchive(true)}>
                  <Ionicons name="time-outline" size={16} color={BRAND} />
                  <Text style={styles.archiveLinkText}>View {archivedSeasons.length} past season{archivedSeasons.length > 1 ? 's' : ''}</Text>
                </TouchableOpacity>
              )}
              {showArchive && (
                <TouchableOpacity style={styles.archiveLink} onPress={() => setShowArchive(false)}>
                  <Ionicons name="arrow-back" size={16} color={BRAND} />
                  <Text style={styles.archiveLinkText}>Back to current seasons</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: NEUTRAL.bg },
  header:            { backgroundColor: '#fff', paddingTop: Platform.OS === 'ios' ? 56 : 32, paddingBottom: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
  backBtn:           { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
  backText:          { color: BRAND_DARK, fontSize: 15, fontWeight: '600' },
  headerTitle:       { fontSize: 20, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  activeBadge:       { marginHorizontal: 16, marginTop: 10, borderRadius: 10, padding: 8, alignItems: 'center' },
  activeBadgeText:   { fontSize: 13, fontWeight: '700' },
  scroll:            { flex: 1 },
  section:           { padding: SPACE.lg },
  sectionHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle:      { fontSize: 18, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },

  // Add season button
  addSeasonBtn:      { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  addSeasonBtnText:  { color: '#fff', fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },

  // Empty
  emptyCard:         { backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: 24, alignItems: 'center', gap: 12 },
  emptyTitle:        { fontSize: 17, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  emptySubtitle:     { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, textAlign: 'center', lineHeight: 20 },

  // Season card
  seasonCard:        { backgroundColor: '#fff', borderRadius: RADIUS.lg, marginBottom: 12, overflow: 'hidden', flexDirection: 'row', borderWidth: 1, borderColor: NEUTRAL.border },
  seasonStripe:      { width: 6 },
  seasonBody:        { flex: 1, padding: 14 },
  seasonTop:         { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  seasonIcon:        { fontSize: 24 },
  seasonInfo:        { flex: 1 },
  seasonName:        { fontSize: 15, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  seasonDates:       { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: 2 },
  activePill:        { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  activePillText:    { color: '#fff', fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold },
  phaseTag:          { fontSize: FONT_SIZE.xs, fontWeight: '600', marginBottom: 8 },
  seasonActions:     { flexDirection: 'row', gap: 8, marginTop: 8 },
  editBtn:           { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 7, backgroundColor: NEUTRAL.bg },
  editBtnText:       { fontSize: 13, fontWeight: '600', color: BRAND_DARK },
  deleteSeasonBtn:   { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 7, backgroundColor: '#fee2e2' },
  deleteSeasonBtnText:{ fontSize: 13, fontWeight: '600', color: '#dc2626' },

  // Form
  formCard:          { margin: 16, backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: 16 },
  formTitle:         { fontSize: 18, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: 16 },
  formLabel:         { fontSize: FONT_SIZE.sm, fontWeight: '600', color: NEUTRAL.body, marginBottom: 8, marginTop: 4 },
  sportGrid:         { gap: 8, marginBottom: 16 },
  sportBtn:          { borderRadius: RADIUS.lg, padding: 14, backgroundColor: NEUTRAL.bg, borderWidth: 1.5, borderColor: NEUTRAL.border },
  sportIcon:         { fontSize: 22, marginBottom: 4 },
  sportLabel:        { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  sportMonths:       { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: 1 },
  sportDesc:         { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: 1 },
  nameInput:         { backgroundColor: NEUTRAL.bg, borderRadius: RADIUS.md, padding: 14, fontSize: 15, marginBottom: 4, borderWidth: 1, borderColor: NEUTRAL.border, color: BRAND_DARK },
  weeksBadge:        { borderRadius: RADIUS.md, borderWidth: 1.5, padding: 10, alignItems: 'center', marginVertical: 12 },
  weeksText:         { fontSize: FONT_SIZE.sm, fontWeight: '600' },
  formBtns:          { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn:         { flex: 1, borderRadius: RADIUS.md, padding: 14, alignItems: 'center', backgroundColor: '#fee2e2' },
  cancelBtnText:     { fontSize: 15, fontWeight: '600', color: '#dc2626' },
  saveSeasonBtn:     { flex: 1, borderRadius: RADIUS.md, padding: 14, alignItems: 'center' },
  saveSeasonBtnText: { color: '#fff', fontSize: 15, fontWeight: FONT_WEIGHT.bold },

  // Volume plan section (expanded under a season card)
  volumeSection:     { backgroundColor: NEUTRAL.bg, paddingHorizontal: SPACE.lg, paddingBottom: SPACE.lg, marginBottom: 12, borderBottomLeftRadius: RADIUS.lg, borderBottomRightRadius: RADIUS.lg },
  volumeLabel:       { fontSize: 15, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: 4, marginTop: SPACE.md },
  volumeHint:        { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginBottom: SPACE.md },
  archiveLink:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.xs, paddingVertical: SPACE.md },
  archiveLinkText:   { fontSize: FONT_SIZE.sm, color: BRAND, fontWeight: FONT_WEIGHT.semibold },
  groupMileageList:  { gap: SPACE.sm, marginBottom: SPACE.md },
  groupMileageRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: RADIUS.md, padding: SPACE.md, ...SHADOW.sm },
  groupMileageNameCol: { width: 90 },
  groupMileageName:  { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  priorSeasonHint:   { fontSize: 10, color: NEUTRAL.body, marginTop: 2, fontStyle: 'italic' },
  groupMileageInputs:{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: SPACE.sm },
  mileageInput:      { width: 52, fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, textAlign: 'center', borderWidth: 1, borderColor: NEUTRAL.border, borderRadius: RADIUS.sm, paddingVertical: SPACE.xs, backgroundColor: NEUTRAL.bg },
  mileageArrow:      { fontSize: FONT_SIZE.sm, color: NEUTRAL.muted },
  mileageUnit:       { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, width: 32 },
  generateBtn:       { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BRAND + '15', borderRadius: RADIUS.md, padding: 12, marginBottom: SPACE.sm },
  generateBtnText:   { fontSize: FONT_SIZE.sm, fontWeight: '600', color: BRAND },

  // Volume week rows
  volumeWeek:        { backgroundColor: '#fff', borderRadius: RADIUS.md, padding: 12, marginBottom: 8 },
  volumeWeekLabel:   { fontSize: 13, fontWeight: '600', color: NEUTRAL.muted, marginBottom: 8 },
  volumeGroupRow:    { flexDirection: 'row', gap: 10 },
  volumeCell:        { flex: 1, alignItems: 'center' },
  volumeCellLabel:   { fontSize: 11, color: NEUTRAL.muted, marginBottom: 4 },
  volumeCellInput:   { borderWidth: 1, borderColor: NEUTRAL.border, borderRadius: 8, padding: 6, width: '100%', textAlign: 'center', fontSize: 15, fontWeight: '600', backgroundColor: '#f9f9f9', color: BRAND_DARK },
});
