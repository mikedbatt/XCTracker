import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
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
import { BRAND, SIGNAL } from '../constants/design';
import { CATEGORIES, SIGNAL_TYPE_COLORS, TYPE_COLORS, WORKOUT_PACE_ZONE } from '../constants/training';
import { formatPace } from '../utils/vdotUtils';
import { toLocalISODate } from '../utils/dateUtils';
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

  // Signal: resolve workout-type color with Signal palette first, fallback to legacy, then indigo.
  const typeColor = (t) => SIGNAL_TYPE_COLORS[t] || TYPE_COLORS[t] || SIGNAL.color.indigo;

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
        const color = typeColor(item.type);

        if (item.isMultiDay && item.endDate) {
          // Mark every day from start to end
          const end = item.endDate?.toDate?.() || d;
          const cur = new Date(d);
          while (cur <= end) {
            const key = toLocalISODate(cur);
            if (!marks[key]) marks[key] = { dots: [], marked: true };
            if (marks[key].dots.length < 3) marks[key].dots.push({ key: `${item.id}_${key}`, color });
            cur.setDate(cur.getDate() + 1);
          }
        } else {
          const key = toLocalISODate(d);
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
            const key = toLocalISODate(runDate);
            if (!marks[key]) marks[key] = { dots: [], marked: true };
            const alreadyHasRunDot = marks[key].dots.some(dot => dot.key?.startsWith('run_'));
            if (!alreadyHasRunDot && marks[key].dots.length < 3) {
              marks[key].dots.push({ key: `run_${run.id}`, color: SIGNAL.color.mute2 });
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
      return d && toLocalISODate(d) === day.dateString;
    }));
    // Also find any runs logged on this day (for athletes)
    setSelectedRuns(athleteRuns.filter(run => {
      const d = run.date?.toDate?.();
      return d && toLocalISODate(d) === day.dateString;
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

  const getColor = (item) => typeColor(item.type);

  const formatDate = (item) => {
    const d = item.date?.toDate?.();
    if (!d) return '';
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  const upcomingItems = allItems.filter(e => e.date?.toDate?.() >= new Date());

  // Legend types — show the most common workout/event types
  const legendTypes = ['Easy', 'Tempo', 'Long Run', 'Intervals', 'Speed', 'Race'];

  // Format date for upcoming row left column
  const upcomingDateParts = (d) => {
    if (!d) return { dow: '', day: '' };
    return {
      dow: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
      day: d.getDate(),
    };
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={SIGNAL.color.inkSoft} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Team calendar</Text>
          <Text style={styles.headerEyebrow}>
            {(school?.name || 'Team')}{userData.schoolId ? ' · ' : ''}
            {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
        </View>
        {isCoach ? (
          <TouchableOpacity style={styles.addBtn} onPress={() => openNew()}>
            <Text style={styles.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        ) : <View style={{ width: 60 }} />}
      </View>

      <>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color={SIGNAL.color.indigo} /></View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

          {/* Month grid card */}
          <View style={styles.calendarCard}>
            <Calendar
              onDayPress={handleDayPress}
              markingType="multi-dot"
              markedDates={{
                ...markedDates,
                ...(selectedDate ? {
                  [selectedDate]: { ...(markedDates[selectedDate] || {}), selected: true, selectedColor: SIGNAL.color.indigo }
                } : {}),
              }}
              theme={{
                backgroundColor: SIGNAL.color.white,
                calendarBackground: SIGNAL.color.white,
                textSectionTitleColor: SIGNAL.color.mute2,
                selectedDayBackgroundColor: SIGNAL.color.indigo,
                selectedDayTextColor: SIGNAL.color.white,
                todayTextColor: SIGNAL.color.indigo,
                dayTextColor: SIGNAL.color.ink,
                textDisabledColor: SIGNAL.color.mute2,
                dotColor: SIGNAL.color.indigo,
                selectedDotColor: SIGNAL.color.white,
                arrowColor: SIGNAL.color.inkSoft,
                disabledArrowColor: SIGNAL.color.mute2,
                monthTextColor: SIGNAL.color.ink,
                indicatorColor: SIGNAL.color.indigo,
                textDayFontFamily: SIGNAL.font.bodySemi,
                textMonthFontFamily: SIGNAL.font.bodyBold,
                textDayHeaderFontFamily: SIGNAL.font.bodySemi,
                textDayFontWeight: '600',
                textMonthFontWeight: '700',
                textDayHeaderFontWeight: '600',
                textDayFontSize: 13,
                textMonthFontSize: 18,
                textDayHeaderFontSize: 10,
              }}
            />
          </View>

          {/* Legend */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.legend}>
            {legendTypes.map((t) => (
              <View key={t} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: typeColor(t) }]} />
                <Text style={styles.legendText}>{t}</Text>
              </View>
            ))}
            {(userData.role === 'athlete' || externalAthleteRuns) && (
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: SIGNAL.color.mute2 }]} />
                <Text style={styles.legendText}>{externalAthleteRuns ? 'Logged run' : 'My run'}</Text>
              </View>
            )}
          </ScrollView>

          {/* Selected day */}
          {selectedDate && (
            <View style={styles.section}>
              <Text style={styles.eyebrow}>
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </Text>
              {selectedItems.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No items on this day.</Text>
                  {isCoach && (
                    <TouchableOpacity
                      style={styles.addDayBtn}
                      onPress={() => openNew(new Date(selectedDate + 'T12:00:00'))}
                    >
                      <Text style={styles.addDayBtnText}>+ Add item</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : selectedItems.map(item => {
                const itemMiles = item.baseMiles || null;
                const c = getColor(item);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.workoutCard, { borderLeftWidth: 3, borderLeftColor: c }]}
                    onPress={() => { setDetailItem(item); setDetailVisible(true); }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.typePill, { backgroundColor: `${c}${SIGNAL.tint.chip}` }]}>
                      <View style={[styles.typePillDot, { backgroundColor: c }]} />
                      <Text style={[styles.typePillText, { color: c }]}>{item.type}</Text>
                    </View>
                    <View style={styles.workoutInfo}>
                      <Text style={styles.workoutTitle} numberOfLines={1}>
                        {item.title}
                        {itemMiles ? <Text style={styles.workoutMiles}>{`  —  ${itemMiles} mi`}</Text> : null}
                      </Text>
                      {trainingPaces && WORKOUT_PACE_ZONE[item.type] && (() => {
                        const zone = WORKOUT_PACE_ZONE[item.type];
                        const tp = trainingPaces;
                        const paceText = zone === 'easy' ? `${formatPace(tp.eLow)}–${formatPace(tp.eHigh)}/mi`
                          : zone === 'threshold' ? `${formatPace(tp.t)}/mi`
                          : zone === 'interval' ? `${formatPace(tp.i)}/mi`
                          : zone === 'repetition' ? `${formatPace(tp.r)}/mi` : null;
                        return paceText ? <Text style={styles.workoutPace}>Target {paceText}</Text> : null;
                      })()}
                      {item.description && <Text style={styles.workoutDesc} numberOfLines={1}>{item.description}</Text>}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={SIGNAL.color.mute2} />
                  </TouchableOpacity>
                );
              })}

              {/* Show athlete's logged runs for this day */}
              {selectedRuns.length > 0 && (
                <View style={styles.runsDaySection}>
                  <Text style={styles.eyebrow}>{externalAthleteRuns ? 'Logged runs' : 'My logged runs'}</Text>
                  {selectedRuns.map(run => (
                    <TouchableOpacity
                      key={run.id}
                      style={styles.runDayCard}
                      onPress={() => { setSelectedRunDetail(run); setRunDetailVisible(true); }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.runDayDot} />
                      <View style={styles.runDayInfo}>
                        <Text style={styles.runDayMiles}>{run.miles} miles</Text>
                        <Text style={styles.runDayDetail}>
                          {run.duration ? run.duration : ''}
                          {run.duration && run.heartRate ? ' · ' : ''}
                          {run.heartRate ? `${run.heartRate} bpm` : ''}
                        </Text>
                      </View>
                      {run.effort != null && (
                        <Text style={styles.runDayEffort}>Effort {run.effort}/10</Text>
                      )}
                      <Ionicons name="chevron-forward" size={16} color={SIGNAL.color.mute2} />
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
                <Text style={styles.emptyText}>{isCoach ? 'No upcoming items. Tap + Add to create one.' : 'Nothing upcoming yet.'}</Text>
              </View>
            ) : upcomingItems.map(item => {
              const d = item.date?.toDate?.();
              const { dow, day } = upcomingDateParts(d);
              const c = getColor(item);
              const itemMiles = item.baseMiles || null;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.upcomingCard}
                  onPress={() => { setDetailItem(item); setDetailVisible(true); }}
                  activeOpacity={0.7}
                >
                  <View style={styles.upcomingDateCol}>
                    <Text style={styles.upcomingDow}>{dow}</Text>
                    <Text style={styles.upcomingDay}>{day}</Text>
                  </View>
                  <View style={styles.upcomingDivider} />
                  <View style={[styles.typePill, { backgroundColor: `${c}${SIGNAL.tint.chip}` }]}>
                    <View style={[styles.typePillDot, { backgroundColor: c }]} />
                    <Text style={[styles.typePillText, { color: c }]}>{item.type}</Text>
                  </View>
                  <View style={styles.upcomingInfo}>
                    <Text style={styles.workoutTitle} numberOfLines={1}>
                      {item.title}
                      {itemMiles ? <Text style={styles.workoutMiles}>{`  —  ${itemMiles} mi`}</Text> : null}
                    </Text>
                    {trainingPaces && WORKOUT_PACE_ZONE[item.type] && (() => {
                      const zone = WORKOUT_PACE_ZONE[item.type];
                      const tp = trainingPaces;
                      const paceText = zone === 'easy' ? `${formatPace(tp.eLow)}–${formatPace(tp.eHigh)}/mi`
                        : zone === 'threshold' ? `${formatPace(tp.t)}/mi`
                        : zone === 'interval' ? `${formatPace(tp.i)}/mi`
                        : zone === 'repetition' ? `${formatPace(tp.r)}/mi` : null;
                      return paceText ? <Text style={styles.workoutPace}>Target {paceText}</Text> : null;
                    })()}
                    {item.description && <Text style={styles.workoutDesc} numberOfLines={1}>{item.description}</Text>}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={SIGNAL.color.mute2} />
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
              <Text style={styles.modalTitle}>{editingItem ? 'Edit item' : 'Add to calendar'}</Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}>
                <Text style={styles.modalSave}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">

              {/* Step 1: Category */}
              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.categoryRow}>
                {Object.keys(CATEGORIES).map(cat => {
                  const active = category === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.categoryBtn,
                        active && { backgroundColor: SIGNAL.color.ink, borderColor: SIGNAL.color.ink },
                      ]}
                      onPress={() => handleCategoryChange(cat)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.categoryBtnText, active && { color: SIGNAL.color.white }]}>
                        {CATEGORIES[cat].label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Step 2: Type — only shows types for selected category */}
              <Text style={styles.fieldLabel}>Type</Text>
              <View style={styles.typeGrid}>
                {CATEGORIES[category].types.map(t => {
                  const c = typeColor(t);
                  const active = type === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[
                        styles.typeChip,
                        { backgroundColor: `${c}${SIGNAL.tint.chip}` },
                        active && { backgroundColor: c },
                      ]}
                      onPress={() => setType(t)}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.typeChipDot, { backgroundColor: active ? SIGNAL.color.white : c }]} />
                      <Text style={[styles.typeChipText, { color: active ? SIGNAL.color.white : c }]}>{t}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Title */}
              <Text style={styles.fieldLabel}>Title *</Text>
              <TextInput
                style={styles.input}
                placeholder={category === 'Training' ? 'e.g. Tuesday tempo' : 'e.g. State championship'}
                placeholderTextColor={SIGNAL.color.mute2}
                value={title}
                onChangeText={setTitle}
              />

              {/* Date and time */}
              <DatePickerField label="Date *" value={date} onChange={setDate} primaryColor={SIGNAL.color.indigo} />
              <DatePickerField label="Start time (optional)" value={time} onChange={setTime} primaryColor={SIGNAL.color.indigo} mode="time" />

              {/* Multi-day toggle */}
              <View style={styles.multiDayRow}>
                <View style={styles.multiDayLeft}>
                  <Text style={styles.fieldLabel}>Multi-day event?</Text>
                  <Text style={styles.multiDayHint}>Camp, overnight trip, multi-day meet</Text>
                </View>
                <TouchableOpacity
                  style={[styles.multiDayToggle, isMultiDay && { backgroundColor: SIGNAL.color.indigo, borderColor: SIGNAL.color.indigo }]}
                  onPress={() => { setIsMultiDay(v => !v); if (isMultiDay) setEndDate(null); }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.multiDayToggleText, isMultiDay && { color: SIGNAL.color.white }]}>
                    {isMultiDay ? 'On' : 'Off'}
                  </Text>
                </TouchableOpacity>
              </View>

              {isMultiDay && (
                <DatePickerField
                  label="End date *"
                  value={endDate}
                  onChange={setEndDate}
                  primaryColor={SIGNAL.color.indigo}
                  minimumDate={date || undefined}
                />
              )}

              {/* Location */}
              <Text style={styles.fieldLabel}>Location (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Camel's Back Park"
                placeholderTextColor={SIGNAL.color.mute2}
                value={location}
                onChangeText={setLocation}
              />

              {/* Description */}
              <Text style={styles.fieldLabel}>{category === 'Training' ? 'Workout details' : 'Description'} (optional)</Text>
              <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                placeholder={category === 'Training' ? 'Distance, pace, sets/reps, structure…' : 'Event details…'}
                placeholderTextColor={SIGNAL.color.mute2}
                value={description}
                onChangeText={setDescription}
                multiline
              />

              {/* Notes */}
              <Text style={styles.fieldLabel}>Notes (optional)</Text>
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                placeholder="Warmup info, gear, directions, reminders…"
                placeholderTextColor={SIGNAL.color.mute2}
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
                      placeholderTextColor={SIGNAL.color.mute2}
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
                          placeholderTextColor={SIGNAL.color.mute2}
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
  // ── Screen ────────────────────────────────────────────────────────────────
  container: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    backgroundColor: SIGNAL.color.white,
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: 14,
    paddingHorizontal: SIGNAL.space.screen,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 2,
  },
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 22,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.titleTight,
    lineHeight: 24,
  },
  headerEyebrow: {
    ...SIGNAL.style.eyebrow,
    marginTop: 4,
  },
  addBtn: {
    backgroundColor: SIGNAL.color.ink,
    borderRadius: SIGNAL.radius.control,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addBtnText: {
    color: SIGNAL.color.white,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    fontSize: 12.5,
  },

  // ── Loading / scroll ──────────────────────────────────────────────────────
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: {
    padding: SIGNAL.space.screen,
    paddingBottom: 120,
  },

  // ── Calendar card ─────────────────────────────────────────────────────────
  calendarCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    ...SIGNAL.border.hairline,
    paddingVertical: 6,
    paddingHorizontal: 4,
    overflow: 'hidden',
  },

  // ── Legend ────────────────────────────────────────────────────────────────
  legend: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 14,
    alignItems: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  legendText: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 11,
    color: SIGNAL.color.mute,
  },

  // ── Sections ──────────────────────────────────────────────────────────────
  section: {
    marginTop: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 18,
    color: SIGNAL.color.indigo,
    letterSpacing: -0.36,
    marginBottom: 10,
    paddingLeft: 2,
  },
  eyebrow: {
    ...SIGNAL.style.eyebrow,
    marginBottom: 10,
    paddingLeft: 2,
  },

  // ── Empty card ────────────────────────────────────────────────────────────
  emptyCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    ...SIGNAL.border.hairline,
    padding: 18,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    fontFamily: SIGNAL.font.body,
    color: SIGNAL.color.mute,
    fontSize: 13,
    textAlign: 'center',
  },
  addDayBtn: {
    borderWidth: 1,
    borderColor: SIGNAL.color.indigo,
    borderRadius: SIGNAL.radius.control,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  addDayBtnText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 12,
    color: SIGNAL.color.indigo,
  },

  // ── Workout card (selected day list) ──────────────────────────────────────
  workoutCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    ...SIGNAL.border.hairline,
    paddingVertical: 12,
    paddingHorizontal: 13,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  workoutInfo: { flex: 1, minWidth: 0 },
  workoutTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 14,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  workoutMiles: {
    fontFamily: SIGNAL.font.bodyMedium,
    color: SIGNAL.color.mute,
    fontWeight: '500',
  },
  workoutPace: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 11,
    color: SIGNAL.color.indigo,
    marginTop: 3,
  },
  workoutDesc: {
    fontFamily: SIGNAL.font.body,
    fontSize: 12,
    color: SIGNAL.color.mute,
    marginTop: 3,
  },

  // ── Type pill (used on cards) ─────────────────────────────────────────────
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: SIGNAL.radius.chip,
    alignSelf: 'flex-start',
  },
  typePillDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  typePillText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 11,
    fontWeight: '600',
  },

  // ── Logged-runs subsection ────────────────────────────────────────────────
  runsDaySection: {
    marginTop: 14,
  },
  runDayCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    ...SIGNAL.border.hairline,
    paddingVertical: 12,
    paddingHorizontal: 13,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  runDayDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: SIGNAL.color.mute2,
  },
  runDayInfo: { flex: 1 },
  runDayMiles: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 14,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  runDayDetail: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 11,
    color: SIGNAL.color.mute,
    marginTop: 2,
  },
  runDayEffort: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 12,
    color: SIGNAL.color.emerald,
    fontWeight: '600',
  },

  // ── Upcoming row card ─────────────────────────────────────────────────────
  upcomingCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    ...SIGNAL.border.hairline,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  upcomingDateCol: {
    width: 42,
    alignItems: 'center',
  },
  upcomingDow: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 9.5,
    color: SIGNAL.color.mute2,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  upcomingDay: {
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 17,
    color: SIGNAL.color.ink,
    letterSpacing: -0.5,
    marginTop: 1,
  },
  upcomingDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: SIGNAL.color.line,
  },
  upcomingInfo: { flex: 1, minWidth: 0 },

  // ── Modal (add / edit) ────────────────────────────────────────────────────
  modal: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SIGNAL.space.screen,
    paddingVertical: 14,
    paddingTop: Platform.OS === 'ios' ? 20 : 14,
    backgroundColor: SIGNAL.color.white,
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  modalTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 16,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  modalCancel: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 15,
    color: SIGNAL.color.mute,
    width: 70,
  },
  modalSave: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 15,
    color: SIGNAL.color.indigo,
    width: 70,
    textAlign: 'right',
  },
  modalScroll: { flex: 1 },
  modalScrollContent: {
    padding: SIGNAL.space.screen,
    paddingBottom: 40,
  },

  fieldLabel: {
    ...SIGNAL.style.eyebrow,
    marginBottom: 8,
    marginTop: 12,
  },

  // ── Category buttons ──────────────────────────────────────────────────────
  categoryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 6,
  },
  categoryBtn: {
    flex: 1,
    borderRadius: SIGNAL.radius.button,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    backgroundColor: SIGNAL.color.white,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  categoryBtnText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 14,
    color: SIGNAL.color.inkSoft,
  },

  // ── Type chips ────────────────────────────────────────────────────────────
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: SIGNAL.radius.chip,
  },
  typeChipDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  typeChipText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 12,
    fontWeight: '600',
  },

  // ── Inputs ────────────────────────────────────────────────────────────────
  input: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.control,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: SIGNAL.font.body,
    fontSize: 15,
    color: SIGNAL.color.ink,
    marginBottom: 4,
  },

  // ── Multi-day row ─────────────────────────────────────────────────────────
  multiDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 6,
  },
  multiDayLeft: { flex: 1 },
  multiDayHint: {
    fontFamily: SIGNAL.font.body,
    fontSize: 12,
    color: SIGNAL.color.mute,
    marginTop: 2,
  },
  multiDayToggle: {
    borderRadius: SIGNAL.radius.control,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: SIGNAL.color.white,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    minWidth: 64,
    alignItems: 'center',
  },
  multiDayToggleText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 13,
    color: SIGNAL.color.inkSoft,
  },

  // ── Mileage by group ──────────────────────────────────────────────────────
  mileageSection: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: SIGNAL.color.line,
  },
  mileageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  mileageLabel: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 13,
    color: SIGNAL.color.inkSoft,
    width: 100,
  },
  mileageInput: {
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    borderRadius: SIGNAL.radius.control,
    paddingVertical: 8,
    paddingHorizontal: 10,
    width: 80,
    textAlign: 'center',
    fontFamily: SIGNAL.font.mono,
    fontSize: 14,
    backgroundColor: SIGNAL.color.white,
    color: SIGNAL.color.ink,
  },
  mileageTotal: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 12,
    color: SIGNAL.color.mute,
  },
});
