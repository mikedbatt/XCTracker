import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { deleteDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { useState } from 'react';
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
import { auth, db } from '../firebaseConfig';
import { SIGNAL } from '../constants/design';
import { SIGNAL_TYPE_COLORS } from '../constants/training';
import { PACE_ZONES, calcPaceZoneBreakdown, calcPace8020, formatMinutes } from '../utils/vdotUtils';
import { confirmDestructive } from '../utils/confirmDialog';
import DatePickerField from './DatePickerField';

const EFFORT_LABELS = ['', 'Very Easy', 'Easy', 'Moderate', 'Moderate', 'Medium',
  'Medium Hard', 'Hard', 'Very Hard', 'Max Effort', 'All Out'];

// ── Pace zone breakdown for a single run (rawPaceStream → stored paceZoneSeconds) ──
function RunPaceBreakdown({ run, trainingPaces }) {
  if (!trainingPaces || (!run.rawPaceStream && !run.paceZoneSeconds)) return null;

  let paceZones = null;
  let hasPaceStream = false;

  // Tier 1: recalculate from raw pace stream with current training paces
  if (run.rawPaceStream?.length > 0) {
    paceZones = calcPaceZoneBreakdown(run.rawPaceStream, trainingPaces);
    hasPaceStream = true;
  }

  // Tier 2: use stored paceZoneSeconds
  if (!paceZones && run.paceZoneSeconds) {
    paceZones = run.paceZoneSeconds;
    hasPaceStream = run.hasPaceData;
  }

  if (!paceZones) return null;

  const total = paceZones.e + paceZones.m + paceZones.t + paceZones.i + paceZones.r;
  if (total === 0) return null;

  const eighty20 = calcPace8020(paceZones);
  const zonesArr = PACE_ZONES.map(z => ({
    ...z,
    seconds: paceZones[z.key] || 0,
    minutes: Math.round((paceZones[z.key] || 0) / 60),
    pct: Math.round(((paceZones[z.key] || 0) / total) * 100),
  })).filter(z => z.seconds > 0);

  const totalMins = Math.round(total / 60);
  const balanceColor = eighty20
    ? (eighty20.easyPct >= 78 ? SIGNAL.color.emerald
       : eighty20.easyPct >= 68 ? SIGNAL.color.amber
       : SIGNAL.color.coral)
    : SIGNAL.color.mute;

  return (
    <View style={styles.card}>
      <View style={styles.cardPad}>
        <View style={styles.zoneTitleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>Pace zones</Text>
            <Text style={styles.sectionTitle}>Pace</Text>
          </View>
          {hasPaceStream
            ? (
              <View style={styles.preciseChip}>
                <Text style={styles.preciseChipText}>GPS</Text>
              </View>
            )
            : <Text style={styles.estimatedText}>from avg pace</Text>
          }
        </View>

        {/* Stacked bar */}
        <View style={styles.stackedBar}>
          {zonesArr.map(z => (
            <View key={z.key} style={[styles.stackedSegment, { flex: z.minutes || 1, backgroundColor: z.color }]} />
          ))}
        </View>

        {/* Zone rows */}
        {zonesArr.map(z => (
          <View key={z.key} style={styles.zoneRow}>
            <View style={[styles.zoneDot, { backgroundColor: z.color }]} />
            <Text style={styles.zoneName}>{z.short} {z.name}</Text>
            <View style={styles.zoneBarBg}>
              <View style={[styles.zoneBarFill, { width: z.pct + '%', backgroundColor: z.color }]} />
            </View>
            <Text style={styles.zoneTime}>{formatMinutes(z.minutes)}</Text>
          </View>
        ))}

        {eighty20 && (
          <Text style={[styles.totalTime, { color: balanceColor, fontFamily: SIGNAL.font.bodySemi }]}>
            Easy: {eighty20.easyPct}% · Hard: {eighty20.hardPct}%
          </Text>
        )}
        <Text style={styles.totalTime}>
          {formatMinutes(totalMins)} total · {hasPaceStream ? 'second-by-second GPS data' : 'from stored pace zones'}
        </Text>
      </View>
    </View>
  );
}

export default function RunDetailModal({
  run, visible, onClose, onDeleted, onUpdated,
  primaryColor = SIGNAL.color.indigo, trainingPaces = null,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [deleting,  setDeleting]  = useState(false);

  const [editMiles,    setEditMiles]    = useState('');
  const [editDuration, setEditDuration] = useState('');
  const [editEffort,   setEditEffort]   = useState(5);
  const [editNotes,    setEditNotes]    = useState('');
  const [editDate,     setEditDate]     = useState(new Date());

  if (!run) return null;

  const isOwner     = auth.currentUser?.uid === run.userId;
  const date        = run.date?.toDate?.() || new Date();
  const effortColor = (run.effort >= 1 && run.effort <= 10)
    ? SIGNAL.effort[run.effort]
    : SIGNAL.color.indigo;
  const typeColor   = run.type ? (SIGNAL_TYPE_COLORS[run.type] || SIGNAL.color.indigo) : null;

  // Calculate pace from miles + duration
  let pace = null;
  if (run.miles && run.duration) {
    const parts = run.duration.split(':');
    let totalMinutes = null;
    if (parts.length === 3) {
      totalMinutes = parseInt(parts[0]) * 60 + parseInt(parts[1]) + parseInt(parts[2]) / 60;
    } else if (parts.length === 2) {
      totalMinutes = parseInt(parts[0]) + parseInt(parts[1]) / 60;
    }
    if (totalMinutes !== null && !isNaN(totalMinutes)) {
      const paceMinutes = totalMinutes / run.miles;
      const paceMin     = Math.floor(paceMinutes);
      const paceSec     = Math.round((paceMinutes - paceMin) * 60);
      pace = paceMin + ':' + paceSec.toString().padStart(2, '0') + ' /mi';
    }
  }

  const handleStartEdit = () => {
    setEditMiles(String(run.miles || ''));
    setEditDuration(run.duration || '');
    setEditEffort(run.effort || 5);
    setEditNotes(run.notes || '');
    setEditDate(run.date?.toDate?.() || new Date());
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!editMiles || isNaN(parseFloat(editMiles))) {
      Alert.alert('Missing info', 'Please enter miles for this run.');
      return;
    }
    let normalizedDuration = editDuration;
    if (editDuration) {
      const parts = editDuration.split(':');
      const allDigits = parts.every(p => /^\d+$/.test(p));
      // MM:SS — minutes can exceed 60 (legacy Strava sync stored "90:00" for 90-min runs).
      // HH:MM:SS — minutes and seconds must be < 60.
      const validFormat = allDigits && (
        (parts.length === 2 && parseInt(parts[1]) < 60) ||
        (parts.length === 3 && parseInt(parts[1]) < 60 && parseInt(parts[2]) < 60)
      );
      if (!validFormat) {
        Alert.alert('Invalid duration', 'Please use MM:SS or HH:MM:SS format (e.g. 42:30 or 1:05:00).');
        return;
      }
      // Normalize MM:SS with MM >= 60 → HH:MM:SS so it displays correctly
      if (parts.length === 2 && parseInt(parts[0]) >= 60) {
        const totalSecs = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        const h = Math.floor(totalSecs / 3600);
        const m = Math.floor((totalSecs % 3600) / 60);
        const s = totalSecs % 60;
        normalizedDuration = `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      }
    }
    setSaving(true);
    try {
      const newMiles = parseFloat(editMiles);
      const diff     = newMiles - (run.miles || 0);
      await updateDoc(doc(db, 'runs', run.id), {
        miles:     newMiles,
        duration:  normalizedDuration || null,
        effort:    editEffort,
        notes:     editNotes || null,
        date:      editDate,
      });
      if (diff !== 0) {
        const userDoc = await getDoc(doc(db, 'users', run.userId));
        if (userDoc.exists()) {
          const current = userDoc.data().totalMiles || 0;
          await updateDoc(doc(db, 'users', run.userId), {
            totalMiles: Math.max(0, Math.round((current + diff) * 10) / 10),
          });
        }
      }
      setIsEditing(false);
      onUpdated && onUpdated();
      Alert.alert('Saved!', 'Run updated.');
    } catch { Alert.alert('Error', 'Could not save changes.'); }
    setSaving(false);
  };

  const handleDelete = () => {
    confirmDestructive({
      title: 'Delete run?',
      message: 'Delete this ' + run.miles + ' mile run? This cannot be undone.',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        setDeleting(true);
        try {
          await deleteDoc(doc(db, 'runs', run.id));
          const userDoc = await getDoc(doc(db, 'users', run.userId));
          if (userDoc.exists()) {
            const current = userDoc.data().totalMiles || 0;
            await updateDoc(doc(db, 'users', run.userId), {
              totalMiles: Math.max(0, Math.round((current - (run.miles || 0)) * 10) / 10),
            });
          }
          onDeleted && onDeleted();
          onClose();
        } catch { Alert.alert('Error', 'Could not delete run.'); }
        setDeleting(false);
      },
    });
  };

  // Effort gradient based on effort tier
  const effortGradient = (() => {
    if (!run.effort) return [SIGNAL.color.indigo, SIGNAL.color.cyan];
    if (run.effort <= 4) return [SIGNAL.color.indigo, SIGNAL.color.cyan];
    if (run.effort <= 7) return [SIGNAL.color.amber, SIGNAL.color.coral];
    return [SIGNAL.color.coral, SIGNAL.color.effort10];
  })();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {isEditing ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.container}>
            <View style={styles.editHeader}>
              <TouchableOpacity onPress={() => setIsEditing(false)}>
                <Text style={styles.cancelBtn}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.editHeaderTitle}>Edit Run</Text>
              <TouchableOpacity onPress={handleSaveEdit} disabled={saving}>
                {saving
                  ? <ActivityIndicator color={SIGNAL.color.indigo} />
                  : <Text style={styles.saveBtn}>Save</Text>
                }
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.editScroll} keyboardShouldPersistTaps="handled">
              <DatePickerField label="Run date" value={editDate} onChange={setEditDate} primaryColor={SIGNAL.color.indigo} maximumDate={new Date()} />
              <Text style={styles.editLabel}>Miles *</Text>
              <TextInput style={styles.editInput} value={editMiles} onChangeText={setEditMiles} keyboardType="decimal-pad" placeholder="e.g. 5.2" placeholderTextColor={SIGNAL.color.mute2} />
              <Text style={styles.editLabel}>Duration (optional)</Text>
              <TextInput style={styles.editInput} value={editDuration} onChangeText={setEditDuration} placeholder="e.g. 42:30" placeholderTextColor={SIGNAL.color.mute2} />
              <Text style={styles.editLabel}>How did it feel? {editEffort}/10 — {EFFORT_LABELS[editEffort]}</Text>
              <View style={styles.effortRow}>
                {[1,2,3,4,5,6,7,8,9,10].map(n => {
                  const active = editEffort === n;
                  return (
                    <TouchableOpacity key={n}
                      style={[styles.effortBtn, active && { backgroundColor: SIGNAL.effort[n] || SIGNAL.color.indigo, borderColor: SIGNAL.effort[n] || SIGNAL.color.indigo }]}
                      onPress={() => setEditEffort(n)}>
                      <Text style={[styles.effortBtnText, active && { color: '#fff' }]}>{n}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.editLabel}>Notes (optional)</Text>
              <TextInput style={[styles.editInput, { height: 90, textAlignVertical: 'top' }]}
                value={editNotes} onChangeText={setEditNotes}
                placeholder="How did the run go?" placeholderTextColor={SIGNAL.color.mute2} multiline />
              <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} disabled={deleting}>
                {deleting
                  ? <ActivityIndicator color={SIGNAL.color.coral} />
                  : <Text style={styles.deleteBtnText}>Delete this run</Text>
                }
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.container}>
          {/* Header — hero card */}
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <TouchableOpacity onPress={onClose} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="chevron-back" size={22} color={SIGNAL.color.inkSoft} />
                <Text style={styles.backText}>Close</Text>
              </TouchableOpacity>
              <Text style={styles.headerDateEyebrow} numberOfLines={1}>
                {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()}
                {' · '}
                {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </Text>
              <View style={styles.headerRight} />
            </View>

            <View style={styles.heroRow}>
              <View style={styles.heroLeft}>
                <Text style={styles.heroMiles}>{run.miles}</Text>
                <Text style={styles.heroMilesLabel}>MILES</Text>
              </View>
              {run.duration ? (
                <View style={styles.heroRightCol}>
                  <Text style={styles.heroDuration}>{run.duration}</Text>
                  {pace ? <Text style={styles.heroPace}>{pace}</Text> : null}
                </View>
              ) : null}
            </View>

            {/* Chip row: workout type + effort badge */}
            {(typeColor || run.effort) && (
              <View style={styles.chipRow}>
                {typeColor && (
                  <View style={[styles.typeChip, { backgroundColor: `${typeColor}${SIGNAL.tint.chip}`, borderColor: `${typeColor}40` }]}>
                    <View style={[styles.typeChipDot, { backgroundColor: typeColor }]} />
                    <Text style={[styles.typeChipText, { color: typeColor }]}>{run.type}</Text>
                  </View>
                )}
                {run.effort ? (
                  <View style={[styles.effortChip, { backgroundColor: `${effortColor}${SIGNAL.tint.chip}`, borderColor: `${effortColor}40` }]}>
                    <Text style={[styles.effortChipText, { color: effortColor }]}>
                      Effort {run.effort}/10 · {EFFORT_LABELS[run.effort]}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

            {/* Effort hero */}
            {run.effort ? (
              <View style={styles.card}>
                <View style={styles.cardPad}>
                  <Text style={styles.eyebrow}>Effort</Text>
                  <LinearGradient
                    colors={effortGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.effortHero}
                  >
                    <Text style={styles.effortHeroNum}>{run.effort}</Text>
                    <Text style={styles.effortHeroDivider}>/10</Text>
                    <View style={styles.effortHeroLabelWrap}>
                      <Text style={styles.effortHeroLabel}>{EFFORT_LABELS[run.effort]}</Text>
                    </View>
                  </LinearGradient>
                </View>
              </View>
            ) : null}

            {/* Run stats */}
            <View style={styles.card}>
              <View style={styles.cardPad}>
                <Text style={styles.eyebrow}>Run stats</Text>
                <Text style={styles.sectionTitle}>Stats</Text>
                <View style={styles.statsGrid}>
                  <View style={styles.statBox}>
                    <Text style={styles.statValue}>{run.miles}</Text>
                    <Text style={styles.statLabel}>Miles</Text>
                  </View>
                  {run.duration && (
                    <View style={styles.statBox}>
                      <Text style={styles.statValueMono}>{run.duration}</Text>
                      <Text style={styles.statLabel}>Duration</Text>
                    </View>
                  )}
                  {pace && (
                    <View style={styles.statBox}>
                      <Text style={styles.statValueMono}>{pace}</Text>
                      <Text style={styles.statLabel}>Avg pace</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Pace zone breakdown — primary effort display */}
            <RunPaceBreakdown run={run} trainingPaces={trainingPaces} />

            {/* Data source */}
            <View style={styles.card}>
              <View style={styles.cardPad}>
                <Text style={styles.eyebrow}>Data source</Text>
                <View style={styles.sourceRow}>
                  <View style={[styles.sourceDot, {
                    backgroundColor: run.source === 'strava' ? '#fc4c02'
                      : run.source === 'garmin' ? SIGNAL.color.emerald
                      : SIGNAL.color.indigo,
                  }]} />
                  <Text style={styles.sourceText}>
                    {run.source === 'strava' ? 'Synced from Strava'
                      : run.source === 'garmin' ? 'Synced from Garmin'
                      : 'Manually entered'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Notes */}
            {run.notes ? (
              <View style={styles.card}>
                <View style={styles.cardPad}>
                  <Text style={styles.eyebrow}>Notes</Text>
                  <Text style={styles.notesText}>{run.notes}</Text>
                </View>
              </View>
            ) : null}

            {/* Actions */}
            {isOwner && (
              <View style={styles.actionsBlock}>
                <TouchableOpacity
                  style={styles.primaryCta}
                  onPress={handleStartEdit}
                  activeOpacity={0.85}
                >
                  <Ionicons name="create-outline" size={16} color="#fff" />
                  <Text style={styles.primaryCtaText}>Edit run</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.destructiveCta}
                  onPress={handleDelete}
                  disabled={deleting}
                  activeOpacity={0.85}
                >
                  {deleting
                    ? <ActivityIndicator color={SIGNAL.color.coral} size="small" />
                    : (
                      <>
                        <Ionicons name="trash-outline" size={15} color={SIGNAL.color.coral} />
                        <Text style={styles.destructiveCtaText}>Delete run</Text>
                      </>
                    )
                  }
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.footerText}>
              Logged at {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </Text>

          </ScrollView>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },

  // ── Header ──
  header: {
    backgroundColor: SIGNAL.color.white,
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: 18,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 80,
  },
  backText: {
    fontFamily: SIGNAL.font.body,
    fontSize: 15,
    color: SIGNAL.color.inkSoft,
    marginLeft: 2,
  },
  headerRight: {
    width: 80,
  },
  headerDateEyebrow: {
    flex: 1,
    textAlign: 'center',
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 11,
    letterSpacing: 1.43,
    textTransform: 'uppercase',
    color: SIGNAL.color.mute,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  heroLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  heroMiles: {
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 56,
    lineHeight: 60,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.numTight,
  },
  heroMilesLabel: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 11,
    color: SIGNAL.color.mute,
    letterSpacing: 1.43,
    marginLeft: 8,
  },
  heroRightCol: {
    alignItems: 'flex-end',
  },
  heroDuration: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 22,
    color: SIGNAL.color.ink,
    letterSpacing: -0.4,
  },
  heroPace: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 12,
    color: SIGNAL.color.mute,
    marginTop: 2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: SIGNAL.radius.chip,
    borderWidth: 1,
  },
  typeChipDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  typeChipText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 12,
    letterSpacing: 0.1,
  },
  effortChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: SIGNAL.radius.chip,
    borderWidth: 1,
  },
  effortChipText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 12,
    letterSpacing: 0.1,
  },

  // ── Scroll layout ──
  scroll: { flex: 1 },
  scrollContent: {
    padding: 14,
    paddingBottom: 32,
    gap: 12,
  },

  // ── Card shell ──
  card: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    overflow: 'hidden',
    ...SIGNAL.border.hairline,
  },
  cardPad: {
    padding: 16,
  },

  // ── Typography ──
  eyebrow: {
    ...SIGNAL.style.eyebrow,
    marginBottom: 8,
  },
  sectionTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 18,
    color: SIGNAL.color.indigo,
    letterSpacing: -0.36,
    marginBottom: 12,
  },

  // ── Effort hero ──
  effortHero: {
    borderRadius: SIGNAL.radius.card,
    paddingVertical: 18,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  effortHeroNum: {
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 54,
    lineHeight: 58,
    color: '#fff',
    letterSpacing: SIGNAL.letter.numTight,
  },
  effortHeroDivider: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 18,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 18,
  },
  effortHeroLabelWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  effortHeroLabel: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 18,
    color: '#fff',
    letterSpacing: -0.2,
    textAlign: 'right',
  },

  // ── Stats grid ──
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statBox: {
    backgroundColor: SIGNAL.color.paper,
    borderRadius: SIGNAL.radius.control,
    padding: 14,
    minWidth: '45%',
    flex: 1,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  statValue: {
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 22,
    color: SIGNAL.color.ink,
    letterSpacing: -0.4,
  },
  statValueMono: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 18,
    color: SIGNAL.color.ink,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontFamily: SIGNAL.font.body,
    fontSize: 11,
    color: SIGNAL.color.mute,
    marginTop: 4,
    letterSpacing: 0.2,
  },

  // ── Zone breakdown shared ──
  zoneTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 4,
  },
  preciseChip: {
    backgroundColor: `${SIGNAL.color.emerald}${SIGNAL.tint.chip}`,
    borderRadius: SIGNAL.radius.chip,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: `${SIGNAL.color.emerald}40`,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  preciseChipText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 11,
    color: SIGNAL.color.emerald,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  estimatedText: {
    fontFamily: SIGNAL.font.body,
    fontSize: 11,
    color: SIGNAL.color.mute2,
    marginTop: 4,
  },
  stackedBar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    marginTop: 10,
    marginBottom: 14,
  },
  stackedSegment: {
    height: '100%',
  },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 8,
  },
  zoneDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  zoneName: {
    fontFamily: SIGNAL.font.body,
    fontSize: 12.5,
    color: SIGNAL.color.inkSoft,
    width: 116,
  },
  zoneBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: SIGNAL.color.line,
    borderRadius: 3,
    overflow: 'hidden',
  },
  zoneBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  zoneTime: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 11,
    color: SIGNAL.color.inkSoft,
    width: 56,
    textAlign: 'right',
  },
  totalTime: {
    fontFamily: SIGNAL.font.body,
    fontSize: 11,
    color: SIGNAL.color.mute,
    textAlign: 'right',
    marginTop: 4,
  },

  // ── Data source ──
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sourceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sourceText: {
    fontFamily: SIGNAL.font.body,
    fontSize: 14,
    color: SIGNAL.color.inkSoft,
  },

  // ── Notes ──
  notesText: {
    fontFamily: SIGNAL.font.body,
    fontSize: 14,
    color: SIGNAL.color.inkSoft,
    lineHeight: 21,
  },

  // ── Actions ──
  actionsBlock: {
    marginTop: 4,
    gap: 10,
  },
  primaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: SIGNAL.color.ink,
    borderRadius: SIGNAL.radius.button,
    paddingVertical: 14,
  },
  primaryCtaText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 15,
    color: '#fff',
    letterSpacing: -0.2,
  },
  destructiveCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: `${SIGNAL.color.coral}${SIGNAL.tint.chip}`,
    borderRadius: SIGNAL.radius.button,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: `${SIGNAL.color.coral}40`,
  },
  destructiveCtaText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 14,
    color: SIGNAL.color.coral,
    letterSpacing: -0.1,
  },
  footerText: {
    fontFamily: SIGNAL.font.body,
    fontSize: 11,
    color: SIGNAL.color.mute2,
    textAlign: 'center',
    marginTop: 12,
  },

  // ── Edit screen ──
  editHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: 16,
    backgroundColor: SIGNAL.color.white,
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  editHeaderTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 18,
    color: SIGNAL.color.indigo,
    letterSpacing: -0.36,
  },
  cancelBtn: {
    fontFamily: SIGNAL.font.body,
    fontSize: 15,
    color: SIGNAL.color.coral,
    width: 60,
  },
  saveBtn: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 15,
    color: SIGNAL.color.indigo,
    width: 60,
    textAlign: 'right',
  },
  editScroll: {
    padding: 20,
    backgroundColor: SIGNAL.color.paper2,
  },
  editLabel: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 13,
    color: SIGNAL.color.inkSoft,
    marginBottom: 8,
    marginTop: 4,
  },
  editInput: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.control,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: SIGNAL.font.body,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    color: SIGNAL.color.ink,
  },
  effortRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  effortBtn: {
    width: 42,
    height: 42,
    borderRadius: SIGNAL.radius.chip,
    backgroundColor: SIGNAL.color.white,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  effortBtnText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 14,
    color: SIGNAL.color.inkSoft,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: SIGNAL.radius.button,
    paddingVertical: 14,
    marginTop: 16,
    backgroundColor: `${SIGNAL.color.coral}${SIGNAL.tint.chip}`,
    borderWidth: 1,
    borderColor: `${SIGNAL.color.coral}40`,
  },
  deleteBtnText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 15,
    color: SIGNAL.color.coral,
  },
});
