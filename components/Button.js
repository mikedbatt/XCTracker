import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { BRAND, BRAND_DARK, BRAND_LIGHT, FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SPACE, STATUS } from '../constants/design';

// Variants: "primary" | "secondary" | "destructive" | "ghost"
// Sizes:    "sm" | "md" | "lg"
export default function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
}) {
  const bg =
    variant === 'primary'     ? BRAND :
    variant === 'destructive' ? STATUS.error :
    variant === 'secondary'   ? NEUTRAL.card :
    'transparent';

  const textColor =
    variant === 'primary'     ? '#fff' :
    variant === 'destructive' ? '#fff' :
    variant === 'secondary'   ? BRAND_DARK :
    BRAND;

  const borderColor =
    variant === 'secondary' ? NEUTRAL.input : 'transparent';

  const sizeStyle =
    size === 'sm' ? styles.sm :
    size === 'lg' ? styles.lg :
    styles.md;

  const textSize =
    size === 'sm' ? FONT_SIZE.sm :
    size === 'lg' ? FONT_SIZE.lg :
    FONT_SIZE.md;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      style={[
        styles.base,
        sizeStyle,
        { backgroundColor: disabled ? NEUTRAL.input : bg, borderColor },
        variant === 'secondary' && { borderWidth: 1.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <Text style={[styles.label, { color: disabled ? NEUTRAL.muted : textColor, fontSize: textSize }]}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sm: {
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.lg,
  },
  md: {
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.xl,
  },
  lg: {
    paddingVertical: SPACE.lg,
    paddingHorizontal: SPACE['2xl'],
  },
  label: {
    fontWeight: FONT_WEIGHT.bold,
  },
});
