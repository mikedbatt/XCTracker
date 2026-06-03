// ── confirmDestructive ───────────────────────────────────────────────────────
// Cross-platform "are you sure?" prompt for destructive actions.
//
// react-native-web's Alert.alert polyfill collapses multi-button alerts to
// window.alert (OK only) on web, so the onPress callbacks for Cancel/Confirm
// never fire. This helper branches to window.confirm on web (true/false) and
// the native Alert.alert with proper buttons on iOS/Android.

import { Alert, Platform } from 'react-native';

export function confirmDestructive({
  title,
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
}) {
  if (Platform.OS === 'web') {
    const text = message ? `${title}\n\n${message}` : title;
    const ok = typeof window !== 'undefined' && window.confirm
      ? window.confirm(text)
      : false;
    if (ok) onConfirm && onConfirm();
    else if (onCancel) onCancel();
    return;
  }
  Alert.alert(title, message || '', [
    { text: 'Cancel', style: 'cancel', onPress: onCancel },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
