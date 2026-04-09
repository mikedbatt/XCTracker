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
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../firebaseConfig';
import { BRAND, BRAND_DARK, FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SPACE } from '../constants/design';
import { CATEGORIES, TYPE_COLORS, WORKOUT_PACE_ZONE } from '../constants/training';
import { formatPace } from '../utils/vdotUtils';
import DatePickerField from './DatePickerField';
import RunDetailModal from './RunDetailModal';
import WorkoutDetailModal from './WorkoutDetailModal';

// Re-export so existing imports from CalendarScreen keep working
export { CATEGORIES, TYPE_COLORS };

export default function CalendarScreen({ userData, school, onClose, autoOpenAdd, prefillWorkout, groups = [], externalAthleteRuns = null, trainingPaces = null }) {
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
  const [endDate, setEndDate] = useState(null);
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [baseMiles, setBaseMiles] = useState('');
  const [groupAdjustments, setGroupAdjustments] = useState({});
  const primaryColor = school?.primaryColor || BRAND;
  const isCoach = userData.role === 'admin_coach' || userData.role === 'assistant_coach';

  useEffect(() => { loadItems(); }, []);

  // Auto-open add modal with prefill from workout library
  useEffect(() => {
    if (autoOpenAdd && !loading) {
      if (prefillWorkout) {
        setEditingItem(null);
        setCategory('Training');
        const calTypes = CATEGORIES.Training.types;
        setType(calTypes.includes(prefillWorkout.type) ? prefillWorkout.type : 'Easy');
        setTitle(prefillWorkout.name || '');
        setDescription(prefillWorkout.description || '');
        setDate(new Date());
        setTime(null); setEndDate(null); setIsMultiDay(false);
        setLocation(''); setNotes('');
        setBaseMiles(''); setGroupAdjustments({});
        setAddModalVisible(true);
      } else {
        openNew();
      }
    }
  }, [autoOpenAdd, loading]);

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
        const color = TYPE_COLORS[item.type] || primaryColor;

        if (item.isMultiDay && item.endDate) {
          // Mark every day from start to end
          const end = item.endDate?.toDate?.() || d;
          const cur = new Date(d);
          while (cur <= end) {
            const key = cur.toISOString().split('T')[0];
            if (!marks[key]) marks[key] = { dots: [], marked: true };
            if (marks[key].dots.length < 3) marks[key].dots.push({ key: `${item.id}_${key}`, color });
            cur.setDate(cur.getDate() + 1);
          }
        } else {
          const key = d.toISOString().split('T')[0];
          if (!marks[key]) marks[key] = { dots: [], marked: true };
          if (marks[key].dots.length < 3) marks[key].dots.push({ key: item.id, color });
        }
      });

      // Show athlete runs as gray dots — from Firestore (athlete) or external prop (parent)
      const isAthlete = userData.role === 'athlete';
      if (isAthlete || externalAthleteRuns) {
        try {
          let runs;
          if (externalAthleteRuns) {
            runs = externalAthleteRuns.map(r => ({ ...r, _isRun: true }));
          } else {
            const runsSnap = await getDocs(query(
              collection(db, 'runs'),
              where('userId', '==', auth.currentUser.uid),
              orderBy('date', 'desc')
            ));
            runs = runsSnap.docs.map(d => ({ id: d.id, _isRun: true, ...d.data() }));
          }
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
        } catch (e) { console.warn('Runs for calendar:', e); }
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
    setEndDate(null); setIsMultiDay(false);
    setLocation(''); setDescription(''); setNotes('');
    setBaseMiles(''); setGroupAdjustments({});
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
    setIsMultiDay(item.isMultiDay || false);
    setEndDate(item.endDate?.toDate?.() || null);
    setLocation(item.location || '');
    setDescription(item.description || '');
    setNotes(item.notes || '');
    setBaseMiles(item.baseMiles != null ? String(item.baseMiles) : '');
    // Reverse-compute adjustments from stored groupMiles
    const adj = {};
    if (item.baseMiles != null && item.groupMiles) {
      groups.forEach(g => {
        if (item.groupMiles[g.id] != null) {
          adj[g.id] = String(Math.round((item.groupMiles[g.id] - item.baseMiles) * 10) / 10);
        }
      });
    }
    setGroupAdjustments(adj);
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

      // Compute group miles from base + adjustments
      const parsedBase = baseMiles ? parseFloat(baseMiles) : null;
      let groupMilesData = null;
      if (parsedBase != null && !isNaN(parsedBase) && groups.length > 0) {
        groupMilesData = {};
        groups.forEach(g => {
          const adj = groupAdjustments[g.id] ? parseFloat(groupAdjustments[g.id]) : 0;
          groupMilesData[g.id] = Math.round((parsedBase + (isNaN(adj) ? 0 : adj)) * 10) / 10;
        });
      }

      const data = {
        schoolId: userData.schoolId,
        category,
        type,
        title,
        date: eventDateTime,
        isMultiDay: isMultiDay && !!endDate,
        endDate: isMultiDay && endDate ? endDate : null,
        location: location || null,
        description: description || null,
        notes: notes || null,
        baseMiles: parsedBase,
        groupMiles: groupMilesData,
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
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={BRAND_DARK} />
          <Text style={styles.headerBack}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Team Calendar</Text>
        {isCoach ? (
          <TouchableOpacity style={styles.addBtn} onPress={() => openNew()}>
            <Text style={styles.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        ) : <View style={{ width: 60 }} />}
      </View>

      <>

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
            {(userData.role === 'athlete' || externalAthleteRuns) && (
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#9e9e9e' }]} />
                <Text style={styles.legendText}>{externalAthleteRuns ? 'Logged run' : 'My run'}</Text>
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
              ) : selectedItems.map(item => {
                const itemMiles = item.baseMiles || null;
                return (
                  <TouchableOpacity key={item.id} style={styles.workoutCard} onPress={() => { setDetailItem(item); setDetailVisible(true); }}>
                    <View style={[styles.workoutBadge, { backgroundColor: getColor(item) }]}>
                      <Text style={styles.workoutBadgeText}>{item.type}</Text>
                    </View>
                    <View style={styles.workoutInfo}>
                      <Text style={styles.workoutTitle}>{item.title}{itemMiles ? ` — ${itemMiles} mi` : ''}</Text>
                      {trainingPaces && WORKOUT_PACE_ZONE[item.type] && (() => {
                        const zone = WORKOUT_PACE_ZONE[item.type];
                        const tp = trainingPaces;
                        const paceText = zone === 'easy' ? `${formatPace(tp.eLow)}–${formatPace(tp.eHigh)}/mi`
                          : zone === 'threshold' ? `${formatPace(tp.t)}/mi`
                          : zone === 'interval' ? `${formatPace(tp.i)}/mi`
                          : zone === 'repetition' ? `${formatPace(tp.r)}/mi` : null;
                        return paceText ? <Text style={styles.workoutPace}>Target: {paceText}</Text> : null;
                      })()}
                      {item.description && <Text style={styles.workoutDesc} numberOfLines={1}>{item.description}</Text>}
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </TouchableOpacity>
                );
              })}

              {/* Show athlete's logged runs for this day */}
              {selectedRuns.length > 0 && (
                <View style={styles.runsDaySection}>
                  <Text style={styles.runsDayTitle}>{externalAthleteRuns ? 'Logged runs' : 'My logged runs'}</Text>
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
            ) : upcomingItems.map(item => {
              const itemMiles = item.baseMiles || null;
              return (
                <TouchableOpacity key={item.id} style={styles.workoutCard}
                  onPress={() => { setDetailItem(item); setDetailVisible(true); }}>
                  <View style={[styles.workoutBadge, { backgroundColor: getColor(item) }]}>
                    <Text style={styles.workoutBadgeText}>{item.type}</Text>
                  </View>
                  <View style={styles.workoutInfo}>
                    <Text style={styles.workoutTitle}>{item.title}{itemMiles ? ` — ${itemMiles} mi` : ''}</Text>
                    {trainingPaces && WORKOUT_PACE_ZONE[item.type] && (() => {
                      const zone = WORKOUT_PACE_ZONE[item.type];
                      const tp = trainingPaces;
                      const paceText = zone === 'easy' ? `${formatPace(tp.eLow)}–${formatPace(tp.eHigh)}/mi`
                        : zone === 'threshold' ? `${formatPace(tp.t)}/mi`
                        : zone === 'interval' ? `${formatPace(tp.i)}/mi`
                        : zone === 'repetition' ? `${formatPace(tp.r)}/mi` : null;
                      return paceText ? <Text style={styles.workoutPace}>Target: {paceText}</Text> : null;
                    })()}
                    {item.description && <Text style={styles.workoutDesc} numberOfLines={1}>{item.description}</Text>}
                    <Text style={styles.workoutDate}>{item.date?.toDate?.()?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              );
            })}
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
      <WorkoutDetailModal
        item={detailItem}
        visible={detailVisible}
        onClose={() => setDetailVisible(false)}
        primaryColor={primaryColor}
        groups={groups}
        trainingPaces={trainingPaces}
        onEdit={isCoach ? (item) => { setDetailVisible(false); openEdit(item); } : null}
        onDelete={isCoach ? (item) => { handleDelete(item); } : null}
      />

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
                placeholderTextColor={NEUTRAL.muted}
                value={title}
                onChangeText={setTitle}
              />

              {/* Date and time */}
              <DatePickerField label="Date *" value={date} onChange={setDate} primaryColor={primaryColor} />
              <DatePickerField label="Start time (optional)" value={time} onChange={setTime} primaryColor={primaryColor} mode="time" />

              {/* Multi-day toggle */}
              <View style={styles.multiDayRow}>
                <View style={styles.multiDayLeft}>
                  <Text style={styles.fieldLabel}>Multi-day event?</Text>
                  <Text style={styles.multiDayHint}>Camp, overnight trip, multi-day meet</Text>
                </View>
                <TouchableOpacity
                  style={[styles.multiDayToggle, isMultiDay && { backgroundColor: primaryColor }]}
                  onPress={() => { setIsMultiDay(v => !v); if (isMultiDay) setEndDate(null); }}
                >
                  <Text style={[styles.multiDayToggleText, isMultiDay && { color: '#fff' }]}>
                    {isMultiDay ? 'On' : 'Off'}
                  </Text>
                </TouchableOpacity>
              </View>

              {isMultiDay && (
                <DatePickerField
                  label="End date *"
                  value={endDate}
                  onChange={setEndDate}
                  primaryColor={primaryColor}
                  minimumDate={date || undefined}
                />
              )}

              {/* Location */}
              <Text style={styles.fieldLabel}>Location (optional)</Text>
              <TextInput style={styles.input} placeholder="e.g. Camel's Back Park" placeholderTextColor={NEUTRAL.muted} value={location} onChangeText={setLocation} />

              {/* Description */}
              <Text style={styles.fieldLabel}>{category === 'Training' ? 'Workout details' : 'Description'} (optional)</Text>
              <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                placeholder={category === 'Training' ? 'Distance, pace, sets/reps, structure...' : 'Event details...'}
                placeholderTextColor={NEUTRAL.muted}
                value={description}
                onChangeText={setDescription}
                multiline
              />

              {/* Notes */}
              <Text style={styles.fieldLabel}>Notes (optional)</Text>
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                placeholder="Warmup info, gear, directions, reminders..."
                placeholderTextColor={NEUTRAL.muted}
                value={notes}
                onChangeText={setNotes}
                multiline
              />

              {/* Group mileage — only for Training events when groups exist */}
              {category === 'Training' && groups.length > 0 && (
                <View style={styles.mileageSection}>
                  <Text style={styles.fieldLabel}>Mileage by group</Text>
                  <View style={styles.mileageRow}>
                    <Text style={styles.mileageLabel}>Base miles</Text>
                    <TextInput
                      style={styles.mileageInput}
                      value={baseMiles}
                      onChangeText={setBaseMiles}
                      placeholder="0"
                      placeholderTextColor="#ccc"
                      keyboardType="decimal-pad"
                    />
                  </View>
                  {groups.map(g => {
                    const adj = groupAdjustments[g.id] || '';
                    const base = parseFloat(baseMiles) || 0;
                    const adjNum = parseFloat(adj) || 0;
                    const total = Math.round((base + adjNum) * 10) / 10;
                    return (
                      <View key={g.id} style={styles.mileageRow}>
                        <Text style={styles.mileageLabel}>{g.name}</Text>
                        <TextInput
                          style={styles.mileageInput}
                          value={adj}
                          onChangeText={(text) => setGroupAdjustments(prev => ({ ...prev, [g.id]: text }))}
                          placeholder="+/- 0"
                          placeholderTextColor="#ccc"
                          keyboardType="numbers-and-punctuation"
                        />
                        <Text style={styles.mileageTotal}>{base > 0 ? `= ${total} mi` : ''}</Text>
                      </View>
                    );
                  })}
                </View>
              )}

              <View style={{ height: 120 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
    </View>
  );
}

const styles = StyleSheet.create({
  plannerToggle:       { flexDirection: 'row', backgroundColor: NEUTRAL.border, borderRadius: RADIUS.md, padding: 4, marginHorizontal: SPACE.lg, marginTop: SPACE.sm, marginBottom: SPACE.xs },
  plannerToggleBtn:    { flex: 1, paddingVertical: SPACE.sm, alignItems: 'center', borderRadius: RADIUS.sm },
  plannerToggleBtnActive: { backgroundColor: NEUTRAL.card },
  plannerToggleText:   { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, fontWeight: FONT_WEIGHT.medium },
  plannerToggleTextActive: { color: BRAND, fontWeight: FONT_WEIGHT.bold },
  // View toggle
  viewToggle:         { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  viewToggleBtn:      { borderRadius: 8, borderWidth: 1.5, borderColor: '#ddd', paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#fff' },
  viewToggleBtnText:  { fontSize: 13, fontWeight: '600', color: '#666' },
  // Week view
  weekNav:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  weekNavBtn:         { fontSize: 14, fontWeight: '600' },
  weekNavLabel:       { fontSize: 14, fontWeight: '700', color: '#333' },
  weekDay:            { paddingHorizontal: 16, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#eee' },
  weekDayHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  weekDayLabel:       { fontSize: 14, fontWeight: '700', color: '#111' },
  weekDayAdd:         { fontSize: 12, fontWeight: '600' },
  weekDayEmpty:       { fontSize: 12, color: '#bbb', fontStyle: 'italic', paddingLeft: 4 },
  weekEvent:          { paddingVertical: 2 },
  weekEventTitle:     { fontSize: 14, color: '#444' },
  weekTotals:         { marginHorizontal: 16, marginTop: 8, backgroundColor: '#fff', borderRadius: 10, padding: 10 },
  weekTotalsTitle:    { fontSize: 13, fontWeight: '700', color: '#333', marginBottom: 4 },
  weekTotalRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  weekTotalName:      { fontSize: 13, color: '#555' },
  weekTotalMiles:     { fontSize: 13, fontWeight: '600', color: '#333' },
  // Mileage fields in add/edit form
  detailMileageRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  detailMileageVal:   { fontSize: 16, fontWeight: '700', color: '#333' },
  mileageSection:     { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  mileageRow:         { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 },
  mileageLabel:       { fontSize: 14, color: '#555', width: 90 },
  mileageInput:       { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 8, width: 70, textAlign: 'center', fontSize: 15, backgroundColor: '#f9f9f9', color: '#333' },
  mileageTotal:       { fontSize: 13, color: '#888', fontWeight: '600' },
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: NEUTRAL.card, paddingTop: Platform.OS === 'ios' ? 56 : 32, paddingBottom: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: NEUTRAL.border },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerBack: { color: BRAND_DARK, fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
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
  workoutCard:    { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, padding: SPACE.lg - 2, marginBottom: SPACE.md, flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  workoutBadge:   { borderRadius: RADIUS.sm, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, alignSelf: 'flex-start' },
  workoutBadgeText: { color: '#fff', fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold },
  workoutInfo:    { flex: 1 },
  workoutTitle:   { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  workoutPace:    { fontSize: FONT_SIZE.xs, color: BRAND, fontWeight: FONT_WEIGHT.semibold, marginTop: 2 },
  workoutDesc:    { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, marginTop: 2 },
  workoutDate:    { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: SPACE.xs },
  chevron:        { fontSize: 20, color: NEUTRAL.muted },
  runsDaySection: { marginTop: 12 },
  runsDayTitle: { fontSize: 13, fontWeight: '700', color: '#9e9e9e', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  runDayCard: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#e0e0e0' },
  runDayDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#9e9e9e' },
  runDayInfo: { flex: 1, flexDirection: 'row', gap: 10 },
  runDayMiles: { fontSize: 15, fontWeight: '700', color: '#333' },
  runDayDetail: { fontSize: 13, color: '#666' },
  runDayEffort: { fontSize: 13, fontWeight: '600', color: '#666' },
  chevronSmall: { fontSize: 18, color: '#ccc' },
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
  modalCancel: { fontSize: 16, color: '#c0392b', fontWeight: '600', width: 60 },
  modalSave: { fontSize: 16, fontWeight: '700', width: 60, textAlign: 'right' },
  modalScroll: { padding: 20 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#444', marginBottom: 8, marginTop: 8 },
  multiDayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 4 },
  multiDayLeft: { flex: 1 },
  multiDayHint: { fontSize: 12, color: '#999', marginTop: 2 },
  multiDayToggle: { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#eee', borderWidth: 1, borderColor: '#ddd' },
  multiDayToggleText: { fontSize: 14, fontWeight: '700', color: '#666' },
  categoryRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  categoryBtn: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center', backgroundColor: '#eee', borderWidth: 2, borderColor: 'transparent' },
  categoryBtnText: { fontSize: 16, fontWeight: '700', color: '#555' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  typeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#eee' },
  typeChipText: { fontSize: 13, fontWeight: '600', color: '#666' },
  input: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#ddd', padding: 14, fontSize: 16, marginBottom: 8, color: '#333' },
});