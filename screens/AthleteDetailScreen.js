import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { db } from '../firebaseConfig';
import {
  DEFAULT_ZONE_BOUNDARIES, ZONE_META, calcMaxHR,
  calcZoneBreakdownFromRuns, calcZoneBreakdownFromStream,
  formatMinutes,
} from '../zoneConfig';
import RunDetailModal from './RunDetailModal';

export default function AthleteDetailScreen({ athlete, school, teamZoneSettings, onBack }) {
  const [runs,             setRuns]             = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [selectedRun,      setSelectedRun]      = useState(null);
  const [runDetailVisible, setRunDetailVisible] = useState(false);

  const primaryColor = school?.primaryColor || '#2e7d32';

  // Athlete age for zone calc
  const athleteAge = athlete.birthdate
    ? Math.floor((new Date() - new Date(athlete.birthdate)) / (365.25 * 86400000))
    : 16;

  const boundaries  = teamZoneSettings?.boundaries || DEFAULT_ZONE_BOUNDARIES;
  const maxHR       = calcMaxHR(athleteAge);

  useEffect(() => { loadRuns(); }, []);

  const loadRuns = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'runs'),
        where('userId', '==', athlete.id),
        orderBy('date', 'desc')
      ));
      setRuns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error('Load runs error:', e); }
    setLoading(false);
  };

  // ── Date boundary helpers ────────────────────────────────────────────────────
  const now = new Date();

  // This week — Monday to now
  const weekStart = new Date(now);
  const dayOfWeek = now.getDay();
  weekStart.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  weekStart.setHours(0, 0, 0, 0);

  // This month — 1st to now
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // ── Calculated stats ─────────────────────────────────────────────────────────
  const weekRuns  = runs.filter(r => { const d = r.date?.toDate?.(); return d && d >= weekStart; });
  const monthRuns = runs.filter(r => { const d = r.date?.toDate?.(); return d && d >= monthStart; });

  const weekMiles  = Math.round(weekRuns.reduce((s, r)  => s + (r.miles || 0), 0) * 10) / 10;
  const monthMiles = Math.round(monthRuns.reduce((s, r) => s + (r.miles || 0), 0) * 10) / 10;

  // ── Zone breakdown — MTD, stream data preferred ───────────────────────────
  const getMonthZoneBreakdown = () => {
    // Priority 1 — recalculate from raw HR stream using CURRENT team boundaries
    const rawStreamRuns = monthRuns.filter(r => r.rawHRStream?.length > 0);
    if (rawStreamRuns.length > 0) {
      const combined = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
      rawStreamRuns.forEach(r => {
        const runBreakdown = calcZoneBreakdownFromStream(r.rawHRStream, maxHR, boundaries);
        if (runBreakdown) {
          runBreakdown.forEach(z => {
            combined[`z${z.zone}`] = (combined[`z${z.zone}`] || 0) + z.seconds;
          });
        }
      });
      const total = Object.values(combined).reduce((s, v) => s + v, 0);
      if (total > 0) {
        return {
          breakdown: Object.entries(combined)
            .filter(([, s]) => s > 0)
            .map(([key, secs]) => {
              const zone = parseInt(key.replace('z', ''));
              return { zone, seconds: secs, minutes: Math.round(secs / 60), pct: Math.round((secs / total) * 100), ...ZONE_META[zone] };
            })
            .sort((a, b) => a.zone - b.zone),
          hasStreamData: true,
        };
      }
    }

    // Priority 2 — stored zone seconds (may reflect old boundaries — less accurate)
    const storedZoneRuns = monthRuns.filter(r => r.hasStreamData && r.zoneSeconds);
    if (storedZoneRuns.length > 0) {
      const combined = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
      storedZoneRuns.forEach(r => {
        Object.entries(r.zoneSeconds).forEach(([k, v]) => {
          if (combined[k] !== undefined) combined[k] += v;
        });
      });
      const total = Object.values(combined).reduce((s, v) => s + v, 0);
      if (total > 0) {
        return {
          breakdown: Object.entries(combined)
            .filter(([, s]) => s > 0)
            .map(([key, secs]) => {
              const zone = parseInt(key.replace('z', ''));
              return { zone, seconds: secs, minutes: Math.round(secs / 60), pct: Math.round((secs / total) * 100), ...ZONE_META[zone] };
            })
            .sort((a, b) => a.zone - b.zone),
          hasStreamData: true,
        };
      }
    }

    // Priority 3 — avg HR + duration estimate
    const bd = calcZoneBreakdownFromRuns(monthRuns, athleteAge, null, boundaries);
    return { breakdown: bd, hasStreamData: false };
  };

  const { breakdown: zoneBreakdown, hasStreamData } = getMonthZoneBreakdown();
  const easyPct = zoneBreakdown
    ? zoneBreakdown.filter(z => z.zone <= 2).reduce((s, z) => s + z.pct, 0)
    : null;
  const totalZoneMins = zoneBreakdown
    ? zoneBreakdown.reduce((s, z) => s + z.minutes, 0)
    : 0;

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={[styles.header, { backgroundColor: primaryColor }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Back to team</Text>
        </TouchableOpacity>
        <View style={styles.athleteRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{athlete.firstName?.[0]}{athlete.lastName?.[0]}</Text>
          </View>
          <View style={styles.athleteMeta}>
            <Text style={styles.athleteName}>{athlete.firstName} {athlete.lastName}</Text>
            <Text style={styles.athleteEmail}>{athlete.email}</Text>
          </View>
        </View>

        {/* Fixed stats in header */}
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
            <Text style={styles.headerStatNum}>{runs.length}</Text>
            <Text style={styles.headerStatLabel}>Total runs</Text>
          </View>
          {easyPct !== null && (
            <>
              <View style={styles.headerStatDivider} />
              <View style={styles.headerStat}>
                <Text style={[styles.headerStatNum, easyPct < 70 && { color: '#fca5a5' }]}>
                  {easyPct}%
                </Text>
                <Text style={styles.headerStatLabel}>Z1+Z2 MTD</Text>
              </View>
            </>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={primaryColor} /></View>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* MTD zone breakdown */}
          {zoneBreakdown && zoneBreakdown.length > 0 && (
            <View style={styles.zoneSection}>
              <View style={styles.zoneTitleRow}>
                <Text style={styles.zoneSectionTitle}>Heart rate zones — month to date</Text>
                {hasStreamData
                  ? <View style={styles.preciseBadge}><Text style={styles.preciseBadgeText}>Precise ✓</Text></View>
                  : <Text style={styles.estimatedText}>estimated from avg HR</Text>
                }
              </View>
              <View style={styles.zoneCard}>
                {/* Stacked bar */}
                <View style={styles.stackedBar}>
                  {zoneBreakdown.map(z => (
                    <View key={z.zone} style={[styles.stackedSegment, { flex: z.minutes, backgroundColor: ZONE_META[z.zone].color }]} />
                  ))}
                </View>
                {/* Zone rows */}
                {zoneBreakdown.map(z => (
                  <View key={z.zone} style={styles.zoneRow}>
                    <View style={[styles.zoneDot, { backgroundColor: ZONE_META[z.zone].color }]} />
                    <Text style={styles.zoneName}>Z{z.zone} {ZONE_META[z.zone].name}</Text>
                    <View style={styles.zoneBarBg}>
                      <View style={[styles.zoneBarFill, { width: `${z.pct}%`, backgroundColor: ZONE_META[z.zone].color }]} />
                    </View>
                    <Text style={styles.zoneTime}>{formatMinutes(z.minutes)}</Text>
                  </View>
                ))}
                {/* 80/20 callout */}
                {easyPct !== null && (
                  <View style={[styles.easyPctRow, {
                    backgroundColor: easyPct >= 75 ? '#e8f5e9' : easyPct >= 65 ? '#fff8e1' : '#fce4ec'
                  }]}>
                    <Text style={[styles.easyPctText, {
                      color: easyPct >= 75 ? '#2e7d32' : easyPct >= 65 ? '#f57f17' : '#c62828'
                    }]}>
                      {easyPct}% easy (Z1+Z2) · {easyPct >= 75 ? '✅ On target' : easyPct >= 65 ? '⚠️ Slightly high intensity' : '🔴 Too much intensity'}
                    </Text>
                  </View>
                )}
                <Text style={styles.zoneTotalTime}>{formatMinutes(totalZoneMins)} total with HR data</Text>
              </View>
            </View>
          )}

          {/* Full run history */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Run history · {runs.length} run{runs.length !== 1 ? 's' : ''}
            </Text>
            {runs.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No runs logged yet.</Text>
              </View>
            ) : runs.map(run => {
              const runDate = run.date?.toDate?.()?.toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric'
              });
              const isThisWeek = run.date?.toDate?.() >= weekStart;
              const isThisMonth = run.date?.toDate?.() >= monthStart;
              return (
                <TouchableOpacity
                  key={run.id}
                  style={[styles.runCard, isThisWeek && { borderLeftColor: primaryColor, borderLeftWidth: 3 }]}
                  onPress={() => { setSelectedRun(run); setRunDetailVisible(true); }}
                >
                  <View style={styles.runTop}>
                    <Text style={styles.runMiles}>{run.miles} mi</Text>
                    <View style={styles.runTopRight}>
                      {isThisWeek && <View style={[styles.weekTag, { backgroundColor: primaryColor }]}><Text style={styles.weekTagText}>This week</Text></View>}
                      <Text style={styles.runDate}>{runDate}</Text>
                    </View>
                  </View>
                  <View style={styles.runChips}>
                    {run.duration && <Text style={styles.chip}>{run.duration}</Text>}
                    {run.heartRate && <Text style={styles.chip}>{run.heartRate} bpm avg</Text>}
                    {run.effort && <Text style={[styles.chip, { color: primaryColor, borderColor: `${primaryColor}60` }]}>Effort {run.effort}/10</Text>}
                    {run.hasStreamData && <Text style={[styles.chip, { color: '#2e7d32', borderColor: '#a5d6a7' }]}>HR zones ✓</Text>}
                  </View>
                  {run.notes && <Text style={styles.runNote} numberOfLines={1}>"{run.notes}"</Text>}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      <RunDetailModal
        run={selectedRun}
        visible={runDetailVisible}
        onClose={() => { setRunDetailVisible(false); setSelectedRun(null); }}
        primaryColor={primaryColor}
        athleteAge={athleteAge}
        zoneSettings={{ boundaries }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#f5f5f5' },
  center:           { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:           { paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20 },
  backBtn:          { marginBottom: 12 },
  backText:         { color: 'rgba(255,255,255,0.9)', fontSize: 15, fontWeight: '600' },
  athleteRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  avatar:           { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  avatarText:       { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  athleteMeta:      { flex: 1 },
  athleteName:      { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  athleteEmail:     { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  headerStats:      { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 12, padding: 12, gap: 4 },
  headerStat:       { flex: 1, alignItems: 'center' },
  headerStatNum:    { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  headerStatLabel:  { fontSize: 10, color: 'rgba(255,255,255,0.75)', marginTop: 2, textAlign: 'center' },
  headerStatDivider:{ width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.2)' },
  scroll:           { flex: 1 },
  zoneSection:      { margin: 16, marginBottom: 8 },
  zoneTitleRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  zoneSectionTitle: { fontSize: 14, fontWeight: '700', color: '#555' },
  preciseBadge:     { backgroundColor: '#e8f5e9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  preciseBadgeText: { fontSize: 11, color: '#2e7d32', fontWeight: '700' },
  estimatedText:    { fontSize: 11, color: '#bbb' },
  zoneCard:         { backgroundColor: '#fff', borderRadius: 14, padding: 14 },
  stackedBar:       { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 12 },
  stackedSegment:   { height: '100%' },
  zoneRow:          { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  zoneDot:          { width: 10, height: 10, borderRadius: 5 },
  zoneName:         { fontSize: 12, color: '#555', width: 116 },
  zoneBarBg:        { flex: 1, height: 6, backgroundColor: '#f0f0f0', borderRadius: 3, overflow: 'hidden' },
  zoneBarFill:      { height: '100%', borderRadius: 3 },
  zoneTime:         { fontSize: 12, fontWeight: '600', color: '#555', width: 52, textAlign: 'right' },
  easyPctRow:       { borderRadius: 8, padding: 10, marginTop: 8, marginBottom: 4 },
  easyPctText:      { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  zoneTotalTime:    { fontSize: 11, color: '#bbb', textAlign: 'right', marginTop: 4 },
  section:          { paddingHorizontal: 16 },
  sectionTitle:     { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 12 },
  emptyCard:        { backgroundColor: '#fff', borderRadius: 12, padding: 24, alignItems: 'center' },
  emptyText:        { color: '#999', fontSize: 14 },
  runCard:          { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10 },
  runTop:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  runMiles:         { fontSize: 18, fontWeight: 'bold', color: '#333' },
  runTopRight:      { alignItems: 'flex-end', gap: 4 },
  weekTag:          { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  weekTagText:      { color: '#fff', fontSize: 10, fontWeight: '700' },
  runDate:          { fontSize: 12, color: '#999' },
  runChips:         { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  chip:             { fontSize: 12, fontWeight: '600', color: '#666', borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  runNote:          { fontSize: 12, color: '#888', fontStyle: 'italic', marginTop: 4 },
});