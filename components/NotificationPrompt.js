// ── NotificationPrompt ───────────────────────────────────────────────────────
// Web only: a dismissible "Turn on notifications" banner for signed-in users
// who haven't been asked yet. Browsers — and iOS Safari for installed PWAs in
// particular — only show the permission dialog when it's triggered by a user
// tap, so registerWebPush must run from this button, not automatically after
// sign-in (which silently did nothing on iPhones).
//
// Hidden when push isn't possible here (no Notification/PushManager — e.g. iOS
// Safari outside an installed home-screen app), once permission is granted or
// denied, or after the user dismisses it (remembered in localStorage).
// Sits at the TOP so it never collides with the bottom InstallPrompt.

import { Ionicons } from '@expo/vector-icons';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SIGNAL } from '../constants/design';
import { auth } from '../firebaseConfig';
import { registerWebPush, webPushPermission } from '../utils/webPush';

const DISMISS_KEY = 'xct_notif_prompt_dismissed';

export default function NotificationPrompt() {
  const [uid, setUid] = useState(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    return onAuthStateChanged(auth, user => setUid(user?.uid || null));
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || !uid) { setVisible(false); return; }
    let dismissed = false;
    try { dismissed = window.localStorage.getItem(DISMISS_KEY) === '1'; } catch (e) { /* private mode */ }
    setVisible(!dismissed && webPushPermission() === 'default');
  }, [uid]);

  const dismiss = () => {
    setVisible(false);
    try { window.localStorage.setItem(DISMISS_KEY, '1'); } catch (e) { /* session-only */ }
  };

  const enable = async () => {
    setBusy(true);
    await registerWebPush(uid); // prompts — we're inside a tap handler
    setBusy(false);
    setVisible(false); // granted or denied, the browser won't ask again
  };

  if (!visible) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.banner}>
        <View style={styles.icon}>
          <Ionicons name="notifications-outline" size={20} color={SIGNAL.color.indigo} />
        </View>
        <View style={styles.body}>
          <Text style={styles.title}>Turn on notifications</Text>
          <Text style={styles.sub}>Coach replies, team posts and check-in reminders.</Text>
        </View>
        <TouchableOpacity style={styles.cta} onPress={enable} disabled={busy} accessibilityRole="button">
          <Text style={styles.ctaText}>{busy ? '…' : 'Turn on'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.close}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss notifications prompt"
        >
          <Ionicons name="close" size={18} color={SIGNAL.color.mute} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    alignItems: 'center',
    paddingHorizontal: SIGNAL.space.screen,
    paddingTop: Platform.OS === 'web' ? 'calc(12px + env(safe-area-inset-top, 0px))' : SIGNAL.space[6],
    zIndex: 1000,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 520,
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    paddingVertical: SIGNAL.space[4],
    paddingHorizontal: SIGNAL.space[5],
    // Floating element → shadow is allowed per Signal spec.
    shadowColor: '#0B0D12',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: SIGNAL.radius.control,
    backgroundColor: `${SIGNAL.color.indigo}${SIGNAL.tint.chip}`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SIGNAL.space[4],
  },
  body: { flex: 1, marginRight: SIGNAL.space[3] },
  title: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: SIGNAL.size.bodyLg,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  sub: {
    fontFamily: SIGNAL.font.body,
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.mute,
    marginTop: 2,
  },
  cta: {
    backgroundColor: SIGNAL.color.indigo,
    borderRadius: SIGNAL.radius.button,
    paddingVertical: SIGNAL.space[2],
    paddingHorizontal: SIGNAL.space[5],
    marginRight: SIGNAL.space[2],
  },
  ctaText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.white,
  },
  close: {
    padding: SIGNAL.space[1],
  },
});
