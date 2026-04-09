import { Ionicons } from '@expo/vector-icons';
import { collection, getDocs, query, where } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Platform, ScrollView, Share, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import ViewShot from 'react-native-view-shot';
import { auth, db } from '../firebaseConfig';
import {
  BRAND, BRAND_ACCENT, BRAND_DARK, BRAND_LIGHT,
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE, STATUS,
} from '../constants/design';
import { SPORTS } from './SeasonPlanner';
import { formatTime } from '../utils/raceUtils';
import { calcPaceZoneBreakdown, calcPace8020 } from '../utils/vdotUtils';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getMondayISO(d) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  date.setHours(0, 0, 0, 0);
  return date.toISOString().split('T')[0];
}

function formatDateRange(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  const opts = { month: 'short', day: 'numeric' };
  return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SeasonReview({ season, school, userData, athletes = [], onClose }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const viewShotRef = useRef(null);

  const isCoach = userData.role === 'admin_coach' || userData.role === 'assistant_coach';
  const sport = SPORTS[season.sport] || SPORTS.cross_country;
  const seasonStart = new Date(season.seasonStart);
  const seasonEnd = new Date(season.championshipDate);

  useEffect(() => { loadSeasonData(); }, []);

  const loadSeasonData = async () => {
    setLoading(true);
    try {
      if (isCoach) {
        await loadCoachData();
      } else {
        await loadAthleteData();
      }
    } catch (e) {
      console.warn('Season review load error:', e);
    }
    setLoading(false);
  };

  // ── Athlete data loading ────────────────────────────────────────────────────
  const loadAthleteData = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const [runsSnap, checkinsSnap, resultsSnap, racesSnap, meetsSnap] = await Promise.all([
      getDocs(query(collection(db, 'runs'), where('userId', '==', uid))),
      getDocs(query(collection(db, 'checkins'), where('userId', '==', uid))).catch(() => ({ docs: [] })),
      getDocs(query(collection(db, 'raceResults'), where('athleteId', '==', uid))).catch(() => ({ docs: [] })),
      getDocs(query(collection(db, 'races'), where('schoolId', '==', userData.schoolId))).catch(() => ({ docs: [] })),
      getDocs(query(collection(db, 'raceMeets'), where('schoolId', '==', userData.schoolId))).catch(() => ({ docs: [] })),
    ]);

    const allRuns = runsSnap.docs.map(d => d.data()).filter(r => {
      const d = r.date?.toDate?.();
      return d && d >= seasonStart && d <= seasonEnd;
    });

    const checkins = checkinsSnap.docs.map(d => d.data()).filter(c => {
      const d = c.date?.toDate ? c.date.toDate() : new Date(c.date);
      return d >= seasonStart && d <= seasonEnd;
    });

    const meets = meetsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const races = racesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const results = resultsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      .map(res => {
        const race = races.find(r => r.id === res.raceId);
        const meet = meets.find(m => m.id === res.meetId);
        const meetDate = meet?.date?.toDate ? meet.date.toDate() : (meet?.date ? new Date(meet.date) : null);
        return { ...res, race, meet, meetDate, distanceLabel: race?.distanceLabel || 'Unknown' };
      })
      .filter(r => r.meetDate && r.meetDate >= seasonStart && r.meetDate <= seasonEnd)
      .sort((a, b) => a.meetDate - b.meetDate);

    // By the Numbers
    const totalMiles = Math.round(allRuns.reduce((s, r) => s + (r.miles || 0), 0) * 10) / 10;
    const totalRuns = allRuns.length;
    const runDays = new Set(allRuns.map(r => r.date?.toDate?.()?.toISOString().split('T')[0]).filter(Boolean)).size;
    const longestRun = allRuns.reduce((max, r) => Math.max(max, r.miles || 0), 0);

    // Biggest week
    const weekMap = {};
    allRuns.forEach(r => {
      const d = r.date?.toDate?.();
      if (!d) return;
      const mon = getMondayISO(d);
      weekMap[mon] = (weekMap[mon] || 0) + (r.miles || 0);
    });
    const biggestWeek = Math.round(Math.max(...Object.values(weekMap), 0) * 10) / 10;

    // Race Progression
    const distances = [...new Set(results.map(r => r.distanceLabel))];
    const primaryDist = distances.includes('5K') ? '5K' : distances[0] || null;
    const distResults = primaryDist ? results.filter(r => r.distanceLabel === primaryDist) : [];
    const firstRace = distResults[0] || null;
    const lastRace = distResults[distResults.length - 1] || null;
    const bestRace = distResults.reduce((b, r) => (!b || (r.finishTime && r.finishTime < b.finishTime)) ? r : b, null);
    const improvement = firstRace && lastRace && firstRace !== lastRace
      ? firstRace.finishTime - lastRace.finishTime : null;

    // Training Consistency
    const totalCheckins = checkins.length;
    const avgMood = checkins.length > 0 ? Math.round(checkins.reduce((s, c) => s + (c.mood || 3), 0) / checkins.length * 10) / 10 : null;
    const avgSleep = checkins.length > 0 ? Math.round(checkins.reduce((s, c) => s + (c.sleepQuality || 3), 0) / checkins.length * 10) / 10 : null;
    const avgLegs = checkins.length > 0 ? Math.round(checkins.reduce((s, c) => s + (c.legFatigue || 3), 0) / checkins.length * 10) / 10 : null;

    // Check-in streak
    let maxStreak = 0, streak = 0;
    const checkinDates = [...new Set(checkins.map(c => {
      const d = c.date?.toDate ? c.date.toDate() : new Date(c.date);
      return d.toISOString().split('T')[0];
    }))].sort();
    for (let i = 0; i < checkinDates.length; i++) {
      if (i === 0) { streak = 1; }
      else {
        const prev = new Date(checkinDates[i - 1]);
        const curr = new Date(checkinDates[i]);
        const diff = (curr - prev) / 86400000;
        streak = diff === 1 ? streak + 1 : 1;
      }
      maxStreak = Math.max(maxStreak, streak);
    }

    // Pace Balance
    const trainingPaces = userData.trainingPaces || null;
    let easyPct = null;
    if (trainingPaces) {
      const combined = { e: 0, m: 0, t: 0, i: 0, r: 0 };
      allRuns.forEach(r => {
        if (r.rawPaceStream?.length > 0) {
          const zones = calcPaceZoneBreakdown(r.rawPaceStream, trainingPaces);
          Object.keys(zones).forEach(k => { combined[k] += zones[k]; });
        } else if (r.paceZoneSeconds) {
          Object.keys(r.paceZoneSeconds).forEach(k => { combined[k] += (r.paceZoneSeconds[k] || 0); });
        }
      });
      const result = calcPace8020(combined);
      easyPct = result ? result.easyPct : null;
    }

    setData({
      totalMiles, totalRuns, runDays, longestRun, biggestWeek,
      primaryDist, firstRace, lastRace, bestRace, improvement, raceCount: results.length,
      totalCheckins, avgMood, avgSleep, avgLegs, maxStreak,
      easyPct,
    });
  };

  // ── Coach data loading ──────────────────────────────────────────────────────
  const loadCoachData = async () => {
    const athleteIds = athletes.map(a => a.id);
    if (athleteIds.length === 0) { setData({ empty: true }); return; }

    // Query all runs for the school within season range
    const runsSnap = await getDocs(query(
      collection(db, 'runs'),
      where('schoolId', '==', userData.schoolId),
    )).catch(() => ({ docs: [] }));

    const allRuns = (runsSnap.docs || []).map(d => d.data()).filter(r => {
      const d = r.date?.toDate?.();
      return d && d >= seasonStart && d <= seasonEnd && athleteIds.includes(r.userId);
    });

    // Race results
    const [meetsSnap, racesSnap] = await Promise.all([
      getDocs(query(collection(db, 'raceMeets'), where('schoolId', '==', userData.schoolId))).catch(() => ({ docs: [] })),
      getDocs(query(collection(db, 'races'), where('schoolId', '==', userData.schoolId))).catch(() => ({ docs: [] })),
    ]);
    const meets = meetsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const races = racesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const allResultDocs = [];
    // Query results in batches (Firestore 'in' limit is 30)
    for (let i = 0; i < athleteIds.length; i += 30) {
      const batch = athleteIds.slice(i, i + 30);
      try {
        const snap = await getDocs(query(collection(db, 'raceResults'), where('athleteId', 'in', batch)));
        allResultDocs.push(...snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.warn('Batch result query:', e); }
    }

    const allResults = allResultDocs.map(res => {
      const race = races.find(r => r.id === res.raceId);
      const meet = meets.find(m => m.id === res.meetId);
      const meetDate = meet?.date?.toDate ? meet.date.toDate() : (meet?.date ? new Date(meet.date) : null);
      return { ...res, race, meet, meetDate, distanceLabel: race?.distanceLabel || 'Unknown' };
    }).filter(r => r.meetDate && r.meetDate >= seasonStart && r.meetDate <= seasonEnd);

    // Checkins
    const checkinsSnap = await getDocs(query(
      collection(db, 'checkins'),
      where('schoolId', '==', userData.schoolId),
    )).catch(() => ({ docs: [] }));

    const allCheckins = (checkinsSnap.docs || []).map(d => d.data()).filter(c => {
      const d = c.date?.toDate ? c.date.toDate() : new Date(c.date);
      return d >= seasonStart && d <= seasonEnd;
    });

    // Team Numbers
    const teamTotalMiles = Math.round(allRuns.reduce((s, r) => s + (r.miles || 0), 0));
    const teamTotalRuns = allRuns.length;
    const avgPerAthlete = athletes.length > 0 ? Math.round(teamTotalMiles / athletes.length) : 0;

    // Most miles athlete
    const milesPerAthlete = {};
    allRuns.forEach(r => { milesPerAthlete[r.userId] = (milesPerAthlete[r.userId] || 0) + (r.miles || 0); });
    const topMilesId = Object.entries(milesPerAthlete).sort((a, b) => b[1] - a[1])[0];
    const topMilesAthlete = topMilesId ? athletes.find(a => a.id === topMilesId[0]) : null;
    const topMilesVal = topMilesId ? Math.round(topMilesId[1]) : 0;

    // Race Development
    const meetDates = [...new Set(allResults.map(r => r.meetDate?.toISOString().split('T')[0]))].sort();
    const raceCount = meetDates.length;
    const distances = [...new Set(allResults.map(r => r.distanceLabel))];
    const primaryDist = distances.includes('5K') ? '5K' : distances[0] || null;

    // Pack spread: first meet vs last meet (top 5 spread)
    let firstSpread = null, lastSpread = null;
    if (primaryDist && meetDates.length >= 2) {
      const getSpread = (dateStr) => {
        const dayResults = allResults.filter(r => r.meetDate?.toISOString().split('T')[0] === dateStr && r.distanceLabel === primaryDist && r.finishTime);
        const times = dayResults.map(r => r.finishTime).sort((a, b) => a - b);
        if (times.length >= 5) return times[4] - times[0];
        if (times.length >= 2) return times[times.length - 1] - times[0];
        return null;
      };
      firstSpread = getSpread(meetDates[0]);
      lastSpread = getSpread(meetDates[meetDates.length - 1]);
    }

    // Team avg time improvement
    let teamTimeImprovement = null;
    if (primaryDist && meetDates.length >= 2) {
      const getAvg = (dateStr) => {
        const times = allResults.filter(r => r.meetDate?.toISOString().split('T')[0] === dateStr && r.distanceLabel === primaryDist && r.finishTime).map(r => r.finishTime);
        return times.length > 0 ? times.reduce((s, t) => s + t, 0) / times.length : null;
      };
      const firstAvg = getAvg(meetDates[0]);
      const lastAvg = getAvg(meetDates[meetDates.length - 1]);
      if (firstAvg && lastAvg) teamTimeImprovement = firstAvg - lastAvg;
    }

    // Athlete Development
    const athleteImprovement = {};
    if (primaryDist) {
      athletes.forEach(a => {
        const aResults = allResults.filter(r => r.athleteId === a.id && r.distanceLabel === primaryDist && r.finishTime).sort((x, y) => x.meetDate - y.meetDate);
        if (aResults.length >= 2) {
          athleteImprovement[a.id] = aResults[0].finishTime - aResults[aResults.length - 1].finishTime;
        }
      });
    }
    const mostImprovedId = Object.entries(athleteImprovement).sort((a, b) => b[1] - a[1])[0];
    const mostImproved = mostImprovedId ? { athlete: athletes.find(a => a.id === mostImprovedId[0]), improvement: mostImprovedId[1] } : null;

    // Most consistent (most check-ins)
    const checkinCounts = {};
    allCheckins.forEach(c => { checkinCounts[c.userId] = (checkinCounts[c.userId] || 0) + 1; });
    const topCheckinId = Object.entries(checkinCounts).sort((a, b) => b[1] - a[1])[0];
    const mostConsistent = topCheckinId ? { athlete: athletes.find(a => a.id === topCheckinId[0]), count: topCheckinId[1] } : null;

    // Team Health
    const injuryRate = allCheckins.length > 0 ? Math.round((allCheckins.filter(c => c.injury).length / allCheckins.length) * 100) : 0;
    const avgMood = allCheckins.length > 0 ? Math.round(allCheckins.reduce((s, c) => s + (c.mood || 3), 0) / allCheckins.length * 10) / 10 : null;
    const avgSleep = allCheckins.length > 0 ? Math.round(allCheckins.reduce((s, c) => s + (c.sleepQuality || 3), 0) / allCheckins.length * 10) / 10 : null;

    setData({
      teamTotalMiles, teamTotalRuns, avgPerAthlete,
      topMilesAthlete, topMilesVal,
      raceCount, primaryDist, firstSpread, lastSpread, teamTimeImprovement,
      mostImproved, mostConsistent, topMilesAthlete, topMilesVal,
      injuryRate, avgMood, avgSleep,
      athleteCount: athletes.length,
    });
  };

  // ── Share ───────────────────────────────────────────────────────────────────
  const handleShare = async () => {
    try {
      const uri = await viewShotRef.current.capture();
      await Share.share({
        url: Platform.OS === 'ios' ? uri : undefined,
        message: Platform.OS === 'android' ? uri : undefined,
      });
    } catch (e) {
      console.warn('Share failed:', e);
    }
  };

  // ── Render helpers ──────────────────────────────────────────────────────────
  const StatRow = ({ label, value, accent }) => (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent && { color: accent }]}>{value}</Text>
    </View>
  );

  const Card = ({ title, icon, children }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardIcon}>{icon}</Text>
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={BRAND_DARK} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Season in Review</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.center}><ActivityIndicator size="large" color={BRAND} /></View>
      </View>
    );
  }

  // ── Athlete View ──────────────────────────────────────────────────────────
  const renderAthleteReview = () => {
    if (!data) return null;
    return (
      <>
        {/* Hero */}
        <View style={[styles.heroCard, { borderTopColor: sport.color }]}>
          <Text style={styles.heroIcon}>{sport.icon}</Text>
          <Text style={styles.heroSeason}>{season.name || sport.label}</Text>
          <Text style={styles.heroName}>{userData.firstName} {userData.lastName}</Text>
          <Text style={styles.heroSchool}>{school?.name}</Text>
          <Text style={styles.heroDate}>{formatDateRange(season.seasonStart, season.championshipDate)}</Text>
        </View>

        {/* By the Numbers */}
        <Card title="By the Numbers" icon="📊">
          <View style={styles.bigStatRow}>
            <View style={styles.bigStat}>
              <Text style={[styles.bigStatNum, { color: BRAND }]}>{data.totalMiles}</Text>
              <Text style={styles.bigStatLabel}>miles</Text>
            </View>
            <View style={styles.bigStat}>
              <Text style={[styles.bigStatNum, { color: BRAND }]}>{data.totalRuns}</Text>
              <Text style={styles.bigStatLabel}>runs</Text>
            </View>
            <View style={styles.bigStat}>
              <Text style={[styles.bigStatNum, { color: BRAND }]}>{data.runDays}</Text>
              <Text style={styles.bigStatLabel}>days</Text>
            </View>
          </View>
          <StatRow label="Longest run" value={`${data.longestRun} mi`} />
          <StatRow label="Biggest week" value={`${data.biggestWeek} mi`} />
        </Card>

        {/* Race Progression */}
        {data.raceCount > 0 && (
          <Card title="Race Day" icon="🏁">
            <StatRow label="Races" value={data.raceCount} />
            {data.primaryDist && <StatRow label="Primary distance" value={data.primaryDist} />}
            {data.bestRace && (
              <StatRow label="Best time" value={formatTime(data.bestRace.finishTime)} accent={STATUS.success} />
            )}
            {data.firstRace && data.lastRace && data.firstRace !== data.lastRace && (
              <>
                <StatRow label="First race" value={formatTime(data.firstRace.finishTime)} />
                <StatRow label="Last race" value={formatTime(data.lastRace.finishTime)} />
              </>
            )}
            {data.improvement != null && data.improvement > 0 && (
              <View style={styles.improvementBanner}>
                <Text style={styles.improvementText}>
                  {formatTime(data.improvement)} faster from first to last race
                </Text>
              </View>
            )}
          </Card>
        )}

        {/* Training Consistency */}
        <Card title="Consistency" icon="🔥">
          <StatRow label="Check-ins completed" value={data.totalCheckins} />
          {data.maxStreak > 1 && <StatRow label="Longest streak" value={`${data.maxStreak} days`} accent={STATUS.success} />}
          {data.avgMood && <StatRow label="Avg mood" value={`${data.avgMood}/5`} />}
          {data.avgSleep && <StatRow label="Avg sleep" value={`${data.avgSleep}/5`} />}
          {data.avgLegs && <StatRow label="Avg legs" value={`${data.avgLegs}/5`} />}
        </Card>

        {/* Easy-Hard Balance */}
        {data.easyPct != null && (
          <Card title="Easy-Hard Balance" icon="⚖️">
            <View style={styles.bigStatRow}>
              <View style={styles.bigStat}>
                <Text style={[styles.bigStatNum, {
                  color: data.easyPct >= 78 ? STATUS.success : data.easyPct >= 68 ? STATUS.warning : STATUS.error,
                }]}>{data.easyPct}%</Text>
                <Text style={styles.bigStatLabel}>easy running</Text>
              </View>
            </View>
            <Text style={styles.balanceHint}>
              {data.easyPct >= 78 ? 'Great 80/20 balance this season!'
                : data.easyPct >= 68 ? 'Good effort — aim for a bit more easy running next season.'
                : 'Too much hard running — focus on more easy miles next season.'}
            </Text>
          </Card>
        )}
      </>
    );
  };

  // ── Coach View ────────────────────────────────────────────────────────────
  const renderCoachReview = () => {
    if (!data || data.empty) return <Text style={styles.emptyText}>No athlete data for this season.</Text>;
    return (
      <>
        {/* Hero */}
        <View style={[styles.heroCard, { borderTopColor: sport.color }]}>
          <Text style={styles.heroIcon}>{sport.icon}</Text>
          <Text style={styles.heroSeason}>{season.name || sport.label}</Text>
          <Text style={styles.heroName}>Coach {userData.lastName}</Text>
          <Text style={styles.heroSchool}>{school?.name}</Text>
          <Text style={styles.heroDate}>{formatDateRange(season.seasonStart, season.championshipDate)} · {data.athleteCount} athletes</Text>
        </View>

        {/* Team Numbers */}
        <Card title="Team by the Numbers" icon="📊">
          <View style={styles.bigStatRow}>
            <View style={styles.bigStat}>
              <Text style={[styles.bigStatNum, { color: BRAND }]}>{data.teamTotalMiles}</Text>
              <Text style={styles.bigStatLabel}>team miles</Text>
            </View>
            <View style={styles.bigStat}>
              <Text style={[styles.bigStatNum, { color: BRAND }]}>{data.teamTotalRuns}</Text>
              <Text style={styles.bigStatLabel}>runs logged</Text>
            </View>
          </View>
          <StatRow label="Avg per athlete" value={`${data.avgPerAthlete} mi`} />
          {data.topMilesAthlete && (
            <StatRow label="Most miles" value={`${data.topMilesAthlete.firstName} ${data.topMilesAthlete.lastName} — ${data.topMilesVal} mi`} accent={BRAND} />
          )}
        </Card>

        {/* Race Development */}
        {data.raceCount > 0 && (
          <Card title="Race Development" icon="🏁">
            <StatRow label="Meets" value={data.raceCount} />
            {data.primaryDist && <StatRow label="Primary distance" value={data.primaryDist} />}
            {data.firstSpread != null && data.lastSpread != null && (
              <>
                <StatRow label="First meet pack spread" value={formatTime(data.firstSpread)} />
                <StatRow label="Last meet pack spread" value={formatTime(data.lastSpread)} accent={data.lastSpread < data.firstSpread ? STATUS.success : STATUS.error} />
                {data.lastSpread < data.firstSpread && (
                  <View style={styles.improvementBanner}>
                    <Text style={styles.improvementText}>
                      Pack tightened by {formatTime(data.firstSpread - data.lastSpread)}
                    </Text>
                  </View>
                )}
              </>
            )}
            {data.teamTimeImprovement != null && data.teamTimeImprovement > 0 && (
              <StatRow label="Team avg improvement" value={formatTime(data.teamTimeImprovement)} accent={STATUS.success} />
            )}
          </Card>
        )}

        {/* Athlete Development */}
        <Card title="Athlete Highlights" icon="⭐">
          {data.mostImproved && (
            <StatRow
              label="Most improved"
              value={`${data.mostImproved.athlete.firstName} ${data.mostImproved.athlete.lastName} (${formatTime(data.mostImproved.improvement)} faster)`}
              accent={STATUS.success}
            />
          )}
          {data.mostConsistent && (
            <StatRow
              label="Most consistent"
              value={`${data.mostConsistent.athlete.firstName} ${data.mostConsistent.athlete.lastName} (${data.mostConsistent.count} check-ins)`}
            />
          )}
          {data.topMilesAthlete && (
            <StatRow
              label="Highest volume"
              value={`${data.topMilesAthlete.firstName} ${data.topMilesAthlete.lastName} (${data.topMilesVal} mi)`}
            />
          )}
        </Card>

        {/* Team Health */}
        <Card title="Team Health" icon="💚">
          <StatRow label="Injury rate" value={`${data.injuryRate}%`} accent={data.injuryRate <= 10 ? STATUS.success : data.injuryRate <= 25 ? STATUS.warning : STATUS.error} />
          {data.avgMood && <StatRow label="Team avg mood" value={`${data.avgMood}/5`} />}
          {data.avgSleep && <StatRow label="Team avg sleep" value={`${data.avgSleep}/5`} />}
        </Card>
      </>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={BRAND_DARK} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Season in Review</Text>
        <TouchableOpacity onPress={handleShare} style={styles.shareBtn}>
          <Ionicons name="share-outline" size={22} color={BRAND} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1 }}>
          <View style={styles.captureArea}>
            {isCoach ? renderCoachReview() : renderAthleteReview()}
            <Text style={styles.watermark}>TeamBase Season in Review</Text>
          </View>
        </ViewShot>
      </ScrollView>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: NEUTRAL.bg },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    backgroundColor: NEUTRAL.card, paddingTop: Platform.OS === 'ios' ? 56 : 32,
    paddingBottom: 16, paddingHorizontal: 20, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: NEUTRAL.border,
  },
  backBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, width: 60 },
  backText:     { color: BRAND_DARK, fontSize: 15, fontWeight: '600' },
  headerTitle:  { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  shareBtn:     { width: 60, alignItems: 'flex-end' },
  scroll:       { flex: 1 },
  captureArea:  { padding: SPACE.lg, backgroundColor: NEUTRAL.bg },
  watermark:    { textAlign: 'center', fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: SPACE.lg },

  // Hero card
  heroCard: {
    backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE['2xl'],
    alignItems: 'center', marginBottom: SPACE.lg, borderTopWidth: 5, ...SHADOW.sm,
  },
  heroIcon:     { fontSize: 40, marginBottom: SPACE.sm },
  heroSeason:   { fontSize: FONT_SIZE['2xl'], fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, textAlign: 'center' },
  heroName:     { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold, color: BRAND, marginTop: SPACE.xs },
  heroSchool:   { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, marginTop: 2 },
  heroDate:     { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: SPACE.xs },

  // Cards
  card: {
    backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg,
    marginBottom: SPACE.md, ...SHADOW.sm,
  },
  cardHeader:   { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.md },
  cardIcon:     { fontSize: 20 },
  cardTitle:    { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },

  // Stats
  bigStatRow:   { flexDirection: 'row', justifyContent: 'space-around', marginBottom: SPACE.md },
  bigStat:      { alignItems: 'center' },
  bigStatNum:   { fontSize: FONT_SIZE['3xl'], fontWeight: FONT_WEIGHT.bold },
  bigStatLabel: { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, marginTop: 2 },
  statRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: SPACE.xs + 2, borderBottomWidth: 1, borderBottomColor: NEUTRAL.bg },
  statLabel:    { fontSize: FONT_SIZE.sm, color: NEUTRAL.body },
  statValue:    { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, flexShrink: 1, textAlign: 'right', marginLeft: SPACE.md },

  // Improvement banner
  improvementBanner: { backgroundColor: STATUS.successBg, borderRadius: RADIUS.md, padding: SPACE.md, marginTop: SPACE.sm, alignItems: 'center' },
  improvementText:   { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: STATUS.success },

  // Balance hint
  balanceHint:  { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, textAlign: 'center', marginTop: SPACE.xs },

  emptyText:    { fontSize: FONT_SIZE.sm, color: NEUTRAL.muted, textAlign: 'center', padding: SPACE['2xl'] },
});
