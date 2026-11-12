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
    title: "Emulator Free Test", status: "published", price: 0, mode: "mock",
    durationMinutes: 30, marksPerQuestion: 2, negativeMarks: 0.5, questionCount: 2
  });
  await db.doc("testSeriesTests/emulator-draft-test").set({
    title: "Hidden Draft", status: "draft", price: 0, mode: "mock", durationMinutes: 10, questionCount: 1
  });
  await db.doc(`testSeriesAnswerKeys/${testId}`).set({
    questions: {
      q1: { correctAnswer: "0" },
      q2: { correctAnswer: "1" }
    }
  });
  await db.doc(`testSeriesQuestionSets/${testId}`).set({
    questions: [
      { id: "q1", text: "Question one?", options: ["A", "B"] },
      { id: "q2", text: "Question two?", options: ["A", "B"] }
    ]
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
    await db.doc("testSeriesTests/emulator-draft-test").delete();
    await db.doc(`testSeriesAnswerKeys/${testId}`).delete();
    await db.doc(`testSeriesQuestionSets/${testId}`).delete();
    await db.doc("testSeriesConfig/freeTest").delete();
    await getAuth(app).deleteUser(uid).catch(() => {});
  }
  if (clientApp) await deleteClientApp(clientApp);
  if (app) await deleteApp(app);
});

test("student catalogue returns published metadata only and never answer keys", async () => {
  const catalogue = await callable("rmListAvailableTests");
  const listed = catalogue.tests.find(item => item.testId === testId);
  assert.ok(listed);
  assert.equal(listed.title, "Emulator Free Test");
  assert.equal(listed.price, 0);
  assert.equal(Object.hasOwn(listed, "correctAnswer"), false);
  assert.equal(catalogue.tests.some(item => item.testId === "emulator-draft-test"), false);
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

  // A reload/re-entry during a live attempt must resume the same server session.
  const resumed = await callable("rmStartExam", { testId });
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.attemptId, started.attemptId);
  assert.equal(resumed.expiresAt, started.expiresAt);

  const paper = await callable("rmGetExamQuestions", { attemptId: started.attemptId });
  assert.equal(paper.questions.length, 2);
  assert.equal(paper.questions[0].id, "q1");
  assert.equal(Object.hasOwn(paper.questions[0], "correctAnswer"), false);
  assert.equal(Object.hasOwn(paper.questions[0], "correctIndex"), false);
  assert.ok(paper.expiresAt);

  await assert.rejects(
    callable("rmSaveAnswer", { attemptId: started.attemptId, questionId: "q1", answer: "9" }),
    error => error.code === "functions/invalid-argument"
  );
  await assert.rejects(
    callable("rmSaveAnswer", { attemptId: started.attemptId, questionId: "not-in-paper", answer: "0" }),
    error => error.code === "functions/invalid-argument"
  );
  const saved = await callable("rmSaveAnswer", {
    attemptId: started.attemptId, questionId: "q1", answer: "0"
  });
  assert.equal(saved.saved, true);

  await assert.rejects(
    callable("rmGetCbtAttemptResult", { attemptId: started.attemptId }),
    error => error.code === "functions/failed-precondition"
  );

  // Simulate the server deadline passing after the answer was persisted.
  await db.doc("testSeriesAttempts/" + started.attemptId).update({
    expiresAt: new Date(Date.now() - 1000)
  });
  const lateSave = await callable("rmSaveAnswer", {
    attemptId: started.attemptId, questionId: "q2", answer: "1"
  }).then(() => null, error => error);
  assert.ok(lateSave, "answers must not be changed after expiry");
  assert.ok(/closed|deadline|expired/i.test(lateSave.message));

  const result = await callable("rmSubmitExam", { attemptId: started.attemptId });
  assert.equal(result.submitted, true);
  assert.equal(result.timedOut, true);
  assert.equal(result.correct, 1);
  assert.equal(result.wrong, 0);
  assert.equal(result.unattempted, 1);
  assert.equal(result.score, 2);
  assert.equal(result.totalQuestions, 2);

  // A lost network response may cause the client to submit the same attempt again.
  const repeatedResult = await callable("rmSubmitExam", { attemptId: started.attemptId });
  assert.deepEqual(repeatedResult, result, "repeated submit must return the original complete result");
  const recoveredResult = await callable("rmGetCbtAttemptResult", { attemptId: started.attemptId });
  assert.deepEqual(recoveredResult, result, "a submitted result must be recoverable after re-entry");
  await assert.rejects(
    callable("rmGetCbtAttemptResult", { attemptId: "not-this-students-attempt" }),
    error => error.code === "functions/permission-denied"
  );
  const persistedAttempt = (await db.doc("testSeriesAttempts/" + started.attemptId).get()).data();
  assert.equal(persistedAttempt.status, "submitted");
  assert.equal(persistedAttempt.timedOut, true);

  await db.doc("testSeriesResults/foreign-student-result").set({
    uid: "another-student-uid", testId, score: 999, correct: 99,
    wrong: 0, unattempted: 0, totalQuestions: 99
  });
  const dashboard = await callable("rmGetStudentDashboard");
  assert.equal(dashboard.resultCount, 1);
  assert.equal(dashboard.results[0].attemptId, started.attemptId);
  assert.equal(dashboard.results[0].testTitle, "Emulator Free Test");
  assert.equal(dashboard.results.some(item => item.score === 999), false);
  await db.doc("testSeriesResults/leaderboard-higher-score").set({
    uid: "private-student-uid-1", testId, score: 4, correct: 2,
    wrong: 0, unattempted: 0, totalQuestions: 2
  });
  await db.doc("testSeriesResults/leaderboard-tied-score").set({
    uid: "private-student-uid-2", testId, score: 2, correct: 1,
    wrong: 0, unattempted: 1, totalQuestions: 2
  });
  const leaderboard = await callable("rmGetTestLeaderboard", { testId });
  assert.equal(leaderboard.participantCount, 4);
  assert.equal(leaderboard.myRank, 3);
  assert.equal(leaderboard.top[0].rank, 1);
  assert.equal(leaderboard.top[0].label, "Candidate 01");
  assert.equal(Object.hasOwn(leaderboard.top[0], "uid"), false);
  assert.equal(Object.hasOwn(leaderboard.top[0], "attemptId"), false);
  await db.doc("testSeriesResults/leaderboard-higher-score").delete();
  await db.doc("testSeriesResults/leaderboard-tied-score").delete();
  await db.doc("testSeriesResults/foreign-student-result").delete();
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
