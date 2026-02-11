// ============================================================
// Firebase initialization — shared across all entry points
// ============================================================

import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  type Auth,
} from "firebase/auth";
import {
  initializeFirestore,
  connectFirestoreEmulator,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { firebaseConfig } from "./firebase-config";

const isLocal =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

// Initialize Firebase
export const app: FirebaseApp = initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);
export const db: Firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

// Connect to emulators for local development
if (isLocal) {
  connectAuthEmulator(auth, "http://localhost:9099", {
    disableWarnings: true,
  });
  connectFirestoreEmulator(db, "localhost", 8081);
}

// Analytics only in production (fails on localhost)
if (!isLocal) {
  import("firebase/analytics")
    .then(({ getAnalytics }) => getAnalytics(app))
    .catch(() => {
      /* analytics unavailable */
    });
}

// Re-export auth utilities
export { sendPasswordResetEmail, signOut, onAuthStateChanged };
