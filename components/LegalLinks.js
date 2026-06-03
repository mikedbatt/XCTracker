// ── LegalLinks ───────────────────────────────────────────────────────────────
// Two stacked link rows ("Privacy Policy" + "Terms of Service") with an
// "Legal" eyebrow header. Drop into profile screens just above the sign-out
// button. Opens links in the device browser via Linking.

import { Ionicons } from '@expo/vector-icons';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SIGNAL } from '../constants/design';
import { PRIVACY_URL, TERMS_URL } from '../constants/legal';

function Row({ label, url }) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => Linking.openURL(url).catch(() => {})}
      activeOpacity={0.7}
    >
      <Text style={styles.label}>{label}</Text>
      <Ionicons name="open-outline" size={14} color={SIGNAL.color.mute} />
    </TouchableOpacity>
  );
}

export default function LegalLinks() {
  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>Legal</Text>
      <Row label="Privacy Policy"    url={PRIVACY_URL} />
      <Row label="Terms of Service"  url={TERMS_URL} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 18,
    marginBottom: 6,
  },
  eyebrow: {
    ...SIGNAL.style.eyebrow,
    marginBottom: 6,
    paddingLeft: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: SIGNAL.color.line,
    backgroundColor: SIGNAL.color.white,
  },
  label: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 14,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
});
