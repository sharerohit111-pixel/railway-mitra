// Railway Mitra — Firebase App Check initialization
// Provider: reCAPTCHA Enterprise (Fraud Defense)
// Called by the isolated Test Series bootstrap immediately after initializeApp.
// It must run before Auth, Firestore or Functions clients are created.
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app-check.js";

const SITE_KEY = "6LeWCR0uAAAAAKqYY_soboX2jc5nIBUGhsHgmfP2";

export function initializeRailwayMitraAppCheck(firebaseApp) {
  if (!firebaseApp) throw new Error("Firebase app is required for App Check.");

  return initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaEnterpriseProvider(SITE_KEY),
    isTokenAutoRefreshEnabled: true
  });
}
