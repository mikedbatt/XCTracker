// ── signOutUser ──────────────────────────────────────────────────────────────
// The one sign-out path. Before signing out it removes this device's push
// token from the user doc: otherwise, on a shared family laptop or school
// Chromebook, the browser's single web-push token ends up on several user
// docs and the next person signed in gets the previous user's notifications
// (including private weekly check-in replies).

import { signOut } from 'firebase/auth';
import { deleteField, doc, updateDoc } from 'firebase/firestore';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { auth, db } from '../firebaseConfig';

export async function signOutUser() {
  const uid = auth.currentUser?.uid;
  if (uid) {
    try {
      await updateDoc(doc(db, 'users', uid), Platform.OS === 'web'
        ? { webPushToken: deleteField() }
        : { expoPushToken: deleteField() });
    } catch (e) {
      console.warn('Clear push token on sign-out:', e);
    }
  }
  try {
    await SecureStore.deleteItemAsync('xctracker_email');
    await SecureStore.deleteItemAsync('xctracker_password');
  } catch (e) { /* SecureStore unavailable on web — Firebase persistence handles auth */ }
  await signOut(auth);
}
