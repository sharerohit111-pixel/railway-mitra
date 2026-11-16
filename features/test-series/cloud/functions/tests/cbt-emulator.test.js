// Point Admin SDK and client SDK test fixtures at local emulators before initialization.
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { initializeApp: initializeClientApp, deleteApp: deleteClientApp } = require("firebase/app");
const { getAuth: getClientAuth, connectAuthEmulator, signInWithCustomToken, signInWithEmailAndPassword, signOut } = require("firebase/auth");
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require("firebase/functions");
const { applyCapturedPayment } = require("../payment-ledger");
const { applyProcessedRefund } = require("../payment-refund-ledger");
const crypto = require("node:crypto");
const { handleRazorpayWebhook } = require("../razorpay-webhook-handler");
const { hasVerifiedPhoneMfa } = require("../owner-auth");
const { studentAnswerStorageKey } = require("../student-question-delivery");
const { addExamAnswerKeyEntry } = require("../exam-answer-key");

const PROJECT = process.env.GCLOUD_PROJECT || "railway-mitra";
const REGION = "asia-south1";
let app, db, uid, studentPhoneNumber, clientApp, clientAuth, functions, claimedAttemptId;
const testId = "emulator-cbt-test";

async function signInAsTestStudent(studentUid) {
  const customToken = await getAuth(app).createCustomToken(studentUid);
  await signInWithCustomToken(clientAuth, customToken);
}

async function callable(name, data = {}) {
  const response = await httpsCallable(functions, name)(data);
  return response.data;
}

async function getEmulatorMfaSmsCode(phoneNumber) {
  const endpoint = `http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/verificationCodes`;
  const normalizePhone = value => String(value || "").replace(/\\D/g, "");
  let lastObserved = [];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error(`Auth emulator SMS-code lookup failed: ${response.status}`);
    const payload = await response.json();
    const codes = payload.verificationCodes || [];
    lastObserved = codes.map(item => ({
      phoneNumber: item.phoneNumber || null,
      fields: Object.keys(item),
      hasSessionCode: typeof item.sessionCode === "string" && Boolean(item.sessionCode)
    }));
    const match = codes.find(item =>
      item.phoneNumber === phoneNumber ||
      normalizePhone(item.phoneNumber) === normalizePhone(phoneNumber)
    );
    const code = match && (match.sessionCode || match.code);
    if (typeof code === "string" && code) return code;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error("Auth emulator did not expose an SMS verification code for the enrolled Owner phone factor; observed=" + JSON.stringify(lastObserved));
}

async function authEmulatorRequest(path, data, { allowError = false } = {}) {
  const response = await fetch(
    `http://127.0.0.1:9099/identitytoolkit.googleapis.com/${path}?key=fake-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }
  );
  const payload = await response.json();
  if (!response.ok && !allowError) {
    throw new Error(`Auth emulator request ${path} failed (${response.status}): ${payload.error?.message || "unknown error"}`);
  }
  return payload;
}

async function callableWithIdToken(name, data, idToken) {
  const response = await fetch(`http://127.0.0.1:5001/${PROJECT}/${REGION}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + idToken
    },
    body: JSON.stringify({ data })
  });
  const payload = await response.json();
  if (!response.ok || payload.error) {
    const status = payload.error?.status || "UNKNOWN";
    const error = new Error(payload.error?.message || `Callable ${name} failed`);
    error.code = "functions/" + status.toLowerCase().replace(/_/g, "-");
    throw error;
  }
  return payload.result ?? payload.data;
}

async function seedPaidAccess({ testId, paymentId, orderId, amount }) {
  const paymentRef = db.doc("testSeriesPayments/" + paymentId);
  const orderRef = db.doc("testSeriesPaymentOrders/" + orderId);
  const entitlementRef = db.doc("testSeriesEntitlements/" + uid + "_" + testId);
  const identity = { uid, testId, paymentId, razorpayOrderId: orderId, amount, currency: "INR" };
  await Promise.all([
    paymentRef.set({ ...identity, status: "captured" }),
    orderRef.set({ ...identity, status: "paid" }),
    entitlementRef.set({ ...identity, status: "active" })
  ]);
  return { paymentRef, orderRef, entitlementRef };
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

  studentPhoneNumber = "+1555" + String(Date.now()).slice(-7);
  const user = await getAuth(app).createUser({ phoneNumber: studentPhoneNumber });
  uid = user.uid;
  await signInAsTestStudent(uid);

  await db.doc("testSeriesConfig/freeTest").set({ enabled: true, testId });
  await db.doc(`testSeriesTests/${testId}`).set({
    title: "Emulator Free Test", status: "published", price: 0, mode: "mock",
    durationMinutes: 30, marksPerQuestion: 2, negativeMarks: 0.5, questionCount: 2,
    sections: [{ name: "Technical Ability", timeLimitMinutes: 1, questionCount: 1 }]
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
      { id: "q1", text: "Question one?", options: ["A", "B"], section: "Technical Ability" },
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


test("student dashboard returns the latest 100 submitted results first", async () => {
  const refs = [
    db.doc("testSeriesResults/emulator-dashboard-old"),
    db.doc("testSeriesResults/emulator-dashboard-middle"),
    db.doc("testSeriesResults/emulator-dashboard-new")
  ];
  const base = Date.now();
  try {
    await Promise.all(refs.map((ref, index) => ref.set({
      uid,
      testId: "emulator-dashboard-test",
      score: index + 1,
      correct: index + 1,
      wrong: 0,
      unattempted: 0,
      totalQuestions: 1,
      submittedAt: new Date(base + index * 1000)
    })));
    const result = await callable("rmGetStudentDashboard");
    const rows = result.results.filter(row => row.attemptId.startsWith("emulator-dashboard-"));
    assert.deepEqual(rows.map(row => row.attemptId), [
      "emulator-dashboard-new",
      "emulator-dashboard-middle",
      "emulator-dashboard-old"
    ]);
    assert.deepEqual(rows.map(row => row.score), [3, 2, 1]);
  } finally {
    await Promise.all(refs.map(ref => ref.delete().catch(() => {})));
  }
});

test("student dashboard never includes another student's result", async () => {
  const ownRef = db.doc("testSeriesResults/emulator-dashboard-private-own");
  const foreignRef = db.doc("testSeriesResults/emulator-dashboard-private-foreign");
  const submittedAt = new Date(Date.now() + 60_000);
  try {
    await Promise.all([
      ownRef.set({
        uid, testId: "emulator-dashboard-private-test",
        score: 8, correct: 8, wrong: 0, unattempted: 0,
        totalQuestions: 8, submittedAt
      }),
      foreignRef.set({
        uid: uid + "-different-student", testId: "emulator-dashboard-private-test",
        score: 100, correct: 100, wrong: 0, unattempted: 0,
        totalQuestions: 100, submittedAt
      })
    ]);
    const result = await callable("rmGetStudentDashboard");
    const ids = result.results.map(row => row.attemptId);
    assert.equal(ids.includes(ownRef.id), true);
    assert.equal(ids.includes(foreignRef.id), false);
  } finally {
    await Promise.all([ownRef.delete(), foreignRef.delete()]);
  }
});


test("student dashboard exposes only the documented safe result fields", async () => {
  const ref = db.doc("testSeriesResults/emulator-dashboard-safe-fields");
  try {
    await ref.set({
      uid,
      testId,
      score: 7,
      correct: 4,
      wrong: 1,
      unattempted: 1,
      totalQuestions: 6,
      timedOut: false,
      submittedAt: new Date(),
      phoneNumber: studentPhoneNumber,
      email: "private@example.invalid",
      answerKey: { q1: "0" },
      answers: { q1: "0" }
    });
    const result = await callable("rmGetStudentDashboard");
    const row = result.results.find(item => item.attemptId === ref.id);
    assert.ok(row);
    assert.deepEqual(Object.keys(row).sort(), [
      "attemptId", "correct", "testId", "testTitle", "score",
      "wrong", "unattempted", "timedOut", "totalQuestions", "submittedAt"
    ].sort());
    assert.equal("uid" in row, false);
    assert.equal("phoneNumber" in row, false);
    assert.equal("email" in row, false);
    assert.equal("answers" in row, false);
    assert.equal("answerKey" in row, false);
  } finally {
    await ref.delete().catch(() => {});
  }
});

test("student dashboard caps its response at the newest 100 results", async () => {
  const refs = Array.from({ length: 105 }, (_, index) =>
    db.doc("testSeriesResults/emulator-dashboard-cap-" + String(index).padStart(3, "0"))
  );
  const base = Date.now();
  try {
    const batch = db.batch();
    refs.forEach((ref, index) => batch.set(ref, {
      uid,
      testId: "emulator-dashboard-cap-test",
      score: index,
      correct: index,
      wrong: 0,
      unattempted: 0,
      totalQuestions: 1,
      submittedAt: new Date(base + index * 1000)
    }));
    await batch.commit();

    const result = await callable("rmGetStudentDashboard");
    const rows = result.results.filter(row => row.attemptId.startsWith("emulator-dashboard-cap-"));
    assert.equal(rows.length, 100);
    assert.equal(rows[0].attemptId, "emulator-dashboard-cap-104");
    assert.equal(rows.at(-1).attemptId, "emulator-dashboard-cap-005");
    assert.equal(rows.some(row => row.attemptId === "emulator-dashboard-cap-004"), false);
  } finally {
    const chunks = [];
    for (let start = 0; start < refs.length; start += 400) chunks.push(refs.slice(start, start + 400));
    await Promise.all(chunks.map(async chunk => {
      const cleanup = db.batch();
      chunk.forEach(ref => cleanup.delete(ref));
      await cleanup.commit().catch(() => {});
    }));
  }
});

test("owner access accepts only a verified phone MFA factor", () => {
  assert.equal(hasVerifiedPhoneMfa({ firebase: { sign_in_second_factor: "phone" } }), true);
  assert.equal(hasVerifiedPhoneMfa({ firebase: { sign_in_second_factor: "totp" } }), false);
  assert.equal(hasVerifiedPhoneMfa({ firebase: { sign_in_second_factor: null } }), false);
  assert.equal(hasVerifiedPhoneMfa({ firebase: {} }), false);
  assert.equal(hasVerifiedPhoneMfa(null), false);
});

test("student accounts cannot overwrite or inspect an existing Owner question bank record", async () => {
  const itemId = "owner-qb-existing-protected";
  const ref = db.doc("testSeriesQuestionBank/" + itemId);
  await ref.set({
    topic: "Civil Engineering", chapter: "Soil Mechanics", folder: "Protected",
    question: { text: "Owner-only question?", options: ["A", "B"], correctIndex: 1 },
    correctIndex: 1, updatedAt: new Date()
  });
  try {
    await assert.rejects(
      callable("rmOwnerSaveQuestionBankItem", {
        itemId, topic: "Attacker", chapter: "Overwrite", folder: "Attempt",
        question: { text: "Overwrite?", options: ["X", "Y"], correctIndex: 0 }
      }),
      error => error.code === "functions/permission-denied"
    );
    const saved = (await ref.get()).data();
    assert.equal(saved.topic, "Civil Engineering");
    assert.equal(saved.question.text, "Owner-only question?");
    await assert.rejects(
      callable("rmOwnerListQuestionBank", { search: "Owner-only question" }),
      error => error.code === "functions/permission-denied"
    );
  } finally {
    await ref.delete();
  }
});

test("student accounts cannot bulk import into the Owner question bank", async () => {
  await assert.rejects(
    callable("rmOwnerBulkSaveQuestionBank", { items: [{
      topic: "Civil", chapter: "Soil", folder: "Practice",
      question: { text: "Question?", options: ["A", "B"], correctIndex: 0 }
    }] }),
    error => error.code === "functions/permission-denied"
  );
});

test("student accounts cannot delete from the Owner question bank", async () => {
  await assert.rejects(
    callable("rmOwnerDeleteQuestionBankItem", { itemId: "question-bank-item" }),
    error => error.code === "functions/permission-denied"
  );
});

test("student accounts cannot search or filter the Owner question bank", async () => {
  await assert.rejects(
    callable("rmOwnerListQuestionBank", {
      pageSize: 25, topic: "Civil Engineering", chapter: "Soil Mechanics",
      folder: "JE/Practice", search: "bearing capacity"
    }),
    error => error.code === "functions/permission-denied"
  );
});

test("student accounts cannot list the Owner question bank", async () => {
  await assert.rejects(
    callable("rmOwnerListQuestionBank"),
    error => error.code === "functions/permission-denied"
  );
});

test("student accounts cannot write to the Owner question bank", async () => {
  await assert.rejects(
    callable("rmOwnerSaveQuestionBankItem", {
      topic: "Civil", chapter: "Soil", folder: "Practice",
      question: { text: "Question?", options: ["A", "B"], correctIndex: 0 }
    }),
    error => error.code === "functions/permission-denied"
  );
});

test("student accounts cannot call Owner result analytics", async () => {
  await assert.rejects(
    callable("rmOwnerGetResultAnalytics"),
    error => error.code === "functions/permission-denied"
  );
});

test("student accounts cannot call the Owner student activity report", async () => {
  await assert.rejects(
    callable("rmOwnerListStudentActivity"),
    error => error.code === "functions/permission-denied"
  );
});

test("CBT rejects a persisted question whose section has no canonical test configuration", async () => {
  const malformedTestId = "emulator-section-map-mismatch";
  const attemptId = "emulator-section-map-attempt";
  const testRef = db.doc("testSeriesTests/" + malformedTestId);
  const paperRef = db.doc("testSeriesQuestionSets/" + malformedTestId);
  const attemptRef = db.doc("testSeriesAttempts/" + attemptId);

  await testRef.set({
    title: "Malformed Section Map", status: "published", price: 0,
    mode: "mock", durationMinutes: 10,
    sections: [{ name: "Technical Ability", timeLimitMinutes: 5, questionCount: 1 }]
  });
  await paperRef.set({
    questions: [
      {
        id: "q1", text: "Section mapping check?", options: ["A", "B"],
        section: "General Ability"
      },
      { id: "q2", text: "Unsectioned answer must also fail?", options: ["A", "B"] }
    ]
  });
  await attemptRef.set({
    uid, testId: malformedTestId, status: "in_progress",
    startedAt: new Date(), expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    answers: {}
  });

  try {
    await assert.rejects(
      callable("rmGetExamQuestions", { attemptId }),
      error => error.code === "functions/failed-precondition"
    );
    await assert.rejects(
      callable("rmEnterCbtSection", { attemptId, section: "General Ability" }),
      error => error.code === "functions/failed-precondition"
    );
    await assert.rejects(
      callable("rmSaveAnswer", { attemptId, questionId: "q1", answer: "0" }),
      error => error.code === "functions/failed-precondition"
    );
    await assert.rejects(
      callable("rmSaveAnswer", { attemptId, questionId: "q2", answer: "0" }),
      error => error.code === "functions/failed-precondition"
    );
    const savedAttempt = (await attemptRef.get()).data();
    assert.equal(savedAttempt.answers.q1, undefined);
    assert.equal(savedAttempt.answers.q2, undefined);
  } finally {
    await attemptRef.delete();
    await paperRef.delete();
    await testRef.delete();
  }
});

test("exam question delivery allowlists student-safe question fields", async () => {
  const privateTestId = "emulator-question-safe-projection";
  const attemptId = "emulator-question-safe-projection-attempt";
  const testRef = db.doc("testSeriesTests/" + privateTestId);
  const paperRef = db.doc("testSeriesQuestionSets/" + privateTestId);
  const attemptRef = db.doc("testSeriesAttempts/" + attemptId);
  try {
    await testRef.set({
      title: "Safe Projection", status: "published", price: 0,
      mode: "mock", durationMinutes: 20, questionCount: 1
    });
    await paperRef.set({ questions: [{
      id: "safe-q1", text: "Which option?", options: ["A", "B"],
      correctIndex: 1, correctAnswer: "1", explanation: "Private explanation",
      ownerNote: "Internal note", tags: ["private"]
    }] });
    await attemptRef.set({
      uid, testId: privateTestId, status: "in_progress",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), answers: { "safe-q1": "1" }
    });

    const paper = await callable("rmGetExamQuestions", { attemptId });
    assert.deepEqual(paper.questions[0], {
      id: "safe-q1", text: "Which option?", options: ["A", "B"]
    });
    assert.deepEqual(paper.savedAnswers, { "safe-q1": "1" });
    for (const field of ["correctIndex", "correctAnswer", "explanation", "ownerNote", "tags"]) {
      assert.equal(Object.hasOwn(paper.questions[0], field), false, field + " must not be exposed");
    }
  } finally {
    await Promise.all([testRef, paperRef, attemptRef].map(ref => ref.delete().catch(() => {})));
  }
});

test("exam question delivery rejects unknown or malformed persisted saved-answer fields", async () => {
  const privateTestId = "emulator-question-invalid-saved-answers";
  const attemptId = "emulator-question-invalid-saved-answers-attempt";
  const testRef = db.doc("testSeriesTests/" + privateTestId);
  const paperRef = db.doc("testSeriesQuestionSets/" + privateTestId);
  const attemptRef = db.doc("testSeriesAttempts/" + attemptId);
  try {
    await testRef.set({
      title: "Invalid Saved Answers", status: "published", price: 0,
      mode: "mock", durationMinutes: 20, questionCount: 1
    });
    await paperRef.set({ questions: [{
      id: "saved-q1", text: "Which option?", options: ["A", "B"]
    }] });
    await attemptRef.set({
      uid, testId: privateTestId, status: "in_progress",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      answers: { "saved-q1": "1", privateNote: "must-not-be-forwarded" }
    });

    await assert.rejects(
      callable("rmGetExamQuestions", { attemptId }),
      error => error.code === "functions/failed-precondition"
    );
  } finally {
    await Promise.all([testRef, paperRef, attemptRef].map(ref => ref.delete().catch(() => {})));
  }
});

test("exam question delivery rejects nested option payloads instead of forwarding private metadata", async () => {
  const privateTestId = "emulator-question-option-payload-rejected";
  const attemptId = "emulator-question-option-payload-attempt";
  const testRef = db.doc("testSeriesTests/" + privateTestId);
  const paperRef = db.doc("testSeriesQuestionSets/" + privateTestId);
  const attemptRef = db.doc("testSeriesAttempts/" + attemptId);
  try {
    await testRef.set({ title: "Malformed Option", status: "published", price: 0, mode: "mock", durationMinutes: 20 });
    await paperRef.set({ questions: [{
      id: "unsafe-q1", text: "Which option?",
      options: ["Safe choice", { label: "Private choice", correctAnswer: "1", explanation: "must not leak" }],
      correctIndex: 1
    }] });
    await attemptRef.set({
      uid, testId: privateTestId, status: "in_progress",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), answers: {}
    });

    await assert.rejects(
      callable("rmGetExamQuestions", { attemptId }),
      error => error.code === "functions/failed-precondition"
    );
  } finally {
    await Promise.all([testRef, paperRef, attemptRef].map(ref => ref.delete().catch(() => {})));
  }
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

test("student catalogue marks a paid test unlocked only when all payment ledgers match", async () => {
  const paidTestId = "emulator-catalogue-paid-unlock";
  const testRef = db.doc("testSeriesTests/" + paidTestId);
  const entitlementRef = db.doc("testSeriesEntitlements/" + uid + "_" + paidTestId);
  let paidAccess = null;
  try {
    await testRef.set({ title: "Paid Catalogue Test", status: "published", price: 25, mode: "mock", durationMinutes: 10 });
    const before = await callable("rmListAvailableTests");
    assert.equal(before.tests.find(item => item.testId === paidTestId).accessType, "paid");

    // An active entitlement without its captured payment and paid order is not an unlock.
    await entitlementRef.set({
      uid, testId: paidTestId, status: "active",
      paymentId: "pay_catalogue_verified", razorpayOrderId: "order_catalogue_verified",
      amount: 2500, currency: "INR"
    });
    const orphaned = await callable("rmListAvailableTests");
    assert.equal(orphaned.tests.find(item => item.testId === paidTestId).accessType, "paid");

    paidAccess = await seedPaidAccess({
      testId: paidTestId, paymentId: "pay_catalogue_verified",
      orderId: "order_catalogue_verified", amount: 2500
    });
    const verified = await callable("rmListAvailableTests");
    assert.equal(verified.tests.find(item => item.testId === paidTestId).accessType, "unlocked");

    // A later refund or ledger drift must remove the catalogue's unlock hint.
    await paidAccess.paymentRef.update({ status: "refunded" });
    const refunded = await callable("rmListAvailableTests");
    assert.equal(refunded.tests.find(item => item.testId === paidTestId).accessType, "paid");

    await paidAccess.paymentRef.update({ status: "captured" });
    await paidAccess.orderRef.update({ amount: 2501 });
    const mismatched = await callable("rmListAvailableTests");
    assert.equal(mismatched.tests.find(item => item.testId === paidTestId).accessType, "paid");
  } finally {
    const cleanup = [entitlementRef.delete().catch(() => {}), testRef.delete().catch(() => {})];
    if (paidAccess) {
      cleanup.push(
        paidAccess.paymentRef.delete().catch(() => {}),
        paidAccess.orderRef.delete().catch(() => {}),
        paidAccess.entitlementRef.delete().catch(() => {})
      );
    }
    await Promise.all(cleanup);
  }
});

test("an unconfigured zero-price test is not advertised as the free trial or startable", async () => {
  const zeroPriceTestId = "emulator-unconfigured-zero-price";
  const testRef = db.doc("testSeriesTests/" + zeroPriceTestId);
  try {
    await testRef.set({
      title: "Unconfigured Zero Price", status: "published", price: 0,
      mode: "mock", durationMinutes: 10, questionCount: 1
    });
    const catalogue = await callable("rmListAvailableTests");
    const listed = catalogue.tests.find(item => item.testId === zeroPriceTestId);
    assert.ok(listed);
    assert.equal(listed.accessType, "unavailable");
    await assert.rejects(
      callable("rmStartExam", { testId: zeroPriceTestId }),
      error => error.code === "functions/permission-denied"
    );
  } finally {
    await testRef.delete().catch(() => {});
  }
});

test("real emulator phone OTP sign-in can access the student CBT catalogue", async () => {
  const runId = String(Date.now());
  const phoneNumber = "+1666" + runId.slice(-7);
  const catalogueTestId = "phone-otp-catalogue-" + runId;
  const paymentId = "phoneotp-payment-" + runId;
  const orderId = "phoneotp-order-" + runId;
  const testRef = db.doc("testSeriesTests/" + catalogueTestId);
  const questionSetRef = db.doc("testSeriesQuestionSets/" + catalogueTestId);
  const answerKeyRef = db.doc("testSeriesAnswerKeys/" + catalogueTestId);
  let createdUid = null;
  let attemptId = null;

  try {
    await testRef.set({
      title: "Phone OTP end-to-end exam test",
      status: "published",
      price: 5,
      mode: "mock",
      durationMinutes: 10,
      marksPerQuestion: 1,
      negativeMarks: 1 / 3,
      questionCount: 3
    });
    await questionSetRef.set({
      questions: [
        { id: "otp-q1", text: "Emulator question one?", options: ["A", "B"] },
        { id: "otp-q2", text: "Emulator question two?", options: ["A", "B"] },
        { id: "otp-q3", text: "Emulator question three?", options: ["A", "B"] }
      ]
    });
    await answerKeyRef.set({
      questions: {
        "otp-q1": { correctAnswer: "1" },
        "otp-q2": { correctAnswer: "1" },
        "otp-q3": { correctAnswer: "0" }
      }
    });
    const verification = await authEmulatorRequest("v1/accounts:sendVerificationCode", {
      phoneNumber,
      recaptchaToken: "emulator-test"
    });
    assert.ok(verification.sessionInfo, "Auth Emulator must start a phone verification session");

    const smsCode = await getEmulatorMfaSmsCode(phoneNumber);
    const signedIn = await authEmulatorRequest("v1/accounts:signInWithPhoneNumber", {
      sessionInfo: verification.sessionInfo,
      code: smsCode
    });
    assert.ok(signedIn.idToken, "phone OTP confirmation must issue an ID token");
    assert.ok(signedIn.localId, "phone OTP confirmation must identify the student account");
    createdUid = signedIn.localId;

    const tokenClaims = JSON.parse(Buffer.from(signedIn.idToken.split(".")[1], "base64url").toString("utf8"));
    assert.equal(tokenClaims.sub, createdUid);
    assert.equal(tokenClaims.firebase?.sign_in_provider, "phone");
    assert.equal(tokenClaims.phone_number, phoneNumber);

    const catalogue = await callableWithIdToken(
      "rmListAvailableTests",
      { pageSize: 10 },
      signedIn.idToken
    );
    assert.ok(Array.isArray(catalogue.tests));
    assert.ok(catalogue.tests.some(item => item.testId === catalogueTestId),
      "a phone-OTP-authenticated student must see the published catalogue entry");

    // Synthetic paid ledger: exercise the real entitlement checks without a live payment.
    await Promise.all([
      db.doc("testSeriesPayments/" + paymentId).set({
        uid: createdUid, testId: catalogueTestId, paymentId, razorpayOrderId: orderId,
        amount: 500, currency: "INR", status: "captured", amountRefunded: 0
      }),
      db.doc("testSeriesPaymentOrders/" + orderId).set({
        uid: createdUid, testId: catalogueTestId, paymentId, razorpayOrderId: orderId,
        amount: 500, currency: "INR", status: "paid"
      }),
      db.doc("testSeriesEntitlements/" + createdUid + "_" + catalogueTestId).set({
        uid: createdUid, testId: catalogueTestId, paymentId, razorpayOrderId: orderId,
        amount: 500, currency: "INR", status: "active"
      })
    ]);

    const started = await callableWithIdToken("rmStartExam", { testId: catalogueTestId }, signedIn.idToken);
    assert.ok(started.attemptId);
    assert.equal(started.resumed, false);
    attemptId = started.attemptId;

    const paper = await callableWithIdToken("rmGetExamQuestions", { attemptId }, signedIn.idToken);
    assert.equal(paper.questions.length, 3);
    assert.equal(paper.questions[0].correctAnswer, undefined, "student question payload must not disclose answer keys");

    const correctSave = await callableWithIdToken("rmSaveAnswer",
      { attemptId, questionId: "otp-q1", answer: "1" }, signedIn.idToken);
    assert.equal(correctSave.saved, true);
    const wrongSave = await callableWithIdToken("rmSaveAnswer",
      { attemptId, questionId: "otp-q2", answer: "0" }, signedIn.idToken);
    assert.equal(wrongSave.saved, true);

    const resumed = await callableWithIdToken("rmStartExam", { testId: catalogueTestId }, signedIn.idToken);
    assert.equal(resumed.attemptId, attemptId);
    assert.equal(resumed.resumed, true);

    const recovered = await callableWithIdToken("rmGetExamQuestions", { attemptId }, signedIn.idToken);
    assert.equal(recovered.savedAnswers["otp-q1"], "1", "saved response must survive resume");
    assert.equal(recovered.savedAnswers["otp-q2"], "0", "second saved response must survive resume");

    const submitted = await callableWithIdToken("rmSubmitExam", { attemptId }, signedIn.idToken);
    assert.equal(submitted.submitted, true);
    assert.equal(submitted.correct, 1);
    assert.equal(submitted.wrong, 1);
    assert.equal(submitted.unattempted, 1);
    assert.ok(Math.abs(submitted.score - (2 / 3)) < 1e-10,
      "server scoring must apply one-third negative marking");

    const result = await callableWithIdToken("rmGetCbtAttemptResult", { attemptId }, signedIn.idToken);
    assert.equal(result.correct, 1);
    assert.ok(Math.abs(result.score - (2 / 3)) < 1e-10);

    const dashboard = await callableWithIdToken("rmGetStudentDashboard", {}, signedIn.idToken);
    assert.ok(dashboard.results.some(item =>
      item.attemptId === attemptId && item.testId === catalogueTestId && Math.abs(item.score - (2 / 3)) < 1e-10));  } finally {
    await Promise.all([
      testRef.delete().catch(() => {}),
      questionSetRef.delete().catch(() => {}),
      answerKeyRef.delete().catch(() => {})
    ]);
    if (createdUid) {
      await Promise.all([
        db.doc("testSeriesPayments/" + paymentId).delete().catch(() => {}),
        db.doc("testSeriesPaymentOrders/" + orderId).delete().catch(() => {}),
        db.doc("testSeriesEntitlements/" + createdUid + "_" + catalogueTestId).delete().catch(() => {}),
        db.doc("testSeriesActiveSessions/" + createdUid).delete().catch(() => {}),
        attemptId ? db.doc("testSeriesAttempts/" + attemptId).delete().catch(() => {}) : Promise.resolve(),
        attemptId ? db.doc("testSeriesResults/" + attemptId).delete().catch(() => {}) : Promise.resolve(),
        getAuth(app).deleteUser(createdUid).catch(() => {})
      ]);
    }
    await signOut(clientAuth).catch(() => {});
    await signInAsTestStudent(uid).catch(() => {});
  }
});

test("email/password sessions cannot access student CBT callables", async () => {
  const email = "non-phone-" + Date.now() + "@example.test";
  const password = "Emulator-Test-Password-123!";
  const nonPhoneUser = await getAuth(app).createUser({ email, password });
  try {
    await signOut(clientAuth);
    await signInWithEmailAndPassword(clientAuth, email, password);
    await assert.rejects(
      callable("rmListAvailableTests"),
      error => error.code === "functions/permission-denied"
    );
    await assert.rejects(
      callable("rmClaimFreeAttempt"),
      error => error.code === "functions/permission-denied"
    );
  } finally {
    await signOut(clientAuth);
    await signInAsTestStudent(uid);
    await getAuth(app).deleteUser(nonPhoneUser.uid).catch(() => {});
  }
});

test("student can claim one free test attempt only once", async () => {
  const claim = await callable("rmClaimFreeAttempt");
  assert.equal(claim.testId, testId);
  assert.ok(claim.attemptId);
  claimedAttemptId = claim.attemptId;
  const lockedConfig = (await db.doc("testSeriesConfig/freeTest").get()).data();
  assert.equal(lockedConfig.hasClaims, true);
  assert.ok(lockedConfig.firstClaimAt);
  await assert.rejects(
    callable("rmClaimFreeAttempt"),
    error => error.code === "functions/already-exists" || /already claimed/i.test(error.message)
  );
  assert.equal(
    (await db.doc("testSeriesConfig/freeTest").get()).data().hasClaims,
    true,
    "a rejected duplicate claim must not clear or alter the free-test lock"
  );

  const firstClaimAtMillis = lockedConfig.firstClaimAt.toMillis();
  const secondStudentPhone = "+1555" + String(Date.now() + 12345).slice(-7);
  const secondStudent = await getAuth(app).createUser({ phoneNumber: secondStudentPhone });
  let secondClaim = null;
  try {
    await signOut(clientAuth);
    await signInAsTestStudent(secondStudent.uid);
    secondClaim = await callable("rmClaimFreeAttempt");
    assert.ok(secondClaim.attemptId);
    const laterConfig = (await db.doc("testSeriesConfig/freeTest").get()).data();
    assert.equal(laterConfig.hasClaims, true);
    assert.equal(laterConfig.firstClaimAt.toMillis(), firstClaimAtMillis,
      "later student claims must not rewrite the first-claim timestamp");
  } finally {
    if (secondClaim && secondClaim.attemptId) {
      await db.doc("testSeriesAttempts/" + secondClaim.attemptId).delete().catch(() => {});
    }
    await db.doc("testSeriesFreeAttempts/" + secondStudent.uid).delete().catch(() => {});
    await signOut(clientAuth);
    await signInAsTestStudent(uid);
    await getAuth(app).deleteUser(secondStudent.uid).catch(() => {});
  }

  // Two simultaneous claim requests from one fresh student must create one claim only.
  const concurrentPhone = "+1555" + String(Date.now() + 24680).slice(-7);
  const concurrentStudent = await getAuth(app).createUser({ phoneNumber: concurrentPhone });
  let concurrentClaim = null;
  try {
    await signOut(clientAuth);
    await signInAsTestStudent(concurrentStudent.uid);
    const outcomes = await Promise.allSettled([
      callable("rmClaimFreeAttempt"),
      callable("rmClaimFreeAttempt")
    ]);
    const fulfilled = outcomes.filter(item => item.status === "fulfilled");
    const rejected = outcomes.filter(item => item.status === "rejected");
    assert.equal(fulfilled.length, 1, "exactly one concurrent free claim must succeed");
    assert.equal(rejected.length, 1, "the duplicate concurrent claim must be rejected");
    assert.equal(rejected[0].reason.code, "functions/already-exists");
    concurrentClaim = fulfilled[0].value;
    const storedClaim = (await db.doc("testSeriesFreeAttempts/" + concurrentStudent.uid).get()).data();
    assert.equal(storedClaim.attemptId, concurrentClaim.attemptId);
    assert.equal(
      (await db.collection("testSeriesAttempts").where("uid", "==", concurrentStudent.uid).get()).size,
      1,
      "concurrent claim requests must create exactly one attempt"
    );
  } finally {
    if (concurrentClaim?.attemptId) {
      await db.doc("testSeriesAttempts/" + concurrentClaim.attemptId).delete().catch(() => {});
    }
    await db.doc("testSeriesFreeAttempts/" + concurrentStudent.uid).delete().catch(() => {});
    await signOut(clientAuth);
    await signInAsTestStudent(uid);
    await getAuth(app).deleteUser(concurrentStudent.uid).catch(() => {});
  }
});

test("submission fails closed when persisted scoring configuration is invalid", async () => {
  const invalidTestId = "emulator-invalid-scoring-config";
  const attemptId = "emulator-invalid-scoring-attempt";
  const testRef = db.doc("testSeriesTests/" + invalidTestId);
  const keyRef = db.doc("testSeriesAnswerKeys/" + invalidTestId);
  const attemptRef = db.doc("testSeriesAttempts/" + attemptId);
  const resultRef = db.doc("testSeriesResults/" + attemptId);

  try {
    await testRef.set({
      title: "Invalid Scoring Configuration",
      status: "published",
      marksPerQuestion: 0,
      negativeMarks: 0
    });
    await keyRef.set({ questions: { q1: { correctAnswer: "0" } } });
    await attemptRef.set({
      uid,
      testId: invalidTestId,
      status: "in_progress",
      startedAt: new Date(Date.now() - 60_000),
      expiresAt: new Date(Date.now() - 1_000),
      answers: { q1: "0" }
    });

    await assert.rejects(
      callable("rmSubmitExam", { attemptId }),
      error => error.code === "functions/failed-precondition"
    );

    const persistedAttempt = (await attemptRef.get()).data();
    assert.equal(persistedAttempt.status, "in_progress",
      "invalid scoring must not finalize the attempt");
    assert.equal((await resultRef.get()).exists, false,
      "invalid scoring must not create a student result");
  } finally {
    await Promise.all([testRef, keyRef, attemptRef, resultRef].map(ref => ref.delete().catch(() => {})));
  }
});

test("submission fails closed when the persisted answer key does not match the question paper", async () => {
  const cases = [
    { suffix: "missing", answerQuestions: { q1: { correctAnswer: "0" } } },
    {
      suffix: "extra",
      answerQuestions: {
        q1: { correctAnswer: "0" },
        q2: { correctAnswer: "1" },
        q3: { correctAnswer: "0" }
      }
    },
    {
      suffix: "out-of-range",
      answerQuestions: {
        q1: { correctAnswer: "2" },
        q2: { correctAnswer: "1" }
      }
    }
  ];

  for (const scenario of cases) {
    const testId = "emulator-answer-key-" + scenario.suffix;
    const attemptId = "emulator-answer-key-attempt-" + scenario.suffix;
    const testRef = db.doc("testSeriesTests/" + testId);
    const paperRef = db.doc("testSeriesQuestionSets/" + testId);
    const keyRef = db.doc("testSeriesAnswerKeys/" + testId);
    const attemptRef = db.doc("testSeriesAttempts/" + attemptId);
    const resultRef = db.doc("testSeriesResults/" + attemptId);

    try {
      await testRef.set({
        title: "Answer Key Integrity",
        status: "published",
        price: 0,
        marksPerQuestion: 2,
        negativeMarks: 0.5
      });
      await paperRef.set({
        questions: [
          { id: "q1", text: "Question one?", options: ["A", "B"] },
          { id: "q2", text: "Question two?", options: ["A", "B", "C"] }
        ]
      });
      await keyRef.set({ questions: scenario.answerQuestions });
      await attemptRef.set({
        uid,
        testId,
        status: "in_progress",
        startedAt: new Date(Date.now() - 60_000),
        expiresAt: new Date(Date.now() - 1_000),
        answers: { q1: "0" }
      });

      await assert.rejects(
        callable("rmSubmitExam", { attemptId }),
        error => error.code === "functions/failed-precondition"
      );
      assert.equal((await attemptRef.get()).data().status, "in_progress",
        "an inconsistent answer key must not finalize the attempt");
      assert.equal((await resultRef.get()).exists, false,
        "an inconsistent answer key must not create a result record");
    } finally {
      await Promise.all([testRef, paperRef, keyRef, attemptRef, resultRef].map(ref => ref.delete().catch(() => {})));
    }
  }
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

  // A stale browser-local attempt ID is rejected, while the authenticated
  // server active-session pointer still identifies the student's real attempt.
  await assert.rejects(
    callable("rmGetCbtAttemptResult", { attemptId: "stale-client-local-attempt" }),
    error => error.code === "functions/permission-denied" && error.message.includes("Attempt not found")
  );
  const authoritativeRecovery = await callable("rmGetStudentActiveAttempt", { testId });
  assert.equal(authoritativeRecovery.found, true);
  assert.equal(authoritativeRecovery.attemptId, started.attemptId);
  assert.equal(authoritativeRecovery.status, "in_progress");

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

  // A valid paid ledger must pass entitlement verification before the active-session guard.
  const paidTestId = "emulator-paid-concurrent-test";
  await db.doc("testSeriesTests/" + paidTestId).set({
    title: "Paid Concurrent Test", status: "published", price: 50,
    mode: "mock", durationMinutes: 10, questionCount: 1
  });
  let paidAccess;
  try {
    paidAccess = await seedPaidAccess({
      testId: paidTestId, paymentId: "pay_paid_concurrent",
      orderId: "order_paid_concurrent", amount: 5000
    });
    const validEntitlement = (await paidAccess.entitlementRef.get()).data();
    await paidAccess.entitlementRef.set({ ...validEntitlement, uid: "different-student-uid" });
    await assert.rejects(
      callable("rmStartExam", { testId: paidTestId }),
      error => error.code === "functions/permission-denied"
    );

    await paidAccess.entitlementRef.set({ ...validEntitlement, testId: "different-paid-test" });
    await assert.rejects(
      callable("rmStartExam", { testId: paidTestId }),
      error => error.code === "functions/permission-denied"
    );

    await paidAccess.entitlementRef.set(validEntitlement);
    await assert.rejects(
      callable("rmStartExam", { testId: paidTestId }),
      error => error.code === "functions/already-exists"
    );
  } finally {
    await db.doc("testSeriesTests/" + paidTestId).delete();
    if (paidAccess) {
      await Promise.all([
        paidAccess.paymentRef.delete().catch(() => {}),
        paidAccess.orderRef.delete().catch(() => {}),
        paidAccess.entitlementRef.delete().catch(() => {})
      ]);
    }
  }

  const paper = await callable("rmGetExamQuestions", { attemptId: started.attemptId });
  assert.equal(paper.questions.length, 2);
  assert.equal(paper.questions[0].id, "q1");
  assert.equal(paper.questions[0].section, "Technical Ability");
  assert.equal(Object.hasOwn(paper.questions[0], "correctAnswer"), false);
  assert.equal(Object.hasOwn(paper.questions[0], "correctIndex"), false);
  assert.ok(paper.expiresAt);

  // A timed section cannot accept an answer before its server timer has started.
  await assert.rejects(
    callable("rmSaveAnswer", { attemptId: started.attemptId, questionId: "q1", answer: "0" }),
    error => error.code === "functions/deadline-exceeded",
    "timed-section answers must be blocked until the student enters that section"
  );

  // Concurrent entry requests must establish one shared deadline, never restart it.
  const sectionEntries = await Promise.all([
    callable("rmEnterCbtSection", { attemptId: started.attemptId, section: "Technical Ability" }),
    callable("rmEnterCbtSection", { attemptId: started.attemptId, section: "Technical Ability" })
  ]);
  const sectionStart = sectionEntries[0];
  assert.equal(sectionStart.section, "Technical Ability");
  assert.equal(sectionStart.timeLimitMinutes, 1);
  assert.ok(sectionStart.expiresAt);
  assert.equal(sectionEntries[1].expiresAt, sectionStart.expiresAt);
  const sectionResume = await callable("rmEnterCbtSection", {
    attemptId: started.attemptId, section: "Technical Ability"
  });
  assert.equal(sectionResume.resumed, true);
  assert.equal(sectionResume.expiresAt, sectionStart.expiresAt);
  const resumedPaper = await callable("rmGetExamQuestions", { attemptId: started.attemptId });
  assert.equal(resumedPaper.sectionTimings["Technical Ability"].expiresAt, sectionStart.expiresAt);
  assert.ok(resumedPaper.sectionTimings["Technical Ability"].startedAt);
  await assert.rejects(
    callable("rmEnterCbtSection", { attemptId: started.attemptId, section: "Not a section" }),
    error => error.code === "functions/not-found"
  );

  await assert.rejects(
    callable("rmSaveAnswer", { attemptId: started.attemptId, questionId: "q1", answer: "9" }),
    error => error.code === "functions/invalid-argument"
  );
  await assert.rejects(
    callable("rmSaveAnswer", { attemptId: started.attemptId, questionId: "not-in-paper", answer: "0" }),
    error => error.code === "functions/invalid-argument"
  );
  for (const nonCanonicalAnswer of ["00", "01", 1]) {
    await assert.rejects(
      callable("rmSaveAnswer", {
        attemptId: started.attemptId,
        questionId: "q1",
        answer: nonCanonicalAnswer
      }),
      error => error.code === "functions/invalid-argument",
      "non-canonical option indexes must be rejected before persistence"
    );
  }
  assert.equal(
    (await db.doc("testSeriesAttempts/" + started.attemptId).get()).data().answers.q1,
    undefined,
    "rejected answer indexes must not create a saved answer"
  );
  const saved = await callable("rmSaveAnswer", {
    attemptId: started.attemptId, questionId: "q1", answer: "0"
  });
  assert.equal(saved.saved, true);
  // Retrying the same answer is idempotent; a later changed selection replaces it.
  const duplicateSave = await callable("rmSaveAnswer", {
    attemptId: started.attemptId, questionId: "q1", answer: "0"
  });
  assert.equal(duplicateSave.saved, true);
  assert.equal((await db.doc("testSeriesAttempts/" + started.attemptId).get()).data().answers.q1, "0");
  const changedSave = await callable("rmSaveAnswer", {
    attemptId: started.attemptId, questionId: "q1", answer: "1"
  });
  assert.equal(changedSave.saved, true);
  assert.equal((await db.doc("testSeriesAttempts/" + started.attemptId).get()).data().answers.q1, "1");
  // Restore the correct option so the later server-scoring assertions remain meaningful.
  await callable("rmSaveAnswer", {
    attemptId: started.attemptId, questionId: "q1", answer: "0"
  });

  // Section deadlines are enforced independently of the overall exam deadline.
  await db.doc("testSeriesAttempts/" + started.attemptId).update({
    ["sectionTimings.Technical Ability.expiresAt"]: new Date(Date.now() - 1000)
  });
  await assert.rejects(
    callable("rmSaveAnswer", { attemptId: started.attemptId, questionId: "q1", answer: "1" }),
    error => error.code === "functions/deadline-exceeded"
  );
  await assert.rejects(
    callable("rmEnterCbtSection", { attemptId: started.attemptId, section: "Technical Ability" }),
    error => error.code === "functions/deadline-exceeded",
    "an expired section must not be reopened or receive a fresh timer"
  );

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

  // Missing/invalid server deadlines must never turn into an indefinitely writable
  // attempt or a non-timeout submission.
  await db.doc("testSeriesAttempts/" + started.attemptId).update({ expiresAt: null });
  await assert.rejects(
    callable("rmSaveAnswer", { attemptId: started.attemptId, questionId: "q2", answer: "1" }),
    error => error.code === "functions/failed-precondition"
  );
  await assert.rejects(
    callable("rmSubmitExam", { attemptId: started.attemptId }),
    error => error.code === "functions/failed-precondition"
  );
  await db.doc("testSeriesAttempts/" + started.attemptId).update({
    expiresAt: new Date(Date.now() - 1000)
  });

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
    callable("rmStartExam", { testId }),
    error => error.code === "functions/already-exists",
    "a submitted one-time free attempt must never be returned as a resumable exam"
  );
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
    wrong: 0, unattempted: 0, totalQuestions: 99, submittedAt: new Date(Date.now() + 3000)
  });
  const dashboard = await callable("rmGetStudentDashboard");
  assert.equal(dashboard.resultCount, 1);
  assert.equal(dashboard.results[0].attemptId, started.attemptId);
  assert.equal(dashboard.results[0].testTitle, "Emulator Free Test");
  assert.equal(dashboard.results[0].timedOut, true, "dashboard must preserve the server timeout flag");
  assert.equal(dashboard.results.some(item => item.score === 999), false);
  await db.doc("testSeriesResults/leaderboard-higher-score").set({
    uid: "private-student-uid-1", testId, score: 4, correct: 2,
    wrong: 0, unattempted: 0, totalQuestions: 2, submittedAt: new Date(Date.now() + 2000)
  });
  await db.doc("testSeriesResults/leaderboard-tied-score").set({
    uid: "private-student-uid-2", testId, score: 2, correct: 1,
    wrong: 0, unattempted: 1, totalQuestions: 2, submittedAt: new Date(Date.now() + 4000)
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

test("leaderboard count, personal rank and top 20 remain exact beyond 1000 submitted attempts", async () => {
  const scaleTestId = "emulator-leaderboard-over-1000";
  const testRef = db.doc("testSeriesTests/" + scaleTestId);
  const base = Date.now();
  const records = [];
  for (let i = 0; i < 1025; i += 1) {
    records.push({
      id: "emulator-lb-scale-" + i,
      uid: i === 0 ? uid : "scale-student-" + i,
      testId: scaleTestId,
      score: i === 0 ? 50 : (i * 37) % 101,
      correct: 0,
      wrong: 0,
      unattempted: 0,
      totalQuestions: 100,
      submittedAt: new Date(base + i * 1000)
    });
  }
  // A student's personal rank is based on their best attempt, while the public
  // top-20 list continues to represent submitted attempts (legacy contract).
  records.push({
    id: "emulator-lb-scale-my-lower-attempt",
    uid,
    testId: scaleTestId,
    score: 40,
    correct: 0,
    wrong: 0,
    unattempted: 0,
    totalQuestions: 100,
    submittedAt: new Date(base + 2000000)
  });
  try {
    await testRef.set({
      title: "Leaderboard Scale Regression",
      status: "published",
      price: 0,
      mode: "mock",
      durationMinutes: 30,
      questionCount: 100
    });
    for (let offset = 0; offset < records.length; offset += 400) {
      const batch = db.batch();
      records.slice(offset, offset + 400).forEach(row => {
        const { id: documentId, ...data } = row;
        batch.set(db.doc("testSeriesResults/" + documentId), data);
      });
      await batch.commit();
    }

    const result = await callable("rmGetTestLeaderboard", { testId: scaleTestId });
    const expectedHigher = records.filter(row => row.score > 50).length;
    const expectedTop = [...records].sort((a, b) => b.score - a.score || a.submittedAt - b.submittedAt).slice(0, 20);
    let expectedRank = 0, previousScore = null;
    const expected = expectedTop.map((row, index) => {
      if (index === 0 || row.score !== previousScore) expectedRank = index + 1;
      previousScore = row.score;
      return { rank: expectedRank, score: row.score };
    });

    assert.equal(result.participantCount, records.length);
    assert.equal(result.leaderboardComplete, true);
    assert.equal(result.myScore, 50, "personal rank must use the student's best attempt");
    assert.equal(result.myRank, expectedHigher + 1, "rank must count every higher score, not a 1000-row sample");
    assert.equal(result.top.length, 20);
    assert.deepEqual(result.top.map(({ rank, score }) => ({ rank, score })), expected);
    assert.equal(Object.hasOwn(result.top[0], "uid"), false);
    assert.equal(Object.hasOwn(result.top[0], "attemptId"), false);
  } finally {
    for (let offset = 0; offset < records.length; offset += 400) {
      const batch = db.batch();
      records.slice(offset, offset + 400).forEach(row => batch.delete(db.doc("testSeriesResults/" + row.id)));
      await batch.commit();
    }
    await testRef.delete().catch(() => {});
  }
});

test("concurrent CBT start, answer-save and submit transactions preserve one authoritative attempt and result", async () => {
  const concurrentTestId = "emulator-cbt-concurrency";
  const attemptRefPrefix = "testSeriesAttempts/";
  const testRef = db.doc("testSeriesTests/" + concurrentTestId);
  const paperRef = db.doc("testSeriesQuestionSets/" + concurrentTestId);
  const keyRef = db.doc("testSeriesAnswerKeys/" + concurrentTestId);
  const activeRef = db.doc("testSeriesActiveSessions/" + uid);
  const previousActive = await activeRef.get();
  let paidAccess;
  let attemptId;
  try {
    await testRef.set({
      title: "Concurrent CBT Regression", status: "published", price: 25,
      mode: "mock", durationMinutes: 15, marksPerQuestion: 2,
      negativeMarks: 0.5, questionCount: 2
    });
    await paperRef.set({ questions: [
      { id: "race-q1", text: "Concurrent answer?", options: ["A", "B"] },
      { id: "race-q2", text: "Submit race?", options: ["A", "B"] }
    ] });
    await keyRef.set({ questions: {
      "race-q1": { correctAnswer: "0" },
      "race-q2": { correctAnswer: "1" }
    } });
    paidAccess = await seedPaidAccess({
      testId: concurrentTestId,
      paymentId: "pay_emulator_cbt_concurrency",
      orderId: "order_emulator_cbt_concurrency",
      amount: 2500
    });

    // Simultaneous requests must converge on the same active attempt.
    const starts = await Promise.all([
      callable("rmStartExam", { testId: concurrentTestId }),
      callable("rmStartExam", { testId: concurrentTestId })
    ]);
    attemptId = starts[0].attemptId;
    assert.ok(attemptId);
    assert.equal(starts[1].attemptId, attemptId);
    assert.equal(new Set(starts.map(item => item.attemptId)).size, 1);
    const active = (await activeRef.get()).data();
    assert.equal(active.attemptId, attemptId);
    assert.equal(active.testId, concurrentTestId);
    assert.equal(active.status, "in_progress");

    // Concurrent writes to one answer may serialize in either order, but
    // the persisted value must be one complete valid selection.
    const saves = await Promise.all([
      callable("rmSaveAnswer", { attemptId, questionId: "race-q1", answer: "0" }),
      callable("rmSaveAnswer", { attemptId, questionId: "race-q1", answer: "1" })
    ]);
    assert.equal(saves.every(item => item.saved === true), true);
    let persisted = (await db.doc(attemptRefPrefix + attemptId).get()).data();
    assert.ok(["0", "1"].includes(persisted.answers["race-q1"]));

    // Race one final answer save against submission. If the save commits
    // first it is included; if submit commits first the save must be rejected.
    const saveSubmitRace = await Promise.allSettled([
      callable("rmSaveAnswer", { attemptId, questionId: "race-q2", answer: "1" }),
      callable("rmSubmitExam", { attemptId })
    ]);
    assert.equal(saveSubmitRace[1].status, "fulfilled");
    if (saveSubmitRace[0].status === "rejected") {
      assert.match(saveSubmitRace[0].reason.code, /failed-precondition/);
    } else {
      assert.equal(saveSubmitRace[0].value.saved, true);
    }

    persisted = (await db.doc(attemptRefPrefix + attemptId).get()).data();
    assert.equal(persisted.status, "submitted");
    const savedResult = (await db.doc("testSeriesResults/" + attemptId).get()).data();
    assert.ok(savedResult);
    assert.equal(savedResult.attemptId, attemptId);
    assert.equal(savedResult.correct, persisted.correct);
    assert.equal(savedResult.wrong, persisted.wrong);
    assert.equal(savedResult.score, persisted.score);

    // Concurrent retries must all return the one committed result.
    const duplicateSubmissions = await Promise.all([
      callable("rmSubmitExam", { attemptId }),
      callable("rmSubmitExam", { attemptId })
    ]);
    assert.deepEqual(duplicateSubmissions[0], duplicateSubmissions[1]);
    assert.equal(duplicateSubmissions[0].score, persisted.score);
    assert.equal((await db.collection("testSeriesResults").where("attemptId", "==", attemptId).get()).size, 1);

    await assert.rejects(
      callable("rmSaveAnswer", { attemptId, questionId: "race-q1", answer: "1" }),
      error => error.code === "functions/failed-precondition"
    );
    const afterLateSave = (await db.doc(attemptRefPrefix + attemptId).get()).data();
    assert.deepEqual(afterLateSave.answers, persisted.answers);
    assert.equal((await db.doc("testSeriesResults/" + attemptId).get()).data().score, persisted.score);
  } finally {
    // Clean up every attempt created for this scenario, including an unexpected
    // duplicate if the concurrency assertion ever catches a regression.
    const scenarioAttempts = await db.collection("testSeriesAttempts")
      .where("uid", "==", uid).where("testId", "==", concurrentTestId).get().catch(() => null);
    const attemptIds = scenarioAttempts ? scenarioAttempts.docs.map(doc => doc.id) : [];
    const cleanupRefs = [
      ...attemptIds.map(id => db.doc(attemptRefPrefix + id)),
      ...attemptIds.map(id => db.doc("testSeriesResults/" + id)),
      testRef, paperRef, keyRef,
      ...(paidAccess ? [
        paidAccess.paymentRef,
        paidAccess.orderRef,
        paidAccess.entitlementRef
      ] : [])
    ];
    await Promise.all(cleanupRefs.map(ref => ref.delete().catch(() => {})));
    if (previousActive.exists) await activeRef.set(previousActive.data());
    else await activeRef.delete().catch(() => {});
  }
});

test("CBT repairs a stale active pointer and starts independent section clocks exactly once", async () => {
  const scenarioTestId = "emulator-cbt-section-race";
  const testRef = db.doc("testSeriesTests/" + scenarioTestId);
  const paperRef = db.doc("testSeriesQuestionSets/" + scenarioTestId);
  const keyRef = db.doc("testSeriesAnswerKeys/" + scenarioTestId);
  const activeRef = db.doc("testSeriesActiveSessions/" + uid);
  const previousActive = await activeRef.get();
  const staleAttemptId = "emulator-cbt-section-stale-pointer";
  const staleAttemptRef = db.doc("testSeriesAttempts/" + staleAttemptId);
  let paidAccess;
  try {
    await testRef.set({
      title: "Section Clock Concurrency", status: "published", price: 30,
      mode: "mock", durationMinutes: 10, marksPerQuestion: 1,
      negativeMarks: 0.25, questionCount: 2,
      sections: [
        { name: "Technical Ability", timeLimitMinutes: 2, questionCount: 1 },
        { name: "General Awareness", timeLimitMinutes: 1, questionCount: 1 }
      ]
    });
    await paperRef.set({ questions: [
      { id: "clock-q1", text: "Technical question?", options: ["A", "B"], section: "Technical Ability" },
      { id: "clock-q2", text: "General question?", options: ["A", "B"], section: "General Awareness" }
    ] });
    await keyRef.set({ questions: {
      "clock-q1": { correctAnswer: "0" },
      "clock-q2": { correctAnswer: "1" }
    } });
    paidAccess = await seedPaidAccess({
      testId: scenarioTestId,
      paymentId: "pay_emulator_section_clock",
      orderId: "order_emulator_section_clock",
      amount: 3000
    });

    // A dangling pointer must not block a new paid attempt or be returned as active.
    await staleAttemptRef.set({
      uid: uid + "-stale",
      testId: scenarioTestId,
      status: "in_progress",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    });
    await activeRef.set({
      uid, testId: scenarioTestId, attemptId: staleAttemptId,
      status: "in_progress", expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    });
    const started = await callable("rmStartExam", { testId: scenarioTestId });
    assert.ok(started.attemptId);
    assert.notEqual(started.attemptId, staleAttemptId);
    let active = (await activeRef.get()).data();
    assert.equal(active.attemptId, started.attemptId);
    assert.equal(active.uid, uid);
    assert.equal(active.testId, scenarioTestId);

    // Concurrent entry into separate sections must create independent clocks.
    const [technical, general] = await Promise.all([
      callable("rmEnterCbtSection", { attemptId: started.attemptId, section: "Technical Ability" }),
      callable("rmEnterCbtSection", { attemptId: started.attemptId, section: "General Awareness" })
    ]);
    assert.equal(technical.section, "Technical Ability");
    assert.equal(general.section, "General Awareness");
    assert.equal(technical.timeLimitMinutes, 2);
    assert.equal(general.timeLimitMinutes, 1);
    assert.notEqual(technical.expiresAt, general.expiresAt);

    const resumedTechnical = await callable("rmEnterCbtSection", {
      attemptId: started.attemptId, section: "Technical Ability"
    });
    const resumedGeneral = await callable("rmEnterCbtSection", {
      attemptId: started.attemptId, section: "General Awareness"
    });
    assert.equal(resumedTechnical.expiresAt, technical.expiresAt);
    assert.equal(resumedGeneral.expiresAt, general.expiresAt);
    assert.equal(resumedTechnical.resumed, true);
    assert.equal(resumedGeneral.resumed, true);

    const attemptRef = db.doc("testSeriesAttempts/" + started.attemptId);
    await attemptRef.update({
      ["sectionTimings.Technical Ability.expiresAt"]: new Date(Date.now() - 1000)
    });
    await assert.rejects(
      callable("rmEnterCbtSection", { attemptId: started.attemptId, section: "Technical Ability" }),
      error => error.code === "functions/deadline-exceeded"
    );
    const savedAttempt = (await attemptRef.get()).data();
    assert.equal(new Date(savedAttempt.sectionTimings["General Awareness"].expiresAt.toDate
      ? savedAttempt.sectionTimings["General Awareness"].expiresAt.toDate()
      : savedAttempt.sectionTimings["General Awareness"].expiresAt).getTime(),
      new Date(general.expiresAt).getTime(),
      "expiring one section must not reset or mutate the other section clock"
    );
    active = (await activeRef.get()).data();
    assert.equal(active.attemptId, started.attemptId);
  } finally {
    const scenarioAttempts = await db.collection("testSeriesAttempts")
      .where("uid", "==", uid).where("testId", "==", scenarioTestId).get().catch(() => null);
    const attemptIds = scenarioAttempts ? scenarioAttempts.docs.map(doc => doc.id) : [];
    const cleanupRefs = [
      ...attemptIds.map(id => db.doc("testSeriesAttempts/" + id)),
      ...attemptIds.map(id => db.doc("testSeriesResults/" + id)),
      staleAttemptRef, testRef, paperRef, keyRef,
      ...(paidAccess ? [
        paidAccess.paymentRef, paidAccess.orderRef, paidAccess.entitlementRef
      ] : [])
    ];
    await Promise.all(cleanupRefs.map(ref => ref.delete().catch(() => {})));
    if (previousActive.exists) await activeRef.set(previousActive.data());
    else await activeRef.delete().catch(() => {});
  }
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
  let scheduledAccess = null;
  try {
    const now = Date.now();
    await testRef.set({
      title: "Scheduled Window Test", status: "published", price: 50,
      mode: "scheduled", durationMinutes: 10,
      scheduleStartAt: new Date(now + 60_000),
      scheduleEndAt: new Date(now + 10 * 60_000)
    });
    await keyRef.set({ questions: { scheduled_q1: { correctAnswer: "0" } } });
    await questionsRef.set({
      questions: [
        { id: "scheduled_q1", text: "Scheduled question?", options: ["A", "B"] }
      ]
    });

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

    scheduledAccess = await seedPaidAccess({
      testId: scheduledTestId, paymentId: "pay_scheduled_test",
      orderId: "order_scheduled_test", amount: 5000
    });
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
    assert.equal(submitted.totalQuestions, 1);

    // Completing one paid exam must release the student's active slot for another test.
    const nextTestId = "emulator-next-paid-after-completion";
    const nextTestRef = db.doc("testSeriesTests/" + nextTestId);
    let nextAccess = null;
    let nextAttemptId = null;
    try {
      await nextTestRef.set({
        title: "Next Paid Test", status: "published", price: 25,
        mode: "mock", durationMinutes: 10, questionCount: 0
      });
      nextAccess = await seedPaidAccess({
        testId: nextTestId, paymentId: "pay_next_paid_test",
        orderId: "order_next_paid_test", amount: 2500
      });
      const nextStarted = await callable("rmStartExam", { testId: nextTestId });
      nextAttemptId = nextStarted.attemptId;
      assert.ok(nextAttemptId);
      assert.equal(nextStarted.resumed, false);
      const nextActive = await callable("rmGetStudentActiveAttempt", { testId: nextTestId });
      assert.equal(nextActive.found, true);
      assert.equal(nextActive.status, "in_progress");
      assert.equal(nextActive.attemptId, nextAttemptId);
    } finally {
      if (nextAttemptId) await db.doc("testSeriesAttempts/" + nextAttemptId).delete().catch(() => {});
      await nextTestRef.delete().catch(() => {});
      if (nextAccess) {
        await Promise.all([
          nextAccess.paymentRef.delete().catch(() => {}),
          nextAccess.orderRef.delete().catch(() => {}),
          nextAccess.entitlementRef.delete().catch(() => {})
        ]);
      }
      await db.doc("testSeriesActiveSessions/" + uid).delete().catch(() => {});
    }
  } finally {
    if (startedAttemptId) {
      await db.doc("testSeriesAttempts/" + startedAttemptId).delete();
      await db.doc("testSeriesResults/" + startedAttemptId).delete();
    }
    await db.doc("testSeriesActiveSessions/" + uid).delete();
    await Promise.all([
      testRef, entitlementRef, keyRef, questionsRef,
      ...(scheduledAccess ? [scheduledAccess.paymentRef, scheduledAccess.orderRef] : [])
    ].map(ref => ref.delete().catch(() => {})));
  }
});

test("a different authenticated student cannot read, save or submit another student's attempt", async () => {
  const foreignUser = await getAuth(app).createUser({
    phoneNumber: "+1666" + String(Date.now()).slice(-7)
  });
  const foreignAttemptId = "foreign-owner-boundary-attempt";
  const foreignAttemptRef = db.doc("testSeriesAttempts/" + foreignAttemptId);
  try {
    await foreignAttemptRef.set({
      uid: foreignUser.uid, testId, status: "in_progress",
      startedAt: new Date(), expiresAt: new Date(Date.now() + 60_000), answers: {}
    });
    await signOut(clientAuth);
    await signInAsTestStudent(uid);
    await assert.rejects(
      callable("rmGetExamQuestions", { attemptId: foreignAttemptId }),
      error => error.code === "functions/permission-denied"
    );
    await assert.rejects(
      callable("rmSaveAnswer", { attemptId: foreignAttemptId, questionId: "q1", answer: "0" }),
      error => error.code === "functions/permission-denied"
    );
    await assert.rejects(
      callable("rmSubmitExam", { attemptId: foreignAttemptId }),
      error => error.code === "functions/permission-denied"
    );
  } finally {
    await foreignAttemptRef.delete().catch(() => {});
    await getAuth(app).deleteUser(foreignUser.uid).catch(() => {});
    await signOut(clientAuth);
    await signInAsTestStudent(uid);
  }
});

test("unauthenticated caller cannot start an exam", async () => {
  await signOut(clientAuth);
  await assert.rejects(
    callable("rmStartExam", { testId }),
    error => error.code === "functions/unauthenticated"
  );
});

test("non-owner cannot read payment history", async () => {
  const originalOwnerUid = process.env.OWNER_UID;
  process.env.OWNER_UID = "different-owner-uid";
  // The preceding test intentionally signs out; restore a student token so
  // this assertion exercises the owner guard rather than unauthenticated access.
  await signInAsTestStudent(uid);
  try {
    await assert.rejects(
      callable("rmOwnerListPayments", {}),
      error => error.code === "functions/permission-denied"
    );
    await assert.rejects(
      callable("rmOwnerListPaymentReconciliation", {}),
      error => error.code === "functions/permission-denied"
    );
  } finally {
    if (originalOwnerUid === undefined) delete process.env.OWNER_UID;
    else process.env.OWNER_UID = originalOwnerUid;
  }
});

test("ordinary student cannot grant or revoke manual test access", async () => {
  const originalOwnerUid = process.env.OWNER_UID;
  process.env.OWNER_UID = "configured-owner-not-this-student";
  await signInAsTestStudent(uid);
  try {
    await assert.rejects(
      callable("rmOwnerSetStudentTestAccess", {
        studentUid: uid,
        testId,
        action: "grant",
        reason: "Unauthorized access request",
        requestId: "emulator_access_req_0001"
      }),
      error => error.code === "functions/permission-denied"
    );
    const accessId = require("../owner-test-access").manualAccessDocumentId(uid, testId);
    assert.equal((await db.doc("testSeriesManualAccess/" + accessId).get()).exists, false);
    const audit = await db.collection("testSeriesAccessAudit").where("targetUid", "==", uid).get();
    assert.equal(audit.empty, true);
    await assert.rejects(
      callable("rmOwnerListStudentTestAccess", { studentUid: uid }),
      error => error.code === "functions/permission-denied"
    );
    await assert.rejects(
      callable("rmOwnerListStudentAccessAudit", { studentUid: uid }),
      error => error.code === "functions/permission-denied"
    );
  } finally {
    if (originalOwnerUid === undefined) delete process.env.OWNER_UID;
    else process.env.OWNER_UID = originalOwnerUid;
  }
});

test("non-owner cannot create a test", async () => {
  const originalOwnerUid = process.env.OWNER_UID;
  process.env.OWNER_UID = "some-other-owner";
  // Re-authenticate the ordinary student after the preceding anonymous-call test.
  await signInAsTestStudent(uid);
  try {
    await assert.rejects(
      callable("rmOwnerSaveTest", {
        title: "Should Be Rejected", mode: "mock", durationMinutes: 10,
        price: 0, status: "draft",
        questions: [{ id: "q1", text: "Question?", options: ["A", "B"], correctIndex: 0 }]
      }),
      error => error.code === "functions/permission-denied"
    );
    await assert.rejects(
      callable("rmOwnerSetFreeTest", { testId }),
      error => error.code === "functions/permission-denied"
    );
    assert.equal((await db.doc("testSeriesConfig/freeTest").get()).data().testId, testId);
  } finally {
    process.env.OWNER_UID = originalOwnerUid;
  }
});


test("manual grant starts only a complimentary test and revocation preserves the active attempt", async () => {
  const complimentaryTestId = "emulator-manual-complimentary";
  const accessId = require("../owner-test-access").manualAccessDocumentId(uid, complimentaryTestId);
  const testRef = db.doc("testSeriesTests/" + complimentaryTestId);
  const accessRef = db.doc("testSeriesManualAccess/" + accessId);
  const activeRef = db.doc("testSeriesActiveSessions/" + uid);
  const previousActive = await activeRef.get();
  let attemptId = null;
  try {
    // Isolate this test from any active free/paid attempt in the shared fixture.
    await activeRef.delete().catch(() => {});
    await testRef.set({
      title: "Complimentary manual-access test",
      status: "published",
      price: 0,
      mode: "mock",
      durationMinutes: 10,
      questionCount: 1
    });
    await accessRef.set({
      uid,
      testId: complimentaryTestId,
      status: "active",
      source: "owner_manual",
      expiresAt: null
    });
    const started = await callable("rmStartExam", { testId: complimentaryTestId });
    attemptId = started.attemptId;
    assert.equal(started.resumed, false);
    const attemptRef = db.doc("testSeriesAttempts/" + attemptId);
    const attempt = (await attemptRef.get()).data();
    assert.equal(attempt.accessSource, "owner_manual");
    assert.equal(attempt.testId, complimentaryTestId);

    await accessRef.update({ status: "revoked" });
    const resumed = await callable("rmStartExam", { testId: complimentaryTestId });
    assert.equal(resumed.attemptId, attemptId);
    assert.equal(resumed.resumed, true);

    // Once the active attempt is gone, the revoked grant cannot create a new one.
    await activeRef.delete();
    await db.doc("testSeriesAttempts/" + attemptId).delete();
    attemptId = null;
    await assert.rejects(
      callable("rmStartExam", { testId: complimentaryTestId }),
      error => error.code === "functions/permission-denied"
    );
  } finally {
    await activeRef.delete().catch(() => {});
    if (previousActive.exists) await activeRef.set(previousActive.data()).catch(() => {});
    if (attemptId) await db.doc("testSeriesAttempts/" + attemptId).delete().catch(() => {});
    await accessRef.delete().catch(() => {});
    await testRef.delete().catch(() => {});
  }
});

test("Owner manual access callables require real emulator password plus phone MFA and audit grant/revoke", async () => {
  const ownerUid = "railway-mitra-cbt-emulator-owner";
  const ownerEmail = "owner-mfa-emulator@railway-mitra.invalid";
  const ownerPassword = "Emulator-Only-Owner-Password-927!";
  const ownerPhoneNumber = "+1666" + String(Date.now()).slice(-7);
  const complimentaryTestId = "emulator-owner-mfa-complimentary";
  const accessId = require("../owner-test-access").manualAccessDocumentId(uid, complimentaryTestId);
  const accessRef = db.doc("testSeriesManualAccess/" + accessId);
  const testRef = db.doc("testSeriesTests/" + complimentaryTestId);
  const requestIds = [
    "emulator_owner_grant_0001",
    "emulator_owner_revoke_0001"
  ];
  const requestDocIds = requestIds.map(requestId =>
    crypto.createHash("sha256").update(ownerUid).update("\0").update(requestId).digest("hex")
  );
  let ownerCreated = false;
  let originalMfaConfig;
  let mfaConfigUpdated = false;
  const projectConfigManager = getAuth(app).projectConfigManager();

  assert.equal(process.env.OWNER_UID, ownerUid,
    "Functions emulator must receive the isolated Owner UID from the CBT workflow");

  try {
    const currentProjectConfig = await projectConfigManager.getProjectConfig();
    originalMfaConfig = currentProjectConfig.multiFactorConfig || null;
    await projectConfigManager.updateProjectConfig({
      multiFactorConfig: { state: "ENABLED", factorIds: ["phone"] }
    });
    mfaConfigUpdated = true;

    await getAuth(app).deleteUser(ownerUid).catch(() => {});
    await getAuth(app).createUser({
      uid: ownerUid,
      email: ownerEmail,
      password: ownerPassword,
      emailVerified: true,
      displayName: "Emulator Owner MFA Test"
    });
    ownerCreated = true;

    // Obtain a genuine first-factor password token from the Auth Emulator.
    const firstFactor = await authEmulatorRequest("v1/accounts:signInWithPassword", {
      email: ownerEmail,
      password: ownerPassword,
      returnSecureToken: true
    });
    assert.equal(firstFactor.localId, ownerUid);
    assert.ok(firstFactor.idToken);

    // A valid primary password session is deliberately insufficient for Owner access.
    await assert.rejects(
      callableWithIdToken("rmOwnerSetStudentTestAccess", {
        studentUid: uid,
        testId: complimentaryTestId,
        action: "grant",
        reason: "Primary factor only denial",
        requestId: "emulator_owner_primary_0001"
      }, firstFactor.idToken),
      error => error.code === "functions/permission-denied"
    );

    // Enroll a phone second factor through the Auth Emulator's Identity Toolkit
    // REST flow. The verification code is read only from the local emulator.
    const enrollmentStart = await authEmulatorRequest("v2/accounts/mfaEnrollment:start", {
      idToken: firstFactor.idToken,
      phoneEnrollmentInfo: {
        phoneNumber: ownerPhoneNumber,
        clientType: "CLIENT_TYPE_WEB"
      }
    });
    const enrollmentSession = enrollmentStart.phoneSessionInfo?.sessionInfo;
    assert.ok(enrollmentSession, "Auth Emulator must create an MFA enrollment session");
    const enrollmentCode = await getEmulatorMfaSmsCode(ownerPhoneNumber);
    const enrollmentFinal = await authEmulatorRequest("v2/accounts/mfaEnrollment:finalize", {
      idToken: firstFactor.idToken,
      displayName: "Railway Mitra Owner test phone",
      phoneVerificationInfo: {
        sessionInfo: enrollmentSession,
        code: enrollmentCode
      }
    });
    assert.ok(enrollmentFinal.idToken, "phone enrollment must return a refreshed ID token");
    const enrolledOwner = await getAuth(app).getUser(ownerUid);
    assert.ok(
      enrolledOwner.multiFactor?.enrolledFactors?.some(factor => factor.factorId === "phone"),
      "Auth Emulator must persist the phone second factor on the Owner account"
    );

    // A fresh password sign-in must now return a pending MFA challenge.
    const mfaChallenge = await authEmulatorRequest("v1/accounts:signInWithPassword", {
      email: ownerEmail,
      password: ownerPassword,
      returnSecureToken: true
    }, { allowError: true });
    assert.ok(mfaChallenge.mfaPendingCredential, "password sign-in must return an MFA challenge instead of a completed session");
    assert.equal(mfaChallenge.idToken, undefined, "first-factor sign-in must not issue a completed ID token before MFA");
    const phoneEnrollment = (mfaChallenge.mfaInfo || []).find(item => item.phoneInfo);
    assert.ok(phoneEnrollment?.mfaEnrollmentId, "password sign-in must expose the enrolled phone factor");

    const signInStart = await authEmulatorRequest("v2/accounts/mfaSignIn:start", {
      mfaPendingCredential: mfaChallenge.mfaPendingCredential,
      mfaEnrollmentId: phoneEnrollment.mfaEnrollmentId,
      phoneSignInInfo: { clientType: "CLIENT_TYPE_WEB" }
    });
    const signInSession = signInStart.phoneResponseInfo?.sessionInfo;
    assert.ok(signInSession, "Auth Emulator must create an MFA sign-in session");
    const signInCode = await getEmulatorMfaSmsCode(ownerPhoneNumber);
    const signedIn = await authEmulatorRequest("v2/accounts/mfaSignIn:finalize", {
      mfaPendingCredential: mfaChallenge.mfaPendingCredential,
      mfaEnrollmentId: phoneEnrollment.mfaEnrollmentId,
      phoneVerificationInfo: {
        sessionInfo: signInSession,
        code: signInCode
      }
    });
    assert.ok(signedIn.idToken, "phone MFA must produce a final Owner ID token");
    const tokenClaims = JSON.parse(Buffer.from(signedIn.idToken.split(".")[1], "base64url").toString("utf8"));
    assert.equal(tokenClaims.sub, ownerUid);
    assert.equal(tokenClaims.firebase?.sign_in_provider, "password");
    assert.equal(tokenClaims.firebase?.sign_in_second_factor, "phone");

    await testRef.set({
      title: "Owner MFA complimentary access test",
      status: "published",
      price: 0,
      mode: "mock",
      durationMinutes: 10,
      questionCount: 1
    });

    const grantRequest = {
      studentUid: uid,
      testId: complimentaryTestId,
      action: "grant",
      reason: "Approved emulator access",
      requestId: requestIds[0]
    };
    const granted = await callableWithIdToken("rmOwnerSetStudentTestAccess", grantRequest, signedIn.idToken);
    assert.equal(granted.saved, true);
    assert.equal(granted.replayed, false);
    assert.equal(granted.status, "active");

    const replayed = await callableWithIdToken("rmOwnerSetStudentTestAccess", grantRequest, signedIn.idToken);
    assert.equal(replayed.saved, true);
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.status, "active");

    await assert.rejects(
      callableWithIdToken("rmOwnerSetStudentTestAccess", {
        ...grantRequest,
        reason: "Different approved reason"
      }, signedIn.idToken),
      error => error.code === "functions/already-exists"
    );

    const accessList = await callableWithIdToken("rmOwnerListStudentTestAccess", {
      studentUid: uid,
      pageSize: 10
    }, signedIn.idToken);
    const listedGrant = accessList.items.find(item => item.accessId === accessId);
    assert.ok(listedGrant);
    assert.equal(listedGrant.status, "active");
    assert.equal(listedGrant.effectiveStatus, "active");

    const revoke = await callableWithIdToken("rmOwnerSetStudentTestAccess", {
      studentUid: uid,
      testId: complimentaryTestId,
      action: "revoke",
      reason: "Approved access period ended",
      requestId: requestIds[1]
    }, signedIn.idToken);
    assert.equal(revoke.saved, true);
    assert.equal(revoke.replayed, false);
    assert.equal(revoke.status, "revoked");
    assert.equal((await accessRef.get()).data().status, "revoked");

    const auditList = await callableWithIdToken("rmOwnerListStudentAccessAudit", {
      studentUid: uid,
      pageSize: 10
    }, signedIn.idToken);
    const relevantAudit = auditList.items.filter(item => item.testId === complimentaryTestId);
    assert.deepEqual(relevantAudit.map(item => item.action).sort(), ["grant", "revoke"]);
    assert.equal(relevantAudit.length, 2,
      "replaying the same grant request must not create a duplicate audit event");

    const storedAudit = await db.collection("testSeriesAccessAudit")
      .where("targetUid", "==", uid).get();
    assert.equal(storedAudit.docs.filter(doc => doc.data().testId === complimentaryTestId).length, 2);
  } finally {
    await accessRef.delete().catch(() => {});
    await testRef.delete().catch(() => {});
    for (const requestDocId of requestDocIds) {
      await db.doc("testSeriesAccessRequests/" + requestDocId).delete().catch(() => {});
    }
    const audit = await db.collection("testSeriesAccessAudit").where("targetUid", "==", uid).get().catch(() => null);
    if (audit) {
      const batch = db.batch();
      let count = 0;
      audit.docs.filter(doc => doc.data().testId === complimentaryTestId).forEach(doc => {
        batch.delete(doc.ref);
        count += 1;
      });
      if (count) await batch.commit().catch(() => {});
    }
    if (ownerCreated) await getAuth(app).deleteUser(ownerUid).catch(() => {});
    if (mfaConfigUpdated) {
      await projectConfigManager.updateProjectConfig({
        multiFactorConfig: originalMfaConfig || { state: "DISABLED", factorIds: [] }
      }).catch(() => {});
    }
  }
});

test("manual Owner access never bypasses paid payment-ledger authorization", async () => {
  const paidTestId = "emulator-manual-must-not-unlock-paid";
  const accessId = require("../owner-test-access").manualAccessDocumentId(uid, paidTestId);
  const testRef = db.doc("testSeriesTests/" + paidTestId);
  const accessRef = db.doc("testSeriesManualAccess/" + accessId);
  try {
    await testRef.set({
      title: "Paid test manual-access boundary",
      status: "published",
      price: 499,
      mode: "mock",
      durationMinutes: 10,
      questionCount: 1
    });
    await accessRef.set({
      uid,
      testId: paidTestId,
      status: "active",
      source: "owner_manual",
      expiresAt: null
    });
    await assert.rejects(
      callable("rmStartExam", { testId: paidTestId }),
      error => error.code === "functions/permission-denied"
    );
    assert.equal((await db.collection("testSeriesAttempts").where("uid", "==", uid).where("testId", "==", paidTestId).get()).empty, true);
  } finally {
    await accessRef.delete().catch(() => {});
    await testRef.delete().catch(() => {});
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
  const { paymentRequestDocumentId, paymentStudentTestLockDocumentId } = require("../payment-order-request");
  const paymentRequestId = "emulator-ledger-lock-request-0001";
  const requestDocId = paymentRequestDocumentId({ uid, testId: paidTestId, requestId: paymentRequestId });
  const paymentLockRef = db.doc("testSeriesPaymentLocks/" + paymentStudentTestLockDocumentId({ uid, testId: paidTestId }));
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
      amount: 49900, currency: "INR", status: "created", paymentRequestId: requestDocId
    });
    await paymentLockRef.set({
      uid, testId: paidTestId, requestDocId, status: "created",
      createdAt: new Date(), updatedAt: new Date()
    });

    await paymentLockRef.update({ requestDocId: "a".repeat(64) });
    await assert.rejects(
      applyCapturedPayment({ db, event, eventId }),
      error => error.code === "payment_lock_conflict"
    );
    assert.equal((await paymentRef.get()).exists, false,
      "a captured payment with a mismatched lock must not create a ledger record");
    assert.equal((await entitlementRef.get()).exists, false,
      "a captured payment with a mismatched lock must not grant access");
    await paymentLockRef.update({ requestDocId });

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
    assert.equal((await paymentLockRef.get()).exists, false,
      "verified capture must atomically release the student-test payment lock");

    const sameEventRetry = await applyCapturedPayment({ db, event, eventId });
    assert.equal(sameEventRetry.granted, false);
    assert.equal(sameEventRetry.duplicate, true);

    const newEventRetry = await applyCapturedPayment({ db, event, eventId: "evt_ledger_replay" });
    assert.equal(newEventRetry.granted, false);
    assert.equal(newEventRetry.duplicate, true);
    assert.equal((await replayEventRef.get()).exists, false,
      "a new untrusted event ID must not create another event document for an already-ledgered payment");

    const secondNewEventRetry = await applyCapturedPayment({
      db, event, eventId: "evt_ledger_replay_second"
    });
    assert.equal(secondNewEventRetry.granted, false);
    assert.equal(secondNewEventRetry.duplicate, true);
    assert.equal((await db.doc("testSeriesPaymentEvents/evt_ledger_replay_second").get()).exists, false);

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
      applyCapturedPayment({ db, event, eventId }),
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

    // Paid access must be backed by all three matching server ledger records,
    // not merely by an active entitlement document.
    const originalPaymentForStart = (await paymentRef.get()).data();
    const originalOrderForStart = (await orderRef.get()).data();
    const originalEntitlementForStart = (await entitlementRef.get()).data();
    const corruptedStartRecords = [
      [paymentRef, { ...originalPaymentForStart, status: "refunded" }],
      [paymentRef, { ...originalPaymentForStart, amount: 1 }],
      [orderRef, { ...originalOrderForStart, status: "created" }],
      [orderRef, { ...originalOrderForStart, paymentId: "pay_other_order" }],
      [entitlementRef, { ...originalEntitlementForStart, amount: 1 }],
      [entitlementRef, { ...originalEntitlementForStart, razorpayOrderId: "order_other" }]
    ];
    for (const [recordRef, corruptedRecord] of corruptedStartRecords) {
      await recordRef.set(corruptedRecord);
      await assert.rejects(
        callable("rmStartExam", { testId: paidTestId }),
        error => error.code === "functions/permission-denied",
        "paid test start must reject a mismatched payment ledger record"
      );
      if (recordRef.path === paymentRef.path) await recordRef.set(originalPaymentForStart);
      else if (recordRef.path === orderRef.path) await recordRef.set(originalOrderForStart);
      else await recordRef.set(originalEntitlementForStart);
    }

    await paymentRef.delete();
    await assert.rejects(
      callable("rmStartExam", { testId: paidTestId }),
      error => error.code === "functions/permission-denied",
      "paid test start must reject a missing captured-payment record"
    );
    await paymentRef.set(originalPaymentForStart);

    await orderRef.delete();
    await assert.rejects(
      callable("rmStartExam", { testId: paidTestId }),
      error => error.code === "functions/permission-denied",
      "paid test start must reject a missing paid-order record"
    );
    await orderRef.set(originalOrderForStart);

    const started = await callable("rmStartExam", { testId: paidTestId });
    attemptId = started.attemptId;
    assert.ok(attemptId);
    assert.equal(started.resumed, false);
  } finally {
    if (attemptId) await db.doc("testSeriesAttempts/" + attemptId).delete().catch(() => {});
    await db.doc("testSeriesActiveSessions/" + uid).delete().catch(() => {});
    await Promise.all([
      testRef, orderRef, secondOrderRef, paymentRef, eventRef, replayEventRef, entitlementRef, paymentLockRef,
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

  function makeRequest(sig = signature, parsedBody = event) {
    return {
      method: "POST", rawBody, body: parsedBody,
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
    // Middleware's parsed body is deliberately attacker-altered. The handler
    // must parse only the exact raw bytes whose HMAC was verified.
    const tamperedParsedBody = {
      ...event,
      payload: { payment: { entity: {
        ...event.payload.payment.entity,
        id: "pay_attacker_substitution",
        order_id: "order_attacker_substitution",
        amount: 1
      } } }
    };
    await handleRazorpayWebhook({
      req: makeRequest(signature, tamperedParsedBody), res: firstResponse,
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


test("payment request reservation serializes concurrent same-ID requests and replays the saved order", async () => {
  const {
    PAYMENT_REQUEST_STATES,
    paymentRequestDocumentId,
    paymentStudentTestLockDocumentId,
    inspectStudentTestPaymentLock,
    paymentRequestFingerprint,
    inspectPaymentRequest
  } = require("../payment-order-request");
  const requestId = "emulator-concurrent-request-0001";
  const paidTestId = "emulator-request-replay-test";
  const amount = 49900;
  const requestDocId = paymentRequestDocumentId({ uid, testId: paidTestId, requestId });
  const requestRef = db.doc("testSeriesPaymentRequests/" + requestDocId);
  const lockRef = db.doc("testSeriesPaymentLocks/" + paymentStudentTestLockDocumentId({ uid, testId: paidTestId }));
  const testRef = db.doc("testSeriesTests/" + paidTestId);
  const entitlementRef = db.doc("testSeriesEntitlements/" + uid + "_" + paidTestId);
  const orderId = "order_emulator_request_replay";
  const orderRef = db.doc("testSeriesPaymentOrders/" + orderId);
  const fingerprint = paymentRequestFingerprint({ uid, testId: paidTestId, amount, currency: "INR" });

  async function reserve(token) {
    return db.runTransaction(async tx => {
      const [requestSnap, testSnap, entitlementSnap, lockSnap] = await Promise.all([
        tx.get(requestRef), tx.get(testRef), tx.get(entitlementRef), tx.get(lockRef)
      ]);
      assert.equal(testSnap.exists, true);
      assert.equal(testSnap.data().status, "published");
      assert.equal(entitlementSnap.exists, false);
      const lockDecision = inspectStudentTestPaymentLock(lockSnap.exists ? lockSnap.data() : null, {
        uid, testId: paidTestId, requestDocId
      });
      if (lockDecision.action !== "reserve" && lockDecision.action !== "continue") return lockDecision;
      const decision = inspectPaymentRequest(requestSnap.exists ? requestSnap.data() : null, fingerprint);
      if (decision.action !== "reserve") return decision;
      tx.create(requestRef, {
        uid, testId: paidTestId, requestId, fingerprint, amount, currency: "INR",
        status: PAYMENT_REQUEST_STATES.CREATING, reservationToken: token,
        receipt: "rm_emulator_concurrent_request", createdAt: new Date()
      });
      if (!lockSnap.exists) tx.create(lockRef, {
        uid, testId: paidTestId, requestDocId, status: PAYMENT_REQUEST_STATES.CREATING,
        createdAt: new Date(), updatedAt: new Date()
      });
      return { action: "create", token };
    });
  }

  try {
    await testRef.set({ title: "Request Replay Test", status: "published", price: 499 });
    const decisions = await Promise.all([reserve("reservation-a"), reserve("reservation-b")]);
    assert.equal(decisions.filter(item => item.action === "create").length, 1);
    assert.equal(decisions.filter(item => item.action === "wait").length, 1);

    await orderRef.set({
      uid, testId: paidTestId, razorpayOrderId: orderId,
      amount, currency: "INR", status: "created", paymentRequestId: requestDocId
    });
    await requestRef.update({
      status: PAYMENT_REQUEST_STATES.CREATED,
      razorpayOrderId: orderId,
      updatedAt: new Date()
    });
    await lockRef.update({ status: PAYMENT_REQUEST_STATES.CREATED, updatedAt: new Date() });

    const otherTabRequestId = "emulator-other-tab-request-0001";
    const otherTabRequestDocId = paymentRequestDocumentId({ uid, testId: paidTestId, requestId: otherTabRequestId });
    assert.deepEqual(inspectStudentTestPaymentLock((await lockRef.get()).data(), {
      uid, testId: paidTestId, requestDocId: otherTabRequestDocId
    }), { action: "reject", reason: "another_payment_request_pending" });

    const savedRequest = (await requestRef.get()).data();
    const replay = inspectPaymentRequest(savedRequest, fingerprint);
    assert.deepEqual(replay, { action: "replay", orderId });
    const savedOrder = (await db.doc("testSeriesPaymentOrders/" + replay.orderId).get()).data();
    assert.equal(savedOrder.uid, uid);
    assert.equal(savedOrder.testId, paidTestId);
    assert.equal(savedOrder.amount, amount);
    assert.equal(savedOrder.currency, "INR");
    assert.equal(savedOrder.status, "created");

    const conflictingFingerprint = paymentRequestFingerprint({
      uid, testId: paidTestId, amount: amount + 100, currency: "INR"
    });
    assert.equal(inspectPaymentRequest(savedRequest, conflictingFingerprint).action, "reject");
  } finally {
    await Promise.all([requestRef, lockRef, testRef, entitlementRef, orderRef].map(ref => ref.delete().catch(() => {})));
  }
});

test("concurrent duplicate captured-payment deliveries grant exactly one entitlement", async () => {
  const paidTestId = "emulator-concurrent-payment-test";
  const orderId = "order_emulator_concurrent_payment";
  const paymentId = "pay_emulator_concurrent_payment";
  const eventId = "evt_emulator_concurrent_payment";
  const orderRef = db.doc("testSeriesPaymentOrders/" + orderId);
  const paymentRef = db.doc("testSeriesPayments/" + paymentId);
  const eventRef = db.doc("testSeriesPaymentEvents/" + eventId);
  const entitlementRef = db.doc("testSeriesEntitlements/" + uid + "_" + paidTestId);
  const event = {
    event: "payment.captured",
    payload: { payment: { entity: {
      id: paymentId, order_id: orderId, amount: 24900,
      currency: "INR", status: "captured"
    } } }
  };
  try {
    await orderRef.set({
      uid, testId: paidTestId, razorpayOrderId: orderId,
      amount: 24900, currency: "INR", status: "created"
    });
    const results = await Promise.all([
      applyCapturedPayment({ db, event, eventId }),
      applyCapturedPayment({ db, event, eventId })
    ]);
    assert.equal(results.filter(result => result.granted === true).length, 1);
    assert.equal(results.filter(result => result.duplicate === true).length, 1);
    assert.equal((await entitlementRef.get()).data().status, "active");
    assert.equal((await paymentRef.get()).exists, true);
    assert.equal((await eventRef.get()).data().status, "processed");
    assert.equal((await db.collection("testSeriesEntitlements")
      .where("uid", "==", uid).where("testId", "==", paidTestId).get()).size, 1);
  } finally {
    await Promise.all([orderRef, paymentRef, eventRef, entitlementRef].map(ref => ref.delete().catch(() => {})));
  }
});

test("webhook safely recovers after a transient Firestore transaction failure", async () => {
  const paidTestId = "emulator-firestore-recovery-test";
  const orderId = "order_emulator_firestore_recovery";
  const paymentId = "pay_emulator_firestore_recovery";
  const eventId = "evt_emulator_firestore_recovery";
  const webhookSecret = "emulator-firestore-recovery-secret";
  const orderRef = db.doc("testSeriesPaymentOrders/" + orderId);
  const paymentRef = db.doc("testSeriesPayments/" + paymentId);
  const eventRef = db.doc("testSeriesPaymentEvents/" + eventId);
  const entitlementRef = db.doc("testSeriesEntitlements/" + uid + "_" + paidTestId);
  const event = {
    event: "payment.captured",
    payload: { payment: { entity: {
      id: paymentId, order_id: orderId, amount: 7750,
      currency: "INR", status: "captured"
    } } }
  };
  const rawBody = Buffer.from(JSON.stringify(event));
  const signature = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  const req = {
    method: "POST", rawBody, body: event,
    get(name) {
      if (name === "x-razorpay-signature") return signature;
      if (name === "x-razorpay-event-id") return eventId;
      return undefined;
    }
  };
  function makeResponse() {
    return {
      code: null, body: null, set() { return this; },
      status(code) { this.code = code; return this; },
      send(body) { this.body = body; return this; },
      json(body) { this.body = body; return this; }
    };
  }
  let failOnce = true;
  const flakyDb = {
    doc: path => db.doc(path),
    runTransaction: (...args) => {
      if (failOnce) {
        failOnce = false;
        const error = new Error("simulated transient Firestore unavailable");
        error.code = "unavailable";
        return Promise.reject(error);
      }
      return db.runTransaction(...args);
    }
  };

  try {
    await orderRef.set({
      uid, testId: paidTestId, razorpayOrderId: orderId,
      amount: 7750, currency: "INR", status: "created"
    });
    const failedResponse = makeResponse();
    await handleRazorpayWebhook({
      req, res: failedResponse, secret: webhookSecret,
      db: flakyDb, applyPayment: applyCapturedPayment
    });
    assert.equal(failedResponse.code, 500);
    assert.equal((await orderRef.get()).data().status, "created");
    assert.equal((await paymentRef.get()).exists, false);
    assert.equal((await eventRef.get()).exists, false);
    assert.equal((await entitlementRef.get()).exists, false);

    const recoveredResponse = makeResponse();
    await handleRazorpayWebhook({
      req, res: recoveredResponse, secret: webhookSecret,
      db, applyPayment: applyCapturedPayment
    });
    assert.equal(recoveredResponse.code, 200);
    assert.deepEqual(recoveredResponse.body, { received: true, duplicate: false });
    assert.equal((await orderRef.get()).data().status, "paid");
    assert.equal((await paymentRef.get()).exists, true);
    assert.equal((await eventRef.get()).data().status, "processed");
    assert.equal((await entitlementRef.get()).data().status, "active");
  } finally {
    await Promise.all([orderRef, paymentRef, eventRef, entitlementRef].map(ref => ref.delete().catch(() => {})));
  }
});


test("refund webhook is retried when it arrives before the captured-payment ledger", async () => {
  const paidTestId = "emulator-refund-before-capture-test";
  const orderId = "order_emulator_refund_before_capture";
  const paymentId = "pay_emulator_refund_before_capture";
  const captureEventId = "evt_emulator_capture_after_refund";
  const refundEventId = "evt_emulator_refund_before_capture";
  const refundId = "rfnd_emulator_refund_before_capture";
  const webhookSecret = "emulator-refund-ordering-secret";
  const testRef = db.doc("testSeriesTests/" + paidTestId);
  const orderRef = db.doc("testSeriesPaymentOrders/" + orderId);
  const paymentRef = db.doc("testSeriesPayments/" + paymentId);
  const entitlementRef = db.doc("testSeriesEntitlements/" + uid + "_" + paidTestId);
  const refundRef = db.doc("testSeriesRefunds/" + refundId);
  const captureEventRef = db.doc("testSeriesPaymentEvents/" + captureEventId);
  const refundEventRef = db.doc("testSeriesPaymentEvents/" + refundEventId);
  const identity = {
    uid, testId: paidTestId, paymentId, razorpayOrderId: orderId,
    amount: 12550, currency: "INR"
  };
  const captureEvent = {
    event: "payment.captured",
    payload: { payment: { entity: {
      id: paymentId, order_id: orderId, amount: 12550,
      currency: "INR", status: "captured"
    } } }
  };
  const refundEvent = {
    event: "refund.processed",
    payload: {
      refund: { entity: {
        id: refundId, payment_id: paymentId, amount: 12550,
        currency: "INR", status: "processed"
      } },
      payment: { entity: {
        id: paymentId, amount: 12550, amount_refunded: 12550,
        currency: "INR", refund_status: "full", status: "refunded", captured: true
      } }
    }
  };
  function makeRequest(event, eventId) {
    const rawBody = Buffer.from(JSON.stringify(event));
    const signature = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    return {
      method: "POST", rawBody, body: event,
      get(name) {
        if (name === "x-razorpay-signature") return signature;
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
    await Promise.all([
      testRef.set({ title: "Refund Ordering Test", status: "published", price: 125.5, mode: "mock", durationMinutes: 10, questionCount: 1 }),
      orderRef.set({ ...identity, status: "created" })
    ]);

    const earlyRefundResponse = makeResponse();
    await handleRazorpayWebhook({
      req: makeRequest(refundEvent, refundEventId),
      res: earlyRefundResponse, secret: webhookSecret, db,
      applyPayment: applyCapturedPayment,
      applyRefund: applyProcessedRefund
    });
    assert.equal(earlyRefundResponse.code, 500, "refund must remain retryable until the captured-payment ledger exists");
    assert.equal((await paymentRef.get()).exists, false);
    assert.equal((await entitlementRef.get()).exists, false);
    assert.equal((await refundRef.get()).exists, false);
    assert.equal((await refundEventRef.get()).exists, false);

    const captureResponse = makeResponse();
    await handleRazorpayWebhook({
      req: makeRequest(captureEvent, captureEventId),
      res: captureResponse, secret: webhookSecret, db,
      applyPayment: applyCapturedPayment,
      applyRefund: applyProcessedRefund
    });
    assert.equal(captureResponse.code, 200);
    assert.deepEqual(captureResponse.body, { received: true, duplicate: false });

    const retriedRefundResponse = makeResponse();
    await handleRazorpayWebhook({
      req: makeRequest(refundEvent, refundEventId),
      res: retriedRefundResponse, secret: webhookSecret, db,
      applyPayment: applyCapturedPayment,
      applyRefund: applyProcessedRefund
    });
    assert.equal(retriedRefundResponse.code, 200);
    assert.deepEqual(retriedRefundResponse.body, { received: true, duplicate: false, revoked: true });
    assert.equal((await paymentRef.get()).data().status, "refunded");
    assert.equal((await orderRef.get()).data().status, "refunded");
    assert.equal((await entitlementRef.get()).data().status, "revoked");
    assert.equal((await refundRef.get()).data().status, "processed");

    // A delayed or duplicate capture webhook after the full refund is terminal:
    // acknowledge it, but never reactivate the entitlement or create replay
    // event documents for caller-selected event IDs.
    const sameCaptureReplay = makeResponse();
    await handleRazorpayWebhook({
      req: makeRequest(captureEvent, captureEventId),
      res: sameCaptureReplay, secret: webhookSecret, db,
      applyPayment: applyCapturedPayment,
      applyRefund: applyProcessedRefund
    });
    assert.equal(sameCaptureReplay.code, 200);
    assert.deepEqual(sameCaptureReplay.body, { received: true, duplicate: true });

    const delayedCaptureReplayId = "evt_capture_after_full_refund";
    const delayedCaptureReplay = makeResponse();
    await handleRazorpayWebhook({
      req: makeRequest(captureEvent, delayedCaptureReplayId),
      res: delayedCaptureReplay, secret: webhookSecret, db,
      applyPayment: applyCapturedPayment,
      applyRefund: applyProcessedRefund
    });
    assert.equal(delayedCaptureReplay.code, 200);
    assert.deepEqual(delayedCaptureReplay.body, { received: true, duplicate: true });
    assert.equal((await db.doc("testSeriesPaymentEvents/" + delayedCaptureReplayId).get()).exists, false);
    assert.equal((await paymentRef.get()).data().status, "refunded");
    assert.equal((await orderRef.get()).data().status, "refunded");
    assert.equal((await entitlementRef.get()).data().status, "revoked");
  } finally {
    await Promise.all([
      testRef, orderRef, paymentRef, entitlementRef, refundRef, captureEventRef, refundEventRef
    ].map(ref => ref.delete().catch(() => {})));
  }
});

test("verified full-refund webhook revokes paid catalogue and exam access", async () => {
  const paidTestId = "emulator-refund-access-test";
  const orderId = "order_emulator_refund_access";
  const paymentId = "pay_emulator_refund_access";
  const eventId = "evt_emulator_refund_access";
  const refundId = "rfnd_emulator_refund_access";
  const webhookSecret = "emulator-refund-webhook-secret";
  const testRef = db.doc("testSeriesTests/" + paidTestId);
  const orderRef = db.doc("testSeriesPaymentOrders/" + orderId);
  const paymentRef = db.doc("testSeriesPayments/" + paymentId);
  const entitlementRef = db.doc("testSeriesEntitlements/" + uid + "_" + paidTestId);
  const refundRef = db.doc("testSeriesRefunds/" + refundId);
  const eventRef = db.doc("testSeriesPaymentEvents/" + eventId);
  const identity = {
    uid, testId: paidTestId, paymentId, razorpayOrderId: orderId,
    amount: 12550, currency: "INR"
  };
  const event = {
    event: "refund.processed",
    payload: {
      refund: { entity: {
        id: refundId, payment_id: paymentId, amount: 12550,
        currency: "INR", status: "processed"
      } },
      payment: { entity: {
        id: paymentId, amount: 12550, amount_refunded: 12550,
        currency: "INR", refund_status: "full", status: "captured", captured: true
      } }
    }
  };
  const rawBody = Buffer.from(JSON.stringify(event));
  const signature = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  function makeRequest() {
    return {
      method: "POST", rawBody, body: event,
      get(name) {
        if (name === "x-razorpay-signature") return signature;
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
    await Promise.all([
      testRef.set({ title: "Refund Access Test", status: "published", price: 125.5, mode: "mock", durationMinutes: 10, questionCount: 1 }),
      orderRef.set({ ...identity, status: "paid" }),
      paymentRef.set({ ...identity, status: "captured" }),
      entitlementRef.set({ ...identity, status: "active" })
    ]);
    const before = await callable("rmListAvailableTests", { pageSize: 100 });
    assert.equal(before.tests.find(row => row.testId === paidTestId).accessType, "unlocked");

    const firstResponse = makeResponse();
    await handleRazorpayWebhook({
      req: makeRequest(), res: firstResponse, secret: webhookSecret, db,
      applyPayment: async () => assert.fail("refund event must not reach the capture processor"),
      applyRefund: applyProcessedRefund
    });
    assert.equal(firstResponse.code, 200);
    assert.deepEqual(firstResponse.body, { received: true, duplicate: false, revoked: true });
    assert.equal((await paymentRef.get()).data().status, "refunded");
    assert.equal((await orderRef.get()).data().status, "refunded");
    assert.equal((await entitlementRef.get()).data().status, "revoked");

    const after = await callable("rmListAvailableTests", { pageSize: 100 });
    assert.equal(after.tests.find(row => row.testId === paidTestId).accessType, "paid");
    await assert.rejects(
      () => callable("rmStartExam", { testId: paidTestId }),
      error => error.code === "functions/permission-denied"
    );

    const replayResponse = makeResponse();
    await handleRazorpayWebhook({
      req: makeRequest(), res: replayResponse, secret: webhookSecret, db,
      applyPayment: async () => assert.fail("refund replay must not reach the capture processor"),
      applyRefund: applyProcessedRefund
    });
    assert.deepEqual(replayResponse.body, { received: true, duplicate: true, revoked: true });
  } finally {
    await Promise.all([
      testRef, orderRef, paymentRef, entitlementRef, refundRef, eventRef
    ].map(ref => ref.delete().catch(() => {})));
  }
});

test("student test catalogue paginates published tests with stable document cursors", async () => {
  // Sort before all shared emulator fixtures so this test can coexist with them.
  const ids = [
    "0000-emulator-catalogue-page-a",
    "0000-emulator-catalogue-page-b",
    "0000-emulator-catalogue-page-c",
    "0000-emulator-catalogue-page-d",
    "0000-emulator-catalogue-page-e"
  ];
  const refs = ids.map(id => db.doc("testSeriesTests/" + id));
  try {
    const batch = db.batch();
    refs.forEach((ref, index) => batch.set(ref, {
      title: "Catalogue Page " + index,
      status: "published",
      price: 0,
      mode: "mock",
      durationMinutes: 10,
      questionCount: 1
    }));
    await batch.commit();

    const collected = [];
    let cursor = null;
    let pageCount = 0;
    let hasMore = true;
    while (hasMore && pageCount < 20) {
      const page = await callable("rmListAvailableTests", { pageSize: 2, ...(cursor ? { cursor } : {}) });
      assert.ok(page.tests.length <= 2);
      collected.push(...page.tests.map(item => item.testId));
      hasMore = page.hasMore;
      cursor = page.nextCursor;
      pageCount++;
      if (hasMore) assert.ok(cursor);
      else assert.equal(cursor, null);
    }
    assert.equal(hasMore, false, "catalogue cursor must reach the end");
    assert.ok(pageCount >= 3);
    const fixtureIds = collected.filter(id => ids.includes(id));
    assert.deepEqual(fixtureIds, ids);
    assert.equal(new Set(collected).size, collected.length);

    await assert.rejects(
      callable("rmListAvailableTests", { pageSize: 0 }),
      error => error.code === "functions/invalid-argument"
    );
    await assert.rejects(
      callable("rmListAvailableTests", { pageSize: 2, cursor: "zzzz-emulator-missing-catalogue-cursor" }),
      error => error.code === "functions/invalid-argument"
    );
  } finally {
    await Promise.all(refs.map(ref => ref.delete().catch(() => {})));
  }
});


test("a fully refunded captured payment stays locked in the catalogue and rmStartExam", async () => {
  const paidTestId = "emulator-full-refund-stale-capture";
  const testRef = db.doc("testSeriesTests/" + paidTestId);
  const activeRef = db.doc("testSeriesActiveSessions/" + uid);
  const previousActive = await activeRef.get();
  let paidAccess = null;
  let unexpectedAttemptId = null;

  try {
    await testRef.set({
      title: "Fully Refunded Paid Test",
      status: "published",
      price: 25,
      mode: "mock",
      durationMinutes: 10,
      questionCount: 1
    });
    paidAccess = await seedPaidAccess({
      testId: paidTestId,
      paymentId: "pay_emulator_full_refund_stale_capture",
      orderId: "order_emulator_full_refund_stale_capture",
      amount: 2500
    });

    // Simulate a stale captured status after the cumulative refund reaches the
    // original amount. Both the catalogue hint and transactional start guard
    // must consult the same complete payment ledger.
    await paidAccess.paymentRef.update({ amountRefunded: 2500 });
    const payment = (await paidAccess.paymentRef.get()).data();
    assert.equal(payment.status, "captured");
    assert.equal(payment.amountRefunded, payment.amount);

    const catalogue = await callable("rmListAvailableTests");
    const listed = catalogue.tests.find(item => item.testId === paidTestId);
    assert.ok(listed);
    assert.equal(listed.accessType, "paid");

    // Remove any previous active pointer so this assertion isolates the
    // entitlement decision; restore it in finally for the surrounding suite.
    await activeRef.delete().catch(() => {});
    let startError = null;
    try {
      const started = await callable("rmStartExam", { testId: paidTestId });
      unexpectedAttemptId = started.attemptId;
    } catch (error) {
      startError = error;
    }
    assert.ok(startError, "a fully refunded payment must not start a paid attempt");
    assert.equal(startError.code, "functions/permission-denied");
    assert.equal((await activeRef.get()).exists, false);
  } finally {
    if (unexpectedAttemptId) {
      await db.doc("testSeriesAttempts/" + unexpectedAttemptId).delete().catch(() => {});
      await db.doc("testSeriesResults/" + unexpectedAttemptId).delete().catch(() => {});
    }
    if (previousActive.exists) await activeRef.set(previousActive.data()).catch(() => {});
    else await activeRef.delete().catch(() => {});
    await testRef.delete().catch(() => {});
    if (paidAccess) {
      await Promise.all([
        paidAccess.paymentRef.delete().catch(() => {}),
        paidAccess.orderRef.delete().catch(() => {}),
        paidAccess.entitlementRef.delete().catch(() => {})
      ]);
    }
  }
});


test("CBT save, resume and scoring preserve prototype-sensitive question IDs as literal fields", async () => {
  const specialTestId = "emulator-prototype-question-id";
  const attemptId = "emulator-prototype-question-attempt";
  const unansweredAttemptId = "emulator-prototype-question-unanswered-attempt";
  const questionIds = ["__proto__", "constructor", "toString"];
  const testRef = db.doc("testSeriesTests/" + specialTestId);
  const paperRef = db.doc("testSeriesQuestionSets/" + specialTestId);
  const keyRef = db.doc("testSeriesAnswerKeys/" + specialTestId);
  const attemptRef = db.doc("testSeriesAttempts/" + attemptId);
  const resultRef = db.doc("testSeriesResults/" + attemptId);
  const unansweredAttemptRef = db.doc("testSeriesAttempts/" + unansweredAttemptId);
  const unansweredResultRef = db.doc("testSeriesResults/" + unansweredAttemptId);
  const activeRef = db.doc("testSeriesActiveSessions/" + uid);
  const previousActive = await activeRef.get();
  const answerQuestions = {};
  for (const questionId of questionIds) addExamAnswerKeyEntry(answerQuestions, questionId, 1);

  try {
    await Promise.all([
      testRef.set({
        title: "Prototype ID Regression",
        status: "published",
        price: 0,
        mode: "mock",
        durationMinutes: 10,
        marksPerQuestion: 2,
        negativeMarks: 0.5,
        questionCount: questionIds.length,
        sections: []
      }),
      paperRef.set({
        questions: questionIds.map((id, index) => ({
          id,
          text: `Prototype-safe question ${index + 1}?`,
          options: ["A", "B"]
        }))
      }),
      keyRef.set({ questions: answerQuestions }),
      attemptRef.set({
        uid,
        testId: specialTestId,
        mode: "mock",
        status: "in_progress",
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 60_000),
        answers: {}
      })
    ]);

    const delivered = await callable("rmGetExamQuestions", { attemptId });
    assert.deepEqual(delivered.questions.map(question => question.id), questionIds);
    for (const questionId of questionIds) {
      assert.equal(Object.hasOwn(delivered.savedAnswers, questionId), false);
      await callable("rmSaveAnswer", { attemptId, questionId, answer: "1" });
    }

    const storedAttempt = (await attemptRef.get()).data();
    for (const questionId of questionIds) {
      const storageKey = studentAnswerStorageKey(questionId);
      assert.equal(Object.prototype.hasOwnProperty.call(storedAttempt.answers, storageKey), true);
      assert.equal(storedAttempt.answers[storageKey], "1");
    }

    const resumed = await callable("rmGetExamQuestions", { attemptId });
    const resumedSavedAnswers = Object.fromEntries(resumed.savedAnswerEntries);
    for (const questionId of questionIds) {
      assert.equal(Object.hasOwn(resumedSavedAnswers, questionId), true);
      assert.equal(resumedSavedAnswers[questionId], "1");
    }

    const scored = await callable("rmSubmitExam", { attemptId });
    assert.equal(scored.submitted, true);
    assert.equal(scored.correct, questionIds.length);
    assert.equal(scored.wrong, 0);
    assert.equal(scored.score, questionIds.length * 2);

    // An empty answer map must not inherit Object.prototype members for special IDs.
    await unansweredAttemptRef.set({
      uid,
      testId: specialTestId,
      mode: "mock",
      status: "in_progress",
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 60_000),
      answers: {}
    });
    const unansweredPayload = await callable("rmGetExamQuestions", { attemptId: unansweredAttemptId });
    assert.deepEqual(unansweredPayload.savedAnswers, {});
    const unanswered = await callable("rmSubmitExam", { attemptId: unansweredAttemptId });
    assert.equal(unanswered.submitted, true);
    assert.equal(unanswered.correct, 0);
    assert.equal(unanswered.wrong, 0);
    assert.equal(unanswered.unattempted, questionIds.length);
    assert.equal(unanswered.score, 0);
  } finally {
    await Promise.all([
      testRef.delete().catch(() => {}),
      paperRef.delete().catch(() => {}),
      keyRef.delete().catch(() => {}),
      attemptRef.delete().catch(() => {}),
      resultRef.delete().catch(() => {}),
      unansweredAttemptRef.delete().catch(() => {}),
      unansweredResultRef.delete().catch(() => {})
    ]);
    if (previousActive.exists) await activeRef.set(previousActive.data()).catch(() => {});
    else await activeRef.delete().catch(() => {});
  }
});


test("late submission of an expired attempt does not replace a newer active exam session", async () => {
  const oldAttemptId = "emulator-late-submit-old-attempt";
  const newAttemptId = "emulator-late-submit-new-attempt";
  const oldAttemptRef = db.doc("testSeriesAttempts/" + oldAttemptId);
  const newAttemptRef = db.doc("testSeriesAttempts/" + newAttemptId);
  const oldResultRef = db.doc("testSeriesResults/" + oldAttemptId);
  const activeRef = db.doc("testSeriesActiveSessions/" + uid);
  const previousActive = await activeRef.get();
  const now = Date.now();

  try {
    await Promise.all([
      oldAttemptRef.set({
        uid, testId, mode: "mock", status: "in_progress",
        startedAt: new Date(now - 60 * 60_000),
        expiresAt: new Date(now - 30 * 60_000),
        answers: {}
      }),
      newAttemptRef.set({
        uid, testId, mode: "mock", status: "in_progress",
        startedAt: new Date(now),
        expiresAt: new Date(now + 30 * 60_000),
        answers: {}
      }),
      activeRef.set({
        uid, testId, attemptId: newAttemptId, status: "in_progress",
        startedAt: new Date(now), expiresAt: new Date(now + 30 * 60_000)
      })
    ]);

    const submitted = await callable("rmSubmitExam", { attemptId: oldAttemptId });
    assert.equal(submitted.submitted, true);
    assert.equal(submitted.timedOut, true);
    assert.equal((await oldAttemptRef.get()).data().status, "submitted");

    const activeAfterLateSubmit = (await activeRef.get()).data();
    assert.equal(activeAfterLateSubmit.status, "in_progress");
    assert.equal(activeAfterLateSubmit.attemptId, newAttemptId);
    assert.equal((await newAttemptRef.get()).data().status, "in_progress");
  } finally {
    await Promise.all([
      oldAttemptRef.delete().catch(() => {}),
      newAttemptRef.delete().catch(() => {}),
      oldResultRef.delete().catch(() => {})
    ]);
    if (previousActive.exists) await activeRef.set(previousActive.data()).catch(() => {});
    else await activeRef.delete().catch(() => {});
  }
});
