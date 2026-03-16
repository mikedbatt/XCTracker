import * as LocalAuthentication from 'expo-local-authentication';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert, KeyboardAvoidingView, Platform,
  ScrollView,
  StyleSheet,
  Text, TextInput, TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';

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

  useEffect(() => {
    checkBiometrics();
  }, []);

  const checkBiometrics = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    setBiometricAvailable(compatible && enrolled);
  };

  const handleBiometricLogin = async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Sign in to XCTracker',
      fallbackLabel: 'Use password instead',
    });
    if (result.success) {
      Alert.alert('Success', 'Biometric authentication successful!');
    } else {
      Alert.alert('Failed', 'Biometric authentication failed. Please try your password.');
    }
  };

  // Calculate age from birthdate fields
  const calculateAge = () => {
    if (!birthYear || !birthMonth || !birthDay) return null;
    const today = new Date();
    const birth = new Date(parseInt(birthYear), parseInt(birthMonth) - 1, parseInt(birthDay));
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  // Validate age requirements
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

        // Validate age for athletes
        const ageCheck = validateAge();
        if (!ageCheck.valid) {
          Alert.alert('Age Verification', ageCheck.message);
          setLoading(false);
          return;
        }

        const age = ageCheck.age;
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Build user document
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
        };

        // Add age and parent info for athletes
        if (role === 'athlete') {
          userData.birthdate = `${birthYear}-${birthMonth}-${birthDay}`;
          userData.age = age;
          userData.isMinor = age < 18;
          userData.parentEmail = age < 18 ? parentEmail : null;
          userData.parentConsentGiven = false;
        }

        await setDoc(doc(db, 'users', user.uid), userData);

        // If minor athlete, send parent consent notification (placeholder)
        if (role === 'athlete' && age < 18) {
          Alert.alert(
            'Parent Consent Required',
            `We've sent a consent email to ${parentEmail}. Your parent must approve your account before you can access team features. You can still log your own runs!`
          );
        }

        // Notify parent to call onAuthSuccess with role info
        if (onAuthSuccess) onAuthSuccess({ uid: user.uid, role, status: userData.status });

      } else {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
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
          <Text style={styles.title}>XCTracker</Text>
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
              placeholderTextColor="#999"
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
            />
            <TextInput
              style={[styles.input, styles.halfInput]}
              placeholder="Last name"
              placeholderTextColor="#999"
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
          placeholderTextColor="#999"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        {/* Password */}
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#999"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {/* Gender - athletes only on sign up */}
        {isSignUp && role === 'athlete' && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>I compete on the:</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {['boys', 'girls'].map(g => (
                <TouchableOpacity
                  key={g}
                  style={[styles.roleCard, { flex: 1, paddingVertical: 14 },
                    gender === g && { borderColor: '#2e7d32', backgroundColor: '#e8f5e9' }]}
                  onPress={() => setGender(g)}
                >
                  <Text style={[styles.roleLabel, gender === g && { color: '#2e7d32' }]}>
                    {g === 'boys' ? 'Boys team' : 'Girls team'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Gender selector - athletes only on sign up */}
        {isSignUp && role === 'athlete' && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>I compete on the:</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {['boys', 'girls'].map(g => (
                <TouchableOpacity
                  key={g}
                  style={[styles.roleCard, { flex: 1, padding: 14, alignItems: 'center' },
                    gender === g && { backgroundColor: '#2e7d32', borderColor: '#2e7d32' }]}
                  onPress={() => setGender(g)}
                >
                  <Text style={[{ fontSize: 16, fontWeight: '700', color: '#444' },
                    gender === g && { color: '#fff' }]}>
                    {g === 'boys' ? '♂ Boys team' : '♀ Girls team'}
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
                placeholderTextColor="#999"
                value={birthMonth}
                onChangeText={setBirthMonth}
                keyboardType="numeric"
                maxLength={2}
              />
              <TextInput
                style={[styles.input, styles.thirdInput]}
                placeholder="DD"
                placeholderTextColor="#999"
                value={birthDay}
                onChangeText={setBirthDay}
                keyboardType="numeric"
                maxLength={2}
              />
              <TextInput
                style={[styles.input, styles.thirdInput]}
                placeholder="YYYY"
                placeholderTextColor="#999"
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
              placeholderTextColor="#999"
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
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleEmailAuth}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {isSignUp ? 'Create Account' : 'Sign In'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Face ID button */}
        {biometricAvailable && !isSignUp && (
          <TouchableOpacity style={styles.biometricButton} onPress={handleBiometricLogin}>
            <Text style={styles.biometricButtonText}>
              Sign in with Face ID / Fingerprint
            </Text>
          </TouchableOpacity>
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
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  scrollContent: { padding: 24, paddingBottom: 48 },
  header: { alignItems: 'center', marginBottom: 32, marginTop: 40 },
  title: { fontSize: 36, fontWeight: 'bold', color: '#2e7d32' },
  subtitle: { fontSize: 16, color: '#666', marginTop: 6 },
  section: { width: '100%', marginBottom: 8 },
  sectionLabel: { fontSize: 15, color: '#333', fontWeight: '600', marginBottom: 10 },
  row: { flexDirection: 'row', gap: 10 },
  input: {
    width: '100%', backgroundColor: '#fff', borderRadius: 10,
    padding: 16, fontSize: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#ddd', color: '#333',
  },
  halfInput: { flex: 1, width: undefined },
  thirdInput: { flex: 1, width: undefined },
  roleCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 10, padding: 14, marginBottom: 10,
    borderWidth: 2, borderColor: '#ddd',
  },
  roleCardActive: { borderColor: '#2e7d32', backgroundColor: '#f0faf0' },
  roleCardInner: { flex: 1 },
  roleCardTitle: { fontSize: 16, fontWeight: '600', color: '#333' },
  roleCardTitleActive: { color: '#2e7d32' },
  roleCardDesc: { fontSize: 13, color: '#999', marginTop: 2 },
  roleCardDescActive: { color: '#4caf50' },
  radioCircle: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: '#ddd',
    alignItems: 'center', justifyContent: 'center',
  },
  radioCircleActive: { borderColor: '#2e7d32' },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#2e7d32' },
  minorNotice: {
    backgroundColor: '#fff8e1', borderRadius: 8, padding: 10,
    borderLeftWidth: 4, borderLeftColor: '#f59e0b', marginTop: 4, marginBottom: 8,
  },
  minorNoticeText: { color: '#92400e', fontSize: 13 },
  primaryButton: {
    backgroundColor: '#2e7d32', borderRadius: 10, padding: 16,
    alignItems: 'center', marginTop: 8,
  },
  primaryButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  biometricButton: {
    backgroundColor: '#fff', borderRadius: 10, padding: 16,
    alignItems: 'center', marginTop: 12, borderWidth: 2, borderColor: '#2e7d32',
  },
  biometricButtonText: { color: '#2e7d32', fontSize: 16, fontWeight: '600' },
  toggleButton: { marginTop: 20, alignItems: 'center' },
  toggleText: { color: '#2e7d32', fontSize: 15 },
  helperText: { fontSize: 12, color: '#666', marginTop: 4, marginBottom: 8 },
  privacyText: {
    fontSize: 11, color: '#999', textAlign: 'center',
    marginTop: 20, lineHeight: 16,
  },
});