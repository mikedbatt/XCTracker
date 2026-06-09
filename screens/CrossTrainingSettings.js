// ── Cross-Training settings (coach) ──────────────────────────────────────────
// Coach sets the "mile equivalent" conversion factor per cross-training activity
// type: 1 mile of that activity earns this many running-equivalent credit miles.
// Stored on schools/{id}.crossTrainingFactors and read by utils/activityMiles.js.

import { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { SIGNAL } from '../constants/design';
import { CROSS_TRAINING_TYPES, DEFAULT_CT_FACTORS } from '../utils/activityMiles';

export default function CrossTrainingSettings({ school, schoolId, onSaved, onClose }) {
  // Seed each input from the saved factor, falling back to the default.
  const [values, setValues] = useState(() => {
    const saved = school?.crossTrainingFactors || {};
    const v = {};
    for (const t of CROSS_TRAINING_TYPES) {
      v[t.key] = String(saved[t.key] ?? DEFAULT_CT_FACTORS[t.key] ?? 0);
    }
    return v;
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const factors = {};
      for (const t of CROSS_TRAINING_TYPES) {
        const n = parseFloat(values[t.key]);
        factors[t.key] = isNaN(n) || n < 0 ? (DEFAULT_CT_FACTORS[t.key] ?? 0) : Math.round(n * 100) / 100;
      }
      await updateDoc(doc(db, 'schools', schoolId), { crossTrainingFactors: factors });
      onSaved && onSaved(factors);
      onClose && onClose();
    } catch (e) {
      console.warn('Failed to save cross-training factors:', e);
    }
    setSaving(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Cross Training</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={10}>
          <Ionicons name="close" size={22} color={SIGNAL.color.ink} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.intro}>
            Set how many running-equivalent <Text style={styles.bold}>credit miles</Text> an athlete
            earns per mile of each activity. When an athlete logs cross-training, the miles are
            converted by these factors and count toward their total and weekly target.
          </Text>

          {CROSS_TRAINING_TYPES.map(t => (
            <View key={t.key} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{t.label}</Text>
                <Text style={styles.rowHint}>1 {t.label.toLowerCase()} mi = {values[t.key] || '0'} run mi</Text>
              </View>
              <TextInput
                style={styles.input}
                value={values[t.key]}
                onChangeText={(text) => setValues(v => ({ ...v, [t.key]: text }))}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={SIGNAL.color.mute2}
              />
            </View>
          ))}

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SIGNAL.color.paper2 },
  header: {
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: SIGNAL.space[5],
    paddingHorizontal: SIGNAL.space.screen,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: SIGNAL.color.paper2,
  },
  headerTitle: {
    fontFamily: SIGNAL.font.display, fontSize: 29,
    color: SIGNAL.color.indigo, letterSpacing: SIGNAL.letter.titleTight,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: SIGNAL.radius.chip,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: SIGNAL.color.white, ...SIGNAL.border.hairline,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: SIGNAL.space.screen, paddingTop: SIGNAL.space[2], paddingBottom: SIGNAL.space[8] },
  intro: {
    fontFamily: SIGNAL.font.body, fontSize: SIGNAL.size.body, color: SIGNAL.color.inkSoft,
    lineHeight: 20, marginBottom: SIGNAL.space[6], letterSpacing: SIGNAL.letter.bodyTight,
  },
  bold: { fontFamily: SIGNAL.font.bodySemi, color: SIGNAL.color.ink },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: SIGNAL.space[4],
    backgroundColor: SIGNAL.color.white, borderRadius: SIGNAL.radius.card,
    padding: SIGNAL.space.card, marginBottom: SIGNAL.space[3], ...SIGNAL.border.hairline,
  },
  rowLabel: { fontFamily: SIGNAL.font.bodySemi, fontSize: SIGNAL.size.bodyLg, color: SIGNAL.color.ink },
  rowHint: { fontFamily: SIGNAL.font.body, fontSize: SIGNAL.size.label, color: SIGNAL.color.mute, marginTop: 2 },
  input: {
    width: 80, textAlign: 'center',
    backgroundColor: SIGNAL.color.paper, borderRadius: SIGNAL.radius.control,
    borderWidth: 1, borderColor: SIGNAL.color.line,
    paddingVertical: SIGNAL.space[3],
    fontFamily: SIGNAL.font.mono, fontSize: 18, color: SIGNAL.color.ink,
  },
  saveBtn: {
    backgroundColor: SIGNAL.color.indigo, borderRadius: SIGNAL.radius.button,
    paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: SIGNAL.space[4],
  },
  saveBtnText: { fontFamily: SIGNAL.font.bodyBold, fontSize: SIGNAL.size.bodyLg, color: SIGNAL.color.white },
});
