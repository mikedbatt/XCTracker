import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
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
  SIGNAL,
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
      {options.map(opt => {
        const active = selected === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.optionBtn, active && styles.optionBtnActive]}
            onPress={() => onSelect(opt.value)}
          >
            <Text style={styles.optionEmoji}>{opt.emoji}</Text>
            <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
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
  const scrollRef = useRef(null);
  const scrollToEnd = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);

  // Original wellness fields
  const [sleep, setSleep] = useState(null);
  const [legs, setLegs] = useState(null);
  const [mood, setMood] = useState(null);

  // Gateway question
  const [hasIssue, setHasIssue] = useState(null);

  // Injury fields — per-location severity
  const [injuryLocations, setInjuryLocations] = useState([]);
  const [injurySeverityMap, setInjurySeverityMap] = useState({});
  const [injuryNote, setInjuryNote] = useState('');

  // Illness fields
  const [illnessFlagged, setIllnessFlagged] = useState(false);
  const [illnessSymptoms, setIllnessSymptoms] = useState([]);
  const [illnessSeverity, setIllnessSeverity] = useState(null);

  const toggleInjuryLocation = (key) => {
    setInjuryLocations(prev => {
      if (prev.includes(key)) {
        setInjurySeverityMap(m => { const next = { ...m }; delete next[key]; return next; });
        return prev.filter(k => k !== key);
      }
      return [...prev, key];
    });
  };

  const setLocationSeverity = (loc, sev) => {
    setInjurySeverityMap(prev => ({ ...prev, [loc]: sev }));
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
    const injuryValid = !hasInjuryData || injuryLocations.every(loc => injurySeverityMap[loc]);
    const illnessValid = !hasIllnessData || (illnessSymptoms.length > 0 && illnessSeverity !== null);
    canContinue = canContinue && hasAnyReport && injuryValid && illnessValid;
  }

  const resetAll = () => {
    setSleep(null); setLegs(null); setMood(null);
    setHasIssue(null);
    setInjuryLocations([]); setInjurySeverityMap({}); setInjuryNote('');
    setIllnessFlagged(false); setIllnessSymptoms([]); setIllnessSeverity(null);
  };

  const handleDone = () => {
    const injury = hasIssue && hasInjuryData
      ? {
          locations: injuryLocations,
          // Worst severity across all locations (backward compatible)
          severity: ['severe', 'moderate', 'mild'].find(s => injuryLocations.some(loc => injurySeverityMap[loc] === s)) || 'mild',
          // Per-location detail
          perLocation: injuryLocations.map(loc => ({ location: loc, severity: injurySeverityMap[loc] || 'mild' })),
          ...(injuryNote.trim() ? { note: injuryNote.trim() } : {}),
        }
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
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Quick check-in</Text>
            <Text style={styles.subtitle}>How are you feeling before this run?</Text>
          </View>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={10}>
            <Ionicons name="close" size={22} color={SIGNAL.color.mute2} />
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.scrollBody}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Original wellness fields ── */}
          <Text style={styles.sectionLabel}>Sleep last night</Text>
          <OptionRow options={SLEEP_OPTIONS} selected={sleep} onSelect={(v) => { setSleep(v); if (legs !== null) scrollToEnd(); }} />

          <Text style={styles.sectionLabel}>How are your legs?</Text>
          <OptionRow options={LEGS_OPTIONS} selected={legs} onSelect={(v) => { setLegs(v); if (sleep !== null) scrollToEnd(); }} />

          <Text style={styles.sectionLabel}>Mood right now</Text>
          <OptionRow options={MOOD_OPTIONS} selected={mood} onSelect={(v) => { setMood(v); scrollToEnd(); }} />

          {/* ── Gateway question ── */}
          {wellnessComplete && (
            <>
              <View style={styles.divider} />
              <Text style={styles.sectionLabel}>Any pain or illness today?</Text>
              <View style={styles.gatewayRow}>
                <TouchableOpacity
                  style={[
                    styles.gatewayBtn,
                    hasIssue === false && { backgroundColor: SIGNAL.color.emerald, borderColor: SIGNAL.color.emerald },
                  ]}
                  onPress={() => {
                    setHasIssue(false);
                    setInjuryLocations([]); setInjurySeverityMap({}); setInjuryNote('');
                    setIllnessFlagged(false); setIllnessSymptoms([]); setIllnessSeverity(null);
                  }}
                >
                  <Text style={styles.gatewayEmoji}>👍</Text>
                  <Text style={[
                    styles.gatewayLabel,
                    hasIssue === false && styles.gatewayLabelActive,
                  ]}>I'm good</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.gatewayBtn,
                    hasIssue === true && { backgroundColor: SIGNAL.color.amber, borderColor: SIGNAL.color.amber },
                  ]}
                  onPress={() => { setHasIssue(true); scrollToEnd(); }}
                >
                  <Text style={styles.gatewayEmoji}>🤕</Text>
                  <Text style={[
                    styles.gatewayLabel,
                    hasIssue === true && styles.gatewayLabelActive,
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
                  <Ionicons name="body-outline" size={16} color={SIGNAL.color.amber} />
                  <Text style={styles.issueSectionTitle}>Injury — where does it hurt?</Text>
                </View>
                <ChipRow items={INJURY_LOCATIONS} selected={injuryLocations} onToggle={toggleInjuryLocation} />

                {hasInjuryData && (
                  <>
                    {injuryLocations.map(loc => {
                      const locLabel = INJURY_LOCATIONS.find(l => l.key === loc)?.label || loc;
                      return (
                        <View key={loc} style={styles.perLocationRow}>
                          <Text style={styles.perLocationLabel}>{locLabel}</Text>
                          <View style={styles.perLocationSeverity}>
                            {SEVERITY_OPTIONS.map(opt => {
                              const active = injurySeverityMap[loc] === opt.value;
                              return (
                                <TouchableOpacity
                                  key={opt.value}
                                  style={[styles.sevChip, active && styles.sevChipActive]}
                                  onPress={() => setLocationSeverity(loc, opt.value)}
                                >
                                  <Text style={[styles.sevChipText, active && styles.sevChipTextActive]}>
                                    {opt.emoji} {opt.label}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      );
                    })}

                    <TextInput
                      style={styles.noteInput}
                      placeholder="Brief note, e.g. 'left shin splint'"
                      placeholderTextColor={SIGNAL.color.mute2}
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
                  <Ionicons name="thermometer-outline" size={16} color={SIGNAL.color.amber} />
                  <Text style={styles.issueSectionTitle}>Illness — feeling sick?</Text>
                </View>

                <TouchableOpacity
                  style={[styles.sickToggle, illnessFlagged && styles.sickToggleActive]}
                  onPress={() => {
                    const wasOff = !illnessFlagged;
                    setIllnessFlagged(f => !f);
                    if (!wasOff) { setIllnessSymptoms([]); setIllnessSeverity(null); }
                    else { scrollToEnd(); }
                  }}
                >
                  <Text style={styles.sickToggleEmoji}>🤒</Text>
                  <Text style={[styles.sickToggleText, illnessFlagged && styles.sickToggleTextActive]}>
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
            style={[styles.doneBtn, !canContinue && styles.doneBtnDisabled]}
            onPress={handleDone}
            disabled={!canContinue}
          >
            <Text style={[styles.doneBtnText, !canContinue && styles.doneBtnTextDisabled]}>
              {doneLabel || 'Submit'}
            </Text>
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
  container: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },

  // ── Header ──
  header: {
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: 18,
    paddingHorizontal: 22,
    backgroundColor: SIGNAL.color.white,
    borderBottomWidth: 1,
    borderBottomColor: SIGNAL.color.line,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 22,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.titleTight,
  },
  subtitle: {
    fontFamily: SIGNAL.font.body,
    fontSize: 13,
    color: SIGNAL.color.mute,
    marginTop: 4,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  closeBtn: {
    padding: 4,
    marginTop: 2,
  },

  // ── Scroll body ──
  scrollBody: { flex: 1 },
  scrollContent: { padding: 18, paddingBottom: 24 },

  // ── Section labels ──
  sectionLabel: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 18,
    color: SIGNAL.color.indigo,
    marginTop: 18,
    marginBottom: 10,
    letterSpacing: SIGNAL.letter.bodyTight,
  },

  // ── Option row (emoji 5-scale) ──
  optionRow: {
    flexDirection: 'row',
    gap: 7,
  },
  optionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 2,
    borderRadius: 12,
    backgroundColor: SIGNAL.color.white,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  optionBtnActive: {
    backgroundColor: SIGNAL.color.indigo,
    borderColor: SIGNAL.color.indigo,
  },
  optionEmoji: {
    fontSize: 19,
    marginBottom: 4,
  },
  optionLabel: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 11,
    color: SIGNAL.color.mute,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  optionLabelActive: {
    color: SIGNAL.color.white,
    fontFamily: SIGNAL.font.bodyBold,
  },

  // ── Divider ──
  divider: {
    height: 1,
    backgroundColor: SIGNAL.color.line,
    marginTop: 22,
    marginBottom: 4,
  },

  // ── Gateway buttons ──
  gatewayRow: {
    flexDirection: 'row',
    gap: 12,
  },
  gatewayBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 14,
    backgroundColor: SIGNAL.color.white,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    gap: 8,
  },
  gatewayEmoji: { fontSize: 20 },
  gatewayLabel: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 14,
    color: SIGNAL.color.inkSoft,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  gatewayLabelActive: {
    color: SIGNAL.color.white,
    fontFamily: SIGNAL.font.bodyBold,
  },

  // ── Issue sections (injury / illness cards) ──
  issueSection: {
    marginTop: 18,
    backgroundColor: SIGNAL.color.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: SIGNAL.color.amber + '55',
  },
  issueSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  issueSectionTitle: {
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 14,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  subLabel: {
    ...SIGNAL.style.eyebrow,
    marginTop: 14,
    marginBottom: 8,
  },

  // ── Chips (body parts / symptoms) ──
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: SIGNAL.color.paper,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  chipActive: {
    backgroundColor: SIGNAL.color.amber,
    borderColor: SIGNAL.color.amber,
  },
  chipText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 12.5,
    color: SIGNAL.color.inkSoft,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  chipTextActive: {
    color: SIGNAL.color.white,
    fontFamily: SIGNAL.font.bodyBold,
  },

  // ── Sick toggle ──
  sickToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: SIGNAL.color.paper,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  sickToggleActive: {
    backgroundColor: SIGNAL.color.amber,
    borderColor: SIGNAL.color.amber,
  },
  sickToggleEmoji: { fontSize: 18 },
  sickToggleText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 14,
    color: SIGNAL.color.inkSoft,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  sickToggleTextActive: {
    color: SIGNAL.color.white,
    fontFamily: SIGNAL.font.bodyBold,
  },

  // ── Per-location severity ──
  perLocationRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: SIGNAL.color.line,
  },
  perLocationLabel: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 12.5,
    color: SIGNAL.color.ink,
    marginBottom: 6,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  perLocationSeverity: {
    flexDirection: 'row',
    gap: 7,
    flexWrap: 'wrap',
  },
  sevChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    backgroundColor: SIGNAL.color.paper,
  },
  sevChipActive: {
    backgroundColor: SIGNAL.color.indigo,
    borderColor: SIGNAL.color.indigo,
  },
  sevChipText: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 11.5,
    color: SIGNAL.color.inkSoft,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  sevChipTextActive: {
    color: SIGNAL.color.white,
    fontFamily: SIGNAL.font.bodyBold,
  },

  // ── Note input ──
  noteInput: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: SIGNAL.color.paper,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    fontFamily: SIGNAL.font.body,
    fontSize: 13,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },

  // ── Footer ──
  footer: {
    padding: 18,
    paddingBottom: 28,
    backgroundColor: SIGNAL.color.white,
    borderTopWidth: 1,
    borderTopColor: SIGNAL.color.line,
  },
  doneBtn: {
    borderRadius: 13,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: SIGNAL.color.indigo,
  },
  doneBtnDisabled: {
    backgroundColor: SIGNAL.color.line,
  },
  doneBtnText: {
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 16,
    color: SIGNAL.color.white,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  doneBtnTextDisabled: {
    color: SIGNAL.color.mute2,
  },
  skipBtn: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 2,
  },
  skipBtnText: {
    fontFamily: SIGNAL.font.body,
    fontSize: 13.5,
    color: SIGNAL.color.mute,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
});
