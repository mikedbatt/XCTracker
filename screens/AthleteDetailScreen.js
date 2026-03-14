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
import RunDetailModal from './RunDetailModal';
import TimeframePicker, { TIMEFRAMES, getDateRange } from './TimeframePicker';

export default function AthleteDetailScreen({ athlete, school, onBack }) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTimeframe, setSelectedTimeframe] = useState(TIMEFRAMES[0]);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [selectedRun, setSelectedRun] = useState(null);
  const [runDetailVisible, setRunDetailVisible] = useState(false);

  const primaryColor = school?.primaryColor || '#2e7d32';
  const seasonStart = school?.seasonStart || null;
  const seasonEnd = school?.seasonEnd || null;

  useEffect(() => { loadRuns(); }, [selectedTimeframe, customStart, customEnd]);

  const loadRuns = async () => {
    setLoading(true);
    try {
      let startDate = null;
      if (selectedTimeframe.days === 'custom') {
        startDate = customStart ? new Date(customStart) : null;
      } else {
        const range = getDateRange(selectedTimeframe, seasonStart, seasonEnd);
        startDate = range.start;
      }

      let runsQuery;
      if (startDate) {
        runsQuery = query(collection(db, 'runs'), where('userId', '==', athlete.id), where('date', '>=', startDate), orderBy('date', 'desc'));
      } else {
        runsQuery = query(collection(db, 'runs'), where('userId', '==', athlete.id), orderBy('date', 'desc'));
      }
      const snap = await getDocs(runsQuery);
      let fetchedRuns = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (selectedTimeframe.days === 'custom' && customEnd) {
        const endDate = new Date(customEnd);
        endDate.setHours(23, 59, 59);
        fetchedRuns = fetchedRuns.filter(r => r.date?.toDate?.() <= endDate);
      }
      setRuns(fetchedRuns);
    } catch (error) { console.error('Load runs error:', error); }
    setLoading(false);
  };

  const totalMiles = Math.round(runs.reduce((sum, r) => sum + (r.miles || 0), 0) * 10) / 10;
  const avgEffort = runs.length ? Math.round(runs.reduce((sum, r) => sum + (r.effort || 0), 0) / runs.length * 10) / 10 : 0;
  const hrRuns = runs.filter(r => r.heartRate);
  const avgHR = hrRuns.length ? Math.round(hrRuns.reduce((sum, r) => sum + r.heartRate, 0) / hrRuns.length) : null;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { backgroundColor: primaryColor }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Back to team</Text>
        </TouchableOpacity>
        <View style={styles.athleteRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{athlete.firstName?.[0]}{athlete.lastName?.[0]}</Text>
          </View>
          <View>
            <Text style={styles.athleteName}>{athlete.firstName} {athlete.lastName}</Text>
            <Text style={styles.athleteEmail}>{athlete.email}</Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.scroll}>
        <View style={styles.pickerContainer}>
          <TimeframePicker
            selected={selectedTimeframe}
            onSelect={setSelectedTimeframe}
            customStart={customStart}
            customEnd={customEnd}
            onCustomChange={(s, e) => { setCustomStart(s); setCustomEnd(e); }}
            seasonStart={seasonStart}
            seasonEnd={seasonEnd}
            primaryColor={primaryColor}
          />
        </View>

        {loading ? (
          <View style={styles.loading}><ActivityIndicator size="large" color={primaryColor} /></View>
        ) : (
          <>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={[styles.statNumber, { color: primaryColor }]}>{totalMiles}</Text>
                <Text style={styles.statLabel}>Miles</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statNumber, { color: primaryColor }]}>{runs.length}</Text>
                <Text style={styles.statLabel}>Runs</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statNumber, { color: primaryColor }]}>{avgEffort || '—'}</Text>
                <Text style={styles.statLabel}>Avg effort</Text>
              </View>
              {avgHR && (
                <View style={styles.statCard}>
                  <Text style={[styles.statNumber, { color: primaryColor }]}>{avgHR}</Text>
                  <Text style={styles.statLabel}>Avg HR</Text>
                </View>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{runs.length} run{runs.length !== 1 ? 's' : ''} — {selectedTimeframe.label}</Text>
              {runs.length === 0 ? (
                <View style={styles.emptyCard}><Text style={styles.emptyText}>No runs in this time range.</Text></View>
              ) : (
                runs.map((run) => (
                  <TouchableOpacity key={run.id} style={styles.runCard} onPress={() => { setSelectedRun(run); setRunDetailVisible(true); }}>
                    <View style={styles.runTop}>
                      <Text style={styles.runMiles}>{run.miles} miles</Text>
                      <Text style={styles.runDate}>{run.date?.toDate?.()?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
                    </View>
                    <View style={styles.runDetails}>
                      {run.duration && <Text style={styles.runChip}>{run.duration}</Text>}
                      {run.heartRate && <Text style={styles.runChip}>{run.heartRate} bpm</Text>}
                      <Text style={[styles.runChip, { color: primaryColor, borderColor: primaryColor }]}>Effort {run.effort}/10</Text>
                    </View>
                    <View style={styles.effortBar}>
                      <View style={[styles.effortFill, { width: `${(run.effort / 10) * 100}%`, backgroundColor: primaryColor }]} />
                    </View>
                    {run.notes && <Text style={styles.runNotePreview} numberOfLines={1}>"{run.notes}"</Text>}
                    <Text style={styles.tapHint}>Tap for full details →</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>

      <RunDetailModal
        run={selectedRun}
        visible={runDetailVisible}
        onClose={() => { setRunDetailVisible(false); setSelectedRun(null); }}
        primaryColor={primaryColor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20 },
  backBtn: { marginBottom: 14 },
  backText: { color: 'rgba(255,255,255,0.9)', fontSize: 15, fontWeight: '600' },
  athleteRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  athleteName: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  athleteEmail: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  pickerContainer: { padding: 16, paddingBottom: 0 },
  loading: { padding: 40, alignItems: 'center' },
  scroll: { flex: 1 },
  statsRow: { flexDirection: 'row', padding: 16, gap: 10 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, alignItems: 'center' },
  statNumber: { fontSize: 22, fontWeight: 'bold' },
  statLabel: { fontSize: 11, color: '#999', marginTop: 4, textAlign: 'center' },
  section: { padding: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 12 },
  emptyCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, alignItems: 'center' },
  emptyText: { color: '#999', fontSize: 14 },
  runCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12 },
  runTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  runMiles: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  runDate: { fontSize: 13, color: '#999' },
  runDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  runChip: { fontSize: 13, fontWeight: '600', color: '#666', borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  effortBar: { height: 5, backgroundColor: '#eee', borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  effortFill: { height: '100%', borderRadius: 3 },
  runNotePreview: { fontSize: 13, color: '#888', fontStyle: 'italic', marginBottom: 6 },
  tapHint: { fontSize: 11, color: '#bbb', textAlign: 'right' },
});