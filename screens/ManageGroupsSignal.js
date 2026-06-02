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
import {
  BRAND, BRAND_ACCENT, BRAND_DARK, FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SIGNAL, SPACE,
} from '../constants/design';
import { batchDocsByIds } from '../utils/batchDocsByIds';
import { formatPace } from '../utils/vdotUtils';

export default function ManageGroupsSignal({ schoolId, athletes, onClose }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newGroupName, setNewGroupName] = useState('');
  const [athleteStats, setAthleteStats] = useState({});
  const [activeTab, setActiveTab] = useState('groups');
  const [sortBy, setSortBy] = useState('volume');

  useEffect(() => {
    loadGroups();
    loadAthleteStats();
  }, []);

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

  const loadAthleteStats = async () => {
    const stats = {};
    const now = new Date();
    const day = now.getDay();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    weekStart.setHours(0, 0, 0, 0);
    const week1Start = new Date(weekStart);
    const week2Start = new Date(weekStart); week2Start.setDate(weekStart.getDate() - 7);
    const week3Start = new Date(weekStart); week3Start.setDate(weekStart.getDate() - 14);
    const oneMonthAgo = new Date(now); oneMonthAgo.setDate(now.getDate() - 30);

    // One batched query for every athlete's runs (30 IDs per batch, in parallel)
    // replaces the old per-athlete serial loop.
    const athleteIds = athletes.map(a => a.id);
    let runsByAthlete = {};
    try {
      const result = await batchDocsByIds({
        collectionName: 'runs',
        field: 'userId',
        ids: athleteIds,
      });
      runsByAthlete = result.byField;
    } catch (e) {
      console.warn('Failed to batch-load athlete stats:', e);
    }

    for (const athlete of athletes) {
      const rawRuns = runsByAthlete[athlete.id] || [];
      const runs = rawRuns.map(r => ({ ...r, date: r.date?.toDate?.() }));
      const w1 = runs.filter(r => r.date && r.date >= week1Start).reduce((s, r) => s + (r.miles || 0), 0);
      const w2 = runs.filter(r => r.date && r.date >= week2Start && r.date < week1Start).reduce((s, r) => s + (r.miles || 0), 0);
      const w3 = runs.filter(r => r.date && r.date >= week3Start && r.date < week2Start).reduce((s, r) => s + (r.miles || 0), 0);
      const avg3 = Math.round(((w1 + w2 + w3) / 3) * 10) / 10;
      const last30 = runs.filter(r => r.date && r.date >= oneMonthAgo).reduce((s, r) => s + (r.miles || 0), 0);
      stats[athlete.id] = { avg3wk: avg3, last30: Math.round(last30 * 10) / 10 };
    }
    setAthleteStats(stats);
  };

  const handleAddGroup = async () => {
    const name = newGroupName.trim();
    if (!name) { Alert.alert('Name required', 'Please enter a group name.'); return; }
    try {
      await addDoc(collection(db, 'groups'), {
        schoolId,
        name,
        order: groups.length,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser.uid,
      });
      setNewGroupName('');
      await loadGroups();
    } catch (e) { console.warn('Create group error:', e); Alert.alert('Error', 'Could not create group: ' + e.message); }
  };

  const handleUpdateGroup = async (groupId, updates) => {
    try {
      await updateDoc(doc(db, 'groups', groupId), updates);
      setGroups(prev => prev.map(g => g.id === groupId ? { ...g, ...updates } : g));
    } catch (e) { console.warn('Failed to update group:', e); }
  };

  const handleDeleteGroup = (group) => {
    const count = athletes.filter(a => a.groupId === group.id).length;
    Alert.alert(
      `Delete "${group.name}"?`,
      count > 0 ? `${count} athlete(s) will become unassigned.` : 'This group has no athletes.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            const inGroup = athletes.filter(a => a.groupId === group.id);
            for (const a of inGroup) {
              await updateDoc(doc(db, 'users', a.id), { groupId: null });
            }
            await deleteDoc(doc(db, 'groups', group.id));
            await loadGroups();
          } catch { Alert.alert('Error', 'Could not delete group.'); }
        }},
      ]
    );
  };

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
          athlete.groupId = groupId;
          setGroups([...groups]);
        }
      );
    } else {
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

  const sortedAthletes = [...athletes].sort((a, b) => {
    if (sortBy === 'vdot') {
      const aV = a.vdot || 0;
      const bV = b.vdot || 0;
      if (aV !== bV) return bV - aV;
    }
    return (athleteStats[b.id]?.avg3wk || 0) - (athleteStats[a.id]?.avg3wk || 0);
  });

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={SIGNAL.color.indigo} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Groups</Text>
          <View style={{ width: 60 }} />
        </View>
        <ActivityIndicator style={{ marginTop: 40 }} color={SIGNAL.color.indigo} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={SIGNAL.color.indigo} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Groups</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.tabRow}>
        {[{ key: 'groups', label: 'Groups' }, { key: 'assign', label: 'Assign' }].map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, activeTab === t.key && styles.tabActive]}
            onPress={() => setActiveTab(t.key)}
          >
            <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {activeTab === 'groups' && (
          <View style={styles.section}>
            <Text style={styles.eyebrow}>Training groups</Text>
            <Text style={styles.sectionTitle}>Groups</Text>

            <View style={styles.card}>
              <View style={styles.addRow}>
                <TextInput
                  style={styles.addInput}
                  value={newGroupName}
                  onChangeText={setNewGroupName}
                  placeholder="New group name..."
                  placeholderTextColor={SIGNAL.color.mute2}
                />
                <TouchableOpacity style={styles.addBtn} onPress={handleAddGroup}>
                  <Text style={styles.addBtnText}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>

            {groups.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.emptyText}>No groups yet. Create one above.</Text>
              </View>
            ) : groups.map(group => {
              const inGroup = athletes.filter(a => a.groupId === group.id);
              const count = inGroup.length;
              const groupAvg = count > 0
                ? Math.round(inGroup.reduce((s, a) => s + (athleteStats[a.id]?.avg3wk || 0), 0) / count * 10) / 10
                : 0;
              const vdotAthletes = inGroup.filter(a => a.vdot);
              const vdotMin = vdotAthletes.length > 0 ? Math.round(Math.min(...vdotAthletes.map(a => a.vdot)) * 10) / 10 : null;
              const vdotMax = vdotAthletes.length > 0 ? Math.round(Math.max(...vdotAthletes.map(a => a.vdot)) * 10) / 10 : null;
              const vdotLabel = vdotMin != null
                ? vdotMin === vdotMax ? `VDOT ${vdotMin}` : `VDOT ${vdotMin}–${vdotMax}`
                : null;
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
                      <Text style={styles.groupCount}>
                        {count} athlete{count !== 1 ? 's' : ''}  ·  avg {groupAvg} mi/wk{vdotLabel ? `  ·  ${vdotLabel}` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => handleDeleteGroup(group)} style={styles.deleteBtn}>
                      <Ionicons name="trash-outline" size={18} color={SIGNAL.color.coral} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {activeTab === 'assign' && (
          <View style={styles.section}>
            <Text style={styles.eyebrow}>Roster assignment</Text>
            <Text style={styles.sectionTitle}>Assign athletes</Text>
            <Text style={styles.sectionHint}>Tap an athlete to assign to a group.</Text>

            <View style={styles.sortRow}>
              {[{ key: 'volume', label: 'By volume' }, { key: 'vdot', label: 'By VDOT' }].map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.sortBtn, sortBy === opt.key && styles.sortBtnActive]}
                  onPress={() => setSortBy(opt.key)}
                >
                  <Text style={[styles.sortBtnText, sortBy === opt.key && styles.sortBtnTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {sortedAthletes.map(athlete => {
              const stats = athleteStats[athlete.id] || { avg3wk: 0, last30: 0 };
              const groupName = getGroupName(athlete.groupId);
              const isAssigned = !!athlete.groupId;
              const hasVdot = !!athlete.vdot && !!athlete.trainingPaces;
              const easyRange = hasVdot
                ? `Easy ${formatPace(athlete.trainingPaces.eLow)}–${formatPace(athlete.trainingPaces.eHigh)}/mi`
                : 'No paces set';

              return (
                <TouchableOpacity
                  key={athlete.id}
                  style={styles.athleteRow}
                  onPress={() => handleAssignAthlete(athlete)}
                  activeOpacity={0.7}
                >
                  <View style={styles.athleteInfo}>
                    <View style={styles.athleteNameRow}>
                      <Text style={styles.athleteName}>{athlete.firstName} {athlete.lastName}</Text>
                      {hasVdot && <Text style={styles.vdotBadge}>VDOT {Math.round(athlete.vdot * 10) / 10}</Text>}
                    </View>
                    <Text style={styles.athleteStats}>
                      {stats.avg3wk} mi/wk avg  ·  {easyRange}
                    </Text>
                  </View>
                  <View style={[styles.groupBadge, isAssigned && styles.groupBadgeAssigned]}>
                    <Text style={[styles.groupBadgeText, isAssigned && styles.groupBadgeTextAssigned]}>{groupName}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },
  header: {
    backgroundColor: SIGNAL.color.white,
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: SIGNAL.space[5],
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
  },
  backText: {
    color: SIGNAL.color.indigo,
    fontSize: SIGNAL.size.bodyLg,
    fontFamily: SIGNAL.font.bodyMedium,
  },
  headerTitle: {
    fontSize: SIGNAL.size.heading,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },

  tabRow: {
    flexDirection: 'row',
    backgroundColor: SIGNAL.color.white,
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  tab: {
    flex: 1,
    paddingVertical: SIGNAL.space[4],
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: SIGNAL.color.indigo,
  },
  tabText: {
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.bodyMedium,
    color: SIGNAL.color.mute2,
  },
  tabTextActive: {
    color: SIGNAL.color.indigo,
    fontFamily: SIGNAL.font.bodySemi,
  },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: SIGNAL.space[8] },

  section: {
    paddingHorizontal: SIGNAL.space.screen,
    paddingTop: SIGNAL.space[6],
  },
  eyebrow: {
    ...SIGNAL.style.eyebrow,
    marginBottom: SIGNAL.space[2],
  },
  sectionTitle: {
    fontSize: SIGNAL.size.heading,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.indigo,
    letterSpacing: SIGNAL.letter.bodyTight,
    marginBottom: SIGNAL.space[4],
  },
  sectionHint: {
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.body,
    color: SIGNAL.color.mute,
    marginBottom: SIGNAL.space[5],
    letterSpacing: SIGNAL.letter.bodyTight,
  },

  card: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: SIGNAL.space.card,
    marginBottom: SIGNAL.space[3],
    ...SIGNAL.border.hairline,
  },

  emptyText: {
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.body,
    color: SIGNAL.color.mute,
    textAlign: 'center',
    paddingVertical: SIGNAL.space[6],
    letterSpacing: SIGNAL.letter.bodyTight,
  },

  addRow: {
    flexDirection: 'row',
    gap: SIGNAL.space[3],
    alignItems: 'center',
  },
  addInput: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper,
    borderRadius: SIGNAL.radius.control,
    paddingHorizontal: SIGNAL.space[4],
    paddingVertical: SIGNAL.space[3],
    fontSize: SIGNAL.size.bodyLg,
    fontFamily: SIGNAL.font.body,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  addBtn: {
    backgroundColor: SIGNAL.color.indigo,
    borderRadius: SIGNAL.radius.button,
    paddingHorizontal: SIGNAL.space[6],
    paddingVertical: SIGNAL.space[3],
    justifyContent: 'center',
  },
  addBtnText: {
    color: SIGNAL.color.white,
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: SIGNAL.size.body,
    letterSpacing: SIGNAL.letter.bodyTight,
  },

  groupCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: SIGNAL.space.card,
    marginBottom: SIGNAL.space[2],
    ...SIGNAL.border.hairline,
  },
  groupCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIGNAL.space[3],
  },
  groupInfo: { flex: 1 },
  groupNameInput: {
    fontSize: SIGNAL.size.bodyLg,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.ink,
    padding: 0,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  groupCount: {
    fontSize: SIGNAL.size.label,
    fontFamily: SIGNAL.font.body,
    color: SIGNAL.color.mute,
    marginTop: SIGNAL.space[1],
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  deleteBtn: {
    padding: SIGNAL.space[2],
    borderRadius: SIGNAL.radius.control,
  },

  athleteRow: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: SIGNAL.space.card,
    marginBottom: SIGNAL.space[2],
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIGNAL.space[3],
    ...SIGNAL.border.hairline,
  },
  athleteInfo: { flex: 1 },
  athleteNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIGNAL.space[2],
  },
  athleteName: {
    fontSize: SIGNAL.size.bodyLg,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  athleteStats: {
    fontSize: SIGNAL.size.label,
    fontFamily: SIGNAL.font.body,
    color: SIGNAL.color.mute,
    marginTop: SIGNAL.space[1],
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  vdotBadge: {
    fontSize: SIGNAL.size.eyebrow,
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.indigo,
    backgroundColor: `${SIGNAL.color.indigo}${SIGNAL.tint.chip}`,
    paddingHorizontal: SIGNAL.space[2],
    paddingVertical: 2,
    borderRadius: SIGNAL.radius.chip,
    overflow: 'hidden',
    letterSpacing: 0.5,
  },

  sortRow: {
    flexDirection: 'row',
    gap: SIGNAL.space[2],
    marginBottom: SIGNAL.space[5],
  },
  sortBtn: {
    paddingHorizontal: SIGNAL.space[5],
    paddingVertical: SIGNAL.space[2],
    borderRadius: SIGNAL.radius.chip,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    backgroundColor: SIGNAL.color.white,
  },
  sortBtnActive: {
    backgroundColor: SIGNAL.color.indigo,
    borderColor: SIGNAL.color.indigo,
  },
  sortBtnText: {
    fontSize: SIGNAL.size.label,
    fontFamily: SIGNAL.font.bodyMedium,
    color: SIGNAL.color.inkSoft,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  sortBtnTextActive: {
    color: SIGNAL.color.white,
    fontFamily: SIGNAL.font.bodySemi,
  },

  groupBadge: {
    borderRadius: SIGNAL.radius.chip,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    paddingHorizontal: SIGNAL.space[4],
    paddingVertical: SIGNAL.space[2],
    backgroundColor: SIGNAL.color.paper,
  },
  groupBadgeAssigned: {
    backgroundColor: `${SIGNAL.color.indigo}${SIGNAL.tint.chip}`,
    borderColor: SIGNAL.color.indigo,
  },
  groupBadgeText: {
    fontSize: SIGNAL.size.label,
    fontFamily: SIGNAL.font.bodyMedium,
    color: SIGNAL.color.mute,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  groupBadgeTextAssigned: {
    color: SIGNAL.color.indigo,
    fontFamily: SIGNAL.font.bodySemi,
  },
});
