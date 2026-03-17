import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';

// ── Duration parser ───────────────────────────────────────────────────────────
function parseDurationMinutes(durationStr) {
  if (!durationStr) return 0;
  const parts = durationStr.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return 0;
}

// ── HR zone helper ────────────────────────────────────────────────────────────
function getHRZone(heartRate, age) {
  if (!heartRate || !age) return null;
  const maxHR = 220 - age;
  const pct = heartRate / maxHR;
  if (pct < 0.60) return { zone: 1, name: 'Recovery',      color: '#64b5f6' };
  if (pct < 0.70) return { zone: 2, name: 'Aerobic Base',  color: '#4caf50' };
  if (pct < 0.80) return { zone: 3, name: 'Aerobic Power', color: '#ff9800' };
  if (pct < 0.90) return { zone: 4, name: 'Threshold',     color: '#f44336' };
  return              { zone: 5, name: 'Anaerobic',     color: '#9c27b0' };
}

export default function TeammateProfile({ athlete, school, onBack }) {
  const [runs,       setRuns]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [totalMiles, setTotalMiles] = useState(0);

  const primaryColor = school?.primaryColor || '#2e7d32';
  const myUid = auth.currentUser?.uid;

  const athleteAge = athlete.birthdate
    ? Math.floor((new Date() - new Date(athlete.birthdate)) / (365.25 * 86400000))
    : 16;

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    setLoading(true);
    try {
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

  // Duration-based zone breakdown
  const zoneMinutes = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  runs.forEach(r => {
    const zone = getHRZone(r.heartRate, athleteAge);
    if (!zone) return;
    const mins = parseDurationMinutes(r.duration);
    if (mins > 0) zoneMinutes[zone.zone] += mins;
  });
  const totalZoneMins = Object.values(zoneMinutes).reduce((s, v) => s + v, 0);
  const zoneCounts = totalZoneMins > 0
    ? Object.entries(zoneMinutes)
        .filter(([, m]) => m > 0)
        .map(([z, m]) => ({ zone: parseInt(z), minutes: Math.round(m), pct: Math.round((m / totalZoneMins) * 100) }))
    : [];
  const fmtMins = (m) => m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { backgroundColor: primaryColor }]}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.center}><ActivityIndicator size="large" color={primaryColor} /></View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { backgroundColor: primaryColor }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
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
              <Text style={[styles.statNum, { color: primaryColor }]}>{totalMiles}</Text>
              <Text style={styles.statLabel}>miles this month</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={[styles.statNum, { color: primaryColor }]}>{runs.length}</Text>
              <Text style={styles.statLabel}>runs logged</Text>
            </View>
          </View>
        </View>

        {/* Zone breakdown */}
        {zoneCounts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Training zone breakdown — this month</Text>
            <View style={styles.zoneCard}>
              <View style={styles.zoneStackedBar}>
                {zoneCounts.map(z => (
                  <View key={z.zone} style={[styles.zoneStackedSegment, { flex: z.minutes, backgroundColor: { 1: '#64b5f6', 2: '#4caf50', 3: '#ff9800', 4: '#f44336', 5: '#9c27b0' }[z.zone] }]} />
                ))}
              </View>
              {zoneCounts.map(({ zone, minutes, pct }) => {
                const zoneColors = { 1: '#64b5f6', 2: '#4caf50', 3: '#ff9800', 4: '#f44336', 5: '#9c27b0' };
                const zoneNames  = { 1: 'Recovery', 2: 'Aerobic Base', 3: 'Aerobic Power', 4: 'Threshold', 5: 'Anaerobic' };
                return (
                  <View key={zone} style={styles.zoneRow}>
                    <View style={[styles.zoneDot, { backgroundColor: zoneColors[zone] }]} />
                    <Text style={styles.zoneName}>Z{zone} {zoneNames[zone]}</Text>
                    <View style={styles.zoneBarBg}>
                      <View style={[styles.zoneBarFill, { width: `${pct}%`, backgroundColor: zoneColors[zone] }]} />
                    </View>
                    <Text style={styles.zoneCount}>{fmtMins(minutes)}</Text>
                  </View>
                );
              })}
              <Text style={styles.zoneTotalHint}>{fmtMins(totalZoneMins)} total with HR data</Text>
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
            const zone = getHRZone(run.heartRate, athleteAge);
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
                    {zone && (
                      <View style={[styles.zoneBadge, { backgroundColor: zone.color }]}>
                        <Text style={styles.zoneBadgeText}>Z{zone.zone} {zone.name}</Text>
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
  container:       { flex: 1, backgroundColor: '#f5f5f5' },
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:          { paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:         { paddingVertical: 6, paddingHorizontal: 10 },
  backText:        { color: '#fff', fontSize: 17, fontWeight: '600' },
  headerTitle:     { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  scroll:          { flex: 1 },
  summaryCard:     { backgroundColor: '#fff', margin: 16, borderRadius: 14, padding: 24, alignItems: 'center', borderTopWidth: 4 },
  avatar:          { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText:      { color: '#fff', fontSize: 26, fontWeight: 'bold' },
  athleteName:     { fontSize: 22, fontWeight: '700', color: '#333', marginBottom: 4 },
  athleteSub:      { fontSize: 14, color: '#999', marginBottom: 16 },
  statRow:         { flexDirection: 'row', alignItems: 'center', gap: 24 },
  statBox:         { alignItems: 'center' },
  statNum:         { fontSize: 28, fontWeight: 'bold' },
  statLabel:       { fontSize: 12, color: '#999', marginTop: 2 },
  statDivider:     { width: 1, height: 36, backgroundColor: '#eee' },
  section:         { paddingHorizontal: 16, marginBottom: 8 },
  sectionTitle:    { fontSize: 17, fontWeight: '700', color: '#333', marginBottom: 10 },
  zoneCard:        { backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 8 },
  zoneStackedBar:  { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 4 },
  zoneStackedSegment: { height: '100%' },
  zoneTotalHint:   { fontSize: 11, color: '#bbb', textAlign: 'right', marginTop: 2 },
  zoneRow:         { flexDirection: 'row', alignItems: 'center', gap: 8 },
  zoneDot:         { width: 10, height: 10, borderRadius: 5 },
  zoneName:        { fontSize: 13, color: '#555', width: 120 },
  zoneBarBg:       { flex: 1, height: 8, backgroundColor: '#f0f0f0', borderRadius: 4, overflow: 'hidden' },
  zoneBarFill:     { height: '100%', borderRadius: 4 },
  zoneCount:       { fontSize: 12, color: '#666', fontWeight: '600', width: 52, textAlign: 'right' },
  emptyCard:       { backgroundColor: '#fff', borderRadius: 14, padding: 24, alignItems: 'center' },
  emptyText:       { fontSize: 15, color: '#999' },
  runCard:         { backgroundColor: '#fff', borderRadius: 14, marginBottom: 10, padding: 14 },
  runTop:          { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  runLeft:         { width: 80 },
  runMiles:        { fontSize: 17, fontWeight: '700', color: '#333' },
  runDate:         { fontSize: 12, color: '#999', marginTop: 2 },
  runMiddle:       { flex: 1, gap: 4 },
  runDetail:       { fontSize: 14, color: '#555' },
  zoneBadge:       { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  zoneBadgeText:   { color: '#fff', fontSize: 11, fontWeight: '700' },
});