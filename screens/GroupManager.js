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

export default function GroupManager({ schoolId, athletes, onClose }) {
  const [groups,       setGroups]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [newGroupName, setNewGroupName] = useState('');
  const [athleteStats, setAthleteStats] = useState({});

  const primaryColor = '#2e7d32';

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
        <View style={[styles.header, { backgroundColor: primaryColor }]}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Text style={styles.backText}>‹ Back</Text>
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
      <View style={[styles.header, { backgroundColor: primaryColor }]}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Training Groups</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Create group ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Groups</Text>
          <View style={styles.addRow}>
            <TextInput
              style={styles.addInput}
              value={newGroupName}
              onChangeText={setNewGroupName}
              placeholder="New group name..."
              placeholderTextColor="#999"
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
                  <View style={styles.targetBox}>
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
                  <TouchableOpacity onPress={() => handleDeleteGroup(group)} style={styles.deleteBtn}>
                    <Text style={styles.deleteBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>

        {/* ── Athlete assignment ── */}
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

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f5f5f5' },
  header:          { paddingTop: 60, paddingBottom: 12, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:         { paddingVertical: 6, paddingHorizontal: 10 },
  backText:        { color: '#fff', fontSize: 17, fontWeight: '600' },
  headerTitle:     { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  scroll:          { flex: 1 },
  section:         { padding: 16 },
  sectionTitle:    { fontSize: 17, fontWeight: '700', color: '#333', marginBottom: 10 },
  sectionHint:     { fontSize: 12, color: '#999', marginBottom: 12 },
  emptyText:       { fontSize: 14, color: '#999', textAlign: 'center', paddingVertical: 20 },

  // Add group
  addRow:          { flexDirection: 'row', gap: 10, marginBottom: 14 },
  addInput:        { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 12, fontSize: 15, borderWidth: 1, borderColor: '#e0e0e0', color: '#333' },
  addBtn:          { borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  addBtnText:      { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Group card
  groupCard:       { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8 },
  groupCardTop:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupInfo:       { flex: 1 },
  groupNameInput:  { fontSize: 15, fontWeight: '700', color: '#333', padding: 0 },
  groupCount:      { fontSize: 12, color: '#999', marginTop: 2 },
  targetBox:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  targetInput:     { fontSize: 15, fontWeight: '600', color: '#333', textAlign: 'right', width: 45, borderBottomWidth: 1, borderBottomColor: '#ddd', padding: 2 },
  targetLabel:     { fontSize: 12, color: '#999' },
  deleteBtn:       { padding: 8 },
  deleteBtnText:   { fontSize: 16, color: '#dc2626', fontWeight: '600' },

  // Athlete rows
  athleteRow:      { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 10 },
  athleteInfo:     { flex: 1 },
  athleteName:     { fontSize: 14, fontWeight: '600', color: '#333' },
  athleteStats:    { fontSize: 12, color: '#999', marginTop: 2 },
  groupBadge:      { borderRadius: 8, borderWidth: 1, borderColor: '#ddd', paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#f9f9f9' },
  groupBadgeText:  { fontSize: 12, fontWeight: '600', color: '#999' },
});
