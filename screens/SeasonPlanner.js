import { Ionicons } from '@expo/vector-icons';
import { doc, updateDoc } from 'firebase/firestore';
import React, { useState } from 'react';
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
import { BRAND, BRAND_DARK } from '../constants/design';
import { db } from '../firebaseConfig';
import DatePickerField from './DatePickerField';

// ── Sport definitions (3 sports) ─────────────────────────────────────────────
export const SPORTS = {
  cross_country: {
    key: 'cross_country', label: 'Cross Country', icon: '🏔️', color: '#2e7d32',
    months: 'Jun – Nov', description: 'Summer base through state championships',
    events: ['5K', 'Team scoring', 'State meet'],
  },
  indoor_track: {
    key: 'indoor_track', label: 'Indoor Track', icon: '🏟️', color: '#1565c0',
    months: 'Dec – Mar', description: 'Mile, 1500m, 3000m, DMR',
    events: ['Mile', '1500m', '3000m', '5K', 'DMR'],
  },
  outdoor_track: {
    key: 'outdoor_track', label: 'Outdoor Track', icon: '🏃', color: '#6a1b9a',
    months: 'Mar – Jun', description: '1500m, 3200m, steeplechase, relays',
    events: ['1500m', 'Mile', '3200m', 'Steeplechase', 'Relays'],
  },
};

// ── Phase guidance per sport ──────────────────────────────────────────────────
export const SPORT_PHASES = {
  cross_country: [
    { name: 'Summer Base',    color: '#e65100', icon: '☀️',  pct: [0.00, 0.20], weeks: '1–6',        focus: 'Build the foundation — voluntary, culture-first',
      guidance: ['Every mile now is worth two miles in September', 'Group runs build team culture before school starts', 'Keep it voluntary but create social incentives', 'Log every run — start the habit now', 'Seniors: set the example. Freshmen: learn the culture.'] },
    { name: 'Pre-Season Base',color: '#4caf50', icon: '🏗️', pct: [0.20, 0.40], weeks: '7–10',       focus: 'Official practice — build the aerobic pyramid',
      guidance: ['High volume, low intensity — stay in Zone 1–2', 'Never increase weekly mileage more than 10%', '"When in doubt, do less" — Coach Jay Johnson', 'Post-run strength and mobility every practice', 'Team time trials: assess where everyone is starting'] },
    { name: 'Build',          color: '#ff9800', icon: '⚡',  pct: [0.40, 0.62], weeks: '11–14',      focus: 'Introduce quality and speed',
      guidance: ['Add one tempo run per week — stay in Zone 3', 'Mileage holds steady, intensity increases', 'Begin tracking lactate threshold pace', 'Group training becomes more competitive', 'Monitor HR — easy days must stay easy'] },
    { name: 'Competition',    color: '#f44336', icon: '🏁',  pct: [0.62, 0.80], weeks: '15–17',      focus: 'Race-specific prep — pack work is everything',
      guidance: ['Volume drops 20–30% from peak', 'Pack work is the #1 priority', 'Monitor 1–5 compression weekly', 'Use early races as training efforts', 'Championship mindset begins now'] },
    { name: 'Peak',           color: '#9c27b0', icon: '🎯',  pct: [0.80, 0.94], weeks: '18–19',      focus: 'Sharpen for championships',
      guidance: ['Volume drops 40–50% — short, sharp workouts only', 'Every workout: build confidence', 'Legs should feel fresh — trust the fitness', 'Mental prep is as important as physical', 'Confidence built in October wins championships'] },
    { name: 'Taper',          color: '#2196f3', icon: '🏆',  pct: [0.94, 1.00], weeks: 'Final week', focus: 'Rest and trust the training',
      guidance: ['Easy runs only — no hard workouts', 'Sleep is the #1 performance tool this week', 'Review race strategy with every athlete', '"The hay is in the barn" — trust what you built', 'This is what all the work was for'] },
  ],
  indoor_track: [
    { name: 'Base',        color: '#4caf50', icon: '🏗️', pct: [0.00, 0.28], weeks: '1–3',        focus: 'Carry XC fitness, add speed',
      guidance: ['Bridge from cross country — do not start over', 'Introduce short speed sessions — 200s and 400s', 'Focus on turnover and form on the track', 'Keep mileage moderate — indoor is shorter than XC', 'Great time for drills and strength work'] },
    { name: 'Build',       color: '#ff9800', icon: '⚡',  pct: [0.28, 0.57], weeks: '4–7',        focus: 'Race pace development',
      guidance: ['Work from 5K pace down to mile pace progressively', 'Structured interval sessions on the track', 'Balance speed and endurance — indoor needs both', 'Begin event-specific tempo work', 'Monitor leg fatigue closely'] },
    { name: 'Competition', color: '#f44336', icon: '🏁',  pct: [0.57, 0.78], weeks: '8–10',       focus: 'Event-specific sharpening',
      guidance: ['Use invitationals as tune-ups, not championship efforts', 'Dial in race tactics — positioning, kick timing', 'Milers: work on closing speed in final 200m', 'Practice relay exchanges for DMR', 'Lactate threshold work continues'] },
    { name: 'Peak',        color: '#9c27b0', icon: '🎯',  pct: [0.78, 0.94], weeks: '11–12',      focus: 'Championship sharpening',
      guidance: ['Volume drops significantly — quality over quantity', 'Simulate championship conditions', 'Athletes should feel fast and confident', 'Final speed sessions 5–7 days out', 'Trust the training — fitness is already there'] },
    { name: 'Taper',       color: '#2196f3', icon: '🏆',  pct: [0.94, 1.00], weeks: 'Final week', focus: 'Championship week',
      guidance: ['Short, sharp strides only', 'Warm-up and cool-down are critical on the track', 'Review heat assignments and race strategy', 'Manage athlete energy — excitement masks fatigue', 'Championship environment: stay warm, stay focused'] },
  ],
  outdoor_track: [
    { name: 'Base',        color: '#4caf50', icon: '🏗️', pct: [0.00, 0.28], weeks: '1–3',        focus: 'Bridge from indoor, rebuild base',
      guidance: ['Use indoor fitness as the starting point', 'Transition back to higher mileage', 'Introduce outdoor-specific work — hills, varied surfaces', 'Start periodizing toward outdoor championship', 'Address any technique issues from indoor'] },
    { name: 'Build',       color: '#ff9800', icon: '⚡',  pct: [0.28, 0.57], weeks: '4–8',        focus: 'Event-specific development',
      guidance: ['3200m runners: longer tempo reps', '1500m runners: balance speed and endurance', 'Steeplechase: add barrier work', 'Relay teams: baton exchange sessions begin', 'Mileage peaks here — highest volume of outdoor'] },
    { name: 'Competition', color: '#f44336', icon: '🏁',  pct: [0.57, 0.78], weeks: '9–11',       focus: 'Sharpen and race',
      guidance: ['Use conference meets for race sharpness', 'Not all-out every race — use them strategically', 'Relay strategy and lineups solidify now', 'Watch outdoor heat — adjust on hot days', 'Identify who is peaking and protect them'] },
    { name: 'Peak',        color: '#9c27b0', icon: '🎯',  pct: [0.78, 0.94], weeks: '12–13',      focus: 'Regional and state prep',
      guidance: ['Regional meet first — treat as first championship', 'Volume drops 30–40% going into regionals', 'State is the true championship — taper around it', 'Athletes who peaked too early struggle at state', 'Keep environment competitive but controlled'] },
    { name: 'Taper',       color: '#2196f3', icon: '🏆',  pct: [0.94, 1.00], weeks: 'Final week', focus: 'State championships',
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
export function getActiveSeason(school) {
  if (!school) return null;
  const seasons = school.seasons || [];

  // Helper to safely convert any date format
  const toISO = (val) => {
    if (!val) return null;
    if (typeof val === 'string') return val;
    if (val?.toDate) return val.toDate().toISOString();
    if (val instanceof Date) return val.toISOString();
    return null;
  };

  // Legacy fallback: old seasonStart / championshipDate fields
  if (seasons.length === 0) {
    const start = toISO(school.seasonStart);
    const champ = toISO(school.championshipDate);
    if (start && champ) {
      return {
        sport: 'cross_country',
        name: `Cross Country ${new Date(start).getFullYear()}`,
        seasonStart: start,
        championshipDate: champ,
      };
    }
    return null;
  }

  const now = new Date();
  const active = seasons.find(s => {
    const start = new Date(s.seasonStart);
    const end   = new Date(new Date(s.championshipDate).getTime() + 7 * 86400000);
    return now >= start && now <= end;
  });
  if (!active) {
    const upcoming = [...seasons]
      .filter(s => new Date(s.seasonStart) > now)
      .sort((a, b) => new Date(a.seasonStart) - new Date(b.seasonStart))[0];
    return upcoming || null;
  }
  return active;
}

export function getPhaseForSeason(season) {
  if (!season) {
    return { name: 'Pre-Season', color: '#607d8b', icon: '📋', tip: 'No active season. Set up your season plan.', weekNum: null, daysToChamp: null, isPreSeason: true, sport: 'cross_country', phases: SPORT_PHASES.cross_country };
  }
  const sport  = season.sport || 'cross_country';
  const phases = SPORT_PHASES[sport] || SPORT_PHASES.cross_country;
  const sportDef = SPORTS[sport];

  if (!season.seasonStart || !season.championshipDate) {
    return { name: 'Pre-Season', color: sportDef?.color || '#607d8b', icon: sportDef?.icon || '📋', tip: 'Set season dates to activate phase tracking.', weekNum: null, daysToChamp: null, isPreSeason: true, sport, phases };
  }

  const now   = new Date();
  const start = new Date(season.seasonStart);
  const champ = new Date(season.championshipDate);
  const totalDays   = (champ - start) / 86400000;
  const elapsed     = (now - start) / 86400000;
  const daysToChamp = Math.ceil((champ - now) / 86400000);
  const weekNum     = Math.max(1, Math.floor(elapsed / 7) + 1);

  if (elapsed < 0) {
    const daysUntil = Math.ceil(-elapsed);
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

// ── SeasonPlanner screen (deprecated — use ManageSeasons instead) ─────────────
// Kept only for PhasePill component and styles. Default export preserved to
// avoid breaking any dynamic imports, but this screen is no longer rendered.
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
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={BRAND_DARK} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Season Planner</Text>
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
                <Text style={styles.saveSeasonBtnText}>Save ✓</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Your seasons</Text>
                <TouchableOpacity style={[styles.addBtn, { backgroundColor: activePhase?.color || BRAND }]} onPress={openAdd}>
                  <Text style={styles.addBtnText}>+ Add</Text>
                </TouchableOpacity>
              </View>

              {seasons.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>No seasons set up yet</Text>
                  <Text style={styles.emptySubtitle}>Start with Cross Country — set June as your start date to include summer base building.</Text>
                  <TouchableOpacity style={[styles.addBtn, { backgroundColor: BRAND, paddingHorizontal: 20 }]} onPress={openAdd}>
                    <Text style={styles.addBtnText}>+ Add first season</Text>
                  </TouchableOpacity>
                </View>
              ) : seasons.map((s, idx) => {
                const sportDef = SPORTS[s.sport] || SPORTS.cross_country;
                const isActive = activeSeason === s;
                const phase = getPhaseForSeason(s);
                const start = new Date(s.seasonStart);
                const champ = new Date(s.championshipDate);
                return (
                  <View key={idx} style={[styles.seasonCard, isActive && { borderColor: sportDef.color, borderWidth: 2 }]}>
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
                        {isActive && (
                          <View style={[styles.activePill, { backgroundColor: sportDef.color }]}>
                            <Text style={styles.activePillText}>Active</Text>
                          </View>
                        )}
                      </View>
                      {isActive && !phase.isPreSeason && (
                        <Text style={[styles.phaseTag, { color: phase.color }]}>
                          {phase.icon} {phase.name} · Wk {phase.weekNum} · {phase.daysToChamp}d to champs
                        </Text>
                      )}
                      <View style={styles.seasonActions}>
                        <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(idx)}>
                          <Text style={styles.editBtnText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(idx)}>
                          <Text style={styles.deleteBtnText}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Phase guide */}
            {activePhase && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {SPORTS[activePhase.sport]?.label || 'Season'} phase guide
                </Text>
                {(activePhase.phases || []).map(phase => (
                  <View key={phase.name} style={[styles.phaseCard, { borderLeftColor: phase.color }]}>
                    <View style={[styles.phaseHeader, { backgroundColor: phase.color }]}>
                      <Text style={styles.phaseIcon}>{phase.icon}</Text>
                      <View style={styles.phaseHeaderText}>
                        <Text style={styles.phaseName}>{phase.name} Phase</Text>
                        <Text style={styles.phaseWeeks}>Weeks {phase.weeks}</Text>
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
                ))}
              </View>
            )}

            <View style={styles.wisdomCard}>
              <Text style={styles.wisdomTitle}>Year-round development</Text>
              <Text style={styles.wisdomQuote}>
                "The miles your athletes run in June directly affect how they race in November. Indoor fitness carries into outdoor. Outdoor base carries into the next XC season. The best programs manage all of it intentionally."
              </Text>
            </View>
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: '#F5F6FA' },
  header:            { backgroundColor: '#fff', paddingTop: Platform.OS === 'ios' ? 56 : 32, paddingBottom: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn:           { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
  backText:          { color: '#111827', fontSize: 15, fontWeight: '600' },
  headerTitle:       { fontSize: 20, fontWeight: '700', color: '#111827' },
  activeBadge:       { marginHorizontal: 16, marginTop: 10, borderRadius: 10, padding: 8, alignItems: 'center' },
  activeBadgeText:   { fontSize: 13, fontWeight: '700' },
  scroll:            { flex: 1 },
  section:           { padding: 16 },
  sectionHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle:      { fontSize: 18, fontWeight: '700', color: '#111827' },
  addBtn:            { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText:        { color: '#fff', fontSize: 14, fontWeight: '700' },
  emptyCard:         { backgroundColor: '#fff', borderRadius: 14, padding: 24, alignItems: 'center', gap: 12 },
  emptyTitle:        { fontSize: 17, fontWeight: '700', color: '#111827' },
  emptySubtitle:     { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  seasonCard:        { backgroundColor: '#fff', borderRadius: 14, marginBottom: 12, overflow: 'hidden', flexDirection: 'row', borderWidth: 1, borderColor: '#E5E7EB' },
  seasonStripe:      { width: 6 },
  seasonBody:        { flex: 1, padding: 14 },
  seasonTop:         { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  seasonIcon:        { fontSize: 24 },
  seasonInfo:        { flex: 1 },
  seasonName:        { fontSize: 15, fontWeight: '700', color: '#111827' },
  seasonDates:       { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  activePill:        { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  activePillText:    { color: '#fff', fontSize: 12, fontWeight: '700' },
  phaseTag:          { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  seasonActions:     { flexDirection: 'row', gap: 8, marginTop: 8 },
  editBtn:           { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 7, backgroundColor: '#F5F6FA' },
  editBtnText:       { fontSize: 13, fontWeight: '600', color: '#111827' },
  deleteBtn:         { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 7, backgroundColor: '#fee2e2' },
  deleteBtnText:     { fontSize: 13, fontWeight: '600', color: '#dc2626' },
  formCard:          { margin: 16, backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  formTitle:         { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 16 },
  formLabel:         { fontSize: 14, fontWeight: '600', color: '#6B7280', marginBottom: 8, marginTop: 4 },
  sportGrid:         { gap: 8, marginBottom: 16 },
  sportBtn:          { borderRadius: 12, padding: 14, backgroundColor: '#F5F6FA', borderWidth: 1.5, borderColor: '#E5E7EB' },
  sportIcon:         { fontSize: 22, marginBottom: 4 },
  sportLabel:        { fontSize: 14, fontWeight: '700', color: '#111827' },
  sportMonths:       { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  sportDesc:         { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  nameInput:         { backgroundColor: '#F5F6FA', borderRadius: 10, padding: 14, fontSize: 15, marginBottom: 4, borderWidth: 1, borderColor: '#E5E7EB', color: '#111827' },
  weeksBadge:        { borderRadius: 10, borderWidth: 1.5, padding: 10, alignItems: 'center', marginVertical: 12 },
  weeksText:         { fontSize: 14, fontWeight: '600' },
  formBtns:          { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn:         { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center', backgroundColor: '#fee2e2' },
  cancelBtnText:     { fontSize: 15, fontWeight: '600', color: '#dc2626' },
  saveSeasonBtn:     { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center' },
  saveSeasonBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  phaseCard:         { backgroundColor: '#fff', borderRadius: 14, marginBottom: 12, overflow: 'hidden', borderLeftWidth: 5 },
  phaseHeader:       { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  phaseIcon:         { fontSize: 22 },
  phaseHeaderText:   { flex: 1 },
  phaseName:         { fontSize: 15, fontWeight: '700', color: '#fff' },
  phaseWeeks:        { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  phaseBody:         { padding: 14 },
  phaseFocus:        { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 10 },
  tipRow:            { flexDirection: 'row', gap: 8, marginBottom: 6 },
  tipDot:            { fontSize: 16, lineHeight: 20, fontWeight: 'bold' },
  tipText:           { flex: 1, fontSize: 13, color: '#6B7280', lineHeight: 20 },
  wisdomCard:        { marginHorizontal: 16, marginBottom: 16, backgroundColor: '#1a237e', borderRadius: 14, padding: 20 },
  wisdomTitle:       { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.6)', marginBottom: 10, letterSpacing: 1, textTransform: 'uppercase' },
  wisdomQuote:       { fontSize: 14, color: '#fff', lineHeight: 22, fontStyle: 'italic' },
  saveRow:           { paddingHorizontal: 16, marginBottom: 8 },
  saveAllBtn:        { borderRadius: 12, padding: 18, alignItems: 'center' },
  saveAllBtnText:    { color: '#fff', fontSize: 17, fontWeight: 'bold' },

  // PhasePill styles
  pill:              { marginHorizontal: 16, marginTop: 10, marginBottom: 4, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  pillRow:           { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pillDot:           { width: 8, height: 8, borderRadius: 4 },
  pillText:          { flex: 1, fontSize: 12, fontWeight: '600' },
  pillChevron:       { fontSize: 10, fontWeight: '700' },
  pillExpanded:      { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' },
  pillFocus:         { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  pillTip:           { fontSize: 12, color: '#6B7280', lineHeight: 18, marginBottom: 3 },
  pillPlannerBtn:    { marginTop: 8, borderRadius: 8, borderWidth: 1.5, padding: 8, alignItems: 'center' },
  pillPlannerBtnText:{ fontSize: 13, fontWeight: '700' },
});