// ── Web push registration (FCM) ──────────────────────────────────────────────
// Native push runs via expo-notifications in AppNavigator.js. On web we use
// Firebase Cloud Messaging directly. This util is a no-op on native — call it
// unconditionally and let the Platform check short-circuit.

import { doc, updateDoc } from 'firebase/firestore';
import { Platform } from 'react-native';
import { app, db } from '../firebaseConfig';

// VAPID public key from Firebase Console → Project Settings → Cloud Messaging
// → Web Push certificates. Pasted into EXPO_PUBLIC_FIREBASE_VAPID_KEY in .env.
// Without this key, web push registration is skipped (auth-only mode).
const VAPID_KEY = process.env.EXPO_PUBLIC_FIREBASE_VAPID_KEY;

export async function registerWebPush(uid) {
  if (Platform.OS !== 'web') return;
  if (!uid) return;
  if (typeof window === 'undefined' || !('Notification' in window)) {
    console.warn('Web push not supported in this browser');
    return;
  }
  if (!VAPID_KEY) {
    console.warn('Web push skipped: EXPO_PUBLIC_FIREBASE_VAPID_KEY is not set');
    return;
  }
  if (!('serviceWorker' in navigator)) {
    console.warn('Web push skipped: service workers not supported');
    return;
  }

  try {
    // Ask once. If user has previously denied, this returns 'denied' without prompting.
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    // Pass firebaseConfig to the SW via query string so we don't duplicate values.
    const cfg = {
      apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
      authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
      projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
      storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
      messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
      appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
    };
    const swUrl = '/firebase-messaging-sw.js?' + new URLSearchParams(cfg).toString();
    const registration = await navigator.serviceWorker.register(swUrl);

    // Dynamic import so this code path (and `firebase/messaging`) never loads on native.
    const { getMessaging, getToken, onMessage } = await import('firebase/messaging');
    const messaging = getMessaging(app);

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) {
      console.warn('Web push: no token returned');
      return;
    }

    await updateDoc(doc(db, 'users', uid), { webPushToken: token });

    // Foreground handler: when the tab is active, the SW doesn't fire. Show a
    // browser notification ourselves so foreground messages aren't missed.
    onMessage(messaging, (payload) => {
      const { title, body } = payload.notification || {};
      if (Notification.permission === 'granted' && title) {
        new Notification(title, { body: body || '', icon: '/favicon.png' });
      }
    });
  } catch (e) {
    console.warn('Web push registration failed:', e);
  }
}
