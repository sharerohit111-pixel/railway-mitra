// Dedicated Firebase bootstrap for the isolated Railway Mitra Test Series.
// Keep this public config aligned with assets/js/firebase.js; the automated
// App Check bootstrap test checks the shared project/app identifiers and keys.
// App Check must initialize before Auth, Firestore or Functions clients are created.
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { initializeRailwayMitraAppCheck } from "./app-check.js";

const firebaseConfig = {
  apiKey: "AIzaSyBhxC-YtYTzDvvc7clufOukgdVUNEvrNj4",
  authDomain: "railway-mitra.firebaseapp.com",
  projectId: "railway-mitra",
  storageBucket: "railway-mitra.firebasestorage.app",
  messagingSenderId: "697258746002",
  appId: "1:697258746002:web:811c2627b8874f7212064b"
};

export const app = initializeApp(firebaseConfig, "railway-mitra-test-series");
export const testSeriesAppCheck = initializeRailwayMitraAppCheck(app);

// Do not move these service initializers above App Check initialization.
export const auth = getAuth(app);
export const db = getFirestore(app);
