import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DatePickerField from './DatePickerField';

export const TIMEFRAMES = [
  { label: 'This week',   key: 'week' },
  { label: 'Last week',   key: 'last_week' },
  { label: 'This month',  key: 'month' },
  { label: 'Last month',  key: 'last_month' },
  { label: 'This year',   key: 'year' },
  { label: 'Season',      key: 'season' },
  { label: 'Custom range',key: 'custom' },
];

// ── Returns { start, end } Date objects for a given timeframe ─────────────────
// activeSeason: object with seasonStart and championshipDate strings
export function getDateRange(timeframe, activeSeason, customStart, customEnd) {
  const now = new Date();

  switch (timeframe?.key) {
    case 'week': {
      // Monday 00:00:00 to now
      const day = now.getDay(); // 0=Sun
      const monday = new Date(now);
      monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      monday.setHours(0, 0, 0, 0);
      return { start: monday, end: now };
    }
    case 'last_week': {
      // Monday 00:00:00 to Sunday 23:59:59 of the previous week
      const day = now.getDay(); // 0=Sun
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
      // 1st of current month to now
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
      return { start, end: now };
    }
    case 'last_month': {
      // Full previous calendar month
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { start, end };
    }
    case 'year': {
      // Jan 1 to now
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
      // Default: Aug 1 of current year if no season set
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
  activeSeason, primaryColor = '#2e7d32',
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

  // Subtitle hint for each option
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
        style={[styles.trigger, { borderColor: primaryColor }]}
        onPress={() => setDropdownVisible(true)}
      >
        <Text style={[styles.triggerText, { color: primaryColor }]}>
          {selected?.label || 'This week'}
        </Text>
        <Text style={[styles.caret, { color: primaryColor }]}>▾</Text>
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
                  style={[styles.dropdownItem, isSelected && { backgroundColor: `${primaryColor}15` }]}
                  onPress={() => handleSelect(tf)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.dropdownItemText, isSelected && { color: primaryColor, fontWeight: '700' }]}>
                      {tf.label}
                    </Text>
                    {subtitle ? <Text style={styles.dropdownItemSub}>{subtitle}</Text> : null}
                  </View>
                  {isSelected && <Text style={[styles.checkmark, { color: primaryColor }]}>✓</Text>}
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
              primaryColor={primaryColor}
              maximumDate={new Date()}
            />
            <DatePickerField
              label="End date"
              value={tempEnd}
              onChange={setTempEnd}
              primaryColor={primaryColor}
              minimumDate={tempStart || undefined}
              maximumDate={new Date()}
            />
            <View style={styles.customButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCustom(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.applyBtn, { backgroundColor: tempStart && tempEnd ? primaryColor : '#ccc' }]}
                onPress={handleApplyCustom}
                disabled={!tempStart || !tempEnd}
              >
                <Text style={styles.applyBtnText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { marginBottom: 12 },
  trigger:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#fff' },
  triggerText:     { fontSize: 15, fontWeight: '600' },
  caret:           { fontSize: 16, marginLeft: 8 },
  overlay:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  dropdown:        { backgroundColor: '#fff', borderRadius: 14, width: 320, overflow: 'hidden', elevation: 8 },
  dropdownTitle:   { fontSize: 13, fontWeight: '700', color: '#999', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  dropdownItem:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  dropdownItemText:{ fontSize: 16, color: '#333' },
  dropdownItemSub: { fontSize: 12, color: '#999', marginTop: 2 },
  checkmark:       { fontSize: 16, fontWeight: 'bold' },
  customOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  customModal:     { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  customTitle:     { fontSize: 20, fontWeight: 'bold', color: '#333', marginBottom: 20 },
  customButtons:   { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn:       { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center', backgroundColor: '#fee2e2' },
  cancelBtnText:   { fontSize: 16, fontWeight: '600', color: '#c0392b' },
  applyBtn:        { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center' },
  applyBtnText:    { fontSize: 16, fontWeight: '600', color: '#fff' },
});