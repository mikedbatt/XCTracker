import { Ionicons } from '@expo/vector-icons';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
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

export default function CoachAnalytics({
  athletes, athleteWeeklyMiles, athlete3WeekAvg, athleteWeeklyBreakdown = {},
  athleteZonePct, overtTrainingAlerts, athleteMiles, groups, school, schoolId, onClose,
}) {
  const [expandedSection, setExpandedSection] = useState(null);
  const [wellnessData, setWellnessData] = useState(null);
  const [loadingWellness, setLoadingWellness] = useState(true);

  useEffect(() => { loadWellnessData(); }, []);

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

        athleteAvgs[uid] = { avgSleep, avgLegs, avgMood, recentMood, moodDeclining: recentMood < olderMood - 0.5, checkCount: checks.length };
      });

      // Team averages
      const allCheckins = checkins;
      const teamAvgSleep = allCheckins.length > 0 ? allCheckins.reduce((s, c) => s + (c.sleepQuality || 3), 0) / allCheckins.length : null;
      const teamAvgLegs = allCheckins.length > 0 ? allCheckins.reduce((s, c) => s + (c.legFatigue || 3), 0) / allCheckins.length : null;
      const teamAvgMood = allCheckins.length > 0 ? allCheckins.reduce((s, c) => s + (c.mood || 3), 0) / allCheckins.length : null;

      setWellnessData({ athleteAvgs, teamAvgSleep, teamAvgLegs, teamAvgMood, totalCheckins: allCheckins.length });
    } catch (e) {
      console.warn('Failed to load wellness data:', e);
      setWellnessData({ athleteAvgs: {}, teamAvgSleep: null, teamAvgLegs: null, teamAvgMood: null, totalCheckins: 0 });
    }
    setLoadingWellness(false);
  };

  // ── Metric 1: Volume Compliance (last 3 completed weeks) ──
  const getAthleteTarget = (athlete) => {
    const group = groups.find(g => g.id === athlete.groupId);
    if (group?.weeklyMilesTarget) return group.weeklyMilesTarget;
    const avg = athlete3WeekAvg[athlete.id] || 0;
    return avg > 0 ? Math.round(avg * 1.1 * 10) / 10 : null;
  };

  const getWeekStatus = (miles, target) => {
    if (!target || target <= 0) return 'unknown';
    const pct = miles / target;
    return pct >= 0.9 && pct <= 1.1 ? 'on' : pct < 0.9 ? 'under' : 'over';
  };

  const volumeData = athletes.map(a => {
    const target = getAthleteTarget(a);
    const wb = athleteWeeklyBreakdown[a.id] || { w1: 0, w2: 0, w3: 0 };
    const w1Status = getWeekStatus(wb.w1, target);
    const w2Status = getWeekStatus(wb.w2, target);
    const w3Status = getWeekStatus(wb.w3, target);
    const weeks = [w1Status, w2Status, w3Status];
    const underCount = weeks.filter(w => w === 'under').length;
    const overCount = weeks.filter(w => w === 'over').length;
    // Athlete is flagged if they've been under/over for 2+ of the last 3 weeks
    const status = overCount >= 2 ? 'over' : underCount >= 2 ? 'under' : 'on';
    return { ...a, target, wb, w1Status, w2Status, w3Status, status, underCount, overCount };
  });

  const onTarget = volumeData.filter(a => a.status === 'on');
  const underTarget = volumeData.filter(a => a.status === 'under');
  const overTarget = volumeData.filter(a => a.status === 'over');

  // ── Metric 2: Intensity Distribution ──
  const athletesWithZones = athletes.filter(a => athleteZonePct[a.id] !== undefined && athleteZonePct[a.id] !== null);
  const teamAvgZone = athletesWithZones.length > 0
    ? Math.round(athletesWithZones.reduce((s, a) => s + athleteZonePct[a.id], 0) / athletesWithZones.length)
    : null;
  const violators = athletesWithZones
    .filter(a => athleteZonePct[a.id] < 80)
    .sort((a, b) => athleteZonePct[a.id] - athleteZonePct[b.id]);

  // ── Metric 3: Load Progression (last week vs avg of 2 weeks before) ──
  const loadRisks = athletes.map(a => {
    const wb = athleteWeeklyBreakdown[a.id] || { w1: 0, w2: 0, w3: 0 };
    const lastWeek = wb.w1; // last completed week
    const priorAvg = (wb.w2 + wb.w3) / 2; // average of 2 weeks before
    const pctChange = priorAvg > 0 ? Math.round(((lastWeek - priorAvg) / priorAvg) * 100) : 0;
    const alert = overtTrainingAlerts[a.id];
    return { ...a, lastWeek, priorAvg: Math.round(priorAvg * 10) / 10, pctChange, alert: alert?.alert, signals: alert?.signals || [] };
  }).filter(a => a.pctChange > 15 || a.alert)
    .sort((a, b) => (b.signals.length + (b.pctChange > 15 ? 1 : 0)) - (a.signals.length + (a.pctChange > 15 ? 1 : 0)));

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
    return d && (d.avgSleep < 2.5 || d.avgLegs < 2.5 || d.moodDeclining);
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

        {/* ── 2. Intensity Distribution ── */}
        <TouchableOpacity style={styles.section} onPress={() => toggle('intensity')} activeOpacity={0.8}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionNum}>2</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Training Intensity</Text>
              <Text style={styles.sectionSub}>Is the team running easy enough?</Text>
            </View>
            <Ionicons name={expandedSection === 'intensity' ? 'chevron-up' : 'chevron-down'} size={20} color={NEUTRAL.muted} />
          </View>
          <View style={styles.intensityRow}>
            <Text style={[styles.intensityNum, { color: teamAvgZone === null ? NEUTRAL.muted : teamAvgZone >= 80 ? STATUS.success : teamAvgZone >= 70 ? STATUS.warning : STATUS.error }]}>
              {teamAvgZone !== null ? teamAvgZone + '%' : '—'}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.intensityLabel}>Team avg Z1+Z2</Text>
              <Text style={styles.intensitySub}>{violators.length > 0 ? `${violators.length} athlete${violators.length > 1 ? 's' : ''} below 80%` : 'All meeting 80/20 target'}</Text>
            </View>
          </View>
        </TouchableOpacity>
        {expandedSection === 'intensity' && (
          <View style={styles.detail}>
            {violators.length === 0 ? (
              <Text style={styles.detailEmpty}>All athletes with HR data are meeting the 80/20 target.</Text>
            ) : violators.map(a => (
              <View key={a.id} style={styles.detailRow}>
                <View style={[styles.detailAvatar, { backgroundColor: a.avatarColor || BRAND }]}>
                  <Text style={styles.detailAvatarText}>{a.firstName?.[0]}{a.lastName?.[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailName}>{a.firstName} {a.lastName}</Text>
                  <Text style={styles.detailSub}>Z1+Z2: {athleteZonePct[a.id]}% (target: 80%)</Text>
                </View>
                <Text style={[styles.pctBadge, { color: athleteZonePct[a.id] < 70 ? STATUS.error : STATUS.warning }]}>{athleteZonePct[a.id]}%</Text>
              </View>
            ))}
            {athletesWithZones.length === 0 && <Text style={styles.detailEmpty}>No HR zone data available. Athletes need Strava with a heart rate monitor.</Text>}
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
                        </View>
                        <View style={styles.wellnessScores}>
                          <Text style={[styles.wellnessScore, { color: d.avgSleep < 2.5 ? STATUS.error : d.avgSleep < 3.5 ? STATUS.warning : STATUS.success }]}>😴 {d.avgSleep.toFixed(1)}</Text>
                          <Text style={[styles.wellnessScore, { color: d.avgLegs < 2.5 ? STATUS.error : d.avgLegs < 3.5 ? STATUS.warning : STATUS.success }]}>🦵 {d.avgLegs.toFixed(1)}</Text>
                          <Text style={[styles.wellnessScore, { color: d.avgMood < 2.5 ? STATUS.error : d.avgMood < 3.5 ? STATUS.warning : STATUS.success }]}>😊 {d.avgMood.toFixed(1)}</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: NEUTRAL.bg },
  header:          { backgroundColor: NEUTRAL.card, paddingTop: Platform.OS === 'ios' ? 56 : 32, paddingBottom: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
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
  detailName:      { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: BRAND_DARK },
  detailSub:       { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: 1 },
  detailEmpty:     { fontSize: FONT_SIZE.sm, color: NEUTRAL.muted, textAlign: 'center', paddingVertical: SPACE.md },
  statusBadge:     { borderRadius: RADIUS.sm, paddingHorizontal: SPACE.sm, paddingVertical: 3 },
  statusText:      { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold },
  pctBadge:        { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  signalText:      { fontSize: FONT_SIZE.xs, color: STATUS.error, marginTop: 2 },
  noDataText:      { fontSize: FONT_SIZE.sm, color: NEUTRAL.muted, marginTop: SPACE.md, textAlign: 'center' },
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
  gaugeLabel:      { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, width: 40 },
  gaugeBg:         { flex: 1, height: 8, backgroundColor: NEUTRAL.bg, borderRadius: 4, overflow: 'hidden' },
  gaugeFill:       { height: '100%', borderRadius: 4 },
  gaugeValue:      { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, width: 28, textAlign: 'right' },
});
