// Web-only Strava OAuth return route.
//
// On web, Strava redirects the full page to https://<host>/strava-callback?code=…
// after the athlete authorizes. Expo Router resolves this route, we exchange the
// code for tokens (via the shared helper, which also stores stravaAthleteId for
// webhook routing), then send the athlete back into the app. Native uses the
// in-app browser flow in StravaConnect instead, so this route is only hit on web.

import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { connectStravaWithCode } from '../stravaConfig';

export default function StravaCallback() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Wait for auth to restore after the full-page redirect before reading uid.
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();
      try {
        const search = typeof window !== 'undefined' ? window.location.search : '';
        const params = new URLSearchParams(search);
        const code = params.get('code');
        const err = params.get('error');

        if (err || !code) {
          setError('Strava authorization was cancelled.');
          return;
        }
        if (!user) {
          setError('Please sign in, then reconnect Strava.');
          return;
        }

        const redirectUri = `${window.location.origin}/strava-callback`;
        await connectStravaWithCode(user.uid, code, redirectUri);
        router.replace('/');
      } catch (e) {
        console.warn('Strava web callback failed:', e);
        setError('Could not complete the Strava connection. Please try again.');
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
      ) : (
        <>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={{ color: '#5b6472' }}>Connecting Strava…</Text>
        </>
      )}
    </View>
  );
}
