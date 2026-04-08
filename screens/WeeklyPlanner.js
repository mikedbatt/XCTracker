import { Ionicons } from '@expo/vector-icons';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs,
  query, serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';
import {
  BRAND, BRAND_ACCENT, BRAND_DARK, BRAND_LIGHT,
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE, STATUS,
} from '../constants/design';
import { CATEGORIES, TYPE_COLORS, WORKOUT_INTENSITY } from '../constants/training';
import { generateVolumeCurve, getPhaseForSeason } from './SeasonPlanner';
import WorkoutLibrary from './WorkoutLibrary';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WORKOUT_TYPES = CATEGORIES?.Training?.types || ['Easy', 'Tempo', 'Long Run', 'Intervals', 'Speed', 'Cross Train', 'Weights', 'Recovery', 'Time Trial'];

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  date.setHours(0, 0, 0, 0);
  return date;
}

function getWeekSuggestions(phase, daySlots, groupTotals, weekTargets) {
  if (!phase) return [];
  const suggestions = [];
  const filled = daySlots.map((d, i) => ({ ...d, dayIdx: i })).filter(d => d.type);
  const hardTypes = ['Tempo', 'Intervals', 'Speed', 'Time Trial'];
  const qualityCount = filled.filter(d => hardTypes.includes(d.type)).length;
  const hasLongRun = filled.some(d => d.type === 'Long Run');
  const restDays = 7 - filled.length;
  const hasRace = daySlots.some(d => d.type === 'Race');

  // Hard day spacing check
  const hardDays = filled.filter(d => WORKOUT_INTENSITY[d.type] === 'hard');
  if (hardDays.length >= 2) {
    for (let h = 0; h < hardDays.length - 1; h++) {
      const gap = hardDays[h + 1].dayIdx - hardDays[h].dayIdx;
      if (gap === 1) {
        suggestions.push({ type: 'warning', text: `Back-to-back hard days (${DAYS[hardDays[h].dayIdx].slice(0, 3)} & ${DAYS[hardDays[h + 1].dayIdx].slice(0, 3)}) — consider an easy day between` });
        break;
      }
    }
  }

  // Rest day check
  if (filled.length > 0 && restDays < 1) {
    suggestions.push({ type: 'warning', text: 'No rest day this week — consider adding one' });
  }

  // Race week detection
  if (hasRace) {
    suggestions.push({ type: 'info', text: 'Race week — consider reducing volume 15-20% and limiting hard sessions' });
  }

  // Volume vs target check
  if (groupTotals && weekTargets) {
    const overGroups = Object.entries(groupTotals).filter(([, gt]) => gt.pct > 110);
    if (overGroups.length > 0) {
      suggestions.push({ type: 'warning', text: `Planned volume exceeds target by 10%+ for ${overGroups.length} group${overGroups.length > 1 ? 's' : ''} — consider trimming` });
    }
  }

  // Long run check
  if (!hasLongRun && filled.length >= 3 && !hasRace) {
    suggestions.push({ type: 'info', text: 'No long run — consider adding one on the weekend (20-25% of weekly miles)' });
  }

  // Long run placement (mid-week)
  const longRunDay = daySlots.findIndex(d => d.type === 'Long Run');
  if (longRunDay >= 0 && longRunDay <= 3) {
    suggestions.push({ type: 'info', text: 'Long run scheduled mid-week — weekends give athletes more time to recover' });
  }

  // Phase-specific
  switch (phase.name) {
    case 'Summer Base':
    case 'Pre-Season Base':
    case 'Base':
      if (qualityCount > 0) suggestions.push({ type: 'info', text: 'Base phase — consider all easy runs to build aerobic foundation' });
      break;
    case 'Build':
      if (qualityCount === 0 && filled.length > 0) suggestions.push({ type: 'info', text: 'Build phase — add 1-2 quality sessions (tempo or intervals)' });
      if (qualityCount > 2) suggestions.push({ type: 'warning', text: '1-2 quality sessions is enough — keep easy days easy' });
      break;
    case 'Competition':
      if (qualityCount > 2) suggestions.push({ type: 'warning', text: 'Competition phase — quality over quantity, 1-2 hard sessions max' });
      break;
    case 'Peak':
      if (qualityCount > 1) suggestions.push({ type: 'warning', text: 'Peak week — only 1 short, sharp quality session' });
      if (filled.length > 5) suggestions.push({ type: 'info', text: 'Consider fewer running days this week' });
      break;
    case 'Taper':
      if (qualityCount > 0) suggestions.push({ type: 'warning', text: 'Taper week — easy runs + strides only, no hard workouts' });
      if (filled.length > 4) suggestions.push({ type: 'info', text: 'Championship week — 3-4 easy runs maximum' });
      break;
  }

  return suggestions.slice(0, 3);
}

// ── Week templates with mileage distribution ──────────────────────────────────
// Each day has type + pctOfWeek (% of weekly target for base miles)
const WEEK_TEMPLATES = {
  base: {
    label: 'Base Week',
    desc: '6 easy days + long run, build aerobic foundation',
    phases: ['Summer Base', 'Pre-Season Base', 'Base'],
    days: [
      { type: 'Easy', pct: 0.15 },
      { type: 'Easy', pct: 0.15 },
      null, // Off
      { type: 'Easy', pct: 0.15 },
      { type: 'Easy', pct: 0.15 },
      { type: 'Long Run', pct: 0.25 },
      { type: 'Easy', pct: 0.15 },
    ],
  },
  build: {
    label: 'Build Week',
    desc: '2 quality sessions + long run, easy between',
    phases: ['Build'],
    days: [
      { type: 'Easy', pct: 0.15 },
      { type: 'Tempo', pct: 0.15 },
      { type: 'Easy', pct: 0.12 },
      { type: 'Intervals', pct: 0.12 },
      { type: 'Easy', pct: 0.12 },
      { type: 'Long Run', pct: 0.22 },
      null,
    ],
  },
  competition: {
    label: 'Competition Week',
    desc: '1 quality session + long run, race recovery focus',
    phases: ['Competition'],
    days: [
      { type: 'Easy', pct: 0.15 },
      { type: 'Tempo', pct: 0.15 },
      { type: 'Easy', pct: 0.12 },
      null,
      { type: 'Easy', pct: 0.10 },
      { type: 'Long Run', pct: 0.20 },
      null,
    ],
  },
  race: {
    label: 'Race Week',
    desc: 'Reduced volume, short quality, race day ready',
    phases: ['Competition', 'Peak'],
    days: [
      { type: 'Easy', pct: 0.12 },
      { type: 'Tempo', pct: 0.10 },
      { type: 'Easy', pct: 0.10 },
      null,
      { type: 'Easy', pct: 0.08 },
      { type: 'Race', pct: 0 },
      null,
    ],
  },
  recovery: {
    label: 'Recovery Week',
    desc: 'Low volume, all easy, active recovery',
    phases: ['Taper'],
    days: [
      null,
      { type: 'Easy', pct: 0.15 },
      { type: 'Cross Train', pct: 0 },
      { type: 'Easy', pct: 0.15 },
      null,
      { type: 'Easy', pct: 0.20 },
      null,
    ],
  },
};

function generateWeekPlan(templateKey, weekTargets, groups) {
  const template = WEEK_TEMPLATES[templateKey];
  if (!template) return null;
  const targets = groups.map(g => parseFloat(weekTargets[g.id]) || 0);
  const maxTarget = Math.max(...targets, 1);
  return template.days.map((day, i) => {
    if (!day) return EMPTY_SLOT();
    const baseMiles = day.pct > 0 ? String(Math.round(maxTarget * day.pct)) : '';
    return {
      type: day.type,
      baseMiles,
      title: `${DAYS[i]} ${day.type}`,
      description: '',
      time: '',
      location: '',
      groupMilesOverrides: {},
    };
  });
}

const EMPTY_SLOT = () => ({ type: null, baseMiles: '', title: '', description: '', time: '', location: '', groupMilesOverrides: {} });

export default function WeeklyPlanner({ schoolId, userData, school, groups, activeSeason, onClose }) {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [daySlots, setDaySlots] = useState(Array(7).fill(null).map(EMPTY_SLOT));
  const [weekTargets, setWeekTargets] = useState({});
  const [saving, setSaving] = useState(false);
  const [existingEvents, setExistingEvents] = useState([]);
  const [editingDay, setEditingDay] = useState(null);
  const [libraryVisible, setLibraryVisible] = useState(false);
  const [libraryDayIdx, setLibraryDayIdx] = useState(null);
  const [weekStatus, setWeekStatus] = useState('empty'); // 'empty' | 'draft' | 'published'
  const [draftDirty, setDraftDirty] = useState(false);

  const mondayISO = weekStart.toISOString().split('T')[0];
  const phase = activeSeason ? getPhaseForSeason(activeSeason) : null;
  const draftDocId = `${schoolId}_${mondayISO}`;

  // Build season key for looking up volume plans
  const sKey = activeSeason
    ? `${activeSeason.sport || 'cross_country'}_${new Date(activeSeason.seasonStart).toISOString().split('T')[0]}`
    : null;

  // ── Save draft to Firestore ──────────────────────────────────────────────
  const saveDraft = async (slots) => {
    const filledSlots = slots || daySlots;
    const hasContent = filledSlots.some(s => s.type);
    if (!hasContent) return;
    try {
      await setDoc(doc(db, 'weeklyDrafts', draftDocId), {
        schoolId,
        mondayISO,
        daySlots: filledSlots,
        updatedBy: auth.currentUser.uid,
        updatedAt: serverTimestamp(),
      });
      setDraftDirty(false);
    } catch (e) { console.warn('Failed to save draft:', e); }
  };

  // ── Load week data (draft + published events) ───────────────────────────
  useEffect(() => {
    const targets = {};
    groups.forEach(g => {
      const planned = (sKey && g.seasonPlans?.[sKey]?.[mondayISO]) || g.weeklyPlan?.[mondayISO];
      targets[g.id] = planned || g.weeklyMilesTarget || '';
    });
    setWeekTargets(targets);
    setEditingDay(null);
    loadWeekData();
  }, [mondayISO]);

  const loadWeekData = async () => {
    try {
      // Load published events and draft in parallel
      const [eventsSnap, draftSnap] = await Promise.all([
        getDocs(query(
          collection(db, 'events'),
          where('schoolId', '==', schoolId),
          where('weeklyPlannerSource', '==', mondayISO)
        )),
        getDoc(doc(db, 'weeklyDrafts', draftDocId)),
      ]);

      const events = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setExistingEvents(events);

      const draft = draftSnap.exists() ? draftSnap.data() : null;

      if (draft?.daySlots) {
        // Draft exists — use it (it's the latest version of the coach's plan)
        setDaySlots(draft.daySlots);
        setWeekStatus(events.length > 0 ? 'published' : 'draft');
      } else if (events.length > 0) {
        // No draft but published events exist — rebuild slots from events
        const newSlots = Array(7).fill(null).map(EMPTY_SLOT);
        events.forEach(ev => {
          const evDate = ev.date?.toDate?.();
          if (!evDate) return;
          const dayIdx = (evDate.getDay() + 6) % 7;
          newSlots[dayIdx] = {
            type: ev.type || 'Easy',
            baseMiles: ev.baseMiles != null ? String(ev.baseMiles) : '',
            title: ev.title || '',
            description: ev.description || '',
            time: ev.time || '',
            location: ev.location || '',
            groupMilesOverrides: {},
          };
        });
        setDaySlots(newSlots);
        setWeekStatus('published');
      } else {
        setDaySlots(Array(7).fill(null).map(EMPTY_SLOT));
        setWeekStatus('empty');
      }
      setDraftDirty(false);
    } catch (e) {
      console.warn('Failed to load week data:', e);
      setDaySlots(Array(7).fill(null).map(EMPTY_SLOT));
      setWeekStatus('empty');
      setDraftDirty(false);
    }
  };

  // ── Auto-save draft when navigating away ─────────────────────────────────
  const navigateWeek = async (dir) => {
    if (draftDirty) await saveDraft();
    const newStart = new Date(weekStart);
    newStart.setDate(newStart.getDate() + dir * 7);
    setWeekStart(newStart);
  };

  const updateSlot = (dayIdx, field, value) => {
    setDaySlots(prev => {
      const updated = [...prev];
      updated[dayIdx] = { ...updated[dayIdx], [field]: value };
      if (field === 'type' && value) {
        updated[dayIdx].title = `${DAYS[dayIdx]} ${value}`;
      }
      return updated;
    });
    setDraftDirty(true);
    if (weekStatus === 'empty') setWeekStatus('draft');
  };

  const clearSlot = (dayIdx) => {
    setDaySlots(prev => {
      const updated = [...prev];
      updated[dayIdx] = EMPTY_SLOT();
      return updated;
    });
    setDraftDirty(true);
  };

  // Auto-calculate group miles proportionally, with manual override support
  const calcGroupMiles = (baseMiles, overrides = {}) => {
    const base = parseFloat(baseMiles);
    if (!base || groups.length === 0) return {};
    const targets = groups.map(g => parseFloat(weekTargets[g.id]) || 0);
    const maxTarget = Math.max(...targets, 1);
    const result = {};
    groups.forEach((g, i) => {
      // Use override if set, otherwise auto-calculate
      if (overrides[g.id] !== undefined && overrides[g.id] !== '') {
        result[g.id] = parseFloat(overrides[g.id]) || 0;
      } else {
        const t = targets[i];
        result[g.id] = t > 0 ? Math.round(base * (t / maxTarget)) : Math.round(base);
      }
    });
    return result;
  };

  // Running totals — sum each group's actual miles across all day slots
  const totalBase = daySlots.reduce((s, d) => s + (parseFloat(d.baseMiles) || 0), 0);
  const groupTotals = {};
  groups.forEach(g => {
    const target = parseFloat(weekTargets[g.id]) || 0;
    const planned = daySlots.reduce((s, d) => {
      const gm = calcGroupMiles(d.baseMiles, d.groupMilesOverrides || {});
      return s + (gm[g.id] || 0);
    }, 0);
    groupTotals[g.id] = {
      planned,
      target,
      pct: target > 0 ? Math.round((planned / target) * 100) : 0,
    };
  });

  const handlePushToCalendar = async () => {
    const filledSlots = daySlots.map((slot, i) => ({ ...slot, dayIdx: i })).filter(s => s.type);
    if (filledSlots.length === 0) {
      Alert.alert('No workouts', 'Add at least one workout to push to the calendar.');
      return;
    }

    Alert.alert('Push to Calendar?', `${filledSlots.length} workout${filledSlots.length > 1 ? 's' : ''} for the week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Push', onPress: async () => {
        setSaving(true);
        try {
          // Delete existing planner events for this week
          for (const ev of existingEvents) {
            await deleteDoc(doc(db, 'events', ev.id));
          }

          // Create new events
          for (const slot of filledSlots) {
            const eventDate = new Date(weekStart);
            eventDate.setDate(eventDate.getDate() + slot.dayIdx);

            const groupMiles = calcGroupMiles(slot.baseMiles, slot.groupMilesOverrides || {});

            await addDoc(collection(db, 'events'), {
              schoolId,
              category: 'Training',
              type: slot.type,
              title: slot.title || `${DAYS[slot.dayIdx]} ${slot.type}`,
              date: eventDate,
              baseMiles: parseInt(slot.baseMiles) || null,
              groupMiles,
              description: slot.description || null,
              notes: null,
              isMultiDay: false,
              endDate: null,
              time: slot.time || null,
              location: slot.location || null,
              weeklyPlannerSource: mondayISO,
              postedBy: auth.currentUser.uid,
              postedByName: `Coach ${userData.lastName}`,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }

          // Save draft as published
          await setDoc(doc(db, 'weeklyDrafts', draftDocId), {
            schoolId,
            mondayISO,
            daySlots,
            status: 'published',
            pushedAt: serverTimestamp(),
            updatedBy: auth.currentUser.uid,
            updatedAt: serverTimestamp(),
          });
          setWeekStatus('published');
          setDraftDirty(false);
          Alert.alert('Done', `${filledSlots.length} workout${filledSlots.length > 1 ? 's' : ''} pushed to calendar.`);
          loadWeekData();
        } catch (e) {
          console.error('Push to calendar failed:', e);
          Alert.alert('Error', 'Could not push to calendar. Please try again.');
        }
        setSaving(false);
      }},
    ]);
  };

  const weekLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(weekStart.getTime() + 6 * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  const suggestions = getWeekSuggestions(phase, daySlots, groupTotals, weekTargets);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={BRAND_DARK} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Weekly Plans</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

        {/* Week navigation */}
        <View style={styles.weekNav}>
          <TouchableOpacity onPress={() => navigateWeek(-1)} style={styles.weekNavBtn}>
            <Ionicons name="chevron-back" size={20} color={BRAND} />
          </TouchableOpacity>
          <View style={styles.weekNavCenter}>
            <View style={styles.weekNavRow}>
              <Text style={styles.weekNavLabel}>{weekLabel}</Text>
              {weekStatus === 'draft' && (
                <View style={styles.statusBadgeDraft}><Text style={styles.statusBadgeText}>Draft</Text></View>
              )}
              {weekStatus === 'published' && (
                <View style={styles.statusBadgePublished}><Text style={styles.statusBadgePublishedText}>Published</Text></View>
              )}
            </View>
            {phase && <Text style={styles.weekNavPhase}>{phase.name} — Week {phase.weekNum}</Text>}
          </View>
          <TouchableOpacity onPress={() => navigateWeek(1)} style={styles.weekNavBtn}>
            <Ionicons name="chevron-forward" size={20} color={BRAND} />
          </TouchableOpacity>
        </View>

        {/* Generate week button (shown when empty) */}
        {weekStatus === 'empty' && daySlots.every(s => !s.type) && (
          <View style={styles.generateSection}>
            <Text style={styles.generateHint}>Start by generating a week plan based on your season phase.</Text>
            <View style={styles.templateGrid}>
              {Object.entries(WEEK_TEMPLATES)
                .sort(([, a], [, b]) => {
                  const aMatch = phase && a.phases.includes(phase.name) ? 0 : 1;
                  const bMatch = phase && b.phases.includes(phase.name) ? 0 : 1;
                  return aMatch - bMatch;
                })
                .map(([key, tmpl]) => {
                  const isRecommended = phase && tmpl.phases.includes(phase.name);
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.templateCard, isRecommended && { borderColor: BRAND, borderWidth: 1.5 }]}
                      onPress={() => {
                        const plan = generateWeekPlan(key, weekTargets, groups);
                        if (plan) { setDaySlots(plan); setDraftDirty(true); setWeekStatus('draft'); }
                      }}
                    >
                      {isRecommended && <Text style={styles.templateRecommended}>Recommended</Text>}
                      <Text style={styles.templateName}>{tmpl.label}</Text>
                      <Text style={styles.templateDesc}>{tmpl.desc}</Text>
                    </TouchableOpacity>
                  );
                })}
            </View>
          </View>
        )}

        {/* Intensity distribution bar */}
        {(() => {
          const filled = daySlots.filter(s => s.type);
          if (filled.length === 0) return null;
          const easyCount = filled.filter(s => WORKOUT_INTENSITY[s.type] === 'easy').length;
          const hardCount = filled.filter(s => WORKOUT_INTENSITY[s.type] === 'hard').length;
          const offCount = 7 - filled.length;
          const total = easyCount + hardCount;
          const easyPct = total > 0 ? Math.round((easyCount / total) * 100) : 0;
          const balanced = total > 0 && easyPct >= 75;
          return (
            <View style={styles.intensityBar}>
              <View style={styles.intensityBarTrack}>
                {easyCount > 0 && <View style={[styles.intensitySegment, { flex: easyCount, backgroundColor: STATUS.success }]} />}
                {hardCount > 0 && <View style={[styles.intensitySegment, { flex: hardCount, backgroundColor: STATUS.error }]} />}
                {offCount > 0 && <View style={[styles.intensitySegment, { flex: offCount, backgroundColor: NEUTRAL.border }]} />}
              </View>
              <View style={styles.intensityLabels}>
                <Text style={styles.intensityLabel}>Easy {easyCount} · Hard {hardCount} · Off {offCount}</Text>
                {total > 0 && (
                  <Text style={[styles.intensityBadge, { color: balanced ? STATUS.success : STATUS.warning }]}>
                    {balanced ? '✓' : '⚠'} {easyPct}% easy
                  </Text>
                )}
              </View>
            </View>
          );
        })()}

        {/* Day slots */}
        {DAYS.map((day, i) => {
          const slot = daySlots[i];
          const dateObj = new Date(weekStart.getTime() + i * 86400000);
          const dateLabel = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const isEditing = editingDay === i;

          return (
            <View key={i} style={styles.dayCard}>
              <View style={styles.dayHeader}>
                <View>
                  <Text style={styles.dayName}>{day}</Text>
                  <Text style={styles.dayDate}>{dateLabel}</Text>
                </View>
                {slot.type ? (
                  <View style={styles.dayActions}>
                    <TouchableOpacity onPress={() => setEditingDay(isEditing ? null : i)}>
                      <Ionicons name={isEditing ? 'chevron-up' : 'create-outline'} size={20} color={BRAND} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => clearSlot(i)}>
                      <Ionicons name="close-circle-outline" size={20} color={NEUTRAL.muted} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.dayActions}>
                    <TouchableOpacity style={styles.addBtn} onPress={() => { updateSlot(i, 'type', 'Easy'); setEditingDay(i); }}>
                      <Ionicons name="add" size={18} color={BRAND} />
                      <Text style={styles.addBtnText}>Add</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.libraryBtn} onPress={() => { setLibraryDayIdx(i); setLibraryVisible(true); }}>
                      <Ionicons name="book-outline" size={16} color={BRAND} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {slot.type && !isEditing && (
                <View style={styles.daySummary}>
                  <View style={styles.daySummaryTop}>
                    <View style={[styles.typeBadge, { backgroundColor: TYPE_COLORS?.[slot.type] || BRAND }]}>
                      <Text style={styles.typeBadgeText}>{slot.type}</Text>
                    </View>
                    <Text style={styles.dayMiles}>{slot.baseMiles || '—'} mi</Text>
                  </View>
                  {(slot.time || slot.location) && (
                    <Text style={styles.dayMeta}>
                      {slot.time ? `${slot.time}` : ''}{slot.time && slot.location ? '  ·  ' : ''}{slot.location || ''}
                    </Text>
                  )}
                  {slot.description ? <Text style={styles.dayDesc} numberOfLines={2}>{slot.description}</Text> : null}
                </View>
              )}

              {isEditing && (
                <View style={styles.dayEdit}>
                  <Text style={styles.editLabel}>Workout type</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeRow}>
                    {WORKOUT_TYPES.map(t => (
                      <TouchableOpacity key={t} style={[styles.typeChip, slot.type === t && { backgroundColor: TYPE_COLORS?.[t] || BRAND, borderColor: TYPE_COLORS?.[t] || BRAND }]} onPress={() => updateSlot(i, 'type', t)}>
                        <Text style={[styles.typeChipText, slot.type === t && { color: '#fff' }]}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <Text style={styles.editLabel}>Title</Text>
                  <TextInput
                    style={styles.textInput}
                    value={slot.title}
                    onChangeText={(text) => updateSlot(i, 'title', text)}
                    placeholder={`${DAYS[i]} ${slot.type || 'Easy'}`}
                    placeholderTextColor={NEUTRAL.muted}
                  />
                  <Text style={styles.editLabel}>Base miles</Text>
                  <TextInput
                    style={styles.milesInput}
                    value={slot.baseMiles}
                    onChangeText={(text) => updateSlot(i, 'baseMiles', text)}
                    placeholder="e.g. 6"
                    placeholderTextColor={NEUTRAL.muted}
                    keyboardType="decimal-pad"
                    maxLength={4}
                  />
                  {groups.length > 0 && slot.baseMiles && (
                    <View style={styles.autoGroupMiles}>
                      {groups.map(g => {
                        const autoVal = calcGroupMiles(slot.baseMiles)[g.id] || 0;
                        const override = slot.groupMilesOverrides?.[g.id];
                        const displayVal = override !== undefined && override !== '' ? override : String(autoVal);
                        const isOverridden = override !== undefined && override !== '';
                        return (
                          <View key={g.id} style={styles.autoGroupRow}>
                            <Text style={styles.autoGroupName}>{g.name}:</Text>
                            <TextInput
                              style={[styles.groupMilesInput, isOverridden && { borderColor: BRAND, color: BRAND }]}
                              value={String(displayVal)}
                              onChangeText={(text) => {
                                const val = text === '' || text === String(autoVal) ? undefined : text;
                                updateSlot(i, 'groupMilesOverrides', { ...(slot.groupMilesOverrides || {}), [g.id]: val });
                              }}
                              keyboardType="decimal-pad"
                              maxLength={4}
                            />
                            <Text style={styles.autoGroupUnit}>mi</Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                  <Text style={styles.editLabel}>Time</Text>
                  <TextInput
                    style={styles.textInput}
                    value={slot.time}
                    onChangeText={(text) => updateSlot(i, 'time', text)}
                    placeholder="e.g. 3:30 PM"
                    placeholderTextColor={NEUTRAL.muted}
                  />
                  <Text style={styles.editLabel}>Location</Text>
                  <TextInput
                    style={styles.textInput}
                    value={slot.location}
                    onChangeText={(text) => updateSlot(i, 'location', text)}
                    placeholder="e.g. Stadium parking lot"
                    placeholderTextColor={NEUTRAL.muted}
                  />
                  <Text style={styles.editLabel}>Instructions / details</Text>
                  <TextInput
                    style={[styles.textInput, { minHeight: 60, textAlignVertical: 'top' }]}
                    value={slot.description}
                    onChangeText={(text) => updateSlot(i, 'description', text)}
                    placeholder="Warm-up, workout details, cool-down..."
                    placeholderTextColor={NEUTRAL.muted}
                    multiline
                  />
                  <View style={styles.editActions}>
                    <TouchableOpacity style={styles.browseLibraryBtn} onPress={() => { setLibraryDayIdx(i); setLibraryVisible(true); }}>
                      <Ionicons name="book-outline" size={16} color={BRAND} />
                      <Text style={styles.browseLibraryText}>Browse Library</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setEditingDay(null); if (draftDirty) saveDraft(); }} style={styles.doneEditBtn}>
                      <Text style={styles.doneEditText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {!slot.type && !isEditing && (
                <Text style={styles.restLabel}>Rest day</Text>
              )}
            </View>
          );
        })}

        {/* Phase suggestions */}
        {suggestions.length > 0 && (
          <View style={styles.suggestionsCard}>
            <View style={styles.suggestionsHeader}>
              <Ionicons name="bulb-outline" size={18} color={BRAND} />
              <Text style={styles.suggestionsTitle}>Coaching tips</Text>
            </View>
            {suggestions.map((s, i) => (
              <Text key={i} style={[styles.suggestionText, s.type === 'warning' && { color: STATUS.warning }]}>
                {s.type === 'warning' ? '⚠ ' : s.type === 'success' ? '✓ ' : '💡 '}{s.text}
              </Text>
            ))}
          </View>
        )}

      </ScrollView>

      {/* Running totals + push button (sticky bottom) */}
      <View style={styles.bottomBar}>
        {groups.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.totalsRow} contentContainerStyle={{ gap: SPACE.sm }}>
            {groups.map(g => {
              const gt = groupTotals[g.id] || { planned: 0, target: 0, pct: 0 };
              const statusColor = gt.pct > 110 ? STATUS.error : gt.pct >= 90 ? STATUS.success : gt.pct >= 80 ? STATUS.warning : STATUS.error;
              const statusIcon = gt.pct > 110 ? 'alert-circle' : gt.pct >= 90 ? 'checkmark-circle' : 'alert-circle';
              return (
                <View key={g.id} style={styles.totalChip}>
                  <Text style={styles.totalChipName}>{g.name}</Text>
                  <Text style={[styles.totalChipVal, { color: statusColor }]}>{gt.planned}/{gt.target}</Text>
                  <Ionicons name={statusIcon} size={14} color={statusColor} />
                </View>
              );
            })}
          </ScrollView>
        ) : (
          <Text style={styles.totalVal}>Total: {totalBase} mi</Text>
        )}
        <View style={styles.bottomActions}>
          {draftDirty && (
            <TouchableOpacity style={styles.saveDraftBtn} onPress={() => saveDraft()} disabled={saving}>
              <Ionicons name="save-outline" size={18} color={BRAND} />
              <Text style={styles.saveDraftText}>Save Draft</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.pushBtn, saving && { opacity: 0.6 }]} onPress={handlePushToCalendar} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : (
              <>
                <Ionicons name="arrow-forward-circle" size={20} color="#fff" />
                <Text style={styles.pushBtnText}>{weekStatus === 'published' ? 'Update Calendar' : 'Push to Calendar'}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Workout Library modal */}
      <Modal visible={libraryVisible} animationType="slide" presentationStyle="pageSheet">
        <WorkoutLibrary
          school={school}
          schoolId={schoolId}
          userData={userData}
          onClose={() => setLibraryVisible(false)}
          onAddToCalendar={(workout) => {
            setLibraryVisible(false);
            if (libraryDayIdx != null) {
              setDaySlots(prev => {
                const updated = [...prev];
                updated[libraryDayIdx] = {
                  type: workout.type || 'Easy',
                  baseMiles: '',
                  title: workout.name || `${DAYS[libraryDayIdx]} ${workout.type || 'Easy'}`,
                  description: workout.description || '',
                  time: '',
                  location: '',
                };
                return updated;
              });
              setEditingDay(libraryDayIdx);
              setDraftDirty(true);
              if (weekStatus === 'empty') setWeekStatus('draft');
            }
          }}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  setupPrompt:     { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, margin: SPACE.lg, backgroundColor: BRAND_LIGHT, borderRadius: RADIUS.lg, padding: SPACE.lg },
  setupPromptTitle:{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND },
  setupPromptDesc: { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, marginTop: 2 },
  setupCard:       { margin: SPACE.lg, backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg, ...SHADOW.sm },
  setupTitle:      { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: SPACE.xs },
  setupDesc:       { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, marginBottom: SPACE.lg, lineHeight: 18 },
  setupRow:        { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.md },
  setupGroupName:  { flex: 1, fontSize: FONT_SIZE.sm, color: BRAND_DARK },
  setupInput:      { width: 60, backgroundColor: NEUTRAL.bg, borderRadius: RADIUS.sm, padding: SPACE.sm, textAlign: 'center', fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, borderWidth: 1, borderColor: NEUTRAL.border },
  setupUnit:       { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted },
  setupSaveBtn:    { backgroundColor: BRAND, borderRadius: RADIUS.md, paddingVertical: SPACE.md, alignItems: 'center', marginTop: SPACE.sm },
  setupSaveBtnText:{ color: '#fff', fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },
  container:       { flex: 1, backgroundColor: NEUTRAL.bg },
  header:          { backgroundColor: NEUTRAL.card, paddingTop: Platform.OS === 'ios' ? SPACE['5xl'] : SPACE['3xl'], paddingBottom: SPACE.md, paddingHorizontal: SPACE.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
  backBtn:         { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, width: 60 },
  backText:        { color: BRAND_DARK, fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold },
  headerTitle:     { fontSize: FONT_SIZE.lg - 2, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  scroll:          { flex: 1 },
  weekNav:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, backgroundColor: NEUTRAL.card, borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
  weekNavBtn:      { padding: SPACE.sm },
  weekNavCenter:   { alignItems: 'center' },
  weekNavRow:      { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  weekNavLabel:    { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  weekNavPhase:    { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, marginTop: 2 },
  statusBadgeDraft:{ backgroundColor: '#fef3c7', borderRadius: RADIUS.sm, paddingHorizontal: SPACE.sm, paddingVertical: 2 },
  statusBadgeText: { fontSize: 10, fontWeight: FONT_WEIGHT.bold, color: '#92400e' },
  statusBadgePublished: { backgroundColor: '#d1fae5', borderRadius: RADIUS.sm, paddingHorizontal: SPACE.sm, paddingVertical: 2 },
  statusBadgePublishedText: { fontSize: 10, fontWeight: FONT_WEIGHT.bold, color: '#065f46' },
  targetsCard:     { margin: SPACE.lg, backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg, ...SHADOW.sm },
  targetsTitle:    { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: SPACE.md },
  targetRow:       { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.sm },
  targetName:      { flex: 1, fontSize: FONT_SIZE.sm, color: NEUTRAL.body },
  targetInput:     { width: 50, backgroundColor: NEUTRAL.bg, borderRadius: RADIUS.sm, padding: SPACE.sm, textAlign: 'center', fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, borderWidth: 1, borderColor: NEUTRAL.border },
  targetUnit:      { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted },
  dayCard:         { marginHorizontal: SPACE.lg, marginBottom: SPACE.sm, backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg, ...SHADOW.sm },
  dayHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayName:         { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  dayDate:         { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted },
  dayActions:      { flexDirection: 'row', gap: SPACE.md },
  addBtn:          { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, backgroundColor: BRAND_LIGHT, borderRadius: RADIUS.sm, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
  addBtnText:      { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: BRAND },
  daySummary:      { marginTop: SPACE.md },
  daySummaryTop:   { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  typeBadge:       { alignSelf: 'flex-start', borderRadius: RADIUS.sm, paddingHorizontal: SPACE.sm, paddingVertical: 3 },
  typeBadgeText:   { color: '#fff', fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold },
  dayMiles:        { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: BRAND_DARK },
  dayMeta:         { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, marginTop: SPACE.xs },
  dayDesc:         { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: SPACE.xs, lineHeight: 16 },
  restLabel:       { fontSize: FONT_SIZE.sm, color: NEUTRAL.muted, marginTop: SPACE.sm, fontStyle: 'italic' },
  dayEdit:         { marginTop: SPACE.md },
  editLabel:       { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color: NEUTRAL.body, marginBottom: SPACE.sm, marginTop: SPACE.sm },
  typeRow:         { flexDirection: 'row', marginBottom: SPACE.sm },
  typeChip:        { borderRadius: RADIUS.sm, borderWidth: 1.5, borderColor: NEUTRAL.border, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, marginRight: SPACE.sm, backgroundColor: NEUTRAL.card },
  typeChipText:    { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color: NEUTRAL.body },
  textInput:       { backgroundColor: NEUTRAL.bg, borderRadius: RADIUS.md, padding: SPACE.md, fontSize: FONT_SIZE.sm, color: BRAND_DARK, borderWidth: 1, borderColor: NEUTRAL.border, marginBottom: SPACE.sm },
  milesInput:      { width: 80, backgroundColor: NEUTRAL.bg, borderRadius: RADIUS.md, padding: SPACE.md, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, borderWidth: 1, borderColor: NEUTRAL.border, marginBottom: SPACE.sm },
  autoGroupMiles:  { backgroundColor: NEUTRAL.bg, borderRadius: RADIUS.sm, padding: SPACE.md, marginBottom: SPACE.sm },
  autoGroupRow:    { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: 2 },
  autoGroupName:   { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, width: 60 },
  groupMilesInput: { width: 44, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, textAlign: 'center', borderWidth: 1, borderColor: NEUTRAL.border, borderRadius: RADIUS.sm, paddingVertical: 2, paddingHorizontal: 4, backgroundColor: NEUTRAL.card },
  autoGroupUnit:   { fontSize: FONT_SIZE.xs, color: NEUTRAL.body },
  editActions:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACE.sm },
  browseLibraryBtn:{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, backgroundColor: BRAND_LIGHT, borderRadius: RADIUS.sm, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
  browseLibraryText:{ fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color: BRAND },
  libraryBtn:      { backgroundColor: BRAND_LIGHT, borderRadius: RADIUS.sm, padding: SPACE.sm },
  doneEditBtn:     { paddingVertical: SPACE.sm, paddingHorizontal: SPACE.lg },
  doneEditText:    { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND },
  generateSection:   { margin: SPACE.lg },
  generateHint:      { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, marginBottom: SPACE.md, textAlign: 'center' },
  templateGrid:      { gap: SPACE.sm },
  templateCard:      { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg, borderWidth: 1, borderColor: NEUTRAL.border, ...SHADOW.sm },
  templateRecommended: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, color: BRAND, marginBottom: SPACE.xs },
  templateName:      { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  templateDesc:      { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, marginTop: 2 },
  intensityBar:      { marginHorizontal: SPACE.lg, marginBottom: SPACE.md },
  intensityBarTrack: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 },
  intensitySegment:  { height: '100%', borderRadius: 4 },
  intensityLabels:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACE.xs },
  intensityLabel:    { fontSize: FONT_SIZE.xs, color: NEUTRAL.body },
  intensityBadge:    { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold },
  suggestionsCard: { margin: SPACE.lg, backgroundColor: BRAND_LIGHT, borderRadius: RADIUS.lg, padding: SPACE.lg },
  suggestionsHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.sm },
  suggestionsTitle:  { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND },
  suggestionText:  { fontSize: FONT_SIZE.sm, color: BRAND_DARK, lineHeight: 20, marginBottom: SPACE.xs },
  bottomBar:       { backgroundColor: NEUTRAL.card, borderTopWidth: 1, borderTopColor: NEUTRAL.border, padding: SPACE.lg, paddingBottom: Platform.OS === 'ios' ? SPACE['3xl'] : SPACE.lg },
  totalsRow:       { marginBottom: SPACE.sm, flexGrow: 0 },
  totalChip:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: NEUTRAL.bg, borderRadius: RADIUS.full, paddingHorizontal: SPACE.sm, paddingVertical: SPACE.xs },
  totalChipName:   { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color: BRAND_DARK },
  totalChipVal:    { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold },
  totalVal:        { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: SPACE.sm },
  bottomActions:   { gap: SPACE.sm },
  saveDraftBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm, borderWidth: 1.5, borderColor: BRAND, borderRadius: RADIUS.md, paddingVertical: SPACE.sm },
  saveDraftText:   { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND },
  pushBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm, backgroundColor: BRAND, borderRadius: RADIUS.md, paddingVertical: SPACE.md },
  pushBtnText:     { color: '#fff', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
});
