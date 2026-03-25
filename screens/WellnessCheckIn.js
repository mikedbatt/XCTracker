import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
    Modal,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import {
  BRAND, BRAND_DARK,
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE,
} from '../constants/design';

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

export default function WellnessCheckIn({ visible, onComplete, onSkip, onClose, doneLabel, primaryColor }) {
  const [sleep, setSleep] = useState(null);
  const [legs, setLegs] = useState(null);
  const [mood, setMood] = useState(null);

  const canContinue = sleep !== null && legs !== null && mood !== null;

  const handleDone = () => {
    onComplete({ sleep, legs, mood });
    setSleep(null); setLegs(null); setMood(null);
  };

  const handleClose = () => {
    setSleep(null); setLegs(null); setMood(null);
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

        <View style={styles.body}>
          <Text style={styles.sectionLabel}>Sleep last night</Text>
          <OptionRow options={SLEEP_OPTIONS} selected={sleep} onSelect={setSleep} />

          <Text style={styles.sectionLabel}>How are your legs?</Text>
          <OptionRow options={LEGS_OPTIONS} selected={legs} onSelect={setLegs} />

          <Text style={styles.sectionLabel}>Mood right now</Text>
          <OptionRow options={MOOD_OPTIONS} selected={mood} onSelect={setMood} />
        </View>

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
  body:         { flex: 1, padding: SPACE['2xl'] },
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
  footer:       { padding: SPACE['2xl'], paddingBottom: SPACE['4xl'], gap: SPACE.md },
  doneBtn:      { borderRadius: RADIUS.lg, padding: SPACE.lg + 2, alignItems: 'center' },
  doneBtnText:  { color: '#fff', fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  skipBtn:      { alignItems: 'center', padding: SPACE.md },
  skipBtnText:  { color: NEUTRAL.muted, fontSize: FONT_SIZE.base },
});
