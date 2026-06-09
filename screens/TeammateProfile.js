import { Ionicons } from '@expo/vector-icons';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SIGNAL } from '../constants/design';
import { auth, db } from '../firebaseConfig';
import { PACE_ZONES, calcPaceZoneBreakdown, formatMinutes } from '../utils/vdotUtils';
import { aggregateMiles, isCrossTraining, creditForRun, activityMeta, DEFAULT_CT_FACTORS } from '../utils/activityMiles';
import RunDetailModal from './RunDetailModal';

export default function TeammateProfile({ athlete, school, onBack }) {
  const [runs,            setRuns]            = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [totalMiles,      setTotalMiles]       = useState(0);
  const [selectedRun,     setSelectedRun]     = useState(null);
  const [runDetailVisible, setRunDetailVisible] = useState(false);

  const primaryColor = school?.primaryColor || '#213f96';
  const myUid = auth.currentUser?.uid;
  // Cross-training counts as running-equivalent credit miles, not raw miles.
  const ctFactors = school?.crossTrainingFactors || DEFAULT_CT_FACTORS;

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
      setTotalMiles(aggregateMiles(monthRuns, ctFactors).totalMiles);
    } catch (e) { console.error('TeammateProfile load:', e); }
    setLoading(false);
  };

  // ── Week stats (Mon-anchored) ──
  const now = new Date();
  const weekStart = new Date(now);
  const dayOfWeek = now.getDay();
  weekStart.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  weekStart.setHours(0, 0, 0, 0);
  const weekRuns = runs.filter(r => { const d = r.date?.toDate?.(); return d && d >= weekStart; });
  const weekMiles = aggregateMiles(weekRuns, ctFactors).totalMiles;
  const totalAllMiles = aggregateMiles(runs, ctFactors).totalMiles;

  // Pace zone breakdown for this month (shows when teammate has VDOT set)
  const trainingPaces = athlete.trainingPaces || null;
  const getPaceBreakdown = () => {
    if (!trainingPaces) return null;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthRuns = runs.filter(r => {
      const d = r.date?.toDate?.();
      return d && d >= monthStart;
    });
    const combined = { e: 0, m: 0, t: 0, i: 0, r: 0 };
    let hasData = false;
    monthRuns.forEach(r => {
      if (isCrossTraining(r)) return; // CT has no running pace
      if (r.rawPaceStream?.length > 0) {
        const zones = calcPaceZoneBreakdown(r.rawPaceStream, trainingPaces);
        Object.keys(zones).forEach(k => { combined[k] += zones[k]; });
        hasData = true;
      } else if (r.paceZoneSeconds) {
        Object.keys(r.paceZoneSeconds).forEach(k => { combined[k] += (r.paceZoneSeconds[k] || 0); });
        hasData = true;
      }
    });
    if (!hasData) return null;
    const total = Object.values(combined).reduce((s, v) => s + v, 0);
    if (total === 0) return null;
    return PACE_ZONES.map(z => ({
      ...z,
      seconds: combined[z.key],
      minutes: Math.round(combined[z.key] / 60),
      pct: Math.round((combined[z.key] / total) * 100),
    })).filter(z => z.seconds > 0);
  };
  const paceBreakdown = getPaceBreakdown();
  const usePace = !!paceBreakdown;

  const subtitle = [
    athlete.gender === 'boys' ? 'Boys team' : athlete.gender === 'girls' ? 'Girls team' : null,
    school?.name,
  ].filter(Boolean).join(' · ');

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={20} color={SIGNAL.color.inkSoft} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerDisplay}>Profile</Text>
        </View>
        <View style={styles.center}><ActivityIndicator size="large" color={SIGNAL.color.indigo} /></View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={SIGNAL.color.inkSoft} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <View style={styles.athleteRow}>
          <View style={[styles.avatar, { backgroundColor: athlete.avatarColor || SIGNAL.color.indigo }]}>
            <Text style={styles.avatarText}>{athlete.firstName?.[0]}{athlete.lastName?.[0]}</Text>
          </View>
          <View style={styles.athleteMeta}>
            <Text style={styles.headerDisplay}>{athlete.firstName} {athlete.lastName}</Text>
            {subtitle ? <Text style={styles.headerSub}>{subtitle}</Text> : null}
          </View>
        </View>

        <View style={styles.headerStats}>
          <View style={styles.headerStat}>
            <Text style={styles.headerStatNum}>{weekMiles}</Text>
            <Text style={styles.headerStatLabel}>This week</Text>
          </View>
          <View style={styles.headerStatDivider} />
          <View style={styles.headerStat}>
            <Text style={styles.headerStatNum}>{totalMiles}</Text>
            <Text style={styles.headerStatLabel}>This month</Text>
          </View>
          <View style={styles.headerStatDivider} />
          <View style={styles.headerStat}>
            <Text style={styles.headerStatNum}>{runs.length}</Text>
            <Text style={styles.headerStatLabel}>Runs</Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Pace zones (primary when VDOT set) */}
        {usePace && (
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.sectionTitle}>Pace zones</Text>
              <Text style={styles.eyebrow}>This month</Text>
            </View>
            <View style={styles.zoneStackedBar}>
              {paceBreakdown.map(z => (
                <View key={z.key} style={[styles.zoneStackedSegment, { flex: z.minutes || 1, backgroundColor: z.color }]} />
              ))}
            </View>
            {paceBreakdown.map(z => (
              <View key={z.key} style={styles.zoneRow}>
                <View style={[styles.zoneDot, { backgroundColor: z.color }]} />
                <Text style={styles.zoneName}>{z.short} {z.name}</Text>
                <View style={styles.zoneBarBg}>
                  <View style={[styles.zoneBarFill, { width: `${z.pct}%`, backgroundColor: z.color }]} />
                </View>
                <Text style={styles.zoneCount}>{formatMinutes(z.minutes)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Recent runs */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Recent runs</Text>
          {runs.length === 0 ? (
            <Text style={styles.emptyText}>No runs logged yet.</Text>
          ) : runs.map((run, idx) => {
            const runDate = run.date?.toDate?.()?.toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric'
            });
            const effortColor = run.effort != null
              ? (SIGNAL.effort[run.effort] || SIGNAL.color.mute)
              : SIGNAL.color.mute;
            const isLast = idx === runs.length - 1;
            return (
              <TouchableOpacity
                key={run.id}
                style={[styles.runRow, isLast && styles.runRowLast]}
                activeOpacity={0.7}
                onPress={() => { setSelectedRun(run); setRunDetailVisible(true); }}
              >
                <View style={styles.runMilesCol}>
                  <View style={styles.runMilesRow}>
                    {isCrossTraining(run) && (
                      <Ionicons name={activityMeta(run).icon} size={13} color={SIGNAL.color.cyan} style={{ marginRight: 3 }} />
                    )}
                    <Text style={styles.runMiles}>{run.miles} mi</Text>
                  </View>
                  <Text style={styles.runDate}>{runDate}</Text>
                  {isCrossTraining(run) ? (
                    <View style={styles.xtChip}>
                      <Text style={styles.xtChipText}>
                        {activityMeta(run).label} · +{creditForRun(run, ctFactors)} mi
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.runChip}>
                      <Text style={styles.runChipText}>Run</Text>
                    </View>
                  )}
                </View>
                <View style={styles.runMidCol}>
                  {run.duration && <Text style={styles.runDuration}>{run.duration}</Text>}
                </View>
                {run.effort != null && (
                  <View style={styles.runRight}>
                    <Text style={styles.effortLabel}>Effort</Text>
                    <Text style={[styles.effortValue, { color: effortColor }]}>{run.effort}/10</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      <RunDetailModal
        run={selectedRun}
        visible={runDetailVisible}
        onClose={() => { setRunDetailVisible(false); setSelectedRun(null); }}
        primaryColor={primaryColor}
        trainingPaces={trainingPaces}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: {
    padding: SIGNAL.space.screen,
    paddingBottom: 48,
    gap: SIGNAL.space[4],
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    backgroundColor: SIGNAL.color.white,
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: SIGNAL.space[6],
    paddingHorizontal: SIGNAL.space.screen,
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    marginBottom: SIGNAL.space[5],
    alignSelf: 'flex-start',
  },
  backText: {
    color: SIGNAL.color.inkSoft,
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.bodySemi,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  athleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIGNAL.space[4],
    marginBottom: SIGNAL.space[6],
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: SIGNAL.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: SIGNAL.color.white,
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 16,
  },
  athleteMeta: { flex: 1, minWidth: 0 },
  headerDisplay: {
    fontSize: 29,
    fontFamily: SIGNAL.font.display,
    color: SIGNAL.color.indigo,
    letterSpacing: SIGNAL.letter.titleTight,
  },
  headerSub: {
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.mute,
    marginTop: 2,
  },
  headerStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SIGNAL.color.paper,
    borderRadius: SIGNAL.radius.button,
    paddingVertical: SIGNAL.space[4],
  },
  headerStat: { flex: 1, alignItems: 'center' },
  headerStatNum: {
    fontSize: 18,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.numTight,
  },
  headerStatLabel: {
    fontSize: 10,
    color: SIGNAL.color.mute,
    marginTop: 3,
    textAlign: 'center',
  },
  headerStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: SIGNAL.color.line,
  },

  // ── Cards ─────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    padding: SIGNAL.space[6],
    gap: SIGNAL.space[3],
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SIGNAL.space[2],
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.indigo,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  eyebrow: {
    ...SIGNAL.style.eyebrow,
  },
  preciseBadge: {
    backgroundColor: SIGNAL.color.indigo + SIGNAL.tint.chip,
    borderRadius: SIGNAL.radius.chip,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  preciseBadgeText: {
    fontSize: 10,
    color: SIGNAL.color.indigo,
    fontFamily: SIGNAL.font.bodyBold,
    letterSpacing: 0.6,
  },

  // ── Zone breakdowns ──────────────────────────────────────────────────────
  zoneStackedBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: SIGNAL.radius.chip,
    overflow: 'hidden',
    marginBottom: SIGNAL.space[2],
    gap: 2,
  },
  zoneStackedSegment: { height: '100%' },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIGNAL.space[3],
    paddingVertical: 3,
  },
  zoneDot: { width: 8, height: 8, borderRadius: 4 },
  zoneName: {
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.inkSoft,
    width: 120,
  },
  zoneBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: SIGNAL.color.paper,
    borderRadius: SIGNAL.radius.chip,
    overflow: 'hidden',
  },
  zoneBarFill: {
    height: '100%',
    borderRadius: SIGNAL.radius.chip,
  },
  zoneCount: {
    fontSize: SIGNAL.size.label,
    fontFamily: SIGNAL.font.mono,
    color: SIGNAL.color.ink,
    width: 52,
    textAlign: 'right',
    letterSpacing: SIGNAL.letter.numTight,
  },
  zoneTotalHint: {
    fontSize: 10,
    color: SIGNAL.color.mute2,
    textAlign: 'right',
    marginTop: 4,
  },

  // ── Runs list ────────────────────────────────────────────────────────────
  runRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIGNAL.space[4],
    paddingVertical: SIGNAL.space[4],
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  runRowLast: {
    borderBottomWidth: 0,
  },
  runMilesCol: { minWidth: 84 },
  runMilesRow: { flexDirection: 'row', alignItems: 'center' },
  runMiles: {
    fontSize: SIGNAL.size.bodyLg,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.numTight,
  },
  runDate: {
    fontSize: 10,
    color: SIGNAL.color.mute,
    marginTop: 2,
  },
  xtChip: {
    alignSelf: 'flex-start', marginTop: 4,
    paddingVertical: 2, paddingHorizontal: 7, borderRadius: SIGNAL.radius.chip,
    backgroundColor: `${SIGNAL.color.cyan}${SIGNAL.tint.chip}`,
  },
  xtChipText: { fontFamily: SIGNAL.font.bodySemi, fontSize: 9.5, color: SIGNAL.color.cyan },
  runChip: {
    alignSelf: 'flex-start', marginTop: 4,
    paddingVertical: 2, paddingHorizontal: 7, borderRadius: SIGNAL.radius.chip,
    backgroundColor: `${SIGNAL.color.lime}${SIGNAL.tint.chip}`,
  },
  runChipText: { fontFamily: SIGNAL.font.bodySemi, fontSize: 9.5, color: SIGNAL.color.lime },
  runMidCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIGNAL.space[2],
  },
  runDuration: {
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.inkSoft,
    fontFamily: SIGNAL.font.mono,
  },
  runRight: { alignItems: 'flex-end' },
  effortLabel: {
    fontSize: 10,
    color: SIGNAL.color.mute,
  },
  effortValue: {
    fontSize: SIGNAL.size.label,
    fontFamily: SIGNAL.font.bodySemi,
    marginTop: 2,
  },

  emptyText: {
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.mute,
    textAlign: 'center',
    paddingVertical: SIGNAL.space[5],
  },
});
