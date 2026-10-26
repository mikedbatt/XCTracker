// ── WrongRoleSignOut ─────────────────────────────────────────────────────────
// Escape hatch on the onboarding screens (coach setup, assistant join, athlete
// join): someone who picked the wrong account type at signup can sign out and
// start over instead of being stuck (e.g. a student who tapped "Head Coach").

import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SIGNAL } from '../constants/design';
import { confirmDestructive } from '../utils/confirmDialog';
import { signOutUser } from '../utils/signOutUser';

export default function WrongRoleSignOut() {
  const handlePress = () => confirmDestructive({
    title: 'Sign out?',
    message: 'If you picked the wrong account type, sign out and create a new account with the right one.',
    confirmLabel: 'Sign out',
    onConfirm: signOutUser,
  });
  return (
    <TouchableOpacity style={styles.button} onPress={handlePress} hitSlop={8}>
      <Text style={styles.text}>Picked the wrong account type? Sign out</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', paddingVertical: SIGNAL.space[5] },
  text: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.mute,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
});
