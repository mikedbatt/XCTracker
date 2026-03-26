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
  BRAND, BRAND_DARK, FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE,
} from '../constants/design';

export default function ManageGroups({ schoolId, athletes, onClose }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newGroupName, setNewGroupName] = useState('');
  const [athleteStats, setAthleteStats] = useState({});
  const [activeTab, setActiveTab] = useState('groups');

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

    for (const athlete of athletes) {
      try {
        const runsSnap = await getDocs(query(
          collection(db, 'runs'),
          where('userId', '==', athlete.id),
          orderBy('date', 'desc')
        ));
        const runs = runsSnap.docs.map(d => ({ ...d.data(), date: d.data().date?.toDate?.() }));
        const w1 = runs.filter(r => r.date && r.date >= week1Start).reduce((s, r) => s + (r.miles || 0), 0);
        const w2 = runs.filter(r => r.date && r.date >= week2Start && r.date < week1Start).reduce((s, r) => s + (r.miles || 0), 0);
        const w3 = runs.filter(r => r.date && r.date >= week3Start && r.date < week2Start).reduce((s, r) => s + (r.miles || 0), 0);
        const avg3 = Math.round(((w1 + w2 + w3) / 3) * 10) / 10;
        const oneMonthAgo = new Date(now); oneMonthAgo.setDate(now.getDate() - 30);
        const last30 = runs.filter(r => r.date && r.date >= oneMonthAgo).reduce((s, r) => s + (r.miles || 0), 0);
        stats[athlete.id] = { avg3wk: avg3, last30: Math.round(last30 * 10) / 10 };
      } catch {
        stats[athlete.id] = { avg3wk: 0, last30: 0 };
      }
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
          <Text style={styles.headerTitle}>Manage Groups</Text>
          <View style={{ width: 60 }} />
        </View>
        <ActivityIndicator style={{ marginTop: 40 }} color={BRAND} />
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
        <Text style={styles.headerTitle}>Manage Groups</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.tabRow}>
        {[{ key: 'groups', label: 'Groups' }, { key: 'assign', label: 'Assign' }].map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, activeTab === t.key && { borderBottomColor: BRAND, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(t.key)}
          >
            <Text style={[styles.tabText, activeTab === t.key && { color: BRAND, fontWeight: '700' }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
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
              <TouchableOpacity style={styles.addBtn} onPress={handleAddGroup}>
                <Text style={styles.addBtnText}>+ Add</Text>
              </TouchableOpacity>
            </View>

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
                    <TouchableOpacity onPress={() => handleDeleteGroup(group)} style={styles.deleteBtn}>
                      <Text style={styles.deleteBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

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
                  <View style={[styles.groupBadge, isAssigned && { backgroundColor: BRAND + '15', borderColor: BRAND }]}>
                    <Text style={[styles.groupBadgeText, isAssigned && { color: BRAND }]}>{groupName}</Text>
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
  container:      { flex: 1, backgroundColor: NEUTRAL.bg },
  header:         { backgroundColor: '#fff', paddingTop: Platform.OS === 'ios' ? 56 : 32, paddingBottom: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
  backBtn:        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
  backText:       { color: BRAND_DARK, fontSize: 15, fontWeight: '600' },
  headerTitle:    { fontSize: 20, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  tabRow:         { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
  tab:            { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText:        { fontSize: FONT_SIZE.sm, color: NEUTRAL.muted },
  scroll:         { flex: 1 },
  section:        { padding: SPACE.lg },
  sectionTitle:   { fontSize: 17, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: 10 },
  sectionHint:    { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginBottom: 12 },
  emptyText:      { fontSize: FONT_SIZE.sm, color: NEUTRAL.muted, textAlign: 'center', paddingVertical: 20 },
  addRow:         { flexDirection: 'row', gap: 10, marginBottom: 14 },
  addInput:       { flex: 1, backgroundColor: '#fff', borderRadius: RADIUS.md, padding: 12, fontSize: 15, borderWidth: 1, borderColor: NEUTRAL.border, color: BRAND_DARK },
  addBtn:         { backgroundColor: BRAND, borderRadius: RADIUS.md, paddingHorizontal: 16, justifyContent: 'center' },
  addBtnText:     { color: '#fff', fontWeight: FONT_WEIGHT.bold, fontSize: FONT_SIZE.sm },
  groupCard:      { backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: 12, marginBottom: 8, ...SHADOW.sm },
  groupCardTop:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupInfo:      { flex: 1 },
  groupNameInput: { fontSize: 15, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, padding: 0 },
  groupCount:     { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: 2 },
  deleteBtn:      { padding: 8 },
  deleteBtnText:  { fontSize: 16, color: '#dc2626', fontWeight: '600' },
  athleteRow:     { backgroundColor: '#fff', borderRadius: RADIUS.md, padding: 12, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 10 },
  athleteInfo:    { flex: 1 },
  athleteName:    { fontSize: FONT_SIZE.sm, fontWeight: '600', color: BRAND_DARK },
  athleteStats:   { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: 2 },
  groupBadge:     { borderRadius: 8, borderWidth: 1, borderColor: NEUTRAL.border, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#f9f9f9' },
  groupBadgeText: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: NEUTRAL.muted },
});
