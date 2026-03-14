import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBiqjGIzraq-fSHn5X2cWqLdPGfKuqCVsk",
  authDomain: "xctracker-a2532.firebaseapp.com",
  projectId: "xctracker-a2532",
  storageBucket: "xctracker-a2532.firebasestorage.app",
  messagingSenderId: "855291223907",
  appId: "1:855291223907:web:fb1c9a1ef652297a56fd56"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);