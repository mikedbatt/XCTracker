import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '../firebaseConfig';
import { BRAND, NEUTRAL } from '../constants/design';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

import AssistantJoinScreen from '../screens/AssistantJoinScreen';
import AthleteDashboard from '../screens/AthleteDashboard';
import AthleteJoinScreen from '../screens/AthleteJoinScreen';
import CoachDashboard from '../screens/CoachDashboard';
import CoachSetupScreen from '../screens/CoachSetupScreen';
import LoginScreen from '../screens/LoginScreen';
import ParentDashboard from '../screens/ParentDashboard';
import ParentLinkScreen from '../screens/ParentLinkScreen';

// Register for push notifications and save token to Firestore
async function registerForPushNotifications(uid) {
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

  // Save to user's Firestore doc
  try {
    await updateDoc(doc(db, 'users', uid), { expoPushToken: pushToken });
  } catch (e) {
    console.warn('Failed to save push token:', e);
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

export default function AppNavigator() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onboardingStep, setOnboardingStep] = useState(null);
  const notificationListener = useRef();
  const responseListener = useRef();

  // Set up notification listeners
  useEffect(() => {
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
        // Fetch user profile from Firestore
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserData(data);
          setUser(firebaseUser);

          // Determine onboarding step needed
          if (!data.schoolId) {
            if (data.role === 'admin_coach') setOnboardingStep('coach_setup');
            else if (data.role === 'assistant_coach') setOnboardingStep('assistant_join');
            else if (data.role === 'athlete') setOnboardingStep('athlete_join');
            else if (data.role === 'parent') setOnboardingStep('parent_link');
            else setOnboardingStep(null);
          } else if (data.role === 'assistant_coach' && data.status === 'pending') {
            setOnboardingStep('assistant_pending');
          } else {
            setOnboardingStep(null);
          }

          // Register for push notifications
          registerForPushNotifications(firebaseUser.uid);
        }
      } else {
        setUser(null);
        setUserData(null);
        setOnboardingStep(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleAuthSuccess = async ({ uid, role }) => {
    // Re-fetch user data after signup
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      setUserData(data);
      if (!data.schoolId) {
        if (role === 'admin_coach') setOnboardingStep('coach_setup');
        else if (role === 'assistant_coach') setOnboardingStep('assistant_join');
        else if (role === 'athlete') setOnboardingStep('athlete_join');
        else if (role === 'parent') setOnboardingStep('parent_link');
      }
    }
  };

  const handleOnboardingComplete = async () => {
    // Refresh user data and re-evaluate onboarding step
    if (user) {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setUserData(data);
        // Re-check if assistant is still pending
        if (data.role === 'assistant_coach' && data.schoolId && data.status === 'pending') {
          setOnboardingStep('assistant_pending');
          return;
        }
      }
    }
    setOnboardingStep(null);
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
          Alert.alert('Sign out', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign out', style: 'destructive', onPress: async () => {
              await SecureStore.deleteItemAsync('xctracker_email');
              await SecureStore.deleteItemAsync('xctracker_password');
              signOut(auth);
            }},
          ]);
        }}>
          <Text style={styles.signOutLinkText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (onboardingStep === 'athlete_join') {
    return <AthleteJoinScreen onJoinComplete={handleOnboardingComplete} />;
  }
  if (onboardingStep === 'parent_link') {
    return <ParentLinkScreen onLinkComplete={handleOnboardingComplete} />;
  }

  // Main app dashboards
  const role = userData?.role;
  if (role === 'admin_coach' || role === 'assistant_coach') {
    return <CoachDashboard userData={userData} />;
  }
  if (role === 'parent') {
    return <ParentDashboard userData={userData} />;
  }
  return <AthleteDashboard userData={userData} />;
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