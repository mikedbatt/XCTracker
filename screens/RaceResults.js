import { Ionicons } from '@expo/vector-icons';
import {
  collection, getDocs, query, where,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Platform, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import {
  BRAND, BRAND_DARK, BRAND_LIGHT,
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE, STATUS,
} from '../constants/design';
import { db } from '../firebaseConfig';
import { calcPackAnalysis, formatTime, formatPace, calcPace } from '../utils/raceUtils';
import RaceResultsEntry from './RaceResultsEntry';

export default function RaceResults({ race, meet, schoolId, school, athletes, onClose }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEntry, setShowEntry] = useState(false);

  const primaryColor = school?.primaryColor || BRAND;
  const meetDate = meet.date?.toDate ? meet.date.toDate() : new Date(meet.date);

  useEffect(() => { loadResults(); }, []);

  const loadResults = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'raceResults'),
        where('raceId', '==', race.id)
      ));
      setResults(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.warn('Failed to load results:', e); }
    setLoading(false);
  };

  if (showEntry) {
    return (
      <RaceResultsEntry
        race={race}
        meet={meet}
        schoolId={schoolId}
        school={school}
        athletes={athletes}
        existingResults={results}
        onClose={() => { setShowEntry(false); loadResults(); }}
      />
    );
  }

  const pack = calcPackAnalysis(results);
  const sorted = pack?.sorted || [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={BRAND_DARK} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{race.label}</Text>
          <Text style={styles.headerSub}>{race.distanceLabel} · {meet.name}</Text>
        </View>
        <TouchableOpacity onPress={() => setShowEntry(true)} style={styles.editBtn}>
          <Text style={styles.editBtnText}>{results.length > 0 ? 'Edit' : 'Enter'}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={primaryColor} /></View>
      ) : results.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={{ fontSize: 40, marginBottom: SPACE.md }}>🏁</Text>
          <Text style={styles.emptyTitle}>No results yet</Text>
          <Text style={styles.emptyDesc}>Enter finish times and places for this race.</Text>
          <TouchableOpacity style={[styles.enterBtn, { backgroundColor: primaryColor }]} onPress={() => setShowEntry(true)}>
            <Text style={styles.enterBtnText}>Enter Results</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Pack analysis card */}
          {pack && pack.scorerCount >= 5 && (
            <View style={styles.packCard}>
              <Text style={styles.packTitle}>Pack Analysis</Text>
              <View style={styles.packGrid}>
                <View style={styles.packStat}>
                  <Text style={styles.packStatValue}>{formatTime(pack.spread15)}</Text>
                  <Text style={styles.packStatLabel}>1-5 Spread</Text>
                </View>
                <View style={styles.packStat}>
                  <Text style={styles.packStatValue}>{formatTime(pack.teamAvg)}</Text>
                  <Text style={styles.packStatLabel}>Team Avg</Text>
                </View>
                {pack.teamScore && (
                  <View style={styles.packStat}>
                    <Text style={styles.packStatValue}>{pack.teamScore}</Text>
                    <Text style={styles.packStatLabel}>Team Score</Text>
                  </View>
                )}
              </View>
              {pack.runner6 && (
                <View style={styles.displacementRow}>
                  <Text style={styles.displacementLabel}>#6 {pack.runner6.name}</Text>
                  <Text style={styles.displacementGap}>+{formatTime(pack.gap6to5)} from #5</Text>
                </View>
              )}
              {pack.runner7 && (
                <View style={styles.displacementRow}>
                  <Text style={styles.displacementLabel}>#7 {pack.runner7.name}</Text>
                  <Text style={styles.displacementGap}>+{formatTime(pack.gap7to5)} from #5</Text>
                </View>
              )}
            </View>
          )}

          {/* Results table */}
          <View style={styles.tableHeader}>
            <Text style={[styles.colTeam, styles.colHeaderText]}>#</Text>
            <Text style={[styles.colPlace, styles.colHeaderText]}>Pl</Text>
            <Text style={[styles.colName, styles.colHeaderText]}>Athlete</Text>
            <Text style={[styles.colTime, styles.colHeaderText]}>Time</Text>
            <Text style={[styles.colPace, styles.colHeaderText]}>Pace</Text>
            <Text style={[styles.colGap, styles.colHeaderText]}>Gap</Text>
          </View>

          {sorted.map((r, i) => {
            const isScorer = i < 5;
            const isDisplacement = i === 5 || i === 6;
            const gap = i > 0 ? r.finishTime - sorted[0].finishTime : 0;
            const pace = calcPace(r.finishTime, race.distanceLabel);

            return (
              <View key={r.athleteId} style={[styles.resultRow, isScorer && styles.resultRowScorer, isDisplacement && styles.resultRowDisplacement]}>
                <Text style={[styles.colTeam, styles.resultTeamPlace, isScorer && { color: primaryColor }]}>{r.teamPlace}</Text>
                <Text style={[styles.colPlace, styles.resultText]}>{r.place || '—'}</Text>
                <Text style={[styles.colName, styles.resultName, isScorer && { fontWeight: FONT_WEIGHT.bold }]} numberOfLines={1}>{r.athleteName}</Text>
                <Text style={[styles.colTime, styles.resultTime, isScorer && { color: primaryColor }]}>{r.finishTimeDisplay || formatTime(r.finishTime)}</Text>
                <Text style={[styles.colPace, styles.resultText]}>{pace ? formatPace(pace) : '—'}</Text>
                <Text style={[styles.colGap, styles.resultGap]}>{gap > 0 ? `+${formatTime(gap)}` : '—'}</Text>
              </View>
            );
          })}

          {/* Non-finishers */}
          {results.filter(r => r.status !== 'finished').map(r => (
            <View key={r.athleteId} style={[styles.resultRow, { opacity: 0.5 }]}>
              <Text style={[styles.colTeam, styles.resultText]}>—</Text>
              <Text style={[styles.colPlace, styles.resultText]}>—</Text>
              <Text style={[styles.colName, styles.resultName]}>{r.athleteName}</Text>
              <Text style={[styles.colTime, styles.resultText, { color: STATUS.error }]}>{r.status?.toUpperCase()}</Text>
              <Text style={[styles.colPace, styles.resultText]}>—</Text>
              <Text style={[styles.colGap, styles.resultText]}>—</Text>
            </View>
          ))}

          <View style={{ height: 60 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: NEUTRAL.bg },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:         { backgroundColor: '#fff', paddingTop: Platform.OS === 'ios' ? 56 : 32, paddingBottom: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
  backBtn:        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
  backText:       { color: BRAND_DARK, fontSize: 15, fontWeight: '600' },
  headerCenter:   { alignItems: 'center', flex: 1 },
  headerTitle:    { fontSize: 17, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  headerSub:      { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: 1 },
  editBtn:        { paddingVertical: 6, paddingHorizontal: 10 },
  editBtnText:    { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND },
  scroll:         { flex: 1 },
  // Pack analysis
  packCard:       { margin: SPACE.lg, backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: SPACE.lg, ...SHADOW.sm },
  packTitle:      { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: SPACE.md },
  packGrid:       { flexDirection: 'row', gap: SPACE.md, marginBottom: SPACE.md },
  packStat:       { flex: 1, alignItems: 'center', backgroundColor: NEUTRAL.bg, borderRadius: RADIUS.md, padding: SPACE.md },
  packStatValue:  { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  packStatLabel:  { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: 2 },
  displacementRow:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACE.xs, borderTopWidth: 1, borderTopColor: NEUTRAL.border },
  displacementLabel: { fontSize: FONT_SIZE.sm, color: NEUTRAL.body },
  displacementGap:{ fontSize: FONT_SIZE.sm, fontWeight: '600', color: STATUS.warning },
  // Table
  tableHeader:    { flexDirection: 'row', paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm, borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
  colHeaderText:  { fontSize: 11, fontWeight: FONT_WEIGHT.bold, color: NEUTRAL.muted, textTransform: 'uppercase' },
  colTeam:        { width: 28, textAlign: 'center' },
  colPlace:       { width: 30, textAlign: 'center' },
  colName:        { flex: 1 },
  colTime:        { width: 55, textAlign: 'right' },
  colPace:        { width: 62, textAlign: 'right' },
  colGap:         { width: 50, textAlign: 'right' },
  resultRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, borderBottomWidth: 0.5, borderBottomColor: NEUTRAL.border },
  resultRowScorer:{ backgroundColor: '#f0f4ff' },
  resultRowDisplacement: { backgroundColor: '#fffbeb' },
  resultTeamPlace:{ fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },
  resultName:     { fontSize: FONT_SIZE.sm, color: BRAND_DARK },
  resultTime:     { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  resultText:     { fontSize: FONT_SIZE.sm, color: NEUTRAL.body },
  resultGap:      { fontSize: 11, color: NEUTRAL.muted },
  // Empty
  emptyCard:      { margin: SPACE.lg, backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: SPACE['2xl'], alignItems: 'center', ...SHADOW.sm },
  emptyTitle:     { fontSize: 18, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: SPACE.sm },
  emptyDesc:      { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, textAlign: 'center', lineHeight: 20, marginBottom: SPACE.lg },
  enterBtn:       { borderRadius: RADIUS.md, paddingVertical: SPACE.md, paddingHorizontal: SPACE['2xl'] },
  enterBtnText:   { color: '#fff', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
});
