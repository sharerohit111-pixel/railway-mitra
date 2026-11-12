// Point Admin SDK clients and custom-token signing at local emulators before initialization.
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { initializeApp: initializeClientApp, deleteApp: deleteClientApp } = require("firebase/app");
const { getAuth: getClientAuth, connectAuthEmulator, signInWithCustomToken, signOut } = require("firebase/auth");
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require("firebase/functions");

const PROJECT = process.env.GCLOUD_PROJECT || "railway-mitra";
const REGION = "asia-south1";
let app, db, uid, clientApp, clientAuth, functions, claimedAttemptId;
const testId = "emulator-cbt-test";

async function callable(name, data = {}) {
  const response = await httpsCallable(functions, name)(data);
  return response.data;
}

before(async () => {
  app = initializeApp({ projectId: PROJECT }, "cbt-emulator-tests");
  db = getFirestore(app);
  clientApp = initializeClientApp({
    apiKey: "fake-api-key",
    projectId: PROJECT,
    appId: "1:123456789:web:cbtemulator"
  }, "cbt-client-tests");
  clientAuth = getClientAuth(clientApp);
  connectAuthEmulator(clientAuth, "http://127.0.0.1:9099", { disableWarnings: true });
  functions = getFunctions(clientApp, REGION);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);

  const user = await getAuth(app).createUser({
    phoneNumber: "+1555" + String(Date.now()).slice(-7)
  });
  uid = user.uid;
  const customToken = await getAuth(app).createCustomToken(uid);
  await signInWithCustomToken(clientAuth, customToken);

  await db.doc("testSeriesConfig/freeTest").set({ enabled: true, testId });
  await db.doc(`testSeriesTests/${testId}`).set({
    status: "published", price: 0, mode: "mock",
    durationMinutes: 30, marksPerQuestion: 2, negativeMarks: 0.5
  });
  await db.doc(`testSeriesAnswerKeys/${testId}`).set({
    questions: {
      q1: { correctAnswer: "A" },
      q2: { correctAnswer: "B" }
    }
  });
});

after(async () => {
  if (db && uid) {
    const collections = [
      "testSeriesFreeAttempts", "testSeriesAttempts",
      "testSeriesActiveSessions", "testSeriesResults"
    ];
    for (const collection of collections) {
      const snap = await db.collection(collection).where("uid", "==", uid).get();
      const batch = db.batch();
      snap.docs.forEach(doc => batch.delete(doc.ref));
      if (!snap.empty) await batch.commit();
    }
    await db.doc(`testSeriesFreeAttempts/${uid}`).delete().catch(() => {});
    await db.doc(`testSeriesActiveSessions/${uid}`).delete().catch(() => {});
    await db.doc(`testSeriesTests/${testId}`).delete();
    await db.doc(`testSeriesAnswerKeys/${testId}`).delete();
    await db.doc("testSeriesConfig/freeTest").delete();
    await getAuth(app).deleteUser(uid).catch(() => {});
  }
  if (clientApp) await deleteClientApp(clientApp);
  if (app) await deleteApp(app);
});

test("student can claim one free test attempt only once", async () => {
  const claim = await callable("rmClaimFreeAttempt");
  assert.equal(claim.testId, testId);
  assert.ok(claim.attemptId);
  claimedAttemptId = claim.attemptId;
  await assert.rejects(
    callable("rmClaimFreeAttempt"),
    error => error.code === "functions/already-exists" || /already claimed/i.test(error.message)
  );
});

test("student can start, save answers and submit with server-side scoring", async () => {
  const started = await callable("rmStartExam", { testId });
  assert.ok(started.attemptId);
  assert.equal(started.attemptId, claimedAttemptId, "free claim must be the attempt that starts");
  assert.equal(started.resumed, false);

  const saved = await callable("rmSaveAnswer", {
    attemptId: started.attemptId, questionId: "q1", answer: "A"
  });
  assert.equal(saved.saved, true);

  const result = await callable("rmSubmitExam", { attemptId: started.attemptId });
  assert.equal(result.submitted, true);
  assert.equal(result.correct, 1);
  assert.equal(result.wrong, 0);
  assert.equal(result.unattempted, 1);
  assert.equal(result.score, 2);
  assert.equal(result.totalQuestions, 2);
});

test("free test cannot start until the one-time claim is created", async () => {
  const unclaimedTestId = "emulator-unclaimed-free-test";
  await db.doc(`testSeriesTests/${unclaimedTestId}`).set({
    status: "published", price: 0, mode: "mock", durationMinutes: 10
  });
  try {
    await assert.rejects(
      callable("rmStartExam", { testId: unclaimedTestId }),
      error => error.code === "functions/permission-denied"
    );
  } finally {
    await db.doc(`testSeriesTests/${unclaimedTestId}`).delete();
  }
});

test("unauthenticated caller cannot start an exam", async () => {
  await signOut(clientAuth);
  await assert.rejects(
    callable("rmStartExam", { testId }),
    error => error.code === "functions/unauthenticated"
  );
});

test("non-owner cannot create a test", async () => {
  const originalOwnerUid = process.env.OWNER_UID;
  process.env.OWNER_UID = "some-other-owner";
  // Re-authenticate the ordinary student after the preceding anonymous-call test.
  await signInWithCustomToken(clientAuth, await getAuth(app).createCustomToken(uid));
  try {
    await assert.rejects(
      callable("rmOwnerSaveTest", {
        title: "Should Be Rejected", mode: "mock", durationMinutes: 10,
        price: 0, status: "draft",
        questions: [{ id: "q1", text: "Question?", options: ["A", "B"], correctIndex: 0 }]
      }),
      error => error.code === "functions/permission-denied"
    );
  } finally {
    process.env.OWNER_UID = originalOwnerUid;
  }
});
