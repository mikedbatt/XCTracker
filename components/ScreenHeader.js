import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { BRAND, FONT_SIZE, FONT_WEIGHT, SPACE } from '../constants/design';

// Shared header with BRAND color background.
// Props:
//   title       — main heading (required)
//   subtitle    — smaller text below title (optional)
//   left        — React node for left side (e.g., back button)
//   right       — React node for right side (e.g., avatar, action)
//   children    — additional content below title row (e.g., stat cards)
export default function ScreenHeader({ title, subtitle, left, right, children }) {
  return (
    <View style={styles.header}>
      <View style={styles.topRow}>
        {left && <View style={styles.left}>{left}</View>}
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {right && <View style={styles.right}>{right}</View>}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: BRAND,
    paddingTop: Platform.OS === 'ios' ? SPACE['5xl'] : SPACE['3xl'],
    paddingHorizontal: SPACE.xl,
    paddingBottom: SPACE.xl,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  left: {
    marginRight: SPACE.md,
  },
  titleWrap: {
    flex: 1,
  },
  title: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: '#fff',
  },
  subtitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.normal,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  right: {
    marginLeft: SPACE.md,
  },
});
