// Deploy as a separate Firebase Functions codebase after review.
// Blaze billing may be required. Do NOT deploy until Firebase project is configured.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
initializeApp();

exports.rmClaimFreeAttempt = onCall({ region: "asia-south1", enforceAppCheck: true }, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required");
  const uid = request.auth.uid;
  const db = getFirestore();
  const entitlementRef = db.doc(`testSeriesFreeAttempts/${uid}`);
  const freeTestRef = db.doc("testSeriesConfig/freeTest");
  return db.runTransaction(async tx => {
    const [existing, config] = await Promise.all([tx.get(entitlementRef), tx.get(freeTestRef)]);
    if (existing.exists) throw new HttpsError("already-exists", "Free attempt already claimed");
    if (!config.exists || !config.data().enabled || !config.data().testId)
      throw new HttpsError("failed-precondition", "Free test not available");
    const testId = config.data().testId;
    const testRef = db.doc(`testSeriesTests/${testId}`);
    const test = await tx.get(testRef);
    if (!test.exists || test.data().status !== "published" || test.data().price !== 0)
      throw new HttpsError("failed-precondition", "Free test not published");
    const attemptRef = db.collection("testSeriesAttempts").doc();
    tx.create(entitlementRef, { uid, testId, attemptId: attemptRef.id, claimedAt: FieldValue.serverTimestamp() });
    tx.create(attemptRef, { uid, testId, status: "started", startedAt: FieldValue.serverTimestamp() });
    return { attemptId: attemptRef.id, testId, status: "started" };
  });
});


exports.rmGetOwnerAdminSession = onCall({ region: "asia-south1", enforceAppCheck: true }, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Owner login required");
  const ownerUid = process.env.OWNER_UID;
  if (!ownerUid) throw new HttpsError("failed-precondition", "Owner UID is not configured on the server");
  if (request.auth.uid !== ownerUid) throw new HttpsError("permission-denied", "Owner access denied");
  const firebaseClaims = request.auth.token.firebase || {};
  if (!firebaseClaims.sign_in_second_factor)
    throw new HttpsError("permission-denied", "A fresh second-factor OTP is required");
  return { authorized: true, uid: request.auth.uid, email: request.auth.token.email || null };
});
