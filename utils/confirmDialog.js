// ── confirmDestructive ───────────────────────────────────────────────────────
// Cross-platform "are you sure?" prompt for destructive actions.
//
// react-native-web's Alert.alert is a no-op on web (`static alert() {}`): no
// dialog appears and no onPress ever fires. This helper branches to
// window.confirm on web (true/false) and the native Alert.alert with proper
// buttons on iOS/Android. For plain one-button messages use utils/notify.js.

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
