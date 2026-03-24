import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DatePickerField from './DatePickerField';
import Button from '../components/Button';
import {
  BRAND, BRAND_DARK, BRAND_LIGHT,
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE, STATUS,
} from '../constants/design';

export const TIMEFRAMES = [
  { label: 'This week',   key: 'week' },
  { label: 'Last week',   key: 'last_week' },
  { label: 'This month',  key: 'month' },
  { label: 'Last month',  key: 'last_month' },
  { label: 'This year',   key: 'year' },
  { label: 'Season',      key: 'season' },
  { label: 'Custom range',key: 'custom' },
];

export function getDateRange(timeframe, activeSeason, customStart, customEnd) {
  const now = new Date();

  switch (timeframe?.key) {
    case 'week': {
      const day = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      monday.setHours(0, 0, 0, 0);
      return { start: monday, end: now };
    }
    case 'last_week': {
      const day = now.getDay();
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(thisMonday.getDate() - 7);
      lastMonday.setHours(0, 0, 0, 0);
      const lastSunday = new Date(thisMonday);
      lastSunday.setDate(thisMonday.getDate() - 1);
      lastSunday.setHours(23, 59, 59, 999);
      return { start: lastMonday, end: lastSunday };
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
      return { start, end: now };
    }
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { start, end };
    }
    case 'year': {
      const start = new Date(now.getFullYear(), 0, 1);
      start.setHours(0, 0, 0, 0);
      return { start, end: now };
    }
    case 'season': {
      if (activeSeason?.seasonStart) {
        return {
          start: new Date(activeSeason.seasonStart),
          end:   activeSeason.championshipDate ? new Date(activeSeason.championshipDate) : now,
        };
      }
      return { start: new Date(now.getFullYear(), 7, 1), end: now };
    }
    case 'custom': {
      return {
        start: customStart instanceof Date ? customStart : null,
        end:   customEnd   instanceof Date ? customEnd   : null,
      };
    }
    default:
      return { start: null, end: now };
  }
}

export default function TimeframePicker({
  selected, onSelect, customStart, customEnd, onCustomChange,
  activeSeason, primaryColor, // primaryColor kept for compat but ignored
}) {
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [showCustom,      setShowCustom]      = useState(false);
  const [tempStart,       setTempStart]       = useState(null);
  const [tempEnd,         setTempEnd]         = useState(null);

  const handleSelect = (tf) => {
    setDropdownVisible(false);
    if (tf.key === 'custom') {
      setTempStart(null);
      setTempEnd(null);
      setShowCustom(true);
    } else {
      setShowCustom(false);
      onSelect(tf);
    }
  };

  const handleApplyCustom = () => {
    if (!tempStart || !tempEnd) return;
    const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    onSelect({ label: `${fmt(tempStart)} – ${fmt(tempEnd)}`, key: 'custom' });
    onCustomChange && onCustomChange(tempStart, tempEnd);
    setShowCustom(false);
  };

  const getSubtitle = (tf) => {
    const now = new Date();
    switch (tf.key) {
      case 'week': {
        const day = now.getDay();
        const monday = new Date(now);
        monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
        return `Mon ${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – today`;
      }
      case 'month':
        return `${now.toLocaleDateString('en-US', { month: 'long' })} 1 – today`;
      case 'last_month': {
        const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return lm.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      }
      case 'year':
        return `Jan 1, ${now.getFullYear()} – today`;
      case 'season':
        return activeSeason?.name || 'Based on current active season';
      case 'custom':
        return 'Pick your own start and end date';
      default: return '';
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setDropdownVisible(true)}
      >
        <Text style={styles.triggerText}>
          {selected?.label || 'This week'}
        </Text>
        <Text style={styles.caret}>▾</Text>
      </TouchableOpacity>

      {/* Dropdown */}
      <Modal visible={dropdownVisible} transparent animationType="fade" onRequestClose={() => setDropdownVisible(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setDropdownVisible(false)}>
          <View style={styles.dropdown}>
            <Text style={styles.dropdownTitle}>Select time range</Text>
            {TIMEFRAMES.map((tf) => {
              const isSelected = selected?.key === tf.key;
              const subtitle = getSubtitle(tf);
              return (
                <TouchableOpacity
                  key={tf.key}
                  style={[styles.dropdownItem, isSelected && { backgroundColor: BRAND_LIGHT }]}
                  onPress={() => handleSelect(tf)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.dropdownItemText, isSelected && { color: BRAND, fontWeight: FONT_WEIGHT.bold }]}>
                      {tf.label}
                    </Text>
                    {subtitle ? <Text style={styles.dropdownItemSub}>{subtitle}</Text> : null}
                  </View>
                  {isSelected && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Custom date picker */}
      <Modal visible={showCustom} transparent animationType="slide" onRequestClose={() => setShowCustom(false)}>
        <View style={styles.customOverlay}>
          <View style={styles.customModal}>
            <Text style={styles.customTitle}>Custom date range</Text>
            <DatePickerField
              label="Start date"
              value={tempStart}
              onChange={setTempStart}
              maximumDate={new Date()}
            />
            <DatePickerField
              label="End date"
              value={tempEnd}
              onChange={setTempEnd}
              minimumDate={tempStart || undefined}
              maximumDate={new Date()}
            />
            <View style={styles.customButtons}>
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => setShowCustom(false)}
                style={{ flex: 1 }}
              />
              <Button
                label="Apply"
                onPress={handleApplyCustom}
                disabled={!tempStart || !tempEnd}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { marginBottom: SPACE.md },
  trigger:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderColor: BRAND, borderRadius: RADIUS.md, paddingHorizontal: SPACE.lg - 2, paddingVertical: SPACE.md, backgroundColor: NEUTRAL.card },
  triggerText:     { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: BRAND },
  caret:           { fontSize: FONT_SIZE.md, marginLeft: SPACE.sm, color: BRAND },
  overlay:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  dropdown:        { backgroundColor: NEUTRAL.card, borderRadius: RADIUS.lg, width: 320, overflow: 'hidden', ...SHADOW.lg },
  dropdownTitle:   { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: NEUTRAL.muted, paddingHorizontal: SPACE.lg, paddingTop: SPACE.lg - 2, paddingBottom: SPACE.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  dropdownItem:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, borderTopWidth: 1, borderTopColor: NEUTRAL.bg },
  dropdownItemText:{ fontSize: FONT_SIZE.md, color: BRAND_DARK },
  dropdownItemSub: { fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, marginTop: 2 },
  checkmark:       { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: BRAND },
  customOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  customModal:     { backgroundColor: NEUTRAL.card, borderTopLeftRadius: SPACE.xl, borderTopRightRadius: SPACE.xl, padding: SPACE['2xl'], paddingBottom: SPACE['4xl'] },
  customTitle:     { fontSize: FONT_SIZE.xl - 2, fontWeight: FONT_WEIGHT.bold, color: BRAND_DARK, marginBottom: SPACE.xl },
  customButtons:   { flexDirection: 'row', gap: SPACE.md, marginTop: SPACE.sm },
});
