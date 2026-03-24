import { Ionicons } from '@expo/vector-icons';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
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
import { BRAND, BRAND_DARK } from '../constants/design';
import { auth, db } from '../firebaseConfig';
import {
  DEFAULT_ZONE_BOUNDARIES,
  ZONE_META,
  calcMaxHR,
  calcZoneBreakdownFromRuns,
  calcZoneBreakdownFromStream,
  formatMinutes,
  parseBirthdate,
} from '../zoneConfig';

export default function TeammateProfile({ athlete, school, onBack }) {
  const [runs,            setRuns]            = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [totalMiles,      setTotalMiles]       = useState(0);
  const [teamZoneSettings, setTeamZoneSettings] = useState(null);

  const primaryColor = school?.primaryColor || '#213f96';
  const myUid = auth.currentUser?.uid;

  const athleteAge = athlete.birthdate
    ? Math.floor((new Date() - parseBirthdate(athlete.birthdate)) / (365.25 * 86400000))
    : 16;

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    setLoading(true);
    try {
      // FIX: Load the team's zone settings from Firestore so zone breakdown
      // respects coach-configured boundaries instead of using hardcoded defaults.
      if (school?.id || athlete.schoolId) {
        try {
          const schoolId = school?.id || athlete.schoolId;
          const zoneDoc = await getDoc(doc(db, 'teamZoneSettings', schoolId));
          if (zoneDoc.exists()) setTeamZoneSettings(zoneDoc.data());
        } catch (e) { console.warn('Failed to load team zone settings, using defaults:', e); }
      }

      // Load runs
      const runsSnap = await getDocs(query(
        collection(db, 'runs'),
        where('userId', '==', athlete.id),
        orderBy('date', 'desc'),
        limit(30)
      ));
      const athleteRuns = runsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRuns(athleteRuns);

      // Totals based on current calendar month only
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const monthRuns = athleteRuns.filter(r => {
        const d = r.date?.toDate?.();
        return d && d >= monthStart;
      });
      setTotalMiles(Math.round(monthRuns.reduce((s, r) => s + (r.miles || 0), 0) * 10) / 10);
    } catch (e) { console.error('TeammateProfile load:', e); }
    setLoading(false);
  };

  // ── Zone breakdown for this month ────────────────────────────────────────
  // FIX: was using a local hardcoded getHRZone() that ignored team boundaries.
  // Now uses zoneConfig functions with team-configured boundaries, matching
  // what the coach sees on the CoachDashboard and AthleteDetailScreen.
  const getZoneBreakdown = () => {
    const boundaries = teamZoneSettings?.boundaries || DEFAULT_ZONE_BOUNDARIES;
    const maxHR = calcMaxHR(athleteAge, teamZoneSettings?.customMaxHR || null);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthRuns = runs.filter(r => {
      const d = r.date?.toDate?.();
      return d && d >= monthStart;
    });

    if (monthRuns.length === 0) return { breakdown: null, hasStreamData: false };

    // Priority 1: raw HR stream data — most accurate
    const rawStreamRuns = monthRuns.filter(r => r.rawHRStream?.length > 0);
    if (rawStreamRuns.length > 0) {
      const combined = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
      rawStreamRuns.forEach(r => {
        const bd = calcZoneBreakdownFromStream(r.rawHRStream, maxHR, boundaries);
        if (bd) bd.forEach(z => { combined[`z${z.zone}`] = (combined[`z${z.zone}`] || 0) + z.seconds; });
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

    // Priority 2: stored zone seconds
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

    // Priority 3: avg HR + duration estimate
    const bd = calcZoneBreakdownFromRuns(monthRuns, athleteAge, teamZoneSettings?.customMaxHR || null, boundaries);
    return { breakdown: bd, hasStreamData: false };
  };

  const { breakdown: zoneBreakdown, hasStreamData } = getZoneBreakdown();
  const totalZoneMins = zoneBreakdown ? zoneBreakdown.reduce((s, z) => s + z.minutes, 0) : 0;

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={BRAND_DARK} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.center}><ActivityIndicator size="large" color={BRAND} /></View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={BRAND_DARK} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{athlete.firstName}'s Profile</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Summary card */}
        <View style={[styles.summaryCard, { borderTopColor: primaryColor }]}>
          <View style={[styles.avatar, { backgroundColor: primaryColor }]}>
            <Text style={styles.avatarText}>{athlete.firstName?.[0]}{athlete.lastName?.[0]}</Text>
          </View>
          <Text style={styles.athleteName}>{athlete.firstName} {athlete.lastName}</Text>
          <Text style={styles.athleteSub}>
            {athlete.gender === 'boys' ? 'Boys team' : athlete.gender === 'girls' ? 'Girls team' : ''}
            {athlete.gender && '  ·  '}{school?.name}
          </Text>
          <View style={styles.statRow}>
            <View style={styles.statBox}>
              <Text style={[styles.statNum, { color: BRAND }]}>{totalMiles}</Text>
              <Text style={styles.statLabel}>miles this month</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={[styles.statNum, { color: BRAND }]}>{runs.length}</Text>
              <Text style={styles.statLabel}>runs logged</Text>
            </View>
          </View>
        </View>

        {/* Zone breakdown — uses team zone settings */}
        {zoneBreakdown && zoneBreakdown.length > 0 && (
          <View style={styles.section}>
            <View style={styles.zoneTitleRow}>
              <Text style={styles.sectionTitle}>Training zones — this month</Text>
              {hasStreamData
                ? <View style={styles.preciseBadge}><Text style={styles.preciseBadgeText}>Precise ✓</Text></View>
                : <Text style={styles.estimatedText}>estimated from avg HR</Text>
              }
            </View>
            <View style={styles.zoneCard}>
              <View style={styles.zoneStackedBar}>
                {zoneBreakdown.map(z => (
                  <View key={z.zone} style={[styles.zoneStackedSegment, { flex: z.minutes, backgroundColor: ZONE_META[z.zone].color }]} />
                ))}
              </View>
              {zoneBreakdown.map(z => (
                <View key={z.zone} style={styles.zoneRow}>
                  <View style={[styles.zoneDot, { backgroundColor: ZONE_META[z.zone].color }]} />
                  <Text style={styles.zoneName}>Z{z.zone} {ZONE_META[z.zone].name}</Text>
                  <View style={styles.zoneBarBg}>
                    <View style={[styles.zoneBarFill, { width: `${z.pct}%`, backgroundColor: ZONE_META[z.zone].color }]} />
                  </View>
                  <Text style={styles.zoneCount}>{formatMinutes(z.minutes)}</Text>
                </View>
              ))}
              <Text style={styles.zoneTotalHint}>{formatMinutes(totalZoneMins)} total with HR data</Text>
            </View>
          </View>
        )}

        {/* Recent runs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent runs</Text>
          {runs.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No runs logged yet.</Text>
            </View>
          ) : runs.map(run => {
            const runDate = run.date?.toDate?.()?.toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric'
            });
            return (
              <View key={run.id} style={styles.runCard}>
                <View style={styles.runTop}>
                  <View style={styles.runLeft}>
                    <Text style={styles.runMiles}>{run.miles} mi</Text>
                    <Text style={styles.runDate}>{runDate}</Text>
                  </View>
                  <View style={styles.runMiddle}>
                    {run.duration && <Text style={styles.runDetail}>{run.duration}</Text>}
                    {run.heartRate && <Text style={styles.runDetail}>{run.heartRate} bpm avg</Text>}
                    {run.hasStreamData && (
                      <View style={[styles.zoneBadge, { backgroundColor: '#e8edf8' }]}>
                        <Text style={[styles.zoneBadgeText, { color: '#213f96' }]}>HR zones ✓</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#F5F6FA' },
  center:             { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:             { backgroundColor: '#fff', paddingTop: Platform.OS === 'ios' ? 56 : 32, paddingBottom: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn:            { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
  backText:           { color: '#111827', fontSize: 15, fontWeight: '600' },
  headerTitle:        { fontSize: 20, fontWeight: '700', color: '#111827' },
  scroll:             { flex: 1 },
  summaryCard:        { backgroundColor: '#fff', margin: 16, borderRadius: 14, padding: 24, alignItems: 'center', borderTopWidth: 4 },
  avatar:             { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText:         { color: '#fff', fontSize: 26, fontWeight: 'bold' },
  athleteName:        { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 4 },
  athleteSub:         { fontSize: 14, color: '#9CA3AF', marginBottom: 16 },
  statRow:            { flexDirection: 'row', alignItems: 'center', gap: 24 },
  statBox:            { alignItems: 'center' },
  statNum:            { fontSize: 28, fontWeight: 'bold' },
  statLabel:          { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  statDivider:        { width: 1, height: 36, backgroundColor: '#E5E7EB' },
  section:            { paddingHorizontal: 16, marginBottom: 8 },
  zoneTitleRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sectionTitle:       { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 10 },
  preciseBadge:       { backgroundColor: '#e8edf8', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  preciseBadgeText:   { fontSize: 11, color: '#213f96', fontWeight: '700' },
  estimatedText:      { fontSize: 11, color: '#bbb' },
  zoneCard:           { backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 8 },
  zoneStackedBar:     { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 4 },
  zoneStackedSegment: { height: '100%' },
  zoneTotalHint:      { fontSize: 11, color: '#bbb', textAlign: 'right', marginTop: 2 },
  zoneRow:            { flexDirection: 'row', alignItems: 'center', gap: 8 },
  zoneDot:            { width: 10, height: 10, borderRadius: 5 },
  zoneName:           { fontSize: 13, color: '#555', width: 120 },
  zoneBarBg:          { flex: 1, height: 8, backgroundColor: '#f0f0f0', borderRadius: 4, overflow: 'hidden' },
  zoneBarFill:        { height: '100%', borderRadius: 4 },
  zoneCount:          { fontSize: 12, color: '#6B7280', fontWeight: '600', width: 52, textAlign: 'right' },
  emptyCard:          { backgroundColor: '#fff', borderRadius: 14, padding: 24, alignItems: 'center' },
  emptyText:          { fontSize: 15, color: '#9CA3AF' },
  runCard:            { backgroundColor: '#fff', borderRadius: 14, marginBottom: 10, padding: 14 },
  runTop:             { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  runLeft:            { width: 80 },
  runMiles:           { fontSize: 17, fontWeight: '700', color: '#111827' },
  runDate:            { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  runMiddle:          { flex: 1, gap: 4 },
  runDetail:          { fontSize: 14, color: '#555' },
  zoneBadge:          { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  zoneBadgeText:      { fontSize: 11, fontWeight: '700' },
});
