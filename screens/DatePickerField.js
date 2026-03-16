import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import {
  Modal,
  Platform,
  StyleSheet,
  Text, TouchableOpacity,
  View,
} from 'react-native';

export default function DatePickerField({
  label,
  value,
  onChange,
  primaryColor = '#2e7d32',
  minimumDate,
  maximumDate,
  mode = 'date',
}) {
  const [show, setShow] = useState(false);
  // Safely convert any date format to a valid JS Date
  const toValidDate = (val) => {
    if (!val) return undefined;
    if (val?.toDate) return val.toDate();           // Firestore Timestamp
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
    // Pre-fire onChange with today if no value set yet
    // iOS spinner only fires onChange on scroll, not on open
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

  // iOS uses a modal, Android shows inline
  if (Platform.OS === 'ios') {
    return (
      <View style={styles.container}>
        {label && <Text style={styles.label}>{label}</Text>}
        <TouchableOpacity
          style={[styles.trigger, { borderColor: value ? primaryColor : '#ddd' }]}
          onPress={handleOpen}
        >
          <Text style={[styles.triggerText, { color: value ? '#333' : '#999' }]}>
            {mode === 'time' ? formatTime(date) : formatDate(date)}
          </Text>
          <Text style={[styles.icon, { color: primaryColor }]}>📅</Text>
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
                  <Text style={[styles.modalDone, { color: primaryColor }]}>Done</Text>
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
        style={[styles.trigger, { borderColor: value ? primaryColor : '#ddd' }]}
        onPress={handleOpen}
      >
        <Text style={[styles.triggerText, { color: value ? '#333' : '#999' }]}>
          {mode === 'time' ? formatTime(date) : formatDate(date)}
        </Text>
        <Text style={[styles.icon, { color: primaryColor }]}>📅</Text>
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
  container: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#444', marginBottom: 8 },
  trigger: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1.5,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  triggerText: { fontSize: 16, flex: 1 },
  icon: { fontSize: 18, marginLeft: 8 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 16,
    borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  modalTitle: { fontSize: 16, fontWeight: '600', color: '#333' },
  modalCancel: { fontSize: 16, color: '#c0392b', fontWeight: '600' },
  modalDone: { fontSize: 16, fontWeight: '700' },
  picker: { height: 200 },
});