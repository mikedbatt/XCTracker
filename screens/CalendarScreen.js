import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { auth, db } from '../firebaseConfig';
import DatePickerField from './DatePickerField';
import RunDetailModal from './RunDetailModal';

// ─── Unified category/type system ────────────────────────────────────────────
export const CATEGORIES = {
  Training: {
    label: 'Training',
    color: '#2e7d32',
    types: ['Easy', 'Tempo', 'Long Run', 'Intervals', 'Speed', 'Cross Train', 'Weights', 'Recovery', 'Time Trial'],
  },
  Event: {
    label: 'Event',
    color: '#dc2626',
    types: ['Race', 'Team Meeting', 'Team Party'],
  },
};

// Color per type
export const TYPE_COLORS = {
  Easy: '#4caf50', Tempo: '#ff9800', 'Long Run': '#2196f3',
  Intervals: '#9c27b0', Speed: '#e91e63', 'Cross Train': '#00bcd4',
  Weights: '#795548', Recovery: '#607d8b', 'Time Trial': '#ff5722',
  Race: '#dc2626', 'Team Meeting': '#0284c7', 'Team Party': '#f59e0b',
};

export default function CalendarScreen({ userData, school, onClose, autoOpenAdd }) {
  const [markedDates, setMarkedDates] = useState({});
  const [allItems, setAllItems] = useState([]);
  const [athleteRuns, setAthleteRuns] = useState([]);
  const [selectedRuns, setSelectedRuns] = useState([]);
  const [selectedRunDetail, setSelectedRunDetail] = useState(null);
  const [runDetailVisible, setRunDetailVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [category, setCategory] = useState('Training');
  const [type, setType] = useState('Easy');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(null);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');

  const primaryColor = school?.primaryColor || '#2e7d32';
  const isCoach = userData.role === 'admin_coach' || userData.role === 'assistant_coach';

  useEffect(() => { 
  loadItems();
  if (autoOpenAdd) {
    setCategory('Training');
    setType('Easy');
    setTitle('');
    setDate(new Date());
    setTime(null);
    setLocation('');
    setDescription('');
    setNotes('');
    setAddModalVisible(true);
  }
}, []);

  const loadItems = async () => {
    setLoading(true);
    try {
      if (!userData.schoolId) { setLoading(false); return; }
      const snap = await getDocs(query(
        collection(db, 'events'),
        where('schoolId', '==', userData.schoolId),
        orderBy('date', 'asc')
      ));
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllItems(items);

      // Build calendar markers from scheduled items
      const marks = {};
      items.forEach(item => {
        const d = item.date?.toDate?.();
        if (!d) return;
        const key = d.toISOString().split('T')[0];
        const color = TYPE_COLORS[item.type] || primaryColor;
        if (!marks[key]) marks[key] = { dots: [], marked: true };
        if (marks[key].dots.length < 2) marks[key].dots.push({ key: item.id, color });
      });

      // Also load athlete's own runs and show as gray dots
      // This lets athletes see what they actually ran vs what was scheduled
      const isAthlete = userData.role === 'athlete';
      if (isAthlete) {
        try {
          const runsSnap = await getDocs(query(
            collection(db, 'runs'),
            where('userId', '==', auth.currentUser.uid),
            orderBy('date', 'desc')
          ));
          const runs = runsSnap.docs.map(d => ({ id: d.id, _isRun: true, ...d.data() }));
          setAthleteRuns(runs);
          runs.forEach(run => {
            const runDate = run.date?.toDate?.();
            if (!runDate) return;
            const key = runDate.toISOString().split('T')[0];
            if (!marks[key]) marks[key] = { dots: [], marked: true };
            const alreadyHasRunDot = marks[key].dots.some(dot => dot.key?.startsWith('run_'));
            if (!alreadyHasRunDot && marks[key].dots.length < 3) {
              marks[key].dots.push({ key: `run_${run.id}`, color: '#9e9e9e' });
            }
          });
        } catch (e) { console.log('Runs for calendar:', e); }
      }

      setMarkedDates(marks);
    } catch (e) { console.error('Calendar load:', e); }
    setLoading(false);
  };

  const handleDayPress = (day) => {
    setSelectedDate(day.dateString);
    setSelectedItems(allItems.filter(item => {
      const d = item.date?.toDate?.();
      return d && d.toISOString().split('T')[0] === day.dateString;
    }));
    // Also find any runs logged on this day (for athletes)
    setSelectedRuns(athleteRuns.filter(run => {
      const d = run.date?.toDate?.();
      return d && d.toISOString().split('T')[0] === day.dateString;
    }));
  };

  const openNew = (preselectDate) => {
    setEditingItem(null);
    setCategory('Training'); setType('Easy'); setTitle('');
    setDate(preselectDate || new Date()); setTime(null);
    setLocation(''); setDescription(''); setNotes('');
    setAddModalVisible(true);
  };

  const openEdit = (item) => {
    setDetailVisible(false);
    setEditingItem(item);
    setCategory(item.category || 'Training');
    setType(item.type || 'Easy');
    setTitle(item.title || '');
    setDate(item.date?.toDate?.() || new Date());
    setTime(null);
    setLocation(item.location || '');
    setDescription(item.description || '');
    setNotes(item.notes || '');
    setAddModalVisible(true);
  };

  const handleCategoryChange = (cat) => {
    setCategory(cat);
    setType(CATEGORIES[cat].types[0]); // auto-select first type in category
  };

  const handleSave = async () => {
    if (!title) { Alert.alert('Missing info', 'Please enter a title.'); return; }
    setSaving(true);
    try {
      const eventDateTime = new Date(date);
      if (time) eventDateTime.setHours(time.getHours(), time.getMinutes());

      const data = {
        schoolId: userData.schoolId,
        category,
        type,
        title,
        date: eventDateTime,
        location: location || null,
        description: description || null,
        notes: notes || null,
        postedBy: auth.currentUser.uid,
        postedByName: `${userData.firstName} ${userData.lastName}`,
      };

      if (editingItem) {
        await updateDoc(doc(db, 'events', editingItem.id), { ...data, updatedAt: new Date() });
        Alert.alert('Updated!', `${title} has been updated.`);
      } else {
        await addDoc(collection(db, 'events'), { ...data, createdAt: new Date() });
        Alert.alert('Added!', `${title} added to the calendar.`);
      }

      setAddModalVisible(false);
      setEditingItem(null);
      loadItems();
    } catch (e) {
      Alert.alert('Error', 'Could not save. Please try again.');
      console.error(e);
    }
    setSaving(false);
  };

  const handleDelete = (item) => {
    Alert.alert(
      'Delete?',
      `Are you sure you want to delete "${item.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteDoc(doc(db, 'events', item.id));
            setDetailVisible(false);
            loadItems();
          } catch { Alert.alert('Error', 'Could not delete.'); }
        }},
      ]
    );
  };

  const getColor = (item) => TYPE_COLORS[item.type] || primaryColor;

  const formatDate = (item) => {
    const d = item.date?.toDate?.();
    if (!d) return '';
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  const upcomingItems = allItems.filter(e => e.date?.toDate?.() >= new Date());

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: primaryColor }]}>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.headerBack}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Team Calendar</Text>
        {isCoach ? (
          <TouchableOpacity style={styles.addBtn} onPress={() => openNew()}>
            <Text style={styles.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        ) : <View style={{ width: 60 }} />}
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color={primaryColor} /></View>
      ) : (
        <ScrollView style={styles.scroll}>
          <Calendar
            onDayPress={handleDayPress}
            markingType="multi-dot"
            markedDates={{
              ...markedDates,
              ...(selectedDate ? {
                [selectedDate]: { ...(markedDates[selectedDate] || {}), selected: true, selectedColor: primaryColor }
              } : {}),
            }}
            theme={{
              selectedDayBackgroundColor: primaryColor,
              todayTextColor: primaryColor,
              arrowColor: primaryColor,
              textDayFontWeight: '500',
              textMonthFontWeight: '700',
            }}
          />

          {/* Legend */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.legend}>
            {Object.entries(TYPE_COLORS).map(([type, color]) => (
              <View key={type} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: color }]} />
                <Text style={styles.legendText}>{type}</Text>
              </View>
            ))}
            {userData.role === 'athlete' && (
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#9e9e9e' }]} />
                <Text style={styles.legendText}>My run</Text>
              </View>
            )}
          </ScrollView>

          {/* Selected day */}
          {selectedDate && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </Text>
              {selectedItems.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No items on this day.</Text>
                  {isCoach && (
                    <TouchableOpacity style={[styles.addDayBtn, { borderColor: primaryColor }]}
                      onPress={() => openNew(new Date(selectedDate + 'T12:00:00'))}>
                      <Text style={[styles.addDayBtnText, { color: primaryColor }]}>+ Add item</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : selectedItems.map(item => (
                <TouchableOpacity key={item.id} style={styles.itemCard} onPress={() => { setDetailItem(item); setDetailVisible(true); }}>
                  <View style={[styles.itemBar, { backgroundColor: getColor(item) }]} />
                  <View style={styles.itemContent}>
                    <View style={styles.itemBadgeRow}>
                      <View style={[styles.catBadge, { backgroundColor: CATEGORIES[item.category]?.color || primaryColor }]}>
                        <Text style={styles.catBadgeText}>{item.category?.toUpperCase()}</Text>
                      </View>
                      <View style={[styles.typeBadge, { backgroundColor: getColor(item) }]}>
                        <Text style={styles.typeBadgeText}>{item.type}</Text>
                      </View>
                    </View>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    {item.location && <Text style={styles.itemMeta}>📍 {item.location}</Text>}
                    {item.description && <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text>}
                    <Text style={styles.tapHint}>Tap for details →</Text>
                  </View>
                </TouchableOpacity>
              ))}

              {/* Show athlete's logged runs for this day */}
              {selectedRuns.length > 0 && (
                <View style={styles.runsDaySection}>
                  <Text style={styles.runsDayTitle}>My logged runs</Text>
                  {selectedRuns.map(run => (
                    <TouchableOpacity
                      key={run.id}
                      style={styles.runDayCard}
                      onPress={() => { setSelectedRunDetail(run); setRunDetailVisible(true); }}
                    >
                      <View style={styles.runDayDot} />
                      <View style={styles.runDayInfo}>
                        <Text style={styles.runDayMiles}>{run.miles} miles</Text>
                        {run.duration && <Text style={styles.runDayDetail}>{run.duration}</Text>}
                        {run.heartRate && <Text style={styles.runDayDetail}>{run.heartRate} bpm</Text>}
                      </View>
                      <Text style={styles.runDayEffort}>Effort {run.effort}/10</Text>
                      <Text style={styles.chevronSmall}>›</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Upcoming */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upcoming ({upcomingItems.length})</Text>
            {upcomingItems.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>{isCoach ? 'No upcoming items. Tap + Add to create one!' : 'Nothing upcoming yet.'}</Text>
              </View>
            ) : upcomingItems.map(item => (
              <TouchableOpacity key={item.id} style={styles.upcomingCard}
                onPress={() => { setDetailItem(item); setDetailVisible(true); }}>
                <View style={[styles.upcomingDot, { backgroundColor: getColor(item) }]} />
                <View style={styles.upcomingInfo}>
                  <Text style={styles.upcomingTitle}>{item.title}</Text>
                  <Text style={styles.upcomingMeta}>
                    {item.date?.toDate?.()?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    {item.location ? ` · ${item.location}` : ''}
                  </Text>
                </View>
                <View style={[styles.upcomingBadge, { backgroundColor: `${getColor(item)}20` }]}>
                  <Text style={[styles.upcomingBadgeText, { color: getColor(item) }]}>{item.type}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Run Detail Modal (for athlete's own runs on calendar) */}
      <RunDetailModal
        run={selectedRunDetail}
        visible={runDetailVisible}
        onClose={() => { setRunDetailVisible(false); setSelectedRunDetail(null); }}
        primaryColor={primaryColor}
      />

      {/* Detail Modal */}
      <Modal visible={detailVisible} animationType="slide" presentationStyle="pageSheet">
        {detailItem && (
          <View style={styles.detailContainer}>
            <View style={[styles.detailHeader, { backgroundColor: getColor(detailItem) }]}>
              <TouchableOpacity onPress={() => setDetailVisible(false)}>
                <Text style={styles.detailClose}>✕ Close</Text>
              </TouchableOpacity>
              <View style={styles.detailBadgeRow}>
                <View style={[styles.detailCatBadge]}>
                  <Text style={styles.detailCatBadgeText}>{detailItem.category?.toUpperCase()} · {detailItem.type?.toUpperCase()}</Text>
                </View>
              </View>
              <Text style={styles.detailTitle}>{detailItem.title}</Text>
              <Text style={styles.detailDate}>{formatDate(detailItem)}</Text>
            </View>
            <ScrollView style={styles.detailScroll}>
              {detailItem.location && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>LOCATION</Text>
                  <Text style={styles.detailValue}>📍 {detailItem.location}</Text>
                </View>
              )}
              {detailItem.description && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>DETAILS</Text>
                  <Text style={styles.detailValue}>{detailItem.description}</Text>
                </View>
              )}
              {detailItem.notes && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>NOTES</Text>
                  <Text style={styles.detailValue}>{detailItem.notes}</Text>
                </View>
              )}
              {detailItem.postedByName && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>POSTED BY</Text>
                  <Text style={styles.detailValue}>Coach {detailItem.postedByName}</Text>
                </View>
              )}
              {!detailItem.location && !detailItem.description && !detailItem.notes && (
                <View style={[styles.emptyCard, { margin: 16 }]}>
                  <Text style={styles.emptyText}>No additional details.</Text>
                </View>
              )}
              {isCoach && (
                <View style={styles.detailActions}>
                  <TouchableOpacity style={[styles.editActionBtn, { borderColor: getColor(detailItem) }]} onPress={() => openEdit(detailItem)}>
                    <Text style={[styles.editActionBtnText, { color: getColor(detailItem) }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteActionBtn} onPress={() => handleDelete(detailItem)}>
                    <Text style={styles.deleteActionBtnText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        )}
      </Modal>

      {/* Add / Edit Modal */}
      <Modal visible={addModalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{editingItem ? 'Edit Item' : 'Add to Calendar'}</Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}>
                <Text style={[styles.modalSave, { color: primaryColor }]}>{saving ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">

              {/* Step 1: Category */}
              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.categoryRow}>
                {Object.keys(CATEGORIES).map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.categoryBtn, category === cat && { backgroundColor: CATEGORIES[cat].color }]}
                    onPress={() => handleCategoryChange(cat)}
                  >
                    <Text style={[styles.categoryBtnText, category === cat && { color: '#fff' }]}>
                      {CATEGORIES[cat].label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Step 2: Type — only shows types for selected category */}
              <Text style={styles.fieldLabel}>Type</Text>
              <View style={styles.typeGrid}>
                {CATEGORIES[category].types.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeChip, type === t && { backgroundColor: TYPE_COLORS[t] || primaryColor }]}
                    onPress={() => setType(t)}
                  >
                    <Text style={[styles.typeChipText, type === t && { color: '#fff' }]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Title */}
              <Text style={styles.fieldLabel}>Title *</Text>
              <TextInput
                style={styles.input}
                placeholder={category === 'Training' ? 'e.g. Tuesday Tempo' : 'e.g. State Championship'}
                placeholderTextColor="#999"
                value={title}
                onChangeText={setTitle}
              />

              {/* Date and time */}
              <DatePickerField label="Date *" value={date} onChange={setDate} primaryColor={primaryColor} />
              <DatePickerField label="Start time (optional)" value={time} onChange={setTime} primaryColor={primaryColor} mode="time" />

              {/* Location */}
              <Text style={styles.fieldLabel}>Location (optional)</Text>
              <TextInput style={styles.input} placeholder="e.g. Camel's Back Park" placeholderTextColor="#999" value={location} onChangeText={setLocation} />

              {/* Description */}
              <Text style={styles.fieldLabel}>{category === 'Training' ? 'Workout details' : 'Description'} (optional)</Text>
              <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                placeholder={category === 'Training' ? 'Distance, pace, sets/reps, structure...' : 'Event details...'}
                placeholderTextColor="#999"
                value={description}
                onChangeText={setDescription}
                multiline
              />

              {/* Notes */}
              <Text style={styles.fieldLabel}>Notes (optional)</Text>
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                placeholder="Warmup info, gear, directions, reminders..."
                placeholderTextColor="#999"
                value={notes}
                onChangeText={setNotes}
                multiline
              />

            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { paddingTop: 60, paddingBottom: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerBack: { color: '#fff', fontSize: 15, fontWeight: '600', width: 60 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  addBtn: { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, width: 60, alignItems: 'center' },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  legend: { padding: 12, gap: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: '#666' },
  section: { padding: 16 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#333', marginBottom: 12 },
  emptyCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, alignItems: 'center', gap: 10 },
  emptyText: { color: '#999', fontSize: 14, textAlign: 'center' },
  addDayBtn: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  addDayBtnText: { fontSize: 14, fontWeight: '600' },
  itemCard: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 12, flexDirection: 'row', overflow: 'hidden' },
  itemBar: { width: 6 },
  itemContent: { flex: 1, padding: 14 },
  itemBadgeRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  catBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  catBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  typeBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  typeBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  itemTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 4 },
  itemMeta: { fontSize: 13, color: '#666', marginBottom: 4 },
  itemDesc: { fontSize: 13, color: '#888', marginBottom: 6 },
  tapHint: { fontSize: 11, color: '#bbb', textAlign: 'right' },
  runsDaySection: { marginTop: 12 },
  runsDayTitle: { fontSize: 13, fontWeight: '700', color: '#9e9e9e', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  runDayCard: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#e0e0e0' },
  runDayDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#9e9e9e' },
  runDayInfo: { flex: 1, flexDirection: 'row', gap: 10 },
  runDayMiles: { fontSize: 15, fontWeight: '700', color: '#333' },
  runDayDetail: { fontSize: 13, color: '#666' },
  runDayEffort: { fontSize: 13, fontWeight: '600', color: '#666' },
  chevronSmall: { fontSize: 18, color: '#ccc' },
  upcomingCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  upcomingDot: { width: 12, height: 12, borderRadius: 6 },
  upcomingInfo: { flex: 1 },
  upcomingTitle: { fontSize: 15, fontWeight: '700', color: '#333' },
  upcomingMeta: { fontSize: 13, color: '#999', marginTop: 2 },
  upcomingBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  upcomingBadgeText: { fontSize: 12, fontWeight: '600' },
  detailContainer: { flex: 1, backgroundColor: '#f5f5f5' },
  detailHeader: { paddingTop: 60, paddingBottom: 24, paddingHorizontal: 24 },
  detailClose: { color: 'rgba(255,255,255,0.8)', fontSize: 15, marginBottom: 16 },
  detailBadgeRow: { flexDirection: 'row', marginBottom: 10 },
  detailCatBadge: { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  detailCatBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  detailTitle: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 6 },
  detailDate: { fontSize: 15, color: 'rgba(255,255,255,0.85)' },
  detailScroll: { flex: 1, padding: 16 },
  detailSection: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12 },
  detailLabel: { fontSize: 11, fontWeight: '700', color: '#999', letterSpacing: 0.5, marginBottom: 8 },
  detailValue: { fontSize: 16, color: '#333', lineHeight: 22 },
  detailActions: { flexDirection: 'row', gap: 12, margin: 16 },
  editActionBtn: { flex: 1, borderRadius: 10, borderWidth: 2, padding: 14, alignItems: 'center' },
  editActionBtnText: { fontSize: 16, fontWeight: '700' },
  deleteActionBtn: { flex: 1, borderRadius: 10, backgroundColor: '#fee2e2', padding: 14, alignItems: 'center' },
  deleteActionBtnText: { fontSize: 16, fontWeight: '700', color: '#dc2626' },
  modal: { flex: 1, backgroundColor: '#f5f5f5' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  modalCancel: { fontSize: 16, color: '#999', width: 60 },
  modalSave: { fontSize: 16, fontWeight: '700', width: 60, textAlign: 'right' },
  modalScroll: { padding: 20 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#444', marginBottom: 8, marginTop: 8 },
  categoryRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  categoryBtn: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center', backgroundColor: '#eee', borderWidth: 2, borderColor: 'transparent' },
  categoryBtnText: { fontSize: 16, fontWeight: '700', color: '#555' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  typeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#eee' },
  typeChipText: { fontSize: 13, fontWeight: '600', color: '#666' },
  input: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#ddd', padding: 14, fontSize: 16, marginBottom: 8, color: '#333' },
});