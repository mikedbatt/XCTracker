import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { auth, db } from '../firebaseConfig';

import AthleteDashboard from '../screens/AthleteDashboard';
import AthleteJoinScreen from '../screens/AthleteJoinScreen';
import CoachDashboard from '../screens/CoachDashboard';
import CoachSetupScreen from '../screens/CoachSetupScreen';
import LoginScreen from '../screens/LoginScreen';
import ParentDashboard from '../screens/ParentDashboard';
import ParentLinkScreen from '../screens/ParentLinkScreen';

export default function AppNavigator() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onboardingStep, setOnboardingStep] = useState(null);
  // onboardingStep can be: null, 'coach_setup', 'athlete_join', 'parent_link'

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
            else if (data.role === 'athlete') setOnboardingStep('athlete_join');
            else if (data.role === 'parent') setOnboardingStep('parent_link');
            else setOnboardingStep(null);
          } else {
            setOnboardingStep(null);
          }
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
        else if (role === 'athlete') setOnboardingStep('athlete_join');
        else if (role === 'parent') setOnboardingStep('parent_link');
      }
    }
  };

  const handleOnboardingComplete = async () => {
    // Refresh user data and clear onboarding
    if (user) {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) setUserData(userDoc.data());
    }
    setOnboardingStep(null);
  };

  // Loading spinner
  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#2e7d32" />
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
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5' },
});