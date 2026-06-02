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
import { BRAND, BRAND_DARK, FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SIGNAL, SPACE, STATUS } from '../constants/design';
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
export default function ZoneSettingsSignal({ school, schoolId, onClose, onSaved }) {
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [boundaries, setBoundaries] = useState({ ...DEFAULT_ZONE_BOUNDARIES });
  const [hrZonesDisabled, setHrZonesDisabled] = useState(true);

  const primaryColor = SIGNAL.color.indigo;

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
      Alert.alert('Saved', 'Zone boundaries updated for your entire team.');
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
            <Ionicons name="chevron-back" size={22} color={SIGNAL.color.ink} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Training zones</Text>
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
          <Ionicons name="chevron-back" size={22} color={SIGNAL.color.ink} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Training zones</Text>
        <TouchableOpacity
          onPress={handleSave}
          style={[styles.saveCta, saving && { opacity: 0.6 }]}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.saveCtaText}>Save</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* HR Zones toggle */}
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Heart rate</Text>
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
              trackColor={{ false: SIGNAL.color.line, true: SIGNAL.color.indigo }}
              thumbColor="#fff"
              ios_backgroundColor={SIGNAL.color.line}
            />
          </View>
        </View>

        {/* Team info */}
        {!hrZonesDisabled && (
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Team</Text>
          <View style={styles.teamRow}>
            <View style={[styles.teamDot, { backgroundColor: SIGNAL.color.indigo }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.teamName}>{school?.name}</Text>
              <Text style={styles.teamSub}>
                These zone boundaries apply to every athlete on your team. Zone breakdowns across the app — on athlete cards, dashboards, and run details — all use these settings.
              </Text>
            </View>
          </View>
        </View>
        )}

        {/* HR zone boundaries */}
        {!hrZonesDisabled && (
        <View style={styles.card}>
          <Text style={styles.eyebrow}>HR zones</Text>
          <Text style={styles.cardTitle}>Zone boundaries</Text>
          <Text style={styles.cardDesc}>
            Each value is the lower boundary of that zone as a % of max HR. Standard values are 60 / 70 / 80 / 90.
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
        </View>
        )}

        {/* Live zone preview at 200 bpm max HR */}
        {!hrZonesDisabled && (
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Preview</Text>
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
        </View>
        )}

        {/* 80/20 reminder */}
        {!hrZonesDisabled && (
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Philosophy</Text>
          <Text style={styles.cardTitle}>The 80 / 20 principle</Text>
          <Text style={styles.cardDesc}>
            Elite endurance programs target roughly 80% of training time in Zone 1–2 and 20% in Zones 3–5. Athlete cards on your dashboard flag anyone spending less than 70% in the easy zones so you can intervene quickly.
          </Text>
        </View>
        )}

        {/* Reset link */}
        <TouchableOpacity onPress={handleReset} style={styles.resetLinkWrap} activeOpacity={0.7}>
          <Text style={styles.resetLinkText}>Reset to defaults</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    backgroundColor: SIGNAL.color.white,
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: 14,
    paddingHorizontal: SIGNAL.space.screen,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 6,
    minWidth: 70,
  },
  backText: {
    color: SIGNAL.color.ink,
    fontSize: SIGNAL.size.body,
    fontFamily: SIGNAL.font.bodyMedium,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  headerTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: SIGNAL.size.heading,
    color: SIGNAL.color.indigo,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  saveCta: {
    backgroundColor: SIGNAL.color.indigo,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: SIGNAL.radius.button,
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveCtaText: {
    color: SIGNAL.color.white,
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: SIGNAL.size.body,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: SIGNAL.space.screen,
    paddingTop: SIGNAL.space[6],
  },

  // Card base
  card: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: SIGNAL.space.card,
    marginBottom: SIGNAL.space[4],
    ...SIGNAL.border.hairline,
  },
  eyebrow: {
    ...SIGNAL.style.eyebrow,
    fontFamily: SIGNAL.font.bodyMedium,
    marginBottom: SIGNAL.space[2],
  },
  cardTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: SIGNAL.size.heading,
    color: SIGNAL.color.indigo,
    letterSpacing: SIGNAL.letter.bodyTight,
    marginBottom: SIGNAL.space[1],
  },
  cardDesc: {
    fontFamily: SIGNAL.font.body,
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.inkSoft,
    lineHeight: 20,
    marginBottom: SIGNAL.space[5],
  },

  // Toggle row
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SIGNAL.space[4],
  },
  toggleInfo: {
    flex: 1,
  },
  toggleLabel: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: SIGNAL.size.bodyLg,
    color: SIGNAL.color.ink,
    marginBottom: SIGNAL.space[1],
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  toggleHint: {
    fontFamily: SIGNAL.font.body,
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.mute,
    lineHeight: 17,
  },

  // Team row inside team card
  teamRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SIGNAL.space[4],
  },
  teamDot: {
    width: 10,
    height: 10,
    borderRadius: SIGNAL.radius.chip,
    marginTop: 6,
  },
  teamName: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: SIGNAL.size.bodyLg,
    color: SIGNAL.color.ink,
    marginBottom: SIGNAL.space[1],
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  teamSub: {
    fontFamily: SIGNAL.font.body,
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.inkSoft,
    lineHeight: 20,
  },

  // Boundary input row
  boundaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIGNAL.space[3],
    paddingVertical: SIGNAL.space[3],
    borderTopWidth: 1,
    borderTopColor: SIGNAL.color.line,
  },
  boundaryDot: {
    width: 10,
    height: 10,
    borderRadius: SIGNAL.radius.chip,
  },
  boundaryLabel: {
    flex: 1,
    fontFamily: SIGNAL.font.body,
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.inkSoft,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  boundaryInput: {
    backgroundColor: SIGNAL.color.paper,
    borderRadius: SIGNAL.radius.control,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: SIGNAL.font.mono,
    fontSize: SIGNAL.size.bodyLg,
    color: SIGNAL.color.ink,
    width: 62,
    textAlign: 'center',
  },
  boundaryPct: {
    fontFamily: SIGNAL.font.mono,
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.mute,
    width: 14,
  },

  // Zone range bar
  zoneRangeBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: SIGNAL.radius.chip,
    overflow: 'hidden',
    marginBottom: SIGNAL.space[5],
  },
  zoneRangeSegment: {
    height: '100%',
  },
  zoneRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIGNAL.space[3],
    paddingVertical: SIGNAL.space[2],
  },
  zoneRangeDot: {
    width: 8,
    height: 8,
    borderRadius: SIGNAL.radius.chip,
  },
  zoneRangeName: {
    flex: 1,
    fontFamily: SIGNAL.font.body,
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.inkSoft,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  zoneRangeHR: {
    fontFamily: SIGNAL.font.mono,
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.ink,
  },

  // Reset link (coral / destructive)
  resetLinkWrap: {
    alignItems: 'center',
    paddingVertical: SIGNAL.space[5],
    marginTop: SIGNAL.space[2],
  },
  resetLinkText: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.coral,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
});
