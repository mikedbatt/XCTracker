import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import {
  Modal,
  Platform,
  StyleSheet,
  Text, TouchableOpacity,
  View,
} from 'react-native';
import {
  BRAND, BRAND_DARK,
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SPACE, STATUS,
} from '../constants/design';

export default function DatePickerField({
  label,
  value,
  onChange,
  primaryColor, // kept for backwards compat but ignored — always uses BRAND
  minimumDate,
  maximumDate,
  mode = 'date',
}) {
  const [show, setShow] = useState(false);

  const toValidDate = (val) => {
    if (!val) return undefined;
    if (val?.toDate) return val.toDate();
    if (val instanceof Date && !isNaN(val.getTime())) return val;
    if (typeof val === 'string') {
      const d = new Date(val);
      return isNaN(d.getTime()) ? undefined : d;
    }
    return undefined;
  };

  const date    = toValidDate(value) || new Date();
  const minDate = toValidDate(minimumDate);
  const maxDate = toValidDate(maximumDate);

  const handleOpen = () => {
    setShow(true);
    if (!value) onChange(new Date());
  };

  const formatDate = (d) => {
    if (!value) return 'Tap to select date';
    return d.toLocaleDateString('en-US', {
      weekday: 'short', month: 'long', day: 'numeric', year: 'numeric',
    });
  };

  const formatTime = (d) => {
    if (!value) return 'Tap to select time';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const handleChange = (event, selectedDate) => {
    if (Platform.OS === 'android') setShow(false);
    if (selectedDate) onChange(selectedDate);
  };

  if (Platform.OS === 'ios') {
    return (
      <View style={styles.container}>
        {label && <Text style={styles.label}>{label}</Text>}
        <TouchableOpacity
          style={[styles.trigger, value && styles.triggerActive]}
          onPress={handleOpen}
        >
          <Text style={[styles.triggerText, { color: value ? BRAND_DARK : NEUTRAL.muted }]}>
            {mode === 'time' ? formatTime(date) : formatDate(date)}
          </Text>
          <Ionicons name="calendar-outline" size={20} color={BRAND} />
        </TouchableOpacity>

        <Modal visible={show} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setShow(false)}>
                  <Text style={styles.modalCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>{label || 'Select date'}</Text>
                <TouchableOpacity onPress={() => setShow(false)}>
                  <Text style={styles.modalDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={date}
                mode={mode}
                display="spinner"
                onChange={handleChange}
                minimumDate={minDate}
                maximumDate={maxDate}
                style={styles.picker}
              />
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // Android
  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity
        style={[styles.trigger, value && styles.triggerActive]}
        onPress={handleOpen}
      >
        <Text style={[styles.triggerText, { color: value ? BRAND_DARK : NEUTRAL.muted }]}>
          {mode === 'time' ? formatTime(date) : formatDate(date)}
        </Text>
        <Ionicons name="calendar-outline" size={20} color={BRAND} />
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={date}
          mode={mode}
          display="default"
          onChange={handleChange}
          minimumDate={minDate}
          maximumDate={maxDate}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { marginBottom: SPACE.lg },
  label:        { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: NEUTRAL.label, marginBottom: SPACE.sm },
  trigger: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: NEUTRAL.card, borderRadius: RADIUS.md, borderWidth: 1.5,
    borderColor: NEUTRAL.input, paddingHorizontal: SPACE.lg - 2, paddingVertical: SPACE.lg - 2,
  },
  triggerActive: { borderColor: BRAND },
  triggerText:  { fontSize: FONT_SIZE.md, flex: 1 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: NEUTRAL.card,
    borderTopLeftRadius: SPACE.xl, borderTopRightRadius: SPACE.xl,
    paddingBottom: SPACE['3xl'],
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: SPACE.lg,
    borderBottomWidth: 1, borderBottomColor: NEUTRAL.border,
  },
  modalTitle:   { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, color: BRAND_DARK },
  modalCancel:  { fontSize: FONT_SIZE.md, color: STATUS.error, fontWeight: FONT_WEIGHT.semibold },
  modalDone:    { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: BRAND },
  picker:       { height: 200 },
});
