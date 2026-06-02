import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE, STATUS, SIGNAL,
} from '../constants/design';
import { SIGNAL_TYPE_COLORS } from '../constants/training';
import { calcPackAnalysis, formatTime, formatPace } from '../utils/raceUtils';
import { getAthleteWeeklyTarget, getWeekStatus, computeVolumeCompliance } from '../utils/complianceUtils';
import { getCompletedSeasons } from './SeasonPlanner';
import SeasonReview from './SeasonReview';

export default function CoachAnalytics({
  athletes, athleteWeeklyMiles, athlete3WeekAvg, athleteWeeklyBreakdown = {},
  athleteZonePct, athletePaceEasyPct = {}, overtTrainingAlerts, athleteMiles, groups, school, schoolId, userData, onClose,
}) {
  const [analyticsTab, setAnalyticsTab] = useState('training');
  const [seasonReviewSeason, setSeasonReviewSeason] = useState(null);
  const [expandedSection, setExpandedSection] = useState(null);
  const [wellnessData, setWellnessData] = useState(null);
  const [loadingWellness, setLoadingWellness] = useState(true);
  const [raceMeets, setRaceMeets] = useState([]);
  const [raceResults, setRaceResults] = useState([]);
  const [races, setRaces] = useState([]);
  const [loadingRaces, setLoadingRaces] = useState(false);
  const [attendanceData, setAttendanceData] = useState(null);
  const [loadingAttendance, setLoadingAttendance] = useState(true);

  useEffect(() => { loadWellnessData(); loadRaceData(); loadAttendanceData(); }, []);

  const loadAttendanceData = async () => {
    setLoadingAttendance(true);
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const cutoff = thirtyDaysAgo.toISOString().split('T')[0];

      const snap = await getDocs(query(
        collection(db, 'attendance'),
        where('schoolId', '==', schoolId),
        where('date', '>=', cutoff),
      ));
      const records = snap.docs.map(d => d.data());

      const byAthlete = {};
      athletes.forEach(a => {
        const theirs = records.filter(r => r.athleteId === a.id);
        const present = theirs.filter(r => r.status === 'present').length;
        const absent  = theirs.filter(r => r.status === 'absent').length;
        const excused = theirs.filter(r => r.status === 'excused').length;
        byAthlete[a.id] = {
          totalRecorded: theirs.length,
          present, absent, excused,
          rate: theirs.length > 0 ? present / theirs.length : null,
        };
      });

      const totalRecorded = records.length;
      const totalPresent  = records.filter(r => r.status === 'present').length;
      const teamRate      = totalRecorded > 0 ? totalPresent / totalRecorded : null;
      const practiceDays  = new Set(records.map(r => r.date)).size;
      const concernCount  = athletes.filter(a => {
        const s = byAthlete[a.id];
        return s && s.totalRecorded > 0 && s.rate < 0.90;
      }).length;
      const noRecordsCount = athletes.filter(a => !byAthlete[a.id] || byAthlete[a.id].totalRecorded === 0).length;

      setAttendanceData({ byAthlete, totalRecorded, teamRate, practiceDays, concernCount, noRecordsCount });
    } catch (e) { console.warn('Failed to load attendance analytics:', e); }
    setLoadingAttendance(false);
  };

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

      // Sort oldest-first so the most-recent check-in's per-location severity
      // ends up as the final state for each location. The old "worst severity
      // wins" rule was producing stuck severity (e.g. knee=severe two days
      // ago, milder today still rendered as severe).
      const sortedCheckins = [...allCheckins].sort((a, b) => {
        const da = a.date?.toDate?.() || (a.date instanceof Date ? a.date : new Date(0));
        const db = b.date?.toDate?.() || (b.date instanceof Date ? b.date : new Date(0));
        return da - db;
      });

      sortedCheckins.forEach(c => {
        const d = c.date?.toDate?.() || (c.date instanceof Date ? c.date : null);
        if (c.injury?.locations?.length > 0) {
          if (!athleteInjuryMap[c.userId]) athleteInjuryMap[c.userId] = { days: 0, locations: new Set(), locationSeverity: {}, lastDate: null, severity: 'mild' };
          const entry = athleteInjuryMap[c.userId];
          entry.days++;
          // Per-location data (newer schema) — always overwrite so most-recent wins.
          if (c.injury.perLocation) {
            c.injury.perLocation.forEach(p => {
              entry.locations.add(p.location);
              entry.locationSeverity[p.location] = p.severity;
            });
          } else {
            // Legacy fallback: apply check-in's aggregate severity to all locations.
            c.injury.locations.forEach(loc => {
              entry.locations.add(loc);
              entry.locationSeverity[loc] = c.injury.severity;
            });
          }
          if (d && (!entry.lastDate || d > entry.lastDate)) entry.lastDate = d;
          // Aggregate severity keeps "worst" semantics (used for chip color, etc.)
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
            locationSeverity: data.locationSeverity,
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

  // ── Metric 1: Mileage Volume (last 3 completed weeks) ──
  const { volumeData, onTarget, underTarget, overTarget } = computeVolumeCompliance(
    athletes, groups, athlete3WeekAvg, athleteWeeklyBreakdown
  );

  // ── Metric 2: Easy-Hard Balance (pace-only, no HR fallback) ──
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

  // ── Status → gradient helpers (mirrors Athlete Stats hero pill pattern) ──
  const GRAD_OK    = [SIGNAL.color.emerald, SIGNAL.color.cyan];
  const GRAD_WARN  = [SIGNAL.color.amber, SIGNAL.color.coral];
  const GRAD_ALERT = [SIGNAL.color.coral, SIGNAL.color.effort10];

  const renderGauge = (value, label, max = 5) => {
    const pct = value ? (value / max) * 100 : 0;
    const color = value >= 3.5 ? SIGNAL.color.emerald : value >= 2.5 ? SIGNAL.color.amber : SIGNAL.color.coral;
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
    const color = pctValue <= 10 ? SIGNAL.color.emerald : pctValue <= 25 ? SIGNAL.color.amber : SIGNAL.color.coral;
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

  // Section card with expandable body (matches Signal handoff)
  const Section = ({ id, n, title, sub, summary, children }) => {
    const open = expandedSection === id;
    return (
      <View style={styles.card}>
        <TouchableOpacity onPress={() => toggle(id)} activeOpacity={0.7} style={styles.sectionHeaderBtn}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.numBadge}><Text style={styles.numBadgeText}>{n}</Text></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.sectionTitle}>{title}</Text>
              <Text style={styles.eyebrow}>{sub}</Text>
            </View>
            <Ionicons
              name={open ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={SIGNAL.color.mute2}
            />
          </View>
          {summary}
        </TouchableOpacity>
        {open && <View style={styles.cardBody}>{children}</View>}
      </View>
    );
  };

  // Avatar
  const Avatar = ({ color, initials, size = 28, faded = false }) => (
    <View style={[
      styles.avatar,
      { width: size, height: size, borderRadius: size / 2, backgroundColor: color || SIGNAL.color.indigo, opacity: faded ? 0.4 : 1 },
    ]}>
      <Text style={[styles.avatarText, { fontSize: Math.round(size * 0.36) }]}>{initials}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={SIGNAL.color.inkSoft} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Team Analytics</Text>
          {!!school?.name && (
            <Text style={styles.headerSub}>{school.name} · {athletes.length} athlete{athletes.length === 1 ? '' : 's'}</Text>
          )}
        </View>
        <View style={{ width: 64 }} />
      </View>

      {/* ── Tab bar ── */}
      <View style={styles.tabRow}>
        {[{ key: 'training', label: 'Training' }, { key: 'races', label: 'Race' }].map(t => {
          const active = analyticsTab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setAnalyticsTab(t.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label} Analytics</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {analyticsTab === 'training' ? (
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* ── 1. Mileage Volume ── */}
        <Section
          id="volume"
          n="1"
          title="Mileage Compliance"
          sub={`Last 3 weeks vs target · ${onTarget.length} on target`}
          summary={(() => {
            // Status by % on target: ≥75% green, 50–74% amber, <50% red.
            const total = onTarget.length + underTarget.length + overTarget.length;
            const onPct = total > 0 ? onTarget.length / total : 0;
            const grad = total === 0
              ? null
              : onPct >= 0.75
                ? GRAD_OK
                : onPct >= 0.5
                  ? GRAD_WARN
                  : GRAD_ALERT;
            return (
              <View style={styles.heroWrap}>
                {grad ? (
                  <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroPill}>
                    <View style={styles.heroPillCol}>
                      <Text style={styles.heroPillNum}>{underTarget.length}</Text>
                      <Text style={styles.heroPillLabel}>Under</Text>
                    </View>
                    <View style={styles.heroPillDivider} />
                    <View style={styles.heroPillCol}>
                      <Text style={styles.heroPillNum}>{onTarget.length}</Text>
                      <Text style={styles.heroPillLabel}>On target</Text>
                    </View>
                    <View style={styles.heroPillDivider} />
                    <View style={styles.heroPillCol}>
                      <Text style={styles.heroPillNum}>{overTarget.length}</Text>
                      <Text style={styles.heroPillLabel}>Over</Text>
                    </View>
                  </LinearGradient>
                ) : (
                  <View style={[styles.heroPill, { backgroundColor: SIGNAL.color.mute2 }]}>
                    <Text style={styles.heroPillLabel}>No volume data yet</Text>
                  </View>
                )}
              </View>
            );
          })()}
        >
          {[...underTarget, ...overTarget].length === 0 ? (
            <Text style={styles.detailEmpty}>All athletes have been on target over the last 3 weeks.</Text>
          ) : (
            [...underTarget, ...overTarget].map(a => {
              const weekDots = [
                { label: '3w', miles: a.wb.w3, status: a.w3Status },
                { label: '2w', miles: a.wb.w2, status: a.w2Status },
                { label: '1w', miles: a.wb.w1, status: a.w1Status },
              ];
              const statusColor = (s) => s === 'on' ? SIGNAL.color.emerald : s === 'under' ? SIGNAL.color.amber : s === 'over' ? SIGNAL.color.coral : SIGNAL.color.mute2;
              const statusIcon = { on: '✓', under: '↓', over: '↑' };
              return (
                <View key={a.id} style={styles.detailRow}>
                  <Avatar color={a.avatarColor} initials={`${a.firstName?.[0] || ''}${a.lastName?.[0] || ''}`} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.detailName}>{a.firstName} {a.lastName}</Text>
                    <Text style={styles.detailSub}>Target {a.target || '—'} mi/wk</Text>
                  </View>
                  <View style={styles.weekDotsRow}>
                    {weekDots.map((w, i) => (
                      <View key={i} style={styles.weekDot}>
                        <Text style={[styles.weekDotNum, { color: statusColor(w.status) }]}>
                          {statusIcon[w.status] || ''}{w.miles}
                        </Text>
                        <Text style={styles.weekDotLabel}>{w.label}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={[styles.chip, {
                    backgroundColor: `${a.status === 'under' ? SIGNAL.color.amber : SIGNAL.color.coral}${SIGNAL.tint.chip}`,
                  }]}>
                    <Text style={[styles.chipText, { color: a.status === 'under' ? SIGNAL.color.amber : SIGNAL.color.coral }]}>
                      {a.status === 'under' ? 'Under' : 'Over'}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </Section>

        {/* ── 2. Easy-Hard Balance ── */}
        <Section
          id="intensity"
          n="2"
          title="Easy-Hard Balance"
          sub="Is the team running easy enough?"
          summary={(() => {
            const grad = teamAvgEasy === null
              ? null
              : teamAvgEasy >= 78 ? GRAD_OK
                : teamAvgEasy >= 68 ? GRAD_WARN
                : GRAD_ALERT;
            return (
              <View style={styles.heroWrap}>
                {grad ? (
                  <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroPillSolo}>
                    <Text style={styles.heroSoloNum}>{teamAvgEasy}%</Text>
                    <Text style={styles.heroSoloSub}>
                      Team avg easy
                      {paceTooHard.length > 0 ? ` · ${paceTooHard.length} too hard` : ''}
                      {paceNoPaces.length > 0 ? ` · ${paceNoPaces.length} need paces` : ''}
                    </Text>
                  </LinearGradient>
                ) : (
                  <View style={[styles.heroPillSolo, { backgroundColor: SIGNAL.color.mute2 }]}>
                    <Text style={styles.heroSoloNum}>—</Text>
                    <Text style={styles.heroSoloSub}>No pace data yet</Text>
                  </View>
                )}
              </View>
            );
          })()}
        >
          {paceTooHard.length > 0 && (
            <View style={{ marginBottom: 10 }}>
              <Text style={[styles.groupLabel, { color: SIGNAL.color.coral }]}>Too hard (easy &lt; 68%)</Text>
              {paceTooHard.map(a => (
                <View key={a.id} style={styles.detailRow}>
                  <Avatar color={a.avatarColor} initials={`${a.firstName?.[0] || ''}${a.lastName?.[0] || ''}`} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailName}>{a.firstName} {a.lastName}</Text>
                    <Text style={styles.detailSub}>Easy {a.easyPct}% · target 80%</Text>
                  </View>
                  <Text style={[styles.numBig, { color: SIGNAL.color.coral }]}>{a.easyPct}%</Text>
                </View>
              ))}
            </View>
          )}
          {paceCaution.length > 0 && (
            <View style={{ marginBottom: 10 }}>
              <Text style={[styles.groupLabel, { color: SIGNAL.color.amber }]}>Caution (68–77%)</Text>
              {paceCaution.map(a => (
                <View key={a.id} style={styles.detailRow}>
                  <Avatar color={a.avatarColor} initials={`${a.firstName?.[0] || ''}${a.lastName?.[0] || ''}`} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailName}>{a.firstName} {a.lastName}</Text>
                    <Text style={styles.detailSub}>Easy {a.easyPct}% · target 80%</Text>
                  </View>
                  <Text style={[styles.numBig, { color: SIGNAL.color.amber }]}>{a.easyPct}%</Text>
                </View>
              ))}
            </View>
          )}
          {paceOnTarget.length > 0 && (
            <View style={{ marginBottom: 10 }}>
              <Text style={[styles.groupLabel, { color: SIGNAL.color.emerald }]}>On target (≥ 78%)</Text>
              {paceOnTarget.map(a => (
                <View key={a.id} style={styles.detailRow}>
                  <Avatar color={a.avatarColor} initials={`${a.firstName?.[0] || ''}${a.lastName?.[0] || ''}`} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailName}>{a.firstName} {a.lastName}</Text>
                    <Text style={styles.detailSub}>Easy {a.easyPct}%</Text>
                  </View>
                  <Text style={[styles.numBig, { color: SIGNAL.color.emerald }]}>{a.easyPct}%</Text>
                </View>
              ))}
            </View>
          )}
          {paceNoPaces.length > 0 && (
            <View style={{ marginBottom: 10 }}>
              <Text style={[styles.groupLabel, { color: SIGNAL.color.mute2 }]}>Need training paces</Text>
              {paceNoPaces.map(a => (
                <View key={a.id} style={styles.detailRow}>
                  <Avatar color={a.avatarColor} initials={`${a.firstName?.[0] || ''}${a.lastName?.[0] || ''}`} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailName}>{a.firstName} {a.lastName}</Text>
                    <Text style={styles.detailSub}>No paces set</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
          {athletesWithData.length === 0 && paceNoPaces.length === 0 && (
            <Text style={styles.detailEmpty}>No pace data yet. Athletes need to set training paces in their profile.</Text>
          )}
        </Section>

        {/* ── 3. Load & Injury Risk ── */}
        <Section
          id="load"
          n="3"
          title="Load & Injury Risk"
          sub="Last wk vs prior 2-wk avg"
          summary={(() => {
            const grad = loadRisks.length === 0 ? GRAD_OK : loadRisks.length <= 2 ? GRAD_WARN : GRAD_ALERT;
            return (
              <View style={styles.heroWrap}>
                <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroPillSolo}>
                  <Text style={styles.heroSoloNum}>{loadRisks.length}</Text>
                  <Text style={styles.heroSoloSub}>
                    {loadRisks.length === 0
                      ? 'No elevated risk this week'
                      : `Athlete${loadRisks.length === 1 ? '' : 's'} at risk`}
                  </Text>
                </LinearGradient>
              </View>
            );
          })()}
        >
          {loadRisks.length === 0 ? (
            <Text style={styles.detailEmpty}>No athletes showing elevated injury risk this week.</Text>
          ) : loadRisks.map(a => (
            <View key={a.id} style={styles.detailRow}>
              <Avatar color={a.avatarColor} initials={`${a.firstName?.[0] || ''}${a.lastName?.[0] || ''}`} />
              <View style={{ flex: 1 }}>
                <Text style={styles.detailName}>{a.firstName} {a.lastName}</Text>
                <Text style={styles.detailSub}>
                  Last wk {a.lastWeek} mi (prior {a.priorAvg}){a.pctChange > 15 ? ` · ${a.pctChange}% up` : ''}
                </Text>
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
        </Section>

        {/* ── 4. Attendance ── */}
        <Section
          id="attendance"
          n="4"
          title="Attendance"
          sub={
            attendanceData?.practiceDays
              ? `Last 30 days · ${attendanceData.practiceDays} practice day${attendanceData.practiceDays !== 1 ? 's' : ''}`
              : 'Take attendance from Program tab to see data'
          }
          summary={(() => {
            if (loadingAttendance) {
              return (
                <View style={styles.heroWrap}>
                  <ActivityIndicator color={SIGNAL.color.indigo} />
                </View>
              );
            }
            if (!attendanceData || attendanceData.totalRecorded === 0) return null;
            const rate = attendanceData.teamRate;
            const grad = rate >= 0.9 ? GRAD_OK : rate >= 0.75 ? GRAD_WARN : GRAD_ALERT;
            return (
              <View style={styles.heroWrap}>
                <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroPill}>
                  <View style={styles.heroPillCol}>
                    <Text style={styles.heroPillNum}>{Math.round(rate * 100)}%</Text>
                    <Text style={styles.heroPillLabel}>Team rate</Text>
                  </View>
                  <View style={styles.heroPillDivider} />
                  <View style={styles.heroPillCol}>
                    <Text style={styles.heroPillNum}>{attendanceData.concernCount}</Text>
                    <Text style={styles.heroPillLabel}>{'<'} 90%</Text>
                  </View>
                </LinearGradient>
              </View>
            );
          })()}
        >
          {!attendanceData || attendanceData.totalRecorded === 0 ? (
            <Text style={styles.detailEmpty}>No attendance recorded in the last 30 days.</Text>
          ) : (
            <>
              {athletes
                .map(a => ({ ...a, ...attendanceData.byAthlete[a.id] }))
                .filter(a => a.totalRecorded > 0)
                .sort((a, b) => a.rate - b.rate)
                .map(a => {
                  const pct = Math.round(a.rate * 100);
                  const rowColor = pct >= 90 ? SIGNAL.color.emerald : pct >= 75 ? SIGNAL.color.amber : SIGNAL.color.coral;
                  return (
                    <View key={a.id} style={styles.detailRow}>
                      <Avatar color={a.avatarColor} initials={`${a.firstName?.[0] || ''}${a.lastName?.[0] || ''}`} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.detailName}>{a.firstName} {a.lastName}</Text>
                        <Text style={styles.detailSub}>
                          <Text style={{ color: rowColor, fontFamily: SIGNAL.font.bodyBold }}>{pct}%</Text>
                          {' · '}{a.present}/{a.totalRecorded} present
                          {a.absent  > 0 ? ` · ${a.absent} absent`   : ''}
                          {a.excused > 0 ? ` · ${a.excused} excused` : ''}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              {attendanceData.noRecordsCount > 0 && (
                <Text style={styles.signalText}>
                  • {attendanceData.noRecordsCount} athlete{attendanceData.noRecordsCount !== 1 ? 's' : ''} without recorded attendance in this window
                </Text>
              )}
            </>
          )}
        </Section>

        {/* ── 5. Pack Compression ── */}
        <Section
          id="pack"
          n="5"
          title="Pack Compression"
          sub="Top 5 spread & bench depth"
          summary={(() => {
            // Status: ok if both sides have <=20% spread vs top, warn moderate, alert if large
            const ratio = (d) => {
              if (!d.sorted.length || !d.sTop || !athleteMiles[d.sorted[0]?.id]) return null;
              return d.sTop / athleteMiles[d.sorted[0].id];
            };
            const rB = ratio(boysData);
            const rG = ratio(girlsData);
            const worst = [rB, rG].filter(r => r !== null).reduce((m, r) => Math.max(m, r), 0);
            const grad = worst === 0
              ? null
              : worst <= 0.25 ? GRAD_OK
                : worst <= 0.45 ? GRAD_WARN
                : GRAD_ALERT;
            const noData = boysData.count === 0 && girlsData.count === 0;
            return (
              <View style={styles.heroWrap}>
                {noData ? (
                  <View style={[styles.heroPill, { backgroundColor: SIGNAL.color.mute2 }]}>
                    <Text style={styles.heroPillLabel}>No athletes with miles yet</Text>
                  </View>
                ) : (
                  <LinearGradient colors={grad || GRAD_OK} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroPill}>
                    {boysData.count > 0 && (
                      <View style={styles.heroPillCol}>
                        <Text style={styles.heroPillEyebrow}>Boys top {boysData.topN}</Text>
                        <Text style={styles.heroPillNumMono}>{boysData.sTop !== null ? `${boysData.sTop} mi` : '—'}</Text>
                      </View>
                    )}
                    {boysData.count > 0 && girlsData.count > 0 && <View style={styles.heroPillDivider} />}
                    {girlsData.count > 0 && (
                      <View style={styles.heroPillCol}>
                        <Text style={styles.heroPillEyebrow}>Girls top {girlsData.topN}</Text>
                        <Text style={styles.heroPillNumMono}>{girlsData.sTop !== null ? `${girlsData.sTop} mi` : '—'}</Text>
                      </View>
                    )}
                  </LinearGradient>
                )}
              </View>
            );
          })()}
        >
          <View style={styles.packGenderRow}>
            {['boys', 'girls'].map(g => {
              const active = packGender === g;
              return (
                <TouchableOpacity
                  key={g}
                  style={[styles.packGenderBtn, active && styles.packGenderBtnActive]}
                  onPress={() => setPackGender(g)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.packGenderText, active && styles.packGenderTextActive]}>{g === 'boys' ? 'Boys' : 'Girls'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {activePackData.sTop !== null && (
            <View style={styles.spreadGroup}>
              <View style={styles.spreadRow}>
                <Text style={styles.spreadNum}>{activePackData.sTop} mi</Text>
                <Text style={styles.spreadLabel}>spread #1–#{activePackData.topN}</Text>
              </View>
              {activePackData.s10 !== null && (
                <View style={styles.spreadRow}>
                  <Text style={[styles.spreadNum, { color: SIGNAL.color.inkSoft }]}>{activePackData.s10} mi</Text>
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
                <Text style={[styles.packRank, !isTop5 && { color: SIGNAL.color.mute2 }]}>#{i + 1}</Text>
                <Avatar
                  color={a.avatarColor}
                  initials={`${a.firstName?.[0] || ''}${a.lastName?.[0] || ''}`}
                  size={24}
                  faded={!isTop5}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.packName, !isTop5 && { color: SIGNAL.color.mute }]} numberOfLines={1}>
                    {a.firstName} {a.lastName}
                  </Text>
                  <View style={styles.packBarBg}>
                    <View style={[
                      styles.packBarFill,
                      { width: barWidth + '%', backgroundColor: isTop5 ? SIGNAL.color.indigo : SIGNAL.color.mute2 },
                    ]} />
                  </View>
                </View>
                <Text style={[styles.packMiles, !isTop5 && { color: SIGNAL.color.mute }]}>{miles.toFixed(1)}</Text>
              </View>
            );
          })}
          {top10.length === 0 && (
            <Text style={styles.detailEmpty}>No {packGender} athletes with data for this period.</Text>
          )}
          {top10.length > 0 && (
            <Text style={styles.detailHint}>Faded = bench (#6+). Tighter top-5 spread = stronger scoring pack.</Text>
          )}
        </Section>

        {/* ── 6. Wellness & Readiness ── */}
        <Section
          id="wellness"
          n="6"
          title="Wellness & Readiness"
          sub={`Last 7 days · ${wellnessAthletes.length}/${athletes.length} reporting`}
          summary={(() => {
            if (loadingWellness) {
              return (
                <View style={styles.heroWrap}>
                  <ActivityIndicator color={SIGNAL.color.indigo} />
                </View>
              );
            }
            if (!wellnessData || wellnessData.totalCheckins === 0) {
              return (
                <View style={styles.heroWrap}>
                  <View style={[styles.heroPill, { backgroundColor: SIGNAL.color.mute2 }]}>
                    <Text style={styles.heroPillLabel}>No check-ins yet</Text>
                  </View>
                </View>
              );
            }
            // Status: worst of (sleep, legs, mood, concerns)
            const minAvg = Math.min(
              wellnessData.teamAvgSleep ?? 5,
              wellnessData.teamAvgLegs ?? 5,
              wellnessData.teamAvgMood ?? 5,
            );
            const grad = minAvg >= 3.5 && concernAthletes.length === 0
              ? GRAD_OK
              : minAvg >= 2.5 || concernAthletes.length <= 2
                ? GRAD_WARN
                : GRAD_ALERT;
            return (
              <View style={styles.heroWrap}>
                <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroPill}>
                  <View style={styles.heroPillCol}>
                    <Text style={styles.heroPillEyebrow}>😴 Sleep</Text>
                    <Text style={styles.heroPillNum}>{wellnessData.teamAvgSleep ? wellnessData.teamAvgSleep.toFixed(1) : '—'}</Text>
                  </View>
                  <View style={styles.heroPillDivider} />
                  <View style={styles.heroPillCol}>
                    <Text style={styles.heroPillEyebrow}>🦵 Legs</Text>
                    <Text style={styles.heroPillNum}>{wellnessData.teamAvgLegs ? wellnessData.teamAvgLegs.toFixed(1) : '—'}</Text>
                  </View>
                  <View style={styles.heroPillDivider} />
                  <View style={styles.heroPillCol}>
                    <Text style={styles.heroPillEyebrow}>😊 Mood</Text>
                    <Text style={styles.heroPillNum}>{wellnessData.teamAvgMood ? wellnessData.teamAvgMood.toFixed(1) : '—'}</Text>
                  </View>
                </LinearGradient>
                {(wellnessData.injuryRate > 0 || wellnessData.illnessRate > 0) && (
                  <View style={{ marginTop: 12 }}>
                    {renderRateGauge(wellnessData.injuryRate, '🩹 Injury rate')}
                    <View style={{ height: 6 }} />
                    {renderRateGauge(wellnessData.illnessRate, '🤒 Illness rate')}
                  </View>
                )}
                {concernAthletes.length > 0 && (
                  <Text style={styles.wellnessConcernHint}>
                    {concernAthletes.length} athlete{concernAthletes.length > 1 ? 's' : ''} showing concern signals
                  </Text>
                )}
              </View>
            );
          })()}
        >
          {/* Active injuries grouped by athlete */}
          {wellnessData?.activeInjuries?.length > 0 && (
            <View style={styles.activeSection}>
              <Text style={styles.activeSectionTitle}>🩹 Active injuries this week</Text>
              {wellnessData.activeInjuries.map(inj => {
                const sevColor = inj.severity === 'severe'
                  ? SIGNAL.color.coral
                  : inj.severity === 'moderate'
                    ? SIGNAL.color.amber
                    : SIGNAL.color.inkSoft;
                return (
                  <View key={inj.id} style={styles.activeChip}>
                    <Avatar color={inj.avatarColor} initials={inj.initials} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.activeLabel}>{inj.name}</Text>
                      <Text style={styles.activeSub}>
                        {inj.locationSeverity
                          ? inj.locations.map(l => `${l.charAt(0).toUpperCase() + l.slice(1)} (${inj.locationSeverity[l] || 'mild'})`).join(', ')
                          : `${inj.locations.map(l => l.charAt(0).toUpperCase() + l.slice(1)).join(', ')}${inj.severity !== 'mild' ? ` · ${inj.severity}` : ''}`
                        }
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.activeDays, { color: sevColor }]}>{inj.days} of 7d</Text>
                      <Text style={styles.activeWhen}>{inj.lastReported}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
          {/* Active illnesses grouped by athlete */}
          {wellnessData?.activeIllnesses?.length > 0 && (
            <View style={styles.activeSection}>
              <Text style={styles.activeSectionTitle}>🤒 Active illness this week</Text>
              {wellnessData.activeIllnesses.map(ill => (
                <View key={ill.id} style={[styles.activeChip, { borderLeftColor: SIGNAL.color.amber }]}>
                  <Avatar color={ill.avatarColor} initials={ill.initials} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activeLabel}>{ill.name}</Text>
                    <Text style={styles.activeSub}>
                      {ill.symptoms.map(s => s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())).join(', ')}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.activeDays, { color: SIGNAL.color.amber }]}>{ill.days} of 7d</Text>
                    <Text style={styles.activeWhen}>{ill.lastReported}</Text>
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
                  const scoreColor = (v) =>
                    v < 2.5 ? SIGNAL.color.coral
                      : v < 3.5 ? SIGNAL.color.amber
                      : SIGNAL.color.emerald;
                  return (
                    <View
                      key={a.id}
                      style={[
                        styles.detailRow,
                        hasConcern && {
                          backgroundColor: `${SIGNAL.color.coral}${SIGNAL.tint.wash}`,
                          borderRadius: 10,
                          paddingHorizontal: 8,
                        },
                      ]}
                    >
                      <Avatar color={a.avatarColor} initials={`${a.firstName?.[0] || ''}${a.lastName?.[0] || ''}`} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.detailName}>{a.firstName} {a.lastName}</Text>
                        {hasConcern && d.avgSleep < 2.5 && <Text style={styles.signalText}>• Poor sleep</Text>}
                        {hasConcern && d.avgLegs < 2.5 && <Text style={styles.signalText}>• Heavy legs</Text>}
                        {hasConcern && d.moodDeclining && <Text style={styles.signalText}>• Mood declining</Text>}
                        {hasConcern && d.hasChronicInjury && <Text style={styles.signalText}>• Chronic injury risk</Text>}
                      </View>
                      <View style={styles.wellnessScores}>
                        <Text style={[styles.wellnessScore, { color: scoreColor(d.avgSleep) }]}>😴 {d.avgSleep.toFixed(1)}</Text>
                        <Text style={[styles.wellnessScore, { color: scoreColor(d.avgLegs) }]}>🦵 {d.avgLegs.toFixed(1)}</Text>
                        <Text style={[styles.wellnessScore, { color: scoreColor(d.avgMood) }]}>😊 {d.avgMood.toFixed(1)}</Text>
                        {d.injuryDays > 0 && <Text style={[styles.wellnessScore, { color: SIGNAL.color.amber }]}>🩹 {d.injuryDays}/7</Text>}
                        {d.illnessDays > 0 && <Text style={[styles.wellnessScore, { color: SIGNAL.color.amber }]}>🤒 {d.illnessDays}/7</Text>}
                      </View>
                    </View>
                  );
                })}

              {/* Non-reporting athletes */}
              {nonReportingAthletes.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: 12 }]}>
                    Not reporting ({nonReportingAthletes.length})
                  </Text>
                  {nonReportingAthletes.map(a => (
                    <View key={a.id} style={styles.detailRow}>
                      <Avatar color={a.avatarColor} initials={`${a.firstName?.[0] || ''}${a.lastName?.[0] || ''}`} faded />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.detailName, { color: SIGNAL.color.mute }]}>
                          {a.firstName} {a.lastName}
                        </Text>
                      </View>
                      <Text style={styles.detailSub}>No data</Text>
                    </View>
                  ))}
                </>
              )}
            </>
          )}
        </Section>

        {/* ── Season in Review (permanent access) ── */}
        {(() => {
          const completed = getCompletedSeasons(school);
          if (completed.length === 0) return null;
          const SPORT_LABELS = { cross_country: 'Cross Country', indoor_track: 'Indoor Track', outdoor_track: 'Outdoor Track' };
          const SPORT_ICONS = { cross_country: '🏔️', indoor_track: '🏟️', outdoor_track: '🏃' };
          return (
            <View style={styles.card}>
              <View style={[styles.sectionHeaderBtn, { paddingBottom: 6 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Season in Review</Text>
                </View>
              </View>
              <View style={styles.cardBody}>
                {completed.map((s, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.seasonReviewCard,
                      i < completed.length - 1 && { borderBottomWidth: 1, borderBottomColor: SIGNAL.color.line },
                    ]}
                    onPress={() => setSeasonReviewSeason(s)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.seasonReviewIcon}>{SPORT_ICONS[s.sport] || '🏃'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.seasonReviewName}>{s.name || SPORT_LABELS[s.sport] || 'Season'}</Text>
                      <Text style={styles.seasonReviewDate}>
                        {new Date(s.seasonStart).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} – {new Date(s.championshipDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={SIGNAL.color.mute2} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        })()}

      </ScrollView>
      ) : (
      /* ── Race Analytics Tab ── */
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {loadingRaces ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={SIGNAL.color.indigo} />
          </View>
        ) : raceMeets.length === 0 ? (
          <View style={[styles.card, { padding: 24, alignItems: 'center' }]}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>🏁</Text>
            <Text style={styles.sectionTitle}>No race data yet</Text>
            <Text style={[styles.eyebrow, { textAlign: 'center', marginTop: 8 }]}>
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
              <View style={[styles.card, { padding: 24, alignItems: 'center' }]}>
                <Text style={styles.sectionTitle}>No complete results yet</Text>
                <Text style={[styles.eyebrow, { textAlign: 'center', marginTop: 8 }]}>
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
              <View style={styles.card}>
                <View style={styles.sectionHeaderBtn}>
                  <View style={styles.sectionHeaderRow}>
                    <View style={styles.numBadge}>
                      <Text style={styles.numBadgeText}>{raceAnalytics.length}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sectionTitle}>Races with Results</Text>
                      <Text style={styles.eyebrow}>Season pack spread trend</Text>
                    </View>
                  </View>
                </View>
                {raceAnalytics.length >= 2 && (
                  <View style={styles.cardBody}>
                    <View style={styles.heroWrap}>
                      <LinearGradient
                        colors={spreadImproved ? GRAD_OK : GRAD_WARN}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.heroPill}
                      >
                        <View style={styles.heroPillCol}>
                          <Text style={styles.heroPillNumMono}>
                            {spreadImproved ? '↓' : '↑'} {formatTime(Math.abs(latestPack.spread15 - firstPack.spread15))}
                          </Text>
                          <Text style={styles.heroPillLabel}>Spread change</Text>
                        </View>
                        <View style={styles.heroPillDivider} />
                        <View style={styles.heroPillCol}>
                          <Text style={styles.heroPillNumMono}>{formatTime(latestPack.spread15)}</Text>
                          <Text style={styles.heroPillLabel}>Current 1–5</Text>
                        </View>
                      </LinearGradient>
                    </View>
                  </View>
                )}
              </View>

              {/* Per-race breakdown */}
              {raceAnalytics.map((ra, i) => (
                <View key={`${ra.race.id}`} style={styles.card}>
                  <View style={[styles.sectionHeaderBtn, { paddingBottom: 4 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sectionTitle}>{ra.meet.name}</Text>
                      <Text style={styles.eyebrow}>
                        {ra.race.label} · {ra.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.cardBody}>
                    <View style={styles.statRow}>
                      <View style={styles.statTile}>
                        <Text style={styles.statTileNum}>{formatTime(ra.pack.spread15)}</Text>
                        <Text style={styles.statTileLabel}>1–5 Spread</Text>
                      </View>
                      <View style={styles.statTile}>
                        <Text style={styles.statTileNum}>{formatTime(ra.pack.teamAvg)}</Text>
                        <Text style={styles.statTileLabel}>Team Avg</Text>
                      </View>
                      {ra.pack.teamScore && (
                        <View style={styles.statTile}>
                          <Text style={styles.statTileNum}>{ra.pack.teamScore}</Text>
                          <Text style={styles.statTileLabel}>Score</Text>
                        </View>
                      )}
                    </View>
                    {ra.pack.runner6 && (
                      <Text style={[styles.detailHint, { marginTop: 10, marginBottom: 0 }]}>
                        #6 {ra.pack.runner6.name} (+{formatTime(ra.pack.gap6to5)})
                        {ra.pack.runner7 ? ` · #7 ${ra.pack.runner7.name} (+${formatTime(ra.pack.gap7to5)})` : ''}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </>
          );
        })()}
      </ScrollView>
      )}
      {seasonReviewSeason && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <SeasonReview season={seasonReviewSeason} school={school} userData={userData} athletes={athletes} onClose={() => setSeasonReviewSeason(null)} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
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
    ...SIGNAL.style.eyebrow,
    marginTop: 3,
  },

  // ── Tab bar ──
  tabRow: {
    flexDirection: 'row',
    backgroundColor: SIGNAL.color.white,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  tab: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: SIGNAL.color.indigo,
  },
  tabText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 13.5,
    color: SIGNAL.color.mute,
  },
  tabTextActive: {
    color: SIGNAL.color.indigo,
  },

  scroll: { flex: 1 },
  scrollContent: {
    padding: 14,
    paddingBottom: 110,
    gap: 12,
  },

  // ── Card shell ──
  card: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    overflow: 'hidden',
    ...SIGNAL.border.hairline,
    marginBottom: 12,
  },
  sectionHeaderBtn: {
    padding: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
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
    letterSpacing: SIGNAL.letter.numTight,
  },
  sectionTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 18,
    color: SIGNAL.color.indigo,
    letterSpacing: -0.36,
  },
  eyebrow: {
    ...SIGNAL.style.eyebrow,
    marginTop: 3,
  },
  cardBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 0,
  },

  // ── Hero pill (gradient summary) ──
  heroWrap: {
    marginTop: 12,
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: SIGNAL.radius.card,
  },
  heroPillCol: {
    alignItems: 'center',
    flex: 1,
  },
  heroPillDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  heroPillNum: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 22,
    lineHeight: 26,
    color: '#fff',
    letterSpacing: SIGNAL.letter.numTight,
  },
  heroPillNumMono: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 18,
    lineHeight: 22,
    color: '#fff',
  },
  heroPillLabel: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 10.5,
    color: 'rgba(255,255,255,0.88)',
    marginTop: 3,
  },
  heroPillEyebrow: {
    fontSize: 9.5,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.85)',
    fontFamily: SIGNAL.font.bodyMedium,
    marginBottom: 2,
  },
  heroPillSolo: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: SIGNAL.radius.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroSoloNum: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 36,
    lineHeight: 40,
    color: '#fff',
    letterSpacing: SIGNAL.letter.numTight,
  },
  heroSoloSub: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.88)',
    marginTop: 4,
    textAlign: 'center',
  },

  // ── Detail rows ──
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontFamily: SIGNAL.font.bodyBold,
    letterSpacing: SIGNAL.letter.numTight,
  },
  detailName: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 13,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  detailSub: {
    fontFamily: SIGNAL.font.body,
    fontSize: 10.5,
    color: SIGNAL.color.mute,
    marginTop: 1,
  },
  detailEmpty: {
    fontFamily: SIGNAL.font.body,
    fontSize: 13,
    color: SIGNAL.color.mute,
    textAlign: 'center',
    paddingVertical: 16,
  },
  detailHint: {
    fontFamily: SIGNAL.font.body,
    fontSize: 10.5,
    color: SIGNAL.color.mute,
    marginTop: 6,
    marginBottom: 4,
  },
  groupLabel: {
    fontSize: 10.5,
    fontFamily: SIGNAL.font.bodyBold,
    letterSpacing: 0.42,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 10.5,
    fontFamily: SIGNAL.font.bodyBold,
    letterSpacing: 0.42,
    textTransform: 'uppercase',
    color: SIGNAL.color.mute,
    marginBottom: 6,
  },
  signalText: {
    fontFamily: SIGNAL.font.body,
    fontSize: 10.5,
    color: SIGNAL.color.coral,
    marginTop: 2,
  },
  numBig: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 15,
    letterSpacing: SIGNAL.letter.numTight,
  },

  // ── Volume week dots ──
  weekDotsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  weekDot: {
    alignItems: 'center',
    minWidth: 26,
  },
  weekDotNum: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 11.5,
    letterSpacing: SIGNAL.letter.numTight,
  },
  weekDotLabel: {
    fontFamily: SIGNAL.font.body,
    fontSize: 8.5,
    color: SIGNAL.color.mute2,
    marginTop: 1,
  },

  // ── Chips ──
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: SIGNAL.radius.chip,
  },
  chipText: {
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 10,
    letterSpacing: 0.3,
  },

  // ── Pack ──
  packGenderRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  packGenderBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: SIGNAL.radius.button,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    backgroundColor: SIGNAL.color.white,
  },
  packGenderBtnActive: {
    backgroundColor: SIGNAL.color.indigo,
    borderColor: SIGNAL.color.indigo,
  },
  packGenderText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 12,
    color: SIGNAL.color.inkSoft,
  },
  packGenderTextActive: {
    color: '#fff',
  },
  spreadGroup: {
    gap: 6,
    marginBottom: 10,
  },
  spreadRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  spreadNum: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 20,
    color: SIGNAL.color.indigo,
    letterSpacing: SIGNAL.letter.numTight,
  },
  spreadLabel: {
    fontFamily: SIGNAL.font.body,
    fontSize: 11.5,
    color: SIGNAL.color.mute,
  },
  packRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 5,
  },
  packRank: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 10,
    color: SIGNAL.color.mute,
    width: 22,
  },
  packName: {
    fontFamily: SIGNAL.font.body,
    fontSize: 12,
    color: SIGNAL.color.ink,
    marginBottom: 3,
  },
  packBarBg: {
    height: 7,
    backgroundColor: SIGNAL.color.line,
    borderRadius: 999,
    overflow: 'hidden',
  },
  packBarFill: {
    height: '100%',
    borderRadius: 999,
  },
  packMiles: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 12,
    color: SIGNAL.color.ink,
    width: 38,
    textAlign: 'right',
    letterSpacing: SIGNAL.letter.numTight,
  },

  // ── Wellness gauges ──
  gauge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gaugeLabel: {
    fontFamily: SIGNAL.font.body,
    fontSize: 12,
    color: SIGNAL.color.inkSoft,
    minWidth: 96,
  },
  gaugeBg: {
    flex: 1,
    height: 7,
    backgroundColor: SIGNAL.color.line,
    borderRadius: 999,
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: 999,
  },
  gaugeValue: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 12,
    minWidth: 32,
    textAlign: 'right',
    letterSpacing: SIGNAL.letter.numTight,
  },
  wellnessConcernHint: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 11,
    color: SIGNAL.color.amber,
    marginTop: 10,
    textAlign: 'center',
  },
  wellnessScores: {
    flexDirection: 'row',
    gap: 8,
  },
  wellnessScore: {
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 11,
    letterSpacing: SIGNAL.letter.numTight,
  },

  // ── Active injuries / illness ──
  activeSection: {
    marginBottom: 12,
  },
  activeSectionTitle: {
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 11.5,
    color: SIGNAL.color.coral,
    marginBottom: 8,
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: `${SIGNAL.color.coral}${SIGNAL.tint.wash}`,
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: SIGNAL.color.coral,
  },
  activeLabel: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 13,
    color: SIGNAL.color.ink,
  },
  activeSub: {
    fontFamily: SIGNAL.font.body,
    fontSize: 11,
    color: SIGNAL.color.inkSoft,
    marginTop: 2,
  },
  activeDays: {
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 12,
    letterSpacing: SIGNAL.letter.numTight,
  },
  activeWhen: {
    fontFamily: SIGNAL.font.body,
    fontSize: 10,
    color: SIGNAL.color.mute,
    marginTop: 1,
  },

  // ── Race tab stat tiles ──
  statRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statTile: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  statTileNum: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 16,
    color: SIGNAL.color.ink,
  },
  statTileLabel: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 9.5,
    color: SIGNAL.color.mute,
    marginTop: 2,
  },

  // ── Season Review tiles ──
  seasonReviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 10,
  },
  seasonReviewIcon: {
    fontSize: 20,
  },
  seasonReviewName: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 13,
    color: SIGNAL.color.ink,
  },
  seasonReviewDate: {
    ...SIGNAL.style.eyebrow,
    marginTop: 2,
  },
});
