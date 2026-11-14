// Dedicated Firebase bootstrap for the isolated Railway Mitra Test Series.
// Keep this public production config aligned with assets/js/firebase.js; the
// App Check bootstrap regression test compares the shared project/app identifiers.
// Production App Check must initialize before Auth, Firestore or Functions clients.
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { connectAuthEmulator, getAuth } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { connectFirestoreEmulator, getFirestore } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { connectFunctionsEmulator, getFunctions } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";
import { initializeRailwayMitraAppCheck } from "./app-check.js";
import { resolveTestSeriesFirebaseMode } from "./firebase-emulator-config.mjs";

const productionFirebaseConfig = {
  apiKey: "AIzaSyBhxC-YtYTzDvvc7clufOukgdVUNEvrNj4",
  authDomain: "railway-mitra.firebaseapp.com",
  projectId: "railway-mitra",
  storageBucket: "railway-mitra.firebasestorage.app",
  messagingSenderId: "697258746002",
  appId: "1:697258746002:web:811c2627b8874f7212064b"
};

// Emulator mode is opt-in and throws on non-loopback origins. A typo or a
// hosted preview must never silently fall back to the production project.
const bootstrapMode = resolveTestSeriesFirebaseMode(globalThis.location);
const firebaseConfig = bootstrapMode.mode === "emulator"
  ? bootstrapMode.firebaseConfig
  : productionFirebaseConfig;

export const app = initializeApp(firebaseConfig, "railway-mitra-test-series");
export const firebaseBootstrapMode = bootstrapMode.mode;
export const testSeriesAppCheck = bootstrapMode.mode === "emulator"
  ? null
  : initializeRailwayMitraAppCheck(app);

// In production App Check is already initialized before any Firebase service.
// In emulator mode, connect every service immediately so no callable or auth
// request can escape to the configured live Firebase project.
export const auth = getAuth(app);
if (bootstrapMode.mode === "emulator") {
  connectAuthEmulator(auth, bootstrapMode.endpoints.auth, { disableWarnings: true });
}

export const db = getFirestore(app);
if (bootstrapMode.mode === "emulator") {
  connectFirestoreEmulator(db, bootstrapMode.endpoints.firestore.host, bootstrapMode.endpoints.firestore.port);
}

export const functions = getFunctions(app, "asia-south1");
if (bootstrapMode.mode === "emulator") {
  connectFunctionsEmulator(functions, bootstrapMode.endpoints.functions.host, bootstrapMode.endpoints.functions.port);
}
