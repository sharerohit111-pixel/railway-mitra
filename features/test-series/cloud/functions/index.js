const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
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
  if (!(req.auth.token.firebase || {}).sign_in_second_factor) throw new HttpsError("permission-denied", "Owner OTP verification required");
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
      if (!ent.exists || ent.data().status !== "active") throw new HttpsError("permission-denied", "Paid test access required");
    } else {
      // A free test can only be started through the one-time claim flow.
      freeClaimSnap = await tx.get(db.doc("testSeriesFreeAttempts/" + uid));
      if (!freeClaimSnap.exists || freeClaimSnap.data().testId !== testId) {
        throw new HttpsError("permission-denied", "Claim the free test before starting");
      }
    }
    const activeRef = db.doc("testSeriesActiveSessions/" + uid), active = await tx.get(activeRef);
    if (active.exists && active.data().status === "in_progress" && date(active.data().expiresAt) > now) {
      if (active.data().testId !== testId) throw new HttpsError("already-exists", "Another exam session is active");
      return { attemptId: active.data().attemptId, startedAt: date(active.data().startedAt).toISOString(), expiresAt: date(active.data().expiresAt).toISOString(), resumed: true };
    }
    const attemptRef = freeClaimSnap
      ? db.doc("testSeriesAttempts/" + freeClaimSnap.data().attemptId)
      : db.collection("testSeriesAttempts").doc();
    const duration = Math.max(1, Math.min(240, Number(test.durationMinutes || 30)));
    const startedAt = Timestamp.now(), expiresAt = Timestamp.fromDate(new Date(now.getTime() + duration * 60000));
    if (freeClaimSnap) {
      const claimedAttempt = await tx.get(attemptRef);
      if (!claimedAttempt.exists || claimedAttempt.data().uid !== uid || claimedAttempt.data().status !== "created") {
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
