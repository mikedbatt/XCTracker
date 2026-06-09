import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { useState } from 'react';
import {
    Alert, Platform, ScrollView,
    StyleSheet,
    Text, TextInput, TouchableOpacity,
    View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';
import { SIGNAL } from '../constants/design';

const generateJoinCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

const SCHOOL_COLORS = [
  { name: 'Navy & Gold', primary: '#1a237e', secondary: '#ffd600' },
  { name: 'Red & White', primary: '#c62828', secondary: '#ffffff' },
  { name: 'Green & White', primary: '#1e6f5c', secondary: '#ffffff' },
  { name: 'Purple & Gold', primary: '#6a1b9a', secondary: '#ffd600' },
  { name: 'Black & Orange', primary: '#212121', secondary: '#f57c00' },
  { name: 'Blue & White', primary: '#1565c0', secondary: '#ffffff' },
  { name: 'Maroon & Gold', primary: '#880e4f', secondary: '#ffd600' },
  { name: 'Custom', primary: null, secondary: null },
];

const COMMON_TIMEZONES = [
  { value: 'America/New_York',    label: 'Eastern' },
  { value: 'America/Chicago',     label: 'Central' },
  { value: 'America/Denver',      label: 'Mountain' },
  { value: 'America/Los_Angeles', label: 'Pacific' },
  { value: 'America/Anchorage',   label: 'Alaska' },
  { value: 'Pacific/Honolulu',    label: 'Hawaii' },
];

function detectDefaultTimezone() {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (COMMON_TIMEZONES.some(tz => tz.value === detected)) return detected;
  } catch (e) { /* fall through */ }
  return 'America/New_York';
}

export default function CoachSetupScreen({ onSetupComplete }) {
  const [schoolName, setSchoolName] = useState('');
  const [mascot, setMascot] = useState('');
  const [city, setCity] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [state, setState] = useState('');
  const [selectedColors, setSelectedColors] = useState(null);
  const [customPrimary, setCustomPrimary] = useState('');
  const [customSecondary, setCustomSecondary] = useState('');
  const [timezone, setTimezone] = useState(detectDefaultTimezone());
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  // Set on success → shows the join-code success screen. (Don't use Alert with
  // buttons for this — its onPress is dropped on web, stranding the coach.)
  const [createdCode, setCreatedCode] = useState(null);

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
        timezone,
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

      setCreatedCode(joinCode);
    } catch (error) {
      Alert.alert('Error', 'Could not create school. Please try again.');
      console.error(error);
    }

    setLoading(false);
  };

  const inputStyle = (field) => [
    styles.input,
    focusedField === field && styles.inputFocused,
  ];

  // Success screen — shown once the school is created. Displays the join code to
  // share with athletes and an explicit way into the dashboard.
  if (createdCode) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Coach setup</Text>
          <Text style={styles.title}>Your team is ready 🎉</Text>
          <Text style={styles.subtitle}>Share this join code so athletes can find and join your program.</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.successCodeLabel}>JOIN CODE</Text>
          <Text style={styles.successCode}>{createdCode}</Text>
          <Text style={styles.successHint}>
            You can always find it later under Profile → School info.
          </Text>
          <TouchableOpacity
            style={styles.successButton}
            onPress={() => onSetupComplete && onSetupComplete()}
          >
            <Text style={styles.successButtonText}>Go to my dashboard</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Coach setup</Text>
        <Text style={styles.title}>Set up your team</Text>
        <Text style={styles.subtitle}>Tell us about your school so athletes can find you.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>School info</Text>

        <Text style={styles.label}>School name</Text>
        <TextInput
          style={inputStyle('schoolName')}
          placeholder="e.g. Boise High School"
          placeholderTextColor={SIGNAL.color.mute2}
          value={schoolName}
          onChangeText={setSchoolName}
          autoCapitalize="words"
          onFocus={() => setFocusedField('schoolName')}
          onBlur={() => setFocusedField(null)}
        />

        <Text style={styles.label}>Mascot (optional)</Text>
        <TextInput
          style={inputStyle('mascot')}
          placeholder="e.g. Braves, Eagles, Warriors"
          placeholderTextColor={SIGNAL.color.mute2}
          value={mascot}
          onChangeText={setMascot}
          autoCapitalize="words"
          onFocus={() => setFocusedField('mascot')}
          onBlur={() => setFocusedField(null)}
        />

        <Text style={styles.label}>School logo URL (optional)</Text>
        <TextInput
          style={inputStyle('logoUrl')}
          placeholder="https://yourschool.edu/logo.png"
          placeholderTextColor={SIGNAL.color.mute2}
          value={logoUrl}
          onChangeText={setLogoUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onFocus={() => setFocusedField('logoUrl')}
          onBlur={() => setFocusedField(null)}
        />
        <Text style={styles.helperText}>
          Right-click your school logo on your school website and copy the image URL.
        </Text>

        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.label}>City</Text>
            <TextInput
              style={inputStyle('city')}
              placeholder="City"
              placeholderTextColor={SIGNAL.color.mute2}
              value={city}
              onChangeText={setCity}
              autoCapitalize="words"
              onFocus={() => setFocusedField('city')}
              onBlur={() => setFocusedField(null)}
            />
          </View>
          <View style={styles.stateField}>
            <Text style={styles.label}>State</Text>
            <TextInput
              style={inputStyle('state')}
              placeholder="ST"
              placeholderTextColor={SIGNAL.color.mute2}
              value={state}
              onChangeText={setState}
              autoCapitalize="characters"
              maxLength={2}
              onFocus={() => setFocusedField('state')}
              onBlur={() => setFocusedField(null)}
            />
          </View>
        </View>

        <Text style={styles.label}>Timezone</Text>
        <Text style={styles.helperText}>
          Used to schedule weekly check-in reminders at noon Saturday in your local time.
        </Text>
        <View style={styles.tzGrid}>
          {COMMON_TIMEZONES.map(tz => {
            const active = timezone === tz.value;
            return (
              <TouchableOpacity
                key={tz.value}
                style={[styles.tzChip, active && styles.tzChipActive]}
                onPress={() => setTimezone(tz.value)}
                activeOpacity={0.8}
              >
                <Text style={[styles.tzChipText, active && styles.tzChipTextActive]}>
                  {tz.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Team colors</Text>
        <Text style={styles.helperText}>Pick the palette your athletes will see across the app.</Text>

        <View style={styles.colorsGrid}>
          {SCHOOL_COLORS.map((colorOption) => {
            const isActive = selectedColors?.name === colorOption.name;
            return (
              <TouchableOpacity
                key={colorOption.name}
                style={[styles.colorCard, isActive && styles.colorCardActive]}
                onPress={() => setSelectedColors(colorOption)}
                activeOpacity={0.7}
              >
                {colorOption.primary ? (
                  <View style={styles.colorSwatches}>
                    <View style={[styles.swatch, { backgroundColor: colorOption.primary }]} />
                    <View
                      style={[
                        styles.swatch,
                        {
                          backgroundColor: colorOption.secondary,
                          borderWidth: 1,
                          borderColor: SIGNAL.color.line,
                        },
                      ]}
                    />
                  </View>
                ) : (
                  <Text style={styles.customLabel}>+</Text>
                )}
                <Text style={[styles.colorName, isActive && styles.colorNameActive]}>
                  {colorOption.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {selectedColors?.name === 'Custom' && (
          <View style={styles.customColors}>
            <Text style={styles.helperText}>Enter hex color codes (e.g. #1a237e).</Text>
            <View style={styles.row}>
              <View style={styles.flex}>
                <Text style={styles.label}>Primary color</Text>
                <TextInput
                  style={inputStyle('customPrimary')}
                  placeholder="#000000"
                  placeholderTextColor={SIGNAL.color.mute2}
                  value={customPrimary}
                  onChangeText={setCustomPrimary}
                  autoCapitalize="none"
                  onFocus={() => setFocusedField('customPrimary')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
              <View style={styles.flex}>
                <Text style={styles.label}>Secondary color</Text>
                <TextInput
                  style={inputStyle('customSecondary')}
                  placeholder="#ffffff"
                  placeholderTextColor={SIGNAL.color.mute2}
                  value={customSecondary}
                  onChangeText={setCustomSecondary}
                  autoCapitalize="none"
                  onFocus={() => setFocusedField('customSecondary')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
            </View>
          </View>
        )}
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Your join code</Text>
        <Text style={styles.infoText}>
          After setup, you'll receive a unique 6-character join code to share with your athletes.
          Athletes can also search for your school by name.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
        onPress={handleCreateSchool}
        disabled={loading}
        activeOpacity={0.85}
      >
        <Text style={styles.primaryButtonText}>
          {loading ? 'Creating...' : 'Create team'}
        </Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },
  content: {
    padding: SIGNAL.space.screen,
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: SIGNAL.space[8] * 2,
  },

  // Header
  header: {
    marginBottom: SIGNAL.space[8],
  },
  eyebrow: {
    ...SIGNAL.style.eyebrow,
    marginBottom: SIGNAL.space[2],
  },
  title: {
    fontFamily: SIGNAL.font.display,
    fontSize: 29,
    color: SIGNAL.color.indigo,
    letterSpacing: SIGNAL.letter.titleTight,
    lineHeight: 34,
  },
  subtitle: {
    fontFamily: SIGNAL.font.body,
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.inkSoft,
    letterSpacing: SIGNAL.letter.bodyTight,
    marginTop: SIGNAL.space[2],
    lineHeight: 20,
  },

  // Cards
  card: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: SIGNAL.space.card,
    marginBottom: SIGNAL.space[5],
    ...SIGNAL.border.hairline,
  },

  // ── Success state ───────────────────────────────────────────────────────
  successCodeLabel: {
    ...SIGNAL.style.eyebrow,
    textAlign: 'center',
    marginBottom: SIGNAL.space[2],
  },
  successCode: {
    fontFamily: SIGNAL.font.mono,
    fontSize: 34,
    letterSpacing: 8,
    color: SIGNAL.color.indigo,
    textAlign: 'center',
    marginBottom: SIGNAL.space[4],
  },
  successHint: {
    fontFamily: SIGNAL.font.body,
    fontSize: 13,
    color: SIGNAL.color.mute,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: SIGNAL.space[6],
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  successButton: {
    backgroundColor: SIGNAL.color.indigo,
    borderRadius: SIGNAL.radius.button,
    paddingVertical: SIGNAL.space[5],
    alignItems: 'center',
    justifyContent: 'center',
  },
  successButtonText: {
    fontFamily: SIGNAL.font.bodyBold,
    fontSize: 15,
    color: SIGNAL.color.white,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  sectionTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: SIGNAL.size.heading,
    color: SIGNAL.color.indigo,
    marginBottom: SIGNAL.space[4],
  },

  // Labels + inputs
  label: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.mute,
    marginBottom: SIGNAL.space[2],
    marginTop: SIGNAL.space[2],
  },
  input: {
    backgroundColor: SIGNAL.color.paper2,
    borderRadius: SIGNAL.radius.control,
    paddingHorizontal: SIGNAL.space[4],
    paddingVertical: SIGNAL.space[4],
    fontFamily: SIGNAL.font.body,
    fontSize: SIGNAL.size.bodyLg,
    color: SIGNAL.color.ink,
    marginBottom: SIGNAL.space[3],
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  inputFocused: {
    borderColor: SIGNAL.color.indigo,
    backgroundColor: SIGNAL.color.white,
  },

  row: {
    flexDirection: 'row',
    gap: SIGNAL.space[4],
  },
  flex: { flex: 1 },
  stateField: { width: 90 },

  helperText: {
    fontFamily: SIGNAL.font.body,
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.mute,
    marginBottom: SIGNAL.space[3],
    lineHeight: 16,
  },

  // Color picker
  colorsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIGNAL.space[3],
    marginTop: SIGNAL.space[2],
    marginBottom: SIGNAL.space[2],
  },
  colorCard: {
    width: '23%',
    backgroundColor: SIGNAL.color.paper2,
    borderRadius: SIGNAL.radius.control,
    paddingVertical: SIGNAL.space[4],
    paddingHorizontal: SIGNAL.space[2],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  colorCardActive: {
    borderColor: SIGNAL.color.indigo,
    borderWidth: 2,
    backgroundColor: SIGNAL.color.white,
  },
  colorSwatches: {
    flexDirection: 'row',
    gap: SIGNAL.space[1],
    marginBottom: SIGNAL.space[2],
  },
  swatch: {
    width: 18,
    height: 18,
    borderRadius: SIGNAL.radius.chip,
  },
  customLabel: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 20,
    color: SIGNAL.color.mute,
    marginBottom: SIGNAL.space[1],
    lineHeight: 22,
  },
  colorName: {
    fontFamily: SIGNAL.font.body,
    fontSize: 10,
    color: SIGNAL.color.mute,
    textAlign: 'center',
  },
  colorNameActive: {
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.indigo,
  },

  customColors: {
    marginTop: SIGNAL.space[3],
  },

  // Timezone chips
  tzGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIGNAL.space[2],
    marginTop: SIGNAL.space[1],
    marginBottom: SIGNAL.space[2],
  },
  tzChip: {
    paddingHorizontal: SIGNAL.space[3],
    paddingVertical: SIGNAL.space[2],
    borderRadius: 999,
    backgroundColor: SIGNAL.color.paper2,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  tzChipActive: {
    backgroundColor: SIGNAL.color.indigo,
    borderColor: SIGNAL.color.indigo,
  },
  tzChipText: {
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 12.5,
    color: SIGNAL.color.inkSoft,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  tzChipTextActive: {
    color: '#fff',
    fontFamily: SIGNAL.font.bodyBold,
  },

  // Info box
  infoBox: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: SIGNAL.space.card,
    marginBottom: SIGNAL.space[6],
    borderLeftWidth: 3,
    borderLeftColor: SIGNAL.color.indigo,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: SIGNAL.color.line,
    borderRightColor: SIGNAL.color.line,
    borderBottomColor: SIGNAL.color.line,
  },
  infoTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: SIGNAL.size.body,
    color: SIGNAL.color.indigo,
    marginBottom: SIGNAL.space[1],
  },
  infoText: {
    fontFamily: SIGNAL.font.body,
    fontSize: SIGNAL.size.label,
    color: SIGNAL.color.inkSoft,
    lineHeight: 18,
  },

  // Primary CTA
  primaryButton: {
    backgroundColor: SIGNAL.color.indigo,
    borderRadius: SIGNAL.radius.button,
    paddingVertical: SIGNAL.space[5],
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: SIGNAL.size.bodyLg,
    color: SIGNAL.color.white,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
});
