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
    });
  } catch (e) {
    console.warn('Firestore persistent cache unavailable, using default:', e);
    return getFirestore(app);
  }
}

export const db = initDb();
export const storage = getStorage(app);
