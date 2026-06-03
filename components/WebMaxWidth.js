// ── WebMaxWidth ──────────────────────────────────────────────────────────────
// Constrains rendered children to a sensible max width on web so dashboards
// don't stretch across an ultrawide monitor. No-op on native (returns children
// directly so React Native's view tree stays unchanged).

import { Platform, StyleSheet, View } from 'react-native';

const MAX_WIDTH = 1280;

export default function WebMaxWidth({ children, maxWidth = MAX_WIDTH }) {
  if (Platform.OS !== 'web') return children;
  return (
    <View style={styles.outer}>
      <View style={[styles.inner, { maxWidth }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, alignItems: 'center', backgroundColor: '#F5F5F7' },
  inner: { flex: 1, width: '100%' },
});
