import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { doc, updateDoc } from 'firebase/firestore';
import { useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SIGNAL } from '../constants/design';
import { db } from '../firebaseConfig';
import DatePickerField from './DatePickerField';

// ── Sport definitions (3 sports) ─────────────────────────────────────────────
export const SPORTS = {
  cross_country: {
    key: 'cross_country', label: 'Cross Country', icon: '🏔️', color: SIGNAL.color.emerald,
    months: 'Jun – Nov', description: 'Summer base through state championships',
    events: ['5K', 'Team scoring', 'State meet'],
  },
  indoor_track: {
    key: 'indoor_track', label: 'Indoor Track', icon: '🏟️', color: SIGNAL.color.indigo,
    months: 'Dec – Mar', description: 'Mile, 1500m, 3000m, DMR',
    events: ['Mile', '1500m', '3000m', '5K', 'DMR'],
  },
  outdoor_track: {
    key: 'outdoor_track', label: 'Outdoor Track', icon: '🏃', color: SIGNAL.color.violet,
    months: 'Mar – Jun', description: '1500m, 3200m, steeplechase, relays',
    events: ['1500m', 'Mile', '3200m', 'Steeplechase', 'Relays'],
  },
};

// ── Phase guidance per sport ──────────────────────────────────────────────────
export const SPORT_PHASES = {
  cross_country: [
    { name: 'Summer Base',    color: '#e65100', icon: '☀️',  pct: [0.00, 0.20], weeks: '1–6',        focus: 'Build the foundation — voluntary, culture-first',
      guidance: ['Every mile now is worth two miles in September', 'Group runs build team culture before school starts', 'Keep it voluntary but create social incentives', 'Log every run — start the habit now', 'Seniors: set the example. Freshmen: learn the culture.'] },
    { name: 'Pre-Season Base',color: SIGNAL.color.lime, icon: '🏗️', pct: [0.20, 0.40], weeks: '7–10',       focus: 'Official practice — build the aerobic pyramid',
      guidance: ['High volume, low intensity — stay in Zone 1–2', 'Never increase weekly mileage more than 10%', '"When in doubt, do less" — Coach Jay Johnson', 'Post-run strength and mobility every practice', 'Team time trials: assess where everyone is starting'] },
    { name: 'Build',          color: SIGNAL.color.amber, icon: '⚡',  pct: [0.40, 0.62], weeks: '11–14',      focus: 'Introduce quality and speed',
      guidance: ['Add one tempo run per week — stay in Zone 3', 'Mileage holds steady, intensity increases', 'Begin tracking lactate threshold pace', 'Group training becomes more competitive', 'Monitor HR — easy days must stay easy'] },
    { name: 'Competition',    color: SIGNAL.color.coral, icon: '🏁',  pct: [0.62, 0.80], weeks: '15–17',      focus: 'Race-specific prep — pack work is everything',
      guidance: ['Volume drops 20–30% from peak', 'Pack work is the #1 priority', 'Monitor 1–5 compression weekly', 'Use early races as training efforts', 'Championship mindset begins now'] },
    { name: 'Peak',           color: SIGNAL.color.violet, icon: '🎯',  pct: [0.80, 0.94], weeks: '18–19',      focus: 'Sharpen for championships',
      guidance: ['Volume drops 40–50% — short, sharp workouts only', 'Every workout: build confidence', 'Legs should feel fresh — trust the fitness', 'Mental prep is as important as physical', 'Confidence built in October wins championships'] },
    { name: 'Taper',          color: SIGNAL.color.cyan, icon: '🏆',  pct: [0.94, 1.00], weeks: 'Final week', focus: 'Rest and trust the training',
      guidance: ['Easy runs only — no hard workouts', 'Sleep is the #1 performance tool this week', 'Review race strategy with every athlete', '"The hay is in the barn" — trust what you built', 'This is what all the work was for'] },
  ],
  indoor_track: [
    { name: 'Base',        color: SIGNAL.color.lime, icon: '🏗️', pct: [0.00, 0.28], weeks: '1–3',        focus: 'Carry XC fitness, add speed',
      guidance: ['Bridge from cross country — do not start over', 'Introduce short speed sessions — 200s and 400s', 'Focus on turnover and form on the track', 'Keep mileage moderate — indoor is shorter than XC', 'Great time for drills and strength work'] },
    { name: 'Build',       color: SIGNAL.color.amber, icon: '⚡',  pct: [0.28, 0.57], weeks: '4–7',        focus: 'Race pace development',
      guidance: ['Work from 5K pace down to mile pace progressively', 'Structured interval sessions on the track', 'Balance speed and endurance — indoor needs both', 'Begin event-specific tempo work', 'Monitor leg fatigue closely'] },
    { name: 'Competition', color: SIGNAL.color.coral, icon: '🏁',  pct: [0.57, 0.78], weeks: '8–10',       focus: 'Event-specific sharpening',
      guidance: ['Use invitationals as tune-ups, not championship efforts', 'Dial in race tactics — positioning, kick timing', 'Milers: work on closing speed in final 200m', 'Practice relay exchanges for DMR', 'Lactate threshold work continues'] },
    { name: 'Peak',        color: SIGNAL.color.violet, icon: '🎯',  pct: [0.78, 0.94], weeks: '11–12',      focus: 'Championship sharpening',
      guidance: ['Volume drops significantly — quality over quantity', 'Simulate championship conditions', 'Athletes should feel fast and confident', 'Final speed sessions 5–7 days out', 'Trust the training — fitness is already there'] },
    { name: 'Taper',       color: SIGNAL.color.cyan, icon: '🏆',  pct: [0.94, 1.00], weeks: 'Final week', focus: 'Championship week',
      guidance: ['Short, sharp strides only', 'Warm-up and cool-down are critical on the track', 'Review heat assignments and race strategy', 'Manage athlete energy — excitement masks fatigue', 'Championship environment: stay warm, stay focused'] },
  ],
  outdoor_track: [
    { name: 'Base',        color: SIGNAL.color.lime, icon: '🏗️', pct: [0.00, 0.28], weeks: '1–3',        focus: 'Bridge from indoor, rebuild base',
      guidance: ['Use indoor fitness as the starting point', 'Transition back to higher mileage', 'Introduce outdoor-specific work — hills, varied surfaces', 'Start periodizing toward outdoor championship', 'Address any technique issues from indoor'] },
    { name: 'Build',       color: SIGNAL.color.amber, icon: '⚡',  pct: [0.28, 0.57], weeks: '4–8',        focus: 'Event-specific development',
      guidance: ['3200m runners: longer tempo reps', '1500m runners: balance speed and endurance', 'Steeplechase: add barrier work', 'Relay teams: baton exchange sessions begin', 'Mileage peaks here — highest volume of outdoor'] },
    { name: 'Competition', color: SIGNAL.color.coral, icon: '🏁',  pct: [0.57, 0.78], weeks: '9–11',       focus: 'Sharpen and race',
      guidance: ['Use conference meets for race sharpness', 'Not all-out every race — use them strategically', 'Relay strategy and lineups solidify now', 'Watch outdoor heat — adjust on hot days', 'Identify who is peaking and protect them'] },
    { name: 'Peak',        color: SIGNAL.color.violet, icon: '🎯',  pct: [0.78, 0.94], weeks: '12–13',      focus: 'Regional and state prep',
      guidance: ['Regional meet first — treat as first championship', 'Volume drops 30–40% going into regionals', 'State is the true championship — taper around it', 'Athletes who peaked too early struggle at state', 'Keep environment competitive but controlled'] },
    { name: 'Taper',       color: SIGNAL.color.cyan, icon: '🏆',  pct: [0.94, 1.00], weeks: 'Final week', focus: 'State championships',
      guidance: ['Strides and short accelerations only', 'Warm-up/warm-down non-negotiable on the track', 'Manage heat assignments and relay timing', 'Multi-event athletes: recovery between events', 'End of year — leave everything on the track'] },
  ],
};

// ── Generate a weekly volume plan from season dates + peak mileage ────────────
export function generateVolumeCurve(season, peakMiles, startingMiles = null) {
  const sport = season.sport || 'cross_country';
  const phases = SPORT_PHASES[sport] || SPORT_PHASES.cross_country;
  const start = new Date(season.seasonStart);
  const champ = new Date(season.championshipDate);
  const totalDays = (champ - start) / 86400000;
  if (totalDays <= 0) return {};

  const startDay = start.getDay();
  const firstMonday = new Date(start);
  firstMonday.setDate(start.getDate() - (startDay === 0 ? 6 : startDay - 1));
  firstMonday.setHours(0, 0, 0, 0);

  const plan = {};
  const mon = new Date(firstMonday);

  while (mon <= champ) {
    const midWeek = new Date(mon);
    midWeek.setDate(mon.getDate() + 3);
    const elapsed = (midWeek - start) / 86400000;
    const pct = Math.max(0, Math.min(elapsed / totalDays, 1));

    const phase = phases.find(p => pct >= p.pct[0] && pct < p.pct[1]) || phases[phases.length - 1];
    const phaseProgress = phase.pct[1] > phase.pct[0] ? (pct - phase.pct[0]) / (phase.pct[1] - phase.pct[0]) : 0;

    // Starting floor: use startingMiles if provided, otherwise default 60% of peak
    const startPct = startingMiles && startingMiles > 0
      ? Math.max(startingMiles / peakMiles, 0.30)
      : 0.60;

    let targetPct;
    const baseEnd = Math.max(0.85, startPct); // Don't ramp down if already above 85%
    if (phase.name.includes('Base') || phase.name === 'Summer Base') {
      // Ramp from starting % to 85% (or hold if already above)
      targetPct = startPct + phaseProgress * (baseEnd - startPct);
    } else if (phase.name === 'Build') {
      targetPct = baseEnd + phaseProgress * (1.0 - baseEnd);
    } else if (phase.name === 'Competition') {
      targetPct = 0.92 - phaseProgress * 0.02;
    } else if (phase.name === 'Peak') {
      targetPct = 0.90 - phaseProgress * 0.05;
    } else if (phase.name === 'Taper') {
      targetPct = 0.70 - phaseProgress * 0.10;
    } else {
      targetPct = 0.75;
    }

    const mondayISO = mon.toISOString().split('T')[0];
    let target = Math.round(peakMiles * targetPct);

    const prevMon = new Date(mon);
    prevMon.setDate(prevMon.getDate() - 7);
    const prevISO = prevMon.toISOString().split('T')[0];
    if (plan[prevISO] && target > Math.round(plan[prevISO] * 1.10)) {
      target = Math.round(plan[prevISO] * 1.10);
    }

    plan[mondayISO] = target;
    mon.setDate(mon.getDate() + 7);
  }

  return plan;
}

// ── Shared phase functions (used by dashboards) ───────────────────────────────

// Forgiving date parser for season fields. Handles:
//   - ISO strings (the format SeasonPlanner saves, via .toISOString())
//   - Firestore Timestamp objects (have .toDate())
//   - JS Date instances
//   - missing / invalid → null
// Centralized so getActiveSeason and getCompletedSeasons stay tolerant of any
// of these shapes appearing in the seasons array.
function toSeasonDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val) ? null : val;
  if (typeof val?.toDate === 'function') {
    try {
      const d = val.toDate();
      return isNaN(d) ? null : d;
    } catch { return null; }
  }
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d) ? null : d;
  }
  return null;
}

// Strip time-of-day so "season starts June 1" matches any time on June 1.
// Date pickers commonly save with the time-of-day at the moment the user tapped
// save, which would otherwise make a season "not started yet" for part of the
// start day. We compare at day granularity throughout the season helpers.
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function getActiveSeason(school) {
  if (!school) return null;
  const seasons = school.seasons || [];

  // Legacy fallback: old top-level seasonStart / championshipDate fields
  if (seasons.length === 0) {
    const start = toSeasonDate(school.seasonStart);
    const champ = toSeasonDate(school.championshipDate);
    if (start && champ) {
      return {
        sport: 'cross_country',
        name: `Cross Country ${start.getFullYear()}`,
        seasonStart: start.toISOString(),
        championshipDate: champ.toISOString(),
      };
    }
    return null;
  }

  const today = startOfDay(new Date());

  // Active = season has started AND championship hasn't passed.
  // A season with no championshipDate set yet is treated as ongoing (open-ended)
  // so coaches can plan a season before they know the exact championship date.
  // Day-level comparisons so a saved start of "June 1 at 3pm" counts as
  // started for the whole day of June 1.
  // Tiebreak: when multiple seasons match, prefer the most recently started.
  const active = seasons
    .filter(s => {
      const start = toSeasonDate(s.seasonStart);
      if (!start || today < startOfDay(start)) return false;
      const end = toSeasonDate(s.championshipDate);
      if (!end) return true; // ongoing — no end set yet
      return today <= startOfDay(end);
    })
    .sort((a, b) => {
      const aStart = toSeasonDate(a.seasonStart);
      const bStart = toSeasonDate(b.seasonStart);
      return (bStart?.getTime() || 0) - (aStart?.getTime() || 0);
    })[0];

  if (active) return active;

  // Nothing active — return the next upcoming season if any.
  const upcoming = [...seasons]
    .filter(s => {
      const start = toSeasonDate(s.seasonStart);
      return start && startOfDay(start) > today;
    })
    .sort((a, b) => {
      const aStart = toSeasonDate(a.seasonStart);
      const bStart = toSeasonDate(b.seasonStart);
      return (aStart?.getTime() || 0) - (bStart?.getTime() || 0);
    })[0];

  return upcoming || null;
}

export function getCompletedSeasons(school) {
  if (!school?.seasons?.length) return [];
  const today = startOfDay(new Date());
  return school.seasons
    .filter(s => {
      const end = toSeasonDate(s.championshipDate);
      return end && today > startOfDay(end);
    })
    .sort((a, b) => {
      const aEnd = toSeasonDate(a.championshipDate);
      const bEnd = toSeasonDate(b.championshipDate);
      return (bEnd?.getTime() || 0) - (aEnd?.getTime() || 0);
    });
}

export function getPhaseForSeason(season, referenceDate) {
  if (!season) {
    return { name: 'Pre-Season', color: '#607d8b', icon: '📋', tip: 'No active season. Set up your season plan.', weekNum: null, daysToChamp: null, isPreSeason: true, sport: 'cross_country', phases: SPORT_PHASES.cross_country };
  }
  const sport  = season.sport || 'cross_country';
  const phases = SPORT_PHASES[sport] || SPORT_PHASES.cross_country;
  const sportDef = SPORTS[sport];

  if (!season.seasonStart || !season.championshipDate) {
    return { name: 'Pre-Season', color: sportDef?.color || '#607d8b', icon: sportDef?.icon || '📋', tip: 'Set season dates to activate phase tracking.', weekNum: null, daysToChamp: null, isPreSeason: true, sport, phases };
  }

  // Day-level math. `referenceDate` lets callers compute the phase for a
  // specific week (e.g. WeeklyPlanner navigating to a future week) rather
  // than always anchoring to today.
  const ref      = referenceDate ? new Date(referenceDate) : new Date();
  const refDay   = startOfDay(ref);
  const startDay = startOfDay(new Date(season.seasonStart));
  const champDay = startOfDay(new Date(season.championshipDate));
  const totalDays   = Math.round((champDay - startDay) / 86400000);
  const elapsed     = Math.round((refDay - startDay) / 86400000);
  const daysToChamp = Math.round((champDay - refDay) / 86400000);
  const weekNum     = Math.max(1, Math.floor(elapsed / 7) + 1);

  if (elapsed < 0) {
    const daysUntil = -elapsed;
    return { name: 'Pre-Season', color: sportDef?.color || '#607d8b', icon: sportDef?.icon || '📋', tip: `${sportDef?.label} starts in ${daysUntil} days.`, weekNum: null, daysToChamp, isPreSeason: true, sport, phases };
  }

  const pct   = Math.min(elapsed / totalDays, 1);
  const phase = phases.find(p => pct >= p.pct[0] && pct < p.pct[1]) || phases[phases.length - 1];
  return { ...phase, weekNum, daysToChamp, isPreSeason: false, sport, phases };
}

// ── Compact phase pill component (used on dashboards) ────────────────────────
export function PhasePill({ school, onPress }) {
  const [expanded, setExpanded] = useState(false);
  const activeSeason = getActiveSeason(school);
  const phase = getPhaseForSeason(activeSeason);
  const sport = SPORTS[phase.sport];

  return (
    <TouchableOpacity
      style={[styles.pill, { backgroundColor: `${phase.color}18`, borderColor: `${phase.color}40` }]}
      onPress={() => setExpanded(e => !e)}
      activeOpacity={0.8}
    >
      {/* Collapsed row — always visible */}
      <View style={styles.pillRow}>
        <View style={[styles.pillDot, { backgroundColor: phase.color }]} />
        <Text style={[styles.pillText, { color: phase.color }]}>
          {phase.icon} {sport?.label || 'Season'} · {phase.name}
          {phase.weekNum ? ` · Wk ${phase.weekNum}` : ''}
          {phase.daysToChamp !== null ? `  🏆 ${phase.daysToChamp}d` : ''}
        </Text>
        <Text style={[styles.pillChevron, { color: phase.color }]}>
          {expanded ? '▲' : '▼'}
        </Text>
      </View>

      {/* Expanded detail */}
      {expanded && (
        <View style={styles.pillExpanded}>
          <Text style={[styles.pillFocus, { color: phase.color }]}>{phase.focus}</Text>
          {(phase.guidance || []).slice(0, 3).map((tip, i) => (
            <Text key={i} style={styles.pillTip}>• {tip}</Text>
          ))}
          {onPress && (
            <TouchableOpacity
              style={[styles.pillPlannerBtn, { borderColor: phase.color }]}
              onPress={(e) => { e.stopPropagation?.(); onPress(); }}
            >
              <Text style={[styles.pillPlannerBtnText, { color: phase.color }]}>
                Manage season plan ›
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── SeasonPlanner screen (Signal redesign) ────────────────────────────────────
export default function SeasonPlanner({ school, schoolId, onClose, onSaved }) {

  // Helper to convert any date format to ISO string
  const toISO = (val) => {
    if (!val) return null;
    if (typeof val === 'string') return val;
    if (val?.toDate) return val.toDate().toISOString(); // Firestore Timestamp
    if (val instanceof Date) return val.toISOString();
    return null;
  };

  // Migrate legacy seasonStart/championshipDate fields into seasons array
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

  const [seasons,    setSeasons]    = useState(initialSeasons());
  const [editingIdx, setEditingIdx] = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [showForm,   setShowForm]   = useState(false);

  const [sport,            setSport]            = useState('cross_country');
  const [name,             setName]             = useState('');
  const [seasonStart,      setSeasonStart]      = useState(null);
  const [championshipDate, setChampionshipDate] = useState(null);

  const openAdd = () => {
    setSport('cross_country'); setName('');
    setSeasonStart(null); setChampionshipDate(null);
    setEditingIdx(null); setShowForm(true);
  };

  const openEdit = (idx) => {
    const s = seasons[idx];
    setSport(s.sport); setName(s.name);
    setSeasonStart(s.seasonStart ? new Date(s.seasonStart) : null);
    setChampionshipDate(s.championshipDate ? new Date(s.championshipDate) : null);
    setEditingIdx(idx); setShowForm(true);
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
    const updated = [...seasons];
    if (editingIdx !== null) { updated[editingIdx] = newSeason; } else { updated.push(newSeason); }
    updated.sort((a, b) => new Date(a.seasonStart) - new Date(b.seasonStart));
    setSeasons(updated);

    // Save immediately to Firestore — no separate "Save season plan" step needed
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
        try {
          await updateDoc(doc(db, 'schools', schoolId), { seasons: updated });
          onSaved && onSaved({ seasons: updated });
        } catch { Alert.alert('Error', 'Could not delete. Please try again.'); }
      }},
    ]);
  };

  const activeSeason = getActiveSeason({ seasons });
  const activePhase  = activeSeason ? getPhaseForSeason(activeSeason) : getPhaseForSeason(null);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={SIGNAL.color.inkSoft} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Season planner</Text>
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
            {activePhase.icon} Currently in {activePhase.name} phase · Week {activePhase.weekNum}
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
                      selected && { backgroundColor: `${s.color}10`, borderColor: s.color, borderWidth: 2 }
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
            {/* Your seasons */}
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
              <View style={{ gap: 8 }}>
                {seasons.map((s, idx) => {
                  const sportDef = SPORTS[s.sport] || SPORTS.cross_country;
                  const isActive = activeSeason === s;
                  const phase = getPhaseForSeason(s);
                  const start = new Date(s.seasonStart);
                  const champ = new Date(s.championshipDate);
                  const today = startOfDay(new Date());
                  const champDay = startOfDay(champ);
                  const daysToChamp = Math.round((champDay - today) / 86400000);

                  return (
                    <View
                      key={idx}
                      style={[
                        styles.seasonCard,
                        isActive && { borderColor: sportDef.color, borderWidth: 2 }
                      ]}
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
                          {isActive && (
                            <View style={[styles.activePill, { backgroundColor: `${sportDef.color}18` }]}>
                              <Text style={[styles.activePillText, { color: sportDef.color }]}>ACTIVE</Text>
                            </View>
                          )}
                        </View>

                        {isActive && !phase.isPreSeason && (
                          <View style={styles.metaRow}>
                            <View style={[styles.phaseChip, { backgroundColor: `${phase.color}18` }]}>
                              <View style={[styles.phaseDot, { backgroundColor: phase.color }]} />
                              <Text style={[styles.phaseChipText, { color: phase.color }]}>
                                {phase.name} · Wk <Text style={styles.mono}>{phase.weekNum}</Text>
                              </Text>
                            </View>
                            {daysToChamp >= 0 && (
                              <Text style={styles.countdownText}>
                                🏆 <Text style={styles.mono}>{daysToChamp}d</Text> to champs
                              </Text>
                            )}
                          </View>
                        )}

                        {!isActive && daysToChamp > 0 && (
                          <View style={styles.metaRow}>
                            <Text style={styles.countdownText}>
                              Starts in <Text style={styles.mono}>
                                {Math.max(0, Math.round((startOfDay(start) - today) / 86400000))}d
                              </Text>
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
                    </View>
                  );
                })}
              </View>
            )}

            {/* Phase guide */}
            {activePhase && (
              <>
                <Text style={[styles.eyebrowSection, { marginTop: 24 }]}>
                  {SPORTS[activePhase.sport]?.label || 'Season'} phase guide
                </Text>
                <View style={{ gap: 10 }}>
                  {(activePhase.phases || []).map(phase => {
                    const isCurrent = !activePhase.isPreSeason && phase.name === activePhase.name;
                    return (
                      <View key={phase.name} style={[styles.phaseCard, { borderLeftColor: phase.color }]}>
                        <View style={[styles.phaseHeader, { backgroundColor: `${phase.color}10` }]}>
                          <Text style={styles.phaseIcon}>{phase.icon}</Text>
                          <View style={styles.phaseHeaderText}>
                            <View style={styles.phaseTitleRow}>
                              <Text style={styles.phaseName}>{phase.name} Phase</Text>
                              {isCurrent && (
                                <Text style={[styles.phaseNowTag, { color: phase.color }]}>
                                  ● NOW
                                </Text>
                              )}
                            </View>
                            <Text style={styles.phaseWeeks}>
                              Weeks <Text style={styles.mono}>{phase.weeks}</Text>
                            </Text>
                          </View>
                        </View>
                        <View style={styles.phaseBody}>
                          <Text style={styles.phaseFocus}>{phase.focus}</Text>
                          {phase.guidance.map((tip, i) => (
                            <View key={i} style={styles.tipRow}>
                              <Text style={[styles.tipDot, { color: phase.color }]}>•</Text>
                              <Text style={styles.tipText}>{tip}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {/* Wisdom card with gradient */}
            <LinearGradient
              colors={[SIGNAL.color.ink, SIGNAL.color.indigo]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.wisdomCard}
            >
              <Text style={styles.wisdomTitle}>Year-round development</Text>
              <Text style={styles.wisdomQuote}>
                "The miles your athletes run in June directly affect how they race in November. Indoor fitness carries into outdoor. Outdoor base carries into the next XC season. The best programs manage all of it intentionally."
              </Text>
            </LinearGradient>
          </>
        )}
        <View style={{ height: 40 }} />
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

  // ── Eyebrows / section labels ─────────────────────────────────────────────
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

  // ── Phase guide cards ─────────────────────────────────────────────────────
  phaseCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    overflow: 'hidden',
    borderLeftWidth: 5,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: SIGNAL.color.line,
    borderRightColor: SIGNAL.color.line,
    borderBottomColor: SIGNAL.color.line,
  },
  phaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
  },
  phaseIcon: { fontSize: 20 },
  phaseHeaderText: { flex: 1 },
  phaseTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  phaseName: {
    fontSize: 14,
    fontFamily: SIGNAL.font.bodyBold,
    color: SIGNAL.color.ink,
  },
  phaseNowTag: {
    fontSize: 10,
    fontFamily: SIGNAL.font.bodyBold,
    letterSpacing: 0.4,
  },
  phaseWeeks: {
    fontSize: 11,
    color: SIGNAL.color.mute,
    marginTop: 2,
    fontFamily: SIGNAL.font.bodyMedium,
  },
  phaseBody: { padding: 14, paddingTop: 12 },
  phaseFocus: {
    fontSize: 13.5,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.inkSoft,
    marginBottom: 10,
    lineHeight: 19,
  },
  tipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  tipDot: {
    fontSize: 16,
    lineHeight: 20,
    fontFamily: SIGNAL.font.bodyBold,
  },
  tipText: {
    flex: 1,
    fontSize: 12.5,
    color: SIGNAL.color.mute,
    lineHeight: 18,
    fontFamily: SIGNAL.font.body,
  },

  // ── Wisdom card ───────────────────────────────────────────────────────────
  wisdomCard: {
    marginTop: 18,
    borderRadius: SIGNAL.radius.card,
    padding: 20,
  },
  wisdomTitle: {
    fontSize: 11,
    fontFamily: SIGNAL.font.bodyBold,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 10,
    letterSpacing: 1.43,
    textTransform: 'uppercase',
  },
  wisdomQuote: {
    fontSize: 14,
    color: SIGNAL.color.white,
    lineHeight: 22,
    fontFamily: SIGNAL.font.body,
  },

  // ── Mono helper ───────────────────────────────────────────────────────────
  mono: {
    fontFamily: SIGNAL.font.mono,
  },

  // ── PhasePill styles (preserved for shared component) ─────────────────────
  pill: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pillText: {
    flex: 1,
    fontSize: 12,
    fontFamily: SIGNAL.font.bodySemi,
  },
  pillChevron: {
    fontSize: 10,
    fontFamily: SIGNAL.font.bodyBold,
  },
  pillExpanded: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  pillFocus: {
    fontSize: 13,
    fontFamily: SIGNAL.font.bodyBold,
    marginBottom: 6,
  },
  pillTip: {
    fontSize: 12,
    color: SIGNAL.color.mute,
    lineHeight: 18,
    marginBottom: 3,
    fontFamily: SIGNAL.font.body,
  },
  pillPlannerBtn: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingVertical: 8,
    alignItems: 'center',
  },
  pillPlannerBtnText: {
    fontSize: 13,
    fontFamily: SIGNAL.font.bodyBold,
  },
});
