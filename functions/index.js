"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();
const REGION = "asia-south1";
const MAX_QUESTIONS = 200;
setGlobalOptions({ maxInstances: 10 });

function requireUser(request) {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError("unauthenticated", "Please sign in to use GDCE exams.");
  }
  return request.auth.uid;
}

function requireAdmin(request) {
  const uid = requireUser(request);
  if (request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Owner permission is required.");
  }
  return uid;
}

function cleanString(value, field, max = 300) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new HttpsError("invalid-argument", field + " is invalid.");
  }
  return value.trim();
}

function cleanId(value, field, max = 120) {
  const id = cleanString(value, field, max);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new HttpsError("invalid-argument", field + " must use only letters, numbers, hyphens or underscores.");
  }
  return id;
}

function validNumber(value, field, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new HttpsError("invalid-argument", field + " is invalid.");
  }
  return n;
}

function normalizeQuestion(q, index) {
  const questionId = cleanId(q.questionId || "q" + (index + 1), "questionId", 100);
  const questionText = cleanString(q.questionText, "questionText", 8000);
  if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 8) {
    throw new HttpsError("invalid-argument", "Each question needs 2 to 8 options.");
  }
  const options = q.options.map((option, i) => {
    const key = cleanString(String(option.key ?? i), "option key", 20);
    const text = cleanString(option.text ?? option.label, "option text", 2000);
    return { key, text };
  });
  if (new Set(options.map(o => o.key)).size !== options.length) {
    throw new HttpsError("invalid-argument", "Option keys must be unique.");
  }
  const correctOption = cleanString(q.correctOption, "correctOption", 20);
  if (!options.some(o => o.key === correctOption)) {
    throw new HttpsError("invalid-argument", "Correct option must match an option key.");
  }
  if (q.verificationStatus !== "verified") {
    throw new HttpsError("failed-precondition", "Every question must be verified before publishing.");
  }
  return {
    publicQuestion: {
      questionId,
      questionNumber: validNumber(q.questionNumber ?? index + 1, "questionNumber", 1, MAX_QUESTIONS),
      questionText,
      options,
      subject: typeof q.subject === "string" ? q.subject.slice(0, 120) : "",
      topic: typeof q.topic === "string" ? q.topic.slice(0, 120) : ""
    },
    answerKey: {
      correctOption,
      explanation: typeof q.explanation === "string" ? q.explanation.slice(0, 6000) : ""
    }
  };
}

exports.listPublishedTests = onCall({ region: REGION }, async request => {
  requireUser(request);
  const streamId = cleanString(request.data.streamId, "streamId", 80);
  const category = cleanString(request.data.category, "category", 20);
  if (!["mock", "previous", "practice"].includes(category)) {
    throw new HttpsError("invalid-argument", "Unknown test category.");
  }
  const snap = await db.collection("examTestCatalog")
    .where("streamId", "==", streamId)
    .where("category", "==", category)
    .where("published", "==", true)
    .get();
  return {
    tests: snap.docs.map(d => {
      const x = d.data();
      return {
        testId: d.id,
        title: x.title,
        streamId: x.streamId,
        streamTitle: x.streamTitle,
        category: x.category,
        totalQuestions: x.totalQuestions,
        durationMinutes: x.durationMinutes,
        positiveMarksPerQuestion: x.positiveMarksPerQuestion,
        negativeMarksPerWrongAnswer: x.negativeMarksPerWrongAnswer,
        access: x.access,
        sourceLabel: x.sourceLabel || "",
        sourceYear: x.sourceYear || null
      };
    })
  };
});

exports.startExam = onCall({ region: REGION }, async request => {
  const uid = requireUser(request);
  const testId = cleanId(request.data.testId, "testId", 120);
  const testSnap = await db.collection("examTestCatalog").doc(testId).get();
  if (!testSnap.exists || testSnap.data().published !== true) {
    throw new HttpsError("not-found", "This test is not published.");
  }
  const test = testSnap.data();
  const totalQuestions = validNumber(test.totalQuestions, "totalQuestions", 1, MAX_QUESTIONS);
  const durationMinutes = validNumber(test.durationMinutes, "durationMinutes", 1, 300);
  const positiveMarks = validNumber(test.positiveMarksPerQuestion, "positiveMarksPerQuestion", 0, 100);
  const negativeMarks = validNumber(test.negativeMarksPerWrongAnswer, "negativeMarksPerWrongAnswer", 0, 100);

  if (test.access !== "free") {
    const entitlement = await db.collection("userEntitlements").doc(uid).get();
    const e = entitlement.exists ? entitlement.data() : {};
    // Fail closed if a stored expiry value is malformed; never grant paid access
    // because an unexpected field type caused a runtime exception.
    const expiryValid = e.expiresAt === undefined ||
      (e.expiresAt instanceof Timestamp && e.expiresAt.toMillis() > Date.now());
    const active = e.active === true && expiryValid;
    if (!active) throw new HttpsError("permission-denied", "An active all-tests subscription is required.");
  }

  const questionSnap = await db.collection("examTests").doc(testId)
    .collection("questionsPublic").orderBy("questionNumber", "asc").get();
  if (questionSnap.size !== totalQuestions) {
    throw new HttpsError("failed-precondition", "The published question bank is incomplete.");
  }
  const questions = questionSnap.docs.map(d => {
    const q = d.data();
    if (q.correctOption !== undefined || q.explanation !== undefined || q.answer !== undefined) {
      throw new HttpsError("failed-precondition", "A public question contains protected answer data.");
    }
    return {
      questionId: d.id,
      questionNumber: q.questionNumber,
      questionText: q.questionText,
      options: q.options,
      subject: q.subject || "",
      topic: q.topic || ""
    };
  });
  const attemptRef = db.collection("users").doc(uid).collection("examAttempts").doc();
  const settings = {
    totalQuestions,
    durationMinutes,
    positiveMarksPerQuestion: positiveMarks,
    negativeMarksPerWrongAnswer: negativeMarks
  };
  // Capture one trusted server clock value and return it with the deadline.
  // The client uses this offset to avoid relying on the device clock or a drifting interval.
  const serverNowMs = Date.now();
  const deadlineAtMs = serverNowMs + durationMinutes * 60 * 1000;
  await attemptRef.set({
    candidateUid: uid,
    testId,
    streamId: test.streamId,
    category: test.category,
    status: "inProgress",
    startedAt: Timestamp.fromMillis(serverNowMs),
    deadlineAt: Timestamp.fromMillis(deadlineAtMs),
    questionIds: questions.map(q => q.questionId),
    testSettings: settings
  });
  return {
    attemptId: attemptRef.id,
    serverNowMs: Date.now(),
    deadlineAtMs,
    test: {
      testId,
      title: test.title,
      streamId: test.streamId,
      streamTitle: test.streamTitle,
      category: test.category,
      ...settings
    },
    questions
  };
});

exports.submitExam = onCall({ region: REGION }, async request => {
  const uid = requireUser(request);
  // Record server receipt immediately, before Firestore reads and answer-key validation.
  const receivedAtMs = Date.now();
  const attemptId = cleanId(request.data.attemptId, "attemptId", 140);
  const submittedAnswers = request.data.answers;
  if (!submittedAnswers || typeof submittedAnswers !== "object" || Array.isArray(submittedAnswers)) {
    throw new HttpsError("invalid-argument", "Answers must be an object.");
  }
  const attemptRef = db.collection("users").doc(uid).collection("examAttempts").doc(attemptId);
  const attemptSnap = await attemptRef.get();
  if (!attemptSnap.exists) throw new HttpsError("not-found", "Exam attempt not found.");
  const attempt = attemptSnap.data();
  if (attempt.status === "submitted" && attempt.result) {
    return { result: attempt.result, answerReview: attempt.answerReview || [], alreadySubmitted: true };
  }
  if (attempt.status !== "inProgress") {
    throw new HttpsError("failed-precondition", "This attempt is not active.");
  }
  const allowedIds = new Set(attempt.questionIds || []);
  const answerEntries = Object.entries(submittedAnswers);
  if (answerEntries.some(([id, value]) => !allowedIds.has(id) || typeof value !== "string" || value.length > 20)) {
    throw new HttpsError("invalid-argument", "Submitted answers contain an invalid question or option.");
  }

  const testId = attempt.testId;
  const [keys, publicQuestions] = await Promise.all([
    Promise.all((attempt.questionIds || []).map(async id => {
      const snap = await db.collection("examTests").doc(testId).collection("answerKeys").doc(id).get();
      if (!snap.exists) throw new HttpsError("failed-precondition", "An answer key is missing. Contact the exam administrator.");
      return [id, snap.data()];
    })),
    Promise.all((attempt.questionIds || []).map(async id => {
      const snap = await db.collection("examTests").doc(testId).collection("questionsPublic").doc(id).get();
      if (!snap.exists) throw new HttpsError("failed-precondition", "A question is missing. Contact the exam administrator.");
      return [id, snap.data()];
    }))
  ]);
  const keyMap = new Map(keys);
  const optionMap = new Map(publicQuestions.map(([id, q]) => [id, new Set((q.options || []).map(o => o.key))]));
  if (Object.entries(submittedAnswers).some(([id, value]) => !optionMap.get(id)?.has(value))) {
    throw new HttpsError("invalid-argument", "An answer option does not belong to its question.");
  }
  const settings = attempt.testSettings;
  // Callable requests can arrive a few seconds after the candidate's local timer
  // reaches zero due to network transit. Allow a small, fixed 10-second transport grace.
  // After that hard cutoff, ignore the payload rather than accepting arbitrarily late answers.
  const deadlineAtMs = attempt.deadlineAt ? attempt.deadlineAt.toMillis() : 0;
  if (!deadlineAtMs) {
    throw new HttpsError("failed-precondition", "This attempt has no valid server deadline.");
  }
  const expired = receivedAtMs > deadlineAtMs;
  const beyondSubmissionGrace = receivedAtMs > deadlineAtMs + 10000;
  const acceptedAnswers = beyondSubmissionGrace ? {} : submittedAnswers;
  let correct = 0, wrong = 0, unattempted = 0;
  const answerReview = [];
  for (const id of attempt.questionIds) {
    const selectedOption = Object.prototype.hasOwnProperty.call(acceptedAnswers, id) ? acceptedAnswers[id] : null;
    const key = keyMap.get(id);
    if (selectedOption === null) unattempted++;
    else if (selectedOption === key.correctOption) correct++;
    else wrong++;
    answerReview.push({
      questionId: id,
      selectedOption,
      correctOption: key.correctOption,
      explanation: key.explanation || ""
    });
  }
  const positiveScore = correct * settings.positiveMarksPerQuestion;
  const negativeScore = wrong * settings.negativeMarksPerWrongAnswer;
  const total = settings.totalQuestions;
  const elapsed = Math.max(0, Math.round((receivedAtMs - attempt.startedAt.toMillis()) / 1000));
  const result = {
    correct,
    wrong,
    unattempted,
    positiveScore,
    negativeScore,
    score: Number((positiveScore - negativeScore).toFixed(2)),
    accuracy: Number((correct / total * 100).toFixed(2)),
    elapsed,
    expired: Boolean(expired)
  };

  const finalRecord = await db.runTransaction(async tx => {
    const fresh = await tx.get(attemptRef);
    if (!fresh.exists) throw new HttpsError("not-found", "Exam attempt not found.");
    if (fresh.data().status === "submitted") {
      return { result: fresh.data().result, answerReview: fresh.data().answerReview || [], alreadySubmitted: true };
    }
    if (fresh.data().status !== "inProgress") throw new HttpsError("failed-precondition", "This attempt is not active.");
    tx.update(attemptRef, {
      status: "submitted",
      submittedAt: FieldValue.serverTimestamp(),
      answers: acceptedAnswers,
      result,
      answerReview
    });
    return { result, answerReview, alreadySubmitted: false };
  });
  return finalRecord;
});

exports.adminPublishTest = onCall({ region: REGION, timeoutSeconds: 120 }, async request => {
  const adminUid = requireAdmin(request);
  const input = request.data.test;
  if (!input || typeof input !== "object") throw new HttpsError("invalid-argument", "Test metadata is required.");
  const testId = cleanId(input.testId, "testId", 120);
  const title = cleanString(input.title, "title", 200);
  const streamId = cleanString(input.streamId, "streamId", 80);
  const streamTitle = cleanString(input.streamTitle, "streamTitle", 160);
  const category = cleanString(input.category, "category", 20);
  const sourceLabel = typeof input.sourceLabel === "string" ? input.sourceLabel.trim().slice(0, 200) : "";
  const sourceYear = input.sourceYear === undefined || input.sourceYear === "" ? null :
    validNumber(input.sourceYear, "sourceYear", 1900, new Date().getFullYear() + 1);
  if (!["gdce-je-civil", "gdce-je-electrical", "gdce-je-mechanical", "gdce-train-manager"].includes(streamId)) {
    throw new HttpsError("invalid-argument", "Unsupported GDCE stream.");
  }
  if (!["mock", "previous", "practice"].includes(category)) {
    throw new HttpsError("invalid-argument", "Unsupported test category.");
  }
  if (input.published !== true) {
    throw new HttpsError("failed-precondition", "Only fully verified tests can be published in this version of the admin panel.");
  }
  if (!Array.isArray(input.questions) || input.questions.length < 1 || input.questions.length > MAX_QUESTIONS) {
    throw new HttpsError("invalid-argument", "Question count is outside the allowed range.");
  }
  const questions = input.questions.map(normalizeQuestion);
  const ids = questions.map(x => x.publicQuestion.questionId);
  if (new Set(ids).size !== ids.length) throw new HttpsError("invalid-argument", "Question IDs must be unique.");
  const totalQuestions = questions.length;
  const durationMinutes = validNumber(input.durationMinutes, "durationMinutes", 1, 300);
  const positiveMarksPerQuestion = validNumber(input.positiveMarksPerQuestion, "positiveMarksPerQuestion", 0, 100);
  const negativeMarksPerWrongAnswer = validNumber(input.negativeMarksPerWrongAnswer, "negativeMarksPerWrongAnswer", 0, 100);
  const existingStreamTests = await db.collection("examTestCatalog").where("streamId", "==", streamId).get();
  const existingMockCount = existingStreamTests.docs.filter(d => d.data().category === "mock").length;
  const mustBeFree = category === "mock" && existingMockCount === 0;
  const access = mustBeFree ? "free" : "paid";
  if (input.access && input.access !== access) {
    throw new HttpsError("failed-precondition", mustBeFree
      ? "The first mock test in each GDCE stream must be free."
      : "Only the first mock test in each GDCE stream is free; this test must be paid.");
  }
  const subscriptionRequired = access === "paid";
  const testRef = db.collection("examTestCatalog").doc(testId);
  if ((await testRef.get()).exists) {
    throw new HttpsError("already-exists", "This test ID already exists. Use a new ID for a new paper version.");
  }
  const batch = db.batch();
  batch.set(testRef, {
    testId, title, streamId, streamTitle, category,
    totalQuestions, durationMinutes, positiveMarksPerQuestion,
    negativeMarksPerWrongAnswer, access, subscriptionRequired,
    sourceLabel, sourceYear,
    published: input.published === true,
    updatedAt: FieldValue.serverTimestamp()
  });
  questions.forEach(({ publicQuestion, answerKey }) => {
    batch.set(db.collection("examTests").doc(testId).collection("questionsPublic").doc(publicQuestion.questionId), publicQuestion);
    batch.set(db.collection("examTests").doc(testId).collection("answerKeys").doc(publicQuestion.questionId), answerKey);
  });
  batch.set(db.collection("adminAuditLogs").doc(), {
    action: "publish_test",
    testId,
    questionCount: totalQuestions,
    published: input.published === true,
    actorUid: adminUid,
    createdAt: FieldValue.serverTimestamp()
  });
  await batch.commit();
  return { success: true, testId, totalQuestions, access, published: input.published === true };
});


// Owner-only PDF and study-content library. All metadata mutations run through
// callable functions so browser clients never receive broad Firestore write access.
const CONTENT_ROOTS = [
  { id: "root_ldce", name: "LDCE", category: "LDCE" },
  { id: "root_gdce", name: "GDCE", category: "GDCE" },
  { id: "root_study_material", name: "STUDY MATERIAL", category: "STUDY MATERIAL" }
];
const CONTENT_MAX_BYTES = 20 * 1024 * 1024;
function contentName(value, field = "name") {
  const name = cleanString(value, field, 100).replace(/[\\\\/]/g, "-");
  if (name === "." || name === "..") throw new HttpsError("invalid-argument", field + " is invalid.");
  return name;
}
function contentFolderRef(id) {
  return db.collection("examContentFolders").doc(cleanId(id, "folderId", 140));
}
exports.listExamContent = onCall({ region: REGION }, async request => {
  requireAdmin(request);
  for (const root of CONTENT_ROOTS) {
    const ref = db.collection("examContentFolders").doc(root.id);
    if (!(await ref.get()).exists) {
      await ref.create({ name: root.name, category: root.category, parentId: null, isRoot: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }).catch(async error => {
        if (error.code !== 6 && error.code !== "already-exists") throw error;
      });
    }
  }
  const parentId = request.data.parentId === null || request.data.parentId === undefined || request.data.parentId === "" ? null : cleanId(request.data.parentId, "parentId", 140);
  if (parentId && !(await contentFolderRef(parentId).get()).exists) throw new HttpsError("not-found", "Folder not found.");
  const [folders, files] = await Promise.all([
    db.collection("examContentFolders").where("parentId", "==", parentId).get(),
    db.collection("examContentFiles").where("folderId", "==", parentId || "__root__").get()
  ]);
  return {
    folders: folders.docs.map(d => ({ id: d.id, name: d.data().name, category: d.data().category || "", isRoot: d.data().isRoot === true })),
    files: files.docs.map(d => ({ id: d.id, folderId: d.data().folderId, name: d.data().name, size: d.data().size, createdAt: d.data().createdAt && d.data().createdAt.toMillis ? d.data().createdAt.toMillis() : null, storagePath: d.data().storagePath }))
  };
});
exports.createExamContentFolder = onCall({ region: REGION }, async request => {
  const uid = requireAdmin(request);
  const name = contentName(request.data.name);
  const parentId = cleanId(request.data.parentId, "parentId", 140);
  const parent = await contentFolderRef(parentId).get();
  if (!parent.exists) throw new HttpsError("not-found", "Parent folder not found.");
  const ref = db.collection("examContentFolders").doc();
  await ref.set({ name, category: parent.data().category || parent.data().name, parentId, isRoot: false, createdBy: uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return { id: ref.id, name };
});
exports.renameExamContentFolder = onCall({ region: REGION }, async request => {
  requireAdmin(request);
  const id = cleanId(request.data.folderId, "folderId", 140);
  const ref = contentFolderRef(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Folder not found.");
  if (snap.data().isRoot === true) throw new HttpsError("failed-precondition", "Main folders cannot be renamed.");
  const name = contentName(request.data.name);
  await ref.update({ name, updatedAt: FieldValue.serverTimestamp() });
  return { success: true, name };
});
exports.deleteExamContentFolder = onCall({ region: REGION }, async request => {
  requireAdmin(request);
  const id = cleanId(request.data.folderId, "folderId", 140);
  const ref = contentFolderRef(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Folder not found.");
  if (snap.data().isRoot === true) throw new HttpsError("failed-precondition", "Main folders cannot be deleted.");
  const [children, files] = await Promise.all([
    db.collection("examContentFolders").where("parentId", "==", id).limit(1).get(),
    db.collection("examContentFiles").where("folderId", "==", id).limit(1).get()
  ]);
  if (!children.empty || !files.empty) throw new HttpsError("failed-precondition", "Folder must be empty before it can be deleted.");
  await ref.delete();
  return { success: true };
});
exports.registerExamContentFile = onCall({ region: REGION }, async request => {
  const uid = requireAdmin(request);
  const folderId = cleanId(request.data.folderId, "folderId", 140);
  if (!(await contentFolderRef(folderId).get()).exists) throw new HttpsError("not-found", "Folder not found.");
  const fileId = cleanId(request.data.fileId, "fileId", 140);
  const name = contentName(request.data.name, "fileName");
  const size = validNumber(request.data.size, "size", 1, CONTENT_MAX_BYTES);
  if (request.data.contentType !== "application/pdf") throw new HttpsError("invalid-argument", "Only PDF files are allowed.");
  const storagePath = "exam-content/" + uid + "/" + folderId + "/" + fileId + ".pdf";
  const bucket = require("firebase-admin/storage").getStorage().bucket();
  const [exists] = await bucket.file(storagePath).exists();
  if (!exists) throw new HttpsError("failed-precondition", "Uploaded PDF was not found in secure storage.");
  const ref = db.collection("examContentFiles").doc(fileId);
  await ref.create({ folderId, name, size, contentType: "application/pdf", storagePath, uploadedBy: uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return { success: true, id: fileId, name };
});
exports.renameExamContentFile = onCall({ region: REGION }, async request => {
  requireAdmin(request);
  const id = cleanId(request.data.fileId, "fileId", 140);
  const ref = db.collection("examContentFiles").doc(id);
  if (!(await ref.get()).exists) throw new HttpsError("not-found", "PDF not found.");
  const name = contentName(request.data.name, "fileName");
  await ref.update({ name, updatedAt: FieldValue.serverTimestamp() });
  return { success: true, name };
});
exports.deleteExamContentFile = onCall({ region: REGION }, async request => {
  requireAdmin(request);
  const id = cleanId(request.data.fileId, "fileId", 140);
  const ref = db.collection("examContentFiles").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "PDF not found.");
  const bucket = require("firebase-admin/storage").getStorage().bucket();
  await bucket.file(snap.data().storagePath).delete({ ignoreNotFound: true });
  await ref.delete();
  return { success: true };
});
