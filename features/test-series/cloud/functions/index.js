const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { hasVerifiedPhoneMfa } = require("./owner-auth");
const { defineSecret } = require("firebase-functions/params");
const { createRazorpayOrder } = require("./razorpay-order");
const { verifyRazorpayWebhookSignature } = require("./razorpay-webhook-signature");
const { applyCapturedPayment } = require("./payment-ledger");
const { handleRazorpayWebhook } = require("./razorpay-webhook-handler");
const { rupeesToPaise } = require("./payment-price");
const RAZORPAY_WEBHOOK_SECRET = defineSecret("RAZORPAY_WEBHOOK_SECRET");
const RAZORPAY_KEY_ID = defineSecret("RAZORPAY_KEY_ID");
const RAZORPAY_KEY_SECRET = defineSecret("RAZORPAY_KEY_SECRET");
initializeApp();
const db = getFirestore(), REGION = "asia-south1";
// The Functions Emulator cannot provide production App Check attestation; keep enforcement enabled everywhere else.
const CALLABLE_OPTIONS = { region: REGION, enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true" };
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
  if (!hasVerifiedPhoneMfa(req.auth.token)) throw new HttpsError("permission-denied", "Owner phone OTP verification required");
  return uid;
}
function id(v) { if (typeof v !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(v)) throw new HttpsError("invalid-argument", "Invalid identifier"); return v; }
function date(v) { return v && v.toDate ? v.toDate() : (v ? new Date(v) : null); }

exports.rmClaimFreeAttempt = onCall(CALLABLE_OPTIONS, async req => {
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

exports.rmStartExam = onCall(CALLABLE_OPTIONS, async req => {
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
    let freeClaimSnap = null;
    if (Number(test.price || 0) > 0) {
      const ent = await tx.get(db.doc("testSeriesEntitlements/" + uid + "_" + testId));
      const entitlement = ent.exists ? ent.data() : null;
      // Bind every server-created entitlement to both the authenticated student and requested test.
      // A matching document path/status alone must never grant access to a different identity or test.
      if (!entitlement || entitlement.uid !== uid || entitlement.testId !== testId || entitlement.status !== "active") {
        throw new HttpsError("permission-denied", "Paid test access required");
      }
    } else {
      // A free test can only be started through the one-time claim flow.
      freeClaimSnap = await tx.get(db.doc("testSeriesFreeAttempts/" + uid));
      if (!freeClaimSnap.exists || freeClaimSnap.data().testId !== testId) {
        throw new HttpsError("permission-denied", "Claim the free test before starting");
      }
    }
    const activeRef = db.doc("testSeriesActiveSessions/" + uid), active = await tx.get(activeRef);
    if (active.exists && active.data().status === "in_progress" && date(active.data().expiresAt) > now) {
      const activeAttemptId = id(active.data().attemptId);
      const activeAttemptSnap = await tx.get(db.doc("testSeriesAttempts/" + activeAttemptId));
      if (activeAttemptSnap.exists) {
        const activeAttempt = activeAttemptSnap.data();
        const validActiveAttempt = activeAttempt.uid === uid &&
          activeAttempt.testId === active.data().testId &&
          activeAttempt.status === "in_progress" && date(activeAttempt.expiresAt) > now;
        if (validActiveAttempt) {
          if (active.data().testId !== testId) {
            throw new HttpsError("already-exists", "Another exam session is active");
          }
          return {
            attemptId: activeAttemptId,
            startedAt: date(activeAttempt.startedAt).toISOString(),
            expiresAt: date(activeAttempt.expiresAt).toISOString(),
            resumed: true
          };
        }
      }
      // A stale session pointer is not a valid active attempt; continue through normal creation checks.
    }
    const attemptRef = freeClaimSnap
      ? db.doc("testSeriesAttempts/" + freeClaimSnap.data().attemptId)
      : db.collection("testSeriesAttempts").doc();
    const duration = Math.max(1, Math.min(240, Number(test.durationMinutes || 30)));
    const startedAt = Timestamp.now(), expiresAt = Timestamp.fromDate(new Date(now.getTime() + duration * 60000));
    if (freeClaimSnap) {
      const claimedAttempt = await tx.get(attemptRef);
      if (!claimedAttempt.exists || claimedAttempt.data().uid !== uid || claimedAttempt.data().testId !== testId) {
        throw new HttpsError("failed-precondition", "Free test attempt is no longer available");
      }
      const claimed = claimedAttempt.data();
      if (claimed.status === "in_progress" || claimed.status === "submitted") {
        // The one-time free claim is the durable pointer to this student's only free attempt.
        // Repair a stale active-session pointer instead of creating or losing another attempt.
        const claimedExpiresAt = date(claimed.expiresAt);
        if (claimed.status === "in_progress") {
          tx.set(activeRef, {
            uid, testId, attemptId: attemptRef.id, status: "in_progress",
            startedAt: claimed.startedAt, expiresAt: claimed.expiresAt
          });
        }
        return {
          attemptId: attemptRef.id,
          startedAt: date(claimed.startedAt).toISOString(),
          expiresAt: claimedExpiresAt ? claimedExpiresAt.toISOString() : null,
          resumed: true
        };
      }
      if (claimed.status !== "created") {
        throw new HttpsError("failed-precondition", "Free test attempt is no longer available");
      }
      tx.update(attemptRef, { status: "in_progress", startedAt, expiresAt, answers: {}, updatedAt: FieldValue.serverTimestamp() });
    } else {
      tx.create(attemptRef, { uid, testId, mode: test.mode || "mock", status: "in_progress", startedAt, expiresAt, answers: {}, updatedAt: FieldValue.serverTimestamp() });
    }
    tx.set(activeRef, { uid, testId, attemptId: attemptRef.id, status: "in_progress", startedAt, expiresAt });
    return { attemptId: attemptRef.id, startedAt: startedAt.toDate().toISOString(), expiresAt: expiresAt.toDate().toISOString(), resumed: false };
  });
});

exports.rmGetExamQuestions = onCall(CALLABLE_OPTIONS, async req => {
  const uid = user(req), attemptId = id(req.data && req.data.attemptId);
  const attemptSnap = await db.doc("testSeriesAttempts/" + attemptId).get();
  if (!attemptSnap.exists || attemptSnap.data().uid !== uid) throw new HttpsError("permission-denied", "Attempt not found");
  const attempt = attemptSnap.data();
  if (attempt.status !== "in_progress" || !date(attempt.expiresAt) || date(attempt.expiresAt) <= new Date()) {
    throw new HttpsError("failed-precondition", "Exam is closed");
  }
  const [testSnap, questionsSnap] = await Promise.all([
    db.doc("testSeriesTests/" + attempt.testId).get(),
    db.doc("testSeriesQuestionSets/" + attempt.testId).get()
  ]);
  if (!testSnap.exists || !questionsSnap.exists) throw new HttpsError("failed-precondition", "Question paper unavailable");
  const test = testSnap.data(), questions = questionsSnap.data().questions || [];
  if (!Array.isArray(questions) || !questions.length) throw new HttpsError("failed-precondition", "Question paper is empty");
  return {
    test: { testId: attempt.testId, title: test.title || "", durationMinutes: Number(test.durationMinutes || 30),
      marksPerQuestion: Number(test.marksPerQuestion ?? 1), negativeMarks: Number(test.negativeMarks ?? 0) },
    questions: questions.map(q => ({ id: q.id, text: q.text, options: q.options })),
    savedAnswers: attempt.answers || {},
    expiresAt: date(attempt.expiresAt).toISOString()
  };
});

exports.rmSaveAnswer = onCall(CALLABLE_OPTIONS, async req => {
  const uid = user(req), attemptId = id(req.data && req.data.attemptId), questionId = id(req.data && req.data.questionId), answer = req.data && req.data.answer;
  if (!(typeof answer === "string" || typeof answer === "number" || typeof answer === "boolean" || answer === null)) throw new HttpsError("invalid-argument", "Answer must be scalar");
  const ref = db.doc("testSeriesAttempts/" + attemptId);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().uid !== uid) throw new HttpsError("permission-denied", "Attempt not found");
    const a = snap.data();
    if (a.status !== "in_progress" || date(a.expiresAt) <= new Date()) throw new HttpsError("failed-precondition", "Exam is closed");
    const questionSet = await tx.get(db.doc("testSeriesQuestionSets/" + a.testId));
    if (!questionSet.exists) throw new HttpsError("failed-precondition", "Question paper unavailable");
    const question = (questionSet.data().questions || []).find(item => item.id === questionId);
    if (!question) throw new HttpsError("invalid-argument", "Question does not belong to this exam");
    if (typeof answer !== "string" || !/^\d+$/.test(answer) || Number(answer) >= question.options.length) {
      throw new HttpsError("invalid-argument", "Answer must be a valid option index");
    }
    tx.update(ref, { ["answers." + questionId]: answer, updatedAt: FieldValue.serverTimestamp() });
  });
  return { saved: true };
});

exports.rmSubmitExam = onCall(CALLABLE_OPTIONS, async req => {
  const uid = user(req), attemptId = id(req.data && req.data.attemptId), ref = db.doc("testSeriesAttempts/" + attemptId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().uid !== uid) throw new HttpsError("permission-denied", "Attempt not found");
    const a = snap.data();
    if (a.status === "submitted") return { submitted: true, timedOut: Boolean(a.timedOut), score: a.score, correct: a.correct, wrong: a.wrong, unattempted: a.unattempted, totalQuestions: a.totalQuestions };
    if (a.status !== "in_progress") throw new HttpsError("failed-precondition", "Attempt cannot be submitted");
    const [testSnap, keySnap] = await Promise.all([tx.get(db.doc("testSeriesTests/" + a.testId)), tx.get(db.doc("testSeriesAnswerKeys/" + a.testId))]);
    if (!testSnap.exists || !keySnap.exists) throw new HttpsError("failed-precondition", "Answer key not configured");
    const test = testSnap.data(), keys = keySnap.data().questions || {}, answers = a.answers || {};
    // Once the server deadline passes, accept only the answers already persisted by rmSaveAnswer.
    // This preserves a result when the client submits at the timer boundary or reconnects late.
    const timedOut = Boolean(date(a.expiresAt) && date(a.expiresAt) <= new Date());
    let correct = 0, wrong = 0, unattempted = 0;
    for (const qid of Object.keys(keys)) {
      const given = answers[qid];
      if (given === undefined || given === null || given === "") unattempted++;
      else if (String(given) === String(keys[qid].correctAnswer)) correct++;
      else wrong++;
    }
    const score = correct * Number(test.marksPerQuestion ?? 1) - wrong * Number(test.negativeMarks ?? 0);
    tx.update(ref, { status: "submitted", timedOut, submittedAt: FieldValue.serverTimestamp(), correct, wrong, unattempted, score, totalQuestions: Object.keys(keys).length });
    tx.set(db.doc("testSeriesResults/" + attemptId), { uid, testId: a.testId, attemptId, correct, wrong, unattempted, timedOut, score, totalQuestions: Object.keys(keys).length, submittedAt: FieldValue.serverTimestamp() });
    tx.set(db.doc("testSeriesActiveSessions/" + uid), { uid, status: "completed", attemptId, testId: a.testId, completedAt: FieldValue.serverTimestamp() });
    return { submitted: true, timedOut, correct, wrong, unattempted, score, totalQuestions: Object.keys(keys).length };
  });
});

exports.rmGetStudentActiveAttempt = onCall(CALLABLE_OPTIONS, async req => {
  const uid = user(req), testId = id(req.data && req.data.testId);
  const snap = await db.doc("testSeriesActiveSessions/" + uid).get();
  if (!snap.exists) return { found: false };
  const session = snap.data();
  if (session.uid !== uid || session.testId !== testId || !session.attemptId) return { found: false };
  const attemptId = id(session.attemptId);
  const attemptSnap = await db.doc("testSeriesAttempts/" + attemptId).get();
  if (!attemptSnap.exists) return { found: false };
  const attempt = attemptSnap.data();
  if (attempt.uid !== uid || attempt.testId !== testId) return { found: false };
  if (attempt.status !== "in_progress" && attempt.status !== "submitted") return { found: false };
  return {
    found: true,
    attemptId,
    status: attempt.status === "submitted" ? "completed" : "in_progress",
    expiresAt: date(attempt.expiresAt)?.toISOString() || null
  };
});

exports.rmGetCbtAttemptResult = onCall(CALLABLE_OPTIONS, async req => {
  const uid = user(req), attemptId = id(req.data && req.data.attemptId);
  const snap = await db.doc("testSeriesAttempts/" + attemptId).get();
  if (!snap.exists || snap.data().uid !== uid) throw new HttpsError("permission-denied", "Attempt not found");
  const attempt = snap.data();
  if (attempt.status !== "submitted") throw new HttpsError("failed-precondition", "Exam result is not available yet");
  return {
    submitted: true,
    timedOut: Boolean(attempt.timedOut),
    score: Number(attempt.score || 0),
    correct: Number(attempt.correct || 0),
    wrong: Number(attempt.wrong || 0),
    unattempted: Number(attempt.unattempted || 0),
    totalQuestions: Number(attempt.totalQuestions || 0)
  };
});

exports.rmGetOwnerAdminSession = onCall(CALLABLE_OPTIONS, async req => {
  const uid = owner(req);
  return { authorized: true, uid, email: req.auth.token.email || null };
});


function ownerTestPayload(data) {
  const title = typeof data.title === "string" ? data.title.trim() : "";
  if (!title || title.length > 160) throw new HttpsError("invalid-argument", "Test title is required (max 160 characters)");
  const mode = data.mode === "scheduled" ? "scheduled" : data.mode === "mock" ? "mock" : null;
  if (!mode) throw new HttpsError("invalid-argument", "Mode must be mock or scheduled");
  const durationMinutes = Number(data.durationMinutes);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 240) throw new HttpsError("invalid-argument", "Duration must be 1–240 minutes");
  const price = Number(data.price ?? 0), marksPerQuestion = Number(data.marksPerQuestion ?? 1), negativeMarks = Number(data.negativeMarks ?? 0);
  if (!Number.isFinite(price) || price < 0 || price > 100000) throw new HttpsError("invalid-argument", "Invalid test price");
  if (!Number.isFinite(marksPerQuestion) || marksPerQuestion <= 0 || marksPerQuestion > 100) throw new HttpsError("invalid-argument", "Invalid marks per question");
  if (!Number.isFinite(negativeMarks) || negativeMarks < 0 || negativeMarks > 100) throw new HttpsError("invalid-argument", "Invalid negative marks");
  const status = data.status === "published" ? "published" : "draft";
  let scheduleStartAt = null, scheduleEndAt = null;
  if (mode === "scheduled") {
    scheduleStartAt = date(data.scheduleStartAt); scheduleEndAt = date(data.scheduleEndAt);
    if (!scheduleStartAt || !scheduleEndAt || !Number.isFinite(scheduleStartAt.getTime()) || !Number.isFinite(scheduleEndAt.getTime()) || scheduleEndAt <= scheduleStartAt) {
      throw new HttpsError("invalid-argument", "Scheduled tests need valid start and end times");
    }
  }
  if (!Array.isArray(data.questions) || data.questions.length < 1 || data.questions.length > 500) throw new HttpsError("invalid-argument", "Add 1–500 questions");
  const seen = new Set();
  const publicQuestions = [], answerQuestions = {};
  for (const q of data.questions) {
    const qid = id(q && q.id);
    if (seen.has(qid)) throw new HttpsError("invalid-argument", "Duplicate question identifier");
    seen.add(qid);
    if (typeof q.text !== "string" || !q.text.trim() || q.text.length > 5000) throw new HttpsError("invalid-argument", "Each question needs text (max 5000 characters)");
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6 || q.options.some(x => typeof x !== "string" || !x.trim() || x.length > 1000)) throw new HttpsError("invalid-argument", "Each question needs 2–6 text options");
    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length) throw new HttpsError("invalid-argument", "Each question needs a valid correctIndex");
    publicQuestions.push({ id: qid, text: q.text.trim(), options: q.options });
    answerQuestions[qid] = { correctAnswer: String(q.correctIndex) };
  }
  return {
    metadata: { title, mode, durationMinutes, price, marksPerQuestion, negativeMarks, status,
      scheduleStartAt: scheduleStartAt ? Timestamp.fromDate(scheduleStartAt) : null,
      scheduleEndAt: scheduleEndAt ? Timestamp.fromDate(scheduleEndAt) : null,
      questionCount: publicQuestions.length, updatedAt: FieldValue.serverTimestamp() },
    publicQuestions, answerQuestions
  };
}

exports.rmOwnerSaveTest = onCall(CALLABLE_OPTIONS, async req => {
  owner(req);
  const testId = req.data && req.data.testId ? id(req.data.testId) : db.collection("testSeriesTests").doc().id;
  const payload = ownerTestPayload(req.data || {});
  const testRef = db.doc("testSeriesTests/" + testId);
  await db.runTransaction(async tx => {
    const existing = await tx.get(testRef);
    if (existing.exists && existing.data().status === "published") {
      throw new HttpsError("failed-precondition", "Published tests are immutable. Create a new draft test to make changes.");
    }
    tx.set(testRef, { ...payload.metadata, createdAt: existing.exists ? existing.data().createdAt : FieldValue.serverTimestamp() }, { merge: true });
    tx.set(db.doc("testSeriesQuestionSets/" + testId), { questions: payload.publicQuestions, updatedAt: FieldValue.serverTimestamp() });
    tx.set(db.doc("testSeriesAnswerKeys/" + testId), { questions: payload.answerQuestions, updatedAt: FieldValue.serverTimestamp() });
  });
  return { saved: true, testId, status: payload.metadata.status, questionCount: payload.publicQuestions.length };
});

exports.rmOwnerGetTest = onCall(CALLABLE_OPTIONS, async req => {
  owner(req);
  const testId = id(req.data && req.data.testId);
  const [testSnap, questionsSnap] = await Promise.all([
    db.doc("testSeriesTests/" + testId).get(),
    db.doc("testSeriesQuestionSets/" + testId).get()
  ]);
  if (!testSnap.exists) throw new HttpsError("not-found", "Test not found");
  const t = testSnap.data();
  return {
    testId, title: t.title || "", mode: t.mode || "mock", status: t.status || "draft",
    durationMinutes: Number(t.durationMinutes || 30), price: Number(t.price || 0),
    marksPerQuestion: Number(t.marksPerQuestion ?? 1), negativeMarks: Number(t.negativeMarks ?? 0),
    scheduleStartAt: date(t.scheduleStartAt)?.toISOString() || "",
    scheduleEndAt: date(t.scheduleEndAt)?.toISOString() || "",
    questions: questionsSnap.exists ? questionsSnap.data().questions || [] : []
  };
});

exports.rmOwnerListTests = onCall(CALLABLE_OPTIONS, async req => {
  owner(req);
  const snap = await db.collection("testSeriesTests").orderBy("updatedAt", "desc").limit(100).get();
  return { tests: snap.docs.map(d => {
    const t = d.data();
    return { testId: d.id, title: t.title || "", mode: t.mode || "mock", status: t.status || "draft",
      price: Number(t.price || 0), durationMinutes: Number(t.durationMinutes || 0),
      questionCount: Number(t.questionCount || 0), scheduleStartAt: date(t.scheduleStartAt)?.toISOString() || null,
      scheduleEndAt: date(t.scheduleEndAt)?.toISOString() || null };
  }) };
});


// Student catalogue exposes published metadata only; question sets and answer keys stay private.
exports.rmListAvailableTests = onCall(CALLABLE_OPTIONS, async req => {
  user(req);
  const [snap, freeConfig] = await Promise.all([
    db.collection("testSeriesTests").where("status", "==", "published").limit(100).get(),
    db.doc("testSeriesConfig/freeTest").get()
  ]);
  const freeTestId = freeConfig.exists && freeConfig.data().enabled ? freeConfig.data().testId : null;
  const tests = snap.docs.map(d => {
    const t = d.data();
    return {
      testId: d.id,
      title: t.title || "",
      mode: t.mode === "scheduled" ? "scheduled" : "mock",
      durationMinutes: Number(t.durationMinutes || 30),
      price: Number(t.price || 0),
      accessType: d.id === freeTestId ? "free_trial" : (Number(t.price || 0) > 0 ? "paid" : "unavailable"),
      questionCount: Number(t.questionCount || 0),
      scheduleStartAt: date(t.scheduleStartAt)?.toISOString() || null,
      scheduleEndAt: date(t.scheduleEndAt)?.toISOString() || null
    };
  });
  tests.sort((a, b) => a.title.localeCompare(b.title));
  return { tests };
});


// Student dashboard is strictly scoped to the authenticated UID. It returns only
// submitted results belonging to that student and safe test metadata.
exports.rmGetStudentDashboard = onCall(CALLABLE_OPTIONS, async req => {
  const uid = user(req);
  const resultsSnap = await db.collection("testSeriesResults")
    .where("uid", "==", uid).limit(100).get();
  const results = resultsSnap.docs.map(d => {
    const r = d.data();
    return {
      attemptId: d.id,
      testId: r.testId,
      score: Number(r.score || 0),
      correct: Number(r.correct || 0),
      wrong: Number(r.wrong || 0),
      unattempted: Number(r.unattempted || 0),
      timedOut: Boolean(r.timedOut),
      totalQuestions: Number(r.totalQuestions || 0),
      submittedAt: date(r.submittedAt)?.toISOString() || null
    };
  });
  const testIds = [...new Set(results.map(r => r.testId).filter(Boolean))];
  const testSnaps = await Promise.all(testIds.map(testId => db.doc("testSeriesTests/" + testId).get()));
  const titles = {};
  testSnaps.forEach(s => { if (s.exists) titles[s.id] = s.data().title || ""; });
  results.forEach(r => { r.testTitle = titles[r.testId] || "Test"; });
  results.sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""));
  return { results, resultCount: results.length };
});


// Privacy-safe per-test leaderboard. Only aggregate rank, score and anonymous
// display labels are returned; student UID, phone, email and attempt IDs stay private.
exports.rmGetTestLeaderboard = onCall(CALLABLE_OPTIONS, async req => {
  const uid = user(req), testId = id(req.data && req.data.testId);
  const testSnap = await db.doc("testSeriesTests/" + testId).get();
  if (!testSnap.exists || testSnap.data().status !== "published") {
    throw new HttpsError("not-found", "Published test not found");
  }
  const snap = await db.collection("testSeriesResults")
    .where("testId", "==", testId).limit(1000).get();
  const rows = snap.docs.map(d => {
    const r = d.data();
    return {
      uid: r.uid,
      score: Number(r.score || 0),
      submittedAt: date(r.submittedAt)?.getTime() || 0
    };
  });
  rows.sort((a, b) => b.score - a.score || a.submittedAt - b.submittedAt);
  let rank = 0, previousScore = null;
  const ranked = rows.map((row, index) => {
    if (previousScore === null || row.score !== previousScore) rank = index + 1;
    previousScore = row.score;
    return { rank, score: row.score, uid: row.uid };
  });
  const mine = ranked.find(row => row.uid === uid);
  return {
    testId,
    participantCount: rows.length,
    leaderboardComplete: snap.size < 1000,
    myRank: mine ? mine.rank : null,
    myScore: mine ? mine.score : null,
    top: ranked.slice(0, 20).map(row => ({ rank: row.rank, score: row.score, label: "Candidate " + String(row.rank).padStart(2, "0") }))
  };
});


// Creates a provider order only from the authenticated student's published test.
// The browser never supplies price, currency, UID or provider credentials.
exports.rmCreatePaymentOrder = onCall({
  ...CALLABLE_OPTIONS,
  secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET]
}, async req => {
  const uid = user(req);
  const testId = id(req.data && req.data.testId);
  const testSnap = await db.doc("testSeriesTests/" + testId).get();
  if (!testSnap.exists || testSnap.data().status !== "published") {
    throw new HttpsError("not-found", "Published test not found");
  }
  const test = testSnap.data();
  let amount;
  try {
    amount = rupeesToPaise(test.price, { maxRupees: 100000 });
  } catch {
    throw new HttpsError("failed-precondition", "This test does not have a valid paid price");
  }

  const entitlementRef = db.doc("testSeriesEntitlements/" + uid + "_" + testId);
  const existingEntitlement = await entitlementRef.get();
  if (existingEntitlement.exists && existingEntitlement.data().uid === uid &&
      existingEntitlement.data().testId === testId && existingEntitlement.data().status === "active") {
    throw new HttpsError("already-exists", "You already have access to this test");
  }

  const receiptRef = db.collection("testSeriesOrderReceipts").doc();
  let providerOrder;
  try {
    providerOrder = await createRazorpayOrder({
      keyId: RAZORPAY_KEY_ID.value(),
      keySecret: RAZORPAY_KEY_SECRET.value(),
      amount,
      currency: "INR",
      receipt: "rm_" + receiptRef.id,
      notes: { uid, testId }
    });
  } catch (error) {
    console.error("Razorpay order creation failed", { uid, testId, message: error.message });
    throw new HttpsError("unavailable", "Payment order could not be created. Please try again.");
  }

  const orderRef = db.doc("testSeriesPaymentOrders/" + providerOrder.id);
  try {
    await db.runTransaction(async tx => {
      const [latestTest, latestEntitlement] = await Promise.all([
        tx.get(db.doc("testSeriesTests/" + testId)),
        tx.get(entitlementRef)
      ]);
      if (!latestTest.exists || latestTest.data().status !== "published" ||
          rupeesToPaise(latestTest.data().price, { maxRupees: 100000 }) !== amount) {
        throw new HttpsError("failed-precondition", "Test price or availability changed. Refresh and try again.");
      }
      if (latestEntitlement.exists && latestEntitlement.data().uid === uid &&
          latestEntitlement.data().testId === testId && latestEntitlement.data().status === "active") {
        throw new HttpsError("already-exists", "You already have access to this test");
      }
      tx.create(orderRef, {
        uid,
        testId,
        razorpayOrderId: providerOrder.id,
        amount: providerOrder.amount,
        currency: providerOrder.currency,
        status: "created",
        createdAt: FieldValue.serverTimestamp()
      });
    });
  } catch (error) {
    // A provider order without a matching trusted Firestore order is never payable by our webhook.
    console.error("Razorpay order ledger write failed", { uid, testId, providerOrderId: providerOrder.id });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Payment order could not be registered. Please contact support before retrying.");
  }

  return {
    orderId: providerOrder.id,
    amount: providerOrder.amount,
    currency: providerOrder.currency,
    keyId: RAZORPAY_KEY_ID.value(),
    testId
  };
});


// Public provider callback: verify the HMAC against exact raw bytes before parsing
// or touching the payment ledger. Unknown event types are acknowledged without grants.
exports.rmRazorpayWebhook = onRequest({
  region: REGION,
  secrets: [RAZORPAY_WEBHOOK_SECRET]
}, async (req, res) => {
  await handleRazorpayWebhook({
    req,
    res,
    secret: RAZORPAY_WEBHOOK_SECRET.value(),
    db,
    applyPayment: applyCapturedPayment
  });

});
