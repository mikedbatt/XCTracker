import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';
import { SIGNAL } from '../constants/design';
import { getActiveSeason, getPhaseForSeason, getCompletedSeasons, generateVolumeCurve } from './SeasonPlanner';
import SeasonReview from './SeasonReview';
import { formatTime, calcPace, formatPace } from '../utils/raceUtils';
import {
  calcMaxHR, calcZoneBreakdownFromStream, calcZoneBreakdownFromRuns,
  calc8020, ZONE_META, DEFAULT_ZONE_BOUNDARIES,
} from '../zoneConfig';
import { PACE_ZONES, calcPaceZoneBreakdown, calcPace8020 } from '../utils/vdotUtils';
import { getMondayISO, getRunDate, groupRunsByWeek } from '../utils/dateUtils';


// ── Component ────────────────────────────────────────────────────────────────

export default function AthleteAnalytics({ userData, school, myGroup, athleteAge, teamZoneSettings, onClose }) {
  const [loading, setLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState(null);
  const [seasonReviewSeason, setSeasonReviewSeason] = useState(null);

  // Data stores
  const [allRuns, setAllRuns] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [raceResults, setRaceResults] = useState([]);
  const [races, setRaces] = useState([]);
  const [raceMeets, setRaceMeets] = useState([]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }

    try {
      const [runsSnap, checkinsSnap, resultsSnap, racesSnap, meetsSnap] = await Promise.all([
        getDocs(query(collection(db, 'runs'), where('userId', '==', uid), orderBy('date', 'desc'))),
        getDocs(query(collection(db, 'checkins'), where('userId', '==', uid))).catch(() => ({ docs: [] })),
        getDocs(query(collection(db, 'raceResults'), where('athleteId', '==', uid))).catch(() => ({ docs: [] })),
        getDocs(query(collection(db, 'races'), where('schoolId', '==', userData.schoolId))).catch(() => ({ docs: [] })),
        getDocs(query(collection(db, 'raceMeets'), where('schoolId', '==', userData.schoolId))).catch(() => ({ docs: [] })),
      ]);

      setAllRuns(runsSnap.docs.map(d => d.data()));
      setCheckins(checkinsSnap.docs.map(d => d.data()).sort((a, b) => {
        const da = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        const db2 = b.date?.toDate ? b.date.toDate() : new Date(b.date);
        return db2 - da;
      }));
      setRaceResults(resultsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setRaces(racesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setRaceMeets(meetsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.warn('AthleteAnalytics load error:', e); }
    setLoading(false);
  };

  const toggle = (section) => setExpandedSection(expandedSection === section ? null : section);

  // ── Season & phase info ──
  const activeSeason = getActiveSeason(school);
  const phaseInfo = getPhaseForSeason(activeSeason);
  const totalWeeks = activeSeason ? Math.ceil((new Date(activeSeason.championshipDate) - new Date(activeSeason.seasonStart)) / (7 * 86400000)) : null;

  // ── Feature 1: Season Volume Arc data ──
  const seasonKey = activeSeason ? `${activeSeason.sport || 'cross_country'}_${activeSeason.seasonStart?.split?.('T')?.[0] || activeSeason.seasonStart}` : null;
  const volumePlan = seasonKey && myGroup?.seasonPlans?.[seasonKey]
    ? myGroup.seasonPlans[seasonKey]
    : (activeSeason ? generateVolumeCurve(activeSeason, myGroup?.weeklyMilesTarget || 40) : {});
  const weeklyRunData = groupRunsByWeek(allRuns);
  const currentMonday = getMondayISO(new Date());

  const volumeWeeks = Object.keys(volumePlan).sort().map(mon => ({
    monday: mon,
    target: volumePlan[mon] || 0,
    actual: weeklyRunData[mon]
      ? Math.round(weeklyRunData[mon].reduce((s, r) => s + (r.miles || 0), 0) * 10) / 10
      : (mon <= currentMonday ? 0 : null), // null = future
    isCurrent: mon === currentMonday,
    isPast: mon < currentMonday,
  }));

  // Prepend up to 3 weeks of prior-season actuals when the current season is
  // brand new — gives athletes visual context for what they were running
  // before this season's volume curve kicks in. Prior weeks have target=null
  // so the chart renders just the actual bar (no ghost target behind it).
  const elapsedSeasonWeeks = activeSeason
    ? Math.max(0, Math.floor((new Date() - new Date(activeSeason.seasonStart)) / (7 * 86400000)))
    : 99;
  const priorWeeks = [];
  if (elapsedSeasonWeeks < 3 && activeSeason) {
    const seasonStart = new Date(activeSeason.seasonStart);
    for (let w = 3; w >= 1; w--) {
      const monday = new Date(seasonStart);
      monday.setDate(seasonStart.getDate() - 7 * w);
      monday.setHours(0, 0, 0, 0);
      const mondayISO = monday.toISOString().split('T')[0];
      const wRuns = weeklyRunData[mondayISO];
      priorWeeks.push({
        monday: mondayISO,
        target: null,
        actual: wRuns ? Math.round(wRuns.reduce((s, r) => s + (r.miles || 0), 0) * 10) / 10 : 0,
        isCurrent: false,
        isPast: true,
        isPriorSeason: true,
      });
    }
  }
  const allVolumeWeeks = [...priorWeeks, ...volumeWeeks];

  // Build the last 4 calendar weeks (Monday-aligned, oldest → newest) with
  // per-week actual + target. Targets come from volumePlan if the week is
  // inside the current season; otherwise we fall back to the group's static
  // weeklyMilesTarget so prior-to-season weeks still produce a meaningful
  // compliance %.
  const last4WeekData = (() => {
    const today = new Date();
    const dow = today.getDay();
    const thisMon = new Date(today);
    thisMon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
    thisMon.setHours(0, 0, 0, 0);
    const weeks = [];
    for (let i = 3; i >= 0; i--) {
      const monday = new Date(thisMon);
      monday.setDate(thisMon.getDate() - 7 * i);
      const mondayISO = monday.toISOString().split('T')[0];
      const wRuns = weeklyRunData[mondayISO] || [];
      const actual = Math.round(wRuns.reduce((s, r) => s + (r.miles || 0), 0) * 10) / 10;
      const target = volumePlan[mondayISO] || myGroup?.weeklyMilesTarget || 0;
      weeks.push({ monday: mondayISO, actual, target });
    }
    return weeks;
  })();

  // Big-pill compliance: sum(actual) / sum(target) across the 4-week window.
  const compliance4w = (() => {
    const sumActual = last4WeekData.reduce((s, w) => s + w.actual, 0);
    const sumTarget = last4WeekData.reduce((s, w) => s + w.target, 0);
    if (sumTarget <= 0) return null;
    return Math.round((sumActual / sumTarget) * 100);
  })();

  // Per-week trend dots: each value = that week's actual/target × 100.
  const volumeTrend = last4WeekData.map(w =>
    w.target > 0 ? Math.round((w.actual / w.target) * 100) : null
  );

  // ── Feature 2: Race Performance data ──
  const myResults = raceResults.map(res => {
    const race = races.find(r => r.id === res.raceId);
    const meet = raceMeets.find(m => m.id === res.meetId);
    const meetDate = meet?.date?.toDate ? meet.date.toDate() : (meet?.date ? new Date(meet.date) : null);
    return { ...res, race, meet, meetDate, distanceLabel: race?.distanceLabel || 'Unknown' };
  }).filter(r => r.meetDate).sort((a, b) => a.meetDate - b.meetDate);

  const distances = [...new Set(myResults.map(r => r.distanceLabel))];
  const primaryDistance = distances.includes('5K') ? '5K' : distances[0] || null;

  // ── Feature 3: Training Quality data ──
  const boundaries = teamZoneSettings?.boundaries || DEFAULT_ZONE_BOUNDARIES;
  const customMaxHR = teamZoneSettings?.customMaxHR || null;
  const maxHR = calcMaxHR(athleteAge, customMaxHR);

  const now = new Date();
  const thirtyDaysAgo = new Date(now - 30 * 86400000);
  const recentRuns = allRuns.filter(r => getRunDate(r) >= thirtyDaysAgo);

  // Compute zone breakdown for recent runs
  let zoneBreakdown = null;
  let eighty20 = null;
  let hasStreamData = false;
  const rawStreamRuns = recentRuns.filter(r => r.rawHRStream?.length > 0);
  if (rawStreamRuns.length > 0) {
    hasStreamData = true;
    const combined = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
    rawStreamRuns.forEach(r => {
      const bd = calcZoneBreakdownFromStream(r.rawHRStream, maxHR, boundaries);
      if (bd) bd.forEach(z => { combined[`z${z.zone}`] = (combined[`z${z.zone}`] || 0) + z.seconds; });
    });
    const total = Object.values(combined).reduce((s, v) => s + v, 0);
    if (total > 0) {
      zoneBreakdown = Object.entries(combined).map(([k, v]) => ({
        zone: parseInt(k.replace('z', '')),
        pct: Math.round((v / total) * 100),
        seconds: v,
      }));
      eighty20 = calc8020(zoneBreakdown);
    }
  }
  if (!zoneBreakdown) {
    const bd = calcZoneBreakdownFromRuns(recentRuns, athleteAge, customMaxHR, boundaries);
    if (bd) { zoneBreakdown = bd; eighty20 = calc8020(bd); }
  }

  // Effort distribution
  const effortDist = Array(11).fill(0);
  recentRuns.forEach(r => { if (r.effort >= 1 && r.effort <= 10) effortDist[r.effort]++; });
  const maxEffortCount = Math.max(...effortDist.slice(1), 1);

  // 4-week 80/20 trend
  const weekTrend = [];
  for (let w = 0; w < 4; w++) {
    const wStart = new Date(now - (w + 1) * 7 * 86400000);
    const wEnd = new Date(now - w * 7 * 86400000);
    const wRuns = allRuns.filter(r => { const d = getRunDate(r); return d >= wStart && d < wEnd; });
    const wStream = wRuns.filter(r => r.rawHRStream?.length > 0);
    let wPct = null;
    if (wStream.length > 0) {
      const comb = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
      wStream.forEach(r => {
        const bd = calcZoneBreakdownFromStream(r.rawHRStream, maxHR, boundaries);
        if (bd) bd.forEach(z => { comb[`z${z.zone}`] = (comb[`z${z.zone}`] || 0) + z.seconds; });
      });
      const t = Object.values(comb).reduce((s, v) => s + v, 0);
      if (t > 0) wPct = Math.round(((comb.z1 + comb.z2) / t) * 100);
    }
    if (wPct === null) {
      const bd = calcZoneBreakdownFromRuns(wRuns, athleteAge, customMaxHR, boundaries);
      if (bd) wPct = bd.filter(z => z.zone <= 2).reduce((s, z) => s + z.pct, 0);
    }
    weekTrend.unshift(wPct);
  }

  // ── Feature 3b: Pace-based Training Quality (primary when VDOT set) ──
  const trainingPaces = userData.trainingPaces || null;
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

  const usePace = !!paceEighty20;
  const displayEighty20 = usePace ? paceEighty20 : eighty20;
  const displayWeekTrend = usePace ? paceWeekTrend : weekTrend;

  // ── Weekly intensity compliance (season-aligned, like volume arc) ──
  const TARGET_EASY_PCT = 80;
  const intensityWeeks = volumeWeeks.map(w => {
    const monday = new Date(w.monday + 'T00:00:00');
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 7);
    const wRuns = allRuns.filter(r => { const d = getRunDate(r); return d >= monday && d < sunday; });
    if (w.actual == null || wRuns.length === 0) return { ...w, easyPct: null };

    if (usePace && trainingPaces) {
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
      if (hasData) {
        const result = calcPace8020(comb);
        return { ...w, easyPct: result ? result.easyPct : null };
      }
    }

    // HR fallback
    const boundaries = teamZoneSettings?.boundaries || DEFAULT_ZONE_BOUNDARIES;
    const customMaxHR = teamZoneSettings?.customMaxHR || null;
    const maxHR = calcMaxHR(athleteAge, customMaxHR);
    const rawStreamRuns = wRuns.filter(r => r.rawHRStream?.length > 0);
    if (rawStreamRuns.length > 0) {
      const combined = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
      rawStreamRuns.forEach(r => {
        const bd = calcZoneBreakdownFromStream(r.rawHRStream, maxHR, boundaries);
        if (bd) bd.forEach(z => { combined[`z${z.zone}`] = (combined[`z${z.zone}`] || 0) + z.seconds; });
      });
      const total = Object.values(combined).reduce((s, v) => s + v, 0);
      if (total > 0) return { ...w, easyPct: Math.round(((combined.z1 + combined.z2) / total) * 100) };
    }

    return { ...w, easyPct: null };
  });

  // ── Feature 4: Readiness data ──
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
    let score = (avgSleep * 0.35 + avgLegs * 0.35 + avgMood * 0.30) * 2; // scale 1-5 → 2-10
    const latestCheckin = last3Checkins[0];
    if (latestCheckin?.injury) score -= 2;
    if (latestCheckin?.illness) score -= 3;
    readinessScore = Math.max(1, Math.min(10, Math.round(score * 10) / 10));
  }

  const avg7Sleep = last7Checkins.length > 0 ? last7Checkins.reduce((s, c) => s + (c.sleepQuality || 3), 0) / last7Checkins.length : null;
  const avg7Legs = last7Checkins.length > 0 ? last7Checkins.reduce((s, c) => s + (c.legFatigue || 3), 0) / last7Checkins.length : null;
  const avg7Mood = last7Checkins.length > 0 ? last7Checkins.reduce((s, c) => s + (c.mood || 3), 0) / last7Checkins.length : null;

  // Overtraining signals (adapted from CoachDashboard checkOvertraining)
  const signals = [];
  const thisMonday = new Date(now);
  const dayOfWeek = thisMonday.getDay();
  thisMonday.setDate(thisMonday.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  thisMonday.setHours(0, 0, 0, 0);
  const thisWeekRuns = allRuns.filter(r => getRunDate(r) >= thisMonday);
  const thisWeekMiles = thisWeekRuns.reduce((s, r) => s + (r.miles || 0), 0);

  const priorWeekMiles = [];
  for (let w = 1; w <= 3; w++) {
    const wStart = new Date(thisMonday); wStart.setDate(thisMonday.getDate() - w * 7);
    const wEnd = new Date(wStart); wEnd.setDate(wStart.getDate() + 7);
    const miles = allRuns.filter(r => { const d = getRunDate(r); return d >= wStart && d < wEnd; }).reduce((s, r) => s + (r.miles || 0), 0);
    priorWeekMiles.push(miles);
  }
  const avg3wk = priorWeekMiles.length > 0 ? priorWeekMiles.reduce((s, m) => s + m, 0) / priorWeekMiles.length : 0;
  if (avg3wk > 0 && thisWeekMiles > avg3wk * 1.15) {
    signals.push(`Miles up ${Math.round(((thisWeekMiles - avg3wk) / avg3wk) * 100)}% vs 3-week avg`);
  }
  const highEffortDays = thisWeekRuns.filter(r => (r.effort || 0) >= 8).length;
  if (highEffortDays >= 4) signals.push(`Effort 8+ on ${highEffortDays} of last 7 days`);
  if (last3Checkins.length >= 3) {
    const recentMood = last3Checkins.reduce((s, c) => s + (c.mood || 3), 0) / 3;
    const olderCheckins = recentCheckins.slice(3, 6);
    if (olderCheckins.length >= 3) {
      const olderMood = olderCheckins.reduce((s, c) => s + (c.mood || 3), 0) / 3;
      if (recentMood < olderMood - 0.5) signals.push('Mood declining this week');
    }
    const recentSleep = last3Checkins.reduce((s, c) => s + (c.sleepQuality || 3), 0) / 3;
    if (recentSleep < 2.5) signals.push('Poor sleep reported');
  }

  // Active injuries
  const activeInjuries = [];
  let injuryStreak = 0;
  for (const c of recentCheckins) {
    if (c.injury) { injuryStreak++; } else break;
  }
  if (recentCheckins[0]?.injury) {
    const inj = recentCheckins[0].injury;
    activeInjuries.push({
      locations: inj.locations || [],
      perLocation: inj.perLocation,  // undefined for older check-ins without per-location data
      severity: inj.severity,
      streak: injuryStreak,
    });
  }

  // ── Render helpers ──

  const gaugeColor = (v) => {
    if (v == null) return SIGNAL.color.mute2;
    if (v >= 3.5) return SIGNAL.color.emerald;
    if (v >= 2.5) return SIGNAL.color.amber;
    return SIGNAL.color.coral;
  };

  const renderGauge = (value, label) => {
    const pct = value ? (value / 5) * 100 : 0;
    const color = gaugeColor(value);
    return (
      <View style={styles.gauge}>
        <View style={styles.gaugeHeader}>
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

  // Section header renderer for collapsible cards
  const renderSectionHeader = (sectionKey, num, title, sub) => {
    const isOpen = expandedSection === sectionKey;
    return (
      <TouchableOpacity
        onPress={() => toggle(sectionKey)}
        activeOpacity={0.85}
        style={styles.sectionHeaderBtn}
      >
        <View style={styles.numBadge}>
          <Text style={styles.numBadgeText}>{num}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {sub ? <Text style={styles.eyebrow}>{sub}</Text> : null}
        </View>
        <Ionicons
          name="chevron-down"
          size={16}
          color={SIGNAL.color.mute2}
          style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}
        />
      </TouchableOpacity>
    );
  };

  // ── Main render ──

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={SIGNAL.color.inkSoft} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Stats</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.loadingWrap}><ActivityIndicator size="large" color={SIGNAL.color.indigo} /></View>
      </View>
    );
  }

  // VDOT badge value (header chip)
  const vdotValue = trainingPaces?.vdot ? Math.round(trainingPaces.vdot * 10) / 10 : null;

  // Header subline — mirrors the design's "Season VI · Build · 40d to championship"
  const headerSub = (() => {
    if (!activeSeason) return 'No active season';
    const parts = [];
    if (activeSeason.name) parts.push(activeSeason.name);
    if (phaseInfo?.name) parts.push(phaseInfo.name);
    if (phaseInfo?.daysToChamp != null && phaseInfo.daysToChamp > 0) parts.push(`${phaseInfo.daysToChamp}d to championship`);
    return parts.join(' · ');
  })();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={SIGNAL.color.inkSoft} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>My Stats</Text>
          {!!headerSub && <Text style={styles.headerSub} numberOfLines={1}>{headerSub}</Text>}
        </View>
        <View style={styles.headerRight}>
          {vdotValue != null ? (
            <View style={styles.vdotChip}>
              <Text style={styles.vdotChipText}>VDOT {vdotValue}</Text>
            </View>
          ) : <View style={{ width: 60 }} />}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 14, paddingBottom: 40, gap: 12 }}
      >

        {/* ── 1. Mileage Volume ── */}
        <View style={styles.card}>
          {renderSectionHeader(
            'volume',
            '1',
            'Mileage Volume',
            !activeSeason
              ? 'No active season'
              : phaseInfo.weekNum
                ? `Week ${phaseInfo.weekNum}${totalWeeks ? ` of ${totalWeeks}` : ''} · ${phaseInfo.name}${phaseInfo.daysToChamp != null && phaseInfo.daysToChamp > 0 ? ` · ${phaseInfo.daysToChamp}d to championship` : ''}`
                : `${phaseInfo.name}${phaseInfo.daysToChamp != null && phaseInfo.daysToChamp > 0 ? ` · ${phaseInfo.daysToChamp}d to championship` : ''}`
          )}

          {volumeWeeks.length > 0 ? (
            <View style={styles.cardBody}>
              {/* Hero gauge — gradient pill, colored by status */}
              {compliance4w != null && (() => {
                const status = compliance4w >= 90 && compliance4w <= 110 ? 'ok'
                  : compliance4w < 90 ? 'under' : 'over';
                const gradient = status === 'ok'
                  ? [SIGNAL.color.emerald, SIGNAL.color.cyan]
                  : status === 'under'
                    ? [SIGNAL.color.amber, SIGNAL.color.coral]
                    : [SIGNAL.color.coral, SIGNAL.color.effort10];
                return (
                  <LinearGradient
                    colors={gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.heroCard}
                  >
                    <Text style={styles.heroGaugeNum}>{compliance4w}%</Text>
                    <Text style={styles.heroGaugeSub}>Last 4 weeks · of weekly target</Text>
                  </LinearGradient>
                );
              })()}

              {/* Per-week trend dots */}
              <View style={styles.trendRow}>
                {volumeTrend.map((pct, i) => (
                  <View key={i} style={styles.trendItem}>
                    <View style={[styles.trendDot, {
                      backgroundColor: pct == null
                        ? SIGNAL.color.line
                        : pct >= 90 && pct <= 110 ? SIGNAL.color.emerald
                        : pct < 90 ? SIGNAL.color.amber
                        : SIGNAL.color.coral,
                    }]} />
                    <Text style={styles.trendLabel}>{pct != null ? `${pct}%` : '—'}</Text>
                  </View>
                ))}
                <Text style={styles.trendArrow}>← 4wk</Text>
              </View>
            </View>
          ) : (
            <View style={styles.cardBody}>
              <Text style={styles.noDataText}>
                Your coach hasn't set up a season plan yet. Ask them to create one in Program → Seasons.
              </Text>
            </View>
          )}

          {expandedSection === 'volume' && allVolumeWeeks.length > 0 && (
            <View style={styles.cardBody}>
              <View style={styles.divider} />
              <Text style={styles.eyebrowMb}>Week-by-week target vs actual</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.detailChartScroll}>
                {allVolumeWeeks.map((w, i) => {
                  const maxBar = Math.max(...allVolumeWeeks.map(wk => Math.max(wk.target || 0, wk.actual || 0)), 1);
                  const targetH = w.target != null ? (w.target / maxBar) * 100 : 0;
                  const actualH = w.actual != null ? (w.actual / maxBar) * 100 : 0;
                  const pctOfTarget = w.target > 0 && w.actual != null ? w.actual / w.target : null;
                  const barColor = w.isPriorSeason
                    ? SIGNAL.color.mute2 // prior-season actuals render muted gray (no target to compare to)
                    : w.actual == null
                      ? SIGNAL.color.line
                      : pctOfTarget >= 0.9 && pctOfTarget <= 1.1
                        ? SIGNAL.color.emerald
                        : pctOfTarget < 0.9 ? SIGNAL.color.amber : SIGNAL.color.coral;
                  // Week label: prior weeks count backward from "W1" of the active season
                  const priorCount = priorWeeks.length;
                  const label = w.isCurrent
                    ? 'Now'
                    : w.isPriorSeason
                      ? `-${priorCount - i}` // e.g., -3, -2, -1 for the three prior weeks
                      : `W${i - priorCount + 1}`;
                  return (
                    <View
                      key={w.monday}
                      style={[styles.detailVolumeBar, w.isCurrent && styles.volumeBarCurrent]}
                    >
                      <View style={styles.detailVolumeBarInner}>
                        {w.target != null && (
                          <View style={[styles.volumeTarget, { height: `${targetH}%` }]} />
                        )}
                        {w.actual != null && (
                          <View style={[styles.volumeActual, { height: `${actualH}%`, backgroundColor: barColor }]} />
                        )}
                      </View>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.detailVolumeLabel,
                          w.isCurrent && { color: SIGNAL.color.indigo, fontFamily: SIGNAL.font.bodyBold },
                          w.isPriorSeason && { color: SIGNAL.color.mute2 },
                        ]}
                      >
                        {label}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>

        {/* ── 2. Easy-Hard Balance ── */}
        <View style={styles.card}>
          {renderSectionHeader(
            'quality',
            '2',
            'Easy-Hard Balance',
            'Last 30 days · 80/20 compliance'
          )}

          {displayEighty20 ? (
            <View style={styles.cardBody}>
              {/* Hero gauge — gradient pill, colored by 80/20 status */}
              {(() => {
                const pct = displayEighty20.easyPct;
                const gradient = pct >= 78
                  ? [SIGNAL.color.emerald, SIGNAL.color.cyan]
                  : pct >= 70
                    ? [SIGNAL.color.amber, SIGNAL.color.coral]
                    : [SIGNAL.color.coral, SIGNAL.color.effort10];
                return (
                  <LinearGradient
                    colors={gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.heroCard}
                  >
                    <Text style={styles.heroGaugeNum}>{pct}%</Text>
                    <Text style={styles.heroGaugeSub}>
                      {usePace ? 'Easy running (by pace)' : 'Z1 + Z2 (easy running)'}
                      {!usePace && hasStreamData ? '  · Precise' : ''}
                    </Text>
                  </LinearGradient>
                );
              })()}

              {/* 4-week trend dots */}
              <View style={styles.trendRow}>
                {displayWeekTrend.map((pct, i) => (
                  <View key={i} style={styles.trendItem}>
                    <View style={[styles.trendDot, {
                      backgroundColor: pct == null
                        ? SIGNAL.color.line
                        : pct >= 78 ? SIGNAL.color.emerald
                        : pct >= 70 ? SIGNAL.color.amber
                        : SIGNAL.color.coral,
                    }]} />
                    <Text style={styles.trendLabel}>{pct != null ? `${pct}%` : '—'}</Text>
                  </View>
                ))}
                <Text style={styles.trendArrow}>← 4wk</Text>
              </View>
            </View>
          ) : (
            <View style={styles.cardBody}>
              <Text style={styles.noDataText}>
                {trainingPaces ? 'Not enough pace data yet.' : 'Set your training paces in your profile to see pace-based compliance.'}
              </Text>
            </View>
          )}

          {expandedSection === 'quality' && (
            <View style={styles.cardBody}>
              <View style={styles.divider} />

              {/* Weekly intensity compliance (mirrors volume arc) */}
              {intensityWeeks.length > 0 && intensityWeeks.some(w => w.easyPct != null) && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={styles.eyebrowMb}>
                    Weekly easy % — target {TARGET_EASY_PCT}%
                  </Text>
                  <Text style={styles.detailHint}>
                    Each bar shows the % of training at easy pace. Aim for {TARGET_EASY_PCT}%+.
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.detailChartScroll}>
                    {intensityWeeks.map((w, i) => {
                      const barH = w.easyPct != null ? (w.easyPct / 100) * 80 : 0;
                      const targetH = (TARGET_EASY_PCT / 100) * 80;
                      const barColor = w.easyPct == null
                        ? SIGNAL.color.line
                        : w.easyPct >= 78 ? SIGNAL.color.emerald
                        : w.easyPct >= 68 ? SIGNAL.color.amber : SIGNAL.color.coral;
                      return (
                        <View key={w.monday} style={[styles.detailVolumeBar, w.isCurrent && styles.volumeBarCurrent]}>
                          <View style={styles.detailVolumeBarInner}>
                            <View style={[styles.intensityTargetLine, { bottom: targetH }]} />
                            {w.easyPct != null && (
                              <View style={[styles.volumeActual, { height: barH, backgroundColor: barColor }]} />
                            )}
                          </View>
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.detailVolumeLabel,
                              w.isCurrent && { color: SIGNAL.color.indigo, fontFamily: SIGNAL.font.bodyBold },
                            ]}
                          >
                            {w.isCurrent ? 'Now' : `W${i + 1}`}
                          </Text>
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Pace zone breakdown (primary when VDOT set) */}
              {usePace && paceZoneBreakdown && (
                <View style={styles.zoneSection}>
                  <Text style={styles.eyebrowMb}>Pace zone breakdown</Text>
                  <View style={styles.zoneStackedBar}>
                    {paceZoneBreakdown.map(z => (
                      <View key={z.key} style={[styles.zoneBarSegment, { flex: z.pct, backgroundColor: z.color }]} />
                    ))}
                  </View>
                  {paceZoneBreakdown.map(z => (
                    <View key={z.key} style={styles.zoneRow}>
                      <View style={[styles.zoneDot, { backgroundColor: z.color }]} />
                      <Text style={styles.zoneLabel}>{z.short} · {z.name}</Text>
                      <Text style={styles.zonePct}>{z.pct}%</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* HR zone breakdown (fallback when no VDOT) */}
              {!usePace && zoneBreakdown && (
                <View style={styles.zoneSection}>
                  <Text style={styles.eyebrowMb}>Heart-rate zone breakdown</Text>
                  <View style={styles.zoneStackedBar}>
                    {zoneBreakdown.map(z => (
                      <View key={z.zone} style={[styles.zoneBarSegment, { flex: z.pct, backgroundColor: ZONE_META[z.zone]?.color || SIGNAL.color.line }]} />
                    ))}
                  </View>
                  {zoneBreakdown.map(z => (
                    <View key={z.zone} style={styles.zoneRow}>
                      <View style={[styles.zoneDot, { backgroundColor: ZONE_META[z.zone]?.color || SIGNAL.color.line }]} />
                      <Text style={styles.zoneLabel}>{ZONE_META[z.zone]?.name || `Z${z.zone}`}</Text>
                      <Text style={styles.zonePct}>{z.pct}%</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Effort polarization */}
              <Text style={[styles.eyebrowMb, { marginTop: 18 }]}>Effort distribution</Text>
              <Text style={styles.detailHint}>Peaks at 3–4 and 8–9 = polarized (good).</Text>
              <View style={styles.effortChart}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                  <View key={n} style={styles.effortBarWrap}>
                    <View
                      style={[
                        styles.effortBar,
                        {
                          height: Math.max((effortDist[n] / maxEffortCount) * 54, 3),
                          backgroundColor: SIGNAL.effort[n] || SIGNAL.color.line,
                        },
                      ]}
                    />
                    <Text style={styles.effortBarLabel}>{n}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* ── 3. Race Performance ── */}
        <View style={styles.card}>
          {renderSectionHeader(
            'races',
            '3',
            'Race Performance',
            `${myResults.length} race${myResults.length !== 1 ? 's' : ''} this season`
          )}

          <View style={styles.cardBody}>
            {(() => {
              const distResults = primaryDistance ? myResults.filter(r => r.distanceLabel === primaryDistance) : myResults;
              if (distResults.length === 0) {
                return <Text style={styles.noDataText}>No race results yet. Your coach will enter results after each meet.</Text>;
              }
              const best = distResults.reduce((b, r) => (!b || (r.finishTime && r.finishTime < b.finishTime)) ? r : b, null);
              const improvement = distResults.length >= 2 ? distResults[0].finishTime - distResults[distResults.length - 1].finishTime : null;
              return (
                <View style={styles.prBanner}>
                  {best && (
                    <Text style={styles.prBannerText}>
                      🏆 {primaryDistance} PR: <Text style={styles.prBannerBold}>{formatTime(best.finishTime)}</Text> — {best.meet?.name || 'Unknown meet'}
                    </Text>
                  )}
                  {improvement != null && improvement < 0 && (
                    <Text style={styles.improvementText}>
                      ↓ {formatTime(Math.abs(improvement))} improvement this season
                    </Text>
                  )}
                </View>
              );
            })()}
          </View>

          {expandedSection === 'races' && (
            <View style={styles.cardBody}>
              <View style={styles.divider} />
              {myResults.length === 0 ? (
                <Text style={styles.detailEmpty}>No race results yet.</Text>
              ) : (
                [...myResults].reverse().map((res, i, arr) => {
                  const prev = i < arr.length - 1 ? arr[i + 1] : null;
                  const faster = prev && res.finishTime && prev.finishTime ? res.finishTime < prev.finishTime : null;
                  const pace = res.race?.distanceLabel ? calcPace(res.finishTime, res.race.distanceLabel) : null;
                  // Determine if this row is the PR
                  const isBest = res.distanceLabel && (() => {
                    const sameDist = myResults.filter(r => r.distanceLabel === res.distanceLabel);
                    const minTime = Math.min(...sameDist.map(r => r.finishTime || Infinity));
                    return res.finishTime === minTime;
                  })();
                  return (
                    <View
                      key={res.id}
                      style={[styles.raceCard, i < arr.length - 1 && styles.raceCardBordered]}
                    >
                      <View style={styles.raceCardLeft}>
                        <Text style={styles.raceMeetName}>{res.meet?.name || 'Unknown'}</Text>
                        <Text style={styles.raceMeta}>
                          {res.meetDate?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {res.distanceLabel}
                          {res.place ? ` · ${res.place}${res.teamPlace ? ` (team #${res.teamPlace})` : ''}` : ''}
                        </Text>
                      </View>
                      <View style={styles.raceCardRight}>
                        <Text
                          style={[
                            styles.raceTime,
                            { color: isBest ? SIGNAL.color.pink : SIGNAL.color.ink },
                          ]}
                        >
                          {formatTime(res.finishTime)}
                        </Text>
                        <View style={styles.racePaceRow}>
                          {pace && <Text style={styles.racePace}>{formatPace(pace)}/mi</Text>}
                          {isBest && <Text style={styles.prBadge}>▼PR</Text>}
                          {!isBest && faster != null && (
                            <Text style={{ fontFamily: SIGNAL.font.bodyBold, fontSize: 10, color: faster ? SIGNAL.color.emerald : SIGNAL.color.coral }}>
                              {faster ? '▼' : '▲'}
                            </Text>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}
        </View>

        {/* ── 4. Readiness & Recovery ── */}
        <View style={styles.card}>
          {renderSectionHeader(
            'readiness',
            '4',
            'Readiness & Recovery',
            'Based on last 7 days'
          )}

          {readinessScore != null ? (
            <View style={styles.cardBody}>
              <View style={styles.readinessRow}>
                {/* Ring (rendered with concentric Views — no SVG) */}
                <View style={styles.readinessRingWrap}>
                  <View
                    style={[
                      styles.readinessRing,
                      {
                        borderColor: readinessScore < 4
                          ? SIGNAL.color.coral
                          : readinessScore < 7
                            ? SIGNAL.color.amber
                            : SIGNAL.color.emerald,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.readinessNum,
                        {
                          color: readinessScore < 4
                            ? SIGNAL.color.coral
                            : readinessScore < 7
                              ? SIGNAL.color.amber
                              : SIGNAL.color.emerald,
                        },
                      ]}
                    >
                      {readinessScore.toFixed(1)}
                    </Text>
                    <Text style={styles.readinessLabel}>/ 10</Text>
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  {renderGauge(avg7Sleep, 'Sleep')}
                  {renderGauge(avg7Legs, 'Legs')}
                  {renderGauge(avg7Mood, 'Mood')}
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.cardBody}>
              <Text style={styles.noDataText}>Complete your daily check-in to see your readiness score.</Text>
            </View>
          )}

          {expandedSection === 'readiness' && (
            <View style={styles.cardBody}>
              <View style={styles.divider} />

              {/* Load comparison */}
              <Text style={styles.loadText}>
                Weekly load: <Text style={styles.loadBold}>{Math.round(thisWeekMiles * 10) / 10} mi</Text>
                {avg3wk > 0 ? ` · 3-wk avg ${Math.round(avg3wk * 10) / 10}` : ''}
                {avg3wk > 0 && thisWeekMiles > 0 ? (
                  <Text style={{
                    color: thisWeekMiles > avg3wk * 1.15 ? SIGNAL.color.amber : SIGNAL.color.mute,
                  }}>
                    {` (${thisWeekMiles > avg3wk ? '+' : ''}${Math.round(((thisWeekMiles - avg3wk) / avg3wk) * 100)}%)`}
                  </Text>
                ) : null}
              </Text>

              {/* Alert signals */}
              {signals.length > 0 && (
                <View style={styles.signalSection}>
                  <Text style={styles.signalTitle}>⚠️ Watch out</Text>
                  {signals.map((sig, i) => (
                    <Text key={i} style={styles.signalText}>• {sig}</Text>
                  ))}
                </View>
              )}

              {/* Active injuries */}
              {activeInjuries.length > 0 && (
                <View style={styles.injurySection}>
                  {activeInjuries.map((inj, i) => (
                    <View key={i} style={styles.injuryChip}>
                      <Text style={styles.injuryChipText}>
                        🩹 {inj.perLocation
                          ? inj.perLocation.map(p => `${p.location.charAt(0).toUpperCase() + p.location.slice(1)} (${p.severity})`).join(', ')
                          : `${inj.locations.map(l => l.charAt(0).toUpperCase() + l.slice(1)).join(', ')} (${inj.severity})`
                        } — {inj.streak} consecutive day{inj.streak !== 1 ? 's' : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {signals.length === 0 && activeInjuries.length === 0 && (
                <Text style={styles.allClear}>✅ No concerns — you're in good shape to train.</Text>
              )}
            </View>
          )}
        </View>

        {/* ── 5. Season in Review (permanent access) ── */}
        {(() => {
          const completed = getCompletedSeasons(school);
          if (completed.length === 0) return null;
          const SPORT_LABELS = { cross_country: 'Cross Country', indoor_track: 'Indoor Track', outdoor_track: 'Outdoor Track' };
          const SPORT_ICONS = { cross_country: '🏔️', indoor_track: '🏟️', outdoor_track: '🏃' };
          return (
            <View style={styles.card}>
              <View style={styles.sectionHeaderBtn}>
                <View style={styles.numBadge}>
                  <Text style={styles.numBadgeText}>5</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.sectionTitle}>Season in Review</Text>
                  <Text style={styles.eyebrow}>Tap a season to see your recap</Text>
                </View>
              </View>
              <View style={styles.cardBody}>
                {completed.map((s, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.seasonReviewCard, i < completed.length - 1 && styles.seasonReviewCardBordered]}
                    onPress={() => setSeasonReviewSeason(s)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.seasonReviewIcon}>{SPORT_ICONS[s.sport] || '🏃'}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.seasonReviewName}>{s.name || SPORT_LABELS[s.sport] || 'Season'}</Text>
                      <Text style={styles.seasonReviewDate}>
                        {new Date(s.seasonStart).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} – {new Date(s.championshipDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={SIGNAL.color.mute2} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        })()}

      </ScrollView>

      {seasonReviewSeason && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <SeasonReview season={seasonReviewSeason} school={school} userData={userData} onClose={() => setSeasonReviewSeason(null)} />
        </View>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: 14,
    paddingHorizontal: 14,
    backgroundColor: SIGNAL.color.white,
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 64,
  },
  backText: {
    fontSize: 15,
    color: SIGNAL.color.inkSoft,
    fontFamily: SIGNAL.font.body,
    marginLeft: 2,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 18,
    color: SIGNAL.color.indigo,
    letterSpacing: -0.36,
  },
  headerSub: {
    fontSize: 11,
    letterSpacing: 1.43,
    textTransform: 'uppercase',
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.bodyMedium,
    marginTop: 3,
  },
  headerRight: {
    width: 76,
    alignItems: 'flex-end',
  },
  vdotChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: SIGNAL.radius.chip,
    backgroundColor: `${SIGNAL.color.indigo}${SIGNAL.tint.chip}`,
  },
  vdotChipText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 11,
    color: SIGNAL.color.indigo,
    letterSpacing: 0.2,
  },

  scroll: { flex: 1 },

  // ── Card shell ──
  card: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    overflow: 'hidden',
    ...SIGNAL.border.hairline,
  },
  sectionHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 16,
  },
  numBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: `${SIGNAL.color.indigo}${SIGNAL.tint.chip}`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numBadgeText: {
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 12,
    color: SIGNAL.color.indigo,
  },
  sectionTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 18,
    color: SIGNAL.color.indigo,
    letterSpacing: -0.36,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.43,
    textTransform: 'uppercase',
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.bodyMedium,
    marginTop: 3,
  },
  eyebrowMb: {
    fontSize: 11,
    letterSpacing: 1.43,
    textTransform: 'uppercase',
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.bodyMedium,
    marginBottom: 8,
  },
  cardBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: SIGNAL.color.line,
    marginVertical: 14,
  },

  noDataText: {
    fontSize: 13,
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.body,
    lineHeight: 19,
  },
  detailEmpty: {
    fontSize: 13,
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.body,
    textAlign: 'center',
    paddingVertical: 16,
  },
  detailHint: {
    fontSize: 11,
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.body,
    marginBottom: 10,
  },

  // ── 1. Mileage Volume ──
  // (Collapsed view reuses Easy-Hard heroCard + trendRow styles for visual
  // parity; only the dropdown chart has its own bar-specific styles below.)

  // Volume bar parts (used by the expanded dropdown chart)
  volumeBarCurrent: {
    borderColor: SIGNAL.color.indigo,
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
    zIndex: 1,
  },
  intensityTargetLine: {
    position: 'absolute',
    left: -2,
    right: -2,
    height: 2,
    backgroundColor: SIGNAL.color.mute,
    borderRadius: 1,
    zIndex: 2,
  },

  // ── Detail chart variants (for expanded sections) ──
  detailChartScroll: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    paddingVertical: 8,
    minHeight: 110,
  },
  detailVolumeBar: {
    width: 26,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: 4,
    padding: 1,
  },
  detailVolumeBarInner: {
    height: 80,
    width: 20,
    justifyContent: 'flex-end',
    position: 'relative',
  },
  detailVolumeLabel: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 9,
    color: SIGNAL.color.mute,
    marginTop: 3,
    minWidth: 28,
    textAlign: 'center',
  },

  // ── 2. Easy-Hard Balance ──
  heroCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: SIGNAL.radius.card,
    marginBottom: 14,
  },
  heroGaugeNum: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 36,
    lineHeight: 40,
    color: '#fff',
    letterSpacing: SIGNAL.letter.numTight,
  },
  heroGaugeSub: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    marginBottom: 4,
  },
  trendItem: {
    alignItems: 'center',
    gap: 4,
  },
  trendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  trendLabel: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 9,
    color: SIGNAL.color.mute,
  },
  trendArrow: {
    fontSize: 9,
    color: SIGNAL.color.mute2,
    fontFamily: SIGNAL.font.body,
    marginLeft: 4,
  },

  zoneSection: {
    marginTop: 4,
  },
  zoneStackedBar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 10,
  },
  zoneBarSegment: {
    height: '100%',
  },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 3,
  },
  zoneDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  zoneLabel: {
    flex: 1,
    fontFamily: SIGNAL.font.body,
    fontSize: 11.5,
    color: SIGNAL.color.inkSoft,
  },
  zonePct: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 12,
    color: SIGNAL.color.ink,
    letterSpacing: -0.2,
    width: 38,
    textAlign: 'right',
  },

  effortChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 70,
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
    minHeight: 3,
  },
  effortBarLabel: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 9,
    color: SIGNAL.color.mute,
    marginTop: 3,
  },

  // ── 3. Race Performance ──
  prBanner: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 11,
    backgroundColor: `${SIGNAL.color.pink}0D`,
    borderWidth: 1,
    borderColor: `${SIGNAL.color.pink}33`,
  },
  prBannerText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 13,
    color: SIGNAL.color.ink,
  },
  prBannerBold: {
    fontFamily: SIGNAL.font.bodyBold,
  },
  improvementText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 11.5,
    color: SIGNAL.color.emerald,
    marginTop: 4,
  },
  raceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  raceCardBordered: {
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  raceCardLeft: { flex: 1, minWidth: 0 },
  raceCardRight: { alignItems: 'flex-end' },
  raceMeetName: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 13,
    color: SIGNAL.color.ink,
  },
  raceMeta: {
    fontSize: 10.5,
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.body,
    marginTop: 2,
  },
  raceTime: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 17,
    letterSpacing: -0.4,
  },
  racePaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  racePace: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 10,
    color: SIGNAL.color.mute,
  },
  prBadge: {
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 10,
    color: SIGNAL.color.pink,
  },

  // ── 4. Readiness ──
  readinessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  readinessRingWrap: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readinessRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SIGNAL.color.white,
  },
  readinessNum: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 19,
    lineHeight: 22,
    letterSpacing: -0.5,
  },
  readinessLabel: {
    fontSize: 8,
    color: SIGNAL.color.mute,
    letterSpacing: 0.8,
    fontFamily: SIGNAL.font.bodyMedium,
    marginTop: 1,
  },
  gauge: {
    marginBottom: 8,
  },
  gaugeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  gaugeLabel: {
    fontSize: 11.5,
    color: SIGNAL.color.inkSoft,
    fontFamily: SIGNAL.font.bodyMedium,
  },
  gaugeValue: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 11.5,
    color: SIGNAL.color.ink,
  },
  gaugeValueMute: {
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.body,
  },
  gaugeBg: {
    height: 5,
    backgroundColor: SIGNAL.color.line,
    borderRadius: 999,
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: 999,
  },
  loadText: {
    fontFamily: SIGNAL.font.body,
    fontSize: 12,
    color: SIGNAL.color.inkSoft,
    marginBottom: 10,
  },
  loadBold: {
    fontFamily: SIGNAL.font.bodyBold,
    color: SIGNAL.color.ink,
  },
  signalSection: {
    backgroundColor: `${SIGNAL.color.amber}10`,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 6,
    marginBottom: 8,
  },
  signalTitle: {
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 11.5,
    color: SIGNAL.color.amber,
    marginBottom: 4,
  },
  signalText: {
    fontFamily: SIGNAL.font.body,
    fontSize: 11,
    color: SIGNAL.color.inkSoft,
    lineHeight: 18,
  },
  injurySection: {
    marginBottom: 8,
  },
  injuryChip: {
    backgroundColor: `${SIGNAL.color.coral}14`,
    borderRadius: SIGNAL.radius.chip,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: `${SIGNAL.color.coral}40`,
    marginBottom: 6,
  },
  injuryChipText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 12,
    color: SIGNAL.color.coral,
  },
  allClear: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 13,
    color: SIGNAL.color.emerald,
    textAlign: 'center',
    paddingVertical: 8,
  },

  // ── 5. Season in Review ──
  seasonReviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 10,
  },
  seasonReviewCardBordered: {
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  seasonReviewIcon: {
    fontSize: 22,
  },
  seasonReviewName: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 13,
    color: SIGNAL.color.ink,
  },
  seasonReviewDate: {
    fontSize: 10.5,
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.body,
    marginTop: 1,
  },
});
