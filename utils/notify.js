// ── notify ───────────────────────────────────────────────────────────────────
// Cross-platform one-button message ("Saved", "Not found", validation errors).
//
// react-native-web's Alert.alert is a NO-OP on web (its implementation is
// literally `static alert() {}`), so every Alert.alert message silently
// vanishes in the PWA — the user taps a button and nothing visibly happens.
// This helper uses window.alert on web and the native Alert elsewhere.
//
// For "are you sure?" prompts use confirmDestructive (utils/confirmDialog.js).
// `onDismiss` runs after the user closes the message (window.alert blocks, so
// on web it runs right after).

import { Alert, Platform } from 'react-native';

export function notify(title, message, onDismiss) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.alert) {
      window.alert(message ? `${title}\n\n${message}` : title);
    }
    if (onDismiss) onDismiss();
    return;
  }
  Alert.alert(title, message || '', onDismiss ? [{ text: 'OK', onPress: onDismiss }] : undefined);
}
