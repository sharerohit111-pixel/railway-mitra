const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
initializeApp();
const db = getFirestore(), REGION = "asia-south1";
function user(req) {
  console.info("CBT auth context", {
    hasAuth: Boolean(req.auth),
    hasUid: Boolean(req.auth && req.auth.uid)
  });
  if (!req.auth) throw new HttpsError("unauthenticated", "Mobile OTP login required");
  return req.auth.uid;
}
function owner(req) {
  const uid = user(req);
  if (!process.env.OWNER_UID || uid !== process.env.OWNER_UID) throw new HttpsError("permission-denied", "Owner access denied");
  if (!(req.auth.token.firebase || {}).sign_in_second_factor) throw new HttpsError("permission-denied", "Owner OTP verification required");
  return uid;
}
function id(v) { if (typeof v !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(v)) throw new HttpsError("invalid-argument", "Invalid identifier"); return v; }
function date(v) { return v && v.toDate ? v.toDate() : (v ? new Date(v) : null); }

exports.rmClaimFreeAttempt = onCall({ region: REGION, enforceAppCheck: true }, async req => {
  const uid = user(req), claimRef = db.doc("testSeriesFreeAttempts/" + uid), configRef = db.doc("testSeriesConfig/freeTest");
  return db.runTransaction(async tx => {
    const [claim, config] = await Promise.all([tx.get(claimRef), tx.get(configRef)]);
    if (claim.exists) throw new HttpsError("already-exists", "Free attempt already claimed");
    if (!config.exists || !config.data().enabled || !config.data().testId) throw new HttpsError("failed-precondition", "Free test unavailable");
    const testId = id(config.data().testId), testRef = db.doc("testSeriesTests/" + testId), test = await tx.get(testRef);
    if (!test.exists || test.data().status !== "published" || Number(test.data().price) !== 0) throw new HttpsError("failed-precondition", "Free test is not published");
    const attemptRef = db.collection("testSeriesAttempts").doc();
    tx.create(claimRef, { uid, testId, attemptId: attemptRef.id, claimedAt: FieldValue.serverTimestamp() });
    tx.create(attemptRef, { uid, testId, mode: test.data().mode || "mock", status: "created", createdAt: FieldValue.serverTimestamp() });
    return { attemptId: attemptRef.id, testId };
  });
});

exports.rmStartExam = onCall({ region: REGION, enforceAppCheck: true }, async req => {
  const uid = user(req), testId = id(req.data && req.data.testId), testRef = db.doc("testSeriesTests/" + testId);
  return db.runTransaction(async tx => {
    const testSnap = await tx.get(testRef);
    if (!testSnap.exists) throw new HttpsError("not-found", "Test not found");
    const test = testSnap.data(), now = new Date();
    if (test.status !== "published") throw new HttpsError("failed-precondition", "Test is not available");
    if (test.mode === "scheduled") {
      const start = date(test.scheduleStartAt), end = date(test.scheduleEndAt);
      if (!start || !end || now < start || now > end) throw new HttpsError("failed-precondition", "Exam is outside its scheduled window");
    }
    if (Number(test.price || 0) > 0) {
      const ent = await tx.get(db.doc("testSeriesEntitlements/" + uid + "_" + testId));
      if (!ent.exists || ent.data().status !== "active") throw new HttpsError("permission-denied", "Paid test access required");
    }
    const activeRef = db.doc("testSeriesActiveSessions/" + uid), active = await tx.get(activeRef);
    if (active.exists && active.data().status === "in_progress" && date(active.data().expiresAt) > now) {
      if (active.data().testId !== testId) throw new HttpsError("already-exists", "Another exam session is active");
      return { attemptId: active.data().attemptId, startedAt: date(active.data().startedAt).toISOString(), expiresAt: date(active.data().expiresAt).toISOString(), resumed: true };
    }
    const attemptRef = db.collection("testSeriesAttempts").doc(), duration = Math.max(1, Math.min(240, Number(test.durationMinutes || 30)));
    const startedAt = Timestamp.now(), expiresAt = Timestamp.fromDate(new Date(now.getTime() + duration * 60000));
    tx.create(attemptRef, { uid, testId, mode: test.mode || "mock", status: "in_progress", startedAt, expiresAt, answers: {}, updatedAt: FieldValue.serverTimestamp() });
    tx.set(activeRef, { uid, testId, attemptId: attemptRef.id, status: "in_progress", startedAt, expiresAt });
    return { attemptId: attemptRef.id, startedAt: startedAt.toDate().toISOString(), expiresAt: expiresAt.toDate().toISOString(), resumed: false };
  });
});

exports.rmSaveAnswer = onCall({ region: REGION, enforceAppCheck: true }, async req => {
  const uid = user(req), attemptId = id(req.data && req.data.attemptId), questionId = id(req.data && req.data.questionId), answer = req.data && req.data.answer;
  if (!(typeof answer === "string" || typeof answer === "number" || typeof answer === "boolean" || answer === null)) throw new HttpsError("invalid-argument", "Answer must be scalar");
  const ref = db.doc("testSeriesAttempts/" + attemptId);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().uid !== uid) throw new HttpsError("permission-denied", "Attempt not found");
    const a = snap.data();
    if (a.status !== "in_progress" || date(a.expiresAt) <= new Date()) throw new HttpsError("failed-precondition", "Exam is closed");
    tx.update(ref, { ["answers." + questionId]: answer, updatedAt: FieldValue.serverTimestamp() });
  });
  return { saved: true };
});

exports.rmSubmitExam = onCall({ region: REGION, enforceAppCheck: true }, async req => {
  const uid = user(req), attemptId = id(req.data && req.data.attemptId), ref = db.doc("testSeriesAttempts/" + attemptId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().uid !== uid) throw new HttpsError("permission-denied", "Attempt not found");
    const a = snap.data();
    if (a.status === "submitted") return { submitted: true, score: a.score, correct: a.correct, wrong: a.wrong, unattempted: a.unattempted };
    if (a.status !== "in_progress") throw new HttpsError("failed-precondition", "Attempt cannot be submitted");
    const [testSnap, keySnap] = await Promise.all([tx.get(db.doc("testSeriesTests/" + a.testId)), tx.get(db.doc("testSeriesAnswerKeys/" + a.testId))]);
    if (!testSnap.exists || !keySnap.exists) throw new HttpsError("failed-precondition", "Answer key not configured");
    const test = testSnap.data(), keys = keySnap.data().questions || {}, answers = a.answers || {};
    let correct = 0, wrong = 0, unattempted = 0;
    for (const qid of Object.keys(keys)) {
      const given = answers[qid];
      if (given === undefined || given === null || given === "") unattempted++;
      else if (String(given) === String(keys[qid].correctAnswer)) correct++;
      else wrong++;
    }
    const score = correct * Number(test.marksPerQuestion ?? 1) - wrong * Number(test.negativeMarks ?? 0);
    tx.update(ref, { status: "submitted", submittedAt: FieldValue.serverTimestamp(), correct, wrong, unattempted, score, totalQuestions: Object.keys(keys).length });
    tx.set(db.doc("testSeriesResults/" + attemptId), { uid, testId: a.testId, attemptId, correct, wrong, unattempted, score, totalQuestions: Object.keys(keys).length, submittedAt: FieldValue.serverTimestamp() });
    tx.set(db.doc("testSeriesActiveSessions/" + uid), { uid, status: "completed", attemptId, testId: a.testId, completedAt: FieldValue.serverTimestamp() });
    return { submitted: true, correct, wrong, unattempted, score, totalQuestions: Object.keys(keys).length };
  });
});

exports.rmGetOwnerAdminSession = onCall({ region: REGION, enforceAppCheck: true }, async req => {
  const uid = owner(req);
  return { authorized: true, uid, email: req.auth.token.email || null };
});
