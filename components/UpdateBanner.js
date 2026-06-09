// ── UpdateBanner ─────────────────────────────────────────────────────────────
// Shows a one-tap "new version available" banner on web/PWA when a fresh build
// has been deployed (see utils/pwaUpdate.js). No-op on native.

import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SIGNAL } from '../constants/design';
import { initPwaAutoUpdate, reloadForUpdate } from '../utils/pwaUpdate';

export default function UpdateBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    initPwaAutoUpdate(() => setShow(true));
  }, []);

  if (Platform.OS !== 'web' || !show) return null;

  return (
    <View
      style={[styles.wrap, { paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }]}
      pointerEvents="box-none"
    >
      <TouchableOpacity style={styles.banner} onPress={reloadForUpdate} activeOpacity={0.9}>
        <Ionicons name="arrow-up-circle" size={20} color={SIGNAL.color.white} />
        <Text style={styles.text}>New version available — tap to update</Text>
        <Text style={styles.cta}>Reload</Text>
      </TouchableOpacity>
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
    paddingTop: SIGNAL.space[6],
    zIndex: 1001,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIGNAL.space[3],
    width: '100%',
    maxWidth: 520,
    backgroundColor: SIGNAL.color.indigo,
    borderRadius: SIGNAL.radius.button,
    paddingVertical: SIGNAL.space[3],
    paddingHorizontal: SIGNAL.space[5],
    shadowColor: '#0B0D12',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  text: { flex: 1, fontFamily: SIGNAL.font.bodyMedium, fontSize: SIGNAL.size.body, color: SIGNAL.color.white },
  cta: { fontFamily: SIGNAL.font.bodyBold, fontSize: SIGNAL.size.body, color: SIGNAL.color.white },
});
