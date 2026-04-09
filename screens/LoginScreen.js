import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform,
  ScrollView,
  StyleSheet,
  Text, TextInput, TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';
import Button from '../components/Button';
import {
  BRAND, BRAND_ACCENT, BRAND_DARK, BRAND_LIGHT,
  FONT_SIZE, FONT_WEIGHT, NEUTRAL, RADIUS, SHADOW, SPACE, STATUS,
} from '../constants/design';

const ROLES = [
  { key: 'admin_coach', label: 'Head Coach', description: 'Set up and manage your program' },
  { key: 'assistant_coach', label: 'Assistant Coach', description: 'Help manage an existing program' },
  { key: 'athlete', label: 'Athlete', description: 'Track your training and runs' },
  { key: 'parent', label: 'Parent', description: 'Follow your athlete\'s progress' },
];

export default function LoginScreen({ onAuthSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('athlete');
  const [gender, setGender] = useState('boys');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    checkBiometrics();
  }, []);

  const checkBiometrics = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    const storedEmail = await SecureStore.getItemAsync('xctracker_email');
    setBiometricAvailable(compatible && enrolled && !!storedEmail);
  };

  const handleBiometricLogin = async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Sign in to TeamBase',
      fallbackLabel: 'Use password instead',
    });
    if (!result.success) {
      Alert.alert('Failed', 'Biometric authentication failed. Please try your password.');
      return;
    }
    setLoading(true);
    try {
      const storedEmail = await SecureStore.getItemAsync('xctracker_email');
      const storedPassword = await SecureStore.getItemAsync('xctracker_password');
      if (!storedEmail || !storedPassword) {
        Alert.alert('Sign in required', 'Please sign in with your email and password first to enable biometric login.');
        setLoading(false);
        return;
      }
      const userCredential = await signInWithEmailAndPassword(auth, storedEmail, storedPassword);
      if (onAuthSuccess) onAuthSuccess({ uid: userCredential.user.uid });
    } catch (error) {
      Alert.alert('Sign in failed', 'Your saved credentials are no longer valid. Please sign in with your email and password.');
      await SecureStore.deleteItemAsync('xctracker_email');
      await SecureStore.deleteItemAsync('xctracker_password');
      setBiometricAvailable(false);
    }
    setLoading(false);
  };

  const calculateAge = () => {
    if (!birthYear || !birthMonth || !birthDay) return null;
    const today = new Date();
    const birth = new Date(parseInt(birthYear), parseInt(birthMonth) - 1, parseInt(birthDay));
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  const validateAge = () => {
    if (role !== 'athlete') return { valid: true };
    const age = calculateAge();
    if (age === null) return { valid: false, message: 'Please enter your date of birth.' };
    if (age < 13) return { valid: false, message: 'Athletes under 13 require special parental consent. Please have a parent or guardian contact us to set up your account.' };
    if (age < 18 && !parentEmail) return { valid: false, message: 'Athletes under 18 must provide a parent or guardian email address.' };
    return { valid: true, age };
  };

  const handleEmailAuth = async () => {
    if (!email || !password) {
      Alert.alert('Missing info', 'Please enter your email and password.');
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        if (!firstName || !lastName) {
          Alert.alert('Missing info', 'Please enter your first and last name.');
          setLoading(false);
          return;
        }

        const ageCheck = validateAge();
        if (!ageCheck.valid) {
          Alert.alert('Age Verification', ageCheck.message);
          setLoading(false);
          return;
        }

        const age = ageCheck.age;
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        const userData = {
          firstName,
          lastName,
          email: user.email,
          role,
          gender: role === 'athlete' ? gender : null,
          createdAt: new Date(),
          totalMiles: 0,
          schoolId: null,
          status: role === 'admin_coach' ? 'approved' : 'pending',
          ...(role === 'assistant_coach' && { coachRole: 'assistant' }),
        };

        if (role === 'athlete') {
          userData.birthdate = `${birthYear}-${birthMonth}-${birthDay}`;
          userData.age = age;
          userData.isMinor = age < 18;
          userData.parentEmail = age < 18 ? parentEmail : null;
          userData.parentConsentGiven = false;
        }

        await setDoc(doc(db, 'users', user.uid), userData);

        if (role === 'athlete' && age < 18) {
          Alert.alert(
            'Parent Consent Required',
            `We've sent a consent email to ${parentEmail}. Your parent must approve your account before you can access team features. You can still log your own runs!`
          );
        }

        if (onAuthSuccess) onAuthSuccess({ uid: user.uid, role, status: userData.status });

      } else {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        await SecureStore.setItemAsync('xctracker_email', email);
        await SecureStore.setItemAsync('xctracker_password', password);
        if (onAuthSuccess) onAuthSuccess({ uid: userCredential.user.uid });
      }
    } catch (error) {
      let message = 'Something went wrong. Please try again.';
      if (error.code === 'auth/invalid-email') message = 'Please enter a valid email address.';
      if (error.code === 'auth/wrong-password') message = 'Incorrect password. Please try again.';
      if (error.code === 'auth/user-not-found') message = 'No account found with that email.';
      if (error.code === 'auth/email-already-in-use') message = 'An account with this email already exists.';
      if (error.code === 'auth/weak-password') message = 'Password should be at least 6 characters.';
      Alert.alert('Error', message);
    }

    setLoading(false);
  };

  const handleForgotPassword = () => {
    if (!email) {
      Alert.alert('Enter your email', 'Type your email address above first, then tap Forgot Password.');
      return;
    }
    Alert.alert(
      'Reset password?',
      `Send a reset link to ${email}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send reset link', onPress: async () => {
          try {
            await sendPasswordResetEmail(auth, email);
            Alert.alert('Email sent', `Check ${email} for a password reset link. Check your spam folder if you don't see it.`);
          } catch (error) {
            if (error.code === 'auth/user-not-found') {
              Alert.alert('Not found', 'No account found with that email address.');
            } else {
              Alert.alert('Error', 'Could not send reset email. Please try again.');
            }
          }
        }},
      ]
    );
  };

  const age = calculateAge();
  const showParentEmail = role === 'athlete' && isSignUp && age !== null && age < 18;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>TeamBase</Text>
          <Text style={styles.subtitle}>Cross Country Training App</Text>
        </View>

        {/* Role Selector - only on sign up */}
        {isSignUp && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>I am a:</Text>
            {ROLES.map((r) => (
              <TouchableOpacity
                key={r.key}
                style={[styles.roleCard, role === r.key && styles.roleCardActive]}
                onPress={() => setRole(r.key)}
              >
                <View style={styles.roleCardInner}>
                  <Text style={[styles.roleCardTitle, role === r.key && styles.roleCardTitleActive]}>
                    {r.label}
                  </Text>
                  <Text style={[styles.roleCardDesc, role === r.key && styles.roleCardDescActive]}>
                    {r.description}
                  </Text>
                </View>
                <View style={[styles.radioCircle, role === r.key && styles.radioCircleActive]}>
                  {role === r.key && <View style={styles.radioInner} />}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Name fields - sign up only */}
        {isSignUp && (
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.halfInput]}
              placeholder="First name"
              placeholderTextColor={NEUTRAL.muted}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
            />
            <TextInput
              style={[styles.input, styles.halfInput]}
              placeholder="Last name"
              placeholderTextColor={NEUTRAL.muted}
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
            />
          </View>
        )}

        {/* Email */}
        <TextInput
          style={styles.input}
          placeholder="Email address"
          placeholderTextColor={NEUTRAL.muted}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        {/* Password with show/hide */}
        <View style={styles.passwordRow}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Password"
            placeholderTextColor={NEUTRAL.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => setShowPassword(v => !v)}
          >
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={NEUTRAL.body} />
          </TouchableOpacity>
        </View>

        {/* Forgot password */}
        {!isSignUp && (
          <TouchableOpacity style={styles.forgotBtn} onPress={handleForgotPassword}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>
        )}

        {/* Gender selector - athletes only on sign up */}
        {isSignUp && role === 'athlete' && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>I compete on the:</Text>
            <View style={styles.row}>
              {['boys', 'girls'].map(g => (
                <TouchableOpacity
                  key={g}
                  style={[styles.genderCard, gender === g && styles.genderCardActive]}
                  onPress={() => setGender(g)}
                >
                  <Text style={[styles.genderText, gender === g && styles.genderTextActive]}>
                    {g === 'boys' ? 'Boys team' : 'Girls team'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Date of Birth - athletes only on sign up */}
        {isSignUp && role === 'athlete' && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Date of birth</Text>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.thirdInput]}
                placeholder="MM"
                placeholderTextColor={NEUTRAL.muted}
                value={birthMonth}
                onChangeText={setBirthMonth}
                keyboardType="numeric"
                maxLength={2}
              />
              <TextInput
                style={[styles.input, styles.thirdInput]}
                placeholder="DD"
                placeholderTextColor={NEUTRAL.muted}
                value={birthDay}
                onChangeText={setBirthDay}
                keyboardType="numeric"
                maxLength={2}
              />
              <TextInput
                style={[styles.input, styles.thirdInput]}
                placeholder="YYYY"
                placeholderTextColor={NEUTRAL.muted}
                value={birthYear}
                onChangeText={setBirthYear}
                keyboardType="numeric"
                maxLength={4}
              />
            </View>
            {age !== null && age < 18 && (
              <View style={styles.minorNotice}>
                <Text style={styles.minorNoticeText}>
                  Parental consent required for athletes under 18
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Parent email - minors only */}
        {showParentEmail && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Parent or guardian email</Text>
            <TextInput
              style={styles.input}
              placeholder="parent@email.com"
              placeholderTextColor={NEUTRAL.muted}
              value={parentEmail}
              onChangeText={setParentEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Text style={styles.helperText}>
              Your parent will receive a consent email before you can access team features.
            </Text>
          </View>
        )}

        {/* Sign In / Sign Up button */}
        <Button
          label={isSignUp ? 'Create Account' : 'Sign In'}
          onPress={handleEmailAuth}
          loading={loading}
          size="lg"
          style={{ marginTop: SPACE.sm }}
        />

        {/* Face ID button */}
        {biometricAvailable && !isSignUp && (
          <Button
            label="Sign in with Face ID / Fingerprint"
            variant="secondary"
            onPress={handleBiometricLogin}
            size="lg"
            style={{ marginTop: SPACE.md }}
          />
        )}

        {/* Toggle sign in / sign up */}
        <TouchableOpacity style={styles.toggleButton} onPress={() => setIsSignUp(!isSignUp)}>
          <Text style={styles.toggleText}>
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </Text>
        </TouchableOpacity>

        {/* Privacy notice */}
        {isSignUp && (
          <Text style={styles.privacyText}>
            By creating an account you agree to our Terms of Service and Privacy Policy.
            We take the privacy and safety of minors seriously.
          </Text>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: NEUTRAL.bg },
  scrollContent:    { padding: SPACE['2xl'], paddingBottom: SPACE['4xl'] },
  header:           { alignItems: 'center', marginBottom: SPACE['3xl'], marginTop: SPACE['4xl'] },
  title:            { fontSize: FONT_SIZE['3xl'], fontWeight: FONT_WEIGHT.bold, color: BRAND },
  subtitle:         { fontSize: FONT_SIZE.md, color: NEUTRAL.body, marginTop: SPACE.sm },
  section:          { width: '100%', marginBottom: SPACE.sm },
  sectionLabel:     { fontSize: FONT_SIZE.base, color: BRAND_DARK, fontWeight: FONT_WEIGHT.semibold, marginBottom: SPACE.md },
  row:              { flexDirection: 'row', gap: SPACE.md },
  input: {
    width: '100%', backgroundColor: NEUTRAL.card, borderRadius: RADIUS.md,
    padding: SPACE.lg, fontSize: FONT_SIZE.md, marginBottom: SPACE.md,
    borderWidth: 1, borderColor: NEUTRAL.input, color: BRAND_DARK,
  },
  halfInput:        { flex: 1, width: undefined },
  thirdInput:       { flex: 1, width: undefined },
  roleCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: NEUTRAL.card,
    borderRadius: RADIUS.md, padding: SPACE.lg - 2, marginBottom: SPACE.md,
    borderWidth: 2, borderColor: NEUTRAL.border,
  },
  roleCardActive:      { borderColor: BRAND, backgroundColor: BRAND_LIGHT },
  roleCardInner:       { flex: 1 },
  roleCardTitle:       { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, color: BRAND_DARK },
  roleCardTitleActive: { color: BRAND },
  roleCardDesc:        { fontSize: FONT_SIZE.sm, color: NEUTRAL.muted, marginTop: 2 },
  roleCardDescActive:  { color: BRAND_ACCENT },
  radioCircle: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: NEUTRAL.input,
    alignItems: 'center', justifyContent: 'center',
  },
  radioCircleActive:   { borderColor: BRAND },
  radioInner:          { width: 12, height: 12, borderRadius: 6, backgroundColor: BRAND },
  genderCard: {
    flex: 1, alignItems: 'center', backgroundColor: NEUTRAL.card,
    borderRadius: RADIUS.md, padding: SPACE.lg - 2,
    borderWidth: 2, borderColor: NEUTRAL.border,
  },
  genderCardActive:    { backgroundColor: BRAND, borderColor: BRAND },
  genderText:          { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: NEUTRAL.label },
  genderTextActive:    { color: '#fff' },
  minorNotice: {
    backgroundColor: STATUS.warningBg, borderRadius: RADIUS.sm, padding: SPACE.md,
    borderLeftWidth: 4, borderLeftColor: STATUS.warning, marginTop: SPACE.xs, marginBottom: SPACE.sm,
  },
  minorNoticeText:     { color: '#92400e', fontSize: FONT_SIZE.sm },
  passwordRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: NEUTRAL.card,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: NEUTRAL.input, marginBottom: SPACE.md,
  },
  passwordInput:       { flex: 1, padding: SPACE.lg - 2, fontSize: FONT_SIZE.md, color: BRAND_DARK },
  eyeBtn:              { paddingHorizontal: SPACE.lg, paddingVertical: SPACE.lg - 2 },
  forgotBtn:           { alignSelf: 'flex-end', marginTop: -SPACE.sm, marginBottom: SPACE.md },
  forgotText:          { color: BRAND, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  helperText:          { fontSize: FONT_SIZE.xs, color: NEUTRAL.body, marginTop: SPACE.xs, marginBottom: SPACE.sm },
  toggleButton:        { marginTop: SPACE.xl, alignItems: 'center' },
  toggleText:          { color: BRAND, fontSize: FONT_SIZE.base },
  privacyText: {
    fontSize: FONT_SIZE.xs, color: NEUTRAL.muted, textAlign: 'center',
    marginTop: SPACE.xl, lineHeight: 16,
  },
});
