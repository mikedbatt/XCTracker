import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BRAND, SIGNAL } from '../constants/design';
import { auth, db } from '../firebaseConfig';
import { getActiveSeason, getPhaseForSeason, generateVolumeCurve } from './SeasonPlanner';
import { formatTime, calcPace, formatPace } from '../utils/raceUtils';
import { PACE_ZONES, calcPaceZoneBreakdown, calcPace8020 } from '../utils/vdotUtils';
import RunDetailModal from './RunDetailModal';
import DatePickerField from './DatePickerField';
import { getMondayISO, getRunDate, groupRunsByWeek, toLocalISODate } from '../utils/dateUtils';
import { computeOvertraining } from '../utils/overtrainingUtils';
import { confirmDestructive } from '../utils/confirmDialog';


// ── Component ────────────────────────────────────────────────────────────────

export default function AthleteDetailScreen({ athlete, school, groups, onBack, parentMode = false }) {
  const [loading, setLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState(null);
  const [selectedRun, setSelectedRun] = useState(null);
  const [runDetailVisible, setRunDetailVisible] = useState(false);

  // Data stores
  const [allRuns, setAllRuns] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [raceResults, setRaceResults] = useState([]);
  const [races, setRaces] = useState([]);
  const [raceMeets, setRaceMeets] = useState([]);
  const [athleteGroup, setAthleteGroup] = useState(null);
  const [attendance, setAttendance] = useState([]);

  // Workout override (coach modifies an injured athlete's plan)
  const [override, setOverride] = useState(null);
  const [modifyVisible, setModifyVisible] = useState(false);
  const [ovType, setOvType] = useState('cross_training');
  const [ovStart, setOvStart] = useState(new Date());
  const [ovDays, setOvDays] = useState(7);
  const [ovNote, setOvNote] = useState('');
  const [savingOverride, setSavingOverride] = useState(false);

  const primaryColor = school?.primaryColor || BRAND;

  useEffect(() => { loadData(); loadOverride(); }, []);

  const loadOverride = async () => {
    try {
      const snap = await getDoc(doc(db, 'workoutOverrides', athlete.id));
      if (snap.exists()) {
        const o = snap.data();
        // Only treat as active if it hasn't ended yet.
        const today = toLocalISODate(new Date());
        setOverride(o.endDate && o.endDate >= today ? o : null);
      } else {
        setOverride(null);
      }
    } catch (e) { console.warn('Load override failed:', e); }
  };

  const saveOverride = async () => {
    setSavingOverride(true);
    try {
      const startISO = toLocalISODate(ovStart);
      const end = new Date(ovStart); end.setDate(end.getDate() + (ovDays - 1));
      const endISO = toLocalISODate(end);
      const data = {
        athleteId: athlete.id,
        schoolId: athlete.schoolId || school?.id || null,
        type: ovType,
        startDate: startISO,
        endDate: endISO,
        note: ovNote.trim() || null,
        setBy: auth.currentUser?.uid || null,
        setByName: null,
        createdAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'workoutOverrides', athlete.id), data);
      setOverride(data);
      setModifyVisible(false);
      setOvNote('');
      Alert.alert('Workout modified',
        `${athlete.firstName} is set to ${ovType === 'rest' ? 'rest' : 'cross-training'} through ${endISO}.`);
    } catch (e) {
      console.warn('Save override failed:', e);
      Alert.alert('Could not save', `The modification did not save: ${e?.message || e}. Please try again.`);
    }
    setSavingOverride(false);
  };

  const clearOverride = () => {
    confirmDestructive({
      title: 'Clear modification?',
      message: 'This athlete will go back to their regular group workouts.',
      confirmLabel: 'Clear',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'workoutOverrides', athlete.id));
          setOverride(null);
        } catch (e) { console.warn('Clear override failed:', e); }
      },
    });
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const schoolId = athlete.schoolId || school?.id;

      const [runsSnap, checkinsSnap, resultsSnap, racesSnap, meetsSnap, attendanceSnap] = await Promise.all([
        getDocs(query(collection(db, 'runs'), where('userId', '==', athlete.id), orderBy('date', 'desc'))),
        getDocs(query(collection(db, 'checkins'), where('userId', '==', athlete.id)))
          .catch(() => ({ docs: [] })),
        getDocs(query(collection(db, 'raceResults'), where('athleteId', '==', athlete.id)))
          .catch(() => ({ docs: [] })),
        schoolId
          ? getDocs(query(collection(db, 'races'), where('schoolId', '==', schoolId))).catch(() => ({ docs: [] }))
          : { docs: [] },
        schoolId
          ? getDocs(query(collection(db, 'raceMeets'), where('schoolId', '==', schoolId))).catch(() => ({ docs: [] }))
          : { docs: [] },
        getDocs(query(collection(db, 'attendance'), where('athleteId', '==', athlete.id)))
          .catch(() => ({ docs: [] })),
      ]);

      setAllRuns(runsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // Sort checkins client-side (avoids composite index requirement)
      const getCheckinDate = (c) => c.date?.toDate ? c.date.toDate() : new Date(c.date);
      const sortedCheckins = checkinsSnap.docs
        .map(d => d.data())
        .sort((a, b) => getCheckinDate(b) - getCheckinDate(a));
      setCheckins(sortedCheckins);

      setRaceResults(resultsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setRaces(racesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setRaceMeets(meetsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setAttendance(attendanceSnap.docs.map(d => d.data()));

      // Resolve athlete's group
      if (athlete.groupId && groups?.length > 0) {
        setAthleteGroup(groups.find(g => g.id === athlete.groupId) || null);
      }
    } catch (e) { console.error('AthleteDetail load error:', e); }
    setLoading(false);
  };

  const toggle = (section) => setExpandedSection(expandedSection === section ? null : section);

  // ── Date helpers ──
  const now = new Date();
  const weekStart = new Date(now);
  const dayOfWeek = now.getDay();
  weekStart.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // ── Basic stats ──
  const weekRuns = allRuns.filter(r => { const d = r.date?.toDate?.(); return d && d >= weekStart; });
  const monthRuns = allRuns.filter(r => { const d = r.date?.toDate?.(); return d && d >= monthStart; });
  const weekMiles = Math.round(weekRuns.reduce((s, r) => s + (r.miles || 0), 0) * 10) / 10;
  const monthMiles = Math.round(monthRuns.reduce((s, r) => s + (r.miles || 0), 0) * 10) / 10;

  // ── Season & phase info ──
  const activeSeason = getActiveSeason(school);
  const phaseInfo = getPhaseForSeason(activeSeason);
  const totalWeeks = activeSeason ? Math.ceil((new Date(activeSeason.championshipDate) - new Date(activeSeason.seasonStart)) / (7 * 86400000)) : null;

  // ── Feature 1: Readiness data ──
  const fourteenDaysAgo = new Date(now - 14 * 86400000);
  const recentCheckins = checkins.filter(c => {
    const d = c.date?.toDate ? c.date.toDate() : new Date(c.date);
    return d >= fourteenDaysAgo;
  });
  const last3Checkins = recentCheckins.slice(0, 3);
  const last7Checkins = recentCheckins.slice(0, 7);

  let readinessScore = null;
  if (last3Checkins.length > 0) {
    const avgSleep = last3Checkins.reduce((s, c) => s + (c.sleepQuality || 3), 0) / last3Checkins.length;
    const avgLegs = last3Checkins.reduce((s, c) => s + (c.legFatigue || 3), 0) / last3Checkins.length;
    const avgMood = last3Checkins.reduce((s, c) => s + (c.mood || 3), 0) / last3Checkins.length;
    let score = (avgSleep * 0.35 + avgLegs * 0.35 + avgMood * 0.30) * 2;
    const latestCheckin = last3Checkins[0];
    if (latestCheckin?.injury) score -= 2;
    if (latestCheckin?.illness) score -= 3;
    readinessScore = Math.max(1, Math.min(10, Math.round(score * 10) / 10));
  }

  const avg7Sleep = last7Checkins.length > 0 ? last7Checkins.reduce((s, c) => s + (c.sleepQuality || 3), 0) / last7Checkins.length : null;
  const avg7Legs = last7Checkins.length > 0 ? last7Checkins.reduce((s, c) => s + (c.legFatigue || 3), 0) / last7Checkins.length : null;
  const avg7Mood = last7Checkins.length > 0 ? last7Checkins.reduce((s, c) => s + (c.mood || 3), 0) / last7Checkins.length : null;

  // Overtraining signals + weekly load — shared with CoachDashboard so athlete
  // and coach see identical (ACWR-based) signals.
  const { signals, thisWeekMiles, avg3wk } = computeOvertraining({ runs: allRuns, checkins, now });

  // Active injuries
  const activeInjuries = [];
  let injuryStreak = 0;
  for (const c of recentCheckins) {
    if (c.injury) { injuryStreak++; } else break;
  }
  if (recentCheckins[0]?.injury) {
    activeInjuries.push({ locations: recentCheckins[0].injury.locations || [], severity: recentCheckins[0].injury.severity, streak: injuryStreak });
  }

  // ── Feature 2: Training Quality ──
  const thirtyDaysAgo = new Date(now - 30 * 86400000);
  const recentRuns = allRuns.filter(r => getRunDate(r) >= thirtyDaysAgo);

  // Effort distribution
  const effortDist = Array(11).fill(0);
  recentRuns.forEach(r => { if (r.effort >= 1 && r.effort <= 10) effortDist[r.effort]++; });
  const maxEffortCount = Math.max(...effortDist.slice(1), 1);

  // ── Feature 2b: Pace-based Training Quality (shown when VDOT set) ──
  const trainingPaces = athlete.trainingPaces || null;
  let paceZoneBreakdown = null;
  let paceEighty20 = null;
  if (trainingPaces) {
    const combined = { e: 0, m: 0, t: 0, i: 0, r: 0 };
    recentRuns.forEach(r => {
      if (r.rawPaceStream?.length > 0) {
        const zones = calcPaceZoneBreakdown(r.rawPaceStream, trainingPaces);
        Object.keys(zones).forEach(k => { combined[k] += zones[k]; });
      } else if (r.paceZoneSeconds) {
        Object.keys(r.paceZoneSeconds).forEach(k => { combined[k] += (r.paceZoneSeconds[k] || 0); });
      }
    });
    const total = Object.values(combined).reduce((s, v) => s + v, 0);
    if (total > 0) {
      paceZoneBreakdown = PACE_ZONES.map(z => ({
        ...z,
        seconds: combined[z.key],
        pct: Math.round((combined[z.key] / total) * 100),
      })).filter(z => z.seconds > 0);
      paceEighty20 = calcPace8020(combined);
    }
  }

  // Pace-based 4-week trend
  const paceWeekTrend = [];
  if (trainingPaces) {
    for (let w = 0; w < 4; w++) {
      const wStart = new Date(now - (w + 1) * 7 * 86400000);
      const wEnd = new Date(now - w * 7 * 86400000);
      const wRuns = allRuns.filter(r => { const d = getRunDate(r); return d >= wStart && d < wEnd; });
      const comb = { e: 0, m: 0, t: 0, i: 0, r: 0 };
      let hasData = false;
      wRuns.forEach(r => {
        if (r.rawPaceStream?.length > 0) {
          const zones = calcPaceZoneBreakdown(r.rawPaceStream, trainingPaces);
          Object.keys(zones).forEach(k => { comb[k] += zones[k]; });
          hasData = true;
        } else if (r.paceZoneSeconds) {
          Object.keys(r.paceZoneSeconds).forEach(k => { comb[k] += (r.paceZoneSeconds[k] || 0); });
          hasData = true;
        }
      });
      const result = hasData ? calcPace8020(comb) : null;
      paceWeekTrend.unshift(result ? result.easyPct : null);
    }
  }

  const displayEighty20 = paceEighty20;
  const displayWeekTrend = paceWeekTrend;

  // ── Feature 3: Season Volume Arc ──
  const seasonKey = activeSeason ? `${activeSeason.sport || 'cross_country'}_${activeSeason.seasonStart?.split?.('T')?.[0] || activeSeason.seasonStart}` : null;
  // Only build a curve from a real coach-set target — never fabricate a default.
  const volumePlan = seasonKey && athleteGroup?.seasonPlans?.[seasonKey]
    ? athleteGroup.seasonPlans[seasonKey]
    : (activeSeason && athleteGroup?.weeklyMilesTarget
        ? generateVolumeCurve(activeSeason, athleteGroup.weeklyMilesTarget)
        : {});
  const weeklyRunData = groupRunsByWeek(allRuns);
  const currentMonday = getMondayISO(new Date());

  const volumeWeeks = Object.keys(volumePlan).sort().map(mon => ({
    monday: mon,
    target: volumePlan[mon] || 0,
    actual: weeklyRunData[mon]
      ? Math.round(weeklyRunData[mon].reduce((s, r) => s + (r.miles || 0), 0) * 10) / 10
      : (mon <= currentMonday ? 0 : null),
    isCurrent: mon === currentMonday,
    isPast: mon < currentMonday,
  }));

  // ── Feature 4: Race Performance ──
  const myResults = raceResults.map(res => {
    const race = races.find(r => r.id === res.raceId);
    const meet = raceMeets.find(m => m.id === res.meetId);
    const meetDate = meet?.date?.toDate ? meet.date.toDate() : (meet?.date ? new Date(meet.date) : null);
    return { ...res, race, meet, meetDate, distanceLabel: race?.distanceLabel || 'Unknown' };
  }).filter(r => r.meetDate).sort((a, b) => a.meetDate - b.meetDate);

  const distances = [...new Set(myResults.map(r => r.distanceLabel))];
  const primaryDistance = distances.includes('5K') ? '5K' : distances[0] || null;

  // ── Status helpers (Signal hero gradients) ──
  // status → gradient pair per Signal rules:
  //   ok → [emerald, cyan]; warn → [amber, coral]; alert → [coral, effort10]
  const gradientForStatus = (status) => {
    if (status === 'ok')    return [SIGNAL.color.emerald, SIGNAL.color.cyan];
    if (status === 'warn')  return [SIGNAL.color.amber,   SIGNAL.color.coral];
    if (status === 'alert') return [SIGNAL.color.coral,   SIGNAL.color.effort10];
    return [SIGNAL.color.mute2, SIGNAL.color.mute];
  };

  // ── Render helpers ──

  const renderGauge = (value, label) => {
    const pct = value ? (value / 5) * 100 : 0;
    const color = value >= 3.5 ? SIGNAL.color.emerald : value >= 2.5 ? SIGNAL.color.amber : SIGNAL.color.coral;
    return (
      <View style={styles.gauge}>
        <View style={styles.gaugeRow}>
          <Text style={styles.gaugeLabel}>{label}</Text>
          <Text style={styles.gaugeValue}>
            {value ? value.toFixed(1) : '—'}
            <Text style={styles.gaugeValueMute}>/5</Text>
          </Text>
        </View>
        <View style={styles.gaugeBg}>
          <View style={[styles.gaugeFill, { width: pct + '%', backgroundColor: color }]} />
        </View>
      </View>
    );
  };

  // Reusable expandable section card (Signal styling)
  const SectionCard = ({ n, title, sub, sectionKey, hero, expanded, children, hideChevron }) => (
    <View style={styles.sectionCard}>
      <TouchableOpacity
        onPress={() => toggle(sectionKey)}
        activeOpacity={0.85}
        style={styles.sectionHeader}
      >
        <View style={styles.sectionNumPill}>
          <Text style={styles.sectionNumPillText}>{n}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {sub ? <Text style={styles.sectionSub}>{sub}</Text> : null}
        </View>
        {!hideChevron && (
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={SIGNAL.color.mute2}
          />
        )}
      </TouchableOpacity>

      {hero && <View style={styles.sectionHero}>{hero}</View>}

      {expanded && children ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );

  // ── Render ──

  return (
    <View style={styles.container}>

      {/* Header */}
      {!parentMode && (
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={20} color={SIGNAL.color.inkSoft} />
            <Text style={styles.backText}>Back to team</Text>
          </TouchableOpacity>

          <View style={styles.athleteRow}>
            <View style={[styles.avatar, { backgroundColor: athlete.avatarColor || SIGNAL.color.indigo }]}>
              <Text style={styles.avatarText}>{athlete.firstName?.[0]}{athlete.lastName?.[0]}</Text>
            </View>
            <View style={styles.athleteMeta}>
              <Text style={styles.athleteName}>{athlete.firstName} {athlete.lastName}</Text>
              <Text style={styles.athleteEmail}>
                {athlete.email}{athleteGroup ? ` · ${athleteGroup.name}` : ''}
              </Text>
            </View>
          </View>

          <View style={styles.headerStats}>
            <View style={styles.headerStat}>
              <Text style={styles.headerStatNum}>{weekMiles}</Text>
              <Text style={styles.headerStatLabel}>This week</Text>
            </View>
            <View style={styles.headerStatDivider} />
            <View style={styles.headerStat}>
              <Text style={styles.headerStatNum}>{monthMiles}</Text>
              <Text style={styles.headerStatLabel}>This month</Text>
            </View>
            <View style={styles.headerStatDivider} />
            <View style={styles.headerStat}>
              <Text style={styles.headerStatNum}>{allRuns.length}</Text>
              <Text style={styles.headerStatLabel}>Total runs</Text>
            </View>
            {displayEighty20 && (
              <>
                <View style={styles.headerStatDivider} />
                <View style={styles.headerStat}>
                  <Text style={[styles.headerStatNum, {
                    color: displayEighty20.easyPct >= 78 ? SIGNAL.color.emerald
                      : displayEighty20.easyPct >= 70 ? SIGNAL.color.amber
                      : SIGNAL.color.coral,
                  }]}>{displayEighty20.easyPct}%</Text>
                  <Text style={styles.headerStatLabel}>Easy 30d</Text>
                </View>
              </>
            )}
          </View>
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={SIGNAL.color.indigo} /></View>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

          {/* Parent mode: athlete name + compact stat cards */}
          {parentMode && (
            <View style={styles.parentHeader}>
              <View style={styles.athleteRow}>
                <View style={[styles.avatar, { backgroundColor: athlete.avatarColor || SIGNAL.color.indigo }]}>
                  <Text style={styles.avatarText}>{athlete.firstName?.[0]}{athlete.lastName?.[0]}</Text>
                </View>
                <View style={styles.athleteMeta}>
                  <Text style={styles.athleteName}>{athlete.firstName} {athlete.lastName}</Text>
                  <Text style={styles.athleteEmail}>
                    {athleteGroup ? athleteGroup.name : ''}{athlete.gender ? `${athleteGroup ? ' · ' : ''}${athlete.gender === 'boys' ? 'Boys' : 'Girls'}` : ''}
                  </Text>
                </View>
              </View>
              <View style={styles.parentStats}>
                <View style={styles.parentStatCard}>
                  <Text style={styles.parentStatNum}>{weekMiles}</Text>
                  <Text style={styles.parentStatLabel}>This week</Text>
                </View>
                <View style={styles.parentStatCard}>
                  <Text style={styles.parentStatNum}>{monthMiles}</Text>
                  <Text style={styles.parentStatLabel}>This month</Text>
                </View>
              </View>
            </View>
          )}

          {/* Coach action bar (Modify workout) */}
          {!parentMode && (
            <>
              <View style={styles.actionBar}>
                <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.85} onPress={() => setModifyVisible(true)}>
                  <Text style={styles.primaryBtnText}>Modify workout</Text>
                </TouchableOpacity>
              </View>
              {override && (
                <View style={styles.overrideBanner}>
                  <Ionicons name={override.type === 'rest' ? 'bed-outline' : 'bicycle-outline'} size={16} color={SIGNAL.color.cyan} />
                  <Text style={styles.overrideBannerText}>
                    {override.type === 'rest' ? 'Rest' : 'Cross-training'} until {override.endDate}
                    {override.note ? ` · ${override.note}` : ''}
                  </Text>
                  <TouchableOpacity onPress={clearOverride} hitSlop={8}>
                    <Text style={styles.overrideClear}>Clear</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}

          {/* ── 1. Mileage Volume ── */}
          {(() => {
            // Hero status: if current week has data, color by % of target
            const cw = volumeWeeks.find(w => w.isCurrent);
            const pct = cw && cw.target > 0 ? Math.round((cw.actual / cw.target) * 100) : null;
            let volStatus = null;
            if (pct != null) {
              volStatus = pct >= 90 && pct <= 110 ? 'ok' : pct < 90 ? 'warn' : 'alert';
            }
            const sub = phaseInfo.weekNum
              ? `Week ${phaseInfo.weekNum}${totalWeeks ? ` of ${totalWeeks}` : ''} · ${phaseInfo.name}${phaseInfo.daysToChamp != null && phaseInfo.daysToChamp > 0 ? ` · ${phaseInfo.daysToChamp}d to champ` : ''}`
              : 'No active season';

            const hero = volumeWeeks.length > 0 && cw ? (
              <LinearGradient
                colors={gradientForStatus(volStatus)}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroPill}
              >
                <Text style={styles.heroPillNum}>{cw.actual}</Text>
                <Text style={styles.heroPillSub}>of {cw.target} mi target{pct != null ? ` · ${pct}%` : ''}</Text>
              </LinearGradient>
            ) : null;

            return (
              <SectionCard
                n="1"
                title="Mileage Volume"
                sub={sub}
                sectionKey="volume"
                expanded={expandedSection === 'volume'}
                hero={hero || (volumeWeeks.length === 0 ? <Text style={styles.noDataText}>No season or weekly mileage target set for this athlete's group yet.</Text> : null)}
              >
                {volumeWeeks.length > 0 && (
                  <>
                    {(phaseInfo.phases || []).length > 0 && (
                      <View style={styles.phaseStrip}>
                        {(phaseInfo.phases || []).map((p, i) => (
                          <View
                            key={i}
                            style={[
                              styles.phaseChip,
                              p.name === phaseInfo.name && { backgroundColor: SIGNAL.color.indigo, borderColor: SIGNAL.color.indigo },
                            ]}
                          >
                            <Text style={[
                              styles.phaseChipText,
                              p.name === phaseInfo.name && { color: '#fff' },
                            ]}>
                              {p.name.replace('Pre-Season ', 'Pre-')}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.volumeChartScroll}
                    >
                      {volumeWeeks.map((w, i) => {
                        const maxTarget = Math.max(...volumeWeeks.map(wk => Math.max(wk.target, wk.actual || 0)), 1);
                        const targetH = (w.target / maxTarget) * 100;
                        const actualH = w.actual != null ? (w.actual / maxTarget) * 100 : 0;
                        const pctOfTarget = w.target > 0 && w.actual != null ? w.actual / w.target : null;
                        const barColor = w.actual == null ? SIGNAL.color.line
                          : pctOfTarget >= 0.9 && pctOfTarget <= 1.1 ? SIGNAL.color.emerald
                          : pctOfTarget < 0.9 ? SIGNAL.color.amber : SIGNAL.color.coral;
                        return (
                          <View key={w.monday} style={[styles.volumeBar, w.isCurrent && styles.volumeBarCurrent]}>
                            {w.isCurrent && <Text style={styles.volumeNowTag}>NOW</Text>}
                            <View style={styles.volumeBarInner}>
                              <View style={[styles.volumeTarget, { height: targetH + '%' }]} />
                              {w.actual != null && <View style={[styles.volumeActual, { height: actualH + '%', backgroundColor: barColor }]} />}
                            </View>
                            <Text style={[styles.volumeWeekLabel, w.isCurrent && { color: SIGNAL.color.indigo, fontFamily: SIGNAL.font.bodySemi }]}>
                              {w.isCurrent ? 'Now' : `W${i + 1}`}
                            </Text>
                          </View>
                        );
                      })}
                    </ScrollView>

                    <View style={styles.volumeLegend}>
                      <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: SIGNAL.color.line }]} /><Text style={styles.legendText}>Target</Text></View>
                      <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: SIGNAL.color.emerald }]} /><Text style={styles.legendText}>On track</Text></View>
                      <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: SIGNAL.color.amber }]} /><Text style={styles.legendText}>Under</Text></View>
                      <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: SIGNAL.color.coral }]} /><Text style={styles.legendText}>Over</Text></View>
                    </View>
                  </>
                )}
              </SectionCard>
            );
          })()}

          {/* ── 2. Easy-Hard Balance ── */}
          {(() => {
            const easyPct = displayEighty20 ? displayEighty20.easyPct : null;
            const status = easyPct == null ? null
              : easyPct >= 78 ? 'ok'
              : easyPct >= 70 ? 'warn'
              : 'alert';

            const hero = displayEighty20 ? (
              <LinearGradient
                colors={gradientForStatus(status)}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroPill}
              >
                <Text style={styles.heroPillNum}>{easyPct}%</Text>
                <Text style={styles.heroPillSub}>easy running (pace)</Text>
              </LinearGradient>
            ) : (
              <Text style={styles.noDataText}>
                {trainingPaces ? 'Not enough pace data yet.' : 'No training paces set yet.'}
              </Text>
            );

            return (
              <SectionCard
                n="2"
                title="Easy-Hard Balance"
                sub="Last 30 days · 80/20"
                sectionKey="quality"
                expanded={expandedSection === 'quality'}
                hero={hero}
              >
                {displayEighty20 && (
                  <>
                    {/* 4-week trend dots */}
                    <Text style={styles.detailEyebrow}>4-week trend</Text>
                    <View style={styles.trendRow}>
                      {displayWeekTrend.map((pct, i) => (
                        <View key={i} style={styles.trendItem}>
                          <View style={[styles.trendDot, {
                            backgroundColor: pct == null ? SIGNAL.color.line
                              : pct >= 78 ? SIGNAL.color.emerald
                              : pct >= 70 ? SIGNAL.color.amber
                              : SIGNAL.color.coral,
                          }]} />
                          <Text style={styles.trendLabel}>{pct != null ? `${pct}%` : '—'}</Text>
                        </View>
                      ))}
                      <Text style={styles.trendArrow}>← 4 wk ago</Text>
                    </View>

                    {/* Pace zone breakdown */}
                    {paceZoneBreakdown && (
                      <View style={styles.zoneSection}>
                        <View style={styles.zoneStackedBar}>
                          {paceZoneBreakdown.map(z => (
                            <View key={z.key} style={[styles.zoneBarSegment, { flex: z.pct, backgroundColor: z.color }]} />
                          ))}
                        </View>
                        {paceZoneBreakdown.map(z => (
                          <View key={z.key} style={styles.zoneRow}>
                            <View style={[styles.zoneDot, { backgroundColor: z.color }]} />
                            <Text style={styles.zoneLabel}>{z.short} {z.name}</Text>
                            <Text style={styles.zonePct}>{z.pct}%</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    <Text style={styles.detailEyebrow}>Effort distribution</Text>
                    <Text style={styles.detailHint}>
                      Peaks at 3-4 and 8-9 = polarized (good). Clustered at 5-7 = junk miles.
                    </Text>
                    <View style={styles.effortChart}>
                      {[1,2,3,4,5,6,7,8,9,10].map(n => (
                        <View key={n} style={styles.effortBarWrap}>
                          <View style={[styles.effortBar, {
                            height: Math.max((effortDist[n] / maxEffortCount) * 60, 2),
                            backgroundColor: SIGNAL.effort[n] || SIGNAL.color.line,
                          }]} />
                          <Text style={styles.effortBarLabel}>{n}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </SectionCard>
            );
          })()}

          {/* ── 3. Readiness & Recovery (coach only) ── */}
          {!parentMode && (() => {
            const status = readinessScore == null ? null
              : readinessScore >= 7 ? 'ok'
              : readinessScore >= 5 ? 'warn'
              : 'alert';

            const hero = readinessScore != null ? (
              <LinearGradient
                colors={gradientForStatus(status)}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroPill}
              >
                <Text style={styles.heroPillNum}>{readinessScore.toFixed(1)}</Text>
                <Text style={styles.heroPillSub}>readiness / 10</Text>
              </LinearGradient>
            ) : (
              <Text style={styles.noDataText}>No check-in data yet for this athlete.</Text>
            );

            return (
              <SectionCard
                n="3"
                title="Readiness & Recovery"
                sub="Based on last 7 days of check-ins & training"
                sectionKey="readiness"
                expanded={expandedSection === 'readiness'}
                hero={hero}
              >
                {readinessScore != null && (
                  <>
                    <View style={styles.gaugeStack}>
                      {renderGauge(avg7Sleep, 'Sleep')}
                      {renderGauge(avg7Legs, 'Legs')}
                      {renderGauge(avg7Mood, 'Mood')}
                    </View>

                    <View style={styles.divider} />

                    <Text style={styles.detailEyebrow}>Weekly load</Text>
                    <Text style={styles.loadText}>
                      This week: {Math.round(thisWeekMiles * 10) / 10} mi
                      {avg3wk > 0 ? ` · 3-wk avg: ${Math.round(avg3wk * 10) / 10} mi` : ''}
                      {avg3wk > 0 && thisWeekMiles > 0 ? ` (${thisWeekMiles > avg3wk ? '+' : ''}${Math.round(((thisWeekMiles - avg3wk) / avg3wk) * 100)}%)` : ''}
                    </Text>

                    {signals.length > 0 && (
                      <View style={styles.signalSection}>
                        <Text style={styles.signalTitle}>Watch out</Text>
                        {signals.map((sig, i) => <Text key={i} style={styles.signalText}>• {sig}</Text>)}
                      </View>
                    )}

                    {activeInjuries.length > 0 && (
                      <View style={styles.injurySection}>
                        {activeInjuries.map((inj, i) => (
                          <View key={i} style={styles.injuryChip}>
                            <Text style={styles.injuryChipText}>
                              🩹 {inj.locations.map(l => l.charAt(0).toUpperCase() + l.slice(1)).join(', ')} ({inj.severity}) — {inj.streak} consecutive day{inj.streak !== 1 ? 's' : ''}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {signals.length === 0 && activeInjuries.length === 0 && (
                      <Text style={styles.allClear}>No concerns — athlete is in good shape to train.</Text>
                    )}
                  </>
                )}
              </SectionCard>
            );
          })()}

          {/* ── 4. Race Performance ── */}
          {(() => {
            const distResults = primaryDistance ? myResults.filter(r => r.distanceLabel === primaryDistance) : myResults;
            const best = distResults.length > 0 ? distResults.reduce((b, r) => (!b || (r.finishTime && r.finishTime < b.finishTime)) ? r : b, null) : null;
            const improvement = distResults.length >= 2 ? distResults[0].finishTime - distResults[distResults.length - 1].finishTime : null;
            const hasImproved = improvement != null && improvement < 0;

            // Status: improvement → ok; regression → warn; flat → null
            let raceStatus = null;
            if (improvement != null) {
              if (improvement < -5) raceStatus = 'ok';
              else if (improvement > 5) raceStatus = 'warn';
              else raceStatus = 'ok';
            } else if (best) {
              raceStatus = 'ok';
            }

            const hero = best ? (
              <LinearGradient
                colors={gradientForStatus(raceStatus)}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroPill}
              >
                <Text style={styles.heroPillNum}>{formatTime(best.finishTime)}</Text>
                <Text style={styles.heroPillSub}>
                  {primaryDistance} PR · {best.meet?.name || 'Unknown meet'}
                  {hasImproved ? ` · ↓ ${formatTime(Math.abs(improvement))}` : ''}
                </Text>
              </LinearGradient>
            ) : (
              <Text style={styles.noDataText}>No race results yet.</Text>
            );

            return (
              <SectionCard
                n={parentMode ? '3' : '4'}
                title="Race Performance"
                sub={`${myResults.length} race${myResults.length !== 1 ? 's' : ''} this season`}
                sectionKey="races"
                expanded={expandedSection === 'races'}
                hero={hero}
              >
                {myResults.length === 0 ? (
                  <Text style={styles.detailEmpty}>No race results yet.</Text>
                ) : (
                  [...myResults].reverse().map((res, i, arr) => {
                    const prev = i < arr.length - 1 ? arr[i + 1] : null;
                    const faster = prev && res.finishTime && prev.finishTime ? res.finishTime < prev.finishTime : null;
                    const pace = res.race?.distanceLabel ? calcPace(res.finishTime, res.race.distanceLabel) : null;
                    return (
                      <View key={res.id} style={[styles.raceCard, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                        <View style={styles.raceCardLeft}>
                          <Text style={styles.raceMeetName}>{res.meet?.name || 'Unknown'}</Text>
                          <Text style={styles.raceDate}>
                            {res.meetDate?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {res.distanceLabel}
                          </Text>
                          {res.place && <Text style={styles.racePlace}>Place: {res.place}{res.teamPlace ? ` (team #${res.teamPlace})` : ''}</Text>}
                        </View>
                        <View style={styles.raceCardRight}>
                          <Text style={styles.raceTime}>{formatTime(res.finishTime)}</Text>
                          {pace && <Text style={styles.racePace}>{formatPace(pace)}</Text>}
                          {faster != null && (
                            <Text style={{
                              fontSize: 11,
                              color: faster ? SIGNAL.color.emerald : SIGNAL.color.coral,
                              fontFamily: SIGNAL.font.bodySemi,
                              marginTop: 2,
                            }}>
                              {faster ? '▼ PR' : '▲'}
                            </Text>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}
              </SectionCard>
            );
          })()}

          {/* ── 5. Run History ── */}
          <SectionCard
            n={parentMode ? '4' : '5'}
            title="Run History"
            sub={`${allRuns.length} run${allRuns.length !== 1 ? 's' : ''} logged`}
            sectionKey="runs"
            expanded={expandedSection === 'runs'}
          >
            {allRuns.length === 0 ? (
              <Text style={styles.detailEmpty}>No runs logged yet.</Text>
            ) : allRuns.slice(0, 20).map((run, idx, arr) => {
              const runDate = run.date?.toDate?.()?.toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric'
              });
              const isThisWeek = run.date?.toDate?.() >= weekStart;
              const effortColor = run.effort
                ? (run.effort <= 3 ? SIGNAL.color.emerald
                  : run.effort <= 6 ? SIGNAL.color.amber
                  : SIGNAL.color.coral)
                : SIGNAL.color.mute;
              return (
                <TouchableOpacity
                  key={run.id}
                  style={[styles.runRow, idx === arr.length - 1 && { borderBottomWidth: 0 }]}
                  onPress={() => { setSelectedRun(run); setRunDetailVisible(true); }}
                  activeOpacity={0.7}
                >
                  <View style={styles.runMilesCol}>
                    <Text style={styles.runMiles}>{run.miles} mi</Text>
                    <Text style={styles.runDate}>{runDate}</Text>
                  </View>
                  <View style={styles.runMidCol}>
                    {run.duration ? <Text style={styles.runDuration}>{run.duration}</Text> : null}
                    {isThisWeek && (
                      <View style={styles.weekTag}>
                        <Text style={styles.weekTagText}>This week</Text>
                      </View>
                    )}
                  </View>
                  {run.effort ? (
                    <Text style={[styles.runEffort, { color: effortColor }]}>Effort {run.effort}/10</Text>
                  ) : run.hasPaceData ? (
                    <Text style={[styles.runEffort, { color: SIGNAL.color.indigo }]}>Pace zones</Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
            {allRuns.length > 20 && (
              <Text style={styles.moreRunsText}>{allRuns.length - 20} more runs not shown</Text>
            )}
          </SectionCard>

          {/* ── Attendance ── */}
          {(() => {
            if (attendance.length === 0) return null;
            const present = attendance.filter(a => a.status === 'present').length;
            const absent  = attendance.filter(a => a.status === 'absent').length;
            const excused = attendance.filter(a => a.status === 'excused').length;
            const rate    = Math.round((present / attendance.length) * 100);
            const rateColor = rate >= 90 ? SIGNAL.color.emerald : rate >= 75 ? SIGNAL.color.amber : SIGNAL.color.coral;
            // Last 14 days, newest first
            const fourteenAgo = new Date();
            fourteenAgo.setDate(fourteenAgo.getDate() - 14);
            const recent = [...attendance]
              .filter(a => a.date && new Date(a.date) >= fourteenAgo)
              .sort((a, b) => a.date.localeCompare(b.date));
            const dotColor = (s) => s === 'present' ? SIGNAL.color.emerald : s === 'absent' ? SIGNAL.color.coral : SIGNAL.color.amber;

            return (
              <SectionCard
                n={parentMode ? '5' : '6'}
                title="Attendance"
                sub={`${rate}% · ${present} present · ${absent} absent${excused ? ` · ${excused} excused` : ''}`}
                sectionKey="attendance"
                expanded={expandedSection === 'attendance'}
              >
                <Text style={styles.detailEyebrow}>Last 14 days</Text>
                <View style={styles.attDotRow}>
                  {recent.length === 0
                    ? <Text style={styles.detailEmpty}>No records in the last 14 days.</Text>
                    : recent.map((a, i) => (
                        <View key={a.date + i} style={styles.attDotWrap}>
                          <View style={[styles.attDot, { backgroundColor: dotColor(a.status) }]} />
                          <Text style={styles.attDotLabel}>{a.date.slice(5)}</Text>
                        </View>
                      ))}
                </View>
                <View style={styles.attLegendRow}>
                  <View style={styles.attLegendItem}>
                    <View style={[styles.attLegendDot, { backgroundColor: SIGNAL.color.emerald }]} />
                    <Text style={styles.attLegendText}>Present</Text>
                  </View>
                  <View style={styles.attLegendItem}>
                    <View style={[styles.attLegendDot, { backgroundColor: SIGNAL.color.coral }]} />
                    <Text style={styles.attLegendText}>Absent</Text>
                  </View>
                  <View style={styles.attLegendItem}>
                    <View style={[styles.attLegendDot, { backgroundColor: SIGNAL.color.amber }]} />
                    <Text style={styles.attLegendText}>Excused</Text>
                  </View>
                </View>
              </SectionCard>
            );
          })()}

        </ScrollView>
      )}

      <RunDetailModal
        run={selectedRun}
        visible={runDetailVisible}
        onClose={() => { setRunDetailVisible(false); setSelectedRun(null); }}
        primaryColor={primaryColor}
        trainingPaces={athlete.trainingPaces || null}
      />

      {/* Modify workout (coach) */}
      <Modal visible={modifyVisible} transparent animationType="fade" onRequestClose={() => setModifyVisible(false)}>
        <View style={styles.ovOverlay}>
          <View style={styles.ovSheet}>
            <Text style={styles.ovTitle}>Modify {athlete.firstName}'s workout</Text>

            <Text style={styles.ovLabel}>Replace with</Text>
            <View style={styles.ovRow}>
              {[['cross_training', 'Cross Training'], ['rest', 'No Workout']].map(([k, l]) => {
                const active = ovType === k;
                return (
                  <TouchableOpacity key={k} style={[styles.ovPill, active && styles.ovPillActive]} onPress={() => setOvType(k)} activeOpacity={0.8}>
                    <Text style={[styles.ovPillText, active && styles.ovPillTextActive]}>{l}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <DatePickerField label="Starting" value={ovStart} onChange={setOvStart} primaryColor={SIGNAL.color.indigo} />

            <Text style={styles.ovLabel}>For how long</Text>
            <View style={styles.ovRow}>
              {[['3 days', 3], ['1 week', 7], ['2 weeks', 14], ['3 weeks', 21]].map(([l, d]) => {
                const active = ovDays === d;
                return (
                  <TouchableOpacity key={d} style={[styles.ovPill, active && styles.ovPillActive]} onPress={() => setOvDays(d)} activeOpacity={0.8}>
                    <Text style={[styles.ovPillText, active && styles.ovPillTextActive]}>{l}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.ovLabel}>Note (optional)</Text>
            <TextInput
              style={styles.ovInput}
              value={ovNote}
              onChangeText={setOvNote}
              placeholder="e.g. Achilles — bike only"
              placeholderTextColor={SIGNAL.color.mute2}
            />

            <TouchableOpacity style={styles.ovSaveBtn} onPress={saveOverride} disabled={savingOverride} activeOpacity={0.85}>
              {savingOverride ? <ActivityIndicator color="#fff" /> : <Text style={styles.ovSaveText}>Apply modification</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.ovCancel} onPress={() => setModifyVisible(false)}>
              <Text style={styles.ovCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: {
    padding: SIGNAL.space.screen,
    paddingBottom: 48,
    gap: SIGNAL.space[4],
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    backgroundColor: SIGNAL.color.white,
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: SIGNAL.space[6],
    paddingHorizontal: SIGNAL.space.screen,
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    marginBottom: SIGNAL.space[5],
    alignSelf: 'flex-start',
  },
  backText: {
    color: SIGNAL.color.inkSoft,
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.bodySemi,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  athleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIGNAL.space[4],
    marginBottom: SIGNAL.space[6],
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: SIGNAL.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: SIGNAL.color.white,
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 16,
  },
  athleteMeta: { flex: 1, minWidth: 0 },
  athleteName: {
    fontSize: 29,
    fontFamily: SIGNAL.font.display,
    color: SIGNAL.color.indigo,
    letterSpacing: SIGNAL.letter.titleTight,
  },
  athleteEmail: {
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.mute,
    marginTop: 2,
  },
  headerStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SIGNAL.color.paper,
    borderRadius: SIGNAL.radius.button,
    paddingVertical: SIGNAL.space[4],
  },
  headerStat: { flex: 1, alignItems: 'center' },
  headerStatNum: {
    fontSize: 18,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.numTight,
  },
  headerStatLabel: {
    fontSize: 10,
    color: SIGNAL.color.mute,
    marginTop: 3,
    textAlign: 'center',
  },
  headerStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: SIGNAL.color.line,
  },

  // ── Workout override ──────────────────────────────────────────────────────
  overrideBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${SIGNAL.color.cyan}${SIGNAL.tint.chip}`,
    borderRadius: SIGNAL.radius.control, paddingVertical: 10, paddingHorizontal: 12,
    marginTop: SIGNAL.space[3],
  },
  overrideBannerText: { flex: 1, fontFamily: SIGNAL.font.bodySemi, fontSize: 12.5, color: SIGNAL.color.inkSoft },
  overrideClear: { fontFamily: SIGNAL.font.bodySemi, fontSize: 12.5, color: SIGNAL.color.coral },
  ovOverlay: {
    flex: 1, backgroundColor: 'rgba(11,13,18,0.45)',
    justifyContent: 'center', alignItems: 'center', padding: SIGNAL.space.screen,
  },
  ovSheet: {
    width: '100%', maxWidth: 440, backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.sheet, padding: SIGNAL.space[6], ...SIGNAL.border.hairline,
  },
  ovTitle: { fontFamily: SIGNAL.font.bodySemi, fontSize: SIGNAL.size.heading, color: SIGNAL.color.ink, marginBottom: SIGNAL.space[4] },
  ovLabel: { fontFamily: SIGNAL.font.bodySemi, fontSize: 12, color: SIGNAL.color.inkSoft, marginBottom: 8, marginTop: 4 },
  ovRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: SIGNAL.space[4] },
  ovPill: {
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: SIGNAL.radius.chip,
    backgroundColor: SIGNAL.color.white, borderWidth: 1, borderColor: SIGNAL.color.line,
  },
  ovPillActive: { backgroundColor: SIGNAL.color.indigo, borderColor: SIGNAL.color.indigo },
  ovPillText: { fontFamily: SIGNAL.font.bodySemi, fontSize: 12.5, color: SIGNAL.color.inkSoft },
  ovPillTextActive: { color: '#fff' },
  ovInput: {
    backgroundColor: SIGNAL.color.paper, borderRadius: SIGNAL.radius.control,
    borderWidth: 1, borderColor: SIGNAL.color.line, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: SIGNAL.font.body, fontSize: 15, color: SIGNAL.color.ink, marginBottom: SIGNAL.space[5],
  },
  ovSaveBtn: {
    backgroundColor: SIGNAL.color.indigo, borderRadius: SIGNAL.radius.button,
    paddingVertical: 15, alignItems: 'center', justifyContent: 'center',
  },
  ovSaveText: { fontFamily: SIGNAL.font.bodyBold, fontSize: SIGNAL.size.bodyLg, color: SIGNAL.color.white },
  ovCancel: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  ovCancelText: { fontFamily: SIGNAL.font.bodyMedium, fontSize: 13.5, color: SIGNAL.color.mute },

  // ── Parent header ────────────────────────────────────────────────────────
  parentHeader: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    padding: SIGNAL.space[6],
  },
  parentStats: {
    flexDirection: 'row',
    gap: SIGNAL.space[4],
    marginTop: SIGNAL.space[4],
  },
  parentStatCard: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper,
    borderRadius: SIGNAL.radius.button,
    padding: SIGNAL.space[5],
    alignItems: 'center',
  },
  parentStatNum: {
    fontSize: 22,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.numTight,
  },
  parentStatLabel: {
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.mute,
    marginTop: 2,
  },

  // ── Action bar (Message / Adjust) ────────────────────────────────────────
  actionBar: {
    flexDirection: 'row',
    gap: SIGNAL.space[3],
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: SIGNAL.radius.button,
    backgroundColor: SIGNAL.color.indigo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: SIGNAL.color.white,
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.bodySemi,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  outlineBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: SIGNAL.radius.button,
    backgroundColor: SIGNAL.color.white,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtnText: {
    color: SIGNAL.color.inkSoft,
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.bodySemi,
    letterSpacing: SIGNAL.letter.bodyTight,
  },

  // ── Section card ─────────────────────────────────────────────────────────
  sectionCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIGNAL.space[4],
    padding: SIGNAL.space[6],
  },
  sectionNumPill: {
    width: 26,
    height: 26,
    borderRadius: SIGNAL.radius.chip,
    backgroundColor: SIGNAL.color.indigo + SIGNAL.tint.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionNumPillText: {
    fontSize: 12,
    fontFamily: SIGNAL.font.bodyBold,
    color: SIGNAL.color.indigo,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.indigo,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  sectionSub: {
    ...SIGNAL.style.eyebrow,
    marginTop: 3,
  },
  sectionHero: {
    paddingHorizontal: SIGNAL.space[6],
    paddingBottom: SIGNAL.space[6],
  },
  sectionBody: {
    paddingHorizontal: SIGNAL.space[6],
    paddingBottom: SIGNAL.space[6],
    gap: SIGNAL.space[3],
  },

  // ── Hero gradient pill ───────────────────────────────────────────────────
  heroPill: {
    borderRadius: SIGNAL.radius.button,
    paddingVertical: SIGNAL.space[5],
    paddingHorizontal: SIGNAL.space[6],
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPillNum: {
    fontSize: 36,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.white,
    letterSpacing: SIGNAL.letter.numTight,
  },
  heroPillSub: {
    fontSize: SIGNAL.size.label,
    color: 'rgba(255,255,255,0.92)',
    marginTop: 2,
    fontFamily: SIGNAL.font.bodyMedium,
  },

  // ── Shared body bits ─────────────────────────────────────────────────────
  noDataText: {
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.mute,
  },
  detailEmpty: {
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.mute,
    textAlign: 'center',
    paddingVertical: SIGNAL.space[6],
  },
  detailEyebrow: {
    ...SIGNAL.style.eyebrow,
    marginTop: SIGNAL.space[3],
    marginBottom: SIGNAL.space[2],
  },
  detailHint: {
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.mute,
    marginBottom: SIGNAL.space[3],
  },
  divider: {
    height: 1,
    backgroundColor: SIGNAL.color.line,
    marginVertical: SIGNAL.space[3],
  },

  // ── Trend ────────────────────────────────────────────────────────────────
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIGNAL.space[5],
    marginBottom: SIGNAL.space[3],
  },
  trendItem: { alignItems: 'center', gap: 3 },
  trendDot: { width: 12, height: 12, borderRadius: 6 },
  trendLabel: {
    fontSize: 10,
    color: SIGNAL.color.inkSoft,
    fontFamily: SIGNAL.font.bodyMedium,
  },
  trendArrow: {
    fontSize: 10,
    color: SIGNAL.color.mute2,
    marginLeft: 'auto',
  },

  // ── Zone breakdown ───────────────────────────────────────────────────────
  zoneSection: { marginTop: SIGNAL.space[3] },
  zoneStackedBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: SIGNAL.radius.chip,
    overflow: 'hidden',
    marginBottom: SIGNAL.space[4],
    gap: 2,
  },
  zoneBarSegment: { height: '100%' },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIGNAL.space[3],
    paddingVertical: 3,
  },
  zoneDot: { width: 8, height: 8, borderRadius: 4 },
  zoneLabel: {
    flex: 1,
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.inkSoft,
  },
  zonePct: {
    fontSize: SIGNAL.size.label,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.ink,
    width: 36,
    textAlign: 'right',
    letterSpacing: SIGNAL.letter.numTight,
  },

  // ── Effort distribution ──────────────────────────────────────────────────
  effortChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SIGNAL.space[1],
    height: 80,
    marginTop: SIGNAL.space[2],
  },
  effortBarWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
  },
  effortBar: {
    width: '100%',
    borderRadius: 3,
    minHeight: 2,
  },
  effortBarLabel: {
    fontSize: 10,
    color: SIGNAL.color.mute,
    marginTop: 3,
  },

  // ── Volume arc ───────────────────────────────────────────────────────────
  phaseStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIGNAL.space[2],
    marginBottom: SIGNAL.space[3],
  },
  phaseChip: {
    paddingHorizontal: SIGNAL.space[3],
    paddingVertical: 4,
    borderRadius: SIGNAL.radius.chip,
    backgroundColor: SIGNAL.color.paper,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  phaseChipText: {
    fontSize: 10,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.inkSoft,
  },
  volumeChartScroll: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    paddingVertical: SIGNAL.space[3],
    minHeight: 120,
  },
  volumeBar: {
    width: 26,
    alignItems: 'center',
    paddingTop: 12,
  },
  volumeBarCurrent: {
    borderWidth: 1.5,
    borderColor: SIGNAL.color.indigo,
    borderRadius: SIGNAL.radius.control,
    paddingTop: 12,
  },
  volumeNowTag: {
    position: 'absolute',
    top: -2,
    fontSize: 8,
    color: SIGNAL.color.indigo,
    fontFamily: SIGNAL.font.bodyBold,
    letterSpacing: 0.5,
  },
  volumeBarInner: {
    height: 80,
    width: 18,
    justifyContent: 'flex-end',
    position: 'relative',
  },
  volumeTarget: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: SIGNAL.color.paper2,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    borderRadius: 3,
  },
  volumeActual: {
    width: '100%',
    borderRadius: 3,
  },
  volumeWeekLabel: {
    fontSize: 9,
    color: SIGNAL.color.mute,
    marginTop: 3,
  },
  volumeLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIGNAL.space[5],
    marginTop: SIGNAL.space[2],
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIGNAL.space[2],
  },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: SIGNAL.size.label, color: SIGNAL.color.inkSoft },

  // ── Readiness ────────────────────────────────────────────────────────────
  gaugeStack: { gap: SIGNAL.space[3], marginTop: SIGNAL.space[2] },
  gauge: { gap: 4 },
  gaugeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  gaugeLabel: {
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.inkSoft,
    fontFamily: SIGNAL.font.bodyMedium,
  },
  gaugeValue: {
    fontSize: SIGNAL.size.label,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.numTight,
  },
  gaugeValueMute: {
    fontFamily: SIGNAL.font.body,
    color: SIGNAL.color.mute,
  },
  gaugeBg: {
    height: 6,
    backgroundColor: SIGNAL.color.line,
    borderRadius: SIGNAL.radius.chip,
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: SIGNAL.radius.chip,
  },
  loadText: {
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.inkSoft,
  },

  // ── Signals / injuries ───────────────────────────────────────────────────
  signalSection: {
    backgroundColor: SIGNAL.color.amber + SIGNAL.tint.chip,
    borderRadius: SIGNAL.radius.button,
    padding: SIGNAL.space[4],
    marginTop: SIGNAL.space[3],
  },
  signalTitle: {
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.amber,
    marginBottom: SIGNAL.space[2],
  },
  signalText: {
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.inkSoft,
    marginBottom: 2,
  },
  injurySection: { marginTop: SIGNAL.space[3] },
  injuryChip: {
    backgroundColor: SIGNAL.color.coral + SIGNAL.tint.chip,
    borderRadius: SIGNAL.radius.chip,
    paddingHorizontal: SIGNAL.space[4],
    paddingVertical: SIGNAL.space[3],
    borderWidth: 1,
    borderColor: SIGNAL.color.coral + '40',
    marginBottom: SIGNAL.space[2],
  },
  injuryChipText: {
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.coral,
    fontFamily: SIGNAL.font.bodySemi,
  },
  allClear: {
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.emerald,
    fontFamily: SIGNAL.font.bodySemi,
    textAlign: 'center',
    paddingVertical: SIGNAL.space[4],
  },

  // ── Race cards ───────────────────────────────────────────────────────────
  raceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SIGNAL.space[4],
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  raceCardLeft: { flex: 1 },
  raceCardRight: { alignItems: 'flex-end' },
  raceMeetName: {
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.ink,
  },
  raceDate: {
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.mute,
    marginTop: 2,
  },
  racePlace: {
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.mute2,
    marginTop: 2,
  },
  raceTime: {
    fontSize: 18,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.numTight,
  },
  racePace: {
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.mono,
    marginTop: 2,
  },

  // ── Run history ──────────────────────────────────────────────────────────
  runRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIGNAL.space[4],
    paddingVertical: SIGNAL.space[4],
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  runMilesCol: { minWidth: 64 },
  runMiles: {
    fontSize: SIGNAL.size.bodyLg,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.numTight,
  },
  runDate: {
    fontSize: 10,
    color: SIGNAL.color.mute,
    marginTop: 2,
  },
  runMidCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIGNAL.space[2],
  },
  runDuration: {
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.inkSoft,
    fontFamily: SIGNAL.font.mono,
  },
  weekTag: {
    backgroundColor: SIGNAL.color.indigo + SIGNAL.tint.chip,
    borderRadius: SIGNAL.radius.chip,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  weekTagText: {
    color: SIGNAL.color.indigo,
    fontSize: 10,
    fontFamily: SIGNAL.font.bodyBold,
  },
  runEffort: {
    fontSize: SIGNAL.size.label,
    fontFamily: SIGNAL.font.bodySemi,
  },
  moreRunsText: {
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.mute,
    textAlign: 'center',
    paddingVertical: SIGNAL.space[4],
  },

  // ── Attendance ───────────────────────────────────────────────────────────
  attDotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIGNAL.space[3],
    marginTop: SIGNAL.space[2],
    marginBottom: SIGNAL.space[3],
  },
  attDotWrap: {
    alignItems: 'center',
    gap: 4,
    minWidth: 42,
  },
  attDot: {
    width: 18,
    height: 18,
    borderRadius: 5,
  },
  attDotLabel: {
    fontSize: 10,
    color: SIGNAL.color.mute,
  },
  attLegendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIGNAL.space[4],
    marginTop: SIGNAL.space[2],
  },
  attLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  attLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  attLegendText: {
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.mute,
  },
});
