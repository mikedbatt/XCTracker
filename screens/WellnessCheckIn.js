import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {
  BRAND, BRAND_DARK,
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE, STATUS,
} from '../constants/design';

// ── Existing wellness options ────────────────────────────────────────────────

const SLEEP_OPTIONS = [
  { value: 1, label: 'Terrible', emoji: '😴' },
  { value: 2, label: 'Poor', emoji: '😪' },
  { value: 3, label: 'OK', emoji: '😐' },
  { value: 4, label: 'Good', emoji: '🙂' },
  { value: 5, label: 'Great', emoji: '😁' },
];

const LEGS_OPTIONS = [
  { value: 1, label: 'Dead', emoji: '🪨' },
  { value: 2, label: 'Heavy', emoji: '😓' },
  { value: 3, label: 'OK', emoji: '😐' },
  { value: 4, label: 'Good', emoji: '🙂' },
  { value: 5, label: 'Fresh', emoji: '⚡' },
];

const MOOD_OPTIONS = [
  { value: 1, label: 'Terrible', emoji: '😤' },
  { value: 2, label: 'Low', emoji: '😞' },
  { value: 3, label: 'Neutral', emoji: '😐' },
  { value: 4, label: 'Good', emoji: '🙂' },
  { value: 5, label: 'Pumped', emoji: '🔥' },
];

// ── Injury & illness constants ───────────────────────────────────────────────

const INJURY_LOCATIONS = [
  { key: 'knee', label: 'Knee' },
  { key: 'shin', label: 'Shin' },
  { key: 'ankle', label: 'Ankle' },
  { key: 'foot', label: 'Foot' },
  { key: 'hip', label: 'Hip' },
  { key: 'hamstring', label: 'Hamstring' },
  { key: 'calf', label: 'Calf' },
  { key: 'quad', label: 'Quad' },
  { key: 'back', label: 'Back' },
  { key: 'other', label: 'Other' },
];

const ILLNESS_SYMPTOMS = [
  { key: 'sore_throat', label: 'Sore throat' },
  { key: 'stomach', label: 'Stomach' },
  { key: 'fever', label: 'Fever/chills' },
  { key: 'congestion', label: 'Congestion' },
  { key: 'fatigue', label: 'Fatigue' },
  { key: 'other', label: 'Other' },
];

const SEVERITY_OPTIONS = [
  { value: 'mild', label: 'Mild', emoji: '🟡' },
  { value: 'moderate', label: 'Moderate', emoji: '🟠' },
  { value: 'severe', label: 'Severe', emoji: '🔴' },
];

// ── Shared UI components ─────────────────────────────────────────────────────

function OptionRow({ options, selected, onSelect }) {
  return (
    <View style={styles.optionRow}>
      {options.map(opt => (
        <TouchableOpacity
          key={opt.value}
          style={[
            styles.optionBtn,
            selected === opt.value && { backgroundColor: BRAND, borderColor: BRAND },
          ]}
          onPress={() => onSelect(opt.value)}
        >
          <Text style={styles.optionEmoji}>{opt.emoji}</Text>
          <Text style={[
            styles.optionLabel,
            selected === opt.value && { color: '#fff', fontWeight: FONT_WEIGHT.bold },
          ]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function ChipRow({ items, selected, onToggle }) {
  return (
    <View style={styles.chipRow}>
      {items.map(item => {
        const active = selected.includes(item.key);
        return (
          <TouchableOpacity
            key={item.key}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onToggle(item.key)}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function WellnessCheckIn({ visible, onComplete, onSkip, onClose, doneLabel, primaryColor }) {
  // Original wellness fields
  const [sleep, setSleep] = useState(null);
  const [legs, setLegs] = useState(null);
  const [mood, setMood] = useState(null);

  // Gateway question
  const [hasIssue, setHasIssue] = useState(null);

  // Injury fields
  const [injuryLocations, setInjuryLocations] = useState([]);
  const [injurySeverity, setInjurySeverity] = useState(null);
  const [injuryNote, setInjuryNote] = useState('');

  // Illness fields
  const [illnessFlagged, setIllnessFlagged] = useState(false);
  const [illnessSymptoms, setIllnessSymptoms] = useState([]);
  const [illnessSeverity, setIllnessSeverity] = useState(null);

  const toggleInjuryLocation = (key) => {
    setInjuryLocations(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const toggleIllnessSymptom = (key) => {
    setIllnessSymptoms(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  // Validation
  const wellnessComplete = sleep !== null && legs !== null && mood !== null;
  const gatewayAnswered = hasIssue !== null;
  const hasInjuryData = injuryLocations.length > 0;
  const hasIllnessData = illnessFlagged;

  let canContinue = wellnessComplete && gatewayAnswered;
  if (hasIssue) {
    const hasAnyReport = hasInjuryData || hasIllnessData;
    const injuryValid = !hasInjuryData || injurySeverity !== null;
    const illnessValid = !hasIllnessData || (illnessSymptoms.length > 0 && illnessSeverity !== null);
    canContinue = canContinue && hasAnyReport && injuryValid && illnessValid;
  }

  const resetAll = () => {
    setSleep(null); setLegs(null); setMood(null);
    setHasIssue(null);
    setInjuryLocations([]); setInjurySeverity(null); setInjuryNote('');
    setIllnessFlagged(false); setIllnessSymptoms([]); setIllnessSeverity(null);
  };

  const handleDone = () => {
    const injury = hasIssue && hasInjuryData
      ? { locations: injuryLocations, severity: injurySeverity, ...(injuryNote.trim() ? { note: injuryNote.trim() } : {}) }
      : null;
    const illness = hasIssue && hasIllnessData
      ? { symptoms: illnessSymptoms, severity: illnessSeverity }
      : null;
    onComplete({ sleep, legs, mood, injury, illness });
    resetAll();
  };

  const handleClose = () => {
    resetAll();
    if (onClose) onClose();
    else onSkip();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Quick check-in</Text>
            <Text style={styles.subtitle}>How are you feeling before this run?</Text>
          </View>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={NEUTRAL.body} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollBody}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Original wellness fields ── */}
          <Text style={styles.sectionLabel}>Sleep last night</Text>
          <OptionRow options={SLEEP_OPTIONS} selected={sleep} onSelect={setSleep} />

          <Text style={styles.sectionLabel}>How are your legs?</Text>
          <OptionRow options={LEGS_OPTIONS} selected={legs} onSelect={setLegs} />

          <Text style={styles.sectionLabel}>Mood right now</Text>
          <OptionRow options={MOOD_OPTIONS} selected={mood} onSelect={setMood} />

          {/* ── Gateway question ── */}
          {wellnessComplete && (
            <>
              <View style={styles.divider} />
              <Text style={styles.sectionLabel}>Any pain or illness today?</Text>
              <View style={styles.gatewayRow}>
                <TouchableOpacity
                  style={[
                    styles.gatewayBtn,
                    hasIssue === false && { backgroundColor: STATUS.success, borderColor: STATUS.success },
                  ]}
                  onPress={() => {
                    setHasIssue(false);
                    setInjuryLocations([]); setInjurySeverity(null); setInjuryNote('');
                    setIllnessFlagged(false); setIllnessSymptoms([]); setIllnessSeverity(null);
                  }}
                >
                  <Text style={styles.gatewayEmoji}>👍</Text>
                  <Text style={[
                    styles.gatewayLabel,
                    hasIssue === false && { color: '#fff', fontWeight: FONT_WEIGHT.bold },
                  ]}>I'm good</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.gatewayBtn,
                    hasIssue === true && { backgroundColor: STATUS.warning, borderColor: STATUS.warning },
                  ]}
                  onPress={() => setHasIssue(true)}
                >
                  <Text style={styles.gatewayEmoji}>🤕</Text>
                  <Text style={[
                    styles.gatewayLabel,
                    hasIssue === true && { color: '#fff', fontWeight: FONT_WEIGHT.bold },
                  ]}>Something's up</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── Injury section ── */}
          {hasIssue && (
            <>
              <View style={styles.issueSection}>
                <View style={styles.issueSectionHeader}>
                  <Ionicons name="body-outline" size={18} color={STATUS.warning} />
                  <Text style={styles.issueSectionTitle}>Injury — where does it hurt?</Text>
                </View>
                <ChipRow items={INJURY_LOCATIONS} selected={injuryLocations} onToggle={toggleInjuryLocation} />

                {hasInjuryData && (
                  <>
                    <Text style={styles.subLabel}>How bad?</Text>
                    <OptionRow options={SEVERITY_OPTIONS} selected={injurySeverity} onSelect={setInjurySeverity} />

                    <TextInput
                      style={styles.noteInput}
                      placeholder="Brief note, e.g. 'left shin splint'"
                      placeholderTextColor={NEUTRAL.muted}
                      value={injuryNote}
                      onChangeText={t => setInjuryNote(t.slice(0, 100))}
                      maxLength={100}
                    />
                  </>
                )}
              </View>

              {/* ── Illness section ── */}
              <View style={styles.issueSection}>
                <View style={styles.issueSectionHeader}>
                  <Ionicons name="thermometer-outline" size={18} color={STATUS.warning} />
                  <Text style={styles.issueSectionTitle}>Illness — feeling sick?</Text>
                </View>

                <TouchableOpacity
                  style={[styles.sickToggle, illnessFlagged && styles.sickToggleActive]}
                  onPress={() => {
                    setIllnessFlagged(f => !f);
                    if (illnessFlagged) { setIllnessSymptoms([]); setIllnessSeverity(null); }
                  }}
                >
                  <Text style={styles.sickToggleEmoji}>🤒</Text>
                  <Text style={[styles.sickToggleText, illnessFlagged && { color: '#fff', fontWeight: FONT_WEIGHT.bold }]}>
                    {illnessFlagged ? 'Yes, feeling sick' : 'Tap if feeling sick'}
                  </Text>
                </TouchableOpacity>

                {illnessFlagged && (
                  <>
                    <Text style={styles.subLabel}>What symptoms?</Text>
                    <ChipRow items={ILLNESS_SYMPTOMS} selected={illnessSymptoms} onToggle={toggleIllnessSymptom} />

                    {illnessSymptoms.length > 0 && (
                      <>
                        <Text style={styles.subLabel}>How bad?</Text>
                        <OptionRow options={SEVERITY_OPTIONS} selected={illnessSeverity} onSelect={setIllnessSeverity} />
                      </>
                    )}
                  </>
                )}
              </View>
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.doneBtn, { backgroundColor: canContinue ? BRAND : NEUTRAL.input }]}
            onPress={handleDone}
            disabled={!canContinue}
          >
            <Text style={styles.doneBtnText}>{doneLabel || 'Submit'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipBtn} onPress={onSkip}>
            <Text style={styles.skipBtnText}>Skip check-in</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: NEUTRAL.bg },
  header: {
    paddingTop: Platform.OS === 'ios' ? SPACE['5xl'] : SPACE['3xl'], paddingBottom: SPACE.xl, paddingHorizontal: SPACE['2xl'],
    backgroundColor: NEUTRAL.card, borderBottomWidth: 1, borderBottomColor: NEUTRAL.border,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  title:        { fontSize: 26, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK },
  subtitle:     { fontSize: FONT_SIZE.base, color: NEUTRAL.body, marginTop: SPACE.sm },
  closeBtn:     { padding: SPACE.sm, marginTop: SPACE.xs },

  // Body — now a ScrollView
  scrollBody:    { flex: 1 },
  scrollContent: { padding: SPACE['2xl'], paddingBottom: SPACE.xl },

  sectionLabel: {
    fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK,
    marginBottom: SPACE.md, marginTop: SPACE.xl,
  },
  optionRow:    { flexDirection: 'row', gap: SPACE.sm },
  optionBtn: {
    flex: 1, alignItems: 'center', paddingVertical: SPACE.md,
    borderRadius: RADIUS.lg, backgroundColor: NEUTRAL.card,
    borderWidth: 1.5, borderColor: NEUTRAL.border,
  },
  optionEmoji:  { fontSize: 20, marginBottom: SPACE.xs },
  optionLabel:  { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, fontWeight: FONT_WEIGHT.medium },

  // ── Gateway question ──
  divider: {
    height: 1, backgroundColor: NEUTRAL.border, marginTop: SPACE['2xl'], marginBottom: SPACE.sm,
  },
  gatewayRow: { flexDirection: 'row', gap: SPACE.md },
  gatewayBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: SPACE.lg, borderRadius: RADIUS.lg,
    backgroundColor: NEUTRAL.card, borderWidth: 1.5, borderColor: NEUTRAL.border, gap: SPACE.sm,
  },
  gatewayEmoji: { fontSize: 22 },
  gatewayLabel: { fontSize: FONT_SIZE.base, color: NEUTRAL.body, fontWeight: FONT_WEIGHT.medium },

  // ── Issue sections (injury / illness) ──
  issueSection: {
    marginTop: SPACE.xl, backgroundColor: NEUTRAL.card,
    borderRadius: RADIUS.lg, padding: SPACE.lg,
    borderWidth: 1, borderColor: STATUS.warning + '40',
  },
  issueSectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.md,
  },
  issueSectionTitle: {
    fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK,
  },
  subLabel: {
    fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: NEUTRAL.label,
    marginTop: SPACE.lg, marginBottom: SPACE.sm,
  },

  // ── Chips (body parts / symptoms) ──
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  chip: {
    paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm,
    borderRadius: RADIUS.full, backgroundColor: NEUTRAL.bg,
    borderWidth: 1.5, borderColor: NEUTRAL.border,
  },
  chipActive: {
    backgroundColor: STATUS.warning, borderColor: STATUS.warning,
  },
  chipText: { fontSize: FONT_SIZE.sm, color: NEUTRAL.body, fontWeight: FONT_WEIGHT.medium },
  chipTextActive: { color: '#fff', fontWeight: FONT_WEIGHT.bold },

  // ── Sick toggle ──
  sickToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm,
    paddingVertical: SPACE.md, borderRadius: RADIUS.lg,
    backgroundColor: NEUTRAL.bg, borderWidth: 1.5, borderColor: NEUTRAL.border,
  },
  sickToggleActive: { backgroundColor: STATUS.warning, borderColor: STATUS.warning },
  sickToggleEmoji: { fontSize: 20 },
  sickToggleText: { fontSize: FONT_SIZE.base, color: NEUTRAL.body, fontWeight: FONT_WEIGHT.medium },

  // ── Note input ──
  noteInput: {
    marginTop: SPACE.md, padding: SPACE.md, borderRadius: RADIUS.md,
    backgroundColor: NEUTRAL.bg, borderWidth: 1, borderColor: NEUTRAL.border,
    fontSize: FONT_SIZE.sm, color: BRAND_DARK,
  },

  // ── Footer ──
  footer:       { padding: SPACE['2xl'], paddingBottom: SPACE['4xl'], gap: SPACE.md },
  doneBtn:      { borderRadius: RADIUS.lg, padding: SPACE.lg + 2, alignItems: 'center' },
  doneBtnText:  { color: '#fff', fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  skipBtn:      { alignItems: 'center', padding: SPACE.md },
  skipBtnText:  { color: NEUTRAL.muted, fontSize: FONT_SIZE.base },
});
