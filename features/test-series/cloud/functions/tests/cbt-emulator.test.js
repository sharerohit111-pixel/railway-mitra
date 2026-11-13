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
const { applyCapturedPayment } = require("../payment-ledger");
const crypto = require("node:crypto");
const { handleRazorpayWebhook } = require("../razorpay-webhook-handler");
const { hasVerifiedPhoneMfa } = require("../owner-auth");

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


test("owner access accepts only a verified phone MFA factor", () => {
  assert.equal(hasVerifiedPhoneMfa({ firebase: { sign_in_second_factor: "phone" } }), true);
  assert.equal(hasVerifiedPhoneMfa({ firebase: { sign_in_second_factor: "totp" } }), false);
  assert.equal(hasVerifiedPhoneMfa({ firebase: { sign_in_second_factor: null } }), false);
  assert.equal(hasVerifiedPhoneMfa({ firebase: {} }), false);
  assert.equal(hasVerifiedPhoneMfa(null), false);
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
  // A stale server-side pointer must not cause a non-existent attempt to be resumed.
  await db.doc("testSeriesActiveSessions/" + uid).set({
    uid, testId: "stale-other-test", attemptId: "missing-before-first-start", status: "in_progress",
    startedAt: new Date(), expiresAt: new Date(Date.now() + 60000)
  });
  const started = await callable("rmStartExam", { testId });
  assert.ok(started.attemptId);
  assert.equal(started.attemptId, claimedAttemptId, "free claim must be the attempt that starts");
  assert.equal(started.resumed, false);
  const activeAttempt = await callable("rmGetStudentActiveAttempt", { testId });
  assert.equal(activeAttempt.found, true);
  assert.equal(activeAttempt.attemptId, started.attemptId);
  assert.equal(activeAttempt.status, "in_progress");
  const otherTestAttempt = await callable("rmGetStudentActiveAttempt", { testId: "another-test" });
  assert.equal(otherTestAttempt.found, false);

  // A reload/re-entry during a live attempt must resume the same server session.
  const resumed = await callable("rmStartExam", { testId });
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.attemptId, started.attemptId);
  assert.equal(resumed.expiresAt, started.expiresAt);

  // The one-time free claim must recover its attempt if the active-session pointer is stale.
  await db.doc("testSeriesActiveSessions/" + uid).update({ testId: "stale-other-test" });
  const recoveredFromClaim = await callable("rmStartExam", { testId });
  assert.equal(recoveredFromClaim.resumed, true);
  assert.equal(recoveredFromClaim.attemptId, started.attemptId);
  const repairedActive = await callable("rmGetStudentActiveAttempt", { testId });
  assert.equal(repairedActive.found, true);
  assert.equal(repairedActive.attemptId, started.attemptId);

  // A valid active exam must prevent the same student from starting a different paid test.
  const paidTestId = "emulator-paid-concurrent-test";
  await db.doc("testSeriesTests/" + paidTestId).set({
    title: "Paid Concurrent Test", status: "published", price: 50,
    mode: "mock", durationMinutes: 10, questionCount: 1
  });
  const paidEntitlementRef = db.doc("testSeriesEntitlements/" + uid + "_" + paidTestId);
  try {
    // An active record at the expected document path is not sufficient: its owner and test
    // fields must also match the authenticated student and requested paid test.
    await paidEntitlementRef.set({
      uid: "different-student-uid", testId: paidTestId, status: "active"
    });
    await assert.rejects(
      callable("rmStartExam", { testId: paidTestId }),
      error => error.code === "functions/permission-denied"
    );

    await paidEntitlementRef.set({
      uid, testId: "different-paid-test", status: "active"
    });
    await assert.rejects(
      callable("rmStartExam", { testId: paidTestId }),
      error => error.code === "functions/permission-denied"
    );

    await paidEntitlementRef.set({ uid, testId: paidTestId, status: "active" });
    await assert.rejects(
      callable("rmStartExam", { testId: paidTestId }),
      error => error.code === "functions/already-exists"
    );
  } finally {
    await db.doc("testSeriesTests/" + paidTestId).delete();
    await paidEntitlementRef.delete();
  }

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
  const completedSession = await callable("rmGetStudentActiveAttempt", { testId });
  assert.equal(completedSession.found, true);
  assert.equal(completedSession.status, "completed");
  assert.equal(completedSession.attemptId, started.attemptId);
  await db.doc("testSeriesActiveSessions/" + uid).update({ attemptId: "missing-attempt-record" });
  const staleSession = await callable("rmGetStudentActiveAttempt", { testId });
  assert.equal(staleSession.found, false, "stale active-session pointers must not expose nonexistent attempts");
  await db.doc("testSeriesActiveSessions/" + uid).update({ attemptId: started.attemptId });
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
  assert.equal(dashboard.results[0].timedOut, true, "dashboard must preserve the server timeout flag");
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

test("paid and scheduled exams enforce entitlement and their server-side time window", async () => {
  const scheduledTestId = "emulator-scheduled-window-test";
  const testRef = db.doc("testSeriesTests/" + scheduledTestId);
  const entitlementRef = db.doc("testSeriesEntitlements/" + uid + "_" + scheduledTestId);
  const keyRef = db.doc("testSeriesAnswerKeys/" + scheduledTestId);
  const questionsRef = db.doc("testSeriesQuestionSets/" + scheduledTestId);
  let startedAttemptId = null;
  try {
    const now = Date.now();
    await testRef.set({
      title: "Scheduled Window Test", status: "published", price: 50,
      mode: "scheduled", durationMinutes: 10,
      scheduleStartAt: new Date(now + 60_000),
      scheduleEndAt: new Date(now + 10 * 60_000)
    });
    await keyRef.set({ questions: {} });
    await questionsRef.set({ questions: [] });

    await assert.rejects(
      callable("rmStartExam", { testId: scheduledTestId }),
      error => error.code === "functions/failed-precondition"
    );

    await testRef.update({
      scheduleStartAt: new Date(Date.now() - 60_000),
      scheduleEndAt: new Date(Date.now() + 10 * 60_000)
    });
    await assert.rejects(
      callable("rmStartExam", { testId: scheduledTestId }),
      error => error.code === "functions/permission-denied"
    );

    await entitlementRef.set({ uid, testId: scheduledTestId, status: "active" });
    await testRef.update({ scheduleStartAt: new Date(Date.now() + 60_000) });
    await assert.rejects(
      callable("rmStartExam", { testId: scheduledTestId }),
      error => error.code === "functions/failed-precondition"
    );

    await testRef.update({
      scheduleStartAt: new Date(Date.now() - 60_000),
      scheduleEndAt: new Date(Date.now() + 10 * 60_000)
    });
    const started = await callable("rmStartExam", { testId: scheduledTestId });
    startedAttemptId = started.attemptId;
    assert.ok(startedAttemptId);
    const submitted = await callable("rmSubmitExam", { attemptId: startedAttemptId });
    assert.equal(submitted.submitted, true);
    assert.equal(submitted.totalQuestions, 0);
  } finally {
    if (startedAttemptId) {
      await db.doc("testSeriesAttempts/" + startedAttemptId).delete();
      await db.doc("testSeriesResults/" + startedAttemptId).delete();
    }
    await db.doc("testSeriesActiveSessions/" + uid).delete();
    await Promise.all([testRef, entitlementRef, keyRef, questionsRef].map(ref => ref.delete().catch(() => {})));
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


test("captured payment ledger grants one paid entitlement and deduplicates webhook retries", async () => {
  const paidTestId = "emulator-payment-ledger-test";
  const orderId = "order_ledger_primary";
  const secondOrderId = "order_ledger_replay";
  const paymentId = "pay_ledger_captured";
  const eventId = "evt_ledger_first";
  const testRef = db.doc("testSeriesTests/" + paidTestId);
  const orderRef = db.doc("testSeriesPaymentOrders/" + orderId);
  const secondOrderRef = db.doc("testSeriesPaymentOrders/" + secondOrderId);
  const paymentRef = db.doc("testSeriesPayments/" + paymentId);
  const eventRef = db.doc("testSeriesPaymentEvents/" + eventId);
  const replayEventRef = db.doc("testSeriesPaymentEvents/evt_ledger_replay");
  const entitlementRef = db.doc("testSeriesEntitlements/" + uid + "_" + paidTestId);
  let attemptId = null;

  const event = {
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: paymentId,
          order_id: orderId,
          amount: 49900,
          currency: "INR",
          status: "captured",
          notes: { uid: "untrusted_uid", testId: "untrusted_test" }
        }
      }
    }
  };

  try {
    await testRef.set({
      title: "Ledger Paid Test", status: "published", price: 499,
      mode: "mock", durationMinutes: 10, questionCount: 1
    });
    await orderRef.set({
      uid, testId: paidTestId, razorpayOrderId: orderId,
      amount: 49900, currency: "INR", status: "created"
    });

    const first = await applyCapturedPayment({ db, event, eventId });
    assert.deepEqual(first, {
      granted: true, duplicate: false, paymentId, orderId, uid, testId: paidTestId
    });

    const paidOrder = (await orderRef.get()).data();
    assert.equal(paidOrder.status, "paid");
    assert.equal(paidOrder.paymentId, paymentId);
    const entitlement = (await entitlementRef.get()).data();
    assert.equal(entitlement.status, "active");
    assert.equal(entitlement.uid, uid);
    assert.equal(entitlement.testId, paidTestId);
    assert.equal(entitlement.paymentId, paymentId);
    assert.equal((await paymentRef.get()).exists, true);
    assert.equal((await eventRef.get()).data().status, "processed");

    const sameEventRetry = await applyCapturedPayment({ db, event, eventId });
    assert.equal(sameEventRetry.granted, false);
    assert.equal(sameEventRetry.duplicate, true);

    const newEventRetry = await applyCapturedPayment({ db, event, eventId: "evt_ledger_replay" });
    assert.equal(newEventRetry.granted, false);
    assert.equal(newEventRetry.duplicate, true);
    assert.equal((await replayEventRef.get()).data().status, "duplicate");

    // A new provider event ID for an already-recorded payment is still a replay.
    // It must not be acknowledged when any identity/value in the entitlement
    // document has drifted from the authoritative order and payment ledger.
    const originalEntitlementForReplay = (await entitlementRef.get()).data();
    const corruptedEntitlements = [
      ["uid", { ...originalEntitlementForReplay, uid: "another_student" }],
      ["testId", { ...originalEntitlementForReplay, testId: "another_test" }],
      ["razorpayOrderId", { ...originalEntitlementForReplay, razorpayOrderId: "order_other" }],
      ["amount", { ...originalEntitlementForReplay, amount: 1 }],
      ["currency", { ...originalEntitlementForReplay, currency: "USD" }]
    ];
    for (const [field, corrupted] of corruptedEntitlements) {
      await entitlementRef.set(corrupted);
      const corruptedEventId = "evt_ledger_corrupt_" + field;
      await assert.rejects(
        applyCapturedPayment({ db, event, eventId: corruptedEventId }),
        error => error.code === "payment_id_conflict",
        "replay must reject an entitlement with mismatched " + field
      );
      assert.equal(
        (await db.doc("testSeriesPaymentEvents/" + corruptedEventId).get()).exists,
        false
      );
    }
    await entitlementRef.set(originalEntitlementForReplay);
    const repairedReplay = await applyCapturedPayment({
      db, event, eventId: "evt_ledger_replay_repaired"
    });
    assert.equal(repairedReplay.granted, false);
    assert.equal(repairedReplay.duplicate, true);

    // An existing event ID is idempotent only while its complete payment and
    // entitlement records remain present and consistent.
    const originalEntitlement = (await entitlementRef.get()).data();
    await entitlementRef.delete();
    await assert.rejects(
      applyCapturedPayment({ db, event, eventId }),
      error => error.code === "event_ledger_inconsistent"
    );
    await entitlementRef.set(originalEntitlement);

    const originalPayment = (await paymentRef.get()).data();
    await paymentRef.delete();
    await assert.rejects(
      applyCapturedPayment({ db, event, eventId: "evt_ledger_replay" }),
      error => error.code === "event_ledger_inconsistent" ||
        /missing its order or payment ledger record/i.test(error.message)
    );
    await paymentRef.set(originalPayment);

    await assert.rejects(
      applyCapturedPayment({
        db,
        event: {
          ...event,
          payload: { payment: { entity: { ...event.payload.payment.entity, id: "pay_other_event" } } }
        },
        eventId
      }),
      error => error.code === "event_id_conflict"
    );

    await secondOrderRef.set({
      uid, testId: paidTestId, razorpayOrderId: secondOrderId,
      amount: 49900, currency: "INR", status: "created"
    });
    await assert.rejects(
      applyCapturedPayment({
        db,
        event: {
          ...event,
          payload: { payment: { entity: { ...event.payload.payment.entity, order_id: secondOrderId } } }
        },
        eventId: "evt_ledger_payment_reuse"
      }),
      error => error.code === "payment_id_conflict"
    );

    // The entitlement created by the verified ledger is the only paid-access
    // record rmStartExam needs; no browser-supplied payment flag is involved.
    const started = await callable("rmStartExam", { testId: paidTestId });
    attemptId = started.attemptId;
    assert.ok(attemptId);
    assert.equal(started.resumed, false);
  } finally {
    if (attemptId) await db.doc("testSeriesAttempts/" + attemptId).delete().catch(() => {});
    await db.doc("testSeriesActiveSessions/" + uid).delete().catch(() => {});
    await Promise.all([
      testRef, orderRef, secondOrderRef, paymentRef, eventRef, replayEventRef, entitlementRef,
      db.doc("testSeriesPaymentEvents/evt_ledger_replay_repaired"),
      db.doc("testSeriesPaymentEvents/evt_ledger_payment_reuse")
    ].map(ref => ref.delete().catch(() => {})));
  }
});


test("verified Razorpay webhook reaches the Firestore ledger exactly once", async () => {
  const paidTestId = "emulator-webhook-integration-test";
  const orderId = "order_webhook_integration";
  const paymentId = "pay_webhook_integration";
  const eventId = "evt_webhook_integration";
  const webhookSecret = "emulator-only-webhook-secret";
  const orderRef = db.doc("testSeriesPaymentOrders/" + orderId);
  const paymentRef = db.doc("testSeriesPayments/" + paymentId);
  const eventRef = db.doc("testSeriesPaymentEvents/" + eventId);
  const entitlementRef = db.doc("testSeriesEntitlements/" + uid + "_" + paidTestId);
  const event = {
    event: "payment.captured",
    payload: { payment: { entity: {
      id: paymentId, order_id: orderId, amount: 12550,
      currency: "INR", status: "captured",
      notes: { uid: "attacker-controlled-uid", testId: "attacker-controlled-test" }
    } } }
  };
  const rawBody = Buffer.from(JSON.stringify(event));
  const signature = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");

  function makeRequest(sig = signature) {
    return {
      method: "POST", rawBody, body: event,
      get(name) {
        if (name === "x-razorpay-signature") return sig;
        if (name === "x-razorpay-event-id") return eventId;
        return undefined;
      }
    };
  }
  function makeResponse() {
    return {
      code: null, body: null,
      set() { return this; },
      status(code) { this.code = code; return this; },
      send(body) { this.body = body; return this; },
      json(body) { this.body = body; return this; }
    };
  }

  try {
    await db.doc("testSeriesTests/" + paidTestId).set({
      title: "Webhook Integration Paid Test", status: "published", price: 125.5,
      mode: "mock", durationMinutes: 10, questionCount: 1
    });
    await orderRef.set({
      uid, testId: paidTestId, razorpayOrderId: orderId,
      amount: 12550, currency: "INR", status: "created"
    });

    const invalidResponse = makeResponse();
    await handleRazorpayWebhook({
      req: makeRequest("0".repeat(64)), res: invalidResponse,
      secret: webhookSecret, db, applyPayment: applyCapturedPayment
    });
    assert.equal(invalidResponse.code, 400);
    assert.equal((await orderRef.get()).data().status, "created");
    assert.equal((await entitlementRef.get()).exists, false);

    const firstResponse = makeResponse();
    await handleRazorpayWebhook({
      req: makeRequest(), res: firstResponse,
      secret: webhookSecret, db, applyPayment: applyCapturedPayment
    });
    assert.equal(firstResponse.code, 200);
    assert.deepEqual(firstResponse.body, { received: true, duplicate: false });

    const grant = (await entitlementRef.get()).data();
    assert.equal(grant.uid, uid);
    assert.equal(grant.testId, paidTestId);
    assert.equal(grant.paymentId, paymentId);
    assert.equal((await orderRef.get()).data().status, "paid");
    assert.equal((await paymentRef.get()).exists, true);

    const replayResponse = makeResponse();
    await handleRazorpayWebhook({
      req: makeRequest(), res: replayResponse,
      secret: webhookSecret, db, applyPayment: applyCapturedPayment
    });
    assert.equal(replayResponse.code, 200);
    assert.deepEqual(replayResponse.body, { received: true, duplicate: true });
    assert.equal((await entitlementRef.get()).data().paymentId, paymentId);
    assert.equal((await db.collection("testSeriesEntitlements")
      .where("uid", "==", uid).where("testId", "==", paidTestId).get()).size, 1);
  } finally {
    await Promise.all([
      orderRef, paymentRef, eventRef, entitlementRef,
      db.doc("testSeriesTests/" + paidTestId)
    ].map(ref => ref.delete().catch(() => {})));
  }
});
