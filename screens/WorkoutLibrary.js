import { Ionicons } from '@expo/vector-icons';
import {
    addDoc,
    collection,
    deleteDoc, doc,
    getDocs,
    query,
    serverTimestamp,
    where,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { db } from '../firebaseConfig';
import { BRAND, BRAND_DARK, FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE, STATUS } from '../constants/design';

// ── Built-in workout library organized by phase ───────────────────────────────
export const BUILTIN_WORKOUTS = {
  'Summer Base': [
    { name: 'Easy long run', type: 'Long Run', duration: '60-75 min', description: 'Conversational pace the entire run. Zone 1-2 only. No watch-checking — run by feel.', phase: 'Summer Base' },
    { name: 'Team group run', type: 'Easy', duration: '40-50 min', description: 'All athletes run together at the slowest athlete\'s pace. Culture run — conversation required.', phase: 'Summer Base' },
    { name: 'Strides workout', type: 'Easy', duration: '35 min + strides', description: '30 min easy, then 6x20-second strides at 5K effort with 90 sec walk recovery. Keeps turnover sharp.', phase: 'Summer Base' },
  ],
  'Pre-Season Base': [
    { name: 'Aerobic base run', type: 'Easy', duration: '45-55 min', description: 'Zone 2 the entire run. HR should stay under 75% max. Talk test — you should be able to speak in sentences.', phase: 'Pre-Season Base' },
    { name: 'Hill repeats (easy)', type: 'Hills', duration: '50 min', description: '20 min warmup, 8x60-sec hill at controlled effort, jog back down recovery, 15 min cooldown. Strength without speed.', phase: 'Pre-Season Base' },
    { name: 'Long run', type: 'Long Run', duration: '70-85 min', description: 'Season\'s first long run. Easy effort throughout. Build to this distance over 2-3 weeks.', phase: 'Pre-Season Base' },
    { name: 'Time trial 2 mile', type: 'Race Effort', duration: '35 min total', description: '15 min warmup, 2-mile time trial at honest effort, 10 min cooldown. Baseline fitness assessment.', phase: 'Pre-Season Base' },
  ],
  'Build': [
    { name: 'Classic tempo run', type: 'Tempo', duration: '50 min', description: '15 min warmup, 20 min continuous tempo at lactate threshold (comfortably hard — 7/10 effort), 15 min cooldown.', phase: 'Build' },
    { name: 'Cruise intervals', type: 'Intervals', duration: '55 min', description: '15 min warmup, 5x5min at tempo pace with 60 sec jog recovery, 15 min cooldown. More manageable than continuous tempo.', phase: 'Build' },
    { name: '1-mile repeats', type: 'Intervals', duration: '60 min', description: '15 min warmup, 4x1 mile at 5K pace with 3 min jog recovery, 10 min cooldown. Race pace development.', phase: 'Build' },
    { name: 'Fartlek run', type: 'Tempo', duration: '45 min', description: 'Swedish speed play — 30 min continuous with random surges of 1-3 min at tempo effort mixed with easy recovery. Unstructured quality.', phase: 'Build' },
  ],
  'Competition': [
    { name: 'Pack workout', type: 'Intervals', duration: '55 min', description: '15 min warmup, 3x2 mile at goal 5K pace running as a PACK. All 5 scorers must finish within 5 seconds. 5 min jog recovery.', phase: 'Competition' },
    { name: 'Race simulation', type: 'Race Effort', duration: '50 min', description: '15 min warmup, 3-mile time trial at race effort on course terrain, 15 min cooldown. Dress rehearsal.', phase: 'Competition' },
    { name: '400m repeats', type: 'Intervals', duration: '50 min', description: '15 min warmup, 10x400m at mile race pace with 90 sec recovery, 15 min cooldown. Sharpens race speed.', phase: 'Competition' },
    { name: 'Cutdown run', type: 'Tempo', duration: '45 min', description: '4 miles starting at easy pace, cutting down 15 sec/mile each mile. Teaches athletes to finish strong.', phase: 'Competition' },
  ],
  'Peak': [
    { name: 'Sharpening intervals', type: 'Intervals', duration: '40 min', description: '15 min warmup, 6x800m at 5K pace with 90 sec recovery, 10 min cooldown. Fast but short — sharpen the edge.', phase: 'Peak' },
    { name: 'Race pace confidence', type: 'Tempo', duration: '35 min', description: '15 min warmup, 10 min at goal race pace feeling controlled, 10 min cooldown. This should feel easier than it did in October.', phase: 'Peak' },
  ],
  'Taper': [
    { name: 'Taper strides', type: 'Easy', duration: '30 min', description: '20 min very easy, 6x15-second strides at race pace. Legs should feel light and quick. No fatigue allowed.', phase: 'Taper' },
    { name: 'Pre-race shake-out', type: 'Easy', duration: '20 min', description: 'Day before championship. 15 min very easy jog, 4 short strides. The goal is freshness, not fitness.', phase: 'Taper' },
  ],
  'Indoor Track': [
    { name: '1000m repeats', type: 'Intervals', duration: '55 min', description: '15 min warmup, 6x1000m at mile race pace with 2 min recovery, 10 min cooldown. Core indoor track workout.', phase: 'Indoor Track' },
    { name: 'Speed development', type: 'Intervals', duration: '45 min', description: '15 min warmup, 12x200m at faster than mile pace with 200m jog recovery, 10 min cooldown. Pure speed.', phase: 'Indoor Track' },
    { name: 'DMR simulation', type: 'Race Effort', duration: '50 min', description: 'Practice full DMR exchange and leg assignments. Each runner runs their leg at race effort. Time the full relay.', phase: 'Indoor Track' },
  ],
  'Outdoor Track': [
    { name: '3200m race prep', type: 'Intervals', duration: '60 min', description: '15 min warmup, 3x1600m at 3200m race pace with 4 min recovery, 10 min cooldown. Event-specific preparation.', phase: 'Outdoor Track' },
    { name: 'Steeplechase barriers', type: 'Intervals', duration: '50 min', description: '15 min warmup, 6x steeplechase loop with barriers at race effort, jog back recovery. Technique and fitness.', phase: 'Outdoor Track' },
    { name: 'Relay exchange practice', type: 'Easy', duration: '45 min', description: '20 min easy warm-up, 30 min of baton exchange practice at race speed. Clean exchanges win relays.', phase: 'Outdoor Track' },
  ],
};

const PHASES = Object.keys(BUILTIN_WORKOUTS);

const TYPE_COLORS = {
  'Easy':        '#4caf50',
  'Long Run':    '#2196f3',
  'Tempo':       '#ff9800',
  'Intervals':   '#f44336',
  'Hills':       '#795548',
  'Race Effort': '#9c27b0',
};

export default function WorkoutLibrary({ school, schoolId, userData, onClose, onAddToCalendar }) {
  const [activeTab,       setActiveTab]       = useState('builtin');
  const [selectedPhase,   setSelectedPhase]   = useState(PHASES[0]);
  const [savedWorkouts,   setSavedWorkouts]   = useState([]);
  const [loadingSaved,    setLoadingSaved]    = useState(true);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [detailVisible,   setDetailVisible]   = useState(false);

  const primaryColor = '#213f96';
  const isCoach = userData?.role === 'admin_coach' || userData?.role === 'assistant_coach';

  useEffect(() => { loadSavedWorkouts(); }, []);

  const loadSavedWorkouts = async () => {
    setLoadingSaved(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'workoutLibrary'),
        where('schoolId', '==', schoolId)
      ));
      setSavedWorkouts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error('Load saved workouts:', e); }
    setLoadingSaved(false);
  };

  const handleSaveToLibrary = async (workout) => {
    try {
      await addDoc(collection(db, 'workoutLibrary'), {
        ...workout,
        schoolId,
        savedBy: userData?.uid || '',
        savedByName: `${userData?.firstName} ${userData?.lastName}`,
        savedAt: serverTimestamp(),
        isCustom: false,
      });
      Alert.alert('Saved! ✅', `"${workout.name}" added to your library.`);
      loadSavedWorkouts();
    } catch (e) {
      Alert.alert('Error', 'Could not save workout. Please try again.');
    }
  };

  const handleDeleteSaved = (workout) => {
    Alert.alert('Remove workout?', `Remove "${workout.name}" from your library?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await deleteDoc(doc(db, 'workoutLibrary', workout.id));
          setSavedWorkouts(prev => prev.filter(w => w.id !== workout.id));
        } catch { Alert.alert('Error', 'Could not remove workout.'); }
      }},
    ]);
  };

  const openDetail = (workout) => {
    setSelectedWorkout(workout);
    setDetailVisible(true);
  };

  const isAlreadySaved = (workoutName) => {
    return savedWorkouts.some(w => w.name === workoutName);
  };

  const renderWorkoutCard = (workout, showSave = true, showDelete = false) => (
    <TouchableOpacity
      key={workout.name || workout.id}
      style={styles.workoutCard}
      onPress={() => openDetail(workout)}
    >
      <View style={styles.workoutCardTop}>
        <View style={[styles.typeBadge, { backgroundColor: TYPE_COLORS[workout.type] || primaryColor }]}>
          <Text style={styles.typeBadgeText}>{workout.type}</Text>
        </View>
        <Text style={styles.workoutDuration}>{workout.duration}</Text>
      </View>
      <Text style={styles.workoutName}>{workout.name}</Text>
      <Text style={styles.workoutDesc} numberOfLines={2}>{workout.description}</Text>

      {isCoach && (
        <View style={styles.workoutActions}>
          {showSave && !isAlreadySaved(workout.name) && (
            <TouchableOpacity
              style={[styles.saveBtn, { borderColor: primaryColor }]}
              onPress={(e) => { e.stopPropagation?.(); handleSaveToLibrary(workout); }}
            >
              <Text style={[styles.saveBtnText, { color: primaryColor }]}>+ Save to library</Text>
            </TouchableOpacity>
          )}
          {showSave && isAlreadySaved(workout.name) && (
            <Text style={styles.savedLabel}>✓ In your library</Text>
          )}
          {showDelete && (
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={(e) => { e.stopPropagation?.(); handleDeleteSaved(workout); }}
            >
              <Text style={styles.deleteBtnText}>Remove</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.addCalBtn, { backgroundColor: primaryColor }]}
            onPress={(e) => { e.stopPropagation?.(); onAddToCalendar && onAddToCalendar(workout); }}
          >
            <Text style={styles.addCalBtnText}>+ Add to calendar</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={BRAND_DARK} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Workout Library</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {['builtin', 'saved'].map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && { borderBottomColor: primaryColor, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && { color: primaryColor, fontWeight: '700' }]}>
              {tab === 'builtin' ? 'Classic workouts' : `Your library${savedWorkouts.length > 0 ? ` (${savedWorkouts.length})` : ''}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'builtin' ? (
        <>
          {/* Phase filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.phaseScroll} contentContainerStyle={styles.phaseScrollContent}>
            {PHASES.map(phase => (
              <TouchableOpacity
                key={phase}
                style={[styles.phaseChip, selectedPhase === phase && { backgroundColor: primaryColor, borderColor: primaryColor }]}
                onPress={() => setSelectedPhase(phase)}
              >
                <Text style={[styles.phaseChipText, selectedPhase === phase && { color: '#fff' }]}>{phase}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
              <Text style={styles.sectionSubtitle}>
                {BUILTIN_WORKOUTS[selectedPhase]?.length} workouts for {selectedPhase} phase
              </Text>
              {(BUILTIN_WORKOUTS[selectedPhase] || []).map(w => renderWorkoutCard(w, true, false))}
            </View>
            <View style={{ height: 40 }} />
          </ScrollView>
        </>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {loadingSaved ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={primaryColor} />
          ) : savedWorkouts.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Your library is empty</Text>
              <Text style={styles.emptySubtitle}>
                Browse classic workouts and tap "+ Save to library" to build your collection.
              </Text>
            </View>
          ) : (
            <View style={styles.section}>
              {savedWorkouts.map(w => renderWorkoutCard(w, false, isCoach))}
            </View>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Workout detail modal */}
      <Modal visible={detailVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.detailModal}>
          <View style={[styles.detailHeader, { backgroundColor: TYPE_COLORS[selectedWorkout?.type] || primaryColor }]}>
            <TouchableOpacity onPress={() => setDetailVisible(false)}>
              <Text style={styles.detailClose}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.detailTitle}>{selectedWorkout?.name}</Text>
            <View style={{ width: 32 }} />
          </View>
          <ScrollView style={styles.detailScroll}>
            <View style={styles.detailBody}>
              <View style={styles.detailMetaRow}>
                <View style={[styles.typeBadge, { backgroundColor: TYPE_COLORS[selectedWorkout?.type] || primaryColor }]}>
                  <Text style={styles.typeBadgeText}>{selectedWorkout?.type}</Text>
                </View>
                <Text style={styles.detailDuration}>{selectedWorkout?.duration}</Text>
                {selectedWorkout?.phase && (
                  <Text style={styles.detailPhase}>{selectedWorkout.phase}</Text>
                )}
              </View>
              <Text style={styles.detailDesc}>{selectedWorkout?.description}</Text>

              {isCoach && (
                <View style={styles.detailActions}>
                  {selectedWorkout && !isAlreadySaved(selectedWorkout.name) && (
                    <TouchableOpacity
                      style={[styles.detailSaveBtn, { borderColor: primaryColor }]}
                      onPress={() => { handleSaveToLibrary(selectedWorkout); setDetailVisible(false); }}
                    >
                      <Text style={[styles.detailSaveBtnText, { color: primaryColor }]}>+ Save to library</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.detailCalBtn, { backgroundColor: primaryColor }]}
                    onPress={() => { setDetailVisible(false); onAddToCalendar && onAddToCalendar(selectedWorkout); }}
                  >
                    <Text style={styles.detailCalBtnText}>Add to calendar</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#F5F6FA' },
  header:           { backgroundColor: '#fff', paddingTop: Platform.OS === 'ios' ? 56 : 32, paddingBottom: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn:          { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
  backText:         { color: '#111827', fontSize: 15, fontWeight: '600' },
  headerTitle:      { fontSize: 20, fontWeight: '700', color: '#111827' },
  tabRow:           { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  tab:              { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText:          { fontSize: 14, color: '#6B7280' },
  phaseScroll:      { backgroundColor: '#fff', maxHeight: 54 },
  phaseScrollContent:{ paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  phaseChip:        { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#F5F6FA' },
  phaseChipText:    { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  scroll:           { flex: 1 },
  section:          { padding: 16 },
  sectionSubtitle:  { fontSize: 13, color: '#9CA3AF', marginBottom: 12 },
  workoutCard:      { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12 },
  workoutCardTop:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  typeBadge:        { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  typeBadgeText:    { color: '#fff', fontSize: 11, fontWeight: '700' },
  workoutDuration:  { fontSize: 12, color: '#9CA3AF' },
  workoutName:      { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 4 },
  workoutDesc:      { fontSize: 13, color: '#6B7280', lineHeight: 18, marginBottom: 10 },
  workoutActions:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  saveBtn:          { borderRadius: 8, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 7 },
  saveBtnText:      { fontSize: 13, fontWeight: '600' },
  savedLabel:       { fontSize: 13, color: '#4caf50', fontWeight: '600', alignSelf: 'center' },
  deleteBtn:        { borderRadius: 8, borderWidth: 1.5, borderColor: '#dc2626', paddingHorizontal: 12, paddingVertical: 7 },
  deleteBtnText:    { fontSize: 13, fontWeight: '600', color: '#dc2626' },
  addCalBtn:        { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  addCalBtnText:    { color: '#fff', fontSize: 13, fontWeight: '700' },
  emptyCard:        { margin: 16, backgroundColor: '#fff', borderRadius: 14, padding: 32, alignItems: 'center' },
  emptyTitle:       { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 8 },
  emptySubtitle:    { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  detailModal:      { flex: 1, backgroundColor: '#F5F6FA' },
  detailHeader:     { paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailClose:      { color: '#fff', fontSize: 20, fontWeight: '600', width: 32 },
  detailTitle:      { fontSize: 18, fontWeight: 'bold', color: '#fff', flex: 1, textAlign: 'center' },
  detailScroll:     { flex: 1 },
  detailBody:       { padding: 24 },
  detailMetaRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  detailDuration:   { fontSize: 14, color: '#6B7280' },
  detailPhase:      { fontSize: 13, color: '#9CA3AF' },
  detailDesc:       { fontSize: 16, color: '#111827', lineHeight: 26, marginBottom: 24 },
  detailActions:    { gap: 12 },
  detailSaveBtn:    { borderRadius: 12, borderWidth: 1.5, padding: 14, alignItems: 'center' },
  detailSaveBtnText:{ fontSize: 15, fontWeight: '600' },
  detailCalBtn:     { borderRadius: 12, padding: 16, alignItems: 'center' },
  detailCalBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});