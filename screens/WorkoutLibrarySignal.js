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
import { BRAND, BRAND_DARK, FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SIGNAL, SPACE, STATUS } from '../constants/design';
import { SIGNAL_TYPE_COLORS } from '../constants/training';

// ── Built-in workout library organized by phase ───────────────────────────────
export const BUILTIN_WORKOUTS = {
  'Summer Base': [
    { name: 'Easy long run', type: 'Long Run', duration: '60-75 min', description: 'Conversational pace the entire run. Easy pace only. No watch-checking — run by feel.', phase: 'Summer Base' },
    { name: 'Team group run', type: 'Easy', duration: '40-50 min', description: 'All athletes run together at the slowest athlete\'s pace. Culture run — conversation required.', phase: 'Summer Base' },
    { name: 'Strides workout', type: 'Easy', duration: '35 min + strides', description: '30 min easy, then 6x20-second strides at 5K effort with 90 sec walk recovery. Keeps turnover sharp.', phase: 'Summer Base' },
  ],
  'Pre-Season Base': [
    { name: 'Aerobic base run', type: 'Easy', duration: '45-55 min', description: 'Easy pace the entire run. Conversational effort — you should be able to speak in full sentences. Run by feel, not the watch.', phase: 'Pre-Season Base' },
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

// Local fallback colors for types not in SIGNAL_TYPE_COLORS (e.g. 'Race Effort')
const SIGNAL_TYPE_FALLBACK = {
  'Race Effort': SIGNAL.color.pink,
};

const typeColor = (type) => SIGNAL_TYPE_COLORS[type] || SIGNAL_TYPE_FALLBACK[type] || SIGNAL.color.indigo;

export default function WorkoutLibrarySignal({ school, schoolId, userData, onClose, onAddToCalendar }) {
  const [activeTab,       setActiveTab]       = useState('builtin');
  const [selectedPhase,   setSelectedPhase]   = useState(PHASES[0]);
  const [savedWorkouts,   setSavedWorkouts]   = useState([]);
  const [loadingSaved,    setLoadingSaved]    = useState(true);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [detailVisible,   setDetailVisible]   = useState(false);

  const primaryColor = SIGNAL.color.indigo;
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

  const renderWorkoutCard = (workout, showSave = true, showDelete = false) => {
    const c = typeColor(workout.type);
    return (
      <TouchableOpacity
        key={workout.name || workout.id}
        style={[styles.workoutCard, { borderLeftWidth: 3, borderLeftColor: c }]}
        activeOpacity={0.85}
        onPress={() => openDetail(workout)}
      >
        <View style={styles.workoutCardTop}>
          <Text style={styles.workoutName}>{workout.name}</Text>
          <Text style={styles.workoutDuration}>{workout.duration}</Text>
        </View>

        <View style={[styles.typeChip, { backgroundColor: `${c}1A` }]}>
          <View style={[styles.typeDot, { backgroundColor: c }]} />
          <Text style={[styles.typeChipText, { color: c }]}>{workout.type}</Text>
        </View>

        <Text style={styles.workoutDesc} numberOfLines={3}>{workout.description}</Text>

        {isCoach && (
          <View style={styles.workoutActions}>
            {showSave && !isAlreadySaved(workout.name) && (
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={(e) => { e.stopPropagation?.(); handleSaveToLibrary(workout); }}
              >
                <Text style={styles.saveBtnText}>+ Save to library</Text>
              </TouchableOpacity>
            )}
            {showSave && isAlreadySaved(workout.name) && (
              <View style={styles.savedPill}>
                <Text style={styles.savedLabel}>✓ In your library</Text>
              </View>
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
              style={styles.addCalBtn}
              onPress={(e) => { e.stopPropagation?.(); onAddToCalendar && onAddToCalendar(workout); }}
            >
              <Text style={styles.addCalBtnText}>+ Add to calendar</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn} hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}>
          <Ionicons name="chevron-back" size={20} color={SIGNAL.color.inkSoft} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Workout library</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {['builtin', 'saved'].map(tab => {
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={styles.tab}
              activeOpacity={0.7}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab === 'builtin' ? 'Classic' : `Your library${savedWorkouts.length > 0 ? ` (${savedWorkouts.length})` : ''}`}
              </Text>
              {isActive && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {activeTab === 'builtin' ? (
        <>
          {/* Phase filter */}
          <View style={styles.phaseWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.phaseScrollContent}
            >
              {PHASES.map(phase => {
                const on = selectedPhase === phase;
                return (
                  <TouchableOpacity
                    key={phase}
                    style={[styles.phaseChip, on && styles.phaseChipActive]}
                    activeOpacity={0.85}
                    onPress={() => setSelectedPhase(phase)}
                  >
                    <Text style={[styles.phaseChipText, on && styles.phaseChipTextActive]}>{phase}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
              <Text style={styles.eyebrow}>
                {BUILTIN_WORKOUTS[selectedPhase]?.length} WORKOUTS FOR {selectedPhase.toUpperCase()} PHASE
              </Text>
              <View style={{ height: 10 }} />
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
              <Text style={styles.eyebrow}>
                {savedWorkouts.length} SAVED WORKOUT{savedWorkouts.length === 1 ? '' : 'S'}
              </Text>
              <View style={{ height: 10 }} />
              {savedWorkouts.map(w => renderWorkoutCard(w, false, isCoach))}
            </View>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Workout detail modal */}
      <Modal visible={detailVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.detailModal}>
          <View style={styles.detailHeader}>
            <TouchableOpacity onPress={() => setDetailVisible(false)} hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}>
              <Ionicons name="close" size={22} color={SIGNAL.color.inkSoft} />
            </TouchableOpacity>
            <Text style={styles.detailTitle} numberOfLines={1}>{selectedWorkout?.name}</Text>
            <View style={{ width: 22 }} />
          </View>
          <ScrollView style={styles.detailScroll}>
            <View style={styles.detailBody}>
              <View style={styles.detailMetaRow}>
                {selectedWorkout && (
                  <View style={[styles.typeChip, { backgroundColor: `${typeColor(selectedWorkout?.type)}1A` }]}>
                    <View style={[styles.typeDot, { backgroundColor: typeColor(selectedWorkout?.type) }]} />
                    <Text style={[styles.typeChipText, { color: typeColor(selectedWorkout?.type) }]}>{selectedWorkout?.type}</Text>
                  </View>
                )}
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
                      style={styles.detailSaveBtn}
                      onPress={() => { handleSaveToLibrary(selectedWorkout); setDetailVisible(false); }}
                    >
                      <Text style={styles.detailSaveBtnText}>+ Save to library</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.detailCalBtn}
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
  container: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },

  // ── Header ─────────────────────────────────────────────
  header: {
    backgroundColor: SIGNAL.color.white,
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: 12,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 6,
    width: 60,
  },
  backText: {
    color: SIGNAL.color.inkSoft,
    fontSize: 14,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    color: SIGNAL.color.indigo,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    letterSpacing: -0.2,
  },

  // ── Tabs ───────────────────────────────────────────────
  tabRow: {
    flexDirection: 'row',
    backgroundColor: SIGNAL.color.white,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tabText: {
    fontSize: 13,
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  tabTextActive: {
    color: SIGNAL.color.indigo,
  },
  tabIndicator: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 0,
    height: 2,
    backgroundColor: SIGNAL.color.indigo,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },

  // ── Phase chips ────────────────────────────────────────
  phaseWrap: {
    backgroundColor: SIGNAL.color.white,
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  phaseScrollContent: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 7,
    flexDirection: 'row',
  },
  phaseChip: {
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    backgroundColor: SIGNAL.color.white,
  },
  phaseChipActive: {
    backgroundColor: SIGNAL.color.indigo,
    borderColor: SIGNAL.color.indigo,
  },
  phaseChipText: {
    fontSize: 12,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    color: SIGNAL.color.inkSoft,
  },
  phaseChipTextActive: {
    color: SIGNAL.color.white,
  },

  // ── Scroll / section ───────────────────────────────────
  scroll: { flex: 1 },
  section: { padding: 14, paddingTop: 14 },
  eyebrow: {
    ...SIGNAL.style.eyebrow,
    paddingLeft: 2,
  },

  // ── Workout card ───────────────────────────────────────
  workoutCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    padding: 16,
    marginBottom: 10,
  },
  workoutCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  workoutName: {
    flex: 1,
    fontSize: 15,
    color: SIGNAL.color.ink,
    fontFamily: SIGNAL.font.bodyBold,
    fontWeight: '700',
    letterSpacing: -0.15,
  },
  workoutDuration: {
    fontSize: 11,
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.mono,
  },

  // ── Type chip (dot + label) ────────────────────────────
  typeChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    marginBottom: 10,
  },
  typeDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
  },
  typeChipText: {
    fontSize: 11,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
  },

  workoutDesc: {
    fontSize: 13,
    color: SIGNAL.color.inkSoft,
    lineHeight: 19,
    fontFamily: SIGNAL.font.body,
    marginBottom: 12,
  },

  // ── Workout card actions ───────────────────────────────
  workoutActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: SIGNAL.color.line,
  },
  saveBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SIGNAL.color.indigo,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: 'transparent',
  },
  saveBtnText: {
    fontSize: 12.5,
    color: SIGNAL.color.indigo,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
  },
  savedPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: `${SIGNAL.color.emerald}1A`,
    alignSelf: 'center',
  },
  savedLabel: {
    fontSize: 12.5,
    color: SIGNAL.color.emerald,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
  },
  deleteBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SIGNAL.color.coral,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  deleteBtnText: {
    fontSize: 12.5,
    color: SIGNAL.color.coral,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
  },
  addCalBtn: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: SIGNAL.color.indigo,
    marginLeft: 'auto',
  },
  addCalBtnText: {
    color: SIGNAL.color.white,
    fontSize: 12.5,
    fontFamily: SIGNAL.font.bodyBold,
    fontWeight: '700',
  },

  // ── Empty state ────────────────────────────────────────
  emptyCard: {
    margin: 14,
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    padding: 32,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    color: SIGNAL.color.ink,
    fontFamily: SIGNAL.font.bodyBold,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13.5,
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.body,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Detail modal ───────────────────────────────────────
  detailModal: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },
  detailHeader: {
    paddingTop: Platform.OS === 'ios' ? 18 : 18,
    paddingBottom: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: SIGNAL.color.white,
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  detailTitle: {
    flex: 1,
    fontSize: 18,
    color: SIGNAL.color.indigo,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 8,
    letterSpacing: -0.2,
  },
  detailScroll: { flex: 1 },
  detailBody: { padding: 22 },
  detailMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
    flexWrap: 'wrap',
  },
  detailDuration: {
    fontSize: 13,
    color: SIGNAL.color.mute,
    fontFamily: SIGNAL.font.mono,
  },
  detailPhase: {
    fontSize: 12,
    color: SIGNAL.color.mute2,
    fontFamily: SIGNAL.font.bodyMedium,
    fontWeight: '500',
  },
  detailDesc: {
    fontSize: 15,
    color: SIGNAL.color.inkSoft,
    lineHeight: 24,
    fontFamily: SIGNAL.font.body,
    marginBottom: 24,
  },
  detailActions: { gap: 10 },
  detailSaveBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SIGNAL.color.indigo,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  detailSaveBtnText: {
    fontSize: 14.5,
    color: SIGNAL.color.indigo,
    fontFamily: SIGNAL.font.bodySemi,
    fontWeight: '600',
  },
  detailCalBtn: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: SIGNAL.color.indigo,
  },
  detailCalBtnText: {
    color: SIGNAL.color.white,
    fontSize: 15,
    fontFamily: SIGNAL.font.bodyBold,
    fontWeight: '700',
  },
});
