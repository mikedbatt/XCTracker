import { Ionicons } from '@expo/vector-icons';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
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
import {
  BRAND, BRAND_ACCENT, BRAND_DARK, BRAND_LIGHT,
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE, STATUS,
  EFFORT_COLORS,
} from '../constants/design';
import { getActiveSeason, getPhaseForSeason, generateVolumeCurve } from './SeasonPlanner';
import { formatTime, calcPace, formatPace } from '../utils/raceUtils';
import {
  calcMaxHR, calcZoneBreakdownFromStream, calcZoneBreakdownFromRuns,
  calc8020, ZONE_META, DEFAULT_ZONE_BOUNDARIES,
} from '../zoneConfig';
import { PACE_ZONES, calcPaceZoneBreakdown, calcPace8020 } from '../utils/vdotUtils';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getMondayISO(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

function getRunDate(r) {
  return r.date?.toDate ? r.date.toDate() : new Date(r.date);
}

function groupRunsByWeek(runs) {
  const weeks = {};
  runs.forEach(r => {
    const d = getRunDate(r);
    const mon = getMondayISO(d);
    if (!weeks[mon]) weeks[mon] = [];
    weeks[mon].push(r);
  });
  return weeks;
}


// ── Component ────────────────────────────────────────────────────────────────

export default function AthleteAnalytics({ userData, school, myGroup, athleteAge, teamZoneSettings, onClose }) {
  const [loading, setLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState(null);

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
    const locs = recentCheckins[0].injury.locations || [];
    activeInjuries.push({ locations: locs, severity: recentCheckins[0].injury.severity, streak: injuryStreak });
  }

  // ── Render helpers ──

  const renderGauge = (value, label, max = 5) => {
    const pct = value ? (value / max) * 100 : 0;
    const color = value >= 3.5 ? STATUS.success : value >= 2.5 ? STATUS.warning : STATUS.error;
    return (
      <View style={styles.gauge}>
        <Text style={styles.gaugeLabel}>{label}</Text>
        <View style={styles.gaugeBg}>
          <View style={[styles.gaugeFill, { width: pct + '%', backgroundColor: color }]} />
        </View>
        <Text style={[styles.gaugeValue, { color }]}>{value ? value.toFixed(1) : '—'}</Text>
      </View>
    );
  };

  // ── Main render ──

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={BRAND_DARK} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Stats</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.loadingWrap}><ActivityIndicator size="large" color={BRAND} /></View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={BRAND_DARK} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Stats</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ── 1. Season Volume Arc ── */}
        <TouchableOpacity style={styles.section} onPress={() => toggle('volume')} activeOpacity={0.8}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionNum}>1</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Season Volume Arc</Text>
              <Text style={styles.sectionSub}>
                {phaseInfo.weekNum ? `Week ${phaseInfo.weekNum}${totalWeeks ? ` of ${totalWeeks}` : ''} · ${phaseInfo.name}` : 'No active season'}
                {phaseInfo.daysToChamp != null && phaseInfo.daysToChamp > 0 ? ` · ${phaseInfo.daysToChamp}d to championship` : ''}
              </Text>
            </View>
            <Ionicons name={expandedSection === 'volume' ? 'chevron-up' : 'chevron-down'} size={20} color={NEUTRAL.muted} />
          </View>

          {volumeWeeks.length > 0 ? (
            <View>
              {/* Phase strip */}
              <View style={styles.phaseStrip}>
                {(phaseInfo.phases || []).map((p, i) => (
                  <View key={i} style={[styles.phaseChip, p.name === phaseInfo.name && { backgroundColor: p.color, borderColor: p.color }]}>
                    <Text style={[styles.phaseChipText, p.name === phaseInfo.name && { color: '#fff' }]}>{p.name.replace('Pre-Season ', 'Pre-')}</Text>
                  </View>
                ))}
              </View>
              {/* Current week summary */}
              {volumeWeeks.find(w => w.isCurrent) && (() => {
                const cw = volumeWeeks.find(w => w.isCurrent);
                const pct = cw.target > 0 ? Math.round((cw.actual / cw.target) * 100) : 0;
                return <Text style={styles.volumeSummary}>This week: {cw.actual} of {cw.target} mi target ({pct}%)</Text>;
              })()}
            </View>
          ) : (
            <Text style={styles.noDataText}>Your coach hasn't set up a season plan yet. Ask them to create one in Program → Seasons.</Text>
          )}
        </TouchableOpacity>

        {expandedSection === 'volume' && volumeWeeks.length > 0 && (
          <View style={styles.detail}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.volumeChartScroll}>
              {volumeWeeks.map((w, i) => {
                const maxTarget = Math.max(...volumeWeeks.map(wk => Math.max(wk.target, wk.actual || 0)), 1);
                const targetH = (w.target / maxTarget) * 100;
                const actualH = w.actual != null ? (w.actual / maxTarget) * 100 : 0;
                const pctOfTarget = w.target > 0 && w.actual != null ? w.actual / w.target : null;
                const barColor = w.actual == null ? NEUTRAL.border
                  : pctOfTarget >= 0.9 && pctOfTarget <= 1.1 ? STATUS.success
                  : pctOfTarget < 0.9 ? STATUS.warning : STATUS.error;
                return (
                  <View key={w.monday} style={[styles.volumeBar, w.isCurrent && styles.volumeBarCurrent]}>
                    <View style={styles.volumeBarInner}>
                      {/* Target ghost bar */}
                      <View style={[styles.volumeTarget, { height: targetH + '%' }]} />
                      {/* Actual filled bar */}
                      {w.actual != null && <View style={[styles.volumeActual, { height: actualH + '%', backgroundColor: barColor }]} />}
                    </View>
                    <Text style={[styles.volumeWeekLabel, w.isCurrent && { color: BRAND, fontWeight: FONT_WEIGHT.bold }]}>
                      {w.isCurrent ? 'Now' : `W${i + 1}`}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
            <View style={styles.volumeLegend}>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: NEUTRAL.border }]} /><Text style={styles.legendText}>Target</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: STATUS.success }]} /><Text style={styles.legendText}>On track</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: STATUS.warning }]} /><Text style={styles.legendText}>Under</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: STATUS.error }]} /><Text style={styles.legendText}>Over</Text></View>
            </View>
          </View>
        )}

        {/* ── 2. Training Quality ── */}
        <TouchableOpacity style={styles.section} onPress={() => toggle('quality')} activeOpacity={0.8}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionNum}>2</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Easy-Hard Balance</Text>
              <Text style={styles.sectionSub}>Last 30 days — 80/20 compliance & effort</Text>
            </View>
            <Ionicons name={expandedSection === 'quality' ? 'chevron-up' : 'chevron-down'} size={20} color={NEUTRAL.muted} />
          </View>

          {displayEighty20 ? (
            <View>
              {/* Hero gauge */}
              <View style={styles.heroGauge}>
                <Text style={[styles.heroGaugeNum, {
                  color: displayEighty20.easyPct >= 78 ? STATUS.success : displayEighty20.easyPct >= 70 ? STATUS.warning : STATUS.error,
                }]}>{displayEighty20.easyPct}%</Text>
                <Text style={styles.heroGaugeSub}>{usePace ? 'Easy running (pace)' : 'Z1+Z2 (easy running)'}</Text>
                {!usePace && hasStreamData && <Text style={styles.streamBadge}>Precise ✓</Text>}
              </View>
              {/* 4-week trend dots */}
              <View style={styles.trendRow}>
                {displayWeekTrend.map((pct, i) => (
                  <View key={i} style={styles.trendItem}>
                    <View style={[styles.trendDot, {
                      backgroundColor: pct == null ? NEUTRAL.border : pct >= 78 ? STATUS.success : pct >= 70 ? STATUS.warning : STATUS.error,
                    }]} />
                    <Text style={styles.trendLabel}>{pct != null ? `${pct}%` : '—'}</Text>
                  </View>
                ))}
                <Text style={styles.trendArrow}>← 4 wk ago</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.noDataText}>{trainingPaces ? 'Not enough pace data yet.' : 'Set your training paces in your profile to see pace-based compliance.'}</Text>
          )}
        </TouchableOpacity>

        {expandedSection === 'quality' && (
          <View style={styles.detail}>
            {/* Weekly intensity compliance chart (mirrors volume arc) */}
            {intensityWeeks.length > 0 && intensityWeeks.some(w => w.easyPct != null) && (
              <View style={{ marginBottom: SPACE.lg }}>
                <Text style={styles.detailSectionLabel}>Weekly easy % — target {TARGET_EASY_PCT}%</Text>
                <Text style={styles.detailHint}>Each bar shows the % of training at easy pace. Aim for {TARGET_EASY_PCT}%+.</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.volumeChartScroll}>
                  {intensityWeeks.map((w, i) => {
                    const barH = w.easyPct != null ? (w.easyPct / 100) * 80 : 0;
                    const targetH = (TARGET_EASY_PCT / 100) * 80;
                    const barColor = w.easyPct == null ? NEUTRAL.border
                      : w.easyPct >= 78 ? STATUS.success
                      : w.easyPct >= 68 ? STATUS.warning : STATUS.error;
                    return (
                      <View key={w.monday} style={[styles.volumeBar, w.isCurrent && styles.volumeBarCurrent]}>
                        <View style={styles.volumeBarInner}>
                          {/* Target line at 80% */}
                          <View style={[styles.intensityTargetLine, { bottom: targetH }]} />
                          {/* Actual easy % bar */}
                          {w.easyPct != null && <View style={[styles.volumeActual, { height: barH, backgroundColor: barColor }]} />}
                        </View>
                        <Text style={[styles.volumeWeekLabel, w.isCurrent && { color: BRAND, fontWeight: FONT_WEIGHT.bold }]}>
                          {w.isCurrent ? 'Now' : `W${i + 1}`}
                        </Text>
                      </View>
                    );
                  })}
                </ScrollView>
                <View style={styles.volumeLegend}>
                  <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: NEUTRAL.muted, height: 2, borderRadius: 1 }]} /><Text style={styles.legendText}>{TARGET_EASY_PCT}% target</Text></View>
                  <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: STATUS.success }]} /><Text style={styles.legendText}>On track</Text></View>
                  <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: STATUS.warning }]} /><Text style={styles.legendText}>Caution</Text></View>
                  <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: STATUS.error }]} /><Text style={styles.legendText}>Too hard</Text></View>
                </View>
              </View>
            )}

            {/* Pace zone breakdown (primary when VDOT set) */}
            {usePace && paceZoneBreakdown && (
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

            {/* HR zone breakdown (fallback when no VDOT) */}
            {!usePace && zoneBreakdown && (
              <View style={styles.zoneSection}>
                <View style={styles.zoneStackedBar}>
                  {zoneBreakdown.map(z => (
                    <View key={z.zone} style={[styles.zoneBarSegment, { flex: z.pct, backgroundColor: ZONE_META[z.zone]?.color || '#ccc' }]} />
                  ))}
                </View>
                {zoneBreakdown.map(z => (
                  <View key={z.zone} style={styles.zoneRow}>
                    <View style={[styles.zoneDot, { backgroundColor: ZONE_META[z.zone]?.color }]} />
                    <Text style={styles.zoneLabel}>{ZONE_META[z.zone]?.name || `Z${z.zone}`}</Text>
                    <Text style={styles.zonePct}>{z.pct}%</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Effort polarization */}
            <Text style={styles.detailSectionLabel}>Effort distribution</Text>
            <Text style={styles.detailHint}>Peaks at 3-4 and 8-9 = polarized (good). Clustered at 5-7 = junk miles.</Text>
            <View style={styles.effortChart}>
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <View key={n} style={styles.effortBarWrap}>
                  <View style={[styles.effortBar, { height: Math.max((effortDist[n] / maxEffortCount) * 60, 2), backgroundColor: EFFORT_COLORS[n] || NEUTRAL.border }]} />
                  <Text style={styles.effortBarLabel}>{n}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── 3. Race Performance ── */}
        <TouchableOpacity style={styles.section} onPress={() => toggle('races')} activeOpacity={0.8}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionNum}>3</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Race Performance</Text>
              <Text style={styles.sectionSub}>{myResults.length} race{myResults.length !== 1 ? 's' : ''} this season</Text>
            </View>
            <Ionicons name={expandedSection === 'races' ? 'chevron-up' : 'chevron-down'} size={20} color={NEUTRAL.muted} />
          </View>

          {(() => {
            const distResults = primaryDistance ? myResults.filter(r => r.distanceLabel === primaryDistance) : myResults;
            if (distResults.length === 0) return <Text style={styles.noDataText}>No race results yet. Your coach will enter results after each meet.</Text>;
            const best = distResults.reduce((b, r) => (!b || (r.finishTime && r.finishTime < b.finishTime)) ? r : b, null);
            const improvement = distResults.length >= 2 ? distResults[0].finishTime - distResults[distResults.length - 1].finishTime : null;
            return (
              <View>
                {best && <Text style={styles.prBanner}>🏆 {primaryDistance} PR: {formatTime(best.finishTime)} — {best.meet?.name || 'Unknown meet'}</Text>}
                {improvement != null && improvement < 0 && (
                  <Text style={[styles.improvementText, { color: STATUS.success }]}>↓ {formatTime(Math.abs(improvement))} improvement this season</Text>
                )}
              </View>
            );
          })()}
        </TouchableOpacity>

        {expandedSection === 'races' && (
          <View style={styles.detail}>
            {myResults.length === 0 ? (
              <Text style={styles.detailEmpty}>No race results yet.</Text>
            ) : (
              [...myResults].reverse().map((res, i, arr) => {
                const prev = i < arr.length - 1 ? arr[i + 1] : null;
                const faster = prev && res.finishTime && prev.finishTime ? res.finishTime < prev.finishTime : null;
                const pace = res.race?.distanceLabel ? calcPace(res.finishTime, res.race.distanceLabel) : null;
                return (
                  <View key={res.id} style={styles.raceCard}>
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
                        <Text style={{ fontSize: FONT_SIZE.xs, color: faster ? STATUS.success : STATUS.error, fontWeight: FONT_WEIGHT.bold }}>
                          {faster ? '▼ PR' : '▲'}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ── 4. Readiness & Recovery ── */}
        <TouchableOpacity style={styles.section} onPress={() => toggle('readiness')} activeOpacity={0.8}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionNum}>4</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Readiness & Recovery</Text>
              <Text style={styles.sectionSub}>Based on last 7 days of check-ins & training</Text>
            </View>
            <Ionicons name={expandedSection === 'readiness' ? 'chevron-up' : 'chevron-down'} size={20} color={NEUTRAL.muted} />
          </View>

          {readinessScore != null ? (
            <View style={styles.readinessRow}>
              <View style={[styles.readinessCircle, {
                borderColor: readinessScore >= 7 ? STATUS.success : readinessScore >= 5 ? STATUS.warning : STATUS.error,
              }]}>
                <Text style={[styles.readinessNum, {
                  color: readinessScore >= 7 ? STATUS.success : readinessScore >= 5 ? STATUS.warning : STATUS.error,
                }]}>{readinessScore.toFixed(1)}</Text>
                <Text style={styles.readinessLabel}>/ 10</Text>
              </View>
              <View style={{ flex: 1, gap: SPACE.xs }}>
                {renderGauge(avg7Sleep, 'Sleep')}
                {renderGauge(avg7Legs, 'Legs')}
                {renderGauge(avg7Mood, 'Mood')}
              </View>
            </View>
          ) : (
            <Text style={styles.noDataText}>Complete your daily check-in to see your readiness score.</Text>
          )}
        </TouchableOpacity>

        {expandedSection === 'readiness' && (
          <View style={styles.detail}>
            {/* Load comparison */}
            <View style={styles.loadRow}>
              <Text style={styles.detailSectionLabel}>Weekly load</Text>
              <Text style={styles.loadText}>
                This week: {Math.round(thisWeekMiles * 10) / 10} mi
                {avg3wk > 0 ? ` · 3-wk avg: ${Math.round(avg3wk * 10) / 10} mi` : ''}
                {avg3wk > 0 && thisWeekMiles > 0 ? ` (${thisWeekMiles > avg3wk ? '+' : ''}${Math.round(((thisWeekMiles - avg3wk) / avg3wk) * 100)}%)` : ''}
              </Text>
            </View>

            {/* Alert signals */}
            {signals.length > 0 && (
              <View style={styles.signalSection}>
                <Text style={styles.signalTitle}>⚠️ Watch out</Text>
                {signals.map((sig, i) => <Text key={i} style={styles.signalText}>• {sig}</Text>)}
              </View>
            )}

            {/* Active injuries */}
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
              <Text style={styles.allClear}>✅ No concerns — you're in good shape to train.</Text>
            )}
          </View>
        )}

      </ScrollView>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const ZONE_COLORS_MAP = { 1: '#64b5f6', 2: '#4caf50', 3: '#ff9800', 4: '#f44336', 5: '#9c27b0' };

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: NEUTRAL.bg },
  loadingWrap:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? SPACE['5xl'] : SPACE['3xl'],
    paddingBottom: SPACE.md, paddingHorizontal: SPACE.lg,
    backgroundColor: NEUTRAL.card, borderBottomWidth: 1, borderBottomColor: NEUTRAL.border,
  },
  backBtn:        { flexDirection: 'row', alignItems: 'center', width: 60 },
  backText:       { fontSize: FONT_SIZE.base, color: BRAND_DARK, marginLeft: 2 },
  headerTitle:    { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  scroll:         { flex: 1 },

  // ── Sections ──
  section: {
    margin: SPACE.lg, marginBottom: 0, backgroundColor: NEUTRAL.card,
    borderRadius: RADIUS.lg, padding: SPACE.lg, ...SHADOW.sm,
  },
  sectionHeader:  { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md },
  sectionNum:     { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: BRAND_ACCENT, width: 22 },
  sectionTitle:   { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  sectionSub:     { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, marginTop: 2 },
  detail:         { marginHorizontal: SPACE.lg, backgroundColor: NEUTRAL.card, borderBottomLeftRadius: RADIUS.lg, borderBottomRightRadius: RADIUS.lg, padding: SPACE.lg, paddingTop: SPACE.sm, ...SHADOW.sm, marginTop: -1 },
  noDataText:     { fontSize: FONT_SIZE.sm, color: NEUTRAL.muted, marginTop: SPACE.md },
  noDataHint:     { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, marginTop: SPACE.md },
  detailEmpty:    { fontSize: FONT_SIZE.sm, color: NEUTRAL.muted, textAlign: 'center', padding: SPACE.lg },
  detailSectionLabel: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: SPACE.sm, marginTop: SPACE.md },
  detailHint:     { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginBottom: SPACE.md },

  // ── Feature 1: Volume Arc ──
  phaseStrip:     { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs, marginTop: SPACE.md },
  phaseChip: {
    paddingHorizontal: SPACE.sm, paddingVertical: 3, borderRadius: RADIUS.full,
    backgroundColor: NEUTRAL.bg, borderWidth: 1, borderColor: NEUTRAL.border,
  },
  phaseChipText:  { fontSize: 10, fontWeight: FONT_WEIGHT.semibold, color: NEUTRAL.body },
  volumeSummary:  { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, marginTop: SPACE.md },
  volumeChartScroll: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, paddingVertical: SPACE.md, minHeight: 130 },
  volumeBar:      { width: 24, alignItems: 'center' },
  volumeBarCurrent: { borderWidth: 1.5, borderColor: BRAND, borderRadius: RADIUS.sm, padding: 1 },
  volumeBarInner: { height: 80, width: 18, justifyContent: 'flex-end', position: 'relative' },
  volumeTarget:   { position: 'absolute', bottom: 0, width: '100%', backgroundColor: NEUTRAL.bg, borderWidth: 1, borderColor: NEUTRAL.border, borderRadius: 2 },
  volumeActual:   { width: '100%', borderRadius: 2 },
  intensityTargetLine: { position: 'absolute', left: -2, right: -2, height: 2, backgroundColor: NEUTRAL.muted, borderRadius: 1, zIndex: 1 },
  volumeWeekLabel:{ fontSize: 9, color: NEUTRAL.muted, marginTop: 2 },
  volumeLegend:   { flexDirection: 'row', gap: SPACE.lg, marginTop: SPACE.sm },
  legendItem:     { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  legendDot:      { width: 8, height: 8, borderRadius: 4 },
  legendText:     { fontSize: FONT_SIZE.xs, color: NEUTRAL.body },

  // ── Feature 2: Race Performance ──
  prBanner:       { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginTop: SPACE.md },
  improvementText:{ fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, marginTop: SPACE.xs },
  raceCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: SPACE.md, borderBottomWidth: 1, borderBottomColor: NEUTRAL.bg,
  },
  raceCardLeft:   { flex: 1 },
  raceCardRight:  { alignItems: 'flex-end' },
  raceMeetName:   { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  raceDate:       { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, marginTop: 2 },
  racePlace:      { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: 2 },
  raceTime:       { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  racePace:       { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, marginTop: 2 },

  // ── Feature 3: Training Quality ──
  heroGauge:      { alignItems: 'center', marginTop: SPACE.md },
  heroGaugeNum:   { fontSize: FONT_SIZE['3xl'], fontWeight: FONT_WEIGHT.bold },
  heroGaugeSub:   { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, marginTop: 2 },
  streamBadge:    { fontSize: FONT_SIZE.xs, color: STATUS.success, fontWeight: FONT_WEIGHT.semibold, marginTop: SPACE.xs },
  trendRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.lg, marginTop: SPACE.md },
  trendItem:      { alignItems: 'center', gap: 2 },
  trendDot:       { width: 12, height: 12, borderRadius: 6 },
  trendLabel:     { fontSize: 10, color: NEUTRAL.body },
  trendArrow:     { fontSize: 10, color: NEUTRAL.muted },

  zoneSection:    { marginTop: SPACE.sm },
  zoneStackedBar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', marginBottom: SPACE.md },
  zoneBarSegment: { height: '100%' },
  zoneRow:        { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingVertical: 3 },
  zoneDot:        { width: 10, height: 10, borderRadius: 5 },
  zoneLabel:      { flex: 1, fontSize: FONT_SIZE.xs, color: NEUTRAL.body },
  zonePct:        { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, width: 36, textAlign: 'right' },

  effortChart:    { flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.xs, height: 80 },
  effortBarWrap:  { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  effortBar:      { width: '100%', borderRadius: 3, minHeight: 2 },
  effortBarLabel: { fontSize: 10, color: NEUTRAL.muted, marginTop: 2 },

  // ── Feature 4: Readiness ──
  readinessRow:   { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg, marginTop: SPACE.md },
  readinessCircle:{
    width: 72, height: 72, borderRadius: 36, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  readinessNum:   { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold },
  readinessLabel: { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted },
  gauge:          { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  gaugeLabel:     { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, width: 36 },
  gaugeBg:        { flex: 1, height: 6, backgroundColor: NEUTRAL.bg, borderRadius: 3, overflow: 'hidden' },
  gaugeFill:      { height: '100%', borderRadius: 3 },
  gaugeValue:     { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, width: 28, textAlign: 'right' },
  loadRow:        { marginBottom: SPACE.md },
  loadText:       { fontSize: FONT_SIZE.sm, color: NEUTRAL.body },
  signalSection:  { backgroundColor: STATUS.warningBg, borderRadius: RADIUS.md, padding: SPACE.md, marginBottom: SPACE.md },
  signalTitle:    { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: STATUS.warning, marginBottom: SPACE.xs },
  signalText:     { fontSize: FONT_SIZE.xs, color: STATUS.warning, marginBottom: 2 },
  injurySection:  { marginBottom: SPACE.md },
  injuryChip: {
    backgroundColor: STATUS.warningBg, borderRadius: RADIUS.full,
    paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm,
    borderWidth: 1, borderColor: STATUS.warning + '40', marginBottom: SPACE.xs,
  },
  injuryChipText: { fontSize: FONT_SIZE.sm, color: STATUS.warning, fontWeight: FONT_WEIGHT.semibold },
  allClear:       { fontSize: FONT_SIZE.sm, color: STATUS.success, fontWeight: FONT_WEIGHT.semibold, textAlign: 'center', padding: SPACE.md },
});
