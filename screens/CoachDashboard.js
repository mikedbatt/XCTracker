import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc, getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';
import {
  BRAND, BRAND_ACCENT, BRAND_DARK, BRAND_LIGHT,
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE, STATUS, STRAVA_ORANGE,
} from '../constants/design';
import AthleteDetailScreen from '../screens/AthleteDetailScreen';
import CoachAnalytics from '../screens/CoachAnalytics';
import CoachProfile from '../screens/CoachProfile';
import GroupManager from '../screens/GroupManager';
import CalendarScreen, { TYPE_COLORS } from '../screens/CalendarScreen';
import SeasonPlanner, { getActiveSeason, getPhaseForSeason } from '../screens/SeasonPlanner';
import TeamFeed from '../screens/TeamFeed';
import TimeframePicker, { TIMEFRAMES, getDateRange } from '../screens/TimeframePicker';
import WorkoutLibrary from '../screens/WorkoutLibrary';
import ZoneSettings from '../screens/ZoneSettings';
import {
  DEFAULT_ZONE_BOUNDARIES,
  calcMaxHR,
  calcZoneBreakdownFromRuns,
  calcZoneBreakdownFromStream,
  parseBirthdate,
} from '../zoneConfig';

// ── Daily tip library by phase ────────────────────────────────────────────────
const PHASE_TIPS = {
  'Pre-Season': [
    "Season hasn't started yet — use this time to connect with your team. Set expectations, build excitement, and make sure every athlete has their summer plan.",
    "Pre-season is the best time to establish your program culture. What habits do you want your athletes to build before the first practice?",
    "Use the off-season to study your returning athletes' data. Who needs more base miles? Who's ready to step up in training group?",
    "Great programs are built in the off-season. Reach out to your athletes today — a simple check-in message goes a long way.",
    "Set your season dates in the Season Planner so your team can see the phase timeline and championship countdown when the season begins.",
  ],
  Base: [
    "Today is about building your aerobic pyramid. Run easy, stay conversational, and log every mile. Consistency this week pays dividends in November.",
    "Base phase is where championships are quietly built. No heroics today — easy effort, good form, and another check in the box.",
    "Remind your athletes: the goal today is to finish feeling like they could have run more. That's the right effort for base phase.",
    "Easy miles aren't junk miles. Every Zone 2 run this week is expanding the engine your athletes will race on at state.",
    "When in doubt, do less. Base phase is about accumulation, not intensity. A slightly easy day now beats an injury in Week 8.",
  ],
  Build: [
    "Build phase begins. Time to introduce quality — one tempo effort this week. Keep the easy days easy so the hard days can be hard.",
    "Your athletes have the base. Now it's time to teach their bodies to run fast for longer. Today's tempo is a conversation with their limits.",
    "Remind the team: build phase means the hard days get harder AND the easy days must stay easy. No middle-ground running.",
    "This week's quality session is about process, not pace. Consistent splits at threshold effort matter more than hitting a number.",
    "The gap between base and build is where most teams get hurt. Keep easy days truly easy — check those heart rates.",
  ],
  Competition: [
    "We're in competition phase. Pack work is the priority now. Five runners finishing together beats one runner finishing fast.",
    "Remind your team today: every workout from here is race preparation. Run with intent, run together, run for each other.",
    "Championship teams are made right now. The athletes who buy in during competition phase run their best when it counts.",
    "Focus on your 1-5 compression this week. A tight pack at practice becomes a tight pack at the state meet.",
    "Competition phase tip: use this week's race as a training effort. Save the full send for the meets that matter.",
  ],
  Peak: [
    "Peak phase. Short, sharp, and confident. Every workout this week has one job: make your athletes believe they are ready.",
    "Less is more this week. Trust the training that's already been done. Your athletes are fit — now sharpen the edge.",
    "Remind the team: the fitness is there. Peak phase is about converting months of work into race-day confidence.",
    "Two or three quality sessions this week, then rest. The hay is nearly in the barn. Protect your athletes' legs.",
    "Peak phase mindset: aggressive patience. The athletes who hold back just enough this week will have the most left on race day.",
  ],
  Taper: [
    "Taper week. Easy runs only. The most important thing your athletes can do today is sleep, eat well, and believe in the work they've done.",
    "The hay is in the barn. Your job this week is to keep their legs fresh and their minds confident. Trust the process.",
    "Championship week reminder: anxiety is excitement without direction. Channel the nervous energy into confidence. They've earned this.",
    "Taper week tip: the urge to do more will be strong — resist it. Rest is the final workout. Protect every athlete's legs.",
    "Tell your team today: you didn't get here by accident. Every early morning, every easy mile, every hard workout — this is what it was for.",
  ],
};

function getDailyTip(phaseName) {
  const tips = PHASE_TIPS[phaseName] || PHASE_TIPS["Pre-Season"];
  const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  return tips[dayOfYear % tips.length];
}

// ── Overtraining detection ────────────────────────────────────────────────────
async function checkOvertraining(athleteId) {
  try {
    const sevenDaysAgo    = new Date(Date.now() - 7  * 86400000);
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000);

    const [recentSnap, prevSnap, checkinSnap] = await Promise.all([
      getDocs(query(collection(db, 'runs'), where('userId', '==', athleteId),
        where('date', '>=', sevenDaysAgo), orderBy('date', 'desc'))),
      getDocs(query(collection(db, 'runs'), where('userId', '==', athleteId),
        where('date', '>=', fourteenDaysAgo), where('date', '<', sevenDaysAgo), orderBy('date', 'desc'))),
      getDocs(query(collection(db, 'checkins'), where('userId', '==', athleteId),
        where('date', '>=', sevenDaysAgo), orderBy('date', 'desc'))).catch(() => ({ docs: [] })),
    ]);

    const recentRuns = recentSnap.docs.map(d => d.data());
    const prevRuns   = prevSnap.docs.map(d => d.data());
    const checkins   = checkinSnap.docs.map(d => d.data());

    const recentMiles = recentRuns.reduce((s, r) => s + (r.miles || 0), 0);
    const prevMiles   = prevRuns.reduce((s, r) => s + (r.miles || 0), 0);

    const signals = [];

    if (prevMiles > 0 && recentMiles > prevMiles * 1.15) {
      signals.push({ text: `Miles up ${Math.round(((recentMiles - prevMiles) / prevMiles) * 100)}% this week`, solo: true });
    }
    const highEffortDays = recentRuns.filter(r => (r.effort || 0) >= 8).length;
    if (highEffortDays >= 4) signals.push({ text: `Effort 8+ on ${highEffortDays} of last 7 days` });

    const hrRuns     = recentRuns.filter(r => r.heartRate && r.miles);
    const prevHRRuns = prevRuns.filter(r => r.heartRate && r.miles);
    if (hrRuns.length >= 2 && prevHRRuns.length >= 2) {
      const avgHR     = hrRuns.reduce((s, r) => s + r.heartRate, 0) / hrRuns.length;
      const prevAvgHR = prevHRRuns.reduce((s, r) => s + r.heartRate, 0) / prevHRRuns.length;
      if (avgHR > prevAvgHR * 1.05) signals.push({ text: `HR trending ${Math.round(((avgHR - prevAvgHR) / prevAvgHR) * 100)}% higher` });
    }

    if (checkins.length >= 3) {
      const recentAvgMood  = checkins.slice(0, 3).reduce((s, c) => s + (c.mood || 3), 0) / 3;
      const olderAvgMood   = checkins.slice(-3).reduce((s, c) => s + (c.mood || 3), 0) / 3;
      if (recentAvgMood < olderAvgMood - 0.5) signals.push({ text: 'Mood declining this week' });
      const recentAvgSleep = checkins.slice(0, 3).reduce((s, c) => s + (c.sleepQuality || 3), 0) / 3;
      if (recentAvgSleep < 2.5) signals.push({ text: 'Poor sleep reported' });
    }

    const hasSoloTrigger = signals.some(s => s.solo);
    const alert = hasSoloTrigger || signals.filter(s => !s.solo).length >= 2;
    return { alert, signals: signals.map(s => s.text) };
  } catch { return { alert: false, signals: [] }; }
}

// ── Zone % helper — same 3-tier system used everywhere else in the app ────────
// FIX: was using only calcZoneBreakdownFromRuns (avg HR estimate) regardless of
// whether precise stream data existed. Now recalculates from rawHRStream first
// so the Z1+Z2 % on each athlete card reflects actual second-by-second HR data
// when available, and dynamically respects the coach's current zone boundaries.
function calcAthleteZonePct(recentRuns, age, teamZoneSettings) {
  const boundaries  = teamZoneSettings?.boundaries  || DEFAULT_ZONE_BOUNDARIES;
  const customMaxHR = teamZoneSettings?.customMaxHR || null;
  const maxHR       = calcMaxHR(age, customMaxHR);

  // Tier 1 — raw HR stream: recalculate on the fly with current boundaries
  const rawStreamRuns = recentRuns.filter(r => r.rawHRStream?.length > 0);
  if (rawStreamRuns.length > 0) {
    const combined = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
    rawStreamRuns.forEach(r => {
      const bd = calcZoneBreakdownFromStream(r.rawHRStream, maxHR, boundaries);
      if (bd) bd.forEach(z => { combined[`z${z.zone}`] = (combined[`z${z.zone}`] || 0) + z.seconds; });
    });
    const total = Object.values(combined).reduce((s, v) => s + v, 0);
    if (total > 0) {
      const easyPct = Object.entries(combined)
        .filter(([key]) => parseInt(key.replace('z', '')) <= 2)
        .reduce((s, [, v]) => s + v, 0);
      return Math.round((easyPct / total) * 100);
    }
  }

  // Tier 2 — stored zone seconds (reflect boundaries at sync time)
  const storedZoneRuns = recentRuns.filter(r => r.hasStreamData && r.zoneSeconds);
  if (storedZoneRuns.length > 0) {
    const combined = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
    storedZoneRuns.forEach(r => {
      Object.entries(r.zoneSeconds).forEach(([k, v]) => {
        if (combined[k] !== undefined) combined[k] += v;
      });
    });
    const total = Object.values(combined).reduce((s, v) => s + v, 0);
    if (total > 0) {
      const easyPct = (combined.z1 + combined.z2);
      return Math.round((easyPct / total) * 100);
    }
  }

  // Tier 3 — avg HR + duration estimate
  const breakdown = calcZoneBreakdownFromRuns(recentRuns, age, customMaxHR, boundaries);
  if (breakdown) {
    return breakdown.filter(z => z.zone <= 2).reduce((s, z) => s + z.pct, 0);
  }

  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function CoachDashboard({ userData }) {
  const [school,              setSchool]              = useState(null);
  const [activeSeasonData,    setActiveSeasonData]    = useState(null);
  const [athletes,            setAthletes]            = useState([]);
  const [athleteMiles,        setAthleteMiles]        = useState({});
  const [athleteWeeklyMiles,  setAthleteWeeklyMiles]  = useState({});
  const [athlete3WeekAvg,     setAthlete3WeekAvg]     = useState({});
  const [athleteWeeklyBreakdown, setAthleteWeeklyBreakdown] = useState({});
  const [athleteZonePct,      setAthleteZonePct]      = useState({});
  const [pendingAthletes,     setPendingAthletes]     = useState([]);
  const [trainingItems,       setTrainingItems]       = useState([]);
  const [loading,             setLoading]             = useState(true);
  const [activeTab,           setActiveTab]           = useState('team');
  const [profileVisible,      setProfileVisible]      = useState(false);
  const [groupManagerVisible, setGroupManagerVisible] = useState(false);
  const [groups,              setGroups]              = useState([]);
  const [groupFilter,         setGroupFilter]         = useState('all');
  const [calendarVisible,     setCalendarVisible]     = useState(false);
  const [addFromDashboard,    setAddFromDashboard]    = useState(false);
  const [pendingWorkout,      setPendingWorkout]      = useState(null);
  const [plannerVisible,      setPlannerVisible]      = useState(false);
  const [selectedAthlete,     setSelectedAthlete]     = useState(null);
  const [selectedTimeframe,   setSelectedTimeframe]   = useState(TIMEFRAMES[0]);
  const [genderFilter,        setGenderFilter]        = useState('all');
  const [overtTrainingAlerts, setOvertTrainingAlerts] = useState({});
  const [tipModalVisible,     setTipModalVisible]     = useState(false);
  const [tipText,             setTipText]             = useState('');
  const [sendingTip,          setSendingTip]          = useState(false);
  const [todayTipSent,        setTodayTipSent]        = useState(false);
  const [libraryVisible,      setLibraryVisible]      = useState(false);
  const [feedVisible,         setFeedVisible]         = useState(false);
  const [zonesVisible,        setZonesVisible]        = useState(false);
  const [analyticsVisible,    setAnalyticsVisible]    = useState(false);
  const [teamZoneSettings,    setTeamZoneSettings]    = useState(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      if (!userData.schoolId) { setLoading(false); return; }

      const schoolDoc = await getDoc(doc(db, 'schools', userData.schoolId));
      const schoolData = schoolDoc.exists() ? schoolDoc.data() : null;
      if (schoolData) setSchool(schoolData);

      // Load team-wide zone settings — needed before per-athlete zone calc
      let currentZoneSettings = null;
      try {
        const zoneDoc = await getDoc(doc(db, 'teamZoneSettings', userData.schoolId));
        if (zoneDoc.exists()) {
          currentZoneSettings = zoneDoc.data();
          setTeamZoneSettings(currentZoneSettings);
        }
      } catch (e) { console.warn('Failed to load team zone settings, using defaults:', e); }

      // Load training groups
      try {
        const groupsSnap = await getDocs(query(
          collection(db, 'groups'),
          where('schoolId', '==', userData.schoolId)
        ));
        const loadedGroups = groupsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        loadedGroups.sort((a, b) => (a.order || 0) - (b.order || 0));
        setGroups(loadedGroups);
      } catch (e) { console.warn('Failed to load groups:', e); }

      const activeSeason = schoolData ? getActiveSeason(schoolData) : null;
      setActiveSeasonData(activeSeason);
      const { start: cutoff, end: cutoffEnd } = getDateRange(selectedTimeframe, activeSeason, null, null);

      const approvedSnap = await getDocs(query(
        collection(db, 'users'),
        where('schoolId', '==', userData.schoolId),
        where('role', '==', 'athlete'),
        where('status', '==', 'approved')
      ));
      const approvedAthletes = approvedSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAthletes(approvedAthletes);

      const now = new Date();
      const dayOfWeek = now.getDay();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      weekStart.setHours(0, 0, 0, 0);

      const milesMap        = {};
      const weeklyMilesMap  = {};
      const threeWeekAvgMap = {};
      const weekBreakdownMap = {};
      const zonePctMap      = {};

      for (const athlete of approvedAthletes) {
        try {
          const runsSnap = await getDocs(query(
            collection(db, 'runs'),
            where('userId', '==', athlete.id),
            orderBy('date', 'desc')
          ));
          const allRuns = runsSnap.docs.map(d => ({ ...d.data() }));

          // Timeframe filter for period miles
          const filtered = allRuns.filter(r => {
            const d = r.date?.toDate?.();
            if (!d) return false;
            if (cutoff && d < cutoff) return false;
            if (cutoffEnd && d > cutoffEnd) return false;
            return true;
          });
          milesMap[athlete.id] = Math.round(filtered.reduce((s, r) => s + (r.miles || 0), 0) * 10) / 10;

          // Current week miles
          const weekFiltered = allRuns.filter(r => {
            const d = r.date?.toDate?.();
            return d && d >= weekStart;
          });
          weeklyMilesMap[athlete.id] = Math.round(
            weekFiltered.reduce((s, r) => s + (r.miles || 0), 0) * 10
          ) / 10;

          // 3-week average weekly miles
          const week1Start = new Date(weekStart); // current week (incomplete)
          const week2Start = new Date(weekStart); week2Start.setDate(week2Start.getDate() - 7);
          const week3Start = new Date(weekStart); week3Start.setDate(week3Start.getDate() - 14);
          const week4Start = new Date(weekStart); week4Start.setDate(week4Start.getDate() - 21);

          const w1 = allRuns.filter(r => { const d = r.date?.toDate?.(); return d && d >= week1Start; })
            .reduce((s, r) => s + (r.miles || 0), 0);
          const w2 = allRuns.filter(r => { const d = r.date?.toDate?.(); return d && d >= week2Start && d < week1Start; })
            .reduce((s, r) => s + (r.miles || 0), 0);
          const w3 = allRuns.filter(r => { const d = r.date?.toDate?.(); return d && d >= week3Start && d < week2Start; })
            .reduce((s, r) => s + (r.miles || 0), 0);
          const w4 = allRuns.filter(r => { const d = r.date?.toDate?.(); return d && d >= week4Start && d < week3Start; })
            .reduce((s, r) => s + (r.miles || 0), 0);

          threeWeekAvgMap[athlete.id] = Math.round(((w1 + w2 + w3) / 3) * 10) / 10;
          // Store last 3 COMPLETED weeks (skip current incomplete week)
          weekBreakdownMap[athlete.id] = {
            w1: Math.round(w2 * 10) / 10, // last week
            w2: Math.round(w3 * 10) / 10, // 2 weeks ago
            w3: Math.round(w4 * 10) / 10, // 3 weeks ago
          };

          // ── Zone 1+2 % — FIX: now uses 3-tier stream recalculation ──────────
          // Previously only used calcZoneBreakdownFromRuns (avg HR estimate).
          // Now calls calcAthleteZonePct which tries rawHRStream first, then
          // stored zoneSeconds, then falls back to the avg HR estimate.
          // This means the Z1+Z2 % on each athlete card is as accurate as the
          // data available and always reflects the coach's current zone boundaries.
          try {
            const age = athlete.birthdate
              ? Math.floor((new Date() - parseBirthdate(athlete.birthdate)) / (365.25 * 86400000))
              : 16;
            const thirtyDaysAgo = new Date(now - 30 * 86400000);
            const recentRuns = allRuns.filter(r => {
              const d = r.date?.toDate?.();
              return d && d >= thirtyDaysAgo;
            });
            // Store null explicitly so the card can show "No HR data" vs hiding
            zonePctMap[athlete.id] = calcAthleteZonePct(recentRuns, age, currentZoneSettings);
          } catch (e) { console.warn('Zone pct calc failed for athlete:', e); }

        } catch (e) {
          console.log('Athlete data error:', e);
          milesMap[athlete.id]        = 0;
          weeklyMilesMap[athlete.id]  = 0;
          threeWeekAvgMap[athlete.id] = 0;
        }
      }

      setAthleteMiles(milesMap);
      setAthleteWeeklyMiles(weeklyMilesMap);
      setAthlete3WeekAvg(threeWeekAvgMap);
      setAthleteWeeklyBreakdown(weekBreakdownMap);
      setAthleteZonePct(zonePctMap);

      const alertsMap = {};
      for (const athlete of approvedAthletes) {
        alertsMap[athlete.id] = await checkOvertraining(athlete.id);
      }
      setOvertTrainingAlerts(alertsMap);

      if (userData.coachRole === 'admin') {
        const pendingSnap = await getDocs(query(
          collection(db, 'users'),
          where('schoolId', '==', userData.schoolId),
          where('role', '==', 'athlete'),
          where('status', '==', 'pending')
        ));
        setPendingAthletes(pendingSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      }

      try {
        const trainingSnap = await getDocs(query(
          collection(db, 'events'),
          where('schoolId', '==', userData.schoolId),
          where('category', '==', 'Training'),
          orderBy('date', 'asc')
        ));
        setTrainingItems(trainingSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch {
        try {
          const allSnap = await getDocs(query(
            collection(db, 'events'),
            where('schoolId', '==', userData.schoolId),
            orderBy('date', 'asc')
          ));
          setTrainingItems(allSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => i.category === 'Training'));
        } catch (e2) { console.error('Training load error:', e2.message); }
      }

      try {
        const today = new Date().toISOString().split('T')[0];
        const tipDoc = await getDoc(doc(db, 'dailyMessages', `${userData.schoolId}_${today}`));
        setTodayTipSent(tipDoc.exists());
      } catch (e) { console.warn('Failed to check daily tip status:', e); }

    } catch (error) { console.error('Coach dashboard error:', error); }
    setLoading(false);
  }, [selectedTimeframe, userData.schoolId]);

  useEffect(() => {
    if (!calendarVisible && !addFromDashboard && !plannerVisible) loadDashboard();
  }, [selectedTimeframe, calendarVisible, addFromDashboard, plannerVisible]);

  // ── Share leaderboard ────────────────────────────────────────────────────
  const handleShareLeaderboard = async () => {
    const sorted = [...filteredAthletes]
      .sort((a, b) => (athleteMiles[b.id] || 0) - (athleteMiles[a.id] || 0));

    if (sorted.length === 0) {
      Alert.alert('Nothing to share', 'No athlete data for this timeframe.');
      return;
    }

    const period = selectedTimeframe.label || 'Selected period';
    const groupName = groupFilter !== 'all' && groupFilter !== 'bygroup'
      ? (groupFilter === 'unassigned' ? 'Unassigned' : groups.find(g => g.id === groupFilter)?.name)
      : null;

    let lines;
    if (groupFilter === 'bygroup') {
      // Format by group with headers
      lines = [];
      [...groups, { id: null, name: 'Unassigned' }].forEach(group => {
        const groupAthletes = sorted.filter(a => group.id ? a.groupId === group.id : !a.groupId);
        if (groupAthletes.length === 0) return;
        lines.push('');
        lines.push(`── ${group.name}${group.weeklyMilesTarget ? ` (${group.weeklyMilesTarget} mi/wk target)` : ''} ──`);
        groupAthletes.forEach((a, i) => {
          const miles = Number(athleteMiles[a.id] || 0).toFixed(2);
          lines.push(`${i + 1}. ${a.firstName} ${a.lastName} — ${miles} mi`);
        });
      });
    } else {
      lines = sorted.map((a, i) => {
        const miles = Number(athleteMiles[a.id] || 0).toFixed(2);
        return `${i + 1}. ${a.firstName} ${a.lastName} — ${miles} mi`;
      });
    }

    const message = [
      `${school?.name || 'Team'} Leaderboard${groupName ? ' — ' + groupName : ''} — ${period}`,
      '',
      ...lines,
      '',
      `Sent from XCTracker`,
    ].join('\n');

    try {
      await Share.share({ message });
    } catch (e) { console.warn('Share failed:', e); }
  };

  // ── Deep drill-down (full replacement — not a tab) ──────────────────────
  if (selectedAthlete) {
    return <AthleteDetailScreen
      athlete={selectedAthlete}
      school={school}
      teamZoneSettings={teamZoneSettings}
      onBack={() => setSelectedAthlete(null)}
    />;
  }
  if (plannerVisible) {
    return (
      <SeasonPlanner
        school={school}
        schoolId={userData.schoolId}
        onClose={() => setPlannerVisible(false)}
        onSaved={(data) => {
          setSchool(prev => ({ ...prev, seasons: data.seasons }));
          setPlannerVisible(false);
        }}
      />
    );
  }

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleApproveAthlete = async (athlete) => {
    try {
      await updateDoc(doc(db, 'users', athlete.id), { status: 'approved' });
      await updateDoc(doc(db, 'schools', userData.schoolId), {
        pendingAthleteIds: arrayRemove(athlete.id),
        athleteIds: arrayUnion(athlete.id),
      });
      Alert.alert('Approved!', `${athlete.firstName} ${athlete.lastName} has been approved.`);
      loadDashboard();
    } catch { Alert.alert('Error', 'Could not approve athlete.'); }
  };

  const handleDenyAthlete = async (athlete) => {
    Alert.alert('Deny?', `Deny ${athlete.firstName}'s request?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Deny', style: 'destructive', onPress: async () => {
        await updateDoc(doc(db, 'users', athlete.id), { status: 'denied', schoolId: null });
        await updateDoc(doc(db, 'schools', userData.schoolId), { pendingAthleteIds: arrayRemove(athlete.id) });
        loadDashboard();
      }},
    ]);
  };

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut(auth) },
    ]);
  };

  const handleOpenTip = (phase) => {
    setTipText(getDailyTip(phase.name));
    setTipModalVisible(true);
  };

  const handleSendTip = async () => {
    if (!tipText.trim()) return;
    setSendingTip(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      await setDoc(doc(db, 'dailyMessages', `${userData.schoolId}_${today}`), {
        schoolId:    userData.schoolId,
        message:     tipText.trim(),
        sentBy:      auth.currentUser.uid,
        sentByName:  `Coach ${userData.lastName}`,
        date:        today,
        sentAt:      new Date(),
      });
      setTodayTipSent(true);
      setTipModalVisible(false);
      Alert.alert('Sent! ✅', "Your message has been pinned to every athlete's dashboard.");
    } catch {
      Alert.alert('Error', 'Could not send message. Please try again.');
    }
    setSendingTip(false);
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={BRAND} /></View>;

  const primaryColor  = school?.primaryColor || BRAND;
  const isAdmin       = userData.coachRole === 'admin';
  const today         = new Date().toISOString().split('T')[0];
  const todayItems    = trainingItems.filter(item => item.date?.toDate?.()?.toISOString().split('T')[0] === today);
  const upcomingItems = trainingItems.filter(item => item.date?.toDate?.()?.toISOString().split('T')[0] > today).slice(0, 7);
  const activeSeason  = getActiveSeason(school);
  const currentPhase  = activeSeason ? getPhaseForSeason(activeSeason) : getPhaseForSeason(null);
  const alertCount    = Object.values(overtTrainingAlerts).filter(a => a.alert).length;
  const filteredAthletes = athletes.filter(a => {
    if (genderFilter !== 'all' && a.gender !== genderFilter) return false;
    if (groupFilter !== 'all' && groupFilter !== 'bygroup') {
      if (groupFilter === 'unassigned') return !a.groupId;
      if (a.groupId !== groupFilter) return false;
    }
    return true;
  });

  const teamWeeklyMiles = Math.round(
    filteredAthletes.reduce((s, a) => s + (athleteWeeklyMiles[a.id] || 0), 0) * 10
  ) / 10;
  const teamPeriodMiles = Math.round(
    filteredAthletes.reduce((s, a) => s + (athleteMiles[a.id] || 0), 0) * 10
  ) / 10;

  const renderAthleteCard = (athlete, index) => {
    const overtrain   = overtTrainingAlerts[athlete.id];
    const hasAlert    = overtrain?.alert;
    const weekMiles   = athleteWeeklyMiles[athlete.id] || 0;
    const avg3        = athlete3WeekAvg[athlete.id] || 0;
    const mileageHigh = avg3 > 0 && weekMiles > avg3 * 1.20;
    const zonePct     = athleteZonePct[athlete.id];
    const hasZoneData = zonePct !== undefined;
    const zoneLow     = hasZoneData && zonePct !== null && zonePct < 70;
    const line1 = `Wk: ${weekMiles} mi${avg3 > 0 ? ` (avg ${avg3})` : ''}${mileageHigh ? '  ↑' : ''}`;
    const line2 = hasZoneData && zonePct !== null ? `Z1+2: ${zonePct}%${zoneLow ? '  ⚠' : ''}` : null;

    return (
      <TouchableOpacity
        key={athlete.id}
        style={[styles.athleteCard, hasAlert && styles.athleteCardAlert]}
        onPress={() => setSelectedAthlete(athlete)}
      >
        <View style={styles.athleteCardTop}>
          <Text style={styles.rankNum}>#{index + 1}</Text>
          <View style={[styles.avatar, { backgroundColor: hasAlert ? '#ef4444' : (athlete.avatarColor || BRAND) }]}>
            <Text style={styles.avatarText}>{athlete.firstName?.[0]}{athlete.lastName?.[0]}</Text>
          </View>
          <View style={styles.athleteInfo}>
            <Text style={styles.athleteName}>{athlete.firstName} {athlete.lastName}</Text>
            {hasAlert
              ? <Text style={styles.alertText}>⚠️ {overtrain.signals[0]}</Text>
              : <>
                  <Text style={styles.athleteSub}>{line1}</Text>
                  {line2 && <Text style={styles.athleteSub}>{line2}</Text>}
                </>
            }
          </View>
          <View style={styles.milesBox}>
            <Text style={[styles.milesNum, { color: hasAlert ? STATUS.error : BRAND }]}>
              {athleteMiles[athlete.id] ?? '—'}
            </Text>
            <Text style={styles.milesLabel}>miles</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Coach {userData.lastName}</Text>
            <Text style={styles.schoolName}>{school?.name || 'XCTracker'}</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerRightText}>{athletes.length} athletes  ·  Code: {school?.joinCode || '--'}</Text>
            {alertCount > 0 && <Text style={styles.headerAlertText}>⚠️ {alertCount} alert{alertCount > 1 ? 's' : ''}</Text>}
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 90 }}
      >

        {/* Daily message button — only show when not yet sent */}
        {!todayTipSent && (
          <View style={styles.msgRow}>
            <TouchableOpacity
              style={styles.msgBtn}
              onPress={() => handleOpenTip(currentPhase)}
            >
              <Text style={[styles.msgBtnText, { color: '#fff' }]}>
                💬 Send daily message to team
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Team ── */}
        <View style={styles.section}>

          <View style={styles.timeframeRow}>
            <View style={{ flex: 1 }}>
              <TimeframePicker
                selected={selectedTimeframe}
                onSelect={setSelectedTimeframe}
                activeSeason={activeSeasonData}
                primaryColor={primaryColor}
              />
            </View>
            <TouchableOpacity style={styles.shareBtn} onPress={handleShareLeaderboard}>
              <Text style={styles.shareBtnText}>Share</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.genderRow}>
            {['all', 'boys', 'girls'].map(g => (
              <TouchableOpacity
                key={g}
                style={[styles.genderBtn, genderFilter === g && { backgroundColor: BRAND, borderColor: BRAND }]}
                onPress={() => setGenderFilter(g)}
              >
                <Text style={[styles.genderBtnText, genderFilter === g && { color: '#fff' }]}>
                  {g === 'all' ? 'All' : g === 'boys' ? 'Boys' : 'Girls'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {groups.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupFilterRow}>
              {[{ id: 'all', name: 'All' }, { id: 'bygroup', name: 'By Group' }, ...groups, { id: 'unassigned', name: 'Unassigned' }].map(g => (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.groupFilterBtn, groupFilter === g.id && { backgroundColor: BRAND, borderColor: BRAND }]}
                  onPress={() => setGroupFilter(g.id)}
                >
                  <Text style={[styles.groupFilterBtnText, groupFilter === g.id && { color: '#fff' }]}>
                    {g.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

            {filteredAthletes.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No approved athletes yet.</Text>
                <Text style={styles.emptySubText}>Share join code: {school?.joinCode}</Text>
              </View>
            ) : groupFilter === 'bygroup' ? (
              // ── By Group view: athletes grouped under headers ──
              [...groups, { id: null, name: 'Unassigned' }].map(group => {
                const groupAthletes = athletes
                  .filter(a => group.id ? a.groupId === group.id : !a.groupId)
                  .filter(a => genderFilter === 'all' || a.gender === genderFilter)
                  .sort((a, b) => (athleteMiles[b.id] || 0) - (athleteMiles[a.id] || 0));
                if (groupAthletes.length === 0) return null;
                return (
                  <View key={group.id || 'unassigned'} style={styles.groupSection}>
                    <Text style={[styles.groupHeader, group.id && { color: BRAND }]}>
                      {group.name}{group.weeklyMilesTarget ? ` · ${group.weeklyMilesTarget} mi/wk target` : ''}
                    </Text>
                    {groupAthletes.map((athlete, index) => renderAthleteCard(athlete, index))}
                  </View>
                );
              })
            ) : (
              // ── Flat sorted view ──
              [...filteredAthletes]
                .sort((a, b) => (athleteMiles[b.id] || 0) - (athleteMiles[a.id] || 0))
                .map((athlete, index) => renderAthleteCard(athlete, index))
            )}

            {/* Overtraining alerts */}
            {filteredAthletes.some(a => overtTrainingAlerts[a.id]?.alert) && (
              <View style={styles.alertSection}>
                <Text style={styles.alertSectionTitle}>⚠️ Overtraining alerts</Text>
                {filteredAthletes.filter(a => overtTrainingAlerts[a.id]?.alert).map(athlete => (
                  <View key={athlete.id} style={styles.alertCard}>
                    <Text style={styles.alertAthleteName}>{athlete.firstName} {athlete.lastName}</Text>
                    {overtTrainingAlerts[athlete.id].signals.map((sig, i) => (
                      <Text key={i} style={styles.alertSignal}>• {sig}</Text>
                    ))}
                    <Text style={styles.alertRec}>Recommendation: Consider a recovery day or reduce intensity.</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* ── Today's training ── */}
          <View style={styles.section}>
            <View style={styles.todaySection}>
              <Text style={styles.todayLabel}>TODAY</Text>
              {todayItems.length > 0 ? todayItems.map(item => (
                <View key={item.id} style={[styles.todayCard, { borderLeftColor: TYPE_COLORS[item.type] || primaryColor }]}>
                  <View style={[styles.typeBadge, { backgroundColor: TYPE_COLORS[item.type] || primaryColor }]}>
                    <Text style={styles.typeBadgeText}>{item.type}</Text>
                  </View>
                  <Text style={styles.trainingTitle}>{item.title}</Text>
                  {item.description && <Text style={styles.trainingDesc}>{item.description}</Text>}
                  {item.notes && <Text style={styles.trainingNotes}>{item.notes}</Text>}
                </View>
              )) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No training scheduled today.</Text>
                </View>
              )}
            </View>
            <View style={styles.upcomingSection}>
              <View style={styles.upcomingHeader}>
                <Text style={styles.upcomingSectionTitle}>Upcoming training</Text>
              </View>
              {upcomingItems.length === 0 ? (
                <View style={styles.emptyCard}><Text style={styles.emptyText}>No upcoming training scheduled.</Text></View>
              ) : upcomingItems.map(item => (
                <View key={item.id} style={styles.trainingCard}>
                  <View style={[styles.typeBadge, { backgroundColor: TYPE_COLORS[item.type] || primaryColor }]}>
                    <Text style={styles.typeBadgeText}>{item.type}</Text>
                  </View>
                  <View style={styles.trainingInfo}>
                    <Text style={styles.trainingTitle}>{item.title}</Text>
                    {item.description && <Text style={styles.trainingDesc} numberOfLines={1}>{item.description}</Text>}
                    <Text style={styles.trainingDate}>
                      {item.date?.toDate?.()?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

      </ScrollView>

      {/* ── Sub-screens rendered over content but under nav ── */}
      {(calendarVisible || addFromDashboard) && (
        <View style={styles.subScreen}>
          <CalendarScreen
            userData={userData} school={school}
            groups={groups}
            autoOpenAdd={addFromDashboard}
            prefillWorkout={pendingWorkout}
            onClose={() => { setCalendarVisible(false); setAddFromDashboard(false); setPendingWorkout(null); loadDashboard(); }}
          />
        </View>
      )}
      {groupManagerVisible && (
        <View style={styles.subScreen}>
          <GroupManager
            schoolId={userData.schoolId}
            athletes={athletes}
            activeSeason={activeSeasonData}
            onClose={() => { setGroupManagerVisible(false); loadDashboard(); }}
          />
        </View>
      )}
      {feedVisible && (
        <View style={styles.subScreen}>
          <TeamFeed userData={userData} school={school} onClose={() => setFeedVisible(false)} />
        </View>
      )}
      {zonesVisible && (
        <View style={styles.subScreen}>
          <ZoneSettings
            school={school}
            schoolId={userData.schoolId}
            onClose={() => setZonesVisible(false)}
            onSaved={(newBoundaries, newHrZonesDisabled) => {
              setTeamZoneSettings(prev => ({ ...prev, boundaries: newBoundaries, hrZonesDisabled: newHrZonesDisabled }));
              setZonesVisible(false);
              loadDashboard();
            }}
          />
        </View>
      )}
      {profileVisible && (
        <View style={styles.subScreen}>
          <CoachProfile
            userData={userData}
            school={school}
            pendingAthletes={pendingAthletes}
            onApproveAthlete={handleApproveAthlete}
            onDenyAthlete={handleDenyAthlete}
            onClose={() => { setProfileVisible(false); loadDashboard(); }}
            onUpdated={() => { setProfileVisible(false); loadDashboard(); }}
          />
        </View>
      )}
      {libraryVisible && (
        <View style={styles.subScreen}>
          <WorkoutLibrary
            school={school}
            schoolId={userData.schoolId}
            userData={userData}
            onClose={() => setLibraryVisible(false)}
            onAddToCalendar={(workout) => {
              setPendingWorkout(workout);
              setLibraryVisible(false);
              setAddFromDashboard(true);
            }}
          />
        </View>
      )}
      {analyticsVisible && (
        <View style={styles.subScreen}>
          <CoachAnalytics
            athletes={athletes}
            athleteWeeklyMiles={athleteWeeklyMiles}
            athlete3WeekAvg={athlete3WeekAvg}
            athleteWeeklyBreakdown={athleteWeeklyBreakdown}
            athleteZonePct={athleteZonePct}
            overtTrainingAlerts={overtTrainingAlerts}
            athleteMiles={athleteMiles}
            groups={groups}
            school={school}
            schoolId={userData.schoolId}
            onClose={() => setAnalyticsVisible(false)}
          />
        </View>
      )}

      {/* ── Persistent bottom nav ── */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => { setCalendarVisible(false); setGroupManagerVisible(false); setFeedVisible(false); setZonesVisible(false); setProfileVisible(false); setLibraryVisible(false); setAnalyticsVisible(false); setAddFromDashboard(false); }}>
          <Ionicons name="home-outline" size={24} color={!calendarVisible && !groupManagerVisible && !feedVisible && !zonesVisible && !profileVisible && !libraryVisible && !analyticsVisible && !addFromDashboard ? BRAND : NEUTRAL.muted} />
          <Text style={[styles.bottomNavLabel, !calendarVisible && !groupManagerVisible && !feedVisible && !zonesVisible && !profileVisible && !libraryVisible && !analyticsVisible && !addFromDashboard && { color: BRAND }]}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => { setGroupManagerVisible(false); setFeedVisible(false); setZonesVisible(false); setProfileVisible(false); setLibraryVisible(false); setAnalyticsVisible(false); setAddFromDashboard(false); setCalendarVisible(true); }}>
          <Ionicons name="calendar-outline" size={24} color={calendarVisible || addFromDashboard ? BRAND : NEUTRAL.muted} />
          <Text style={[styles.bottomNavLabel, (calendarVisible || addFromDashboard) && { color: BRAND }]}>Training</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => { setCalendarVisible(false); setGroupManagerVisible(false); setFeedVisible(false); setZonesVisible(false); setProfileVisible(false); setLibraryVisible(false); setAddFromDashboard(false); setAnalyticsVisible(true); }}>
          <Ionicons name="analytics-outline" size={24} color={analyticsVisible ? BRAND : NEUTRAL.muted} />
          <Text style={[styles.bottomNavLabel, analyticsVisible && { color: BRAND }]}>Analytics</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => { setCalendarVisible(false); setGroupManagerVisible(false); setZonesVisible(false); setProfileVisible(false); setLibraryVisible(false); setAnalyticsVisible(false); setAddFromDashboard(false); setFeedVisible(true); }}>
          <Ionicons name="chatbubbles-outline" size={24} color={feedVisible ? BRAND : NEUTRAL.muted} />
          <Text style={[styles.bottomNavLabel, feedVisible && { color: BRAND }]}>Feed</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => { setCalendarVisible(false); setGroupManagerVisible(false); setFeedVisible(false); setZonesVisible(false); setLibraryVisible(false); setAnalyticsVisible(false); setAddFromDashboard(false); setProfileVisible(true); }}>
          <View>
            <Ionicons name="person-outline" size={24} color={profileVisible ? BRAND : NEUTRAL.muted} />
            {pendingAthletes.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{pendingAthletes.length}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.bottomNavLabel, profileVisible && { color: BRAND }]}>Profile</Text>
        </TouchableOpacity>
      </View>

      {/* ── Daily Message Modal ── */}
      <Modal visible={tipModalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.tipModal}>
            <View style={styles.tipModalHeader}>
              <TouchableOpacity onPress={() => setTipModalVisible(false)}>
                <Text style={styles.tipModalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.tipModalTitle}>Daily message</Text>
              <View style={{ width: 60 }} />
            </View>
            <ScrollView style={styles.tipModalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.tipModalSubtitle}>
                This message will be pinned to every athlete's dashboard today.
              </Text>
              <TextInput
                style={styles.tipModalInput}
                value={tipText}
                onChangeText={setTipText}
                multiline
                autoFocus
                placeholder="Write your message to the team..."
                placeholderTextColor="#999"
              />
              <Text style={styles.tipModalHint}>
                💡 Auto-generated based on your current training phase. Make it your own.
              </Text>
              <TouchableOpacity
                style={[styles.tipSendBtn, { backgroundColor: tipText.trim() ? BRAND : NEUTRAL.input }]}
                onPress={handleSendTip}
                disabled={sendingTip || !tipText.trim()}
              >
                {sendingTip
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.tipSendBtnText}>Send to team →</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  groupSection:         { marginBottom: SPACE.lg },
  groupHeader:          { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: NEUTRAL.label, marginBottom: SPACE.sm, marginTop: SPACE.xs },
  groupFilterRow:       { flexDirection: 'row', marginBottom: SPACE.md, maxHeight: 36 },
  groupFilterBtn:       { borderRadius: RADIUS.sm, borderWidth: 1.5, borderColor: NEUTRAL.border, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, marginRight: SPACE.sm, backgroundColor: NEUTRAL.card },
  groupFilterBtnText:   { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: NEUTRAL.body },
  timeframeRow:         { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACE.md, marginBottom: 0 },
  shareBtn:             { borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: BRAND, paddingHorizontal: SPACE.lg - 2, paddingVertical: SPACE.md, backgroundColor: NEUTRAL.card },
  shareBtnText:         { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: BRAND },
  container:            { flex: 1, backgroundColor: NEUTRAL.bg },
  loading:              { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:               { backgroundColor: NEUTRAL.card, paddingTop: Platform.OS === 'ios' ? SPACE['5xl'] : SPACE['3xl'], paddingBottom: SPACE.md, paddingHorizontal: SPACE.xl, borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
  headerRow:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greeting:             { fontSize: FONT_SIZE.xl - 2, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  schoolName:           { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, marginTop: 1 },
  headerRight:          { alignItems: 'flex-end' },
  headerRightText:      { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, fontWeight: FONT_WEIGHT.semibold },
  headerAlertText:      { fontSize: FONT_SIZE.xs, color: STATUS.error, fontWeight: FONT_WEIGHT.bold, marginTop: 2 },
  profileBtn:           { paddingVertical: SPACE.sm, paddingHorizontal: SPACE.md, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: RADIUS.sm },
  profileBtnText:       { color: '#fff', fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  headerStats:          { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg - 2 },
  headerStat:           { alignItems: 'center' },
  headerStatNum:        { fontSize: FONT_SIZE.xl - 2, fontWeight: FONT_WEIGHT.bold, color: '#fff' },
  headerStatLabel:      { fontSize: FONT_SIZE.xs, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  alertStatBox:         { backgroundColor: 'rgba(239,68,68,0.3)', borderRadius: RADIUS.sm, paddingHorizontal: SPACE.sm, paddingVertical: SPACE.xs },
  alertStatNum:         { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: '#fff' },
  alertStatLabel:       { fontSize: 10, color: 'rgba(255,255,255,0.9)', marginTop: 1 },
  tabs:                 { flexDirection: 'row', backgroundColor: NEUTRAL.card, borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
  tab:                  { flex: 1, paddingVertical: SPACE.lg - 2, alignItems: 'center' },
  tabActive:            { borderBottomWidth: 2, borderBottomColor: BRAND },
  tabText:              { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: NEUTRAL.muted },
  scroll:               { flex: 1 },
  msgRow:               { paddingHorizontal: SPACE.lg, marginTop: SPACE.md, marginBottom: SPACE.xs },
  msgBtn:               { backgroundColor: BRAND_LIGHT, borderRadius: RADIUS.md, paddingVertical: SPACE.md, paddingHorizontal: SPACE.lg - 2, alignItems: 'center' },
  msgBtnText:           { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND },
  section:              { padding: SPACE.lg },
  genderRow:            { flexDirection: 'row', gap: SPACE.sm, marginBottom: SPACE.md },
  genderBtn:            { flex: 1, borderRadius: RADIUS.md, paddingVertical: SPACE.md, alignItems: 'center', backgroundColor: NEUTRAL.card, borderWidth: 1.5, borderColor: NEUTRAL.border },
  genderBtnText:        { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: NEUTRAL.body },
  emptyCard:            { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.xl, alignItems: 'center', gap: SPACE.md, ...SHADOW.sm },
  emptyText:            { color: NEUTRAL.muted, fontSize: FONT_SIZE.sm, textAlign: 'center' },
  emptySubText:         { color: NEUTRAL.muted, fontSize: FONT_SIZE.sm },
  athleteCard:          { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.md, marginBottom: SPACE.sm, ...SHADOW.sm },
  athleteCardAlert:     { borderWidth: 1.5, borderColor: STATUS.error, backgroundColor: STATUS.errorBg },
  athleteCardTop:       { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  athleteCardStats:     { flexDirection: 'row', gap: SPACE.md, paddingTop: SPACE.md, borderTopWidth: 1, borderTopColor: NEUTRAL.bg },
  athleteStatChip:      { flex: 1, backgroundColor: NEUTRAL.bg, borderRadius: RADIUS.sm, padding: SPACE.sm },
  athleteStatChipLabel: { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginBottom: 2 },
  athleteStatChipVal:   { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  statValRed:           { color: STATUS.error },
  statFlagRed:          { fontSize: FONT_SIZE.xs, color: STATUS.error, fontWeight: FONT_WEIGHT.semibold, marginTop: 2 },
  rankNum:              { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: NEUTRAL.muted, width: 24 },
  avatar:               { width: 38, height: 38, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
  avatarText:           { color: '#fff', fontWeight: FONT_WEIGHT.bold, fontSize: FONT_SIZE.sm },
  athleteInfo:          { flex: 1 },
  athleteName:          { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  athleteSub:           { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: 2 },
  alertText:            { fontSize: FONT_SIZE.xs, color: STATUS.error, marginTop: 2, fontWeight: FONT_WEIGHT.semibold },
  milesBox:             { alignItems: 'center' },
  milesNum:             { fontSize: FONT_SIZE.xl - 2, fontWeight: FONT_WEIGHT.bold },
  milesLabel:           { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted },
  chevron:              { fontSize: 22, color: NEUTRAL.input },
  alertSection:         { marginTop: SPACE.sm },
  alertSectionTitle:    { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: STATUS.error, marginBottom: SPACE.md },
  alertCard:            { backgroundColor: STATUS.errorBg, borderRadius: RADIUS.lg, padding: SPACE.lg - 2, marginBottom: SPACE.md, borderLeftWidth: 4, borderLeftColor: STATUS.error },
  alertAthleteName:     { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: SPACE.sm },
  alertSignal:          { fontSize: FONT_SIZE.sm, color: STATUS.error, marginBottom: 3 },
  alertRec:             { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, marginTop: SPACE.sm, fontStyle: 'italic' },
  todaySection:         { marginBottom: SPACE['2xl'] },
  todayLabel:           { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, color: NEUTRAL.muted, letterSpacing: 1, marginBottom: SPACE.md },
  todayCard:            { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg, borderLeftWidth: 4, marginBottom: SPACE.sm, ...SHADOW.sm },
  upcomingSection:      { marginBottom: SPACE.lg },
  upcomingHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.md },
  upcomingSectionTitle: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  typeBadge:            { alignSelf: 'flex-start', borderRadius: RADIUS.sm, paddingHorizontal: SPACE.md, paddingVertical: 5, marginBottom: SPACE.sm },
  typeBadgeText:        { color: '#fff', fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold },
  trainingCard:         { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg - 2, marginBottom: SPACE.md, flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md, ...SHADOW.sm },
  trainingInfo:         { flex: 1 },
  trainingTitle:        { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  trainingDesc:         { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, marginTop: 2 },
  trainingNotes:        { fontSize: FONT_SIZE.sm, color: NEUTRAL.muted, marginTop: SPACE.xs, fontStyle: 'italic' },
  trainingDate:         { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: SPACE.xs },
  pendingCard:          { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg - 2, marginBottom: SPACE.md, gap: SPACE.md },
  minorTag:             { fontSize: FONT_SIZE.xs, color: STATUS.warning, marginTop: SPACE.xs, fontWeight: FONT_WEIGHT.semibold },
  approvalBtns:         { flexDirection: 'row', gap: SPACE.sm },
  approveBtn:           { flex: 1, borderRadius: RADIUS.sm, padding: SPACE.md, alignItems: 'center' },
  approveBtnText:       { color: '#fff', fontWeight: FONT_WEIGHT.bold },
  denyBtn:              { flex: 1, borderRadius: RADIUS.sm, padding: SPACE.md, alignItems: 'center', backgroundColor: STATUS.errorBg },
  denyBtnText:          { color: STATUS.error, fontWeight: FONT_WEIGHT.bold },
  subScreen:            { position: 'absolute', top: 0, left: 0, right: 0, bottom: Platform.OS === 'ios' ? 82 : 56, backgroundColor: NEUTRAL.bg, zIndex: 10 },
  bottomNav:            { flexDirection: 'row', backgroundColor: NEUTRAL.card, borderTopWidth: 1, borderTopColor: NEUTRAL.border, paddingBottom: Platform.OS === 'ios' ? SPACE['2xl'] : SPACE.sm, paddingTop: SPACE.md, ...SHADOW.sm, zIndex: 20 },
  bottomNavBtn:         { flex: 1, alignItems: 'center', gap: 2 },
  bottomNavLabel:       { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, fontWeight: FONT_WEIGHT.medium },
  badge:                { position: 'absolute', top: -4, right: -8, backgroundColor: STATUS.error, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText:            { color: '#fff', fontSize: 10, fontWeight: FONT_WEIGHT.bold },
  tipModal:             { flex: 1, backgroundColor: NEUTRAL.bg },
  tipModalHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACE.xl, paddingTop: 60, backgroundColor: NEUTRAL.card, borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
  tipModalTitle:        { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  tipModalCancel:       { color: STATUS.error, fontSize: FONT_SIZE.md, width: 60 },
  tipModalBody:         { padding: SPACE.xl },
  tipModalSubtitle:     { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, lineHeight: 20, marginBottom: SPACE.lg },
  tipModalInput:        { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg, fontSize: FONT_SIZE.md, color: BRAND_DARK, borderWidth: 1, borderColor: NEUTRAL.input, minHeight: 180, textAlignVertical: 'top', lineHeight: 24, marginBottom: SPACE.md },
  tipModalHint:         { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginBottom: SPACE['2xl'], lineHeight: 18 },
  tipSendBtn:           { borderRadius: RADIUS.lg, padding: SPACE.lg + 2, alignItems: 'center', marginBottom: SPACE['4xl'] },
  tipSendBtnText:       { color: '#fff', fontSize: 17, fontWeight: FONT_WEIGHT.bold },
});