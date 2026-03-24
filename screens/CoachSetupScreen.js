import { doc, setDoc, updateDoc } from 'firebase/firestore';
import React, { useState } from 'react';
import {
    Alert, ScrollView,
    StyleSheet,
    Text, TextInput, TouchableOpacity,
    View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';
import Button from '../components/Button';
import {
  BRAND, BRAND_DARK, BRAND_LIGHT,
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SPACE, STATUS,
} from '../constants/design';

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

      <Text style={styles.label}>School name</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Boise High School"
        placeholderTextColor={NEUTRAL.muted}
        value={schoolName}
        onChangeText={setSchoolName}
        autoCapitalize="words"
      />

      <Text style={styles.label}>Mascot (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Braves, Eagles, Warriors"
        placeholderTextColor={NEUTRAL.muted}
        value={mascot}
        onChangeText={setMascot}
        autoCapitalize="words"
      />

      <Text style={styles.label}>School logo URL (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="https://yourschool.edu/logo.png"
        placeholderTextColor={NEUTRAL.muted}
        value={logoUrl}
        onChangeText={setLogoUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <Text style={styles.helperText}>
        Right-click your school logo on your school website and copy the image URL
      </Text>

      <View style={styles.row}>
        <View style={styles.flex}>
          <Text style={styles.label}>City</Text>
          <TextInput
            style={styles.input}
            placeholder="City"
            placeholderTextColor={NEUTRAL.muted}
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
            placeholderTextColor={NEUTRAL.muted}
            value={state}
            onChangeText={setState}
            autoCapitalize="characters"
            maxLength={2}
          />
        </View>
      </View>

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
                <View style={[styles.swatch, { backgroundColor: colorOption.secondary, borderWidth: 1, borderColor: NEUTRAL.border }]} />
              </View>
            ) : (
              <Text style={styles.customLabel}>Custom</Text>
            )}
            <Text style={styles.colorName}>{colorOption.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {selectedColors?.name === 'Custom' && (
        <View style={styles.customColors}>
          <Text style={styles.helperText}>Enter hex color codes (e.g. #1a237e)</Text>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.label}>Primary color</Text>
              <TextInput
                style={styles.input}
                placeholder="#000000"
                placeholderTextColor={NEUTRAL.muted}
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
                placeholderTextColor={NEUTRAL.muted}
                value={customSecondary}
                onChangeText={setCustomSecondary}
                autoCapitalize="none"
              />
            </View>
          </View>
        </View>
      )}

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Your join code</Text>
        <Text style={styles.infoText}>
          After setup, you'll receive a unique 6-character join code to share with your athletes.
          Athletes can also search for your school by name.
        </Text>
      </View>

      <Button
        label="Create My Program"
        onPress={handleCreateSchool}
        loading={loading}
        size="lg"
      />

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: NEUTRAL.bg },
  content:       { padding: SPACE['2xl'], paddingBottom: SPACE['4xl'] },
  header:        { marginBottom: SPACE['2xl'], marginTop: SPACE.xl },
  title:         { fontSize: 26, fontWeight: FONT_WEIGHT.bold, color: BRAND },
  subtitle:      { fontSize: FONT_SIZE.base, color: NEUTRAL.body, marginTop: SPACE.sm },
  label:         { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: NEUTRAL.label, marginBottom: SPACE.sm, marginTop: SPACE.xs },
  input: {
    backgroundColor: NEUTRAL.card, borderRadius: RADIUS.md, padding: SPACE.lg - 2,
    fontSize: FONT_SIZE.md, marginBottom: SPACE.lg - 2, borderWidth: 1, borderColor: NEUTRAL.input, color: BRAND_DARK,
  },
  row:           { flexDirection: 'row', gap: SPACE.md },
  flex:          { flex: 1 },
  stateField:    { width: 80 },
  colorsGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md, marginBottom: SPACE.lg },
  colorCard: {
    width: '22%', backgroundColor: NEUTRAL.card, borderRadius: RADIUS.md,
    padding: SPACE.md, alignItems: 'center', borderWidth: 2, borderColor: NEUTRAL.border,
  },
  colorCardActive: { borderColor: BRAND },
  colorSwatches: { flexDirection: 'row', gap: SPACE.xs, marginBottom: SPACE.sm },
  swatch:        { width: 20, height: 20, borderRadius: RADIUS.full },
  customLabel:   { fontSize: FONT_SIZE.lg, marginBottom: SPACE.xs },
  colorName:     { fontSize: 10, color: NEUTRAL.body, textAlign: 'center' },
  customColors:  { marginBottom: SPACE.sm },
  helperText:    { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, marginBottom: SPACE.sm },
  infoBox: {
    backgroundColor: BRAND_LIGHT, borderRadius: RADIUS.md, padding: SPACE.lg - 2,
    borderLeftWidth: 4, borderLeftColor: BRAND, marginBottom: SPACE.xl,
  },
  infoTitle:     { fontWeight: FONT_WEIGHT.bold, color: BRAND, marginBottom: SPACE.xs },
  infoText:      { fontSize: FONT_SIZE.sm, color: NEUTRAL.label, lineHeight: 18 },
});
