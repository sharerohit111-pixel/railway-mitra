"use strict";

// Run only from a trusted computer with Firebase Admin ADC configured.
// Never commit service-account keys or run this from browser/client code.
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const PROJECT_ID = "railway-mitra";
const uid = process.argv[2];

if (!uid || !/^[A-Za-z0-9_-]{10,128}$/.test(uid)) {
  console.error("Usage: npm run set-owner-admin -- <FIREBASE_AUTH_UID>");
  process.exit(1);
}
if (process.env.GOOGLE_CLOUD_PROJECT !== PROJECT_ID &&
    process.env.GCLOUD_PROJECT !== PROJECT_ID) {
  console.error("Refusing to continue: set GOOGLE_CLOUD_PROJECT=railway-mitra after verifying the active project.");
  process.exit(1);
}

async function main() {
  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const auth = getAuth();
  const user = await auth.getUser(uid);
  const existingClaims = user.customClaims || {};
  await auth.setCustomUserClaims(uid, { ...existingClaims, admin: true });
  const verified = await auth.getUser(uid);
  if (verified.customClaims?.admin !== true) {
    throw new Error("Custom claim verification failed.");
  }
  console.log("Owner admin claim assigned and verified.");
  console.log("UID:", uid);
  console.log("Email:", user.email || "(no email on account)");
  console.log("Project:", PROJECT_ID);
  console.log("Ask the owner to sign out and sign in again to refresh the ID token.");
}

main().catch(error => {
  console.error("Could not assign owner claim:", error.message);
  process.exitCode = 1;
});
