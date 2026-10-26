import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Suspense, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '../firebaseConfig';
import { BRAND, NEUTRAL } from '../constants/design';
import { confirmDestructive } from '../utils/confirmDialog';
import WebMaxWidth from '../components/WebMaxWidth';
import InstallPrompt from '../components/InstallPrompt';
import NotificationPrompt from '../components/NotificationPrompt';
import UpdateBanner from '../components/UpdateBanner';
import { registerWebPush } from '../utils/webPush';
import { lazyWithReload } from '../utils/lazyWithReload';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// LoginScreen stays eager — it's the first paint for logged-out visitors, so it
// must not wait on a second chunk. Everything past auth is lazy-loaded so the
// initial bundle (and time-to-first-paint) stays small; the SW caches each
// chunk after first load, so returning users get them instantly.
import LoginScreen from '../screens/LoginScreen';
import { signOutUser } from '../utils/signOutUser';
const AssistantJoinScreen = lazyWithReload(() => import('../screens/AssistantJoinScreen'));
const AthleteDashboard    = lazyWithReload(() => import('../screens/AthleteDashboard'));
const AthleteJoinScreen   = lazyWithReload(() => import('../screens/AthleteJoinScreen'));
const CoachDashboard      = lazyWithReload(() => import('../screens/CoachDashboard'));
const CoachSetupScreen    = lazyWithReload(() => import('../screens/CoachSetupScreen'));
const ParentDashboard     = lazyWithReload(() => import('../screens/ParentDashboard'));

// Register for push notifications and save token to Firestore.
// On native: expo-notifications → expoPushToken.
// On web:    FCM web SDK → webPushToken (handled by registerWebPush).
async function registerForPushNotifications(uid) {
  if (Platform.OS === 'web') {
    // Refresh only — the permission prompt comes from NotificationPrompt's tap.
    return registerWebPush(uid, { prompt: false });
  }

  try {
    if (!Device.isDevice) return; // Push only works on physical devices

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const pushToken = tokenData.data;

    await updateDoc(doc(db, 'users', uid), { expoPushToken: pushToken });
  } catch (e) {
    // Fails silently in Expo Go — push tokens only work in standalone builds
    console.warn('Push registration skipped:', e.message);
    return;
  }

  // Android notification channel
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
}

// Which onboarding screen (if any) a user belongs on. Parents always land on
// ParentDashboard — it handles linking, pending requests and the no-athlete
// state itself. (Routing parents by schoolId trapped them on the link screen
// when their athlete hadn't joined a team yet.)
function onboardingStepFor(data, { skippedSchoolJoin = false } = {}) {
  if (!data.schoolId) {
    if (data.role === 'admin_coach')     return 'coach_setup';
    if (data.role === 'assistant_coach') return 'assistant_join';
    if (data.role === 'athlete')         return skippedSchoolJoin ? null : 'athlete_join';
    return null;
  }
  if (data.role === 'assistant_coach' && data.status === 'pending') return 'assistant_pending';
  return null;
}

// Fetch the signed-in user's profile doc. Retries briefly: at signup the auth
// listener fires the moment the account exists, before LoginScreen's setDoc
// has written the profile — and on a congested school network a read can fail.
// Returns { data } | { error: 'missing' | 'network' }.
async function loadProfile(uid) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) return { data: snap.data() };
    } catch (e) {
      console.warn('Profile load failed:', e);
      if (attempt === 2) return { error: 'network' };
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  return { error: 'missing' };
}

function AppNavigatorInner() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onboardingStep, setOnboardingStep] = useState(null);
  // 'missing' | 'network' when the profile doc couldn't be loaded — shows a
  // retry/sign-out screen instead of an endless spinner or the login screen.
  const [profileError, setProfileError] = useState(null);
  // Set when an athlete explicitly taps "Skip for now" on AthleteJoinScreen.
  // While true, refreshUser() will not auto-route them back into the join
  // flow even though they have no schoolId. Cleared whenever they actually
  // join a school. Lives in component state so it resets on app restart.
  const [skippedSchoolJoin, setSkippedSchoolJoin] = useState(false);
  const notificationListener = useRef();
  const responseListener = useRef();

  // Set up notification listeners (native only — expo-notifications listeners
  // are no-ops on web and emit a console warning, so skip them entirely there).
  useEffect(() => {
    if (Platform.OS === 'web') return;

    // Clear badge on app open
    Notifications.setBadgeCountAsync(0);

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      // Notification received while app is in foreground — handled by setNotificationHandler above
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      // User tapped a notification — could navigate to the feed here
    });

    return () => {
      if (notificationListener.current) Notifications.removeNotificationSubscription(notificationListener.current);
      if (responseListener.current) Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const { data, error } = await loadProfile(firebaseUser.uid);
        setUser(firebaseUser);
        if (data) {
          setProfileError(null);
          setUserData(data);
          setOnboardingStep(onboardingStepFor(data));

          // Register for push notifications
          registerForPushNotifications(firebaseUser.uid);
        } else {
          setProfileError(error);
        }
      } else {
        setUser(null);
        setUserData(null);
        setOnboardingStep(null);
        setProfileError(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleAuthSuccess = async ({ uid }) => {
    // Re-fetch user data after signup (the profile doc now exists).
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      if (auth.currentUser) setUser(auth.currentUser);
      setProfileError(null);
      setUserData(data);
      setOnboardingStep(onboardingStepFor(data));
    }
  };

  const handleOnboardingComplete = async () => {
    // Refresh user data and re-evaluate the onboarding step. This is also
    // used as the `refreshUser` callback passed down to dashboards so that
    // destructive profile actions (e.g. "Leave team") can trigger a full
    // re-route — for example back to AthleteJoinScreen when an athlete
    // clears their schoolId. Mirrors the same logic as the onAuthStateChanged
    // useEffect above.
    if (user) {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setUserData(data);

        // The athlete now has a school — clear any "skipped" flag so future
        // re-routes work correctly if they later leave the team.
        if (data.schoolId && skippedSchoolJoin) setSkippedSchoolJoin(false);

        // No school yet → the per-role onboarding flow, unless the athlete
        // tapped "Skip for now" this session.
        setOnboardingStep(onboardingStepFor(data, { skippedSchoolJoin }));
        return;
      }
    }
    setOnboardingStep(null);
  };

  // Called when the athlete explicitly taps "Skip for now" on
  // AthleteJoinScreen. Drops them onto the dashboard without a school and
  // remembers the choice so refreshUser doesn't immediately route them back.
  const handleSkipSchoolJoin = () => {
    setSkippedSchoolJoin(true);
    setOnboardingStep(null);
  };

  // Called from the AthleteDashboard / AthleteProfile when a school-less
  // athlete wants to (re-)join a school. Clears the skipped flag so they
  // don't bounce right back out, and forces the onboarding step to the
  // join screen.
  const handleGoToJoinScreen = () => {
    setSkippedSchoolJoin(false);
    setOnboardingStep('athlete_join');
  };

  // Loading spinner
  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={BRAND} />
      </View>
    );
  }

  // Not logged in
  if (!user) {
    return <LoginScreen onAuthSuccess={handleAuthSuccess} />;
  }

  // Signed in but the profile couldn't be loaded.
  if (profileError) {
    const retry = async () => {
      setLoading(true);
      const { data, error } = await loadProfile(user.uid);
      if (data) {
        setProfileError(null);
        setUserData(data);
        setOnboardingStep(onboardingStepFor(data));
        registerForPushNotifications(user.uid);
      } else {
        setProfileError(error);
      }
      setLoading(false);
    };
    return (
      <View style={styles.pendingScreen}>
        <Text style={styles.pendingTitle}>
          {profileError === 'network' ? "Can't reach XCTracker" : "We couldn't finish setting up your account"}
        </Text>
        <Text style={styles.pendingDesc}>
          {profileError === 'network'
            ? 'Check your internet connection and try again.'
            : 'Try again in a moment. If this keeps happening, sign out and sign up again, or ask your coach for help.'}
        </Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={retry}>
          <Text style={styles.refreshBtnText}>Try again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.signOutLink} onPress={signOutUser}>
          <Text style={styles.signOutLinkText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Onboarding flows
  if (onboardingStep === 'coach_setup') {
    return <CoachSetupScreen onSetupComplete={handleOnboardingComplete} />;
  }
  if (onboardingStep === 'assistant_join') {
    return <AssistantJoinScreen onJoinComplete={handleOnboardingComplete} />;
  }
  if (onboardingStep === 'assistant_pending') {
    return (
      <View style={styles.pendingScreen}>
        <Text style={{ fontSize: 40, marginBottom: 16 }}>⏳</Text>
        <Text style={styles.pendingTitle}>Awaiting Approval</Text>
        <Text style={styles.pendingDesc}>
          Your request to join has been sent to the head coach. You'll have access once they approve you.
        </Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={handleOnboardingComplete}>
          <Text style={styles.refreshBtnText}>Check Status</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.signOutLink} onPress={() => {
          confirmDestructive({
            title: 'Sign out',
            message: 'Are you sure?',
            confirmLabel: 'Sign out',
            onConfirm: signOutUser,
          });
        }}>
          <Text style={styles.signOutLinkText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (onboardingStep === 'athlete_join') {
    return <AthleteJoinScreen onJoinComplete={handleOnboardingComplete} onSkip={handleSkipSchoolJoin} wasDenied={userData?.status === 'denied'} />;
  }

  // Main app dashboards. handleOnboardingComplete doubles as a `refreshUser`
  // callback — it re-fetches the user doc from Firestore and re-evaluates
  // which onboarding step (if any) the user belongs in. Dashboards call this
  // after destructive profile changes like "leave team" so the user lands
  // back in the right onboarding flow without having to sign out and in.
  const role = userData?.role;
  if (role === 'admin_coach' || role === 'assistant_coach') {
    return <WebMaxWidth><CoachDashboard userData={userData} refreshUser={handleOnboardingComplete} /></WebMaxWidth>;
  }
  if (role === 'parent') {
    return <WebMaxWidth><ParentDashboard userData={userData} refreshUser={handleOnboardingComplete} /></WebMaxWidth>;
  }
  return <WebMaxWidth><AthleteDashboard userData={userData} refreshUser={handleOnboardingComplete} goToJoinScreen={handleGoToJoinScreen} /></WebMaxWidth>;
}

// Wrap the navigator so the PWA install banner can overlay any screen (login,
// onboarding, dashboards). InstallPrompt renders null on native and when the
// app is already installed, so this wrapper is inert outside the web PWA.
export default function AppNavigator() {
  return (
    <View style={{ flex: 1 }}>
      <Suspense fallback={<View style={styles.loading}><ActivityIndicator size="large" color={BRAND} /></View>}>
        <AppNavigatorInner />
      </Suspense>
      <UpdateBanner />
      <InstallPrompt />
      <NotificationPrompt />
    </View>
  );
}

const styles = StyleSheet.create({
  loading:        { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: NEUTRAL.bg },
  pendingScreen:  { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: NEUTRAL.bg, padding: 32 },
  pendingTitle:   { fontSize: 22, fontWeight: '700', color: BRAND, marginBottom: 12 },
  pendingDesc:    { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  refreshBtn:     { backgroundColor: BRAND, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 32 },
  refreshBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  signOutLink:    { marginTop: 20, padding: 10 },
  signOutLinkText:{ color: '#9CA3AF', fontSize: 14 },
});