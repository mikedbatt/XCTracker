import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { db } from '../firebaseConfig';
import { BRAND, BRAND_DARK, FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE, STATUS } from '../constants/design';
import {
    DEFAULT_ZONE_BOUNDARIES, ZONE_META,
} from '../zoneConfig';

// ── Zone boundary input row ───────────────────────────────────────────────────
function BoundaryRow({ label, value, minVal, maxVal, onChange, color }) {
  const [inputVal, setInputVal] = useState(Math.round(value * 100).toString());

  const handleChange = (text) => {
    setInputVal(text);
    const num = parseInt(text);
    if (!isNaN(num) && num >= minVal * 100 && num <= maxVal * 100) {
      onChange(num / 100);
    }
  };

  return (
    <View style={styles.boundaryRow}>
      <View style={[styles.boundaryDot, { backgroundColor: color }]} />
      <Text style={styles.boundaryLabel}>{label}</Text>
      <TextInput
        style={styles.boundaryInput}
        value={inputVal}
        onChangeText={handleChange}
        keyboardType="number-pad"
        maxLength={3}
        onBlur={() => setInputVal(Math.round(value * 100).toString())}
      />
      <Text style={styles.boundaryPct}>%</Text>
    </View>
  );
}

// ── Team Zone Settings ────────────────────────────────────────────────────────
// Stores zone boundaries at teamZoneSettings/{schoolId}
// All athletes on the team use these boundaries
export default function ZoneSettings({ school, schoolId, onClose, onSaved }) {
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [boundaries, setBoundaries] = useState({ ...DEFAULT_ZONE_BOUNDARIES });
  const [hrZonesDisabled, setHrZonesDisabled] = useState(true);

  const primaryColor = '#213f96';

  // Zone ranges at preview max HR (200 bpm typical high school)
  const previewMaxHR = 200;

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'teamZoneSettings', schoolId));
      if (snap.exists()) {
        if (snap.data().boundaries) setBoundaries(snap.data().boundaries);
        if (snap.data().hrZonesDisabled !== undefined) setHrZonesDisabled(snap.data().hrZonesDisabled !== false);
      }
    } catch (e) { console.warn('Load team zone settings:', e); }
    setLoading(false);
  };

  const handleSave = async () => {
    const b = boundaries;
    if (b.z2 >= b.z3 || b.z3 >= b.z4 || b.z4 >= b.z5) {
      Alert.alert('Invalid boundaries', 'Zone boundaries must increase from Zone 1 to Zone 5.');
      return;
    }
    setSaving(true);
    try {
      await setDoc(doc(db, 'teamZoneSettings', schoolId), {
        schoolId,
        boundaries,
        hrZonesDisabled,
        updatedAt: new Date().toISOString(),
      });
      Alert.alert('Saved! ✅', 'Zone boundaries updated for your entire team.');
      onSaved && onSaved(boundaries, hrZonesDisabled);
    } catch {
      Alert.alert('Error', 'Could not save. Please try again.');
    }
    setSaving(false);
  };

  const handleReset = () => {
    Alert.alert('Reset to defaults?', 'Restore standard zone boundaries (60/70/80/90%)?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', onPress: () => setBoundaries({ ...DEFAULT_ZONE_BOUNDARIES }) },
    ]);
  };

  const setBoundary = (key, val) => setBoundaries(prev => ({ ...prev, [key]: val }));


  // Zone ranges at preview max HR
  const zoneRanges = [
    { zone: 1, low: 0,                                      high: Math.round(boundaries.z2 * previewMaxHR) - 1 },
    { zone: 2, low: Math.round(boundaries.z2 * previewMaxHR), high: Math.round(boundaries.z3 * previewMaxHR) - 1 },
    { zone: 3, low: Math.round(boundaries.z3 * previewMaxHR), high: Math.round(boundaries.z4 * previewMaxHR) - 1 },
    { zone: 4, low: Math.round(boundaries.z4 * previewMaxHR), high: Math.round(boundaries.z5 * previewMaxHR) - 1 },
    { zone: 5, low: Math.round(boundaries.z5 * previewMaxHR), high: previewMaxHR },
  ];

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={BRAND_DARK} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Team Zone Settings</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.center}><ActivityIndicator size="large" color={primaryColor} /></View>
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
        <Text style={styles.headerTitle}>Team Zone Settings</Text>
        <TouchableOpacity onPress={handleReset} style={styles.resetBtn}>
          <Text style={styles.resetText}>Reset</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* HR Zones toggle */}
        <View style={styles.toggleCard}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Enable heart rate zones</Text>
              <Text style={styles.toggleHint}>
                {hrZonesDisabled
                  ? 'HR zones are hidden for all athletes. Turn on to show zone breakdowns across the app.'
                  : 'Athletes can see zone breakdowns on their dashboard and run details. Individual athletes can also toggle this off.'}
              </Text>
            </View>
            <Switch
              value={!hrZonesDisabled}
              onValueChange={(val) => setHrZonesDisabled(!val)}
              trackColor={{ false: '#E5E7EB', true: BRAND }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Team info */}
        {!hrZonesDisabled && (
        <View style={styles.teamCard}>
          <View style={[styles.teamDot, { backgroundColor: BRAND }]} />
          <View>
            <Text style={styles.teamName}>{school?.name}</Text>
            <Text style={styles.teamSub}>
              These zone boundaries apply to every athlete on your team. Zone breakdowns across the app — on athlete cards, dashboards, and run details — all use these settings.
            </Text>
          </View>
        </View>
        )}

        {/* Zone boundaries — hidden when HR zones disabled */}
        {!hrZonesDisabled && <View style={styles.card}>
          <Text style={styles.cardTitle}>Zone boundaries</Text>
          <Text style={styles.cardDesc}>
            Each value is the lower boundary of that zone as a % of max HR. Standard values are 60/70/80/90%.
          </Text>
          <BoundaryRow
            label="Zone 2 starts at"
            value={boundaries.z2}
            minVal={0.40} maxVal={boundaries.z3 - 0.01}
            onChange={v => setBoundary('z2', v)}
            color={ZONE_META[2].color}
          />
          <BoundaryRow
            label="Zone 3 starts at"
            value={boundaries.z3}
            minVal={boundaries.z2 + 0.01} maxVal={boundaries.z4 - 0.01}
            onChange={v => setBoundary('z3', v)}
            color={ZONE_META[3].color}
          />
          <BoundaryRow
            label="Zone 4 starts at"
            value={boundaries.z4}
            minVal={boundaries.z3 + 0.01} maxVal={boundaries.z5 - 0.01}
            onChange={v => setBoundary('z4', v)}
            color={ZONE_META[4].color}
          />
          <BoundaryRow
            label="Zone 5 starts at"
            value={boundaries.z5}
            minVal={boundaries.z4 + 0.01} maxVal={0.99}
            onChange={v => setBoundary('z5', v)}
            color={ZONE_META[5].color}
          />
        </View>}

        {/* Live zone preview at 200 bpm max HR */}
        {!hrZonesDisabled &&
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Zone ranges</Text>
          <Text style={styles.cardDesc}>
            Preview at 200 bpm max HR (typical high school athlete). Actual ranges scale to each athlete's max HR (220 − age).
          </Text>
          <View style={styles.zoneRangeBar}>
            {zoneRanges.map(z => (
              <View key={z.zone} style={[styles.zoneRangeSegment, { flex: 1, backgroundColor: ZONE_META[z.zone].color }]} />
            ))}
          </View>
          {zoneRanges.map(z => (
            <View key={z.zone} style={styles.zoneRangeRow}>
              <View style={[styles.zoneRangeDot, { backgroundColor: ZONE_META[z.zone].color }]} />
              <Text style={styles.zoneRangeName}>Z{z.zone} {ZONE_META[z.zone].name}</Text>
              <Text style={styles.zoneRangeHR}>
                {z.zone === 1 ? `< ${z.high + 1}` : z.zone === 5 ? `${z.low}+` : `${z.low}–${z.high}`} bpm
              </Text>
            </View>
          ))}
        </View>}

        {/* 80/20 reminder */}
        {!hrZonesDisabled &&
        <View style={styles.wisdomCard}>
          <Text style={styles.wisdomTitle}>The 80/20 principle</Text>
          <Text style={styles.wisdomText}>
            Elite endurance programs target roughly 80% of training time in Zone 1–2 and 20% in Zones 3–5. Athlete cards on your dashboard flag anyone spending less than 70% in the easy zones so you can intervene quickly.
          </Text>
        </View>}

        <View style={styles.saveRow}>
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: primaryColor }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>Save for entire team</Text>
            }
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: '#F5F6FA' },
  center:            { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:            { backgroundColor: '#fff', paddingTop: Platform.OS === 'ios' ? 56 : 32, paddingBottom: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn:           { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
  backText:          { color: '#111827', fontSize: 15, fontWeight: '600' },
  headerTitle:       { fontSize: 20, fontWeight: '700', color: '#111827' },
  resetBtn:          { paddingVertical: 6, paddingHorizontal: 10 },
  resetText:         { color: '#6B7280', fontSize: 14 },
  scroll:            { flex: 1 },
  toggleCard:        { backgroundColor: '#fff', margin: 16, marginBottom: 8, borderRadius: 14, padding: 16 },
  toggleRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  toggleInfo:        { flex: 1 },
  toggleLabel:       { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 3 },
  toggleHint:        { fontSize: 12, color: '#9CA3AF', lineHeight: 17 },
  teamCard:          { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#fff', margin: 16, marginBottom: 8, borderRadius: 14, padding: 14 },
  teamDot:           { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  teamName:          { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 4 },
  teamSub:           { fontSize: 13, color: '#6B7280', lineHeight: 18, flex: 1 },
  card:              { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 12, borderRadius: 14, padding: 16 },
  cardTitle:         { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 6 },
  cardDesc:          { fontSize: 13, color: '#6B7280', lineHeight: 19, marginBottom: 14 },
  boundaryRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  boundaryDot:       { width: 12, height: 12, borderRadius: 6 },
  boundaryLabel:     { flex: 1, fontSize: 14, color: '#444' },
  boundaryInput:     { backgroundColor: '#F5F6FA', borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 10, paddingVertical: 8, fontSize: 16, fontWeight: '700', color: '#111827', width: 56, textAlign: 'center' },
  boundaryPct:       { fontSize: 13, color: '#6B7280', width: 16 },
  zoneRangeBar:      { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', marginBottom: 12 },
  zoneRangeSegment:  { height: '100%' },
  zoneRangeRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  zoneRangeDot:      { width: 10, height: 10, borderRadius: 5 },
  zoneRangeName:     { flex: 1, fontSize: 13, color: '#6B7280' },
  zoneRangeHR:       { fontSize: 13, fontWeight: '600', color: '#111827' },
  wisdomCard:        { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#1a237e', borderRadius: 14, padding: 16 },
  wisdomTitle:       { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.6)', marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' },
  wisdomText:        { fontSize: 13, color: '#fff', lineHeight: 20 },
  saveRow:           { paddingHorizontal: 16, marginBottom: 8 },
  saveBtn:           { borderRadius: 12, padding: 18, alignItems: 'center' },
  saveBtnText:       { color: '#fff', fontSize: 17, fontWeight: 'bold' },
});