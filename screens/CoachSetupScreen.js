import { doc, setDoc, updateDoc } from 'firebase/firestore';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert, ScrollView,
    StyleSheet,
    Text, TextInput, TouchableOpacity,
    View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';

// Generate a random 6-character join code
const generateJoinCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

const SCHOOL_COLORS = [
  { name: 'Navy & Gold', primary: '#1a237e', secondary: '#ffd600' },
  { name: 'Red & White', primary: '#c62828', secondary: '#ffffff' },
  { name: 'Green & White', primary: '#2e7d32', secondary: '#ffffff' },
  { name: 'Purple & Gold', primary: '#6a1b9a', secondary: '#ffd600' },
  { name: 'Black & Orange', primary: '#212121', secondary: '#f57c00' },
  { name: 'Blue & White', primary: '#1565c0', secondary: '#ffffff' },
  { name: 'Maroon & Gold', primary: '#880e4f', secondary: '#ffd600' },
  { name: 'Custom', primary: null, secondary: null },
];

export default function CoachSetupScreen({ onSetupComplete }) {
  const [schoolName, setSchoolName] = useState('');
  const [mascot, setMascot] = useState('');
  const [city, setCity] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [state, setState] = useState('');
  const [selectedColors, setSelectedColors] = useState(null);
  const [customPrimary, setCustomPrimary] = useState('');
  const [customSecondary, setCustomSecondary] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreateSchool = async () => {
    if (!schoolName || !city || !state) {
      Alert.alert('Missing info', 'Please fill in your school name, city, and state.');
      return;
    }
    if (!selectedColors) {
      Alert.alert('Missing info', 'Please select your school colors.');
      return;
    }

    setLoading(true);

    try {
      const user = auth.currentUser;
      const joinCode = generateJoinCode();

      const primaryColor = selectedColors.name === 'Custom' ? customPrimary : selectedColors.primary;
      const secondaryColor = selectedColors.name === 'Custom' ? customSecondary : selectedColors.secondary;

      // Create the school document
      const schoolRef = doc(db, 'schools', `school_${user.uid}`);
      await setDoc(schoolRef, {
        name: schoolName,
        mascot,
        city,
        state,
        primaryColor,
        secondaryColor,
        adminCoachId: user.uid,
        coachIds: [user.uid],
        joinCode,
        createdAt: new Date(),
        logoUrl: logoUrl || null,
        athleteCount: 0,
      });

      // Update the coach's user document with their school
      await updateDoc(doc(db, 'users', user.uid), {
        schoolId: `school_${user.uid}`,
        status: 'approved',
        coachRole: 'admin',
      });

      Alert.alert(
        'School Created!',
        `Your join code is: ${joinCode}\n\nShare this with your athletes so they can find and join your program.`,
        [{ text: 'Got it!', onPress: () => onSetupComplete && onSetupComplete() }]
      );
    } catch (error) {
      Alert.alert('Error', 'Could not create school. Please try again.');
      console.error(error);
    }

    setLoading(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      <View style={styles.header}>
        <Text style={styles.title}>Set Up Your Program</Text>
        <Text style={styles.subtitle}>Tell us about your school so athletes can find you</Text>
      </View>

      {/* School name */}
      <Text style={styles.label}>School name</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Boise High School"
        placeholderTextColor="#999"
        value={schoolName}
        onChangeText={setSchoolName}
        autoCapitalize="words"
      />

      {/* Mascot */}
      <Text style={styles.label}>Mascot (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Braves, Eagles, Warriors"
        placeholderTextColor="#999"
        value={mascot}
        onChangeText={setMascot}
        autoCapitalize="words"
      />
      {/* School logo URL */}
<Text style={styles.label}>School logo URL (optional)</Text>
<TextInput
  style={styles.input}
  placeholder="https://yourschool.edu/logo.png"
  placeholderTextColor="#999"
  value={logoUrl}
  onChangeText={setLogoUrl}
  autoCapitalize="none"
  autoCorrect={false}
  keyboardType="url"
/>
<Text style={styles.helperText}>
  Right-click your school logo on your school website and copy the image URL
</Text>

      {/* Location */}
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text style={styles.label}>City</Text>
          <TextInput
            style={styles.input}
            placeholder="City"
            placeholderTextColor="#999"
            value={city}
            onChangeText={setCity}
            autoCapitalize="words"
          />
        </View>
        <View style={styles.stateField}>
          <Text style={styles.label}>State</Text>
          <TextInput
            style={styles.input}
            placeholder="State"
            placeholderTextColor="#999"
            value={state}
            onChangeText={setState}
            autoCapitalize="characters"
            maxLength={2}
          />
        </View>
      </View>

      {/* School colors */}
      <Text style={styles.label}>School colors</Text>
      <View style={styles.colorsGrid}>
        {SCHOOL_COLORS.map((colorOption) => (
          <TouchableOpacity
            key={colorOption.name}
            style={[
              styles.colorCard,
              selectedColors?.name === colorOption.name && styles.colorCardActive,
            ]}
            onPress={() => setSelectedColors(colorOption)}
          >
            {colorOption.primary ? (
              <View style={styles.colorSwatches}>
                <View style={[styles.swatch, { backgroundColor: colorOption.primary }]} />
                <View style={[styles.swatch, { backgroundColor: colorOption.secondary, borderWidth: 1, borderColor: '#ddd' }]} />
              </View>
            ) : (
              <Text style={styles.customLabel}>Custom</Text>
            )}
            <Text style={styles.colorName}>{colorOption.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Custom color inputs */}
      {selectedColors?.name === 'Custom' && (
        <View style={styles.customColors}>
          <Text style={styles.helperText}>Enter hex color codes (e.g. #1a237e)</Text>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.label}>Primary color</Text>
              <TextInput
                style={styles.input}
                placeholder="#000000"
                placeholderTextColor="#999"
                value={customPrimary}
                onChangeText={setCustomPrimary}
                autoCapitalize="none"
              />
            </View>
            <View style={styles.flex}>
              <Text style={styles.label}>Secondary color</Text>
              <TextInput
                style={styles.input}
                placeholder="#ffffff"
                placeholderTextColor="#999"
                value={customSecondary}
                onChangeText={setCustomSecondary}
                autoCapitalize="none"
              />
            </View>
          </View>
        </View>
      )}

      {/* Info box */}
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Your join code</Text>
        <Text style={styles.infoText}>
          After setup, you'll receive a unique 6-character join code to share with your athletes.
          Athletes can also search for your school by name.
        </Text>
      </View>

      {/* Submit */}
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={handleCreateSchool}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Create My Program</Text>
        )}
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 24, paddingBottom: 48 },
  header: { marginBottom: 28, marginTop: 20 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#2e7d32' },
  subtitle: { fontSize: 15, color: '#666', marginTop: 6 },
  label: { fontSize: 14, fontWeight: '600', color: '#444', marginBottom: 6, marginTop: 4 },
  input: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    fontSize: 16, marginBottom: 14, borderWidth: 1, borderColor: '#ddd', color: '#333',
  },
  row: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
  stateField: { width: 80 },
  colorsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  colorCard: {
    width: '22%', backgroundColor: '#fff', borderRadius: 10,
    padding: 10, alignItems: 'center', borderWidth: 2, borderColor: '#ddd',
  },
  colorCardActive: { borderColor: '#2e7d32' },
  colorSwatches: { flexDirection: 'row', gap: 4, marginBottom: 6 },
  swatch: { width: 20, height: 20, borderRadius: 10 },
  customLabel: { fontSize: 18, marginBottom: 4 },
  colorName: { fontSize: 10, color: '#666', textAlign: 'center' },
  customColors: { marginBottom: 8 },
  helperText: { fontSize: 12, color: '#666', marginBottom: 8 },
  infoBox: {
    backgroundColor: '#e8f5e9', borderRadius: 10, padding: 14,
    borderLeftWidth: 4, borderLeftColor: '#2e7d32', marginBottom: 20,
  },
  infoTitle: { fontWeight: '700', color: '#2e7d32', marginBottom: 4 },
  infoText: { fontSize: 13, color: '#444', lineHeight: 18 },
  primaryButton: {
    backgroundColor: '#2e7d32', borderRadius: 10, padding: 16, alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});