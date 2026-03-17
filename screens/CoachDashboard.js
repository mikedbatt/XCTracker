import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { auth, db } from '../firebaseConfig';
import { signOut } from 'firebase/auth';
import {
  doc, getDoc, collection, query, where, orderBy,
  getDocs, updateDoc, arrayUnion, arrayRemove, addDoc, setDoc,
} from 'firebase/firestore';
import AthleteDetailScreen from '../screens/AthleteDetailScreen';
import TimeframePicker, { TIMEFRAMES, getDateRange } from '../screens/TimeframePicker';
import CalendarScreen, { TYPE_COLORS } from '../screens/CalendarScreen';
import SeasonPlanner, { getActiveSeason, getPhaseForSeason, SPORTS, PhasePill } from '../screens/SeasonPlanner';
import WorkoutLibrary from '../screens/WorkoutLibrary';
import TeamFeed from '../screens/TeamFeed';
import ZoneSettings from '../screens/ZoneSettings';
import {
  DEFAULT_ZONE_BOUNDARIES, calcMaxHR, calcZoneBreakdownFromRuns,
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

    const hrRuns = recentRuns.filter(r => r.heartRate && r.miles);
    const prevHRRuns = prevRuns.filter(r => r.heartRate && r.miles);
    if (hrRuns.length >= 2 && prevHRRuns.length >= 2) {
      const avgHR = hrRuns.reduce((s, r) => s + r.heartRate, 0) / hrRuns.length;
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

// ── Component ─────────────────────────────────────────────────────────────────
export default function CoachDashboard({ userData }) {
  const [school,              setSchool]              = useState(null);
  const [activeSeasonData,    setActiveSeasonData]    = useState(null);
  const [athletes,            setAthletes]            = useState([]);
  const [athleteMiles,        setAthleteMiles]        = useState({});
  const [athleteWeeklyMiles,  setAthleteWeeklyMiles]  = useState({});
  const [athlete3WeekAvg,     setAthlete3WeekAvg]     = useState({}); // 3-week avg weekly miles
  const [athleteZonePct,      setAthleteZonePct]      = useState({}); // Z1+Z2 % per athlete
  const [pendingAthletes,     setPendingAthletes]     = useState([]);
  const [trainingItems,       setTrainingItems]       = useState([]);
  const [loading,             setLoading]             = useState(true);
  const [activeTab,           setActiveTab]           = useState('team');
  const [calendarVisible,     setCalendarVisible]     = useState(false);
  const [addFromDashboard,    setAddFromDashboard]    = useState(false);
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
  const [teamZoneSettings,    setTeamZoneSettings]    = useState(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      if (!userData.schoolId) { setLoading(false); return; }

      const schoolDoc = await getDoc(doc(db, 'schools', userData.schoolId));
      const schoolData = schoolDoc.exists() ? schoolDoc.data() : null;
      if (schoolData) setSchool(schoolData);

      // Load team-wide zone settings
      try {
        const zoneDoc = await getDoc(doc(db, 'teamZoneSettings', userData.schoolId));
        if (zoneDoc.exists()) setTeamZoneSettings(zoneDoc.data());
      } catch { /* use defaults */ }

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

      // Get start of current calendar week (Monday)
      const now = new Date();
      const dayOfWeek = now.getDay();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      weekStart.setHours(0, 0, 0, 0);

      const milesMap        = {};
      const weeklyMilesMap  = {};
      const threeWeekAvgMap = {};
      const zonePctMap      = {};

      for (const athlete of approvedAthletes) {
        try {
          const runsSnap = await getDocs(query(
            collection(db, 'runs'),
            where('userId', '==', athlete.id),
            orderBy('date', 'desc')
          ));
          const allRuns = runsSnap.docs.map(d => ({ ...d.data() }));

          // Timeframe filter
          const filtered = allRuns.filter(r => {
            const d = r.date?.toDate?.();
            if (!d) return false;
            if (cutoff && d < cutoff) return false;
            if (cutoffEnd && d > cutoffEnd) return false;
            return true;
          });
          milesMap[athlete.id] = Math.round(filtered.reduce((s, r) => s + (r.miles || 0), 0) * 10) / 10;

          // Current week miles (Mon–now)
          const weekFiltered = allRuns.filter(r => {
            const d = r.date?.toDate?.();
            return d && d >= weekStart;
          });
          weeklyMilesMap[athlete.id] = Math.round(
            weekFiltered.reduce((s, r) => s + (r.miles || 0), 0) * 10
          ) / 10;

          // ── 3-week average weekly miles ────────────────────────────────────
          const week1Start = new Date(weekStart);
          const week2Start = new Date(weekStart); week2Start.setDate(week2Start.getDate() - 7);
          const week3Start = new Date(weekStart); week3Start.setDate(week3Start.getDate() - 14);
          const week4Start = new Date(weekStart); week4Start.setDate(week4Start.getDate() - 21);

          const w1 = allRuns.filter(r => { const d = r.date?.toDate?.(); return d && d >= week1Start; })
            .reduce((s, r) => s + (r.miles || 0), 0);
          const w2 = allRuns.filter(r => { const d = r.date?.toDate?.(); return d && d >= week2Start && d < week1Start; })
            .reduce((s, r) => s + (r.miles || 0), 0);
          const w3 = allRuns.filter(r => { const d = r.date?.toDate?.(); return d && d >= week3Start && d < week2Start; })
            .reduce((s, r) => s + (r.miles || 0), 0);

          const avg3 = Math.round(((w1 + w2 + w3) / 3) * 10) / 10;
          threeWeekAvgMap[athlete.id] = avg3;

          // ── Zone 1+2 percentage ────────────────────────────────────────────
          try {
            const boundaries = teamZoneSettings?.boundaries || DEFAULT_ZONE_BOUNDARIES;
            const age = athlete.birthdate
              ? Math.floor((new Date() - new Date(athlete.birthdate)) / (365.25 * 86400000))
              : 16;
            const thirtyDaysAgo = new Date(now - 30 * 86400000);
            const recentRuns = allRuns.filter(r => {
              const d = r.date?.toDate?.();
              return d && d >= thirtyDaysAgo;
            });
            const breakdown = calcZoneBreakdownFromRuns(recentRuns, age, null, boundaries);
            if (breakdown) {
              const easyPct = breakdown
                .filter(z => z.zone <= 2)
                .reduce((s, z) => s + z.pct, 0);
              zonePctMap[athlete.id] = easyPct;
            }
          } catch { /* zone calc failed — skip */ }

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

      // Check if today's message already sent
      try {
        const today = new Date().toISOString().split('T')[0];
        const tipDoc = await getDoc(doc(db, 'dailyMessages', `${userData.schoolId}_${today}`));
        setTodayTipSent(tipDoc.exists());
      } catch { /* ignore */ }

    } catch (error) { console.error('Coach dashboard error:', error); }
    setLoading(false);
  }, [selectedTimeframe, userData.schoolId]);

  useEffect(() => {
    if (!calendarVisible && !addFromDashboard && !plannerVisible) loadDashboard();
  }, [selectedTimeframe, calendarVisible, addFromDashboard, plannerVisible]);

  // ── Sub-screen routing ────────────────────────────────────────────────────
  if (selectedAthlete) {
    return <AthleteDetailScreen
      athlete={selectedAthlete}
      school={school}
      teamZoneSettings={teamZoneSettings}
      onBack={() => setSelectedAthlete(null)}
    />;
  }
  if (zonesVisible) {
    return (
      <ZoneSettings
        school={school}
        schoolId={userData.schoolId}
        onClose={() => setZonesVisible(false)}
        onSaved={(newBoundaries) => {
          setTeamZoneSettings(prev => ({ ...prev, boundaries: newBoundaries }));
          setZonesVisible(false);
        }}
      />
    );
  }
  if (calendarVisible || addFromDashboard) {
    return (
      <CalendarScreen
        userData={userData} school={school}
        autoOpenAdd={addFromDashboard}
        onClose={() => { setCalendarVisible(false); setAddFromDashboard(false); }}
      />
    );
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

  if (feedVisible) {
    return (
      <TeamFeed
        userData={userData}
        school={school}
        onClose={() => setFeedVisible(false)}
      />
    );
  }

  if (libraryVisible) {
    return (
      <WorkoutLibrary
        school={school}
        schoolId={userData.schoolId}
        userData={userData}
        onClose={() => setLibraryVisible(false)}
        onAddToCalendar={(workout) => {
          setLibraryVisible(false);
          setAddFromDashboard(true);
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
        schoolId: userData.schoolId,
        message: tipText.trim(),
        sentBy: auth.currentUser.uid,
        sentByName: `Coach ${userData.lastName}`,
        date: today,
        sentAt: new Date(),
      });
      setTodayTipSent(true);
      setTipModalVisible(false);
      Alert.alert('Sent! ✅', 'Your message has been pinned to every athlete\'s dashboard.');
    } catch {
      Alert.alert('Error', 'Could not send message. Please try again.');
    }
    setSendingTip(false);
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color="#2e7d32" /></View>;

  const primaryColor  = school?.primaryColor || '#2e7d32';
  const isAdmin       = userData.coachRole === 'admin';
  const today         = new Date().toISOString().split('T')[0];
  const todayItems    = trainingItems.filter(item => item.date?.toDate?.()?.toISOString().split('T')[0] === today);
  const upcomingItems = trainingItems.filter(item => item.date?.toDate?.()?.toISOString().split('T')[0] > today).slice(0, 7);
  const activeSeason  = getActiveSeason(school);
  const currentPhase  = activeSeason ? getPhaseForSeason(activeSeason) : getPhaseForSeason(null);
  const alertCount    = Object.values(overtTrainingAlerts).filter(a => a.alert).length;
  const filteredAthletes = athletes.filter(a => genderFilter === 'all' || a.gender === genderFilter);

  // Team summary totals
  const teamWeeklyMiles = Math.round(
    filteredAthletes.reduce((s, a) => s + (athleteWeeklyMiles[a.id] || 0), 0) * 10
  ) / 10;
  const teamPeriodMiles = Math.round(
    filteredAthletes.reduce((s, a) => s + (athleteMiles[a.id] || 0), 0) * 10
  ) / 10;

  return (
    <View style={styles.container}>

      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: primaryColor }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>Coach {userData.lastName}</Text>
            <Text style={styles.schoolName}>{school?.name || 'XCTracker'}</Text>
          </View>
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.headerStats}>
          <View style={styles.headerStat}>
            <Text style={styles.headerStatNum}>{athletes.length}</Text>
            <Text style={styles.headerStatLabel}>Athletes</Text>
          </View>
          <View style={styles.headerStat}>
            <Text style={styles.headerStatNum}>{pendingAthletes.length}</Text>
            <Text style={styles.headerStatLabel}>Pending</Text>
          </View>
          {alertCount > 0 && (
            <View style={[styles.headerStat, styles.alertStatBox]}>
              <Text style={styles.alertStatNum}>⚠️ {alertCount}</Text>
              <Text style={styles.alertStatLabel}>Alerts</Text>
            </View>
          )}
          <View style={styles.headerStat}>
            <Text style={styles.headerStatNum}>{school?.joinCode || '--'}</Text>
            <Text style={styles.headerStatLabel}>Join Code</Text>
          </View>
        </View>
      </View>

      {/* ── Tabs ── */}
      <View style={styles.tabs}>
        {['team', 'training', isAdmin && 'pending'].filter(Boolean).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && { color: primaryColor }]}>
              {tab === 'team' ? 'Team' : tab === 'training' ? 'Training' : `Pending (${pendingAthletes.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 90 }}
      >

        {/* Daily message button — moved to top of scroll */}
        <View style={styles.msgRow}>
          <TouchableOpacity
            style={[styles.msgBtn, { backgroundColor: todayTipSent ? '#e8f5e9' : primaryColor }]}
            onPress={() => handleOpenTip(currentPhase)}
          >
            <Text style={[styles.msgBtnText, { color: todayTipSent ? '#2e7d32' : '#fff' }]}>
              {todayTipSent ? '✅ Message sent today' : '💬 Send daily message to team'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Team tab ── */}
        {activeTab === 'team' && (
          <View style={styles.section}>

            {/* Gender filter — top of content */}
            <View style={styles.genderRow}>
              {['all', 'boys', 'girls'].map(g => (
                <TouchableOpacity
                  key={g}
                  style={[styles.genderBtn, genderFilter === g && { backgroundColor: primaryColor, borderColor: primaryColor }]}
                  onPress={() => setGenderFilter(g)}
                >
                  <Text style={[styles.genderBtnText, genderFilter === g && { color: '#fff' }]}>
                    {g === 'all' ? 'All' : g === 'boys' ? 'Boys' : 'Girls'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Timeframe picker — right below gender */}
            <TimeframePicker
              selected={selectedTimeframe}
              onSelect={setSelectedTimeframe}
              activeSeason={activeSeasonData}
              primaryColor={primaryColor}
            />

            {filteredAthletes.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No approved athletes yet.</Text>
                <Text style={styles.emptySubText}>Share join code: {school?.joinCode}</Text>
              </View>
            ) : [...filteredAthletes]
                .sort((a, b) => (athleteMiles[b.id] || 0) - (athleteMiles[a.id] || 0))
                .map((athlete, index) => {
                  const overtrain   = overtTrainingAlerts[athlete.id];
                  const hasAlert    = overtrain?.alert;
                  const weekMiles   = athleteWeeklyMiles[athlete.id] || 0;
                  const avg3        = athlete3WeekAvg[athlete.id] || 0;
                  const mileageHigh = avg3 > 0 && weekMiles > avg3 * 1.20;
                  const zonePct     = athleteZonePct[athlete.id];
                  const zoneLow     = zonePct !== undefined && zonePct < 70;

                  return (
                    <TouchableOpacity
                      key={athlete.id}
                      style={[styles.athleteCard, hasAlert && styles.athleteCardAlert]}
                      onPress={() => setSelectedAthlete(athlete)}
                    >
                      {/* Top row — name + period miles */}
                      <View style={styles.athleteCardTop}>
                        <Text style={styles.rankNum}>#{index + 1}</Text>
                        <View style={[styles.avatar, { backgroundColor: hasAlert ? '#ef4444' : primaryColor }]}>
                          <Text style={styles.avatarText}>{athlete.firstName?.[0]}{athlete.lastName?.[0]}</Text>
                        </View>
                        <View style={styles.athleteInfo}>
                          <Text style={styles.athleteName}>{athlete.firstName} {athlete.lastName}</Text>
                          {hasAlert
                            ? <Text style={styles.alertText}>⚠️ {overtrain.signals[0]}</Text>
                            : <Text style={styles.athleteSub}>{selectedTimeframe.label}</Text>
                          }
                        </View>
                        <View style={styles.milesBox}>
                          <Text style={[styles.milesNum, { color: hasAlert ? '#ef4444' : primaryColor }]}>
                            {athleteMiles[athlete.id] ?? '—'}
                          </Text>
                          <Text style={styles.milesLabel}>miles</Text>
                        </View>
                        <Text style={styles.chevron}>›</Text>
                      </View>

                      {/* Bottom row — weekly miles + zone % */}
                      <View style={styles.athleteCardStats}>
                        {/* This week miles with 3-week avg indicator */}
                        <View style={styles.athleteStatChip}>
                          <Text style={styles.athleteStatChipLabel}>This week</Text>
                          <Text style={[
                            styles.athleteStatChipVal,
                            mileageHigh && styles.statValRed,
                          ]}>
                            {weekMiles} mi
                            {avg3 > 0 ? ` (avg ${avg3})` : ''}
                          </Text>
                          {mileageHigh && (
                            <Text style={styles.statFlagRed}>↑ High load</Text>
                          )}
                        </View>

                        {/* Zone 1+2 % */}
                        {zonePct !== undefined && (
                          <View style={styles.athleteStatChip}>
                            <Text style={styles.athleteStatChipLabel}>Z1+Z2 (30d)</Text>
                            <Text style={[
                              styles.athleteStatChipVal,
                              zoneLow && styles.statValRed,
                            ]}>
                              {zonePct}%
                            </Text>
                            {zoneLow && (
                              <Text style={styles.statFlagRed}>↑ Too intense</Text>
                            )}
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })
            }

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
        )}

        {/* ── Training tab ── */}
        {activeTab === 'training' && (
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
        )}

        {/* ── Pending tab ── */}
        {activeTab === 'pending' && isAdmin && (
          <View style={styles.section}>
            {pendingAthletes.length === 0 ? (
              <View style={styles.emptyCard}><Text style={styles.emptyText}>No pending requests.</Text></View>
            ) : pendingAthletes.map(athlete => (
              <View key={athlete.id} style={styles.pendingCard}>
                <View style={[styles.avatar, { backgroundColor: primaryColor }]}>
                  <Text style={styles.avatarText}>{athlete.firstName?.[0]}{athlete.lastName?.[0]}</Text>
                </View>
                <View style={styles.athleteInfo}>
                  <Text style={styles.athleteName}>{athlete.firstName} {athlete.lastName}</Text>
                  <Text style={styles.athleteSub}>{athlete.email}</Text>
                  {athlete.isMinor && <Text style={styles.minorTag}>Minor — parent consent required</Text>}
                </View>
                <View style={styles.approvalBtns}>
                  <TouchableOpacity style={[styles.approveBtn, { backgroundColor: primaryColor }]} onPress={() => handleApproveAthlete(athlete)}>
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.denyBtn} onPress={() => handleDenyAthlete(athlete)}>
                    <Text style={styles.denyBtnText}>Deny</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

      </ScrollView>

      {/* ── Bottom navigation bar ── */}
      <View style={[styles.bottomNav, { borderTopColor: `${primaryColor}30` }]}>
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => setCalendarVisible(true)}>
          <Text style={styles.bottomNavEmoji}>📅</Text>
          <Text style={styles.bottomNavLabel}>Calendar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => setAddFromDashboard(true)}>
          <View style={[styles.bottomNavPlus, { backgroundColor: primaryColor }]}>
            <Text style={styles.bottomNavPlusText}>+</Text>
          </View>
          <Text style={[styles.bottomNavLabel, { color: primaryColor }]}>Add workout</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => setLibraryVisible(true)}>
          <Text style={styles.bottomNavEmoji}>📚</Text>
          <Text style={styles.bottomNavLabel}>Library</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => setFeedVisible(true)}>
          <Text style={styles.bottomNavEmoji}>💬</Text>
          <Text style={styles.bottomNavLabel}>Feed</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavBtn} onPress={() => setZonesVisible(true)}>
          <Text style={styles.bottomNavEmoji}>❤️</Text>
          <Text style={styles.bottomNavLabel}>Zones</Text>
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
                style={[styles.tipSendBtn, { backgroundColor: tipText.trim() ? primaryColor : '#ccc' }]}
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
  container:            { flex: 1, backgroundColor: '#f5f5f5' },
  loading:              { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:               { paddingTop: 60, paddingBottom: 12, paddingHorizontal: 20 },
  headerTop:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  greeting:             { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  schoolName:           { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  signOutBtn:           { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8 },
  signOutText:          { color: '#fff', fontSize: 13 },
  headerStats:          { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerStat:           { alignItems: 'center' },
  headerStatNum:        { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  headerStatLabel:      { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  alertStatBox:         { backgroundColor: 'rgba(239,68,68,0.3)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  alertStatNum:         { fontSize: 16, fontWeight: 'bold', color: '#fff' },
  alertStatLabel:       { fontSize: 10, color: 'rgba(255,255,255,0.9)', marginTop: 1 },
  tabs:                 { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  tab:                  { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabActive:            { borderBottomWidth: 2, borderBottomColor: '#2e7d32' },
  tabText:              { fontSize: 14, fontWeight: '600', color: '#999' },
  scroll:               { flex: 1 },
  msgRow:               { paddingHorizontal: 16, marginTop: 12, marginBottom: 4 },
  msgBtn:               { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
  msgBtnText:           { fontSize: 13, fontWeight: '700' },
  section:              { padding: 16 },
  genderRow:            { flexDirection: 'row', gap: 8, marginBottom: 12 },
  genderBtn:            { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#ddd' },
  genderBtnText:        { fontSize: 14, fontWeight: '600', color: '#666' },
  emptyCard:            { backgroundColor: '#fff', borderRadius: 12, padding: 20, alignItems: 'center', gap: 10 },
  emptyText:            { color: '#999', fontSize: 14, textAlign: 'center' },
  emptySubText:         { color: '#bbb', fontSize: 13 },
  addBtn:               { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  addBtnText:           { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Athlete card — two-row layout
  athleteCard:          { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10 },
  athleteCardAlert:     { borderWidth: 1.5, borderColor: '#ef4444', backgroundColor: '#fff5f5' },
  athleteCardTop:       { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  athleteCardStats:     { flexDirection: 'row', gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f5f5f5' },
  athleteStatChip:      { flex: 1, backgroundColor: '#f9f9f9', borderRadius: 8, padding: 8 },
  athleteStatChipLabel: { fontSize: 11, color: '#999', marginBottom: 2 },
  athleteStatChipVal:   { fontSize: 14, fontWeight: '700', color: '#333' },
  statValRed:           { color: '#dc2626' },
  statFlagRed:          { fontSize: 11, color: '#dc2626', fontWeight: '600', marginTop: 2 },

  rankNum:              { fontSize: 14, fontWeight: '700', color: '#999', width: 24 },
  avatar:               { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText:           { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  athleteInfo:          { flex: 1 },
  athleteName:          { fontSize: 15, fontWeight: '700', color: '#333' },
  athleteSub:           { fontSize: 12, color: '#999', marginTop: 2 },
  alertText:            { fontSize: 12, color: '#ef4444', marginTop: 2, fontWeight: '600' },
  milesBox:             { alignItems: 'center' },
  milesNum:             { fontSize: 20, fontWeight: 'bold' },
  milesLabel:           { fontSize: 11, color: '#999' },
  chevron:              { fontSize: 22, color: '#ccc' },

  alertSection:         { marginTop: 8 },
  alertSectionTitle:    { fontSize: 15, fontWeight: '700', color: '#ef4444', marginBottom: 10 },
  alertCard:            { backgroundColor: '#fff5f5', borderRadius: 12, padding: 14, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#ef4444' },
  alertAthleteName:     { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 6 },
  alertSignal:          { fontSize: 13, color: '#ef4444', marginBottom: 3 },
  alertRec:             { fontSize: 12, color: '#666', marginTop: 8, fontStyle: 'italic' },

  todaySection:         { marginBottom: 24 },
  todayLabel:           { fontSize: 11, fontWeight: '700', color: '#999', letterSpacing: 1, marginBottom: 10 },
  todayCard:            { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderLeftWidth: 4, marginBottom: 8 },
  upcomingSection:      { marginBottom: 16 },
  upcomingHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  upcomingSectionTitle: { fontSize: 16, fontWeight: '700', color: '#333' },
  typeBadge:            { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 8 },
  typeBadgeText:        { color: '#fff', fontSize: 11, fontWeight: '700' },
  trainingCard:         { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  trainingInfo:         { flex: 1 },
  trainingTitle:        { fontSize: 15, fontWeight: '700', color: '#333' },
  trainingDesc:         { fontSize: 13, color: '#666', marginTop: 2 },
  trainingNotes:        { fontSize: 13, color: '#888', marginTop: 4, fontStyle: 'italic' },
  trainingDate:         { fontSize: 12, color: '#999', marginTop: 4 },
  pendingCard:          { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, gap: 10 },
  minorTag:             { fontSize: 11, color: '#f59e0b', marginTop: 4, fontWeight: '600' },
  approvalBtns:         { flexDirection: 'row', gap: 8 },
  approveBtn:           { flex: 1, borderRadius: 8, padding: 10, alignItems: 'center' },
  approveBtnText:       { color: '#fff', fontWeight: '700' },
  denyBtn:              { flex: 1, borderRadius: 8, padding: 10, alignItems: 'center', backgroundColor: '#fee2e2' },
  denyBtnText:          { color: '#dc2626', fontWeight: '700' },

  // Bottom nav
  bottomNav:            { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, paddingBottom: Platform.OS === 'ios' ? 24 : 8, paddingTop: 10 },
  bottomNavBtn:         { flex: 1, alignItems: 'center', gap: 3 },
  bottomNavPlus:        { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  bottomNavPlusText:    { color: '#fff', fontSize: 24, fontWeight: '300', lineHeight: 32 },
  bottomNavEmoji:       { fontSize: 24, lineHeight: 32 },
  bottomNavLabel:       { fontSize: 11, color: '#888', fontWeight: '500' },

  // Daily message modal
  tipModal:             { flex: 1, backgroundColor: '#f5f5f5' },
  tipModalHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  tipModalTitle:        { fontSize: 18, fontWeight: 'bold', color: '#333' },
  tipModalCancel:       { color: '#dc2626', fontSize: 16, width: 60 },
  tipModalBody:         { padding: 20 },
  tipModalSubtitle:     { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 16 },
  tipModalInput:        { backgroundColor: '#fff', borderRadius: 12, padding: 16, fontSize: 16, color: '#333', borderWidth: 1, borderColor: '#ddd', minHeight: 180, textAlignVertical: 'top', lineHeight: 24, marginBottom: 12 },
  tipModalHint:         { fontSize: 12, color: '#999', marginBottom: 24, lineHeight: 18 },
  tipSendBtn:           { borderRadius: 12, padding: 18, alignItems: 'center', marginBottom: 40 },
  tipSendBtnText:       { color: '#fff', fontSize: 17, fontWeight: 'bold' },
});