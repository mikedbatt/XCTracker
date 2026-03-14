import { useState } from 'react';
import {
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

export const TIMEFRAMES = [
  { label: 'This week', days: 7 },
  { label: 'Last 2 weeks', days: 14 },
  { label: 'Last month', days: 30 },
  { label: 'Last 3 months', days: 90 },
  { label: 'Season', days: 'season' },
  { label: 'All time', days: null },
  { label: 'Custom range', days: 'custom' },
];

// Calculate date range from a timeframe + season dates
export function getDateRange(timeframe, seasonStart, seasonEnd) {
  const now = new Date();
  if (timeframe.days === null) return { start: null, end: null };
  if (timeframe.days === 'custom') return { start: null, end: null };
  if (timeframe.days === 'season') {
    return {
      start: seasonStart ? new Date(seasonStart) : new Date(now.getFullYear(), 7, 1), // Aug 1 default
      end: seasonEnd ? new Date(seasonEnd) : now,
    };
  }
  const start = new Date();
  start.setDate(start.getDate() - timeframe.days);
  return { start, end: now };
}

export default function TimeframePicker({
  selected,
  onSelect,
  customStart,
  customEnd,
  onCustomChange,
  seasonStart,
  seasonEnd,
  primaryColor = '#2e7d32',
}) {
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [tempStart, setTempStart] = useState(customStart || '');
  const [tempEnd, setTempEnd] = useState(customEnd || '');

  const handleSelect = (tf) => {
    setDropdownVisible(false);
    if (tf.days === 'custom') {
      setShowCustom(true);
    } else {
      setShowCustom(false);
      onSelect(tf);
    }
  };

  const handleApplyCustom = () => {
    if (!tempStart || !tempEnd) return;
    onSelect({ label: `${tempStart} – ${tempEnd}`, days: 'custom' });
    onCustomChange && onCustomChange(tempStart, tempEnd);
    setShowCustom(false);
  };

  return (
    <View style={styles.container}>

      {/* Dropdown trigger */}
      <TouchableOpacity
        style={[styles.trigger, { borderColor: primaryColor }]}
        onPress={() => setDropdownVisible(true)}
      >
        <Text style={[styles.triggerText, { color: primaryColor }]}>
          {selected?.label || 'This week'}
        </Text>
        <Text style={[styles.caret, { color: primaryColor }]}>▾</Text>
      </TouchableOpacity>

      {/* Dropdown modal */}
      <Modal
        visible={dropdownVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDropdownVisible(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setDropdownVisible(false)}
        >
          <View style={styles.dropdown}>
            <Text style={styles.dropdownTitle}>Select time range</Text>
            {TIMEFRAMES.map((tf) => (
              <TouchableOpacity
                key={tf.label}
                style={[
                  styles.dropdownItem,
                  selected?.label === tf.label && { backgroundColor: `${primaryColor}15` },
                ]}
                onPress={() => handleSelect(tf)}
              >
                <Text style={[
                  styles.dropdownItemText,
                  selected?.label === tf.label && { color: primaryColor, fontWeight: '700' },
                ]}>
                  {tf.label}
                </Text>
                {tf.days === 'season' && seasonStart && (
                  <Text style={styles.dropdownItemSub}>
                    {seasonStart} – {seasonEnd || 'present'}
                  </Text>
                )}
                {tf.days === 'season' && !seasonStart && (
                  <Text style={styles.dropdownItemSub}>Aug 1 – present (default)</Text>
                )}
                {selected?.label === tf.label && (
                  <Text style={[styles.checkmark, { color: primaryColor }]}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Custom date range inputs */}
      <Modal
        visible={showCustom}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCustom(false)}
      >
        <View style={styles.customOverlay}>
          <View style={styles.customModal}>
            <Text style={styles.customTitle}>Custom date range</Text>
            <Text style={styles.customLabel}>Start date</Text>
            <TextInput
              style={styles.customInput}
              placeholder="MM/DD/YYYY"
              placeholderTextColor="#999"
              value={tempStart}
              onChangeText={setTempStart}
              keyboardType="numeric"
            />
            <Text style={styles.customLabel}>End date</Text>
            <TextInput
              style={styles.customInput}
              placeholder="MM/DD/YYYY"
              placeholderTextColor="#999"
              value={tempEnd}
              onChangeText={setTempEnd}
              keyboardType="numeric"
            />
            <View style={styles.customButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowCustom(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.applyBtn, { backgroundColor: primaryColor }]}
                onPress={handleApplyCustom}
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
  container: { marginBottom: 16 },
  trigger: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#fff',
  },
  triggerText: { fontSize: 15, fontWeight: '600' },
  caret: { fontSize: 16, marginLeft: 8 },
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center',
  },
  dropdown: {
    backgroundColor: '#fff', borderRadius: 14,
    width: 300, overflow: 'hidden',
    elevation: 8,
  },
  dropdownTitle: {
    fontSize: 13, fontWeight: '700', color: '#999',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  dropdownItemText: { flex: 1, fontSize: 16, color: '#333' },
  dropdownItemSub: { fontSize: 11, color: '#999', marginTop: 2 },
  checkmark: { fontSize: 16, fontWeight: 'bold' },
  customOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  customModal: {
    backgroundColor: '#fff', borderTopLeftRadius: 20,
    borderTopRightRadius: 20, padding: 24, paddingBottom: 40,
  },
  customTitle: { fontSize: 20, fontWeight: 'bold', color: '#333', marginBottom: 20 },
  customLabel: { fontSize: 14, fontWeight: '600', color: '#444', marginBottom: 8 },
  customInput: {
    backgroundColor: '#f5f5f5', borderRadius: 10, padding: 14,
    fontSize: 16, marginBottom: 16, color: '#333',
    borderWidth: 1, borderColor: '#e0e0e0',
  },
  customButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: {
    flex: 1, borderRadius: 10, padding: 14,
    alignItems: 'center', backgroundColor: '#f0f0f0',
  },
  cancelBtnText: { fontSize: 16, fontWeight: '600', color: '#666' },
  applyBtn: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center' },
  applyBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});