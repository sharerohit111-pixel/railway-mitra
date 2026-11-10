"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "railway-mitra";
const REGION = "asia-south1";
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const FUNCTIONS_HOST = process.env.FUNCTIONS_EMULATOR_HOST || "127.0.0.1:5001";
process.env.GCLOUD_PROJECT = PROJECT_ID;
process.env.GOOGLE_CLOUD_PROJECT = PROJECT_ID;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const auth = getAuth();
const db = getFirestore();
const suffix = String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8);
const freeTestId = "emulator-free-" + suffix;
const paidTestId = "emulator-paid-" + suffix;
const adminEmail = "admin-" + suffix + "@example.test";
const candidateEmail = "candidate-" + suffix + "@example.test";
const password = "TestOnly-Password-123!";
let adminUid, candidateUid, adminToken, candidateToken;
async function authRequest(path, body) {
  const response = await fetch("http://" + AUTH_HOST + "/identitytoolkit.googleapis.com/v1/" + path + "?key=fake-api-key", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error("Auth emulator " + path + " failed: " + JSON.stringify(data));
  return data;
}
async function createUser(email) {
  const result = await authRequest("accounts:signUp", { email, password, returnSecureToken: true });
  return result.localId;
}
async function signIn(email) {
  const result = await authRequest("accounts:signInWithPassword", { email, password, returnSecureToken: true });
  return result.idToken;
}
async function call(name, token, data) {
  const response = await fetch("http://" + FUNCTIONS_HOST + "/" + PROJECT_ID + "/" + REGION + "/" + name, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
    body: JSON.stringify({ data })
  });
  return { status: response.status, body: await response.json() };
}
async function seedTest(testId, access) {
  const questions = [
    { questionId: "q1", questionNumber: 1, questionText: "2 + 2 = ?", options: [{ key: "A", text: "3" }, { key: "B", text: "4" }], subject: "Test" },
    { questionId: "q2", questionNumber: 2, questionText: "Capital of India?", options: [{ key: "A", text: "Mumbai" }, { key: "B", text: "New Delhi" }], subject: "Test" }
  ];
  const batch = db.batch();
  batch.set(db.collection("examTestCatalog").doc(testId), {
    testId, title: "Emulator " + access + " test", streamId: "gdce-je-civil",
    streamTitle: "GDCE JE Civil Engineering", category: "mock", totalQuestions: 2,
    durationMinutes: 15, positiveMarksPerQuestion: 1, negativeMarksPerWrongAnswer: 0.33,
    access, subscriptionRequired: access === "paid", published: true, updatedAt: FieldValue.serverTimestamp()
  });
  for (const q of questions) {
    batch.set(db.collection("examTests").doc(testId).collection("questionsPublic").doc(q.questionId), q);
    batch.set(db.collection("examTests").doc(testId).collection("answerKeys").doc(q.questionId), {
      correctOption: "B", explanation: "Emulator-only verified answer."
    });
  }
  await batch.commit();
}
before(async () => {
  adminUid = await createUser(adminEmail);
  candidateUid = await createUser(candidateEmail);
  await auth.setCustomUserClaims(adminUid, { admin: true });
  adminToken = await signIn(adminEmail);
  candidateToken = await signIn(candidateEmail);
  await seedTest(freeTestId, "free");
  await seedTest(paidTestId, "paid");
});
after(async () => {
  for (const uid of [adminUid, candidateUid].filter(Boolean)) {
    await db.collection("users").doc(uid).collection("examAttempts").get()
      .then(s => Promise.all(s.docs.map(d => d.ref.delete()))).catch(() => {});
    await auth.deleteUser(uid).catch(() => {});
  }
  for (const testId of [freeTestId, paidTestId]) {
    await db.collection("examTestCatalog").doc(testId).delete().catch(() => {});
    for (const sub of ["questionsPublic", "answerKeys"]) {
      const snap = await db.collection("examTests").doc(testId).collection(sub).get().catch(() => ({ docs: [] }));
      await Promise.all(snap.docs.map(d => d.ref.delete()));
    }
  }
});
test("unauthenticated calls are rejected", async () => {
  const result = await call("listPublishedTests", null, { streamId: "gdce-je-civil", category: "mock" });
  assert.notEqual(result.status, 200);
  assert.equal(result.body.error && result.body.error.status, "UNAUTHENTICATED");
});
test("candidate sees metadata and starts free test without answer keys", async () => {
  const list = await call("listPublishedTests", candidateToken, { streamId: "gdce-je-civil", category: "mock" });
  assert.equal(list.status, 200);
  assert.ok(list.body.result.tests.some(x => x.testId === freeTestId));
  const started = await call("startExam", candidateToken, { testId: freeTestId });
  assert.equal(started.status, 200);
  assert.equal(started.body.result.questions.length, 2);
  assert.ok(started.body.result.deadlineAtMs > started.body.result.serverNowMs);
  for (const q of started.body.result.questions) {
    assert.equal("correctOption" in q, false);
    assert.equal("explanation" in q, false);
  }
  const attemptId = started.body.result.attemptId;
  const submitted = await call("submitExam", candidateToken, { attemptId, answers: { q1: "B", q2: "A" } });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.result.result.correct, 1);
  assert.equal(submitted.body.result.result.wrong, 1);
  assert.equal(submitted.body.result.result.unattempted, 0);
  const repeated = await call("submitExam", candidateToken, { attemptId, answers: { q1: "A", q2: "A" } });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.result.alreadySubmitted, true);
  assert.equal(repeated.body.result.result.correct, 1);
});
test("paid test is denied without trusted entitlement", async () => {
  const result = await call("startExam", candidateToken, { testId: paidTestId });
  assert.notEqual(result.status, 200);
  assert.equal(result.body.error && result.body.error.status, "PERMISSION_DENIED");
});
test("non-admin cannot publish; owner admin can publish verified test", async () => {
  const testId = "admin-publish-" + suffix;
  const testInput = {
    testId, title: "Admin publish emulator test", streamId: "gdce-je-civil",
    streamTitle: "GDCE JE Civil Engineering", category: "practice", sourceLabel: "Emulator source paper", sourceYear: 2025,
    durationMinutes: 20, positiveMarksPerQuestion: 1, negativeMarksPerWrongAnswer: 0.25,
    published: true,
    questions: [{
      questionId: "q1", questionNumber: 1, questionText: "Emulator publish question?",
      options: [{ key: "A", text: "No" }, { key: "B", text: "Yes" }],
      correctOption: "B", explanation: "Test explanation.", verificationStatus: "verified"
    }]
  };
  const denied = await call("adminPublishTest", candidateToken, { test: testInput });
  assert.notEqual(denied.status, 200);
  assert.equal(denied.body.error && denied.body.error.status, "PERMISSION_DENIED");
  const published = await call("adminPublishTest", adminToken, { test: testInput });
  assert.equal(published.status, 200);
  assert.equal(published.body.result.published, true);
  assert.equal(published.body.result.access, "paid");
  const catalogueRecord = await db.collection("examTestCatalog").doc(testId).get();
  assert.equal(catalogueRecord.data().sourceLabel, "Emulator source paper");
  assert.equal(catalogueRecord.data().sourceYear, 2025);
  await db.collection("examTestCatalog").doc(testId).delete();
  await db.collection("examTests").doc(testId).collection("questionsPublic").doc("q1").delete();
  await db.collection("examTests").doc(testId).collection("answerKeys").doc("q1").delete();

  const ldceTestId = "ldce-first-mock-" + suffix;
  const ldceInput = { ...testInput, testId: ldceTestId, title: "LDCE first mock emulator test", streamId: "ldce-je-civil", streamTitle: "LDCE JE Civil Engineering", category: "mock" };
  const ldcePublished = await call("adminPublishTest", adminToken, { test: ldceInput });
  assert.equal(ldcePublished.status, 200);
  assert.equal(ldcePublished.body.result.access, "free");
  await db.collection("examTestCatalog").doc(ldceTestId).delete();
  await db.collection("examTests").doc(ldceTestId).collection("questionsPublic").doc("q1").delete();
  await db.collection("examTests").doc(ldceTestId).collection("answerKeys").doc("q1").delete();
});


const subscriptionPaymentRef = "upi-sub-" + suffix;
const materialPaymentRef = "upi-mat-" + suffix;
const materialFileId = "material-" + suffix;
test("owner-only finance ledger records and approves subscription and material payments", async () => {
  const denied = await call("adminGetFinanceSettings", candidateToken, {});
  assert.notEqual(denied.status, 200);
  assert.equal(denied.body.error && denied.body.error.status, "PERMISSION_DENIED");

  const defaults = await call("adminGetFinanceSettings", adminToken, {});
  assert.equal(defaults.status, 200);
  assert.equal(defaults.body.result.subscriptionPrice, 300);
  assert.equal(defaults.body.result.subscriptionDays, 30);

  const storeSettings = await call("getPublicStoreSettings", candidateToken, {});
  assert.equal(storeSettings.status, 200);
  assert.equal(storeSettings.body.result.subscriptionPrice, 300);
  const recorded = await call("createCandidatePaymentRequest", candidateToken, {
    reference: subscriptionPaymentRef, type: "subscription"
  });
  assert.equal(recorded.status, 200);
  assert.equal(recorded.body.result.amount, 300);
  const myRequests = await call("getMyPaymentRequests", candidateToken, {});
  assert.ok(myRequests.body.result.payments.some(p => p.reference === subscriptionPaymentRef));

  const approved = await call("adminApprovePayment", adminToken, {
    uid: candidateUid, reference: subscriptionPaymentRef
  });
  assert.equal(approved.status, 200);
  assert.ok(approved.body.result.expiresAt);

  const entitlement = await db.collection("userEntitlements").doc(candidateUid).get();
  assert.equal(entitlement.data().active, true);
  assert.ok(entitlement.data().expiresAt.toMillis() > Date.now());

  await db.collection("examContentFiles").doc(materialFileId).set({
    name: "Emulator Study PDF", price: 50, storagePath: "emulator-only/no-real-file.pdf"
  });
  const priced = await call("adminSetMaterialPrice", adminToken, { fileId: materialFileId, price: 75 });
  assert.equal(priced.status, 200);
  assert.equal(priced.body.result.price, 75);
  const published = await call("adminSetMaterialPublication", adminToken, { fileId: materialFileId, published: true });
  assert.equal(published.status, 200);
  const materials = await call("listStudyMaterials", candidateToken, {});
  assert.ok(materials.body.result.materials.some(x => x.id === materialFileId && x.price === 75));
  const materialRecorded = await call("createCandidatePaymentRequest", candidateToken, {
    reference: materialPaymentRef, type: "study-material", materialId: materialFileId
  });
  assert.equal(materialRecorded.status, 200);
  assert.equal(materialRecorded.body.result.amount, 75);

  const materialApproved = await call("adminApprovePayment", adminToken, {
    uid: candidateUid, reference: materialPaymentRef
  });
  assert.equal(materialApproved.status, 200);
  const materialEntitlement = await db.collection("materialEntitlements").doc(candidateUid)
    .collection("items").doc(materialFileId).get();
  assert.equal(materialEntitlement.data().active, true);
});

after(async () => {
  for (const ref of [subscriptionPaymentRef, materialPaymentRef]) {
    await db.collection("paymentRecords").doc(ref).delete().catch(() => {});
  }
  await db.collection("appSettings").doc("finance").delete().catch(() => {});
  await db.collection("userEntitlements").doc(candidateUid).delete().catch(() => {});
  await db.collection("materialEntitlements").doc(candidateUid).collection("items").doc(materialFileId).delete().catch(() => {});
  await db.collection("examContentFiles").doc(materialFileId).delete().catch(() => {});
});

test("owner can recursively delete a folder tree while protected root folders remain", async () => {
  const roots = await call("listExamContent", adminToken, { parentId: null });
  assert.equal(roots.status, 200);
  const parent = await call("createExamContentFolder", adminToken, { name: "Delete tree " + suffix, parentId: "root_ldce" });
  assert.equal(parent.status, 200);
  const child = await call("createExamContentFolder", adminToken, { name: "Nested " + suffix, parentId: parent.body.result.id });
  assert.equal(child.status, 200);
  const denied = await call("deleteExamContentFolder", candidateToken, { folderId: parent.body.result.id });
  assert.notEqual(denied.status, 200);
  assert.equal(denied.body.error && denied.body.error.status, "PERMISSION_DENIED");
  const deleted = await call("deleteExamContentFolder", adminToken, { folderId: parent.body.result.id });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.result.deletedFolders, 2);
  const missing = await call("searchExamContent", adminToken, { folderId: child.body.result.id });
  assert.notEqual(missing.status, 200);
  const rootDelete = await call("deleteExamContentFolder", adminToken, { folderId: "root_ldce" });
  assert.notEqual(rootDelete.status, 200);
  assert.equal(rootDelete.body.error && rootDelete.body.error.status, "FAILED_PRECONDITION");
});

test("candidate can view only their own exam history", async () => {
  const mine = await call("getMyExamAttempts", candidateToken, {});
  assert.equal(mine.status, 200);
  assert.ok(mine.body.result.attempts.some(x => x.testId === freeTestId));
});
test("candidate attempt records are visible only to the owner", async () => {
  const denied = await call("adminListExamAttempts", candidateToken, { limit: 100 });
  assert.notEqual(denied.status, 200);
  assert.equal(denied.body.error && denied.body.error.status, "PERMISSION_DENIED");
  const allowed = await call("adminListExamAttempts", adminToken, { limit: 100 });
  assert.equal(allowed.status, 200);
  assert.ok(allowed.body.result.attempts.some(x => x.uid === candidateUid && x.testId === freeTestId));
});
