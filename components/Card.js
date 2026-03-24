import React from 'react';
import { StyleSheet, View } from 'react-native';
import { NEUTRAL, RADIUS, SHADOW, SPACE, STATUS } from '../constants/design';

// Variants:
//   "default"   — white card with subtle shadow
//   "alert"     — red left border for warnings/errors
//   "highlight" — tinted background with colored left border (pass accentColor)
export default function Card({ children, variant = 'default', accentColor, style }) {
  const variantStyle =
    variant === 'alert'     ? [styles.alert] :
    variant === 'highlight' ? [{ backgroundColor: (accentColor || NEUTRAL.bg) + '15', borderLeftWidth: 3, borderLeftColor: accentColor }] :
    [];

  return (
    <View style={[styles.base, ...variantStyle, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: NEUTRAL.card,
    borderRadius: RADIUS.lg,
    padding: SPACE.lg,
    marginBottom: SPACE.md,
    ...SHADOW.sm,
  },
  alert: {
    borderLeftWidth: 3,
    borderLeftColor: STATUS.error,
    backgroundColor: STATUS.errorBg,
  },
});
