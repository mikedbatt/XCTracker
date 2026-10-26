// Web-only Garmin OAuth return route.
//
// Garmin redirects the full page to https://xctracker.com/garmin-callback?code=…&state=…
// after the athlete authorizes. The server holds the PKCE verifier keyed by
// `state` (see garminAuthStart), so this page needs nothing from browser storage
// or a Firebase session — an installed PWA often lands here in a different
// browser context than the one that started the flow. Native uses the in-app
// browser flow in GarminConnect instead.

import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { connectGarminWithCode } from '../garminConfig';

export default function GarminCallback() {
  const [error, setError] = useState<string | null>(null);
  const [doneElsewhere, setDoneElsewhere] = useState(false);

  useEffect(() => {
    // Wait for Firebase to restore any session (so the server can check it's
    // the same user), but don't require one.
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        if (params.get('error') || !code) {
          setError('Garmin authorization was cancelled.');
          return;
        }

        let fallbackState: string | null = null;
        try {
          fallbackState = localStorage.getItem('garmin_oauth_state');
          localStorage.removeItem('garmin_oauth_state');
        } catch (e) {
          console.warn('localStorage unavailable:', e);
        }
        const state = params.get('state') || fallbackState;
        if (!state) {
          setError('This connection link expired — please try connecting again.');
          return;
        }

        await connectGarminWithCode(code, state);
        // Only continue into the app when we're inside the installed PWA. When
        // Garmin's app/browser hands the redirect to a regular browser tab
        // (always on iOS — links never open in a home-screen app), loading the
        // website there is confusing; tell the athlete to switch back instead.
        // The PWA's Garmin screen re-checks status when it becomes visible.
        const inInstalledApp = window.matchMedia?.('(display-mode: standalone)').matches
          || (navigator as any).standalone === true;
        if (user && inInstalledApp) {
          router.replace('/');
        } else {
          setDoneElsewhere(true);
        }
      } catch (e: any) {
        console.warn('Garmin web callback failed:', e);
        setError(e?.message || 'Could not complete the Garmin connection. Please try again.');
      }
    });
    return () => unsub();
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
      {error ? (
        <>
          <Text style={{ fontSize: 16, textAlign: 'center', color: '#0b0d12' }}>{error}</Text>
          <Text onPress={() => router.replace('/')} style={{ color: '#4F46E5', fontWeight: '600' }}>
            Back to app
          </Text>
        </>
      ) : doneElsewhere ? (
        <>
          <Text style={{ fontSize: 40, color: '#10B981' }}>✓</Text>
          <Text style={{ fontSize: 18, fontWeight: '600', textAlign: 'center', color: '#0b0d12' }}>
            Garmin connected
          </Text>
          <Text style={{ color: '#5b6472', textAlign: 'center', maxWidth: 320 }}>
            Switch back to the XCTracker app — you can close this tab. New runs will sync automatically.
          </Text>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={{ color: '#5b6472', textAlign: 'center' }}>Connecting Garmin…</Text>
        </>
      )}
    </View>
  );
}
