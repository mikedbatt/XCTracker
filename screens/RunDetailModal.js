import { deleteDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import React, { useState } from 'react';
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
import { BRAND, BRAND_DARK, FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE, STATUS } from '../constants/design';
import {
  DEFAULT_ZONE_BOUNDARIES, ZONE_META, calcMaxHR,
  calcZoneBreakdownFromRuns,
  calcZoneBreakdownFromStream,
  formatMinutes,
} from '../zoneConfig';
import { PACE_ZONES, calcPaceZoneBreakdown, calcPace8020, formatPace } from '../utils/vdotUtils';
import DatePickerField from './DatePickerField';

const EFFORT_LABELS = ['', 'Very Easy', 'Easy', 'Moderate', 'Moderate', 'Medium',
  'Medium Hard', 'Hard', 'Very Hard', 'Max Effort', 'All Out'];

const EFFORT_COLORS = ['', '#4caf50', '#4caf50', '#8bc34a', '#8bc34a', '#ffeb3b',
  '#ffc107', '#ff9800', '#ff5722', '#f44336', '#b71c1c'];

// ── Zone breakdown for a single run (3-tier: rawHRStream → zoneSeconds → avg HR) ──
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

  return (
    <View style={zoneStyles.section}>
      <View style={zoneStyles.titleRow}>
        <Text style={zoneStyles.sectionTitle}>Pace zones</Text>
        {hasPaceStream
          ? <View style={zoneStyles.preciseBadge}><Text style={zoneStyles.preciseBadgeText}>GPS ✓</Text></View>
          : <Text style={zoneStyles.estimatedText}>from avg pace</Text>
        }
      </View>

      {/* Stacked bar */}
      <View style={zoneStyles.stackedBar}>
        {zonesArr.map(z => (
          <View key={z.key} style={[zoneStyles.stackedSegment, { flex: z.minutes || 1, backgroundColor: z.color }]} />
        ))}
      </View>

      {/* Zone rows */}
      {zonesArr.map(z => (
        <View key={z.key} style={zoneStyles.zoneRow}>
          <View style={[zoneStyles.zoneDot, { backgroundColor: z.color }]} />
          <Text style={zoneStyles.zoneName}>{z.short} {z.name}</Text>
          <View style={zoneStyles.zoneBarBg}>
            <View style={[zoneStyles.zoneBarFill, { width: z.pct + '%', backgroundColor: z.color }]} />
          </View>
          <Text style={zoneStyles.zoneTime}>{formatMinutes(z.minutes)}</Text>
        </View>
      ))}

      {eighty20 && (
        <Text style={[zoneStyles.totalTime, { color: eighty20.easyPct >= 78 ? STATUS.success : eighty20.easyPct >= 68 ? STATUS.warning : STATUS.error }]}>
          Easy: {eighty20.easyPct}% · Hard: {eighty20.hardPct}%
        </Text>
      )}
      <Text style={zoneStyles.totalTime}>
        {formatMinutes(totalMins)} total · {hasPaceStream ? 'second-by-second GPS data' : 'from stored pace zones'}
      </Text>
    </View>
  );
}

function RunZoneBreakdown({ run, athleteAge, zoneSettings, primaryColor }) {
  // Need at least some HR data to show anything
  if (!run.heartRate && !run.zoneSeconds && !run.rawHRStream) return null;

  const boundaries  = zoneSettings?.boundaries  || DEFAULT_ZONE_BOUNDARIES;
  const customMaxHR = zoneSettings?.customMaxHR || null;
  const maxHR       = calcMaxHR(athleteAge, customMaxHR);

  let breakdown     = null;
  let hasStreamData = false;

  // Tier 1 — raw HR stream: recalculate with current coach boundaries
  // This is the most accurate path and ensures zone display always reflects
  // whatever the coach has currently configured, not sync-time boundaries.
  if (run.rawHRStream?.length > 0) {
    const bd = calcZoneBreakdownFromStream(run.rawHRStream, maxHR, boundaries);
    if (bd && bd.length > 0) {
      breakdown     = bd;
      hasStreamData = true;
    }
  }

  // Tier 2 — stored zone seconds (calculated at sync time — may reflect old boundaries)
  if (!breakdown && run.hasStreamData && run.zoneSeconds) {
    const totalSecs = Object.values(run.zoneSeconds).reduce((s, v) => s + v, 0);
    if (totalSecs > 0) {
      breakdown = Object.entries(run.zoneSeconds)
        .filter(([, s]) => s > 0)
        .map(([key, secs]) => {
          const zone = parseInt(key.replace('z', ''));
          return {
            zone,
            seconds: secs,
            minutes: Math.round(secs / 60),
            pct: Math.round((secs / totalSecs) * 100),
            ...ZONE_META[zone],
          };
        })
        .sort((a, b) => a.zone - b.zone);
      hasStreamData = true;
    }
  }

  // Tier 3 — estimate from average HR + duration
  if (!breakdown && run.heartRate && run.duration) {
    breakdown = calcZoneBreakdownFromRuns([run], athleteAge, customMaxHR, boundaries);
  }

  if (!breakdown || breakdown.length === 0) return null;

  const totalMins = breakdown.reduce((s, z) => s + z.minutes, 0);

  return (
    <View style={zoneStyles.section}>
      <View style={zoneStyles.titleRow}>
        <Text style={zoneStyles.sectionTitle}>Heart rate zones</Text>
        {hasStreamData
          ? <View style={zoneStyles.preciseBadge}><Text style={zoneStyles.preciseBadgeText}>Precise ✓</Text></View>
          : <Text style={zoneStyles.estimatedText}>estimated from avg HR</Text>
        }
      </View>

      {/* Stacked bar */}
      <View style={zoneStyles.stackedBar}>
        {breakdown.map(z => (
          <View key={z.zone} style={[zoneStyles.stackedSegment, { flex: z.minutes, backgroundColor: ZONE_META[z.zone].color }]} />
        ))}
      </View>

      {/* Zone rows */}
      {breakdown.map(z => (
        <View key={z.zone} style={zoneStyles.zoneRow}>
          <View style={[zoneStyles.zoneDot, { backgroundColor: ZONE_META[z.zone].color }]} />
          <Text style={zoneStyles.zoneName}>Z{z.zone} {ZONE_META[z.zone].name}</Text>
          <View style={zoneStyles.zoneBarBg}>
            <View style={[zoneStyles.zoneBarFill, { width: z.pct + '%', backgroundColor: ZONE_META[z.zone].color }]} />
          </View>
          <Text style={zoneStyles.zoneTime}>{formatMinutes(z.minutes)}</Text>
        </View>
      ))}

      <Text style={zoneStyles.totalTime}>
        {formatMinutes(totalMins)} total · {hasStreamData ? 'second-by-second HR data' : 'estimated from avg HR'}
      </Text>
    </View>
  );
}

const zoneStyles = StyleSheet.create({
  section:         { backgroundColor: '#fff', borderRadius: 14, margin: 16, marginBottom: 0, padding: 16 },
  titleRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle:    { fontSize: 13, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 },
  preciseBadge:    { backgroundColor: '#e8f5e9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  preciseBadgeText:{ fontSize: 11, color: '#213f96', fontWeight: '700' },
  estimatedText:   { fontSize: 11, color: '#bbb' },
  stackedBar:      { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 14 },
  stackedSegment:  { height: '100%' },
  zoneRow:         { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  zoneDot:         { width: 10, height: 10, borderRadius: 5 },
  zoneName:        { fontSize: 13, color: '#6B7280', width: 116 },
  zoneBarBg:       { flex: 1, height: 6, backgroundColor: '#f0f0f0', borderRadius: 3, overflow: 'hidden' },
  zoneBarFill:     { height: '100%', borderRadius: 3 },
  zoneTime:        { fontSize: 12, fontWeight: '600', color: '#6B7280', width: 52, textAlign: 'right' },
  totalTime:       { fontSize: 11, color: '#bbb', textAlign: 'right', marginTop: 4 },
});

export default function RunDetailModal({
  run, visible, onClose, onDeleted, onUpdated,
  primaryColor = '#213f96', athleteAge = 16, zoneSettings = null, showHRZones = true, trainingPaces = null,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [deleting,  setDeleting]  = useState(false);

  const [editMiles,    setEditMiles]    = useState('');
  const [editDuration, setEditDuration] = useState('');
  const [editHR,       setEditHR]       = useState('');
  const [editEffort,   setEditEffort]   = useState(5);
  const [editNotes,    setEditNotes]    = useState('');
  const [editDate,     setEditDate]     = useState(new Date());

  if (!run) return null;

  const isOwner     = auth.currentUser?.uid === run.userId;
  const date        = run.date?.toDate?.() || new Date();
  const effortColor = EFFORT_COLORS[run.effort] || primaryColor;

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
    setEditHR(run.heartRate ? String(run.heartRate) : '');
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
    if (editDuration) {
      const parts = editDuration.split(':');
      const validFormat =
        (parts.length === 2 || parts.length === 3) &&
        parts.every(p => /^\d+$/.test(p)) &&
        parseInt(parts[parts.length - 1]) < 60 &&
        parseInt(parts[parts.length - 2]) < 60;
      if (!validFormat) {
        Alert.alert('Invalid duration', 'Please use MM:SS or HH:MM:SS format (e.g. 42:30 or 1:05:00).');
        return;
      }
    }
    setSaving(true);
    try {
      const newMiles = parseFloat(editMiles);
      const diff     = newMiles - (run.miles || 0);
      await updateDoc(doc(db, 'runs', run.id), {
        miles:     newMiles,
        duration:  editDuration || null,
        heartRate: editHR ? parseInt(editHR) : null,
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
    Alert.alert(
      'Delete run?',
      'Delete this ' + run.miles + ' mile run? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
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
        }},
      ]
    );
  };

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
                  ? <ActivityIndicator color={primaryColor} />
                  : <Text style={[styles.saveBtn, { color: primaryColor }]}>Save</Text>
                }
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.editScroll} keyboardShouldPersistTaps="handled">
              <DatePickerField label="Run date" value={editDate} onChange={setEditDate} primaryColor={primaryColor} maximumDate={new Date()} />
              <Text style={styles.editLabel}>Miles *</Text>
              <TextInput style={styles.editInput} value={editMiles} onChangeText={setEditMiles} keyboardType="decimal-pad" placeholder="e.g. 5.2" placeholderTextColor="#9CA3AF" />
              <Text style={styles.editLabel}>Duration (optional)</Text>
              <TextInput style={styles.editInput} value={editDuration} onChangeText={setEditDuration} placeholder="e.g. 42:30" placeholderTextColor="#9CA3AF" />
              <Text style={styles.editLabel}>Avg heart rate (optional)</Text>
              <TextInput style={styles.editInput} value={editHR} onChangeText={setEditHR} keyboardType="numeric" placeholder="e.g. 155" placeholderTextColor="#9CA3AF" />
              <Text style={styles.editLabel}>How did it feel? {editEffort}/10 — {EFFORT_LABELS[editEffort]}</Text>
              <View style={styles.effortRow}>
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <TouchableOpacity key={n}
                    style={[styles.effortBtn, editEffort === n && { backgroundColor: primaryColor }]}
                    onPress={() => setEditEffort(n)}>
                    <Text style={[styles.effortBtnText, editEffort === n && { color: '#fff' }]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.editLabel}>Notes (optional)</Text>
              <TextInput style={[styles.editInput, { height: 90, textAlignVertical: 'top' }]}
                value={editNotes} onChangeText={setEditNotes}
                placeholder="How did the run go?" placeholderTextColor="#9CA3AF" multiline />
              <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} disabled={deleting}>
                {deleting
                  ? <ActivityIndicator color="#dc2626" />
                  : <Text style={styles.deleteBtnText}>🗑  Delete this run</Text>
                }
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.container}>
          <View style={[styles.header, { backgroundColor: primaryColor }]}>
            <View style={styles.headerTop}>
              <TouchableOpacity onPress={onClose}>
                <Text style={styles.closeText}>✕ Close</Text>
              </TouchableOpacity>
              {isOwner && (
                <TouchableOpacity onPress={handleStartEdit} style={styles.editBtn}>
                  <Text style={styles.editBtnText}>✏️ Edit</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.headerMiles}>{run.miles} miles</Text>
            <Text style={styles.headerDate}>
              {date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </Text>
            {run.duration && <Text style={styles.headerDuration}>{run.duration}</Text>}
          </View>

          <ScrollView style={styles.scroll}>

            {/* Effort */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Effort</Text>
              <View style={styles.effortContainer}>
                <View style={styles.effortCircle}>
                  <Text style={[styles.effortNumber, { color: effortColor }]}>{run.effort}</Text>
                  <Text style={styles.effortDivider}>/10</Text>
                </View>
                <View style={styles.effortInfo}>
                  <Text style={[styles.effortLabel, { color: effortColor }]}>{EFFORT_LABELS[run.effort]}</Text>
                  <View style={styles.effortBar}>
                    <View style={[styles.effortFill, { width: ((run.effort / 10) * 100) + '%', backgroundColor: effortColor }]} />
                  </View>
                </View>
              </View>
            </View>

            {/* Run stats */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Run stats</Text>
              <View style={styles.statsGrid}>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{run.miles}</Text>
                  <Text style={styles.statLabel}>Miles</Text>
                </View>
                {run.duration && (
                  <View style={styles.statBox}>
                    <Text style={styles.statValue}>{run.duration}</Text>
                    <Text style={styles.statLabel}>Duration</Text>
                  </View>
                )}
                {pace && (
                  <View style={styles.statBox}>
                    <Text style={styles.statValue}>{pace}</Text>
                    <Text style={styles.statLabel}>Avg pace</Text>
                  </View>
                )}
                {run.heartRate && (
                  <View style={styles.statBox}>
                    <Text style={styles.statValue}>{run.heartRate}</Text>
                    <Text style={styles.statLabel}>Avg HR (bpm)</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Pace zone breakdown — primary effort display */}
            <RunPaceBreakdown run={run} trainingPaces={trainingPaces} />

            {/* HR zone breakdown — secondary, shown if HR data exists */}
            {showHRZones && (
              <RunZoneBreakdown
                run={run}
                athleteAge={athleteAge}
                zoneSettings={zoneSettings}
                primaryColor={primaryColor}
              />
            )}

            {/* Data source */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Data source</Text>
              <View style={styles.sourceBox}>
                <Text style={styles.sourceText}>
                  {run.source === 'strava' ? '🟠 Synced from Strava'
                    : run.source === 'garmin' ? '🟢 Synced from Garmin'
                    : '✏️ Manually entered'}
                </Text>
              </View>
            </View>

            {/* Notes */}
            {run.notes && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Notes</Text>
                <View style={styles.notesBox}>
                  <Text style={styles.notesText}>{run.notes}</Text>
                </View>
              </View>
            )}

            <View style={styles.footer}>
              <Text style={styles.footerText}>
                Logged at {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </Text>
              {isOwner && (
                <TouchableOpacity onPress={handleDelete} disabled={deleting} style={styles.footerDeleteBtn}>
                  {deleting
                    ? <ActivityIndicator color="#dc2626" size="small" />
                    : <Text style={styles.footerDeleteText}>Delete run</Text>
                  }
                </TouchableOpacity>
              )}
            </View>

          </ScrollView>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#F5F6FA' },
  header:           { paddingTop: 60, paddingBottom: 24, paddingHorizontal: 24 },
  headerTop:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  closeText:        { color: 'rgba(255,255,255,0.85)', fontSize: 15 },
  editBtn:          { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  editBtnText:      { color: '#fff', fontWeight: '700', fontSize: 14 },
  headerMiles:      { fontSize: 42, fontWeight: 'bold', color: '#fff' },
  headerDate:       { fontSize: 16, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  headerDuration:   { fontSize: 22, color: 'rgba(255,255,255,0.9)', marginTop: 6, fontWeight: '600' },
  scroll:           { flex: 1 },
  section:          { backgroundColor: '#fff', borderRadius: 14, margin: 16, marginBottom: 0, padding: 16 },
  sectionTitle:     { fontSize: 13, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 },
  effortContainer:  { flexDirection: 'row', alignItems: 'center', gap: 16 },
  effortCircle:     { flexDirection: 'row', alignItems: 'baseline' },
  effortNumber:     { fontSize: 52, fontWeight: 'bold' },
  effortDivider:    { fontSize: 20, color: '#ccc', marginLeft: 2 },
  effortInfo:       { flex: 1 },
  effortLabel:      { fontSize: 18, fontWeight: '700', marginBottom: 10 },
  effortBar:        { height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden' },
  effortFill:       { height: '100%', borderRadius: 4 },
  statsGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statBox:          { backgroundColor: '#f8f8f8', borderRadius: 10, padding: 14, minWidth: '45%', flex: 1 },
  statValue:        { fontSize: 22, fontWeight: 'bold', color: '#111827' },
  statLabel:        { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
  sourceBox:        { backgroundColor: '#f8f8f8', borderRadius: 10, padding: 14 },
  sourceText:       { fontSize: 15, color: '#6B7280' },
  notesBox:         { backgroundColor: '#f8f8f8', borderRadius: 10, padding: 14 },
  notesText:        { fontSize: 15, color: '#444', lineHeight: 22 },
  footer:           { padding: 24, alignItems: 'center', gap: 12 },
  footerText:       { fontSize: 13, color: '#bbb' },
  footerDeleteBtn:  { padding: 8 },
  footerDeleteText: { fontSize: 14, color: '#dc2626', fontWeight: '600' },
  editHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  editHeaderTitle:  { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  cancelBtn:        { color: '#dc2626', fontSize: 16, fontWeight: '600', width: 60 },
  saveBtn:          { fontSize: 16, fontWeight: '700', width: 60, textAlign: 'right' },
  editScroll:       { padding: 20 },
  editLabel:        { fontSize: 14, fontWeight: '600', color: '#444', marginBottom: 8, marginTop: 4 },
  editInput:        { backgroundColor: '#fff', borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E5E7EB', color: '#111827' },
  effortRow:        { flexDirection: 'row', gap: 6, marginBottom: 16, flexWrap: 'wrap' },
  effortBtn:        { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  effortBtnText:    { fontSize: 15, fontWeight: '600', color: '#6B7280' },
  deleteBtn:        { borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 16, backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fca5a5' },
  deleteBtnText:    { color: '#dc2626', fontSize: 16, fontWeight: '700' },
});