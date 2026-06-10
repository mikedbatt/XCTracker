import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);

// App Check (web only) — attests that requests come from our genuine app so
// abusive clients can't hammer Firestore/Storage. Gated on the site-key env var
// so the app boots normally BEFORE App Check is configured; once
// EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_KEY is set (a reCAPTCHA Enterprise
// site key, which is public), web builds start attaching tokens. Native attestation
// (App Attest / Play Integrity) is deferred along with the native apps.
const APPCHECK_KEY = process.env.EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_KEY;
if (Platform.OS === 'web' && APPCHECK_KEY) {
  // In dev, emit a debug token to the console (register it under App Check →
  // Manage debug tokens) so localhost still passes once enforcement is on.
  // Never set in a production build.
  if (typeof __DEV__ !== 'undefined' && __DEV__ && typeof self !== 'undefined') {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(APPCHECK_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (e) {
    console.warn('App Check init failed:', e);
  }
}

// Auth persistence is platform-specific: AsyncStorage on native, browser
// localStorage on web. Without this branch, web would crash at boot because
// getReactNativePersistence has no DOM backing.
const persistence = Platform.OS === 'web'
  ? browserLocalPersistence
  : getReactNativePersistence(ReactNativeAsyncStorage);
export const auth = initializeAuth(app, { persistence });

// Firestore: on web, enable IndexedDB offline persistence (cached reads survive
// flaky connections + faster repeat loads). Native already caches by default.
// Falls back to the default instance if IndexedDB is unavailable (e.g. private
// browsing) so the app never fails to boot.
function initDb() {
  if (Platform.OS !== 'web') return getFirestore(app);
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      // Auto-detect long-polling. The default WebChannel streaming transport can
      // hang ~30s before falling back on mobile/school/proxy networks that block
      // it — which shows up as a very slow first dashboard load. Auto-detect
      // picks the working transport up front so the first query connects fast.
      experimentalAutoDetectLongPolling: true,
    });
  } catch (e) {
    console.warn('Firestore persistent cache unavailable, using default:', e);
    return getFirestore(app);
  }
}

export const db = initDb();
export const storage = getStorage(app);
