import { Ionicons } from '@expo/vector-icons';
import { collection, getDocs, query, where } from 'firebase/firestore';
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
import { db } from '../firebaseConfig';
import {
  BRAND, BRAND_ACCENT, BRAND_DARK, BRAND_LIGHT,
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE, STATUS,
} from '../constants/design';
import { calcPackAnalysis, formatTime, formatPace } from '../utils/raceUtils';
import { getAthleteWeeklyTarget, getWeekStatus, computeVolumeCompliance } from '../utils/complianceUtils';

export default function CoachAnalytics({
  athletes, athleteWeeklyMiles, athlete3WeekAvg, athleteWeeklyBreakdown = {},
  athleteZonePct, athletePaceEasyPct = {}, overtTrainingAlerts, athleteMiles, groups, school, schoolId, onClose,
}) {
  const [analyticsTab, setAnalyticsTab] = useState('training');
  const [expandedSection, setExpandedSection] = useState(null);
  const [wellnessData, setWellnessData] = useState(null);
  const [loadingWellness, setLoadingWellness] = useState(true);
  const [raceMeets, setRaceMeets] = useState([]);
  const [raceResults, setRaceResults] = useState([]);
  const [races, setRaces] = useState([]);
  const [loadingRaces, setLoadingRaces] = useState(false);

  useEffect(() => { loadWellnessData(); loadRaceData(); }, []);

  const loadRaceData = async () => {
    setLoadingRaces(true);
    try {
      const [meetsSnap, racesSnap, resultsSnap] = await Promise.all([
        getDocs(query(collection(db, 'raceMeets'), where('schoolId', '==', schoolId))),
        getDocs(query(collection(db, 'races'), where('schoolId', '==', schoolId))),
        getDocs(query(collection(db, 'raceResults'), where('schoolId', '==', schoolId))),
      ]);
      const meets = meetsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      meets.sort((a, b) => {
        const aD = a.date?.toDate ? a.date.toDate() : new Date(a.date);
        const bD = b.date?.toDate ? b.date.toDate() : new Date(b.date);
        return aD - bD;
      });
      setRaceMeets(meets);
      setRaces(racesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setRaceResults(resultsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.warn('Failed to load race data:', e); }
    setLoadingRaces(false);
  };

  const loadWellnessData = async () => {
    setLoadingWellness(true);
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
      // Query all recent checkins for this school
      // Try with schoolId filter first, fall back to loading all and filtering client-side
      let checkins = [];
      try {
        const snap = await getDocs(query(
          collection(db, 'checkins'),
          where('schoolId', '==', schoolId),
          where('date', '>=', sevenDaysAgo)
        ));
        checkins = snap.docs.map(d => d.data());
      } catch (indexErr) {
        // If composite index missing, query by schoolId only and filter client-side
        console.warn('Checkins composite query failed, falling back:', indexErr);
        const athleteIds = new Set(athletes.map(a => a.id));
        const fallbackSnap = await getDocs(query(
          collection(db, 'checkins'),
          where('schoolId', '==', schoolId)
        ));
        checkins = fallbackSnap.docs.map(d => d.data()).filter(c => {
          const d = c.date?.toDate?.() || (c.date instanceof Date ? c.date : null);
          return d && d >= sevenDaysAgo;
        });
      }

      // Group by athlete
      const byAthlete = {};
      checkins.forEach(c => {
        if (!byAthlete[c.userId]) byAthlete[c.userId] = [];
        byAthlete[c.userId].push(c);
      });

      // Compute averages per athlete
      const athleteAvgs = {};
      Object.entries(byAthlete).forEach(([uid, checks]) => {
        const avgSleep = checks.reduce((s, c) => s + (c.sleepQuality || 3), 0) / checks.length;
        const avgLegs = checks.reduce((s, c) => s + (c.legFatigue || 3), 0) / checks.length;
        const avgMood = checks.reduce((s, c) => s + (c.mood || 3), 0) / checks.length;

        // Trend: compare last 3 vs all
        const recent = checks.slice(0, 3);
        const recentMood = recent.length > 0 ? recent.reduce((s, c) => s + (c.mood || 3), 0) / recent.length : 3;
        const olderMood = checks.length > 3 ? checks.slice(3).reduce((s, c) => s + (c.mood || 3), 0) / (checks.length - 3) : recentMood;

        // Injury & illness tracking
        const injuryDays = checks.filter(c => c.injury).length;
        const illnessDays = checks.filter(c => c.illness).length;
        const injuryLocations = [...new Set(checks.flatMap(c => c.injury?.locations || []))];
        // Chronic: same body location on 3+ of 7 days
        const locationCounts = {};
        checks.forEach(c => (c.injury?.locations || []).forEach(loc => { locationCounts[loc] = (locationCounts[loc] || 0) + 1; }));
        const hasChronicInjury = Object.values(locationCounts).some(cnt => cnt >= 3);

        athleteAvgs[uid] = {
          avgSleep, avgLegs, avgMood, recentMood, moodDeclining: recentMood < olderMood - 0.5, checkCount: checks.length,
          injuryDays, illnessDays, injuryLocations, hasChronicInjury, locationCounts,
        };
      });

      // Team averages
      const allCheckins = checkins;
      const teamAvgSleep = allCheckins.length > 0 ? allCheckins.reduce((s, c) => s + (c.sleepQuality || 3), 0) / allCheckins.length : null;
      const teamAvgLegs = allCheckins.length > 0 ? allCheckins.reduce((s, c) => s + (c.legFatigue || 3), 0) / allCheckins.length : null;
      const teamAvgMood = allCheckins.length > 0 ? allCheckins.reduce((s, c) => s + (c.mood || 3), 0) / allCheckins.length : null;

      // Injury/illness rates (% of check-ins with injury/illness)
      const injuryRate = allCheckins.length > 0 ? Math.round((allCheckins.filter(c => c.injury).length / allCheckins.length) * 100) : 0;
      const illnessRate = allCheckins.length > 0 ? Math.round((allCheckins.filter(c => c.illness).length / allCheckins.length) * 100) : 0;

      // Active injuries & illnesses grouped by athlete
      const athleteNameMap = {};
      const athleteColorMap = {};
      athletes.forEach(a => { athleteNameMap[a.id] = a; athleteColorMap[a.id] = a.avatarColor; });

      const athleteInjuryMap = {};
      const athleteIllnessMap = {};
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

      allCheckins.forEach(c => {
        const d = c.date?.toDate?.() || (c.date instanceof Date ? c.date : null);
        if (c.injury?.locations?.length > 0) {
          if (!athleteInjuryMap[c.userId]) athleteInjuryMap[c.userId] = { days: 0, locations: new Set(), lastDate: null, severity: 'mild' };
          const entry = athleteInjuryMap[c.userId];
          entry.days++;
          c.injury.locations.forEach(loc => entry.locations.add(loc));
          if (d && (!entry.lastDate || d > entry.lastDate)) entry.lastDate = d;
          if (c.injury.severity === 'severe' || (c.injury.severity === 'moderate' && entry.severity !== 'severe')) entry.severity = c.injury.severity;
        }
        if (c.illness?.symptoms?.length > 0) {
          if (!athleteIllnessMap[c.userId]) athleteIllnessMap[c.userId] = { days: 0, symptoms: new Set(), lastDate: null };
          const entry = athleteIllnessMap[c.userId];
          entry.days++;
          c.illness.symptoms.forEach(sym => entry.symptoms.add(sym));
          if (d && (!entry.lastDate || d > entry.lastDate)) entry.lastDate = d;
        }
      });

      const formatLastReported = (d) => {
        if (!d) return '';
        if (d >= todayStart) return 'last reported today';
        const daysAgo = Math.ceil((todayStart - d) / 86400000);
        return daysAgo === 1 ? 'last reported yesterday' : `last reported ${daysAgo}d ago`;
      };

      const activeInjuries = Object.entries(athleteInjuryMap)
        .map(([uid, data]) => {
          const a = athleteNameMap[uid];
          return {
            id: uid,
            name: a ? `${a.firstName} ${a.lastName}` : 'Unknown',
            initials: a ? `${a.firstName?.[0] || ''}${a.lastName?.[0] || ''}` : '?',
            avatarColor: a?.avatarColor,
            locations: [...data.locations],
            days: data.days,
            severity: data.severity,
            lastReported: formatLastReported(data.lastDate),
          };
        })
        .sort((a, b) => b.days - a.days);

      const activeIllnesses = Object.entries(athleteIllnessMap)
        .map(([uid, data]) => {
          const a = athleteNameMap[uid];
          return {
            id: uid,
            name: a ? `${a.firstName} ${a.lastName}` : 'Unknown',
            initials: a ? `${a.firstName?.[0] || ''}${a.lastName?.[0] || ''}` : '?',
            avatarColor: a?.avatarColor,
            symptoms: [...data.symptoms],
            days: data.days,
            lastReported: formatLastReported(data.lastDate),
          };
        })
        .sort((a, b) => b.days - a.days);

      setWellnessData({ athleteAvgs, teamAvgSleep, teamAvgLegs, teamAvgMood, totalCheckins: allCheckins.length, injuryRate, illnessRate, activeInjuries, activeIllnesses });
    } catch (e) {
      console.warn('Failed to load wellness data:', e);
      setWellnessData({ athleteAvgs: {}, teamAvgSleep: null, teamAvgLegs: null, teamAvgMood: null, totalCheckins: 0 });
    }
    setLoadingWellness(false);
  };

  // ── Metric 1: Volume Compliance (last 3 completed weeks) ──
  const { volumeData, onTarget, underTarget, overTarget } = computeVolumeCompliance(
    athletes, groups, athlete3WeekAvg, athleteWeeklyBreakdown
  );

  // ── Metric 2: Pace Compliance (pace-only, no HR fallback) ──
  const paceOnTarget = [];
  const paceCaution = [];
  const paceTooHard = [];
  const paceNoPaces = [];
  athletes.forEach(a => {
    const pct = athletePaceEasyPct[a.id];
    if (pct === undefined || pct === null) {
      if (!a.trainingPaces) paceNoPaces.push(a);
      return;
    }
    const entry = { ...a, easyPct: pct };
    if (pct >= 78) paceOnTarget.push(entry);
    else if (pct >= 68) paceCaution.push(entry);
    else paceTooHard.push(entry);
  });
  paceTooHard.sort((a, b) => a.easyPct - b.easyPct);
  paceCaution.sort((a, b) => a.easyPct - b.easyPct);
  const athletesWithData = [...paceOnTarget, ...paceCaution, ...paceTooHard];
  const teamAvgEasy = athletesWithData.length > 0
    ? Math.round(athletesWithData.reduce((s, a) => s + a.easyPct, 0) / athletesWithData.length)
    : null;

  // ── Metric 3: Load Progression (last week vs avg of 2 weeks before) ──
  const loadRisks = athletes.map(a => {
    const wb = athleteWeeklyBreakdown[a.id] || { w1: 0, w2: 0, w3: 0 };
    const lastWeek = wb.w1; // last completed week
    const priorAvg = (wb.w2 + wb.w3) / 2; // average of 2 weeks before
    const pctChange = priorAvg > 0 ? Math.round(((lastWeek - priorAvg) / priorAvg) * 100) : 0;
    const alert = overtTrainingAlerts[a.id];
    return { ...a, lastWeek, priorAvg: Math.round(priorAvg * 10) / 10, pctChange, alert: alert?.alert, signals: alert?.signals || [], hasInjury: !!alert?.todayInjury, hasIllness: !!alert?.todayIllness };
  }).filter(a => a.pctChange > 15 || a.alert || a.hasInjury || a.hasIllness)
    .sort((a, b) => (b.signals.length + (b.pctChange > 15 ? 1 : 0) + (b.hasInjury ? 1 : 0) + (b.hasIllness ? 1 : 0))
      - (a.signals.length + (a.pctChange > 15 ? 1 : 0) + (a.hasInjury ? 1 : 0) + (a.hasIllness ? 1 : 0)));

  // ── Metric 4: Pack Compression (boys + girls, top 5 + top 10) ──
  const [packGender, setPackGender] = useState('boys');

  const calcSpread = (gender) => {
    const sorted = [...athletes].filter(a => a.gender === gender).sort((a, b) => (athleteMiles[b.id] || 0) - (athleteMiles[a.id] || 0));
    const topN = Math.min(sorted.length, 5);
    // Spread between #1 and last of the top group (top 5, or however many exist if <5)
    const sTop = topN >= 2 ? Math.round(((athleteMiles[sorted[0]?.id] || 0) - (athleteMiles[sorted[topN - 1]?.id] || 0)) * 10) / 10 : null;
    const s10 = sorted.length >= 10 ? Math.round(((athleteMiles[sorted[0]?.id] || 0) - (athleteMiles[sorted[9]?.id] || 0)) * 10) / 10 : null;
    return { sorted, sTop, s10, count: sorted.length, topN };
  };

  const boysData = calcSpread('boys');
  const girlsData = calcSpread('girls');
  const activePackData = packGender === 'boys' ? boysData : girlsData;
  const top10 = activePackData.sorted.slice(0, 10);
  const maxMiles = top10.length > 0 ? (athleteMiles[top10[0]?.id] || 1) : 1;

  // ── Metric 5: Wellness (last 7 days) ──
  const wellnessAthletes = athletes.filter(a => wellnessData?.athleteAvgs[a.id]);
  const nonReportingAthletes = athletes.filter(a => !wellnessData?.athleteAvgs[a.id]);
  const concernAthletes = wellnessAthletes.filter(a => {
    const d = wellnessData?.athleteAvgs[a.id];
    return d && (d.avgSleep < 2.5 || d.avgLegs < 2.5 || d.moodDeclining || d.hasChronicInjury);
  });

  const toggle = (section) => setExpandedSection(expandedSection === section ? null : section);

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

  const renderRateGauge = (pctValue, label) => {
    const color = pctValue <= 10 ? STATUS.success : pctValue <= 25 ? STATUS.warning : STATUS.error;
    return (
      <View style={styles.gauge}>
        <Text style={styles.gaugeLabel}>{label}</Text>
        <View style={styles.gaugeBg}>
          <View style={[styles.gaugeFill, { width: Math.min(pctValue, 100) + '%', backgroundColor: color }]} />
        </View>
        <Text style={[styles.gaugeValue, { color }]}>{pctValue}%</Text>
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
        <Text style={styles.headerTitle}>Team Analytics</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Tab bar */}
      <View style={styles.tabRow}>
        {[{ key: 'training', label: 'Training' }, { key: 'races', label: 'Races' }].map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, analyticsTab === t.key && { borderBottomColor: BRAND, borderBottomWidth: 2 }]}
            onPress={() => setAnalyticsTab(t.key)}
          >
            <Text style={[styles.tabText, analyticsTab === t.key && { color: BRAND, fontWeight: FONT_WEIGHT.bold }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {analyticsTab === 'training' ? (
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ── 1. Volume Compliance (last 3 weeks) ── */}
        <TouchableOpacity style={styles.section} onPress={() => toggle('volume')} activeOpacity={0.8}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionNum}>1</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Volume Compliance</Text>
              <Text style={styles.sectionSub}>Last 3 weeks — consistently under or over target?</Text>
            </View>
            <Ionicons name={expandedSection === 'volume' ? 'chevron-up' : 'chevron-down'} size={20} color={NEUTRAL.muted} />
          </View>
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { backgroundColor: STATUS.warningBg }]}>
              <Text style={[styles.summaryNum, { color: STATUS.warning }]}>{underTarget.length}</Text>
              <Text style={styles.summaryLabel}>Under</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: STATUS.successBg }]}>
              <Text style={[styles.summaryNum, { color: STATUS.success }]}>{onTarget.length}</Text>
              <Text style={styles.summaryLabel}>On target</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: STATUS.errorBg }]}>
              <Text style={[styles.summaryNum, { color: STATUS.error }]}>{overTarget.length}</Text>
              <Text style={styles.summaryLabel}>Over</Text>
            </View>
          </View>
        </TouchableOpacity>
        {expandedSection === 'volume' && (
          <View style={styles.detail}>
            {[...underTarget, ...overTarget].map(a => {
              const weekDots = [
                { label: '3w ago', miles: a.wb.w3, status: a.w3Status },
                { label: '2w ago', miles: a.wb.w2, status: a.w2Status },
                { label: 'Last wk', miles: a.wb.w1, status: a.w1Status },
              ];
              const statusIcon = { on: 'checkmark-circle', under: 'arrow-down-circle', over: 'arrow-up-circle' };
              return (
                <View key={a.id} style={styles.detailRow}>
                  <View style={[styles.detailAvatar, { backgroundColor: a.avatarColor || BRAND }]}>
                    <Text style={styles.detailAvatarText}>{a.firstName?.[0]}{a.lastName?.[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailName}>{a.firstName} {a.lastName}</Text>
                    <Text style={styles.detailSub}>Target: {a.target || '—'} mi/wk</Text>
                    <View style={styles.weekDotsRow}>
                      {weekDots.map((w, i) => (
                        <View key={i} style={styles.weekDot}>
                          <Ionicons
                            name={statusIcon[w.status] || 'ellipse'}
                            size={16}
                            color={w.status === 'on' ? STATUS.success : w.status === 'under' ? STATUS.warning : w.status === 'over' ? STATUS.error : NEUTRAL.input}
                          />
                          <Text style={styles.weekDotMiles}>{w.miles}</Text>
                          <Text style={styles.weekDotLabel}>{w.label}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: a.status === 'under' ? STATUS.warningBg : STATUS.errorBg }]}>
                    <Text style={[styles.statusText, { color: a.status === 'under' ? STATUS.warning : STATUS.error }]}>{a.status === 'under' ? 'Under' : 'Over'}</Text>
                  </View>
                </View>
              );
            })}
            {underTarget.length === 0 && overTarget.length === 0 && (
              <Text style={styles.detailEmpty}>All athletes have been on target over the last 3 weeks.</Text>
            )}
          </View>
        )}

        {/* ── 2. Pace Compliance ── */}
        <TouchableOpacity style={styles.section} onPress={() => toggle('intensity')} activeOpacity={0.8}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionNum}>2</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Pace Compliance</Text>
              <Text style={styles.sectionSub}>Is the team running easy enough?</Text>
            </View>
            <Ionicons name={expandedSection === 'intensity' ? 'chevron-up' : 'chevron-down'} size={20} color={NEUTRAL.muted} />
          </View>
          <View style={styles.intensityRow}>
            <Text style={[styles.intensityNum, { color: teamAvgEasy === null ? NEUTRAL.muted : teamAvgEasy >= 78 ? STATUS.success : teamAvgEasy >= 68 ? STATUS.warning : STATUS.error }]}>
              {teamAvgEasy !== null ? teamAvgEasy + '%' : '—'}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.intensityLabel}>Team avg easy %</Text>
              <Text style={styles.intensitySub}>
                {paceOnTarget.length > 0 ? `${paceOnTarget.length} on target` : ''}
                {paceCaution.length > 0 ? `${paceOnTarget.length > 0 ? ', ' : ''}${paceCaution.length} caution` : ''}
                {paceTooHard.length > 0 ? `${paceOnTarget.length + paceCaution.length > 0 ? ', ' : ''}${paceTooHard.length} too hard` : ''}
                {paceNoPaces.length > 0 ? `${athletesWithData.length > 0 ? ', ' : ''}${paceNoPaces.length} need paces` : ''}
                {athletesWithData.length === 0 && paceNoPaces.length === 0 ? 'No data yet' : ''}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
        {expandedSection === 'intensity' && (
          <View style={styles.detail}>
            {paceTooHard.length > 0 && (
              <View style={{ marginBottom: SPACE.md }}>
                <Text style={[styles.detailGroupLabel, { color: STATUS.error }]}>Too hard (easy &lt; 68%)</Text>
                {paceTooHard.map(a => (
                  <View key={a.id} style={styles.detailRow}>
                    <View style={[styles.detailAvatar, { backgroundColor: a.avatarColor || BRAND }]}>
                      <Text style={styles.detailAvatarText}>{a.firstName?.[0]}{a.lastName?.[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detailName}>{a.firstName} {a.lastName}</Text>
                      <Text style={styles.detailSub}>Easy: {a.easyPct}% (target: 80%)</Text>
                    </View>
                    <Text style={[styles.pctBadge, { color: STATUS.error }]}>{a.easyPct}%</Text>
                  </View>
                ))}
              </View>
            )}
            {paceCaution.length > 0 && (
              <View style={{ marginBottom: SPACE.md }}>
                <Text style={[styles.detailGroupLabel, { color: STATUS.warning }]}>Caution (68–77%)</Text>
                {paceCaution.map(a => (
                  <View key={a.id} style={styles.detailRow}>
                    <View style={[styles.detailAvatar, { backgroundColor: a.avatarColor || BRAND }]}>
                      <Text style={styles.detailAvatarText}>{a.firstName?.[0]}{a.lastName?.[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detailName}>{a.firstName} {a.lastName}</Text>
                      <Text style={styles.detailSub}>Easy: {a.easyPct}% (target: 80%)</Text>
                    </View>
                    <Text style={[styles.pctBadge, { color: STATUS.warning }]}>{a.easyPct}%</Text>
                  </View>
                ))}
              </View>
            )}
            {paceOnTarget.length > 0 && (
              <View style={{ marginBottom: SPACE.md }}>
                <Text style={[styles.detailGroupLabel, { color: STATUS.success }]}>On target (≥ 78%)</Text>
                {paceOnTarget.map(a => (
                  <View key={a.id} style={styles.detailRow}>
                    <View style={[styles.detailAvatar, { backgroundColor: a.avatarColor || BRAND }]}>
                      <Text style={styles.detailAvatarText}>{a.firstName?.[0]}{a.lastName?.[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detailName}>{a.firstName} {a.lastName}</Text>
                      <Text style={styles.detailSub}>Easy: {a.easyPct}%</Text>
                    </View>
                    <Text style={[styles.pctBadge, { color: STATUS.success }]}>{a.easyPct}%</Text>
                  </View>
                ))}
              </View>
            )}
            {paceNoPaces.length > 0 && (
              <View style={{ marginBottom: SPACE.md }}>
                <Text style={[styles.detailGroupLabel, { color: NEUTRAL.muted }]}>Need training paces</Text>
                {paceNoPaces.map(a => (
                  <View key={a.id} style={styles.detailRow}>
                    <View style={[styles.detailAvatar, { backgroundColor: a.avatarColor || BRAND }]}>
                      <Text style={styles.detailAvatarText}>{a.firstName?.[0]}{a.lastName?.[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detailName}>{a.firstName} {a.lastName}</Text>
                      <Text style={[styles.detailSub, { fontStyle: 'italic' }]}>No paces set</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
            {athletesWithData.length === 0 && paceNoPaces.length === 0 && (
              <Text style={styles.detailEmpty}>No pace data yet. Athletes need to set training paces in their profile.</Text>
            )}
          </View>
        )}

        {/* ── 3. Load Progression ── */}
        <TouchableOpacity style={styles.section} onPress={() => toggle('load')} activeOpacity={0.8}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionNum}>3</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Load & Injury Risk</Text>
              <Text style={styles.sectionSub}>Last week vs prior 2-week avg — anyone >15% up?</Text>
            </View>
            <Ionicons name={expandedSection === 'load' ? 'chevron-up' : 'chevron-down'} size={20} color={NEUTRAL.muted} />
          </View>
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { backgroundColor: loadRisks.length === 0 ? STATUS.successBg : STATUS.errorBg }]}>
              <Text style={[styles.summaryNum, { color: loadRisks.length === 0 ? STATUS.success : STATUS.error }]}>{loadRisks.length}</Text>
              <Text style={styles.summaryLabel}>At risk</Text>
            </View>
          </View>
        </TouchableOpacity>
        {expandedSection === 'load' && (
          <View style={styles.detail}>
            {loadRisks.length === 0 ? (
              <Text style={styles.detailEmpty}>No athletes showing elevated injury risk this week.</Text>
            ) : loadRisks.map(a => (
              <View key={a.id} style={styles.detailRow}>
                <View style={[styles.detailAvatar, { backgroundColor: a.avatarColor || BRAND }]}>
                  <Text style={styles.detailAvatarText}>{a.firstName?.[0]}{a.lastName?.[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailName}>{a.firstName} {a.lastName}</Text>
                  <Text style={styles.detailSub}>Last wk: {a.lastWeek} mi (prior avg {a.priorAvg}){a.pctChange > 15 ? ` · ${a.pctChange}% up` : ''}</Text>
                  {a.signals.map((sig, i) => (
                    <Text key={i} style={styles.signalText}>• {sig}</Text>
                  ))}
                  {a.hasInjury && !a.signals.some(s => s.includes('injury')) && (
                    <Text style={styles.signalText}>• Reported injury this week</Text>
                  )}
                  {a.hasIllness && !a.signals.some(s => s.includes('illness')) && (
                    <Text style={styles.signalText}>• Reported illness this week</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── 4. Pack Compression ── */}
        <TouchableOpacity style={styles.section} onPress={() => toggle('pack')} activeOpacity={0.8}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionNum}>4</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Pack Compression</Text>
              <Text style={styles.sectionSub}>Top 5 spread and bench depth</Text>
            </View>
            <Ionicons name={expandedSection === 'pack' ? 'chevron-up' : 'chevron-down'} size={20} color={NEUTRAL.muted} />
          </View>
          {/* At-a-glance: boys and girls spread */}
          <View style={styles.packSummaryRow}>
            {boysData.count > 0 && (
              <View style={styles.packSummaryCol}>
                <Text style={styles.packSummaryTitle}>Boys Top {boysData.topN}</Text>
                <Text style={styles.spreadNum}>{boysData.sTop !== null ? boysData.sTop + ' mi' : '—'}</Text>
                {boysData.sTop !== null && <Text style={styles.packSummaryHint}>spread</Text>}
              </View>
            )}
            {girlsData.count > 0 && (
              <View style={styles.packSummaryCol}>
                <Text style={styles.packSummaryTitle}>Girls Top {girlsData.topN}</Text>
                <Text style={styles.spreadNum}>{girlsData.sTop !== null ? girlsData.sTop + ' mi' : '—'}</Text>
                {girlsData.sTop !== null && <Text style={styles.packSummaryHint}>spread</Text>}
              </View>
            )}
          </View>
        </TouchableOpacity>
        {expandedSection === 'pack' && (
          <View style={styles.detail}>
            <View style={styles.packGenderRow}>
              {['boys', 'girls'].map(g => (
                <TouchableOpacity key={g} style={[styles.packGenderBtn, packGender === g && styles.packGenderBtnActive]} onPress={() => setPackGender(g)}>
                  <Text style={[styles.packGenderText, packGender === g && styles.packGenderTextActive]}>{g === 'boys' ? 'Boys' : 'Girls'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {activePackData.sTop !== null && (
              <View style={styles.spreadGroup}>
                <View style={styles.spreadRow}>
                  <Text style={styles.spreadNum}>{activePackData.sTop} mi</Text>
                  <Text style={styles.spreadLabel}>spread #1–#{activePackData.topN}</Text>
                </View>
                {activePackData.s10 !== null && (
                  <View style={styles.spreadRow}>
                    <Text style={[styles.spreadNum, { color: NEUTRAL.body }]}>{activePackData.s10} mi</Text>
                    <Text style={styles.spreadLabel}>spread #1–#10 (bench)</Text>
                  </View>
                )}
              </View>
            )}
            {top10.map((a, i) => {
              const miles = athleteMiles[a.id] || 0;
              const barWidth = maxMiles > 0 ? (miles / maxMiles) * 100 : 0;
              const isTop5 = i < 5;
              return (
                <View key={a.id} style={styles.packRow}>
                  <Text style={[styles.packRank, !isTop5 && { color: NEUTRAL.input }]}>#{i + 1}</Text>
                  <View style={[styles.packAvatar, { backgroundColor: a.avatarColor || BRAND, opacity: isTop5 ? 1 : 0.6 }]}>
                    <Text style={styles.packAvatarText}>{a.firstName?.[0]}{a.lastName?.[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.packName, !isTop5 && { color: NEUTRAL.body }]}>{a.firstName} {a.lastName}</Text>
                    <View style={styles.packBarBg}>
                      <View style={[styles.packBarFill, { width: barWidth + '%', backgroundColor: isTop5 ? BRAND : BRAND_ACCENT }]} />
                    </View>
                  </View>
                  <Text style={[styles.packMiles, !isTop5 && { color: NEUTRAL.body }]}>{miles.toFixed(1)}</Text>
                </View>
              );
            })}
            {top10.length === 0 && <Text style={styles.detailEmpty}>No {packGender} athletes with data for this period.</Text>}
          </View>
        )}

        {/* ── 5. Wellness Trends ── */}
        <TouchableOpacity style={styles.section} onPress={() => toggle('wellness')} activeOpacity={0.8}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionNum}>5</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Wellness & Readiness</Text>
              <Text style={styles.sectionSub}>Last 7 days — {wellnessAthletes.length}/{athletes.length} athletes reporting</Text>
            </View>
            <Ionicons name={expandedSection === 'wellness' ? 'chevron-up' : 'chevron-down'} size={20} color={NEUTRAL.muted} />
          </View>
          {loadingWellness ? (
            <ActivityIndicator color={BRAND} style={{ marginVertical: SPACE.md }} />
          ) : wellnessData?.totalCheckins > 0 ? (
            <View>
              <View style={styles.gaugeGroup}>
                {renderGauge(wellnessData.teamAvgSleep, 'Sleep')}
                {renderGauge(wellnessData.teamAvgLegs, 'Legs')}
                {renderGauge(wellnessData.teamAvgMood, 'Mood')}
              </View>
              {(wellnessData.injuryRate > 0 || wellnessData.illnessRate > 0) && (
                <View style={[styles.gaugeGroup, { marginTop: SPACE.md }]}>
                  {renderRateGauge(wellnessData.injuryRate, '🩹 Injury rate')}
                  {renderRateGauge(wellnessData.illnessRate, '🤒 Illness rate')}
                </View>
              )}
              {concernAthletes.length > 0 && (
                <Text style={styles.wellnessConcernHint}>{concernAthletes.length} athlete{concernAthletes.length > 1 ? 's' : ''} showing concern signals</Text>
              )}
            </View>
          ) : (
            <Text style={styles.noDataText}>No check-in data yet. Athletes will be prompted to check in daily.</Text>
          )}
        </TouchableOpacity>
        {expandedSection === 'wellness' && (
          <View style={styles.detail}>
            {/* Active injuries grouped by athlete */}
            {wellnessData?.activeInjuries?.length > 0 && (
              <View style={styles.activeInjurySection}>
                <Text style={styles.activeInjurySectionTitle}>🩹 Active injuries this week</Text>
                {wellnessData.activeInjuries.map(inj => {
                  const sevColor = inj.severity === 'severe' ? STATUS.error : inj.severity === 'moderate' ? STATUS.warning : NEUTRAL.body;
                  return (
                    <View key={inj.id} style={styles.activeInjuryChip}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                        <View style={[styles.detailAvatar, { backgroundColor: inj.avatarColor || BRAND }]}>
                          <Text style={styles.detailAvatarText}>{inj.initials}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.activeInjuryLabel}>{inj.name}</Text>
                          <Text style={styles.activeInjuryNames}>
                            {inj.locations.map(l => l.charAt(0).toUpperCase() + l.slice(1)).join(', ')}
                            {inj.severity !== 'mild' ? ` · ${inj.severity}` : ''}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[styles.activeInjuryDays, { color: sevColor }]}>{inj.days} of 7d</Text>
                          <Text style={styles.activeInjuryWhen}>{inj.lastReported}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
            {/* Active illnesses grouped by athlete */}
            {wellnessData?.activeIllnesses?.length > 0 && (
              <View style={styles.activeInjurySection}>
                <Text style={styles.activeInjurySectionTitle}>🤒 Active illness this week</Text>
                {wellnessData.activeIllnesses.map(ill => (
                  <View key={ill.id} style={[styles.activeInjuryChip, { borderLeftColor: STATUS.warning }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                      <View style={[styles.detailAvatar, { backgroundColor: ill.avatarColor || BRAND }]}>
                        <Text style={styles.detailAvatarText}>{ill.initials}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.activeInjuryLabel}>{ill.name}</Text>
                        <Text style={styles.activeInjuryNames}>
                          {ill.symptoms.map(s => s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())).join(', ')}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.activeInjuryDays, { color: STATUS.warning }]}>{ill.days} of 7d</Text>
                        <Text style={styles.activeInjuryWhen}>{ill.lastReported}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* All athletes sorted: concerns first, then healthy reporters, then non-reporting */}
            {athletes.length === 0 ? (
              <Text style={styles.detailEmpty}>No athletes on the team.</Text>
            ) : (
              <>
                {/* Athletes with data — sorted by concern level */}
                {[...wellnessAthletes]
                  .sort((a, b) => {
                    const aConcern = concernAthletes.includes(a) ? 0 : 1;
                    const bConcern = concernAthletes.includes(b) ? 0 : 1;
                    return aConcern - bConcern;
                  })
                  .map(a => {
                    const d = wellnessData.athleteAvgs[a.id];
                    const hasConcern = concernAthletes.includes(a);
                    return (
                      <View key={a.id} style={[styles.detailRow, hasConcern && { backgroundColor: STATUS.errorBg, borderRadius: RADIUS.sm, marginHorizontal: -SPACE.xs, paddingHorizontal: SPACE.xs }]}>
                        <View style={[styles.detailAvatar, { backgroundColor: a.avatarColor || BRAND }]}>
                          <Text style={styles.detailAvatarText}>{a.firstName?.[0]}{a.lastName?.[0]}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.detailName}>{a.firstName} {a.lastName}</Text>
                          {hasConcern && d.avgSleep < 2.5 && <Text style={styles.signalText}>• Poor sleep</Text>}
                          {hasConcern && d.avgLegs < 2.5 && <Text style={styles.signalText}>• Heavy legs</Text>}
                          {hasConcern && d.moodDeclining && <Text style={styles.signalText}>• Mood declining</Text>}
                          {hasConcern && d.hasChronicInjury && <Text style={styles.signalText}>• Chronic injury risk</Text>}
                        </View>
                        <View style={styles.wellnessScores}>
                          <Text style={[styles.wellnessScore, { color: d.avgSleep < 2.5 ? STATUS.error : d.avgSleep < 3.5 ? STATUS.warning : STATUS.success }]}>😴 {d.avgSleep.toFixed(1)}</Text>
                          <Text style={[styles.wellnessScore, { color: d.avgLegs < 2.5 ? STATUS.error : d.avgLegs < 3.5 ? STATUS.warning : STATUS.success }]}>🦵 {d.avgLegs.toFixed(1)}</Text>
                          <Text style={[styles.wellnessScore, { color: d.avgMood < 2.5 ? STATUS.error : d.avgMood < 3.5 ? STATUS.warning : STATUS.success }]}>😊 {d.avgMood.toFixed(1)}</Text>
                          {d.injuryDays > 0 && <Text style={[styles.wellnessScore, { color: STATUS.warning }]}>🩹 {d.injuryDays}/7d</Text>}
                          {d.illnessDays > 0 && <Text style={[styles.wellnessScore, { color: STATUS.warning }]}>🤒 {d.illnessDays}/7d</Text>}
                        </View>
                      </View>
                    );
                  })}

                {/* Non-reporting athletes */}
                {nonReportingAthletes.length > 0 && (
                  <>
                    <Text style={[styles.detailSectionLabel, { marginTop: SPACE.md }]}>Not reporting ({nonReportingAthletes.length})</Text>
                    {nonReportingAthletes.map(a => (
                      <View key={a.id} style={styles.detailRow}>
                        <View style={[styles.detailAvatar, { backgroundColor: a.avatarColor || BRAND, opacity: 0.4 }]}>
                          <Text style={styles.detailAvatarText}>{a.firstName?.[0]}{a.lastName?.[0]}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.detailName, { color: NEUTRAL.muted }]}>{a.firstName} {a.lastName}</Text>
                        </View>
                        <Text style={styles.detailSub}>No data</Text>
                      </View>
                    ))}
                  </>
                )}
              </>
            )}
          </View>
        )}

      </ScrollView>
      ) : (
      /* ── Race Analytics Tab ── */
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {loadingRaces ? (
          <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator size="large" color={BRAND} /></View>
        ) : raceMeets.length === 0 ? (
          <View style={[styles.section, { alignItems: 'center', marginTop: SPACE.xl }]}>
            <Text style={{ fontSize: 40, marginBottom: SPACE.md }}>🏁</Text>
            <Text style={styles.sectionTitle}>No race data yet</Text>
            <Text style={[styles.sectionSub, { textAlign: 'center', marginTop: SPACE.sm }]}>
              Create meets and enter results in Training {'>'} Races to see analytics here.
            </Text>
          </View>
        ) : (() => {
          // Build per-race pack analysis for races with results
          const raceAnalytics = [];
          for (const meet of raceMeets) {
            const meetRaces = races.filter(r => r.meetId === meet.id);
            for (const race of meetRaces) {
              const results = raceResults.filter(r => r.raceId === race.id);
              if (results.length === 0) continue;
              const pack = calcPackAnalysis(results);
              if (!pack || pack.scorerCount < 5) continue;
              const meetDate = meet.date?.toDate ? meet.date.toDate() : new Date(meet.date);
              raceAnalytics.push({ meet, race, pack, date: meetDate });
            }
          }
          raceAnalytics.sort((a, b) => a.date - b.date);

          if (raceAnalytics.length === 0) {
            return (
              <View style={[styles.section, { alignItems: 'center', marginTop: SPACE.xl }]}>
                <Text style={styles.sectionTitle}>No complete results yet</Text>
                <Text style={[styles.sectionSub, { textAlign: 'center', marginTop: SPACE.sm }]}>
                  Enter results for at least 5 athletes in a race to see pack analysis.
                </Text>
              </View>
            );
          }

          // Season trend: 1-5 spread over time
          const latestPack = raceAnalytics[raceAnalytics.length - 1]?.pack;
          const firstPack = raceAnalytics[0]?.pack;
          const spreadImproved = raceAnalytics.length >= 2 && latestPack.spread15 < firstPack.spread15;

          return (
            <>
              {/* Season overview */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionNum}>{raceAnalytics.length}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>Races with Results</Text>
                    <Text style={styles.sectionSub}>Season pack spread trend</Text>
                  </View>
                </View>
                {raceAnalytics.length >= 2 && (
                  <View style={[styles.summaryRow, { marginTop: SPACE.md }]}>
                    <View style={[styles.summaryCard, { backgroundColor: spreadImproved ? '#e8f5e9' : '#fff3e0' }]}>
                      <Text style={[styles.summaryNum, { color: spreadImproved ? '#2e7d32' : '#e65100' }]}>
                        {spreadImproved ? '↓' : '↑'} {formatTime(Math.abs(latestPack.spread15 - firstPack.spread15))}
                      </Text>
                      <Text style={styles.summaryLabel}>Spread change</Text>
                    </View>
                    <View style={[styles.summaryCard, { backgroundColor: BRAND_LIGHT }]}>
                      <Text style={[styles.summaryNum, { color: BRAND }]}>{formatTime(latestPack.spread15)}</Text>
                      <Text style={styles.summaryLabel}>Current 1-5 spread</Text>
                    </View>
                  </View>
                )}
              </View>

              {/* Per-race breakdown */}
              {raceAnalytics.map((ra, i) => (
                <View key={`${ra.race.id}`} style={styles.section}>
                  <Text style={styles.sectionTitle}>{ra.meet.name}</Text>
                  <Text style={styles.sectionSub}>
                    {ra.race.label} · {ra.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                  <View style={[styles.summaryRow, { marginTop: SPACE.md }]}>
                    <View style={[styles.summaryCard, { backgroundColor: NEUTRAL.bg }]}>
                      <Text style={[styles.summaryNum, { color: BRAND_DARK }]}>{formatTime(ra.pack.spread15)}</Text>
                      <Text style={styles.summaryLabel}>1-5 Spread</Text>
                    </View>
                    <View style={[styles.summaryCard, { backgroundColor: NEUTRAL.bg }]}>
                      <Text style={[styles.summaryNum, { color: BRAND_DARK }]}>{formatTime(ra.pack.teamAvg)}</Text>
                      <Text style={styles.summaryLabel}>Team Avg</Text>
                    </View>
                    {ra.pack.teamScore && (
                      <View style={[styles.summaryCard, { backgroundColor: NEUTRAL.bg }]}>
                        <Text style={[styles.summaryNum, { color: BRAND_DARK }]}>{ra.pack.teamScore}</Text>
                        <Text style={styles.summaryLabel}>Score</Text>
                      </View>
                    )}
                  </View>
                  {ra.pack.runner6 && (
                    <Text style={[styles.sectionSub, { marginTop: SPACE.sm }]}>
                      #6 {ra.pack.runner6.name} (+{formatTime(ra.pack.gap6to5)}) · #7 {ra.pack.runner7?.name || '—'} {ra.pack.gap7to5 ? `(+${formatTime(ra.pack.gap7to5)})` : ''}
                    </Text>
                  )}
                </View>
              ))}
            </>
          );
        })()}
      </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: NEUTRAL.bg },
  header:          { backgroundColor: NEUTRAL.card, paddingTop: Platform.OS === 'ios' ? 56 : 32, paddingBottom: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tabRow:          { flexDirection: 'row', backgroundColor: NEUTRAL.card, borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
  tab:             { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText:         { fontSize: FONT_SIZE.sm, color: NEUTRAL.muted },
  backBtn:         { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
  backText:        { color: BRAND_DARK, fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold },
  headerTitle:     { fontSize: FONT_SIZE.xl - 2, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  scroll:          { flex: 1 },
  section:         { backgroundColor: NEUTRAL.card, marginHorizontal: SPACE.lg, marginTop: SPACE.md, borderRadius: RADIUS.lg, padding: SPACE.lg, ...SHADOW.sm },
  sectionHeader:   { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  sectionNum:      { width: 28, height: 28, borderRadius: RADIUS.full, backgroundColor: BRAND_LIGHT, textAlign: 'center', lineHeight: 28, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND, overflow: 'hidden' },
  sectionTitle:    { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  sectionSub:      { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: 1 },
  summaryRow:      { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.md },
  summaryCard:     { flex: 1, borderRadius: RADIUS.md, padding: SPACE.md, alignItems: 'center' },
  summaryNum:      { fontSize: FONT_SIZE['2xl'], fontWeight: FONT_WEIGHT.bold },
  summaryLabel:    { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, marginTop: 2 },
  intensityRow:    { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg, marginTop: SPACE.md },
  intensityNum:    { fontSize: FONT_SIZE['2xl'], fontWeight: FONT_WEIGHT.bold },
  intensityLabel:  { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: BRAND_DARK },
  intensitySub:    { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: 2 },
  packSummaryRow:  { flexDirection: 'row', gap: SPACE.lg, marginTop: SPACE.md },
  packSummaryCol:  { flex: 1, alignItems: 'center' },
  packSummaryTitle:{ fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold, color: NEUTRAL.body, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: SPACE.xs },
  packSummaryHint: { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: 2 },
  weekDotsRow:     { flexDirection: 'row', gap: SPACE.md, marginTop: SPACE.sm },
  weekDot:         { alignItems: 'center', gap: 2 },
  weekDotCircle:   { width: 10, height: 10, borderRadius: 5 },
  weekDotMiles:    { fontSize: 10, fontWeight: FONT_WEIGHT.semibold, color: BRAND_DARK },
  weekDotLabel:    { fontSize: 9, color: NEUTRAL.muted },
  packGenderRow:   { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.md, marginBottom: SPACE.sm },
  packGenderBtn:   { borderRadius: RADIUS.sm, borderWidth: 1.5, borderColor: NEUTRAL.border, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, backgroundColor: NEUTRAL.card },
  packGenderBtnActive: { backgroundColor: BRAND, borderColor: BRAND },
  packGenderText:  { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: NEUTRAL.body },
  packGenderTextActive: { color: '#fff' },
  spreadGroup:     { gap: SPACE.sm, marginTop: SPACE.md },
  spreadRow:       { flexDirection: 'row', alignItems: 'baseline', gap: SPACE.sm },
  spreadNum:       { fontSize: FONT_SIZE['2xl'], fontWeight: FONT_WEIGHT.bold, color: BRAND },
  spreadLabel:     { fontSize: FONT_SIZE.sm, color: NEUTRAL.body },
  detail:          { backgroundColor: NEUTRAL.card, marginHorizontal: SPACE.lg, marginTop: 1, borderBottomLeftRadius: RADIUS.lg, borderBottomRightRadius: RADIUS.lg, padding: SPACE.lg, paddingTop: SPACE.sm, ...SHADOW.sm },
  detailRow:       { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.sm, borderBottomWidth: 1, borderBottomColor: NEUTRAL.bg },
  detailAvatar:    { width: 32, height: 32, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
  detailAvatarText:{ color: '#fff', fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold },
  detailGroupLabel:{ fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, marginBottom: SPACE.xs, letterSpacing: 0.5 },
  detailName:      { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: BRAND_DARK },
  detailSub:       { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: 1 },
  detailEmpty:     { fontSize: FONT_SIZE.sm, color: NEUTRAL.muted, textAlign: 'center', paddingVertical: SPACE.md },
  statusBadge:     { borderRadius: RADIUS.sm, paddingHorizontal: SPACE.sm, paddingVertical: 3 },
  statusText:      { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold },
  pctBadge:        { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  signalText:      { fontSize: FONT_SIZE.xs, color: STATUS.error, marginTop: 2 },
  noDataText:      { fontSize: FONT_SIZE.sm, color: NEUTRAL.muted, marginTop: SPACE.md, textAlign: 'center' },
  activeInjurySection:      { marginTop: SPACE.lg },
  activeInjurySectionTitle: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: SPACE.sm },
  activeInjuryChip:         { backgroundColor: STATUS.errorBg, borderRadius: RADIUS.md, padding: SPACE.md, marginBottom: SPACE.sm, borderLeftWidth: 3, borderLeftColor: STATUS.error },
  activeInjuryLabel:        { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  activeInjuryNames:        { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, marginTop: 2 },
  activeInjuryDays:         { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },
  activeInjuryWhen:         { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, marginTop: 1 },
  wellnessConcernHint: { fontSize: FONT_SIZE.xs, color: STATUS.warning, fontWeight: FONT_WEIGHT.semibold, marginTop: SPACE.md },
  wellnessScores:  { flexDirection: 'row', gap: SPACE.sm },
  wellnessScore:   { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold },
  detailSectionLabel: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, color: NEUTRAL.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: SPACE.sm, marginTop: SPACE.xs },
  packGlanceSection: { marginTop: SPACE.md },
  packGlanceTitle: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: SPACE.sm },
  packGlanceRow:   { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingVertical: 3 },
  packGlanceRank:  { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, color: NEUTRAL.muted, width: 20 },
  packGlanceName:  { fontSize: FONT_SIZE.sm, color: BRAND_DARK, flex: 1 },
  packGlanceMiles: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, width: 36, textAlign: 'right' },
  packGlanceGap:   { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, width: 30, textAlign: 'right' },
  packRow:         { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingVertical: SPACE.sm },
  packRank:        { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: NEUTRAL.muted, width: 24 },
  packAvatar:      { width: 28, height: 28, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
  packAvatarText:  { color: '#fff', fontSize: 10, fontWeight: FONT_WEIGHT.bold },
  packName:        { fontSize: FONT_SIZE.sm, color: BRAND_DARK, marginBottom: 3 },
  packBarBg:       { height: 8, backgroundColor: NEUTRAL.bg, borderRadius: 4, overflow: 'hidden' },
  packBarFill:     { height: '100%', borderRadius: 4 },
  packMiles:       { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, width: 40, textAlign: 'right' },
  gaugeGroup:      { gap: SPACE.sm, marginTop: SPACE.md },
  gauge:           { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  gaugeLabel:      { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, minWidth: 40 },
  gaugeBg:         { flex: 1, height: 8, backgroundColor: NEUTRAL.bg, borderRadius: 4, overflow: 'hidden' },
  gaugeFill:       { height: '100%', borderRadius: 4 },
  gaugeValue:      { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, minWidth: 28, textAlign: 'right' },
});
