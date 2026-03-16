import { useState } from 'react';
import {
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

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

function OptionRow({ options, selected, onSelect, primaryColor }) {
  return (
    <View style={styles.optionRow}>
      {options.map(opt => (
        <TouchableOpacity
          key={opt.value}
          style={[
            styles.optionBtn,
            selected === opt.value && { backgroundColor: primaryColor, borderColor: primaryColor },
          ]}
          onPress={() => onSelect(opt.value)}
        >
          <Text style={styles.optionEmoji}>{opt.emoji}</Text>
          <Text style={[
            styles.optionLabel,
            selected === opt.value && { color: '#fff', fontWeight: '700' },
          ]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function WellnessCheckIn({ visible, onComplete, onSkip, primaryColor = '#2e7d32' }) {
  const [sleep, setSleep] = useState(null);
  const [legs, setLegs] = useState(null);
  const [mood, setMood] = useState(null);

  const canContinue = sleep !== null && legs !== null && mood !== null;

  const handleDone = () => {
    onComplete({ sleep, legs, mood });
    setSleep(null); setLegs(null); setMood(null);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Quick check-in</Text>
          <Text style={styles.subtitle}>How are you feeling before this run?</Text>
        </View>

        <View style={styles.body}>
          <Text style={styles.sectionLabel}>Sleep last night</Text>
          <OptionRow options={SLEEP_OPTIONS} selected={sleep} onSelect={setSleep} primaryColor={primaryColor} />

          <Text style={styles.sectionLabel}>How are your legs?</Text>
          <OptionRow options={LEGS_OPTIONS} selected={legs} onSelect={setLegs} primaryColor={primaryColor} />

          <Text style={styles.sectionLabel}>Mood right now</Text>
          <OptionRow options={MOOD_OPTIONS} selected={mood} onSelect={setMood} primaryColor={primaryColor} />
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.doneBtn, { backgroundColor: canContinue ? primaryColor : '#ccc' }]}
            onPress={handleDone}
            disabled={!canContinue}
          >
            <Text style={styles.doneBtnText}>Log my run →</Text>
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
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    paddingTop: 60, paddingBottom: 24, paddingHorizontal: 24,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  title: { fontSize: 26, fontWeight: 'bold', color: '#333' },
  subtitle: { fontSize: 15, color: '#666', marginTop: 6 },
  body: { flex: 1, padding: 24 },
  sectionLabel: {
    fontSize: 15, fontWeight: '700', color: '#333',
    marginBottom: 12, marginTop: 20,
  },
  optionRow: { flexDirection: 'row', gap: 8 },
  optionBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 12,
    borderRadius: 12, backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: '#ddd',
  },
  optionEmoji: { fontSize: 20, marginBottom: 4 },
  optionLabel: { fontSize: 11, color: '#666', fontWeight: '500' },
  footer: { padding: 24, paddingBottom: 40, gap: 12 },
  doneBtn: { borderRadius: 14, padding: 18, alignItems: 'center' },
  doneBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  skipBtn: { alignItems: 'center', padding: 10 },
  skipBtnText: { color: '#999', fontSize: 15 },
});