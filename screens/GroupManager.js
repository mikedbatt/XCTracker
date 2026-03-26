import { Ionicons } from '@expo/vector-icons';
import {
  addDoc, collection, deleteDoc, doc, getDocs, orderBy,
  query, serverTimestamp, updateDoc, where,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActionSheetIOS, ActivityIndicator, Alert, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';
import { BRAND, BRAND_DARK, FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE, STATUS } from '../constants/design';
import { SPORT_PHASES } from './SeasonPlanner';

// Generate a weekly volume plan from season dates + peak mileage
export function generateVolumeCurve(season, peakMiles) {
  const sport = season.sport || 'cross_country';
  const phases = SPORT_PHASES[sport] || SPORT_PHASES.cross_country;
  const start = new Date(season.seasonStart);
  const champ = new Date(season.championshipDate);
  const totalDays = (champ - start) / 86400000;
  if (totalDays <= 0) return {};

  // Find first Monday on or before season start
  const startDay = start.getDay();
  const firstMonday = new Date(start);
  firstMonday.setDate(start.getDate() - (startDay === 0 ? 6 : startDay - 1));
  firstMonday.setHours(0, 0, 0, 0);

  const plan = {};
  const mon = new Date(firstMonday);

  while (mon <= champ) {
    const midWeek = new Date(mon);
    midWeek.setDate(mon.getDate() + 3);
    const elapsed = (midWeek - start) / 86400000;
    const pct = Math.max(0, Math.min(elapsed / totalDays, 1));

    const phase = phases.find(p => pct >= p.pct[0] && pct < p.pct[1]) || phases[phases.length - 1];
    const phaseProgress = phase.pct[1] > phase.pct[0] ? (pct - phase.pct[0]) / (phase.pct[1] - phase.pct[0]) : 0;

    let targetPct;
    if (phase.name.includes('Base') || phase.name === 'Summer Base') {
      targetPct = 0.60 + phaseProgress * 0.25;
    } else if (phase.name === 'Build') {
      targetPct = 0.85 + phaseProgress * 0.15;
    } else if (phase.name === 'Competition') {
      targetPct = 0.92 - phaseProgress * 0.02;
    } else if (phase.name === 'Peak') {
      targetPct = 0.90 - phaseProgress * 0.05;
    } else if (phase.name === 'Taper') {
      targetPct = 0.70 - phaseProgress * 0.10;
    } else {
      targetPct = 0.75;
    }

    const mondayISO = mon.toISOString().split('T')[0];
    let target = Math.round(peakMiles * targetPct); // whole miles

    // 10% rule: no week increases more than 10% over previous
    const prevMon = new Date(mon);
    prevMon.setDate(prevMon.getDate() - 7);
    const prevISO = prevMon.toISOString().split('T')[0];
    if (plan[prevISO] && target > Math.round(plan[prevISO] * 1.10)) {
      target = Math.round(plan[prevISO] * 1.10);
    }

    plan[mondayISO] = target;
    mon.setDate(mon.getDate() + 7);
  }

  return plan;
}

export default function GroupManager({ schoolId, athletes, activeSeason, onClose }) {
  const [groups,       setGroups]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [newGroupName, setNewGroupName] = useState('');
  const [athleteStats, setAthleteStats] = useState({});
  const [activeTab,    setActiveTab]    = useState('groups');

  const primaryColor = '#213f96';

  useEffect(() => {
    loadGroups();
    loadAthleteStats();
  }, []);

  // ── Load groups ──────────────────────────────────────────────────────────
  const loadGroups = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'groups'),
        where('schoolId', '==', schoolId)
      ));
      const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      loaded.sort((a, b) => (a.order || 0) - (b.order || 0));
      setGroups(loaded);
    } catch (e) { console.warn('Failed to load groups:', e); }
    setLoading(false);
  };

  // ── Load 3-week avg and last month miles per athlete ─────────────────────
  const loadAthleteStats = async () => {
    const stats = {};
    const now = new Date();
    const threeWeeksAgo = new Date(now);
    threeWeeksAgo.setDate(now.getDate() - 21);
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setDate(now.getDate() - 30);

    // Current week start (Monday)
    const day = now.getDay();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    weekStart.setHours(0, 0, 0, 0);
    const week1Start = new Date(weekStart);
    const week2Start = new Date(weekStart); week2Start.setDate(weekStart.getDate() - 7);
    const week3Start = new Date(weekStart); week3Start.setDate(weekStart.getDate() - 14);

    for (const athlete of athletes) {
      try {
        const runsSnap = await getDocs(query(
          collection(db, 'runs'),
          where('userId', '==', athlete.id),
          orderBy('date', 'desc')
        ));
        const runs = runsSnap.docs.map(d => ({ ...d.data(), date: d.data().date?.toDate?.() }));

        // 3-week average
        const w1 = runs.filter(r => r.date && r.date >= week1Start).reduce((s, r) => s + (r.miles || 0), 0);
        const w2 = runs.filter(r => r.date && r.date >= week2Start && r.date < week1Start).reduce((s, r) => s + (r.miles || 0), 0);
        const w3 = runs.filter(r => r.date && r.date >= week3Start && r.date < week2Start).reduce((s, r) => s + (r.miles || 0), 0);
        const avg3 = Math.round(((w1 + w2 + w3) / 3) * 10) / 10;

        // Last 30 days total
        const last30 = runs.filter(r => r.date && r.date >= oneMonthAgo).reduce((s, r) => s + (r.miles || 0), 0);

        stats[athlete.id] = {
          avg3wk: avg3,
          last30: Math.round(last30 * 10) / 10,
        };
      } catch (e) {
        stats[athlete.id] = { avg3wk: 0, last30: 0 };
      }
    }
    setAthleteStats(stats);
  };

  // ── Create group ─────────────────────────────────────────────────────────
  const handleAddGroup = async () => {
    const name = newGroupName.trim();
    if (!name) { Alert.alert('Name required', 'Please enter a group name.'); return; }
    try {
      await addDoc(collection(db, 'groups'), {
        schoolId,
        name,
        weeklyMilesTarget: null,
        order: groups.length,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser.uid,
      });
      setNewGroupName('');
      await loadGroups();
    } catch (e) { console.warn('Create group error:', e); Alert.alert('Error', 'Could not create group: ' + e.message); }
  };

  // ── Update group name or target ──────────────────────────────────────────
  const handleUpdateGroup = async (groupId, updates) => {
    try {
      await updateDoc(doc(db, 'groups', groupId), updates);
      setGroups(prev => prev.map(g => g.id === groupId ? { ...g, ...updates } : g));
    } catch (e) { console.warn('Failed to update group:', e); }
  };

  // ── Delete group ─────────────────────────────────────────────────────────
  const handleDeleteGroup = (group) => {
    const count = athletes.filter(a => a.groupId === group.id).length;
    Alert.alert(
      `Delete "${group.name}"?`,
      count > 0 ? `${count} athlete(s) will become unassigned.` : 'This group has no athletes.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            // Unassign athletes in this group
            const inGroup = athletes.filter(a => a.groupId === group.id);
            for (const a of inGroup) {
              await updateDoc(doc(db, 'users', a.id), { groupId: null });
            }
            await deleteDoc(doc(db, 'groups', group.id));
            await loadGroups();
          } catch (e) { Alert.alert('Error', 'Could not delete group.'); }
        }},
      ]
    );
  };

  // ── Assign athlete to group ──────────────────────────────────────────────
  const handleAssignAthlete = (athlete) => {
    const options = [...groups.map(g => g.name), 'Unassigned', 'Cancel'];
    const cancelIndex = options.length - 1;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIndex, title: `${athlete.firstName} ${athlete.lastName}` },
        async (index) => {
          if (index === cancelIndex) return;
          const groupId = index < groups.length ? groups[index].id : null;
          await updateDoc(doc(db, 'users', athlete.id), { groupId });
          // Update local state
          athlete.groupId = groupId;
          setGroups([...groups]); // trigger re-render
        }
      );
    } else {
      // Android fallback — use Alert
      Alert.alert(
        `${athlete.firstName} ${athlete.lastName}`,
        'Assign to group:',
        [
          ...groups.map(g => ({
            text: g.name,
            onPress: async () => {
              await updateDoc(doc(db, 'users', athlete.id), { groupId: g.id });
              athlete.groupId = g.id;
              setGroups([...groups]);
            },
          })),
          { text: 'Unassigned', onPress: async () => {
            await updateDoc(doc(db, 'users', athlete.id), { groupId: null });
            athlete.groupId = null;
            setGroups([...groups]);
          }},
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  };

  const getGroupName = (groupId) => {
    if (!groupId) return 'Unassigned';
    return groups.find(g => g.id === groupId)?.name || 'Unassigned';
  };

  // Sort athletes by 3-week avg descending
  const sortedAthletes = [...athletes].sort((a, b) =>
    (athleteStats[b.id]?.avg3wk || 0) - (athleteStats[a.id]?.avg3wk || 0)
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={BRAND_DARK} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Training Groups</Text>
          <View style={{ width: 60 }} />
        </View>
        <ActivityIndicator style={{ marginTop: 40 }} color={primaryColor} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={BRAND_DARK} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Training Groups</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {[{ key: 'groups', label: 'Groups' }, { key: 'assign', label: 'Assign' }, { key: 'volume', label: 'Volume Plan' }].map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, activeTab === t.key && { borderBottomColor: primaryColor, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(t.key)}
          >
            <Text style={[styles.tabText, activeTab === t.key && { color: primaryColor, fontWeight: '700' }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Groups tab ── */}
        {activeTab === 'groups' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Groups</Text>
          <View style={styles.addRow}>
            <TextInput
              style={styles.addInput}
              value={newGroupName}
              onChangeText={setNewGroupName}
              placeholder="New group name..."
              placeholderTextColor="#9CA3AF"
            />
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: primaryColor }]} onPress={handleAddGroup}>
              <Text style={styles.addBtnText}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {/* ── Groups list ── */}
          {groups.length === 0 ? (
            <Text style={styles.emptyText}>No groups yet. Create one above.</Text>
          ) : groups.map(group => {
            const inGroup = athletes.filter(a => a.groupId === group.id);
            const count = inGroup.length;
            const groupAvg = count > 0
              ? Math.round(inGroup.reduce((s, a) => s + (athleteStats[a.id]?.avg3wk || 0), 0) / count * 10) / 10
              : 0;
            return (
              <View key={group.id} style={styles.groupCard}>
                <View style={styles.groupCardTop}>
                  <View style={styles.groupInfo}>
                    <TextInput
                      style={styles.groupNameInput}
                      value={group.name}
                      onChangeText={(text) => setGroups(prev => prev.map(g => g.id === group.id ? { ...g, name: text } : g))}
                      onBlur={() => handleUpdateGroup(group.id, { name: group.name })}
                    />
                    <Text style={styles.groupCount}>{count} athlete{count !== 1 ? 's' : ''}  ·  avg {groupAvg} mi/wk</Text>
                  </View>
                  <View style={styles.targetRow}>
                    <View style={styles.targetBox}>
                      <Text style={styles.targetHint}>Weekly</Text>
                      <TextInput
                        style={styles.targetInput}
                        value={group.weeklyMilesTarget != null ? String(group.weeklyMilesTarget) : ''}
                        onChangeText={(text) => {
                          const num = text === '' ? null : parseFloat(text);
                          setGroups(prev => prev.map(g => g.id === group.id ? { ...g, weeklyMilesTarget: num } : g));
                        }}
                        onBlur={() => handleUpdateGroup(group.id, { weeklyMilesTarget: group.weeklyMilesTarget })}
                        placeholder="—"
                        placeholderTextColor="#ccc"
                        keyboardType="decimal-pad"
                        maxLength={5}
                      />
                      <Text style={styles.targetLabel}>mi/wk</Text>
                    </View>
                    <View style={styles.targetBox}>
                      <Text style={styles.targetHint}>Peak</Text>
                      <TextInput
                        style={styles.targetInput}
                        value={group.peakWeeklyMiles != null ? String(group.peakWeeklyMiles) : ''}
                        onChangeText={(text) => {
                          const num = text === '' ? null : parseInt(text);
                          setGroups(prev => prev.map(g => g.id === group.id ? { ...g, peakWeeklyMiles: num } : g));
                        }}
                        onBlur={() => handleUpdateGroup(group.id, { peakWeeklyMiles: group.peakWeeklyMiles })}
                        placeholder="—"
                        placeholderTextColor="#ccc"
                        keyboardType="number-pad"
                        maxLength={3}
                      />
                      <Text style={styles.targetLabel}>champ wk</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => handleDeleteGroup(group)} style={styles.deleteBtn}>
                    <Text style={styles.deleteBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
        )}

        {/* ── Assign tab ── */}
        {activeTab === 'assign' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Assign Athletes</Text>
          <Text style={styles.sectionHint}>Sorted by 3-week average miles. Tap an athlete to assign.</Text>

          {sortedAthletes.map(athlete => {
            const stats = athleteStats[athlete.id] || { avg3wk: 0, last30: 0 };
            const groupName = getGroupName(athlete.groupId);
            const isAssigned = !!athlete.groupId;

            return (
              <TouchableOpacity
                key={athlete.id}
                style={styles.athleteRow}
                onPress={() => handleAssignAthlete(athlete)}
              >
                <View style={styles.athleteInfo}>
                  <Text style={styles.athleteName}>{athlete.firstName} {athlete.lastName}</Text>
                  <Text style={styles.athleteStats}>
                    {stats.avg3wk} mi/wk avg  ·  {stats.last30} mi last 30d
                  </Text>
                </View>
                <View style={[styles.groupBadge, isAssigned && { backgroundColor: primaryColor + '15', borderColor: primaryColor }]}>
                  <Text style={[styles.groupBadgeText, isAssigned && { color: primaryColor }]}>{groupName}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        )}

        {/* ── Volume Plan tab ── */}
        {activeTab === 'volume' && (() => {
          if (!activeSeason?.seasonStart || !activeSeason?.championshipDate) {
            return (
              <View style={styles.section}>
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyCardTitle}>No active season</Text>
                  <Text style={styles.emptyCardText}>Set up a season in Season Planner to plan weekly volumes.</Text>
                </View>
              </View>
            );
          }
          if (groups.length === 0) {
            return (
              <View style={styles.section}>
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyCardTitle}>No groups yet</Text>
                  <Text style={styles.emptyCardText}>Create groups in the Groups tab first.</Text>
                </View>
              </View>
            );
          }

          const groupsWithPeak = groups.filter(g => g.peakWeeklyMiles > 0);
          const handleGenerateCurve = async () => {
            if (groupsWithPeak.length === 0) {
              Alert.alert('Set peak mileage', 'Set a championship week peak for at least one group on the Groups tab first.');
              return;
            }
            Alert.alert('Generate Volume Plan?', `Auto-fill weekly targets for ${groupsWithPeak.length} group${groupsWithPeak.length > 1 ? 's' : ''} based on peak mileage and training phases.`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Generate', onPress: async () => {
                for (const g of groupsWithPeak) {
                  const curve = generateVolumeCurve(activeSeason, g.peakWeeklyMiles);
                  await updateDoc(doc(db, 'groups', g.id), { weeklyPlan: curve });
                  setGroups(prev => prev.map(gr => gr.id === g.id ? { ...gr, weeklyPlan: curve } : gr));
                }
                Alert.alert('Done', `Volume plan generated for ${groupsWithPeak.length} group${groupsWithPeak.length > 1 ? 's' : ''}.`);
              }},
            ]);
          };

          // Generate weeks from season start through championship
          const seasonStart = new Date(activeSeason.seasonStart);
          const champDate = new Date(activeSeason.championshipDate);
          // Find the Monday of or before season start
          const startDay = seasonStart.getDay();
          const firstMonday = new Date(seasonStart);
          firstMonday.setDate(seasonStart.getDate() - (startDay === 0 ? 6 : startDay - 1));
          firstMonday.setHours(0, 0, 0, 0);

          const weeks = [];
          let mon = new Date(firstMonday);
          while (mon <= champDate) {
            weeks.push(new Date(mon));
            mon.setDate(mon.getDate() + 7);
          }

          const getMondayISO = (d) => d.toISOString().split('T')[0];
          const now = new Date();
          const currentMondayDay = now.getDay();
          const currentMonday = new Date(now);
          currentMonday.setDate(now.getDate() - (currentMondayDay === 0 ? 6 : currentMondayDay - 1));
          const currentMondayISO = currentMonday.toISOString().split('T')[0];

          const handleVolumeSave = async (groupId, weekISO, value) => {
            const group = groups.find(g => g.id === groupId);
            if (!group) return;
            const plan = { ...(group.weeklyPlan || {}) };
            if (value === '' || value == null) {
              delete plan[weekISO];
            } else {
              plan[weekISO] = parseFloat(value);
            }
            try {
              await updateDoc(doc(db, 'groups', groupId), { weeklyPlan: plan });
              setGroups(prev => prev.map(g => g.id === groupId ? { ...g, weeklyPlan: plan } : g));
            } catch (e) { console.warn('Failed to save volume plan:', e); }
          };

          return (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Weekly Volume Targets</Text>
              <Text style={styles.sectionHint}>Set target miles per week for each group across the season.</Text>

              {groupsWithPeak.length > 0 && (
                <TouchableOpacity style={styles.generateBtn} onPress={handleGenerateCurve}>
                  <Ionicons name="sparkles-outline" size={18} color={BRAND} />
                  <Text style={styles.generateBtnText}>Generate volume plan from peak mileage</Text>
                </TouchableOpacity>
              )}

              {weeks.map((weekMon, wi) => {
                const weekISO = getMondayISO(weekMon);
                const weekLabel = weekMon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const isCurrent = weekISO === currentMondayISO;
                const isPast = weekMon < currentMonday && !isCurrent;
                return (
                  <View key={weekISO} style={[styles.volumeWeek, isCurrent && { backgroundColor: primaryColor + '08', borderColor: primaryColor, borderWidth: 1 }]}>
                    <Text style={[styles.volumeWeekLabel, isCurrent && { color: primaryColor, fontWeight: '700' }]}>
                      Wk {wi + 1} · {weekLabel}{isCurrent ? '  ← this week' : ''}
                    </Text>
                    <View style={styles.volumeGroupRow}>
                      {groups.map(g => {
                        const planVal = g.weeklyPlan?.[weekISO];
                        const displayVal = planVal != null ? String(planVal) : '';
                        return (
                          <View key={g.id} style={styles.volumeCell}>
                            <Text style={styles.volumeCellLabel}>{g.name}</Text>
                            <TextInput
                              style={[styles.volumeCellInput, isPast && { opacity: 0.5 }]}
                              value={displayVal}
                              onChangeText={(text) => {
                                const num = text === '' ? null : parseFloat(text);
                                setGroups(prev => prev.map(gr => {
                                  if (gr.id !== g.id) return gr;
                                  const plan = { ...(gr.weeklyPlan || {}) };
                                  if (num == null || isNaN(num)) delete plan[weekISO]; else plan[weekISO] = num;
                                  return { ...gr, weeklyPlan: plan };
                                }));
                              }}
                              onBlur={() => handleVolumeSave(g.id, weekISO, g.weeklyPlan?.[weekISO])}
                              placeholder={g.weeklyMilesTarget ? String(g.weeklyMilesTarget) : '—'}
                              placeholderTextColor="#ccc"
                              keyboardType="decimal-pad"
                              maxLength={5}
                            />
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })()}

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Tabs
  tabRow:          { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  tab:             { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText:         { fontSize: 13, color: '#6B7280' },
  // Empty state cards
  emptyCard:       { backgroundColor: '#fff', borderRadius: 14, padding: 24, alignItems: 'center' },
  emptyCardTitle:  { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 6 },
  emptyCardText:   { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },
  // Volume plan
  volumeWeek:      { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8 },
  volumeWeekLabel: { fontSize: 13, fontWeight: '600', color: '#6B7280', marginBottom: 8 },
  volumeGroupRow:  { flexDirection: 'row', gap: 10 },
  volumeCell:      { flex: 1, alignItems: 'center' },
  volumeCellLabel: { fontSize: 11, color: '#9CA3AF', marginBottom: 4 },
  volumeCellInput: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 6, width: '100%', textAlign: 'center', fontSize: 15, fontWeight: '600', backgroundColor: '#f9f9f9', color: '#111827' },
  container:       { flex: 1, backgroundColor: '#F5F6FA' },
  header:          { backgroundColor: '#fff', paddingTop: Platform.OS === 'ios' ? 56 : 32, paddingBottom: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn:         { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
  backText:        { color: '#111827', fontSize: 15, fontWeight: '600' },
  headerTitle:     { fontSize: 20, fontWeight: '700', color: '#111827' },
  scroll:          { flex: 1 },
  section:         { padding: 16 },
  sectionTitle:    { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 10 },
  sectionHint:     { fontSize: 12, color: '#9CA3AF', marginBottom: 12 },
  generateBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#e8edf8', borderRadius: 10, padding: 12, marginBottom: 16 },
  generateBtnText: { fontSize: 14, fontWeight: '600', color: BRAND },
  emptyText:       { fontSize: 14, color: '#9CA3AF', textAlign: 'center', paddingVertical: 20 },

  // Add group
  addRow:          { flexDirection: 'row', gap: 10, marginBottom: 14 },
  addInput:        { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 12, fontSize: 15, borderWidth: 1, borderColor: '#E5E7EB', color: '#111827' },
  addBtn:          { borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  addBtnText:      { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Group card
  groupCard:       { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8 },
  groupCardTop:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupInfo:       { flex: 1 },
  groupNameInput:  { fontSize: 15, fontWeight: '700', color: '#111827', padding: 0 },
  groupCount:      { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  targetRow:       { flexDirection: 'row', gap: 8 },
  targetBox:       { alignItems: 'center', gap: 2 },
  targetHint:      { fontSize: 9, color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase' },
  targetInput:     { fontSize: 15, fontWeight: '600', color: '#111827', textAlign: 'right', width: 45, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', padding: 2 },
  targetLabel:     { fontSize: 12, color: '#9CA3AF' },
  deleteBtn:       { padding: 8 },
  deleteBtnText:   { fontSize: 16, color: '#dc2626', fontWeight: '600' },

  // Athlete rows
  athleteRow:      { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 10 },
  athleteInfo:     { flex: 1 },
  athleteName:     { fontSize: 14, fontWeight: '600', color: '#111827' },
  athleteStats:    { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  groupBadge:      { borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#f9f9f9' },
  groupBadgeText:  { fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
});
