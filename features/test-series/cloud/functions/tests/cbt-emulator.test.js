const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp, getApps, deleteApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const PROJECT = process.env.GCLOUD_PROJECT || "railway-mitra";
const REGION = "asia-south1";
const BASE = `http://127.0.0.1:5001/${PROJECT}/${REGION}`;
let app, db, uid, idToken;
const testId = "emulator-cbt-test";

async function callable(name, data = {}) {
  const response = await fetch(`${BASE}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify({ data })
  });
  const body = await response.json();
  if (!response.ok || body.error) {
    const error = new Error(body.error?.message || `Callable failed: ${response.status}`);
    error.code = body.error?.status;
    throw error;
  }
  return body.result;
}

before(async () => {
  app = getApps().find(x => x.name === "cbt-emulator-tests") ||
    initializeApp({ projectId: PROJECT }, "cbt-emulator-tests");
  db = getFirestore(app);
  const user = await getAuth(app).createUser({
    phoneNumber: "+1555" + String(Date.now()).slice(-7)
  });
  uid = user.uid;
  const customToken = await getAuth(app).createCustomToken(uid);
  const signIn = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });
  const authBody = await signIn.json();
  assert.ok(authBody.idToken, "Auth emulator should return an ID token");
  idToken = authBody.idToken;

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
  if (app) await deleteApp(app);
});

test("student can claim one free test attempt only once", async () => {
  const claim = await callable("rmClaimFreeAttempt");
  assert.equal(claim.testId, testId);
  assert.ok(claim.attemptId);
  await assert.rejects(
    callable("rmClaimFreeAttempt"),
    error => error.code === "ALREADY_EXISTS" || /already claimed/i.test(error.message)
  );
});

test("student can start, save answers and submit with server-side scoring", async () => {
  const started = await callable("rmStartExam", { testId });
  assert.ok(started.attemptId);
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
