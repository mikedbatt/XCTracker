import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Linking, Platform,
  ScrollView,
  StyleSheet,
  Text, TextInput, TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';
import { SIGNAL } from '../constants/design';
import { confirmDestructive } from '../utils/confirmDialog';
import { PRIVACY_URL, TERMS_URL } from '../constants/legal';

const ROLES = [
  { key: 'admin_coach',     label: 'Head Coach',      description: 'Set up and manage your program',     icon: 'shield-checkmark-outline', color: SIGNAL.color.indigo },
  { key: 'assistant_coach', label: 'Assistant Coach', description: 'Help manage an existing program',    icon: 'people-outline',           color: SIGNAL.color.violet },
  { key: 'athlete',         label: 'Athlete',         description: 'Track your training and races',      icon: 'walk-outline',             color: SIGNAL.color.emerald },
  { key: 'parent',          label: 'Parent',          description: "Follow your athlete's season",       icon: 'heart-outline',            color: SIGNAL.color.pink },
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
  const [focusedField, setFocusedField] = useState(null);
  // Inline form error shown above the primary CTA. Replaces Alert.alert for
  // auth failures since Alert is unreliable on web (silently no-ops in some
  // mobile browsers, race-conditions with the React #418 hydration recovery).
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    checkBiometrics();
  }, []);

  const checkBiometrics = async () => {
    // Biometrics + SecureStore don't exist on web. Skip entirely so the
    // login screen doesn't crash on mount.
    if (Platform.OS === 'web') return;
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const storedEmail = await SecureStore.getItemAsync('xctracker_email');
      setBiometricAvailable(compatible && enrolled && !!storedEmail);
    } catch (e) {
      console.warn('Biometric check failed:', e);
    }
  };

  const handleBiometricLogin = async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Sign in to XCTracker',
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
    setFormError(null);
    if (!email || !password) {
      setFormError('Please enter your email and password.');
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        if (!firstName || !lastName) {
          setFormError('Please enter your first and last name.');
          setLoading(false);
          return;
        }

        const ageCheck = validateAge();
        if (!ageCheck.valid) {
          setFormError(ageCheck.message);
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
        try {
          await SecureStore.setItemAsync('xctracker_email', email);
          await SecureStore.setItemAsync('xctracker_password', password);
        } catch (e) { /* SecureStore unavailable on web — Firebase persistence handles auth */ }
        if (onAuthSuccess) onAuthSuccess({ uid: userCredential.user.uid });
      }
    } catch (error) {
      let message = 'Something went wrong. Please try again.';
      if (error.code === 'auth/invalid-email')         message = 'Please enter a valid email address.';
      if (error.code === 'auth/wrong-password')        message = 'Incorrect email or password.';
      if (error.code === 'auth/user-not-found')        message = 'Incorrect email or password.';
      // Newer Firebase merges wrong-password + user-not-found into invalid-credential
      // (intentional — prevents account enumeration).
      if (error.code === 'auth/invalid-credential')    message = 'Incorrect email or password.';
      if (error.code === 'auth/email-already-in-use')  message = 'An account with this email already exists.';
      if (error.code === 'auth/weak-password')         message = 'Password should be at least 6 characters.';
      if (error.code === 'auth/too-many-requests')     message = 'Too many failed attempts. Try again in a few minutes or reset your password.';
      if (error.code === 'auth/network-request-failed') message = 'Network error. Check your connection and try again.';
      setFormError(message);
    }

    setLoading(false);
  };

  const handleForgotPassword = () => {
    if (!email) {
      Alert.alert('Enter your email', 'Type your email address above first, then tap Forgot Password.');
      return;
    }
    confirmDestructive({
      title: 'Reset password?',
      message: `Send a reset link to ${email}?`,
      confirmLabel: 'Send reset link',
      onConfirm: async () => {
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
      },
    });
  };

  const age = calculateAge();
  const showParentEmail = role === 'athlete' && isSignUp && age !== null && age < 18;

  const inputStyle = (field) => [
    styles.input,
    focusedField === field && styles.inputFocused,
  ];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Brand header */}
        <View style={styles.header}>
          <LinearGradient
            colors={[SIGNAL.color.indigo, SIGNAL.color.violet]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.brandMark}
          >
            <Text style={styles.brandMarkText}>TB</Text>
          </LinearGradient>
          <Text style={styles.brandTitle}>XCTracker</Text>
          <Text style={styles.brandTagline}>Building championship teams</Text>
        </View>

        {/* Sign-in / Sign-up segmented toggle */}
        <View style={styles.segment}>
          <TouchableOpacity
            style={[styles.segmentPill, !isSignUp && styles.segmentPillActive]}
            onPress={() => { setIsSignUp(false); setFormError(null); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, !isSignUp && styles.segmentTextActive]}>Sign in</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentPill, isSignUp && styles.segmentPillActive]}
            onPress={() => { setIsSignUp(true); setFormError(null); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, isSignUp && styles.segmentTextActive]}>Sign up</Text>
          </TouchableOpacity>
        </View>

        {/* Role Selector — sign up only */}
        {isSignUp && (
          <View style={styles.section}>
            <Text style={styles.eyebrow}>I am a</Text>
            <View style={{ gap: SIGNAL.space[2] }}>
              {ROLES.map((r) => {
                const on = role === r.key;
                return (
                  <TouchableOpacity
                    key={r.key}
                    activeOpacity={0.85}
                    style={[styles.roleCard, on && styles.roleCardActive]}
                    onPress={() => setRole(r.key)}
                  >
                    <View style={[styles.roleIconBadge, { backgroundColor: r.color + SIGNAL.tint.chip }]}>
                      <Ionicons name={r.icon} size={20} color={r.color} />
                    </View>
                    <View style={styles.roleCardInner}>
                      <Text style={[styles.roleCardTitle, on && styles.roleCardTitleActive]}>{r.label}</Text>
                      <Text style={styles.roleCardDesc}>{r.description}</Text>
                    </View>
                    <View style={[styles.radioCircle, on && styles.radioCircleActive]}>
                      {on && <View style={styles.radioInner} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Form card */}
        <View style={styles.formCard}>
          {isSignUp && (
            <View style={styles.row}>
              <TextInput
                style={[...inputStyle('first'), styles.halfInput]}
                placeholder="First name"
                placeholderTextColor={SIGNAL.color.mute2}
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                onFocus={() => setFocusedField('first')}
                onBlur={() => setFocusedField(null)}
              />
              <TextInput
                style={[...inputStyle('last'), styles.halfInput]}
                placeholder="Last name"
                placeholderTextColor={SIGNAL.color.mute2}
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
                onFocus={() => setFocusedField('last')}
                onBlur={() => setFocusedField(null)}
              />
            </View>
          )}

          {/* Email */}
          <TextInput
            style={inputStyle('email')}
            placeholder="Email address"
            placeholderTextColor={SIGNAL.color.mute2}
            value={email}
            onChangeText={(v) => { setEmail(v); if (formError) setFormError(null); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            onFocus={() => setFocusedField('email')}
            onBlur={() => setFocusedField(null)}
          />

          {/* Password with show/hide */}
          <View style={[styles.passwordRow, focusedField === 'password' && styles.inputFocused]}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Password"
              placeholderTextColor={SIGNAL.color.mute2}
              value={password}
              onChangeText={(v) => { setPassword(v); if (formError) setFormError(null); }}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => setFocusedField('password')}
              onBlur={() => setFocusedField(null)}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword(v => !v)}
            >
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={SIGNAL.color.mute} />
            </TouchableOpacity>
          </View>

          {/* Forgot password */}
          {!isSignUp && (
            <TouchableOpacity style={styles.forgotBtn} onPress={handleForgotPassword}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          )}

          {/* Gender selector — athletes only on sign up */}
          {isSignUp && role === 'athlete' && (
            <View style={styles.subSection}>
              <Text style={styles.eyebrow}>I compete on the</Text>
              <View style={styles.row}>
                {['boys', 'girls'].map(g => {
                  const on = gender === g;
                  return (
                    <TouchableOpacity
                      key={g}
                      activeOpacity={0.85}
                      style={[styles.genderCard, on && styles.genderCardActive]}
                      onPress={() => setGender(g)}
                    >
                      <Text style={[styles.genderText, on && styles.genderTextActive]}>
                        {g === 'boys' ? 'Boys team' : 'Girls team'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Date of Birth — athletes only on sign up */}
          {isSignUp && role === 'athlete' && (
            <View style={styles.subSection}>
              <Text style={styles.eyebrow}>Date of birth</Text>
              <View style={styles.row}>
                <TextInput
                  style={[...inputStyle('mm'), styles.thirdInput]}
                  placeholder="MM"
                  placeholderTextColor={SIGNAL.color.mute2}
                  value={birthMonth}
                  onChangeText={setBirthMonth}
                  keyboardType="numeric"
                  maxLength={2}
                  onFocus={() => setFocusedField('mm')}
                  onBlur={() => setFocusedField(null)}
                />
                <TextInput
                  style={[...inputStyle('dd'), styles.thirdInput]}
                  placeholder="DD"
                  placeholderTextColor={SIGNAL.color.mute2}
                  value={birthDay}
                  onChangeText={setBirthDay}
                  keyboardType="numeric"
                  maxLength={2}
                  onFocus={() => setFocusedField('dd')}
                  onBlur={() => setFocusedField(null)}
                />
                <TextInput
                  style={[...inputStyle('yyyy'), styles.thirdInput]}
                  placeholder="YYYY"
                  placeholderTextColor={SIGNAL.color.mute2}
                  value={birthYear}
                  onChangeText={setBirthYear}
                  keyboardType="numeric"
                  maxLength={4}
                  onFocus={() => setFocusedField('yyyy')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
              {age !== null && age < 18 && (
                <View style={styles.minorNotice}>
                  <Ionicons name="information-circle-outline" size={16} color={SIGNAL.color.amber} />
                  <Text style={styles.minorNoticeText}>
                    Parental consent required for athletes under 18
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Parent email — minors only */}
          {showParentEmail && (
            <View style={styles.subSection}>
              <Text style={styles.eyebrow}>Parent or guardian email</Text>
              <TextInput
                style={inputStyle('pemail')}
                placeholder="parent@email.com"
                placeholderTextColor={SIGNAL.color.mute2}
                value={parentEmail}
                onChangeText={setParentEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                onFocus={() => setFocusedField('pemail')}
                onBlur={() => setFocusedField(null)}
              />
              <Text style={styles.helperText}>
                Your parent will receive a consent email before you can access team features.
              </Text>
            </View>
          )}
        </View>

        {/* Inline form error — appears above the primary CTA when auth or
            validation fails. Auto-clears when user edits email/password or
            switches between Sign in / Sign up. */}
        {formError && (
          <View style={styles.formErrorBox}>
            <Ionicons name="alert-circle" size={16} color={SIGNAL.color.coral} />
            <Text style={styles.formErrorText}>{formError}</Text>
          </View>
        )}

        {/* Primary CTA */}
        <TouchableOpacity
          style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
          onPress={handleEmailAuth}
          disabled={loading}
          activeOpacity={0.9}
        >
          <Text style={styles.primaryBtnText}>
            {loading ? 'Please wait…' : (isSignUp ? 'Create account' : 'Sign in')}
          </Text>
        </TouchableOpacity>

        {/* Legal consent footer — required by App Store / Play Store reviewers + COPPA. */}
        {isSignUp && (
          <Text style={styles.legalFooter}>
            By creating an account, you agree to our{' '}
            <Text style={styles.legalLink} onPress={() => Linking.openURL(TERMS_URL).catch(() => {})}>
              Terms of Service
            </Text>
            {' '}and{' '}
            <Text style={styles.legalLink} onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}>
              Privacy Policy
            </Text>
            .
          </Text>
        )}

        {/* Face ID button */}
        {biometricAvailable && !isSignUp && (
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={handleBiometricLogin}
            activeOpacity={0.9}
          >
            <Ionicons name="finger-print-outline" size={18} color={SIGNAL.color.inkSoft} />
            <Text style={styles.secondaryBtnText}>Sign in with Face ID / Fingerprint</Text>
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
  container: {
    flex: 1,
    backgroundColor: SIGNAL.color.paper2,
  },
  scrollContent: {
    paddingHorizontal: SIGNAL.space.screen,
    paddingTop: Platform.OS === 'ios' ? 68 : 44,
    paddingBottom: SIGNAL.space[8] * 2,
  },

  // ── Brand header ──
  header: {
    alignItems: 'center',
    marginBottom: SIGNAL.space[8],
  },
  brandMark: {
    width: 60,
    height: 60,
    borderRadius: SIGNAL.radius.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SIGNAL.space[5],
  },
  brandMarkText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  brandTitle: {
    fontFamily: SIGNAL.font.display,
    fontSize: 29,
    lineHeight: 32,
    color: SIGNAL.color.indigo,
    letterSpacing: -0.58,
  },
  brandTagline: {
    fontFamily: SIGNAL.font.body,
    fontSize: 13.5,
    color: SIGNAL.color.mute,
    marginTop: 6,
  },

  // ── Segmented Sign in / Sign up toggle ──
  segment: {
    flexDirection: 'row',
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.chip,
    padding: 4,
    marginBottom: SIGNAL.space[6],
    ...SIGNAL.border.hairline,
  },
  segmentPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: SIGNAL.radius.chip,
    alignItems: 'center',
  },
  segmentPillActive: {
    backgroundColor: SIGNAL.color.indigo,
  },
  segmentText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 14,
    color: SIGNAL.color.mute,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  segmentTextActive: {
    color: '#fff',
  },

  // ── Sections / eyebrows ──
  section: {
    marginBottom: SIGNAL.space[6],
  },
  subSection: {
    marginTop: SIGNAL.space[5],
  },
  eyebrow: {
    ...SIGNAL.style.eyebrow,
    marginBottom: SIGNAL.space[3],
  },

  // ── Role cards ──
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIGNAL.space[4],
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.button,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: SIGNAL.color.line,
  },
  roleCardActive: {
    borderColor: SIGNAL.color.indigo,
    borderWidth: 2,
    backgroundColor: SIGNAL.color.indigo + SIGNAL.tint.wash,
    paddingVertical: 12.5,
    paddingHorizontal: 13.5,
  },
  roleIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleCardInner: {
    flex: 1,
  },
  roleCardTitle: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 14.5,
    color: SIGNAL.color.ink,
    letterSpacing: SIGNAL.letter.bodyTight,
  },
  roleCardTitleActive: {
    color: SIGNAL.color.indigo,
  },
  roleCardDesc: {
    fontFamily: SIGNAL.font.body,
    fontSize: 11.5,
    color: SIGNAL.color.mute,
    marginTop: 1,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: SIGNAL.color.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: SIGNAL.color.indigo,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: SIGNAL.color.indigo,
  },

  // ── Form card ──
  formCard: {
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.card,
    padding: SIGNAL.space[5],
    marginBottom: SIGNAL.space[5],
    ...SIGNAL.border.hairline,
  },
  row: {
    flexDirection: 'row',
    gap: SIGNAL.space[3],
  },
  input: {
    width: '100%',
    backgroundColor: SIGNAL.color.paper2,
    borderRadius: SIGNAL.radius.control + 1,
    paddingVertical: 13,
    paddingHorizontal: 15,
    fontFamily: SIGNAL.font.body,
    fontSize: 15,
    color: SIGNAL.color.ink,
    marginBottom: SIGNAL.space[3],
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  inputFocused: {
    borderColor: SIGNAL.color.indigo,
    borderWidth: 1.5,
    backgroundColor: SIGNAL.color.white,
  },
  halfInput: { flex: 1, width: undefined },
  thirdInput: { flex: 1, width: undefined, textAlign: 'center' },

  // ── Password row ──
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SIGNAL.color.paper2,
    borderRadius: SIGNAL.radius.control + 1,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
    marginBottom: SIGNAL.space[3],
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 13,
    paddingHorizontal: 15,
    fontFamily: SIGNAL.font.body,
    fontSize: 15,
    color: SIGNAL.color.ink,
  },
  eyeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 13,
  },

  // ── Forgot password ──
  forgotBtn: {
    alignSelf: 'flex-end',
    marginTop: 2,
    marginBottom: 2,
  },
  forgotText: {
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.indigo,
    fontSize: 13,
  },

  // ── Gender ──
  genderCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: SIGNAL.color.paper2,
    borderRadius: SIGNAL.radius.control + 1,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: SIGNAL.color.line,
  },
  genderCardActive: {
    backgroundColor: SIGNAL.color.indigo,
    borderColor: SIGNAL.color.indigo,
  },
  genderText: {
    fontFamily: SIGNAL.font.bodySemi,
    fontSize: 13.5,
    color: SIGNAL.color.inkSoft,
  },
  genderTextActive: {
    color: '#fff',
  },

  // ── Minor notice ──
  minorNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: SIGNAL.color.amber + SIGNAL.tint.chip,
    borderRadius: SIGNAL.radius.control,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: SIGNAL.space[2],
  },
  minorNoticeText: {
    flex: 1,
    fontFamily: SIGNAL.font.body,
    color: SIGNAL.color.inkSoft,
    fontSize: 12,
  },

  helperText: {
    fontFamily: SIGNAL.font.body,
    fontSize: 11.5,
    color: SIGNAL.color.mute,
    marginTop: SIGNAL.space[1],
  },

  // ── Primary CTA ──
  primaryBtn: {
    width: '100%',
    backgroundColor: SIGNAL.color.indigo,
    borderRadius: SIGNAL.radius.button,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    fontFamily: SIGNAL.font.bodyBold,
    color: '#fff',
    fontSize: 16,
    letterSpacing: SIGNAL.letter.bodyTight,
  },

  // ── Inline form error (auth failures, validation) ──
  formErrorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderRadius: 10,
    backgroundColor: `${SIGNAL.color.coral}10`,
    borderWidth: 1,
    borderColor: `${SIGNAL.color.coral}40`,
  },
  formErrorText: {
    flex: 1,
    fontFamily: SIGNAL.font.bodyMedium,
    fontSize: 13.5,
    color: SIGNAL.color.coral,
    letterSpacing: SIGNAL.letter.bodyTight,
    lineHeight: 18,
  },

  // ── Legal consent footer (signup only) ──
  legalFooter: {
    fontFamily: SIGNAL.font.body,
    fontSize: 12,
    color: SIGNAL.color.mute,
    letterSpacing: SIGNAL.letter.bodyTight,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 14,
    paddingHorizontal: 12,
  },
  legalLink: {
    color: SIGNAL.color.indigo,
    fontFamily: SIGNAL.font.bodyMedium,
  },

  // ── Secondary CTA (Face ID) ──
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    backgroundColor: SIGNAL.color.white,
    borderRadius: SIGNAL.radius.button,
    paddingVertical: 13,
    marginTop: SIGNAL.space[3],
    borderWidth: 1.5,
    borderColor: SIGNAL.color.line,
  },
  secondaryBtnText: {
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.inkSoft,
    fontSize: 14,
  },

  // ── Toggle ──
  toggleButton: {
    marginTop: SIGNAL.space[6],
    alignItems: 'center',
  },
  toggleText: {
    fontFamily: SIGNAL.font.bodySemi,
    color: SIGNAL.color.indigo,
    fontSize: 13.5,
  },

  // ── Privacy ──
  privacyText: {
    fontFamily: SIGNAL.font.body,
    fontSize: 11.5,
    color: SIGNAL.color.mute,
    textAlign: 'center',
    marginTop: SIGNAL.space[6],
    lineHeight: 16,
    paddingHorizontal: SIGNAL.space[4],
  },
});
