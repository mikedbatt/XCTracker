import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BRAND, FONT_SIZE, FONT_WEIGHT, NEUTRAL, SHADOW, SPACE } from '../constants/design';

// Tab bar with Ionicons.
// Props:
//   tabs — array of { label, icon, onPress, badge? (number), active? (boolean) }
//   Example icon names: "add-circle-outline", "calendar-outline", "chatbubbles-outline",
//                       "people-outline", "barbell-outline", "analytics-outline", "person-outline"
export default function BottomNav({ tabs }) {
  return (
    <View style={styles.bar}>
      {tabs.map((tab, i) => {
        const color = tab.active ? BRAND : NEUTRAL.muted;
        return (
          <TouchableOpacity key={i} style={styles.tab} onPress={tab.onPress} activeOpacity={0.7}>
            <View>
              <Ionicons name={tab.icon} size={24} color={color} />
              {tab.badge > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{tab.badge > 9 ? '9+' : tab.badge}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, { color }]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: NEUTRAL.card,
    borderTopWidth: 1,
    borderTopColor: NEUTRAL.border,
    paddingTop: SPACE.sm,
    paddingBottom: Platform.OS === 'ios' ? SPACE['2xl'] : SPACE.sm,
    ...SHADOW.md,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  label: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.medium,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#dc2626',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: FONT_WEIGHT.bold,
  },
});
