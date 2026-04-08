import { Ionicons } from '@expo/vector-icons';
import { collection, doc, getDoc, getDocs, orderBy, query, where } from 'firebase/firestore';
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
import {
  BRAND, BRAND_ACCENT, BRAND_DARK, BRAND_LIGHT,
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE, STATUS,
  EFFORT_COLORS,
} from '../constants/design';
import { db } from '../firebaseConfig';
import {
  DEFAULT_ZONE_BOUNDARIES, ZONE_META, calcMaxHR,
  calcZoneBreakdownFromRuns, calcZoneBreakdownFromStream,
  calc8020, formatMinutes, parseBirthdate, parseDurationSeconds,
} from '../zoneConfig';
import { getActiveSeason, getPhaseForSeason, generateVolumeCurve } from './SeasonPlanner';
import { formatTime, calcPace, formatPace } from '../utils/raceUtils';
import RunDetailModal from './RunDetailModal';

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

function formatPaceFromSeconds(totalSec) {
  if (!totalSec || !isFinite(totalSec)) return '--:--';
  const mins = Math.floor(totalSec / 60);
  const secs = Math.round(totalSec % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AthleteDetailScreen({ athlete, school, teamZoneSettings, groups, onBack, parentMode = false }) {
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

  const primaryColor = school?.primaryColor || BRAND;

  // Athlete age for zone calc
  const athleteAge = athlete.birthdate
    ? Math.floor((new Date() - parseBirthdate(athlete.birthdate)) / (365.25 * 86400000))
    : 16;

  const boundaries = teamZoneSettings?.boundaries || DEFAULT_ZONE_BOUNDARIES;
  const customMaxHR = teamZoneSettings?.customMaxHR || null;
  const maxHR = calcMaxHR(athleteAge, customMaxHR);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const schoolId = athlete.schoolId || school?.id;

      const [runsSnap, checkinsSnap, resultsSnap, racesSnap, meetsSnap] = await Promise.all([
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

  // Overtraining signals
  const signals = [];
  const thisMonday = new Date(now);
  const thisDow = thisMonday.getDay();
  thisMonday.setDate(thisMonday.getDate() - (thisDow === 0 ? 6 : thisDow - 1));
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
    activeInjuries.push({ locations: recentCheckins[0].injury.locations || [], severity: recentCheckins[0].injury.severity, streak: injuryStreak });
  }

  // ── Feature 2: Training Quality ──
  const thirtyDaysAgo = new Date(now - 30 * 86400000);
  const recentRuns = allRuns.filter(r => getRunDate(r) >= thirtyDaysAgo);

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

  // ── Feature 3: Season Volume Arc ──
  const seasonKey = activeSeason ? `${activeSeason.sport || 'cross_country'}_${activeSeason.seasonStart?.split?.('T')?.[0] || activeSeason.seasonStart}` : null;
  const volumePlan = seasonKey && athleteGroup?.seasonPlans?.[seasonKey]
    ? athleteGroup.seasonPlans[seasonKey]
    : (activeSeason ? generateVolumeCurve(activeSeason, athleteGroup?.weeklyMilesTarget || 40) : {});
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

  // ── Feature 5: Fitness Fingerprint ──
  const easyPaceWeeks = [];
  for (let w = 0; w < 8; w++) {
    const wStart = new Date(now - (w + 1) * 7 * 86400000);
    const wEnd = new Date(now - w * 7 * 86400000);
    const easyRuns = allRuns.filter(r => {
      const d = getRunDate(r);
      return d >= wStart && d < wEnd && (r.effort || 5) <= 5 && r.miles > 0 && r.duration;
    });
    if (easyRuns.length > 0) {
      const totalSec = easyRuns.reduce((s, r) => s + parseDurationSeconds(r.duration), 0);
      const totalMi = easyRuns.reduce((s, r) => s + (r.miles || 0), 0);
      easyPaceWeeks.unshift({ pace: totalSec / totalMi, runs: easyRuns.length });
    } else {
      easyPaceWeeks.unshift(null);
    }
  }

  const getWeekEasyData = (weeksAgo) => {
    const wStart = new Date(now - (weeksAgo + 1) * 7 * 86400000);
    const wEnd = new Date(now - weeksAgo * 7 * 86400000);
    const runs = allRuns.filter(r => {
      const d = getRunDate(r);
      return d >= wStart && d < wEnd && (r.effort || 5) <= 5 && r.miles > 0 && r.duration && r.heartRate;
    });
    if (runs.length === 0) return null;
    const avgPace = runs.reduce((s, r) => s + parseDurationSeconds(r.duration), 0) / runs.reduce((s, r) => s + r.miles, 0);
    const avgHR = Math.round(runs.reduce((s, r) => s + r.heartRate, 0) / runs.length);
    return { pace: avgPace, hr: avgHR };
  };
  const efficiencyNow = getWeekEasyData(0);
  const efficiency4wk = getWeekEasyData(4);

  const personalBests = {};
  allRuns.forEach(r => {
    if (!r.miles || !r.duration || r.miles < 1) return;
    const pace = parseDurationSeconds(r.duration) / r.miles;
    const effort = r.effort || 5;
    const cat = effort <= 5 ? 'easy' : effort <= 7 ? 'tempo' : 'workout';
    if (!personalBests[cat] || pace < personalBests[cat].pace) {
      personalBests[cat] = { pace, date: getRunDate(r), miles: r.miles };
    }
  });

  // ── Render helpers ──

  const renderGauge = (value, label) => {
    const pct = value ? (value / 5) * 100 : 0;
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

  // ── Render ──

  return (
    <View style={styles.container}>

      {/* Header */}
      {!parentMode && (
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={BRAND_DARK} />
            <Text style={styles.backText}>Back to team</Text>
          </TouchableOpacity>
          <View style={styles.athleteRow}>
            <View style={[styles.avatar, { backgroundColor: athlete.avatarColor || primaryColor }]}>
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
            {eighty20 && (
              <>
                <View style={styles.headerStatDivider} />
                <View style={styles.headerStat}>
                  <Text style={[styles.headerStatNum, {
                    color: eighty20.easyPct >= 78 ? STATUS.success : eighty20.easyPct >= 70 ? STATUS.warning : STATUS.error,
                  }]}>{eighty20.easyPct}%</Text>
                  <Text style={styles.headerStatLabel}>Easy (30d)</Text>
                </View>
              </>
            )}
          </View>
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={BRAND} /></View>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

          {/* Parent mode: athlete name + compact stat cards */}
          {parentMode && (
            <View style={styles.parentHeader}>
              <View style={styles.athleteRow}>
                <View style={[styles.avatar, { backgroundColor: athlete.avatarColor || primaryColor }]}>
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

          {/* ── 1. Readiness & Recovery (coach only) ── */}
          {!parentMode && (<>
          <TouchableOpacity style={styles.section} onPress={() => toggle('readiness')} activeOpacity={0.8}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionNum}>1</Text>
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
                  <Text style={styles.readinessScoreLabel}>/ 10</Text>
                </View>
                <View style={{ flex: 1, gap: SPACE.xs }}>
                  {renderGauge(avg7Sleep, 'Sleep')}
                  {renderGauge(avg7Legs, 'Legs')}
                  {renderGauge(avg7Mood, 'Mood')}
                </View>
              </View>
            ) : (
              <Text style={styles.noDataText}>No check-in data yet for this athlete.</Text>
            )}
          </TouchableOpacity>

          {expandedSection === 'readiness' && (
            <View style={styles.detail}>
              <View style={styles.loadRow}>
                <Text style={styles.detailSectionLabel}>Weekly load</Text>
                <Text style={styles.loadText}>
                  This week: {Math.round(thisWeekMiles * 10) / 10} mi
                  {avg3wk > 0 ? ` · 3-wk avg: ${Math.round(avg3wk * 10) / 10} mi` : ''}
                  {avg3wk > 0 && thisWeekMiles > 0 ? ` (${thisWeekMiles > avg3wk ? '+' : ''}${Math.round(((thisWeekMiles - avg3wk) / avg3wk) * 100)}%)` : ''}
                </Text>
              </View>

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
            </View>
          )}

          </>)}

          {/* ── 2. Training Quality (coach only) ── */}
          {!parentMode && (<>
          <TouchableOpacity style={styles.section} onPress={() => toggle('quality')} activeOpacity={0.8}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionNum}>2</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Training Quality</Text>
                <Text style={styles.sectionSub}>Last 30 days — 80/20 compliance & effort</Text>
              </View>
              <Ionicons name={expandedSection === 'quality' ? 'chevron-up' : 'chevron-down'} size={20} color={NEUTRAL.muted} />
            </View>

            {eighty20 ? (
              <View>
                <View style={styles.heroGauge}>
                  <Text style={[styles.heroGaugeNum, {
                    color: eighty20.easyPct >= 78 ? STATUS.success : eighty20.easyPct >= 70 ? STATUS.warning : STATUS.error,
                  }]}>{eighty20.easyPct}%</Text>
                  <Text style={styles.heroGaugeSub}>Z1+Z2 (easy running)</Text>
                  {hasStreamData && <Text style={styles.streamBadge}>Precise</Text>}
                </View>
                <View style={styles.trendRow}>
                  {weekTrend.map((pct, i) => (
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
              <Text style={styles.noDataText}>Not enough HR or effort data yet.</Text>
            )}
          </TouchableOpacity>

          {expandedSection === 'quality' && (
            <View style={styles.detail}>
              {zoneBreakdown && (
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

              <Text style={styles.detailSectionLabel}>Effort distribution</Text>
              <Text style={styles.detailHint}>Peaks at 3-4 and 8-9 = polarized (good). Clustered at 5-7 = junk miles.</Text>
              <View style={styles.effortChart}>
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <View key={n} style={styles.effortBarWrap}>
                    <View style={[styles.effortBar, { height: Math.max((effortDist[n] / maxEffortCount) * 60, 2), backgroundColor: EFFORT_COLORS?.[n] || NEUTRAL.border }]} />
                    <Text style={styles.effortBarLabel}>{n}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          </>)}

          {/* ── 3. Season Volume Arc ── */}
          <TouchableOpacity style={styles.section} onPress={() => toggle('volume')} activeOpacity={0.8}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionNum}>{parentMode ? '1' : '3'}</Text>
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
                <View style={styles.phaseStrip}>
                  {(phaseInfo.phases || []).map((p, i) => (
                    <View key={i} style={[styles.phaseChip, p.name === phaseInfo.name && { backgroundColor: p.color, borderColor: p.color }]}>
                      <Text style={[styles.phaseChipText, p.name === phaseInfo.name && { color: '#fff' }]}>{p.name.replace('Pre-Season ', 'Pre-')}</Text>
                    </View>
                  ))}
                </View>
                {volumeWeeks.find(w => w.isCurrent) && (() => {
                  const cw = volumeWeeks.find(w => w.isCurrent);
                  const pct = cw.target > 0 ? Math.round((cw.actual / cw.target) * 100) : 0;
                  return <Text style={styles.volumeSummary}>This week: {cw.actual} of {cw.target} mi target ({pct}%)</Text>;
                })()}
              </View>
            ) : (
              <Text style={styles.noDataText}>No season plan configured for this athlete's group.</Text>
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
                        <View style={[styles.volumeTarget, { height: targetH + '%' }]} />
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

          {/* ── 4. Race Performance ── */}
          <TouchableOpacity style={styles.section} onPress={() => toggle('races')} activeOpacity={0.8}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionNum}>{parentMode ? '2' : '4'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Race Performance</Text>
                <Text style={styles.sectionSub}>{myResults.length} race{myResults.length !== 1 ? 's' : ''} this season</Text>
              </View>
              <Ionicons name={expandedSection === 'races' ? 'chevron-up' : 'chevron-down'} size={20} color={NEUTRAL.muted} />
            </View>

            {(() => {
              const distResults = primaryDistance ? myResults.filter(r => r.distanceLabel === primaryDistance) : myResults;
              if (distResults.length === 0) return <Text style={styles.noDataText}>No race results yet.</Text>;
              const best = distResults.reduce((b, r) => (!b || (r.finishTime && r.finishTime < b.finishTime)) ? r : b, null);
              const improvement = distResults.length >= 2 ? distResults[0].finishTime - distResults[distResults.length - 1].finishTime : null;
              return (
                <View>
                  {best && <Text style={styles.prBanner}>{primaryDistance} PR: {formatTime(best.finishTime)} — {best.meet?.name || 'Unknown meet'}</Text>}
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

          {/* ── 5. Fitness Fingerprint (coach only) ── */}
          {!parentMode && (<>
          <TouchableOpacity style={styles.section} onPress={() => toggle('fitness')} activeOpacity={0.8}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionNum}>5</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Fitness Fingerprint</Text>
                <Text style={styles.sectionSub}>Pace trends & aerobic efficiency</Text>
              </View>
              <Ionicons name={expandedSection === 'fitness' ? 'chevron-up' : 'chevron-down'} size={20} color={NEUTRAL.muted} />
            </View>

            {efficiencyNow && efficiency4wk ? (
              <View style={styles.efficiencyRow}>
                <View style={styles.efficiencyBlock}>
                  <Text style={styles.efficiencyLabel}>4 wk ago</Text>
                  <Text style={styles.efficiencyPace}>{formatPaceFromSeconds(efficiency4wk.pace)}/mi</Text>
                  <Text style={styles.efficiencyHR}>@ {efficiency4wk.hr} bpm</Text>
                </View>
                <Ionicons name="arrow-forward" size={18} color={NEUTRAL.muted} />
                <View style={styles.efficiencyBlock}>
                  <Text style={styles.efficiencyLabel}>This week</Text>
                  <Text style={[styles.efficiencyPace, { color: efficiencyNow.pace < efficiency4wk.pace ? STATUS.success : STATUS.error }]}>
                    {formatPaceFromSeconds(efficiencyNow.pace)}/mi
                  </Text>
                  <Text style={styles.efficiencyHR}>@ {efficiencyNow.hr} bpm</Text>
                </View>
              </View>
            ) : easyPaceWeeks.some(w => w != null) ? (
              <Text style={styles.noDataHint}>Easy pace trending — expand for details</Text>
            ) : (
              <Text style={styles.noDataText}>Not enough easy run data with duration to track trends.</Text>
            )}
          </TouchableOpacity>

          {expandedSection === 'fitness' && (
            <View style={styles.detail}>
              <Text style={styles.detailSectionLabel}>Easy run pace (last 8 weeks)</Text>
              <Text style={styles.detailHint}>Shorter bars = faster. Downward trend = improving fitness.</Text>
              <View style={styles.paceChart}>
                {easyPaceWeeks.map((w, i) => {
                  const maxPace = Math.max(...easyPaceWeeks.filter(x => x).map(x => x.pace), 1);
                  const minPace = Math.min(...easyPaceWeeks.filter(x => x).map(x => x.pace), maxPace);
                  const range = maxPace - minPace || 60;
                  const h = w ? Math.max(((w.pace - minPace + 30) / (range + 60)) * 80, 8) : 0;
                  return (
                    <View key={i} style={styles.paceBarWrap}>
                      {w ? (
                        <>
                          <Text style={styles.paceBarValue}>{formatPaceFromSeconds(w.pace)}</Text>
                          <View style={[styles.paceBar, { height: h, backgroundColor: i === 7 ? BRAND : BRAND_ACCENT }]} />
                        </>
                      ) : (
                        <View style={[styles.paceBar, { height: 4, backgroundColor: NEUTRAL.border }]} />
                      )}
                      <Text style={[styles.paceBarLabel, i === 7 && { fontWeight: FONT_WEIGHT.bold, color: BRAND }]}>
                        {i === 7 ? 'Now' : `W${i + 1}`}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {Object.keys(personalBests).length > 0 && (
                <>
                  <Text style={[styles.detailSectionLabel, { marginTop: SPACE.xl }]}>Personal bests (by pace)</Text>
                  {Object.entries(personalBests).map(([cat, pb]) => (
                    <View key={cat} style={styles.pbRow}>
                      <Text style={styles.pbCat}>{cat === 'easy' ? 'Easy run' : cat === 'tempo' ? 'Tempo' : 'Workout'}</Text>
                      <Text style={styles.pbPace}>{formatPaceFromSeconds(pb.pace)}/mi</Text>
                      <Text style={styles.pbDate}>{pb.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
                    </View>
                  ))}
                </>
              )}
            </View>
          )}

          </>)}

          {/* ── 6. Run History ── */}
          <TouchableOpacity style={styles.section} onPress={() => toggle('runs')} activeOpacity={0.8}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionNum}>{parentMode ? '3' : '6'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Run History</Text>
                <Text style={styles.sectionSub}>{allRuns.length} run{allRuns.length !== 1 ? 's' : ''} logged</Text>
              </View>
              <Ionicons name={expandedSection === 'runs' ? 'chevron-up' : 'chevron-down'} size={20} color={NEUTRAL.muted} />
            </View>
          </TouchableOpacity>

          {expandedSection === 'runs' && (
            <View style={styles.detail}>
              {allRuns.length === 0 ? (
                <Text style={styles.detailEmpty}>No runs logged yet.</Text>
              ) : allRuns.slice(0, 20).map(run => {
                const runDate = run.date?.toDate?.()?.toLocaleDateString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric'
                });
                const isThisWeek = run.date?.toDate?.() >= weekStart;
                return (
                  <TouchableOpacity
                    key={run.id}
                    style={[styles.runCard, isThisWeek && { borderLeftColor: BRAND, borderLeftWidth: 3 }]}
                    onPress={() => { setSelectedRun(run); setRunDetailVisible(true); }}
                  >
                    <View style={styles.runTop}>
                      <Text style={styles.runMiles}>{run.miles} mi</Text>
                      <View style={styles.runTopRight}>
                        {isThisWeek && <View style={[styles.weekTag, { backgroundColor: BRAND }]}><Text style={styles.weekTagText}>This week</Text></View>}
                        <Text style={styles.runDate}>{runDate}</Text>
                      </View>
                    </View>
                    <View style={styles.runChips}>
                      {run.duration && <Text style={styles.chip}>{run.duration}</Text>}
                      {run.heartRate && <Text style={styles.chip}>{run.heartRate} bpm avg</Text>}
                      {run.effort && <Text style={[styles.chip, { color: BRAND, borderColor: `${BRAND}60` }]}>Effort {run.effort}/10</Text>}
                      {run.hasStreamData && <Text style={[styles.chip, { color: BRAND, borderColor: BRAND_LIGHT }]}>HR zones</Text>}
                    </View>
                    {run.notes && <Text style={styles.runNote} numberOfLines={1}>"{run.notes}"</Text>}
                  </TouchableOpacity>
                );
              })}
              {allRuns.length > 20 && (
                <Text style={styles.moreRunsText}>{allRuns.length - 20} more runs not shown</Text>
              )}
            </View>
          )}

        </ScrollView>
      )}

      <RunDetailModal
        run={selectedRun}
        visible={runDetailVisible}
        onClose={() => { setRunDetailVisible(false); setSelectedRun(null); }}
        primaryColor={primaryColor}
        athleteAge={athleteAge}
        zoneSettings={{ boundaries }}
        trainingPaces={athlete.trainingPaces || null}
      />
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: NEUTRAL.bg },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
  parentHeader:   { backgroundColor: NEUTRAL.card, padding: SPACE.lg, borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
  parentStats:    { flexDirection: 'row', gap: SPACE.md, marginTop: SPACE.md },
  parentStatCard: { flex: 1, backgroundColor: NEUTRAL.bg, borderRadius: RADIUS.lg, padding: SPACE.md, alignItems: 'center' },
  parentStatNum:  { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  parentStatLabel:{ fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: 2 },
  header:         { backgroundColor: NEUTRAL.card, paddingTop: Platform.OS === 'ios' ? 56 : 32, paddingBottom: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
  backBtn:        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, marginBottom: 12 },
  backText:       { color: BRAND_DARK, fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold },
  athleteRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  avatar:         { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText:     { color: '#fff', fontWeight: FONT_WEIGHT.bold, fontSize: FONT_SIZE.base },
  athleteMeta:    { flex: 1 },
  athleteName:    { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  athleteEmail:   { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: 2 },
  headerStats:    { flexDirection: 'row', alignItems: 'center', backgroundColor: NEUTRAL.bg, borderRadius: RADIUS.lg, padding: SPACE.md, gap: 4 },
  headerStat:     { flex: 1, alignItems: 'center' },
  headerStatNum:  { fontSize: FONT_SIZE.xl - 2, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  headerStatLabel:{ fontSize: 10, color: NEUTRAL.muted, marginTop: 2, textAlign: 'center' },
  headerStatDivider: { width: 1, height: 28, backgroundColor: NEUTRAL.border },
  scroll:         { flex: 1 },

  // ── Sections (mirrors AthleteAnalytics) ──
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

  // ── Readiness ──
  readinessRow:   { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg, marginTop: SPACE.md },
  readinessCircle:{ width: 72, height: 72, borderRadius: 36, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  readinessNum:   { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold },
  readinessScoreLabel: { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted },
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
  injuryChip:     { backgroundColor: STATUS.warningBg, borderRadius: RADIUS.full, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, borderWidth: 1, borderColor: STATUS.warning + '40', marginBottom: SPACE.xs },
  injuryChipText: { fontSize: FONT_SIZE.sm, color: STATUS.warning, fontWeight: FONT_WEIGHT.semibold },
  allClear:       { fontSize: FONT_SIZE.sm, color: STATUS.success, fontWeight: FONT_WEIGHT.semibold, textAlign: 'center', padding: SPACE.md },

  // ── Training Quality ──
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

  // ── Volume Arc ──
  phaseStrip:     { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs, marginTop: SPACE.md },
  phaseChip:      { paddingHorizontal: SPACE.sm, paddingVertical: 3, borderRadius: RADIUS.full, backgroundColor: NEUTRAL.bg, borderWidth: 1, borderColor: NEUTRAL.border },
  phaseChipText:  { fontSize: 10, fontWeight: FONT_WEIGHT.semibold, color: NEUTRAL.body },
  volumeSummary:  { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, marginTop: SPACE.md },
  volumeChartScroll: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, paddingVertical: SPACE.md, minHeight: 130 },
  volumeBar:      { width: 24, alignItems: 'center' },
  volumeBarCurrent: { borderWidth: 1.5, borderColor: BRAND, borderRadius: RADIUS.sm, padding: 1 },
  volumeBarInner: { height: 80, width: 18, justifyContent: 'flex-end', position: 'relative' },
  volumeTarget:   { position: 'absolute', bottom: 0, width: '100%', backgroundColor: NEUTRAL.bg, borderWidth: 1, borderColor: NEUTRAL.border, borderRadius: 2 },
  volumeActual:   { width: '100%', borderRadius: 2 },
  volumeWeekLabel:{ fontSize: 9, color: NEUTRAL.muted, marginTop: 2 },
  volumeLegend:   { flexDirection: 'row', gap: SPACE.lg, marginTop: SPACE.sm },
  legendItem:     { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  legendDot:      { width: 8, height: 8, borderRadius: 4 },
  legendText:     { fontSize: FONT_SIZE.xs, color: NEUTRAL.body },

  // ── Race Performance ──
  prBanner:       { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginTop: SPACE.md },
  improvementText:{ fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, marginTop: SPACE.xs },
  raceCard:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACE.md, borderBottomWidth: 1, borderBottomColor: NEUTRAL.bg },
  raceCardLeft:   { flex: 1 },
  raceCardRight:  { alignItems: 'flex-end' },
  raceMeetName:   { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  raceDate:       { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, marginTop: 2 },
  racePlace:      { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: 2 },
  raceTime:       { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  racePace:       { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, marginTop: 2 },

  // ── Fitness Fingerprint ──
  efficiencyRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.lg, marginTop: SPACE.md },
  efficiencyBlock:{ alignItems: 'center' },
  efficiencyLabel:{ fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginBottom: 2 },
  efficiencyPace: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  efficiencyHR:   { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, marginTop: 2 },
  paceChart:      { flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.xs, height: 100 },
  paceBarWrap:    { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  paceBar:        { width: '100%', borderRadius: 3, minHeight: 2 },
  paceBarValue:   { fontSize: 8, color: NEUTRAL.muted, marginBottom: 2 },
  paceBarLabel:   { fontSize: 9, color: NEUTRAL.muted, marginTop: 2 },
  pbRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACE.sm, borderBottomWidth: 1, borderBottomColor: NEUTRAL.bg },
  pbCat:          { flex: 1, fontSize: FONT_SIZE.sm, color: NEUTRAL.body },
  pbPace:         { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginRight: SPACE.md },
  pbDate:         { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, width: 50, textAlign: 'right' },

  // ── Run History ──
  runCard:        { backgroundColor: NEUTRAL.bg, borderRadius: RADIUS.md, padding: SPACE.md, marginBottom: SPACE.sm },
  runTop:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACE.sm },
  runMiles:       { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  runTopRight:    { alignItems: 'flex-end', gap: 4 },
  weekTag:        { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  weekTagText:    { color: '#fff', fontSize: 10, fontWeight: FONT_WEIGHT.bold },
  runDate:        { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted },
  runChips:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  chip:           { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color: NEUTRAL.label, borderWidth: 1, borderColor: NEUTRAL.border, borderRadius: RADIUS.sm, paddingHorizontal: SPACE.sm, paddingVertical: 3 },
  runNote:        { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, fontStyle: 'italic', marginTop: 4 },
  moreRunsText:   { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, textAlign: 'center', paddingVertical: SPACE.md },
});
