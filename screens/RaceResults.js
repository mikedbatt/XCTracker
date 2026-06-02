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
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SIGNAL, SPACE, STATUS,
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

  const dateStr = meetDate.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });

  const getAthleteAvatarColor = (athleteId) => {
    const a = athletes?.find(x => x.id === athleteId);
    return a?.avatarColor || SIGNAL.color.indigo;
  };

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={SIGNAL.color.inkSoft} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{race.label}</Text>
          <Text style={styles.headerEyebrow} numberOfLines={1}>
            {dateStr} · {race.distanceLabel} · {meet.name}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setShowEntry(true)} style={styles.editBtn}>
          <Text style={styles.editBtnText}>{results.length > 0 ? 'Edit' : 'Enter'}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={SIGNAL.color.indigo} /></View>
      ) : results.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>🏁</Text>
          <Text style={styles.emptyTitle}>No results yet</Text>
          <Text style={styles.emptyDesc}>Enter finish times and places for this race.</Text>
          <TouchableOpacity style={styles.enterBtn} onPress={() => setShowEntry(true)}>
            <Text style={styles.enterBtnText}>Enter Results</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Pack stats card */}
          {pack && pack.scorerCount >= 5 && (
            <View style={styles.cardWrap}>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Pack Analysis</Text>
                <View style={styles.packGrid}>
                  <View style={styles.packStat}>
                    <Text style={styles.packStatValue}>{formatTime(pack.spread15)}</Text>
                    <Text style={styles.packStatLabel}>1–5 Spread</Text>
                  </View>
                  <View style={styles.packStat}>
                    <Text style={styles.packStatValue}>{formatTime(pack.teamAvg)}</Text>
                    <Text style={styles.packStatLabel}>Team Avg</Text>
                  </View>
                  {pack.teamScore && (
                    <View style={styles.packStat}>
                      <Text style={styles.packStatValue}>{pack.teamScore}</Text>
                      <Text style={styles.packStatLabel}>Score</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          )}

          {/* Displacement card */}
          {pack && (pack.runner6 || pack.runner7) && (
            <View style={styles.cardWrap}>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Displacement</Text>
                {pack.runner6 && (
                  <View style={styles.displacementRow}>
                    <Text style={styles.displacementLabel}>#6 {pack.runner6.name}</Text>
                    <Text style={styles.displacementGap}>+{formatTime(pack.gap6to5)} from #5</Text>
                  </View>
                )}
                {pack.runner7 && (
                  <View style={[styles.displacementRow, pack.runner6 && styles.displacementRowDivider]}>
                    <Text style={styles.displacementLabel}>#7 {pack.runner7.name}</Text>
                    <Text style={styles.displacementGap}>+{formatTime(pack.gap7to5)} from #5</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Results table */}
          <View style={styles.tableHeader}>
            <Text style={[styles.colTeam, styles.colHeaderText]}>#</Text>
            <Text style={[styles.colAvatar, styles.colHeaderText]}> </Text>
            <Text style={[styles.colName, styles.colHeaderText]}>Athlete</Text>
            <Text style={[styles.colPlace, styles.colHeaderText]}>Pl</Text>
            <Text style={[styles.colTime, styles.colHeaderText]}>Time</Text>
            <Text style={[styles.colPace, styles.colHeaderText]}>Pace</Text>
            <Text style={[styles.colGap, styles.colHeaderText]}>Gap</Text>
          </View>

          {sorted.map((r, i) => {
            const isScorer = i < 5;
            const isDisplacement = i === 5 || i === 6;
            const gap = i > 0 ? r.finishTime - sorted[0].finishTime : 0;
            const pace = calcPace(r.finishTime, race.distanceLabel);
            const avatarColor = getAthleteAvatarColor(r.athleteId);

            return (
              <View
                key={r.athleteId}
                style={[
                  styles.resultRow,
                  isScorer && styles.resultRowScorer,
                  isDisplacement && styles.resultRowDisplacement,
                ]}
              >
                <Text style={[styles.colTeam, styles.resultTeamPlace, { color: isScorer ? SIGNAL.color.indigo : SIGNAL.color.mute }]}>{r.teamPlace}</Text>
                <View style={styles.colAvatar}>
                  <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
                    <Text style={styles.avatarText}>{getInitials(r.athleteName)}</Text>
                  </View>
                </View>
                <Text style={[styles.colName, styles.resultName, isScorer && styles.resultNameScorer]} numberOfLines={1}>{r.athleteName}</Text>
                <Text style={[styles.colPlace, styles.resultMutedMono]}>{r.place || '—'}</Text>
                <Text style={[styles.colTime, styles.resultTime, isScorer && { color: SIGNAL.color.indigo }]}>{r.finishTimeDisplay || formatTime(r.finishTime)}</Text>
                <Text style={[styles.colPace, styles.resultMutedMono]}>{pace ? formatPace(pace) : '—'}</Text>
                <Text style={[styles.colGap, styles.resultMutedMono]}>{gap > 0 ? `+${formatTime(gap)}` : '—'}</Text>
              </View>
            );
          })}

          {/* Non-finishers */}
          {results.filter(r => r.status !== 'finished').map(r => {
            const avatarColor = getAthleteAvatarColor(r.athleteId);
            return (
              <View key={r.athleteId} style={[styles.resultRow, { opacity: 0.55 }]}>
                <Text style={[styles.colTeam, styles.resultMutedMono]}>—</Text>
                <View style={styles.colAvatar}>
                  <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
                    <Text style={styles.avatarText}>{getInitials(r.athleteName)}</Text>
                  </View>
                </View>
                <Text style={[styles.colName, styles.resultName]} numberOfLines={1}>{r.athleteName}</Text>
                <Text style={[styles.colPlace, styles.resultMutedMono]}>—</Text>
                <Text style={[styles.colTime, styles.resultTime, { color: SIGNAL.color.coral }]}>{r.status?.toUpperCase()}</Text>
                <Text style={[styles.colPace, styles.resultMutedMono]}>—</Text>
                <Text style={[styles.colGap, styles.resultMutedMono]}>—</Text>
              </View>
            );
          })}

          {/* Legend */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: SIGNAL.color.indigo + '30' }]} />
              <Text style={styles.legendText}>Scorers (1–5)</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: SIGNAL.color.amber + '30' }]} />
              <Text style={styles.legendText}>Displacers (6–7)</Text>
            </View>
          </View>

          <View style={{ height: 80 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    backgroundColor: SIGNAL.color.white,
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: 14,
    paddingHorizontal: SIGNAL.space.screen,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 6,
    minWidth: 60,
  },
  backText: {
    color: SIGNAL.color.inkSoft,
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
  },
  headerCenter: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 6,
  },
  headerTitle: {
    fontSize: SIGNAL.size.heading,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '700',
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  headerEyebrow: {
    fontSize: SIGNAL.size.eyebrow,
    fontFamily: SIGNAL.font.bodyMedium,
    fontWeight: '500',
    color: SIGNAL.color.mute,
    letterSpacing: SIGNAL.letter.eyebrow,
    textTransform: 'uppercase',
    marginTop: 3,
  },
  editBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    minWidth: 60,
    alignItems: 'flex-end',
  },
  editBtnText: {
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.indigo,
  },

  scroll: { flex: 1 },

  // ── Cards ─────────────────────────────────────────────────────────────────
  cardWrap: {
    paddingHorizontal: SIGNAL.space.screen,
    paddingTop: SIGNAL.space[5],
  },
  card: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: SIGNAL.space[6],
    ...SIGNAL.border.hairline,
  },
  sectionTitle: {
    fontSize: SIGNAL.size.heading,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.indigo,
    marginBottom: SIGNAL.space[4],
    letterSpacing: SIGNAL.letter.bodyTight,
  },

  // ── Pack stats ────────────────────────────────────────────────────────────
  packGrid: {
    flexDirection: 'row',
    gap: SIGNAL.space[2],
  },
  packStat: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: SIGNAL.color.paper2,
    borderRadius: SIGNAL.radius.control,
    paddingVertical: SIGNAL.space[4],
    paddingHorizontal: SIGNAL.space[2],
  },
  packStatValue: {
    fontSize: 20,
    fontFamily: SIGNAL.font.mono,
    fontWeight: '600',
    color: SIGNAL.color.indigo,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  packStatLabel: {
    fontSize: SIGNAL.size.eyebrow,
    fontFamily: SIGNAL.font.bodyMedium,
    fontWeight: '500',
    color: SIGNAL.color.mute,
    marginTop: 4,
  },

  // ── Displacement ──────────────────────────────────────────────────────────
  displacementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SIGNAL.space[3],
  },
  displacementRowDivider: {
    borderTopWidth: 1,
    borderTopColor: SIGNAL.color.line,
  },
  displacementLabel: {
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.body,
    color: SIGNAL.color.inkSoft,
  },
  displacementGap: {
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.mono,
    fontWeight: '600',
    color: SIGNAL.color.amber,
  },

  // ── Results table ─────────────────────────────────────────────────────────
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIGNAL.space.screen,
    paddingTop: SIGNAL.space[6],
    paddingBottom: SIGNAL.space[2],
  },
  colHeaderText: {
    fontSize: 10,
    fontFamily: SIGNAL.font.bodyBold,
    fontWeight: '700',
    color: SIGNAL.color.mute2,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  colTeam:   { width: 24, textAlign: 'center' },
  colAvatar: { width: 34, alignItems: 'center', justifyContent: 'center' },
  colName:   { flex: 1, paddingLeft: 6 },
  colPlace:  { width: 30, textAlign: 'center' },
  colTime:   { width: 54, textAlign: 'right' },
  colPace:   { width: 46, textAlign: 'right' },
  colGap:    { width: 50, textAlign: 'right' },

  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIGNAL.space.screen,
    paddingVertical: SIGNAL.space[3],
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
    backgroundColor: SIGNAL.color.white,
  },
  resultRowScorer: {
    backgroundColor: SIGNAL.color.indigo + '0A',
  },
  resultRowDisplacement: {
    backgroundColor: SIGNAL.color.amber + '10',
  },
  resultTeamPlace: {
    fontSize: 13,
    fontFamily: SIGNAL.font.mono,
    fontWeight: '600',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: SIGNAL.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 10.5,
    fontFamily: SIGNAL.font.bodyBold,
    fontWeight: '700',
    color: SIGNAL.color.white,
    letterSpacing: 0.2,
  },
  resultName: {
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.bodyMedium,
    fontWeight: '500',
    color: SIGNAL.color.ink,
  },
  resultNameScorer: {
    fontFamily: SIGNAL.font.bodyBold,
    fontWeight: '700',
  },
  resultTime: {
    fontSize: 13,
    fontFamily: SIGNAL.font.mono,
    fontWeight: '600',
    color: SIGNAL.color.ink,
    textAlign: 'right',
  },
  resultMutedMono: {
    fontSize: 11.5,
    fontFamily: SIGNAL.font.mono,
    color: SIGNAL.color.mute,
  },

  // ── Legend ────────────────────────────────────────────────────────────────
  legend: {
    flexDirection: 'row',
    gap: SIGNAL.space[5],
    paddingHorizontal: SIGNAL.space.screen,
    paddingTop: SIGNAL.space[4],
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  legendText: {
    fontSize: SIGNAL.size.eyebrow,
    fontFamily: SIGNAL.font.body,
    color: SIGNAL.color.mute,
  },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyCard: {
    marginHorizontal: SIGNAL.space.screen,
    marginTop: SIGNAL.space[6],
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: 28,
    alignItems: 'center',
    ...SIGNAL.border.hairline,
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: SIGNAL.space[4],
  },
  emptyTitle: {
    fontSize: SIGNAL.size.heading,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.ink,
    marginBottom: SIGNAL.space[2],
  },
  emptyDesc: {
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.body,
    color: SIGNAL.color.mute,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SIGNAL.space[6],
  },
  enterBtn: {
    backgroundColor: SIGNAL.color.ink,
    borderRadius: SIGNAL.radius.button,
    paddingVertical: SIGNAL.space[4],
    paddingHorizontal: 28,
  },
  enterBtnText: {
    color: SIGNAL.color.white,
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
  },
});
