const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { hasVerifiedPhoneMfa } = require("./owner-auth");
const { hasStudentAccess } = require("./student-auth");
const { defineSecret } = require("firebase-functions/params");
const { createRazorpayOrder } = require("./razorpay-order");
const { inspectRazorpayOrder } = require("./razorpay-order-inspect");
const { recordPaymentInspectionAudit } = require("./payment-reconciliation-audit");
const { listOwnerPaymentAudit } = require("./owner-payment-audit-history");
const { verifyRazorpayWebhookSignature } = require("./razorpay-webhook-signature");
const { applyCapturedPayment } = require("./payment-ledger");
const { handleRazorpayWebhook } = require("./razorpay-webhook-handler");
const { rupeesToPaise } = require("./payment-price");
const crypto = require("node:crypto");
const {
  PAYMENT_REQUEST_STATES,
  validatePaymentRequestId,
  paymentRequestDocumentId,
  paymentStudentTestLockDocumentId,
  inspectStudentTestPaymentLock,
  paymentRequestFingerprint,
  inspectPaymentRequest
} = require("./payment-order-request");
const { validateOwnerPrice } = require("./owner-price");
const { listOwnerPaymentHistory } = require("./owner-payment-history");
const { listOwnerPaymentReconciliation } = require("./owner-payment-reconciliation");
const { assertFreeTestSelectionAllowed } = require("./free-test-selection");
const { getCallableOptions } = require("./app-check-policy");
const { normalizeQuestionBankItem, normalizeQuestionBankListRequest } = require("./question-bank-validation");
const { getExamSectionConfig } = require("./section-integrity");
const { getExamScoringConfig } = require("./exam-scoring");
const { getExamAnswerKey } = require("./exam-answer-key");
const { getPaidEntitlementLedgerReferences, validatePaidEntitlement } = require("./payment-entitlement");
const { restoreOwnerQuestionAnswerKeys } = require("./owner-test-editor");
const RAZORPAY_WEBHOOK_SECRET = defineSecret("RAZORPAY_WEBHOOK_SECRET");
const RAZORPAY_KEY_ID = defineSecret("RAZORPAY_KEY_ID");
const RAZORPAY_KEY_SECRET = defineSecret("RAZORPAY_KEY_SECRET");
initializeApp();
const db = getFirestore(), REGION = "asia-south1";
const CALLABLE_OPTIONS = getCallableOptions(process.env);
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
function student(req) {
  const uid = user(req);
  const token = req.auth.token || {};
  if (!hasStudentAccess(token, process.env)) {
    throw new HttpsError("permission-denied", "Student access requires phone OTP sign-in");
  }
  return uid;
}
function id(v) { if (typeof v !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(v)) throw new HttpsError("invalid-argument", "Invalid identifier"); return v; }
function date(v) { return v && v.toDate ? v.toDate() : (v ? new Date(v) : null); }
function validatedExamSections(test, questions) {
  try {
    return getExamSectionConfig(test, questions);
  } catch (error) {
    console.error("CBT section integrity check failed", { message: error.message });
    throw new HttpsError("failed-precondition", "Exam section configuration is inconsistent");
  }
}

exports.rmClaimFreeAttempt = onCall(CALLABLE_OPTIONS, async req => {
  const uid = student(req), claimRef = db.doc("testSeriesFreeAttempts/" + uid), configRef = db.doc("testSeriesConfig/freeTest");
  return db.runTransaction(async tx => {
    const [claim, config] = await Promise.all([tx.get(claimRef), tx.get(configRef)]);
    if (claim.exists) throw new HttpsError("already-exists", "Free attempt already claimed");
    if (!config.exists || !config.data().enabled || !config.data().testId) throw new HttpsError("failed-precondition", "Free test unavailable");
    const testId = id(config.data().testId), testRef = db.doc("testSeriesTests/" + testId), test = await tx.get(testRef);
    if (!test.exists || test.data().status !== "published" || Number(test.data().price) !== 0) throw new HttpsError("failed-precondition", "Free test is not published");
    const attemptRef = db.collection("testSeriesAttempts").doc();
    tx.create(claimRef, { uid, testId, attemptId: attemptRef.id, claimedAt: FieldValue.serverTimestamp() });
    tx.create(attemptRef, { uid, testId, mode: test.data().mode || "mock", status: "created", createdAt: FieldValue.serverTimestamp() });
    // Lock the selected free test in the same transaction as the first claim.
    // This serializes safely against an Owner trying to change the selection.
    const claimLockUpdate = {};
    if (config.data().hasClaims !== true) claimLockUpdate.hasClaims = true;
    if (!config.data().firstClaimAt) claimLockUpdate.firstClaimAt = FieldValue.serverTimestamp();
    // Later claims only read this marker; they do not rewrite the shared config document.
    if (Object.keys(claimLockUpdate).length) tx.update(configRef, claimLockUpdate);
    return { attemptId: attemptRef.id, testId };
  });
});

exports.rmStartExam = onCall(CALLABLE_OPTIONS, async req => {
  const uid = student(req), testId = id(req.data && req.data.testId), testRef = db.doc("testSeriesTests/" + testId);
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
      const entitlementSnap = await tx.get(db.doc("testSeriesEntitlements/" + uid + "_" + testId));
      const entitlement = entitlementSnap.exists ? entitlementSnap.data() : null;
      // The entitlement document is only one part of the grant. Re-read its
      // captured payment and paid order in this same transaction so a stale,
      // orphaned or edited grant cannot unlock a paid test by itself.
      const ledgerRefs = getPaidEntitlementLedgerReferences({ uid, testId, entitlement });
      if (!ledgerRefs) throw new HttpsError("permission-denied", "Paid test access required");
      const [paymentSnap, orderSnap] = await Promise.all([
        tx.get(db.doc("testSeriesPayments/" + ledgerRefs.paymentId)),
        tx.get(db.doc("testSeriesPaymentOrders/" + ledgerRefs.orderId))
      ]);
      const access = validatePaidEntitlement({
        uid,
        testId,
        entitlement,
        payment: paymentSnap.exists ? paymentSnap.data() : null,
        order: orderSnap.exists ? orderSnap.data() : null
      });
      if (!access.valid) throw new HttpsError("permission-denied", "Paid test access required");
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
      if (claimed.status === "submitted") {
        throw new HttpsError("already-exists", "Free test attempt has already been submitted");
      }
      if (claimed.status === "in_progress") {
        // The one-time free claim is the durable pointer to this student's only free attempt.
        // Repair a stale active-session pointer instead of creating or losing another attempt.
        const claimedExpiresAt = date(claimed.expiresAt);
        if (!claimedExpiresAt) {
          throw new HttpsError("failed-precondition", "Free test attempt has no valid expiry");
        }
        tx.set(activeRef, {
          uid, testId, attemptId: attemptRef.id, status: "in_progress",
          startedAt: claimed.startedAt, expiresAt: claimed.expiresAt
        });
        return {
          attemptId: attemptRef.id,
          startedAt: date(claimed.startedAt).toISOString(),
          expiresAt: claimedExpiresAt.toISOString(),
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
  const uid = student(req), attemptId = id(req.data && req.data.attemptId);
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
  const sections = validatedExamSections(test, questions);
  return {
    test: { testId: attempt.testId, title: test.title || "", durationMinutes: Number(test.durationMinutes || 30),
      marksPerQuestion: Number(test.marksPerQuestion ?? 1), negativeMarks: Number(test.negativeMarks ?? 0),
      sections },
    questions: questions.map(q => ({ id: q.id, text: q.text, options: q.options, ...(q.section ? { section: q.section } : {}) })),
    savedAnswers: attempt.answers || {},
    // Only section timing metadata is exposed; the answer key remains server-side.
    sectionTimings: Object.fromEntries(Object.entries(attempt.sectionTimings || {}).map(([name, timing]) => [name, {
      startedAt: date(timing.startedAt)?.toISOString() || null,
      expiresAt: date(timing.expiresAt)?.toISOString() || null
    }])),
    expiresAt: date(attempt.expiresAt).toISOString()
  };
});

exports.rmEnterCbtSection = onCall(CALLABLE_OPTIONS, async req => {
  const uid = student(req), attemptId = id(req.data && req.data.attemptId), sectionName = typeof req.data?.section === "string" ? req.data.section.trim() : "";
  if (!sectionName || sectionName.length > 80) throw new HttpsError("invalid-argument", "Valid section name is required");
  const attemptRef = db.doc("testSeriesAttempts/" + attemptId);
  return db.runTransaction(async tx => {
    const attemptSnap = await tx.get(attemptRef);
    if (!attemptSnap.exists || attemptSnap.data().uid !== uid) throw new HttpsError("permission-denied", "Attempt not found");
    const attempt = attemptSnap.data(), now = new Date(), overallExpiry = date(attempt.expiresAt);
    if (attempt.status !== "in_progress" || !overallExpiry || overallExpiry <= now) throw new HttpsError("failed-precondition", "Exam is closed");
    const [testSnap, paperSnap] = await Promise.all([
      tx.get(db.doc("testSeriesTests/" + attempt.testId)),
      tx.get(db.doc("testSeriesQuestionSets/" + attempt.testId))
    ]);
    if (!testSnap.exists || !paperSnap.exists) throw new HttpsError("failed-precondition", "Exam configuration unavailable");
    const paperQuestions = paperSnap.data().questions || [];
    const sections = validatedExamSections(testSnap.data(), paperQuestions);
    const config = sections.find(item => item.name === sectionName);
    if (!config || !paperQuestions.some(item => item.section === sectionName)) {
      throw new HttpsError("not-found", "Section not found in this exam");
    }
    const limit = config.timeLimitMinutes;
    const timings = attempt.sectionTimings || {}, existing = timings[sectionName];
    if (existing) {
      const expiry = date(existing.expiresAt);
      if (!expiry || expiry <= now) throw new HttpsError("deadline-exceeded", "Section time has expired");
      return { section: sectionName, startedAt: date(existing.startedAt)?.toISOString() || null, expiresAt: expiry.toISOString(), timeLimitMinutes: limit, resumed: true };
    }
    if (!limit) return { section: sectionName, startedAt: null, expiresAt: overallExpiry.toISOString(), timeLimitMinutes: 0, resumed: false };
    const startedAt = Timestamp.fromDate(now);
    const expiresAt = Timestamp.fromDate(new Date(Math.min(now.getTime() + limit * 60000, overallExpiry.getTime())));
    tx.update(attemptRef, { sectionTimings: { ...timings, [sectionName]: { startedAt, expiresAt } }, updatedAt: FieldValue.serverTimestamp() });
    return { section: sectionName, startedAt: startedAt.toDate().toISOString(), expiresAt: expiresAt.toDate().toISOString(), timeLimitMinutes: limit, resumed: false };
  });
});

exports.rmSaveAnswer = onCall(CALLABLE_OPTIONS, async req => {
  const uid = student(req), attemptId = id(req.data && req.data.attemptId), questionId = id(req.data && req.data.questionId), answer = req.data && req.data.answer;
  if (!(typeof answer === "string" || typeof answer === "number" || typeof answer === "boolean" || answer === null)) throw new HttpsError("invalid-argument", "Answer must be scalar");
  const ref = db.doc("testSeriesAttempts/" + attemptId);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().uid !== uid) throw new HttpsError("permission-denied", "Attempt not found");
    const a = snap.data();
    const expiresAt = date(a.expiresAt);
    if (!expiresAt || !Number.isFinite(expiresAt.getTime()) || a.status !== "in_progress" || expiresAt <= new Date()) throw new HttpsError("failed-precondition", "Exam is closed or has an invalid deadline");
    const questionSet = await tx.get(db.doc("testSeriesQuestionSets/" + a.testId));
    if (!questionSet.exists) throw new HttpsError("failed-precondition", "Question paper unavailable");
    const question = (questionSet.data().questions || []).find(item => item.id === questionId);
    if (!question) throw new HttpsError("invalid-argument", "Question does not belong to this exam");
    const testSnap = await tx.get(db.doc("testSeriesTests/" + a.testId));
    if (!testSnap.exists) throw new HttpsError("failed-precondition", "Exam configuration unavailable");
    const sections = validatedExamSections(testSnap.data(), questionSet.data().questions || []);
    if (question.section !== undefined && question.section !== null) {
      const config = sections.find(item => item.name === question.section);
      if (!config) throw new HttpsError("failed-precondition", "Question section is not configured for this exam");
      if (config.timeLimitMinutes > 0) {
        const expiry = date(a.sectionTimings?.[question.section]?.expiresAt);
        if (!expiry || expiry <= new Date()) throw new HttpsError("deadline-exceeded", "Section time has expired or has not started");
      }
    }
    if (typeof answer !== "string" || !/^\d+$/.test(answer) || Number(answer) >= question.options.length) {
      throw new HttpsError("invalid-argument", "Answer must be a valid option index");
    }
    tx.update(ref, { ["answers." + questionId]: answer, updatedAt: FieldValue.serverTimestamp() });
  });
  return { saved: true };
});

exports.rmSubmitExam = onCall(CALLABLE_OPTIONS, async req => {
  const uid = student(req), attemptId = id(req.data && req.data.attemptId), ref = db.doc("testSeriesAttempts/" + attemptId);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().uid !== uid) throw new HttpsError("permission-denied", "Attempt not found");
    const a = snap.data();
    if (a.status === "submitted") return { submitted: true, timedOut: Boolean(a.timedOut), score: a.score, correct: a.correct, wrong: a.wrong, unattempted: a.unattempted, totalQuestions: a.totalQuestions };
    if (a.status !== "in_progress") throw new HttpsError("failed-precondition", "Attempt cannot be submitted");
    const expiresAt = date(a.expiresAt);
    if (!expiresAt || !Number.isFinite(expiresAt.getTime())) throw new HttpsError("failed-precondition", "Attempt deadline is missing or invalid");
    const [testSnap, keySnap, paperSnap] = await Promise.all([
      tx.get(db.doc("testSeriesTests/" + a.testId)),
      tx.get(db.doc("testSeriesAnswerKeys/" + a.testId)),
      tx.get(db.doc("testSeriesQuestionSets/" + a.testId))
    ]);
    if (!testSnap.exists || !keySnap.exists) throw new HttpsError("failed-precondition", "Answer key not configured");
    if (!paperSnap.exists) throw new HttpsError("failed-precondition", "Question paper unavailable");
    const test = testSnap.data(), answers = a.answers || {};
    let scoring;
    try {
      scoring = getExamScoringConfig(test);
    } catch (_) {
      throw new HttpsError("failed-precondition", "Exam scoring configuration is invalid");
    }
    let answerKey;
    try {
      answerKey = getExamAnswerKey(paperSnap.data().questions, keySnap.data().questions);
    } catch (_) {
      throw new HttpsError("failed-precondition", "Exam answer key is inconsistent with the question paper");
    }
    // Once the server deadline passes, accept only the answers already persisted by rmSaveAnswer.
    // This preserves a result when the client submits at the timer boundary or reconnects late.
    const timedOut = expiresAt <= new Date();
    let correct = 0, wrong = 0, unattempted = 0;
    for (const item of answerKey) {
      const given = answers[item.questionId];
      if (given === undefined || given === null || given === "") unattempted++;
      else if (String(given) === item.correctAnswer) correct++;
      else wrong++;
    }
    const totalQuestions = answerKey.length;
    const score = correct * scoring.marksPerQuestion - wrong * scoring.negativeMarks;
    tx.update(ref, { status: "submitted", timedOut, submittedAt: FieldValue.serverTimestamp(), correct, wrong, unattempted, score, totalQuestions });
    tx.set(db.doc("testSeriesResults/" + attemptId), { uid, testId: a.testId, attemptId, correct, wrong, unattempted, timedOut, score, totalQuestions, submittedAt: FieldValue.serverTimestamp() });
    tx.set(db.doc("testSeriesActiveSessions/" + uid), { uid, status: "completed", attemptId, testId: a.testId, completedAt: FieldValue.serverTimestamp() });
    return { submitted: true, timedOut, correct, wrong, unattempted, score, totalQuestions };
  });
});

exports.rmGetStudentActiveAttempt = onCall(CALLABLE_OPTIONS, async req => {
  const uid = student(req), testId = id(req.data && req.data.testId);
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
  const uid = student(req), attemptId = id(req.data && req.data.attemptId);
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

// Owner selects exactly one published zero-price test as the one-time free trial.
exports.rmOwnerSetFreeTest = onCall(CALLABLE_OPTIONS, async req => {
  owner(req);
  const testId = id(req.data && req.data.testId);
  const configRef = db.doc("testSeriesConfig/freeTest");
  const testRef = db.doc("testSeriesTests/" + testId);

  // Older deployments may have claims without the hasClaims marker. Detect one
  // legacy claim before the transaction; concurrent new claims are serialized
  // by both operations reading and writing the same config document.
  const configBefore = await configRef.get();
  const configBeforeData = configBefore.exists ? configBefore.data() : null;
  let legacyClaimExists = false;
  if (!configBeforeData || configBeforeData.hasClaims !== true) {
    const legacyClaims = await db.collection("testSeriesFreeAttempts").limit(1).get();
    legacyClaimExists = !legacyClaims.empty;
  }

  await db.runTransaction(async tx => {
    const [testSnap, configSnap] = await Promise.all([
      tx.get(testRef),
      tx.get(configRef)
    ]);
    if (!testSnap.exists || testSnap.data().status !== "published") {
      throw new HttpsError("failed-precondition", "Only a published test can be selected as the free test");
    }
    if (Number(testSnap.data().price) !== 0) {
      throw new HttpsError("failed-precondition", "The free test must have a zero price");
    }

    const currentConfig = configSnap.exists ? configSnap.data() : null;
    try {
      assertFreeTestSelectionAllowed({
        currentConfig,
        legacyClaimExists,
        requestedTestId: testId
      });
    } catch (error) {
      throw new HttpsError("failed-precondition", error.message);
    }

    const nextConfig = {
      enabled: true,
      testId,
      hasClaims: Boolean((currentConfig && currentConfig.hasClaims === true) || legacyClaimExists),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: req.auth.uid
    };
    if (currentConfig && currentConfig.firstClaimAt) nextConfig.firstClaimAt = currentConfig.firstClaimAt;
    else if (legacyClaimExists) nextConfig.firstClaimAt = FieldValue.serverTimestamp();
    tx.set(configRef, nextConfig, { merge: true });
  });
  return { saved: true, testId };
});


function ownerTestPayload(data) {
  const title = typeof data.title === "string" ? data.title.trim() : "";
  if (!title || title.length > 160) throw new HttpsError("invalid-argument", "Test title is required (max 160 characters)");
  const category = typeof data.category === "string" && data.category.trim() ? data.category.trim() : "General";
  const folderRaw = typeof data.folder === "string" && data.folder.trim() ? data.folder.trim() : "General";
  const folderParts = folderRaw.split("/").map(part => part.trim());
  if (category.length > 60 || !/^[\p{L}\p{M}\p{N} _-]+$/u.test(category)) throw new HttpsError("invalid-argument", "Category contains unsupported characters or is too long");
  if (folderRaw.length > 120 || folderParts.length > 4 || folderParts.some(part => !part || part.length > 40 || !/^[\p{L}\p{M}\p{N} _-]+$/u.test(part))) throw new HttpsError("invalid-argument", "Folder path must contain up to four safe levels");
  const mode = data.mode === "scheduled" ? "scheduled" : data.mode === "mock" ? "mock" : null;
  if (!mode) throw new HttpsError("invalid-argument", "Mode must be mock or scheduled");
  const durationMinutes = Number(data.durationMinutes);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 240) throw new HttpsError("invalid-argument", "Duration must be 1–240 minutes");
  const rawPrice = data.price ?? 0;
  let price;
  try { price = validateOwnerPrice(rawPrice); }
  catch (error) { throw new HttpsError("invalid-argument", error.message); }
  const marksPerQuestion = Number(data.marksPerQuestion ?? 1), negativeMarks = Number(data.negativeMarks ?? 0);
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
    const section = typeof q.section === "string" ? q.section.trim() : "";
    if (section.length > 80) throw new HttpsError("invalid-argument", "Question section name is too long");
    publicQuestions.push({ id: qid, text: q.text.trim(), options: q.options, ...(section ? { section } : {}) });
    answerQuestions[qid] = { correctAnswer: String(q.correctIndex) };
  }
  const sectionNames = [...new Set(publicQuestions.map(question => question.section).filter(Boolean))];
  const suppliedSections = Array.isArray(data.sections) ? data.sections : [];
  if (suppliedSections.length > 50) throw new HttpsError("invalid-argument", "At most 50 sections are allowed");
  const sectionConfig = new Map();
  suppliedSections.forEach((section, index) => {
    const name = section && typeof section.name === "string" ? section.name.trim() : "";
    const timeLimitMinutes = Number(section && section.timeLimitMinutes !== undefined ? section.timeLimitMinutes : 0);
    if (!name || name.length > 80 || !Number.isInteger(timeLimitMinutes) || timeLimitMinutes < 0 || timeLimitMinutes > 240) {
      throw new HttpsError("invalid-argument", "Invalid section configuration at index " + index);
    }
    const key = name.toLocaleLowerCase();
    if (sectionConfig.has(key)) throw new HttpsError("invalid-argument", "Duplicate section name");
    sectionConfig.set(key, { name, timeLimitMinutes });
  });
  sectionNames.forEach(name => {
    const key = name.toLocaleLowerCase();
    if (!sectionConfig.has(key)) sectionConfig.set(key, { name, timeLimitMinutes: 0 });
  });
  // Keep question section values identical to canonical section names. CBT
  // section entry validates exact question.section matches against this list.
  publicQuestions.forEach(question => {
    if (question.section) question.section = sectionConfig.get(question.section.toLocaleLowerCase()).name;
  });
  const sections = [...sectionConfig.values()].map(section => ({
    ...section,
    questionCount: publicQuestions.filter(question => question.section &&
      question.section.toLocaleLowerCase() === section.name.toLocaleLowerCase()).length
  })).filter(section => section.questionCount > 0);

  return {
    metadata: { title, category, folder: folderParts.join(" / "), mode, durationMinutes, price, marksPerQuestion, negativeMarks, status,
      scheduleStartAt: scheduleStartAt ? Timestamp.fromDate(scheduleStartAt) : null,
      scheduleEndAt: scheduleEndAt ? Timestamp.fromDate(scheduleEndAt) : null,
      questionCount: publicQuestions.length, sections, updatedAt: FieldValue.serverTimestamp() },
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
  const [testSnap, questionsSnap, answerKeySnap] = await Promise.all([
    db.doc("testSeriesTests/" + testId).get(),
    db.doc("testSeriesQuestionSets/" + testId).get(),
    db.doc("testSeriesAnswerKeys/" + testId).get()
  ]);
  if (!testSnap.exists) throw new HttpsError("not-found", "Test not found");
  const t = testSnap.data();
  const publicQuestions = questionsSnap.exists ? questionsSnap.data().questions || [] : [];
  const answerMap = answerKeySnap.exists ? answerKeySnap.data().questions || {} : {};
  let questions;
  try {
    questions = restoreOwnerQuestionAnswerKeys(publicQuestions, answerMap);
  } catch (error) {
    console.error("Owner test answer-key restoration failed", { testId, message: error.message });
    throw new HttpsError("failed-precondition", "Test answer key is missing or inconsistent; editing is blocked");
  }
  return {
    testId, title: t.title || "", category: t.category || "General", folder: t.folder || "General", mode: t.mode || "mock", status: t.status || "draft",
    durationMinutes: Number(t.durationMinutes || 30), price: Number(t.price || 0),
    marksPerQuestion: Number(t.marksPerQuestion ?? 1), negativeMarks: Number(t.negativeMarks ?? 0),
    scheduleStartAt: date(t.scheduleStartAt)?.toISOString() || "",
    scheduleEndAt: date(t.scheduleEndAt)?.toISOString() || "",
    sections: Array.isArray(t.sections) ? t.sections : [],
    questions
  };
});

exports.rmOwnerListTests = onCall(CALLABLE_OPTIONS, async req => {
  owner(req);
  const data = req.data || {};
  const pageSize = data.pageSize === undefined ? 50 : data.pageSize;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new HttpsError("invalid-argument", "Page size must be from 1 to 100");
  }
  let query = db.collection("testSeriesTests").orderBy("updatedAt", "desc");
  if (data.cursor !== undefined && data.cursor !== null) {
    if (typeof data.cursor !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(data.cursor)) {
      throw new HttpsError("invalid-argument", "Invalid test list cursor");
    }
    const cursorSnap = await db.doc("testSeriesTests/" + data.cursor).get();
    if (!cursorSnap.exists) throw new HttpsError("invalid-argument", "Test list cursor not found");
    query = query.startAfter(cursorSnap);
  }
  const [snap, freeConfigSnap] = await Promise.all([
    query.limit(pageSize + 1).get(),
    db.doc("testSeriesConfig/freeTest").get()
  ]);
  const hasMore = snap.docs.length > pageSize;
  const page = snap.docs.slice(0, pageSize);
  const freeConfig = freeConfigSnap.exists ? freeConfigSnap.data() : null;
  const freeTestId = freeConfig && freeConfig.enabled && typeof freeConfig.testId === "string"
    ? freeConfig.testId
    : null;
  return {
    freeTestId,
    freeTestLocked: Boolean(freeConfig && freeConfig.hasClaims === true),
    nextCursor: hasMore ? page[page.length - 1].id : null,
    hasMore,
    tests: page.map(d => {
      const t = d.data();
      return { testId: d.id, title: t.title || "", category: t.category || "General", folder: t.folder || "General", mode: t.mode || "mock", status: t.status || "draft",
        price: Number(t.price || 0), durationMinutes: Number(t.durationMinutes || 0),
        questionCount: Number(t.questionCount || 0), scheduleStartAt: date(t.scheduleStartAt)?.toISOString() || null,
        scheduleEndAt: date(t.scheduleEndAt)?.toISOString() || null };
    })
  };
});


// Owner-managed reusable question bank. Stored separately from published test snapshots.
exports.rmOwnerSaveQuestionBankItem = onCall(CALLABLE_OPTIONS, async req => {
  owner(req);
  const data = req.data || {};
  let normalized;
  try {
    normalized = normalizeQuestionBankItem({
      topic: data.topic, chapter: data.chapter, folder: data.folder, question: data.question
    });
  } catch (error) {
    throw new HttpsError("invalid-argument", error.message);
  }
  const itemId = data.itemId ? id(data.itemId) : db.collection("testSeriesQuestionBank").doc().id;
  const ref = db.doc("testSeriesQuestionBank/" + itemId);
  await ref.set({
    ...normalized,
    updatedAt: FieldValue.serverTimestamp(),
    ...(!data.itemId ? { createdAt: FieldValue.serverTimestamp() } : {})
  }, { merge: true });
  return { saved: true, itemId };
});

exports.rmOwnerBulkSaveQuestionBank = onCall(CALLABLE_OPTIONS, async req => {
  owner(req);
  const items = req.data && req.data.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) {
    throw new HttpsError("invalid-argument", "Upload between 1 and 100 questions per batch");
  }
  let normalized;
  try {
    normalized = items.map((item, index) => normalizeQuestionBankItem(item, index + 1));
  } catch (error) {
    throw new HttpsError("invalid-argument", error.message);
  }
  const batch = db.batch();
  const refs = normalized.map(() => db.collection("testSeriesQuestionBank").doc());
  normalized.forEach((item, index) => batch.set(refs[index], {
    ...item,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }));
  await batch.commit();
  return { saved: refs.length, itemIds: refs.map(ref => ref.id) };
});

exports.rmOwnerDeleteQuestionBankItem = onCall(CALLABLE_OPTIONS, async req => {
  owner(req);
  const itemId = id(req.data && req.data.itemId);
  const ref = db.doc("testSeriesQuestionBank/" + itemId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Question bank item not found");
  await ref.delete();
  return { deleted: true, itemId };
});

exports.rmOwnerListQuestionBank = onCall(CALLABLE_OPTIONS, async req => {
  owner(req);
  let listRequest;
  try {
    listRequest = normalizeQuestionBankListRequest(req.data || {});
  } catch (error) {
    throw new HttpsError("invalid-argument", error.message);
  }
  const { pageSize, searchText, filters } = listRequest;
  let query = db.collection("testSeriesQuestionBank").orderBy("updatedAt", "desc");
  const cursor = req.data && req.data.cursor;
  if (cursor !== undefined && cursor !== null) {
    if (typeof cursor !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(cursor)) {
      throw new HttpsError("invalid-argument", "Invalid question bank cursor");
    }
    const cursorSnap = await db.doc("testSeriesQuestionBank/" + cursor).get();
    if (!cursorSnap.exists) throw new HttpsError("invalid-argument", "Question bank cursor not found");
    query = query.startAfter(cursorSnap);
  }
  // Filter the bounded scan in memory to avoid requiring composite indexes for
  // every topic/chapter/folder filter combination.
  const snap = await query.limit(500).get();
  const matches = snap.docs.filter(doc => {
    const row = doc.data();
    const matchesFilters = Object.entries(filters).every(([field, value]) => row[field] === value);
    const searchable = [row.question && row.question.text, row.topic, row.chapter, row.folder].filter(Boolean).join(" ").toLocaleLowerCase();
    return matchesFilters && (!searchText || searchable.includes(searchText));
  });
  const page = matches.slice(0, pageSize);
  const hasMoreMatches = matches.length > pageSize;
  const nextCursor = hasMoreMatches
    ? page[page.length - 1].id
    : snap.size === 500 ? snap.docs[snap.docs.length - 1].id : null;
  const items = page.map(doc => {
    const row = doc.data();
    return { itemId: doc.id, topic: row.topic, chapter: row.chapter, folder: row.folder,
      question: row.question, correctIndex: row.correctIndex,
      createdAt: date(row.createdAt)?.toISOString() || null,
      updatedAt: date(row.updatedAt)?.toISOString() || null };
  });
  const unique = field => [...new Set(snap.docs.map(doc => doc.data()[field]).filter(value => typeof value === "string" && value))].sort();
  return {
    items,
    nextCursor,
    hasMore: Boolean(nextCursor),
    filters: { topic: filters.topic || null, chapter: filters.chapter || null, folder: filters.folder || null, search: searchText || null },
    facets: { topics: unique("topic"), chapters: unique("chapter"), folders: unique("folder") },
    scanLimited: snap.size === 500
  };
});

// Owner-only, read-only payment history. Authorization runs before any ledger read.
exports.rmOwnerListPayments = onCall(CALLABLE_OPTIONS, async req => {
  owner(req);
  try {
    return await listOwnerPaymentHistory({
      db,
      cursor: req.data && req.data.cursor,
      pageSize: req.data && req.data.pageSize
    });
  } catch (error) {
    if (error && (error.code === "invalid_page_size" || error.code === "invalid_cursor")) {
      throw new HttpsError("invalid-argument", error.message);
    }
    throw error;
  }
});

// Owner-only, read-only queue for payment-order outcomes that need reconciliation.
// The Owner guard runs before the helper performs any Firestore read.
exports.rmOwnerListPaymentReconciliation = onCall(CALLABLE_OPTIONS, async req => {
  owner(req);
  try {
    return await listOwnerPaymentReconciliation({
      db,
      cursor: req.data && req.data.cursor,
      pageSize: req.data && req.data.pageSize
    });
  } catch (error) {
    if (error && (error.code === "invalid_page_size" || error.code === "invalid_cursor")) {
      throw new HttpsError("invalid-argument", error.message);
    }
    throw error;
  }
});

// Owner-only, read-only live lookup of a known provider order. This never changes
// payment requests, locks, entitlements or the captured-payment ledger.
// Owner-only live lookup of a known provider order. Financial state and access
// are never changed; every successful or failed inspection is recorded separately.
exports.rmOwnerInspectPaymentOrder = onCall({
  ...CALLABLE_OPTIONS,
  secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET]
}, async req => {
  const ownerUid = owner(req);
  const requestRecordId = req.data && req.data.requestRecordId;
  if (typeof requestRecordId !== "string" || !/^[a-f0-9]{64}$/.test(requestRecordId)) {
    throw new HttpsError("invalid-argument", "Invalid payment request reference");
  }
  const requestSnap = await db.doc("testSeriesPaymentRequests/" + requestRecordId).get();
  if (!requestSnap.exists) throw new HttpsError("not-found", "Payment request not found");
  const record = requestSnap.data() || {};
  if (!["creating", "unknown"].includes(record.status) ||
      typeof record.uid !== "string" || typeof record.testId !== "string" ||
      !Number.isSafeInteger(record.amount) || record.amount <= 0 ||
      record.currency !== "INR" ||
      typeof record.receipt !== "string" ||
      typeof record.providerOrderIdObserved !== "string") {
    throw new HttpsError("failed-precondition", "This request has no safely inspectable provider order ID");
  }

  let inspection;
  try {
    inspection = await inspectRazorpayOrder({
      keyId: RAZORPAY_KEY_ID.value(),
      keySecret: RAZORPAY_KEY_SECRET.value(),
      orderId: record.providerOrderIdObserved,
      expectedReceipt: record.receipt,
      expectedAmountPaise: record.amount,
      expectedUid: record.uid,
      expectedTestId: record.testId
    });
  } catch (error) {
    try {
      await recordPaymentInspectionAudit({
        db, serverTimestamp: () => FieldValue.serverTimestamp(),
        ownerUid, requestRecordId, outcome: "provider_lookup_failed"
      });
    } catch (auditError) {
      console.error("Owner payment inspection failure audit could not be recorded", {
        requestRecordId, message: auditError.message
      });
      throw new HttpsError("unavailable", "Razorpay lookup failed and its audit record could not be saved. No payment or access records were changed.");
    }
    console.error("Owner Razorpay order inspection failed", {
      requestRecordId, message: error.message
    });
    throw new HttpsError("unavailable", "Razorpay status lookup failed. No payment or access records were changed.");
  }

  try {
    await recordPaymentInspectionAudit({
      db, serverTimestamp: () => FieldValue.serverTimestamp(),
      ownerUid, requestRecordId, outcome: "success",
      matchesRequest: inspection.matchesRequest,
      orderStatus: inspection.order.status,
      paymentStatuses: inspection.payments.map(payment => payment.status)
    });
  } catch (error) {
    console.error("Owner payment inspection audit could not be recorded", {
      requestRecordId, message: error.message
    });
    throw new HttpsError("unavailable", "Inspection could not be saved to the audit trail. No payment or access records were changed.");
  }
  return inspection;
});

// Owner-only, read-only, cursor-paginated inspection audit history.
exports.rmOwnerListPaymentAudit = onCall(CALLABLE_OPTIONS, async req => {
  owner(req);
  try {
    return await listOwnerPaymentAudit({
      db,
      cursor: req.data && req.data.cursor,
      pageSize: req.data && req.data.pageSize
    });
  } catch (error) {
    if (error && (error.code === "invalid_page_size" || error.code === "invalid_cursor")) {
      throw new HttpsError("invalid-argument", error.message);
    }
    throw error;
  }
});

// Owner-only, read-only student exam activity. Returns result summaries only;
// phone, email, answers, answer keys and raw attempt documents remain private.
exports.rmOwnerListStudentActivity = onCall(CALLABLE_OPTIONS, async req => {
  owner(req);
  const pageSize = req.data && req.data.pageSize !== undefined ? req.data.pageSize : 25;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new HttpsError("invalid-argument", "Page size must be from 1 to 50");
  }
  const cursor = req.data && req.data.cursor;
  let query = db.collection("testSeriesResults").orderBy("submittedAt", "desc");
  if (cursor !== undefined && cursor !== null) {
    if (typeof cursor !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(cursor)) {
      throw new HttpsError("invalid-argument", "Invalid activity cursor");
    }
    const cursorSnap = await db.doc("testSeriesResults/" + cursor).get();
    if (!cursorSnap.exists || !date(cursorSnap.data().submittedAt)) {
      throw new HttpsError("invalid-argument", "Activity cursor not found");
    }
    query = query.startAfter(cursorSnap);
  }
  const snap = await query.limit(pageSize + 1).get();
  const hasMore = snap.docs.length > pageSize;
  const page = snap.docs.slice(0, pageSize);
  const rows = page.map(doc => {
    const r = doc.data();
    return {
      attemptId: doc.id,
      studentUid: typeof r.uid === "string" ? r.uid : null,
      testId: typeof r.testId === "string" ? r.testId : null,
      score: Number(r.score || 0),
      correct: Number(r.correct || 0),
      wrong: Number(r.wrong || 0),
      unattempted: Number(r.unattempted || 0),
      totalQuestions: Number(r.totalQuestions || 0),
      timedOut: Boolean(r.timedOut),
      submittedAt: date(r.submittedAt)?.toISOString() || null
    };
  });
  const testIds = [...new Set(rows.map(row => row.testId).filter(Boolean))];
  const testSnaps = await Promise.all(testIds.map(testId => db.doc("testSeriesTests/" + testId).get()));
  const titles = {};
  testSnaps.forEach(doc => { if (doc.exists) titles[doc.id] = doc.data().title || ""; });
  rows.forEach(row => { row.testTitle = titles[row.testId] || "Test"; });
  return {
    activities: rows,
    nextCursor: hasMore && page.length ? page[page.length - 1].id : null,
    hasMore
  };
});

// Owner-only analytics over the latest 500 submitted result summaries.
// This bounded report is explicitly a recent-activity snapshot, not lifetime totals.
exports.rmOwnerGetResultAnalytics = onCall(CALLABLE_OPTIONS, async req => {
  owner(req);
  const snap = await db.collection("testSeriesResults").orderBy("submittedAt", "desc").limit(500).get();
  const byTest = new Map();
  let totalScore = 0, totalPercent = 0, scored = 0, timedOut = 0;
  snap.docs.forEach(doc => {
    const row = doc.data();
    const testId = typeof row.testId === "string" ? row.testId : "unknown";
    const score = Number(row.score || 0);
    const correct = Number(row.correct || 0);
    const total = Number(row.totalQuestions || 0);
    const percent = total > 0 ? (correct / total) * 100 : null;
    const entry = byTest.get(testId) || { testId, attempts: 0, scoreTotal: 0, percentTotal: 0, percentCount: 0, timedOut: 0 };
    entry.attempts += 1;
    entry.scoreTotal += Number.isFinite(score) ? score : 0;
    if (percent !== null && Number.isFinite(percent)) { entry.percentTotal += percent; entry.percentCount += 1; }
    if (row.timedOut === true) { entry.timedOut += 1; timedOut += 1; }
    byTest.set(testId, entry);
    totalScore += Number.isFinite(score) ? score : 0;
    if (percent !== null && Number.isFinite(percent)) { totalPercent += percent; scored += 1; }
  });
  const testIds = [...byTest.keys()].filter(id => id !== "unknown");
  const testSnaps = await Promise.all(testIds.map(testId => db.doc("testSeriesTests/" + testId).get()));
  const titles = {};
  testSnaps.forEach(doc => { if (doc.exists) titles[doc.id] = doc.data().title || ""; });
  const tests = [...byTest.values()].map(entry => ({
    testId: entry.testId,
    title: titles[entry.testId] || "Test",
    attempts: entry.attempts,
    averageScore: Math.round((entry.scoreTotal / entry.attempts) * 100) / 100,
    averageCorrectPercent: entry.percentCount ? Math.round(entry.percentTotal / entry.percentCount * 10) / 10 : null,
    timedOut: entry.timedOut
  })).sort((a, b) => b.attempts - a.attempts);
  return {
    window: "latest_500_submissions",
    sampledAttempts: snap.size,
    hasMore: snap.size === 500,
    averageScore: snap.size ? Math.round(totalScore / snap.size * 100) / 100 : 0,
    averageCorrectPercent: scored ? Math.round(totalPercent / scored * 10) / 10 : null,
    timedOut,
    tests
  };
});

// Student catalogue exposes published metadata only; question sets and answer keys stay private.
exports.rmListAvailableTests = onCall(CALLABLE_OPTIONS, async req => {
  const uid = student(req);
  const [snap, freeConfig] = await Promise.all([
    db.collection("testSeriesTests").where("status", "==", "published").limit(100).get(),
    db.doc("testSeriesConfig/freeTest").get()
  ]);
  const freeTestId = freeConfig.exists && freeConfig.data().enabled ? freeConfig.data().testId : null;
  const tests = await Promise.all(snap.docs.map(async d => {
    const t = d.data(), price = Number(t.price || 0);
    let accessType = d.id === freeTestId ? "free_trial" : (price > 0 ? "paid" : "unavailable");
    if (price > 0 && accessType !== "free_trial") {
      const entitlementSnap = await db.doc("testSeriesEntitlements/" + uid + "_" + d.id).get();
      const entitlement = entitlementSnap.exists ? entitlementSnap.data() : null;
      const ledgerRefs = getPaidEntitlementLedgerReferences({ uid, testId: d.id, entitlement });
      if (ledgerRefs) {
        const [paymentSnap, orderSnap] = await Promise.all([
          db.doc("testSeriesPayments/" + ledgerRefs.paymentId).get(),
          db.doc("testSeriesPaymentOrders/" + ledgerRefs.orderId).get()
        ]);
        const access = validatePaidEntitlement({
          uid,
          testId: d.id,
          entitlement,
          payment: paymentSnap.exists ? paymentSnap.data() : null,
          order: orderSnap.exists ? orderSnap.data() : null
        });
        if (access.valid) accessType = "unlocked";
      }
    }
    return {
      testId: d.id,
      title: t.title || "",
      category: t.category || "General",
      folder: t.folder || "General",
      mode: t.mode === "scheduled" ? "scheduled" : "mock",
      durationMinutes: Number(t.durationMinutes || 30),
      price,
      accessType,
      questionCount: Number(t.questionCount || 0),
      scheduleStartAt: date(t.scheduleStartAt)?.toISOString() || null,
      scheduleEndAt: date(t.scheduleEndAt)?.toISOString() || null
    };
  }));
  tests.sort((a, b) => a.title.localeCompare(b.title));
  return { tests };
});


// Student dashboard is strictly scoped to the authenticated UID. It returns only
// submitted results belonging to that student and safe test metadata.
exports.rmGetStudentDashboard = onCall(CALLABLE_OPTIONS, async req => {
  const uid = student(req);
  const resultsSnap = await db.collection("testSeriesResults")
    .where("uid", "==", uid)
    .orderBy("submittedAt", "desc")
    .limit(100).get();
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
  const uid = student(req), testId = id(req.data && req.data.testId);
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
  const uid = student(req);
  const testId = id(req.data && req.data.testId);
  let requestId;
  try { requestId = validatePaymentRequestId(req.data && req.data.requestId); }
  catch (error) { throw new HttpsError("invalid-argument", error.message); }

  const testRef = db.doc("testSeriesTests/" + testId);
  const entitlementRef = db.doc("testSeriesEntitlements/" + uid + "_" + testId);
  const testSnap = await testRef.get();
  if (!testSnap.exists || testSnap.data().status !== "published") throw new HttpsError("not-found", "Published test not found");
  let amount;
  try { amount = rupeesToPaise(testSnap.data().price, { maxRupees: 100000 }); }
  catch { throw new HttpsError("failed-precondition", "This test does not have a valid paid price"); }

  const requestDocId = paymentRequestDocumentId({ uid, testId, requestId });
  const fingerprint = paymentRequestFingerprint({ uid, testId, amount, currency: "INR" });
  const requestRef = db.doc("testSeriesPaymentRequests/" + requestDocId);
  const lockRef = db.doc("testSeriesPaymentLocks/" + paymentStudentTestLockDocumentId({ uid, testId }));
  const reservationToken = crypto.randomUUID();
  const reservation = await db.runTransaction(async tx => {
    const [requestSnap, latestTest, entitlement, lockSnap] = await Promise.all([
      tx.get(requestRef), tx.get(testRef), tx.get(entitlementRef), tx.get(lockRef)
    ]);
    let latestAmount = null;
    if (latestTest.exists && latestTest.data().status === "published") {
      try { latestAmount = rupeesToPaise(latestTest.data().price, { maxRupees: 100000 }); } catch {}
    }
    if (latestAmount !== amount) throw new HttpsError("failed-precondition", "Test price or availability changed. Refresh and try again.");
    const access = entitlement.exists ? entitlement.data() : null;
    if (access && access.uid === uid && access.testId === testId && access.status === "active") {
      throw new HttpsError("already-exists", "You already have access to this test");
    }

    const lock = lockSnap.exists ? lockSnap.data() : null;
    const lockDecision = inspectStudentTestPaymentLock(lock, { uid, testId, requestDocId });
    if (lockDecision.action === "reject") return { action: "blocked" };
    if (lockDecision.action === "reconcile") return { action: "reconcile_lock" };
    if (lock && !requestSnap.exists) return { action: "reconcile_lock" };
    if (lock && requestSnap.exists && lock.status !== requestSnap.data().status) return { action: "reconcile_lock" };

    const decision = inspectPaymentRequest(requestSnap.exists ? requestSnap.data() : null, fingerprint);
    if (decision.action === "reject") return { action: "reject" };
    if (decision.action === "reserve") {
      tx.create(requestRef, {
        uid, testId, requestId, fingerprint, amount, currency: "INR",
        status: PAYMENT_REQUEST_STATES.CREATING, reservationToken,
        receipt: "rm_" + requestDocId.slice(0, 32),
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
      });
      if (!lockSnap.exists) tx.create(lockRef, {
        uid, testId, requestDocId, status: PAYMENT_REQUEST_STATES.CREATING,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
      });
      return { action: "create" };
    }

    if (!lockSnap.exists) tx.create(lockRef, {
      uid, testId, requestDocId, status: requestSnap.data().status,
      createdAt: requestSnap.data().createdAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    if (decision.action === "replay") return { action: "replay", orderId: decision.orderId };
    if (decision.action === "wait") return { action: "wait" };
    if (decision.action === "reconcile") return { action: "reconcile" };
    return { action: "reconcile_lock" };
  });

  if (reservation.action === "blocked") {
    throw new HttpsError("already-exists", "A payment request for this test is already pending or awaiting reconciliation. Do not start another checkout.", { paymentPending: true });
  }
  if (reservation.action === "reconcile_lock") {
    throw new HttpsError("failed-precondition", "The existing student-test payment lock needs support reconciliation. Do not start another checkout.");
  }
  if (reservation.action === "reject") {
    throw new HttpsError("already-exists", "This payment request ID was already used with a different or failed request. Start a new checkout.");
  }
  if (reservation.action === "wait") {
    throw new HttpsError("unavailable", "This payment request is still processing. Retry with the same request ID shortly.");
  }
  if (reservation.action === "reconcile") {
    throw new HttpsError("failed-precondition", "The previous payment outcome needs support reconciliation. Do not start another checkout yet.");
  }

  if (reservation.action === "replay") {
    const orderSnap = await db.doc("testSeriesPaymentOrders/" + reservation.orderId).get();
    if (!orderSnap.exists) throw new HttpsError("failed-precondition", "The saved payment order needs support reconciliation.");
    const order = orderSnap.data();
    if (order.uid !== uid || order.testId !== testId || order.amount !== amount || order.currency !== "INR" || order.status !== "created" || order.razorpayOrderId !== reservation.orderId || order.paymentRequestId !== requestDocId) {
      throw new HttpsError("failed-precondition", "The saved payment order is inconsistent and needs support reconciliation.");
    }
    return { orderId: reservation.orderId, amount: order.amount, currency: order.currency, keyId: RAZORPAY_KEY_ID.value(), testId };
  }

  const requestSnap = await requestRef.get();
  let providerOrder;
  try {
    providerOrder = await createRazorpayOrder({
      keyId: RAZORPAY_KEY_ID.value(), keySecret: RAZORPAY_KEY_SECRET.value(),
      amount, currency: "INR", receipt: requestSnap.data().receipt, notes: { uid, testId }
    });
  } catch (error) {
    const definiteFailure = error && error.name === "RazorpayOrderRejectedError";
    await db.runTransaction(async tx => {
      const [current, lock] = await Promise.all([tx.get(requestRef), tx.get(lockRef)]);
      if (current.exists && current.data().reservationToken === reservationToken && current.data().status === PAYMENT_REQUEST_STATES.CREATING) {
        tx.update(requestRef, {
          status: definiteFailure ? PAYMENT_REQUEST_STATES.FAILED : PAYMENT_REQUEST_STATES.UNKNOWN,
          failureCode: definiteFailure ? "provider_rejected" : "provider_outcome_unknown",
          updatedAt: FieldValue.serverTimestamp()
        });
        if (lock.exists && lock.data().requestDocId === requestDocId) {
          if (definiteFailure) tx.delete(lockRef);
          else tx.update(lockRef, { status: PAYMENT_REQUEST_STATES.UNKNOWN, updatedAt: FieldValue.serverTimestamp() });
        } else if (!definiteFailure && !lock.exists) {
          tx.create(lockRef, {
            uid, testId, requestDocId, status: PAYMENT_REQUEST_STATES.UNKNOWN,
            createdAt: current.data().createdAt || FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          });
        }
      }
    }).catch(markError => console.error("Payment request failure state update failed", { requestDocId, message: markError.message }));
    console.error("Razorpay order creation failed", { uid, testId, definiteFailure, message: error.message });
    throw new HttpsError(definiteFailure ? "unavailable" : "failed-precondition",
      definiteFailure ? "Payment provider rejected this order. Start a new checkout if you want to try again."
        : "Payment provider outcome is unknown. Do not start another checkout; contact support for reconciliation.",
      definiteFailure ? { retryableNewRequest: true } : undefined);
  }

  const orderRef = db.doc("testSeriesPaymentOrders/" + providerOrder.id);
  try {
    await db.runTransaction(async tx => {
      const [currentRequest, latestTest, latestEntitlement, currentLock] = await Promise.all([
        tx.get(requestRef), tx.get(testRef), tx.get(entitlementRef), tx.get(lockRef)
      ]);
      if (!currentRequest.exists || currentRequest.data().reservationToken !== reservationToken || currentRequest.data().status !== PAYMENT_REQUEST_STATES.CREATING ||
          !currentLock.exists || currentLock.data().requestDocId !== requestDocId) {
        throw new HttpsError("failed-precondition", "Payment reservation changed; provider order requires reconciliation.");
      }
      let latestAmount = null;
      if (latestTest.exists && latestTest.data().status === "published") {
        try { latestAmount = rupeesToPaise(latestTest.data().price, { maxRupees: 100000 }); } catch {}
      }
      if (latestAmount !== amount) throw new HttpsError("failed-precondition", "Test price or availability changed after order creation.");
      const access = latestEntitlement.exists ? latestEntitlement.data() : null;
      if (access && access.uid === uid && access.testId === testId && access.status === "active") throw new HttpsError("already-exists", "You already have access to this test.");
      tx.create(orderRef, {
        uid, testId, razorpayOrderId: providerOrder.id, amount: providerOrder.amount,
        currency: providerOrder.currency, status: "created", paymentRequestId: requestDocId,
        createdAt: FieldValue.serverTimestamp()
      });
      tx.update(requestRef, { status: PAYMENT_REQUEST_STATES.CREATED, razorpayOrderId: providerOrder.id, updatedAt: FieldValue.serverTimestamp() });
      tx.update(lockRef, { status: PAYMENT_REQUEST_STATES.CREATED, updatedAt: FieldValue.serverTimestamp() });
    });
  } catch (error) {
    await db.runTransaction(async tx => {
      const [current, lock] = await Promise.all([tx.get(requestRef), tx.get(lockRef)]);
      if (current.exists && current.data().reservationToken === reservationToken && current.data().status === PAYMENT_REQUEST_STATES.CREATING) {
        tx.update(requestRef, {
          status: PAYMENT_REQUEST_STATES.UNKNOWN, failureCode: "firestore_commit_after_provider_success",
          providerOrderIdObserved: providerOrder.id, updatedAt: FieldValue.serverTimestamp()
        });
        if (lock.exists && lock.data().requestDocId === requestDocId) {
          tx.update(lockRef, { status: PAYMENT_REQUEST_STATES.UNKNOWN, updatedAt: FieldValue.serverTimestamp() });
        } else if (!lock.exists) {
          tx.create(lockRef, {
            uid, testId, requestDocId, status: PAYMENT_REQUEST_STATES.UNKNOWN,
            createdAt: current.data().createdAt || FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          });
        }
      }
    }).catch(markError => console.error("Payment request reconciliation marker failed", { requestDocId, message: markError.message }));
    console.error("Razorpay order ledger write failed", { uid, testId, providerOrderId: providerOrder.id });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("failed-precondition", "Provider order was created but its ledger needs support reconciliation. Do not retry with a new request.");
  }

  return { orderId: providerOrder.id, amount: providerOrder.amount, currency: providerOrder.currency, keyId: RAZORPAY_KEY_ID.value(), testId };
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
