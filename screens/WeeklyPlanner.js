import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SIGNAL, SPACE, STATUS,
} from '../constants/design';
import { CATEGORIES, SIGNAL_TYPE_COLORS, TYPE_COLORS, WORKOUT_INTENSITY } from '../constants/training';
import { generateVolumeCurve, getPhaseForSeason } from './SeasonPlanner';
import WorkoutLibrary from './WorkoutLibrary';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WORKOUT_TYPES = CATEGORIES?.Training?.types || ['Easy', 'Tempo', 'Long Run', 'Intervals', 'Speed', 'Cross Train', 'Weights', 'Recovery', 'Time Trial'];

// Resolve workout-type color via Signal palette with sensible fallbacks
const typeColor = (type) => SIGNAL_TYPE_COLORS?.[type] || TYPE_COLORS?.[type] || SIGNAL.color.indigo;

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
// volume: fraction of weekly target to distribute (1.0 = 100%, 0.6 = 60%)
// pct: relative weight for each day (distribute() normalizes these so sum doesn't matter)
const WEEK_TEMPLATES = {
  base: {
    label: 'Base Week',
    desc: '6 easy days + long run, build aerobic foundation',
    phases: ['Summer Base', 'Pre-Season Base', 'Base'],
    volume: 1.0,
    days: [
      { type: 'Easy', pct: 15 },
      { type: 'Easy', pct: 15 },
      null,
      { type: 'Easy', pct: 15 },
      { type: 'Easy', pct: 15 },
      { type: 'Long Run', pct: 25 },
      { type: 'Easy', pct: 15 },
    ],
  },
  build: {
    label: 'Build Week',
    desc: '2 quality sessions + long run, easy between',
    phases: ['Build'],
    volume: 1.0,
    days: [
      { type: 'Easy', pct: 15 },
      { type: 'Tempo', pct: 15 },
      { type: 'Easy', pct: 13 },
      { type: 'Intervals', pct: 13 },
      { type: 'Easy', pct: 12 },
      { type: 'Long Run', pct: 22 },
      null,
    ],
  },
  competition: {
    label: 'Competition Week',
    desc: '1 quality session + long run, moderate volume',
    phases: ['Competition'],
    volume: 0.85,
    days: [
      { type: 'Easy', pct: 15 },
      { type: 'Tempo', pct: 15 },
      { type: 'Easy', pct: 15 },
      null,
      { type: 'Easy', pct: 12 },
      { type: 'Long Run', pct: 23 },
      null,
    ],
  },
  race: {
    label: 'Race Week',
    desc: 'Reduced volume (~60%), short quality, race day ready',
    phases: ['Competition', 'Peak'],
    volume: 0.6,
    days: [
      { type: 'Easy', pct: 30 },
      { type: 'Tempo', pct: 25 },
      { type: 'Easy', pct: 25 },
      null,
      { type: 'Easy', pct: 20 },
      { type: 'Race', pct: 0 },
      null,
    ],
  },
  recovery: {
    label: 'Recovery Week',
    desc: 'Low volume (~50%), all easy, active recovery',
    phases: ['Taper'],
    volume: 0.5,
    days: [
      null,
      { type: 'Easy', pct: 30 },
      { type: 'Cross Train', pct: 0 },
      { type: 'Easy', pct: 30 },
      null,
      { type: 'Easy', pct: 40 },
      null,
    ],
  },
};

function generateWeekPlan(templateKey, weekTargets, groups) {
  const template = WEEK_TEMPLATES[templateKey];
  if (!template) return null;
  const targets = groups.map(g => parseFloat(weekTargets[g.id]) || 0);
  const maxTarget = Math.max(...targets, 1);
  const vol = template.volume || 1.0;
  const pctSum = template.days.reduce((s, d) => s + (d?.pct || 0), 0);

  // Helper: distribute a total across days proportionally, adjusting the
  // largest day so the sum is exact (avoids cumulative rounding drift).
  const distribute = (total) => {
    const adjusted = Math.round(total * vol);
    if (adjusted <= 0) return template.days.map(() => 0);
    const raw = template.days.map(d => (d?.pct || 0) / (pctSum || 1) * adjusted);
    const rounded = raw.map(v => Math.round(v));
    const diff = adjusted - rounded.reduce((s, v) => s + v, 0);
    if (diff !== 0) {
      // Adjust the day with the largest allocation
      const maxIdx = raw.reduce((best, v, i) => v > raw[best] ? i : best, 0);
      rounded[maxIdx] += diff;
    }
    return rounded;
  };

  // Distribute base miles (from max group target)
  const baseDist = distribute(maxTarget);

  // Distribute per-group miles
  const groupDists = {};
  groups.forEach((g, gi) => {
    if (targets[gi] > 0) {
      groupDists[g.id] = distribute(targets[gi]);
    }
  });

  return template.days.map((day, i) => {
    if (!day) return EMPTY_SLOT();
    const baseMiles = day.pct > 0 ? String(baseDist[i]) : '';
    const overrides = {};
    if (day.pct > 0) {
      groups.forEach((g) => {
        if (groupDists[g.id]) {
          overrides[g.id] = String(groupDists[g.id][i]);
        }
      });
    }
    return {
      type: day.type,
      baseMiles,
      title: `${DAYS[i]} ${day.type}`,
      description: '',
      time: '',
      location: '',
      groupMilesOverrides: overrides,
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
  const [showTemplates, setShowTemplates] = useState(false);
  const [templatePromptDismissed, setTemplatePromptDismissed] = useState(false);

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
    setShowTemplates(false);
    setTemplatePromptDismissed(false);
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

  // Today's index (0=Mon..6=Sun) for highlighting the active day
  const todayIdx = (() => {
    const now = new Date();
    const monday = getMonday(now);
    if (monday.getTime() !== weekStart.getTime()) return -1;
    return (now.getDay() + 6) % 7;
  })();

  return (
    <View style={styles.container}>
      {/* Header — Signal */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.headerSideBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={22} color={SIGNAL.color.inkSoft} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Weekly plans</Text>
        <View style={styles.headerSideBtn} />
      </View>

      {/* Week navigation strip */}
      <View style={styles.weekNav}>
        <TouchableOpacity onPress={() => navigateWeek(-1)} style={styles.weekNavBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={20} color={SIGNAL.color.mute2} />
        </TouchableOpacity>
        <View style={styles.weekNavCenter}>
          <View style={styles.weekNavRow}>
            {phase ? (
              <Text style={styles.weekNavLabel}>Week {phase.weekNum} · {phase.name}</Text>
            ) : (
              <Text style={styles.weekNavLabel}>{weekLabel}</Text>
            )}
            {weekStatus === 'draft' && (
              <View style={styles.statusBadgeDraft}><Text style={styles.statusBadgeText}>Draft</Text></View>
            )}
            {weekStatus === 'published' && (
              <View style={styles.statusBadgePublished}><Text style={styles.statusBadgePublishedText}>Published</Text></View>
            )}
          </View>
          <Text style={styles.weekNavDate}>{weekLabel}</Text>
          {daySlots.some(s => s.type) && (
            <TouchableOpacity
              style={styles.loadTemplateBtn}
              onPress={() => setShowTemplates(prev => !prev)}
            >
              <Ionicons name={showTemplates ? 'close-outline' : 'refresh-outline'} size={13} color={SIGNAL.color.indigo} />
              <Text style={styles.loadTemplateBtnText}>{showTemplates ? 'Cancel' : 'Load template'}</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={() => navigateWeek(1)} style={styles.weekNavBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={20} color={SIGNAL.color.mute2} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 160 }}>

        {/* Template picker (shown when Load Template tapped) */}
        {showTemplates && (
          <View style={styles.generateSection}>
            <View style={styles.generateHeader}>
              <Text style={styles.generateHint}>Choose a template or close to plan manually.</Text>
              <TouchableOpacity onPress={() => setShowTemplates(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={18} color={SIGNAL.color.mute} />
              </TouchableOpacity>
            </View>
            <View style={styles.templateGrid}>
              {Object.entries(WEEK_TEMPLATES)
                .sort(([, a], [, b]) => {
                  const aMatch = phase && a.phases.includes(phase.name) ? 0 : 1;
                  const bMatch = phase && b.phases.includes(phase.name) ? 0 : 1;
                  return aMatch - bMatch;
                })
                .map(([key, tmpl]) => {
                  const isRecommended = phase && tmpl.phases.includes(phase.name);
                  const daySummary = tmpl.days.map((d, di) => d ? `${DAYS[di].slice(0, 3)} ${d.type}` : `${DAYS[di].slice(0, 3)} Off`).join(' · ');
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.templateCard, isRecommended && styles.templateCardRecommended]}
                      onPress={() => {
                        const plan = generateWeekPlan(key, weekTargets, groups);
                        if (plan) { setDaySlots(plan); setDraftDirty(true); setWeekStatus('draft'); setShowTemplates(false); }
                      }}
                    >
                      {isRecommended && <Text style={styles.templateRecommended}>Recommended</Text>}
                      <Text style={styles.templateName}>{tmpl.label}</Text>
                      <Text style={styles.templateDesc}>{tmpl.desc}</Text>
                      <Text style={styles.templateDays}>{daySummary}</Text>
                    </TouchableOpacity>
                  );
                })}
            </View>
          </View>
        )}

        {/* Empty week prompt — Signal dashed indigo tile */}
        {weekStatus === 'empty' && daySlots.every(s => !s.type) && !showTemplates && !templatePromptDismissed && (
          <View style={styles.emptyWeekPrompt}>
            <View style={styles.emptyWeekRow}>
              <TouchableOpacity style={styles.emptyWeekBtn} onPress={() => setShowTemplates(true)}>
                <Ionicons name="flash-outline" size={14} color={SIGNAL.color.indigo} />
                <Text style={styles.emptyWeekBtnText}>Recommended for {phase?.name || 'this phase'}: generate from template</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setTemplatePromptDismissed(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={16} color={SIGNAL.color.mute} />
              </TouchableOpacity>
            </View>
            <Text style={styles.emptyWeekOr}>or tap any day below to plan manually</Text>
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
            <View style={styles.intensityCard}>
              <View style={styles.intensityHeader}>
                <Text style={styles.eyebrow}>Easy-hard balance</Text>
                {total > 0 && (
                  <Text style={[styles.intensityBadge, { color: balanced ? SIGNAL.color.emerald : SIGNAL.color.amber }]}>
                    {easyPct}% easy · {balanced ? 'balanced' : 'check load'}
                  </Text>
                )}
              </View>
              <View style={styles.intensityBarTrack}>
                {easyCount > 0 && (
                  <LinearGradient
                    colors={[SIGNAL.color.lime, SIGNAL.color.emerald]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.intensitySegment, { flex: easyCount }]}
                  />
                )}
                {hardCount > 0 && (
                  <LinearGradient
                    colors={[SIGNAL.color.amber, SIGNAL.color.coral]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.intensitySegment, { flex: hardCount }]}
                  />
                )}
                {offCount > 0 && <View style={[styles.intensitySegment, { flex: offCount, backgroundColor: SIGNAL.color.line }]} />}
              </View>
              <View style={styles.intensityLabels}>
                <Text style={styles.intensityLabel}>Easy {easyCount} · Hard {hardCount} · Off {offCount}</Text>
              </View>
            </View>
          );
        })()}

        {/* Section: schedule */}
        <Text style={styles.sectionTitle}>Schedule</Text>

        {/* Day slots */}
        {DAYS.map((day, i) => {
          const slot = daySlots[i];
          const dateObj = new Date(weekStart.getTime() + i * 86400000);
          const dateLabel = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const dayNum = dateObj.toLocaleDateString('en-US', { day: 'numeric' });
          const isEditing = editingDay === i;
          const isToday = i === todayIdx;
          const accent = slot.type ? typeColor(slot.type) : SIGNAL.color.line;

          return (
            <View
              key={i}
              style={[
                styles.dayCard,
                { borderLeftColor: accent, borderLeftWidth: 3 },
                isToday && styles.dayCardToday,
              ]}
            >
              <View style={styles.dayHeader}>
                <View style={styles.dayLabelCol}>
                  <Text style={[styles.dayName, isToday && { color: SIGNAL.color.indigo }]}>{day.slice(0, 3)}</Text>
                  <Text style={styles.dayDate}>{dayNum}</Text>
                </View>

                {slot.type ? (
                  <View style={styles.dayChipCol}>
                    <View style={[styles.typeChipPill, { backgroundColor: `${accent}1A` }]}>
                      <View style={[styles.typeChipDot, { backgroundColor: accent }]} />
                      <Text style={[styles.typeChipPillText, { color: accent }]}>{slot.type}</Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.dayChipCol}>
                    <Text style={styles.restLabel}>Rest day</Text>
                  </View>
                )}

                <View style={styles.dayRight}>
                  {slot.type ? (
                    <>
                      <Text style={styles.dayMiles}>{slot.baseMiles ? `${slot.baseMiles} mi` : '—'}</Text>
                      <View style={styles.dayActions}>
                        <TouchableOpacity onPress={() => setEditingDay(isEditing ? null : i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name={isEditing ? 'chevron-up' : 'create-outline'} size={18} color={SIGNAL.color.indigo} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => clearSlot(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="close-circle-outline" size={18} color={SIGNAL.color.mute2} />
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <View style={styles.dayActions}>
                      <TouchableOpacity style={styles.addBtn} onPress={() => { updateSlot(i, 'type', 'Easy'); setEditingDay(i); }}>
                        <Ionicons name="add" size={16} color={SIGNAL.color.indigo} />
                        <Text style={styles.addBtnText}>Add</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.libraryBtn} onPress={() => { setLibraryDayIdx(i); setLibraryVisible(true); }}>
                        <Ionicons name="book-outline" size={14} color={SIGNAL.color.indigo} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>

              {/* Per-group miles strip (collapsed view) */}
              {slot.type && !isEditing && groups.length > 0 && slot.baseMiles ? (
                <View style={styles.perGroupRow}>
                  {groups.map(g => {
                    const gm = calcGroupMiles(slot.baseMiles, slot.groupMilesOverrides || {});
                    return (
                      <View key={g.id} style={styles.perGroupCell}>
                        <Text style={styles.perGroupName}>{g.name}</Text>
                        <Text style={styles.perGroupVal}>{gm[g.id] || 0} mi</Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              {slot.type && !isEditing && (slot.time || slot.location || slot.description) ? (
                <View style={styles.daySummary}>
                  {(slot.time || slot.location) && (
                    <Text style={styles.dayMeta}>
                      {slot.time ? slot.time : ''}{slot.time && slot.location ? '  ·  ' : ''}{slot.location || ''}
                    </Text>
                  )}
                  {slot.description ? <Text style={styles.dayDesc} numberOfLines={2}>{slot.description}</Text> : null}
                </View>
              ) : null}

              {isEditing && (
                <View style={styles.dayEdit}>
                  <Text style={styles.editLabel}>Workout type</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeRow}>
                    {WORKOUT_TYPES.map(t => {
                      const tc = typeColor(t);
                      const active = slot.type === t;
                      return (
                        <TouchableOpacity
                          key={t}
                          style={[
                            styles.typeChip,
                            active && { backgroundColor: `${tc}1A`, borderColor: tc },
                          ]}
                          onPress={() => updateSlot(i, 'type', t)}
                        >
                          <View style={[styles.typeChipDot, { backgroundColor: tc }]} />
                          <Text style={[styles.typeChipText, active && { color: tc }]}>{t}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <Text style={styles.editLabel}>Title</Text>
                  <TextInput
                    style={styles.textInput}
                    value={slot.title}
                    onChangeText={(text) => updateSlot(i, 'title', text)}
                    placeholder={`${DAYS[i]} ${slot.type || 'Easy'}`}
                    placeholderTextColor={SIGNAL.color.mute2}
                  />
                  <Text style={styles.editLabel}>Base miles</Text>
                  <TextInput
                    style={styles.milesInput}
                    value={slot.baseMiles}
                    onChangeText={(text) => updateSlot(i, 'baseMiles', text)}
                    placeholder="e.g. 6"
                    placeholderTextColor={SIGNAL.color.mute2}
                    keyboardType="decimal-pad"
                    maxLength={4}
                  />
                  {groups.length > 0 && slot.baseMiles && (
                    <View style={styles.autoGroupMiles}>
                      {groups.map(g => {
                        const autoVal = calcGroupMiles(slot.baseMiles)[g.id] || 0;
                        const override = slot.groupMilesOverrides?.[g.id];
                        const hasOverride = override !== undefined;
                        const displayVal = hasOverride ? (override === '' ? '' : override) : String(autoVal);
                        const isEdited = hasOverride && override !== '' && String(override) !== String(autoVal);
                        return (
                          <View key={g.id} style={styles.autoGroupRow}>
                            <Text style={styles.autoGroupName}>{g.name}</Text>
                            <TextInput
                              style={[styles.groupMilesInput, isEdited && { borderColor: SIGNAL.color.indigo, color: SIGNAL.color.indigo }]}
                              value={String(displayVal)}
                              onChangeText={(text) => {
                                updateSlot(i, 'groupMilesOverrides', { ...(slot.groupMilesOverrides || {}), [g.id]: text });
                              }}
                              onBlur={() => {
                                // On blur, if empty revert to auto-calc
                                if (override === '') {
                                  const cleaned = { ...(slot.groupMilesOverrides || {}) };
                                  delete cleaned[g.id];
                                  updateSlot(i, 'groupMilesOverrides', cleaned);
                                }
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
                    placeholderTextColor={SIGNAL.color.mute2}
                  />
                  <Text style={styles.editLabel}>Location</Text>
                  <TextInput
                    style={styles.textInput}
                    value={slot.location}
                    onChangeText={(text) => updateSlot(i, 'location', text)}
                    placeholder="e.g. Stadium parking lot"
                    placeholderTextColor={SIGNAL.color.mute2}
                  />
                  <Text style={styles.editLabel}>Instructions / details</Text>
                  <TextInput
                    style={[styles.textInput, { minHeight: 60, textAlignVertical: 'top' }]}
                    value={slot.description}
                    onChangeText={(text) => updateSlot(i, 'description', text)}
                    placeholder="Warm-up, workout details, cool-down..."
                    placeholderTextColor={SIGNAL.color.mute2}
                    multiline
                  />
                  <View style={styles.editActions}>
                    <TouchableOpacity style={styles.browseLibraryBtn} onPress={() => { setLibraryDayIdx(i); setLibraryVisible(true); }}>
                      <Ionicons name="book-outline" size={14} color={SIGNAL.color.indigo} />
                      <Text style={styles.browseLibraryText}>Browse Library</Text>
                    </TouchableOpacity>
                    {slot.type && slot.description && (
                      <TouchableOpacity
                        style={styles.browseLibraryBtn}
                        onPress={async () => {
                          try {
                            await addDoc(collection(db, 'workoutLibrary'), {
                              name: slot.title || `${DAYS[i]} ${slot.type}`,
                              type: slot.type,
                              description: slot.description,
                              phase: phase?.name || 'General',
                              schoolId,
                              createdBy: auth.currentUser?.uid || '',
                              createdAt: serverTimestamp(),
                              isCustom: true,
                            });
                            Alert.alert('Saved!', `"${slot.title || slot.type}" added to your workout library.`);
                          } catch (e) {
                            Alert.alert('Error', 'Could not save to library.');
                          }
                        }}
                      >
                        <Ionicons name="add-circle-outline" size={14} color={SIGNAL.color.indigo} />
                        <Text style={styles.browseLibraryText}>Save to Library</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => { setEditingDay(null); if (draftDirty) saveDraft(); }} style={styles.doneEditBtn}>
                      <Text style={styles.doneEditText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          );
        })}

        {/* Phase suggestions */}
        {suggestions.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Coaching tips</Text>
            <View style={styles.suggestionsCard}>
              <View style={styles.suggestionsHeader}>
                <Ionicons name="bulb-outline" size={16} color={SIGNAL.color.indigo} />
                <Text style={styles.suggestionsTitle}>Smart suggestions</Text>
              </View>
              {suggestions.map((s, i) => {
                const isWarn = s.type === 'warning';
                const dotColor = isWarn ? SIGNAL.color.amber : SIGNAL.color.indigo;
                return (
                  <View key={i} style={styles.suggestionRow}>
                    <View style={[styles.suggestionDot, { backgroundColor: dotColor }]} />
                    <Text style={[styles.suggestionText, isWarn && { color: SIGNAL.color.inkSoft }]}>
                      {s.text}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

      </ScrollView>

      {/* Sticky bottom — group totals + push button */}
      <View style={styles.bottomBar}>
        {groups.length > 0 ? (
          <View style={styles.totalsRow}>
            {groups.map(g => {
              const gt = groupTotals[g.id] || { planned: 0, target: 0, pct: 0 };
              const statusColor = gt.pct > 110 ? SIGNAL.color.coral : gt.pct >= 90 ? SIGNAL.color.emerald : gt.pct >= 80 ? SIGNAL.color.amber : SIGNAL.color.coral;
              const statusIcon = gt.pct > 110 ? 'alert-circle' : gt.pct >= 90 ? 'checkmark-circle' : 'alert-circle';
              return (
                <View key={g.id} style={styles.totalChip}>
                  <Ionicons name={statusIcon} size={13} color={statusColor} />
                  <View style={styles.totalChipTextCol}>
                    <Text style={styles.totalChipName}>{g.name}</Text>
                    <Text style={[styles.totalChipVal, { color: statusColor }]}>{gt.planned} / {gt.target} mi</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.totalVal}>Total: {totalBase} mi</Text>
        )}
        <View style={styles.bottomActions}>
          {draftDirty && (
            <TouchableOpacity style={styles.saveDraftBtn} onPress={() => saveDraft()} disabled={saving}>
              <Ionicons name="save-outline" size={16} color={SIGNAL.color.indigo} />
              <Text style={styles.saveDraftText}>Save Draft</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.pushBtn, saving && { opacity: 0.6 }]} onPress={handlePushToCalendar} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : (
              <>
                <Ionicons name="arrow-forward-circle" size={18} color="#fff" />
                <Text style={styles.pushBtnText}>{weekStatus === 'published' ? 'Update calendar' : 'Push to calendar'}</Text>
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
  // ── Container / chrome ────────────────────────────────────────────────────
  container: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },
  header: {
    backgroundColor: SIGNAL.color.white,
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: 12,
    paddingHorizontal: SIGNAL.space.screen,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  headerSideBtn: {
    width: 32,
    height: 32,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 18,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  scroll: { flex: 1 },

  // ── Week navigation ───────────────────────────────────────────────────────
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIGNAL.space.screen,
    paddingVertical: 12,
    backgroundColor: SIGNAL.color.white,
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  weekNavBtn: { padding: 6 },
  weekNavCenter: { alignItems: 'center', flex: 1 },
  weekNavRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weekNavLabel: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 14,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  weekNavDate: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 11,
    color: SIGNAL.color.mute,
    marginTop: 2,
  },
  statusBadgeDraft: {
    backgroundColor: `${SIGNAL.color.amber}1A`,
    borderRadius: SIGNAL.radius.chip,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusBadgeText: {
    fontSize: 9.5,
    fontFamily: SIGNAL.font.bodyBold,
    color: SIGNAL.color.amber,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  statusBadgePublished: {
    backgroundColor: `${SIGNAL.color.emerald}1A`,
    borderRadius: SIGNAL.radius.chip,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusBadgePublishedText: {
    fontSize: 9.5,
    fontFamily: SIGNAL.font.bodyBold,
    color: SIGNAL.color.emerald,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  loadTemplateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: SIGNAL.radius.chip,
    backgroundColor: `${SIGNAL.color.indigo}0F`,
  },
  loadTemplateBtnText: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 11,
    color: SIGNAL.color.indigo,
  },

  // ── Section title (Signal: indigo, no italic) ─────────────────────────────
  sectionTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 18,
    color: SIGNAL.color.indigo,
    letterSpacing: SIGNAL.letter.bodyTight,
    paddingHorizontal: SIGNAL.space.screen,
    marginTop: 18,
    marginBottom: 10,
  },
  eyebrow: { ...SIGNAL.style.eyebrow },

  // ── Empty-week prompt ─────────────────────────────────────────────────────
  emptyWeekPrompt: {
    marginHorizontal: SIGNAL.space.screen,
    marginTop: 14,
    padding: 12,
    borderRadius: 11,
    backgroundColor: `${SIGNAL.color.indigo}0A`,
    borderWidth: 1,
    borderColor: `${SIGNAL.color.indigo}40`,
    borderStyle: 'dashed',
  },
  emptyWeekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  emptyWeekBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  emptyWeekBtnText: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 12,
    color: SIGNAL.color.indigo,
    flex: 1,
  },
  emptyWeekOr: {
    fontFamily: SIGNAL.font.body,
    fontSize: 11,
    color: SIGNAL.color.mute,
    marginTop: 6,
    marginLeft: 20,
  },

  // ── Template picker ───────────────────────────────────────────────────────
  generateSection: {
    marginHorizontal: SIGNAL.space.screen,
    marginTop: 14,
  },
  generateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  generateHint: {
    fontFamily: SIGNAL.font.body,
    fontSize: 13,
    color: SIGNAL.color.inkSoft,
    flex: 1,
  },
  templateGrid: { gap: 8 },
  templateCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: SIGNAL.space.card,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  templateCardRecommended: {
    borderColor: SIGNAL.color.indigo,
    borderWidth: 1.5,
    backgroundColor: `${SIGNAL.color.indigo}06`,
  },
  templateRecommended: {
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 10.5,
    color: SIGNAL.color.indigo,
    marginBottom: 4,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  templateName: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 15,
    color: SIGNAL.color.ink,
  },
  templateDesc: {
    fontFamily: SIGNAL.font.body,
    fontSize: 12,
    color: SIGNAL.color.inkSoft,
    marginTop: 2,
    lineHeight: 17,
  },
  templateDays: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 10.5,
    color: SIGNAL.color.mute,
    marginTop: 6,
    lineHeight: 15,
  },

  // ── Intensity bar (gradient) ──────────────────────────────────────────────
  intensityCard: {
    marginHorizontal: SIGNAL.space.screen,
    marginTop: 14,
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: 14,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  intensityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  intensityBarTrack: {
    flexDirection: 'row',
    height: 10,
    borderRadius: SIGNAL.radius.chip,
    overflow: 'hidden',
    gap: 2,
  },
  intensitySegment: { height: '100%' },
  intensityLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  intensityLabel: {
    fontFamily: SIGNAL.font.body,
    fontSize: 11.5,
    color: SIGNAL.color.mute,
  },
  intensityBadge: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 12,
  },

  // ── Day cards ─────────────────────────────────────────────────────────────
  dayCard: {
    marginHorizontal: SIGNAL.space.screen,
    marginBottom: 8,
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: 12,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  dayCardToday: {
    backgroundColor: `${SIGNAL.color.indigo}06`,
    borderColor: `${SIGNAL.color.indigo}33`,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dayLabelCol: {
    minWidth: 44,
  },
  dayName: {
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 13,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  dayDate: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 10.5,
    color: SIGNAL.color.mute,
    marginTop: 1,
  },
  dayChipCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dayActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  typeChipPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: SIGNAL.radius.chip,
  },
  typeChipDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
  },
  typeChipPillText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 11.5,
  },
  dayMiles: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 13,
    color: SIGNAL.color.ink,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: `${SIGNAL.color.indigo}0F`,
    borderRadius: SIGNAL.radius.chip,
  },
  addBtnText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 12,
    color: SIGNAL.color.indigo,
  },
  libraryBtn: {
    backgroundColor: `${SIGNAL.color.indigo}0F`,
    borderRadius: SIGNAL.radius.chip,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  restLabel: {
    fontFamily: SIGNAL.font.body,
    fontSize: 12,
    color: SIGNAL.color.mute2,
  },

  // ── Per-group miles strip ─────────────────────────────────────────────────
  perGroupRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: SIGNAL.color.line,
  },
  perGroupCell: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  perGroupName: {
    fontFamily: SIGNAL.font.body,
    fontSize: 11,
    color: SIGNAL.color.mute,
  },
  perGroupVal: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 12,
    color: SIGNAL.color.inkSoft,
  },

  // ── Day summary meta ──────────────────────────────────────────────────────
  daySummary: { marginTop: 8 },
  dayMeta: {
    fontFamily: SIGNAL.font.body,
    fontSize: 11.5,
    color: SIGNAL.color.inkSoft,
  },
  dayDesc: {
    fontFamily: SIGNAL.font.body,
    fontSize: 11.5,
    color: SIGNAL.color.mute,
    marginTop: 4,
    lineHeight: 16,
  },

  // ── Edit panel ────────────────────────────────────────────────────────────
  dayEdit: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: SIGNAL.color.line,
  },
  editLabel: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 11,
    color: SIGNAL.color.mute,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 10,
  },
  typeRow: { flexDirection: 'row', marginBottom: 4 },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: SIGNAL.radius.chip,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
    backgroundColor: SIGNAL.color.white,
  },
  typeChipText: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 11.5,
    color: SIGNAL.color.inkSoft,
  },
  textInput: {
    backgroundColor: SIGNAL.color.paper,
    borderRadius: SIGNAL.radius.control,
    padding: 12,
    fontFamily: SIGNAL.font.body,
    fontSize: 13,
    color: SIGNAL.color.ink,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    marginBottom: 6,
  },
  milesInput: {
    width: 90,
    backgroundColor: SIGNAL.color.paper,
    borderRadius: SIGNAL.radius.control,
    padding: 12,
    fontFamily: SIGNAL.font.mono,
    fontSize: 16,
    color: SIGNAL.color.ink,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    marginBottom: 6,
  },
  autoGroupMiles: {
    backgroundColor: SIGNAL.color.paper,
    borderRadius: SIGNAL.radius.control,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  autoGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  autoGroupName: {
    flex: 1,
    fontFamily: SIGNAL.font.body,
    fontSize: 12,
    color: SIGNAL.color.inkSoft,
  },
  groupMilesInput: {
    width: 50,
    fontFamily: SIGNAL.font.mono,
    fontSize: 12,
    color: SIGNAL.color.ink,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    borderRadius: SIGNAL.radius.control,
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: SIGNAL.color.white,
  },
  autoGroupUnit: {
    fontFamily: SIGNAL.font.body,
    fontSize: 11,
    color: SIGNAL.color.mute,
    width: 16,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    flexWrap: 'wrap',
    gap: 6,
  },
  browseLibraryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: `${SIGNAL.color.indigo}0F`,
    borderRadius: SIGNAL.radius.chip,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  browseLibraryText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 11.5,
    color: SIGNAL.color.indigo,
  },
  doneEditBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: SIGNAL.color.indigo,
    borderRadius: SIGNAL.radius.button,
  },
  doneEditText: {
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 12,
    color: SIGNAL.color.white,
  },

  // ── Coaching tips ─────────────────────────────────────────────────────────
  suggestionsCard: {
    marginHorizontal: SIGNAL.space.screen,
    marginBottom: 14,
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: 14,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  suggestionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  suggestionsTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 13,
    color: SIGNAL.color.ink,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  suggestionDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    marginTop: 7,
  },
  suggestionText: {
    flex: 1,
    fontFamily: SIGNAL.font.body,
    fontSize: 12.5,
    color: SIGNAL.color.inkSoft,
    lineHeight: 18,
  },

  // ── Bottom bar ────────────────────────────────────────────────────────────
  bottomBar: {
    backgroundColor: SIGNAL.color.white,
    borderTopWidth: 1,
    borderTopColor: SIGNAL.color.line,
    paddingHorizontal: SIGNAL.space.screen,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 14,
  },
  totalsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  totalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: SIGNAL.color.paper,
    borderRadius: SIGNAL.radius.control,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  totalChipTextCol: {
    flexDirection: 'column',
  },
  totalChipName: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 11.5,
    color: SIGNAL.color.ink,
  },
  totalChipVal: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 11,
  },
  totalVal: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 12,
    color: SIGNAL.color.ink,
    marginBottom: 8,
  },
  bottomActions: { gap: 8 },
  saveDraftBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: SIGNAL.color.indigo,
    borderRadius: SIGNAL.radius.button,
    paddingVertical: 10,
    backgroundColor: SIGNAL.color.white,
  },
  saveDraftText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 13,
    color: SIGNAL.color.indigo,
  },
  pushBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: SIGNAL.color.indigo,
    borderRadius: SIGNAL.radius.button,
    paddingVertical: 13,
  },
  pushBtnText: {
    color: SIGNAL.color.white,
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 14,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
});
