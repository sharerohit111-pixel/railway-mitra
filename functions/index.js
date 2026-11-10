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
      questionTextEn: typeof q.questionTextEn === "string" ? q.questionTextEn.slice(0, 8000) : questionText,
      questionTextHi: typeof q.questionTextHi === "string" ? q.questionTextHi.slice(0, 8000) : null,
      options,
      optionsEn: Array.isArray(q.optionsEn) && q.optionsEn.length === options.length
        ? q.optionsEn.map((o, i) => ({ key: options[i].key, text: cleanString(o.text, "English option text", 2000) }))
        : options,
      optionsHi: Array.isArray(q.optionsHi) && q.optionsHi.length === options.length
        ? q.optionsHi.map((o, i) => ({ key: options[i].key, text: typeof o.text === "string" && o.text.trim() ? o.text.slice(0, 2000) : null }))
        : null,
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
      questionTextEn: q.questionTextEn || q.questionText,
      questionTextHi: q.questionTextHi || null,
      options: q.options,
      optionsEn: q.optionsEn || q.options,
      optionsHi: q.optionsHi || null,
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
      await ref.create({ name: root.name, nameLower: root.name.toLocaleLowerCase(), category: root.category, parentId: null, isRoot: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }).catch(async error => {
        if (error.code !== 6 && error.code !== "already-exists") throw error;
      });
    }
  }
  for (const root of CONTENT_ROOTS) {
    const ref = db.collection("examContentFolders").doc(root.id);
    const snap = await ref.get();
    if (snap.exists && !snap.data().nameLower) await ref.update({ nameLower: String(snap.data().name || root.name).toLocaleLowerCase() });
  }
  const parentId = request.data.parentId === null || request.data.parentId === undefined || request.data.parentId === "" ? null : cleanId(request.data.parentId, "parentId", 140);
  if (parentId && !(await contentFolderRef(parentId).get()).exists) throw new HttpsError("not-found", "Folder not found.");
  const [folders, files] = await Promise.all([
    db.collection("examContentFolders").where("parentId", "==", parentId).get(),
    db.collection("examContentFiles").where("folderId", "==", parentId || "__root__").get()
  ]);
  return {
    folders: folders.docs.map(d => ({ id: d.id, name: d.data().name, category: d.data().category || "", isRoot: d.data().isRoot === true })),
    files: files.docs.map(d => ({ id: d.id, folderId: d.data().folderId, name: d.data().name, size: d.data().size, price: Number(d.data().price || 0), published: d.data().published === true, createdAt: d.data().createdAt && d.data().createdAt.toMillis ? d.data().createdAt.toMillis() : null, storagePath: d.data().storagePath }))
  };
});
exports.createExamContentFolder = onCall({ region: REGION }, async request => {
  const uid = requireAdmin(request);
  const name = contentName(request.data.name);
  const parentId = cleanId(request.data.parentId, "parentId", 140);
  const parent = await contentFolderRef(parentId).get();
  if (!parent.exists) throw new HttpsError("not-found", "Parent folder not found.");
  const ref = db.collection("examContentFolders").doc();
  await ref.set({ name, nameLower: name.toLocaleLowerCase(), category: parent.data().category || parent.data().name, parentId, isRoot: false, createdBy: uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return { id: ref.id, name };
});
exports.renameExamContentFolder = onCall({ region: REGION }, async request => {
  requireAdmin(request);
  const id = cleanId(request.data.folderId, "folderId", 140);
  const ref = contentFolderRef(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Folder not found.");
  const name = contentName(request.data.name);
  await ref.update({
    name,
    nameLower: name.toLocaleLowerCase(),
    ...(snap.data().isRoot === true ? { category: name } : {}),
    updatedAt: FieldValue.serverTimestamp()
  });
  return { success: true, name, isRoot: snap.data().isRoot === true };
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
  await ref.create({ folderId, name, nameLower: name.toLocaleLowerCase(), size, price: 0, published: false, contentType: "application/pdf", storagePath, uploadedBy: uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return { success: true, id: fileId, name };
});
exports.renameExamContentFile = onCall({ region: REGION }, async request => {
  requireAdmin(request);
  const id = cleanId(request.data.fileId, "fileId", 140);
  const ref = db.collection("examContentFiles").doc(id);
  if (!(await ref.get()).exists) throw new HttpsError("not-found", "PDF not found.");
  const name = contentName(request.data.name, "fileName");
  await ref.update({ name, nameLower: name.toLocaleLowerCase(), updatedAt: FieldValue.serverTimestamp() });
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


exports.searchExamContent = onCall({ region: REGION }, async request => {
  requireAdmin(request);
  if (request.data.fileId) {
    const id = cleanId(request.data.fileId, "fileId", 140);
    const snap = await db.collection("examContentFiles").doc(id).get();
    if (!snap.exists) throw new HttpsError("not-found", "PDF not found.");
    const x = snap.data();
    return { item: { type: "file", id: snap.id, name: x.name, storagePath: x.storagePath, folderId: x.folderId } };
  }
  if (request.data.folderId) {
    const id = cleanId(request.data.folderId, "folderId", 140);
    let current = await contentFolderRef(id).get();
    if (!current.exists) throw new HttpsError("not-found", "Folder not found.");
    const path = [];
    let depth = 0;
    while (current.exists && depth++ < 20) {
      const x = current.data();
      path.unshift({ id: current.id, name: x.name });
      if (!x.parentId) break;
      current = await contentFolderRef(x.parentId).get();
    }
    return { item: { type: "folder", path } };
  }
  const query = cleanString(request.data.query, "query", 100).toLocaleLowerCase();
  if (query.length < 2) return { folders: [], files: [] };
  const [folderSnap, fileSnap] = await Promise.all([
    db.collection("examContentFolders").where("nameLower", ">=", query).where("nameLower", "<=", query + String.fromCharCode(63743)).limit(30).get(),
    db.collection("examContentFiles").where("nameLower", ">=", query).where("nameLower", "<=", query + String.fromCharCode(63743)).limit(30).get()
  ]);
  const folders = folderSnap.docs
    .map(d => ({ id: d.id, name: d.data().name, parentId: d.data().parentId || null, category: d.data().category || "" }));
  const files = fileSnap.docs
    .filter(d => String(d.data().name || "").toLocaleLowerCase().includes(query))
    .slice(0, 30)
    .map(d => ({ id: d.id, name: d.data().name, folderId: d.data().folderId, storagePath: d.data().storagePath }));
  return { folders, files };
});


// Owner-only finance settings and manually verified UPI payment ledger.
// No client can grant entitlements; only these callable functions can do so.
exports.adminGetFinanceSettings = onCall({ region: REGION }, async request => {
  requireAdmin(request);
  const snap = await db.collection("appSettings").doc("finance").get();
  const data = snap.exists ? snap.data() : {};
  return { subscriptionPrice: Number.isFinite(data.subscriptionPrice) ? data.subscriptionPrice : 300,
    subscriptionDays: Number.isFinite(data.subscriptionDays) ? data.subscriptionDays : 30,
    merchantUpiId: typeof data.merchantUpiId === "string" ? data.merchantUpiId : "",
    merchantName: typeof data.merchantName === "string" ? data.merchantName : "Railway Mitra" };
});

exports.adminSaveFinanceSettings = onCall({ region: REGION }, async request => {
  const uid = requireAdmin(request);
  const subscriptionPrice = validNumber(request.data.subscriptionPrice, "subscriptionPrice", 1, 100000);
  const subscriptionDays = validNumber(request.data.subscriptionDays, "subscriptionDays", 1, 3650);
  const merchantUpiId = typeof request.data.merchantUpiId === "string" ? request.data.merchantUpiId.trim() : "";
  const merchantName = typeof request.data.merchantName === "string" ? cleanString(request.data.merchantName, "merchantName", 80) : "Railway Mitra";
  if (merchantUpiId && !/^[A-Za-z0-9._-]{2,100}@[A-Za-z0-9.-]{2,64}$/.test(merchantUpiId)) throw new HttpsError("invalid-argument", "Merchant UPI ID format is invalid.");
  await db.collection("appSettings").doc("finance").set({
    subscriptionPrice, subscriptionDays, merchantUpiId, merchantName, updatedBy: uid, updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  await db.collection("adminAuditLogs").doc().set({
    action: "update_finance_settings", subscriptionPrice, subscriptionDays,
    actorUid: uid, createdAt: FieldValue.serverTimestamp()
  });
  return { success: true, subscriptionPrice, subscriptionDays };
});

exports.adminSetMaterialPrice = onCall({ region: REGION }, async request => {
  const uid = requireAdmin(request);
  const fileId = cleanId(request.data.fileId, "fileId", 140);
  const price = validNumber(request.data.price, "price", 0, 100000);
  const ref = db.collection("examContentFiles").doc(fileId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Study material PDF not found.");
  await ref.update({ price, updatedAt: FieldValue.serverTimestamp(), priceUpdatedBy: uid });
  await db.collection("adminAuditLogs").doc().set({
    action: "set_study_material_price", fileId, price, actorUid: uid,
    createdAt: FieldValue.serverTimestamp()
  });
  return { success: true, fileId, price };
});

exports.adminRecordPayment = onCall({ region: REGION }, async request => {
  const uid = requireAdmin(request);
  const candidateUid = cleanString(request.data.uid, "candidateUid", 128);
  const reference = cleanString(request.data.reference, "reference", 100).replace(/\s/g, "");
  if (!/^[A-Za-z0-9_-]{6,100}$/.test(reference)) throw new HttpsError("invalid-argument", "UPI reference must contain 6–100 letters, numbers, hyphens or underscores.");
  const amount = validNumber(request.data.amount, "amount", 1, 1000000);
  const type = cleanString(request.data.type || "subscription", "type", 30);
  if (!["subscription", "study-material"].includes(type)) {
    throw new HttpsError("invalid-argument", "Unsupported payment type.");
  }
  const materialId = type === "study-material" ? cleanId(request.data.materialId, "materialId", 140) : null;
  if (type === "study-material") {
    const materialSnap = await db.collection("examContentFiles").doc(materialId).get();
    if (!materialSnap.exists) throw new HttpsError("not-found", "Study material PDF not found.");
    if (Number(materialSnap.data().price || 0) !== amount) throw new HttpsError("failed-precondition", "Payment amount does not match the current PDF price.");
  } else {
    const settingsSnap = await db.collection("appSettings").doc("finance").get();
    const expected = settingsSnap.exists && Number.isFinite(settingsSnap.data().subscriptionPrice) ? settingsSnap.data().subscriptionPrice : 300;
    if (amount !== expected) throw new HttpsError("failed-precondition", "Payment amount does not match the current subscription price.");
  }
  const ref = db.collection("paymentRecords").doc(reference);
  await ref.create({
    uid: candidateUid, amount, reference, type, materialId, status: "pending",
    recordedBy: uid, createdAt: FieldValue.serverTimestamp()
  }).catch(error => {
    if (error.code === 6 || error.code === "already-exists") {
      throw new HttpsError("already-exists", "This UPI reference has already been recorded.");
    }
    throw error;
  });
  await db.collection("adminAuditLogs").doc().set({
    action: "record_payment_pending", paymentReference: reference, candidateUid,
    actorUid: uid, createdAt: FieldValue.serverTimestamp()
  });
  return { success: true, paymentId: reference };
});

exports.adminListPayments = onCall({ region: REGION }, async request => {
  requireAdmin(request);
  const limit = Math.min(100, Math.max(1, Number(request.data.limit) || 50));
  const snap = await db.collection("paymentRecords").orderBy("createdAt", "desc").limit(limit).get();
  return { payments: snap.docs.map(d => {
    const x = d.data();
    return { id: d.id, uid: x.uid, amount: x.amount, reference: x.reference,
      type: x.type, status: x.status, createdAt: x.createdAt && x.createdAt.toMillis ? x.createdAt.toMillis() : null };
  }) };
});

exports.adminApprovePayment = onCall({ region: REGION }, async request => {
  const adminUid = requireAdmin(request);
  const candidateUid = cleanString(request.data.uid, "candidateUid", 128);
  const reference = cleanString(request.data.reference, "reference", 100).replace(/\s/g, "");
  if (!/^[A-Za-z0-9_-]{6,100}$/.test(reference)) throw new HttpsError("invalid-argument", "UPI reference is invalid.");
  const paymentRef = db.collection("paymentRecords").doc(reference);
  const result = await db.runTransaction(async tx => {
    const paymentSnap = await tx.get(paymentRef);
    if (!paymentSnap.exists) throw new HttpsError("not-found", "Pending payment record not found.");
    const payment = paymentSnap.data();
    if (payment.uid !== candidateUid) throw new HttpsError("permission-denied", "Candidate UID does not match this payment.");
    if (payment.status !== "pending") throw new HttpsError("failed-precondition", "This payment is not pending.");
    let expiresAt = null;
    if (payment.type === "subscription") {
      const settingsSnap = await tx.get(db.collection("appSettings").doc("finance"));
      const settings = settingsSnap.exists ? settingsSnap.data() : {};
      const days = Number.isFinite(settings.subscriptionDays) ? settings.subscriptionDays : 30;
      const entitlementRef = db.collection("userEntitlements").doc(candidateUid);
      const entitlementSnap = await tx.get(entitlementRef);
      const previous = entitlementSnap.exists && entitlementSnap.data().expiresAt instanceof Timestamp
        ? entitlementSnap.data().expiresAt.toMillis() : 0;
      const start = Math.max(Date.now(), previous);
      expiresAt = Timestamp.fromMillis(start + days * 86400000);
      tx.set(entitlementRef, { active: true, expiresAt, plan: "all-tests", updatedAt: FieldValue.serverTimestamp(), updatedBy: adminUid }, { merge: true });
    } else if (payment.type === "study-material" && payment.materialId) {
      tx.set(db.collection("materialEntitlements").doc(candidateUid).collection("items").doc(payment.materialId),
        { active: true, paymentReference: reference, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    tx.update(paymentRef, { status: "approved", approvedBy: adminUid, approvedAt: FieldValue.serverTimestamp() });
    return { expiresAt: expiresAt ? expiresAt.toDate().toISOString() : null };
  });
  await db.collection("adminAuditLogs").doc().set({
    action: "approve_payment", paymentReference: reference, candidateUid,
    actorUid: adminUid, createdAt: FieldValue.serverTimestamp()
  });
  return { success: true, expiresAt: result.expiresAt };
});


// Candidate-facing subscription and published study-material storefront.
exports.listStudyMaterials = onCall({ region: REGION }, async request => {
  requireUser(request);
  const snap = await db.collection("examContentFiles").where("published", "==", true).get();
  return { materials: snap.docs.map(d => ({ id: d.id, name: d.data().name, price: Number(d.data().price || 0), size: d.data().size || 0 })) };
});

exports.createCandidatePaymentRequest = onCall({ region: REGION }, async request => {
  const uid = requireUser(request);
  const reference = cleanString(request.data.reference, "UPI reference", 100).replace(/\s/g, "");
  if (!/^[A-Za-z0-9_-]{6,100}$/.test(reference)) throw new HttpsError("invalid-argument", "UPI reference must contain 6–100 letters, numbers, hyphens or underscores.");
  const type = cleanString(request.data.type, "payment type", 30);
  if (!["subscription", "study-material"].includes(type)) throw new HttpsError("invalid-argument", "Unsupported payment type.");
  let amount, materialId = null;
  if (type === "subscription") {
    const settings = await db.collection("appSettings").doc("finance").get();
    amount = settings.exists && Number.isFinite(settings.data().subscriptionPrice) ? settings.data().subscriptionPrice : 300;
  } else {
    materialId = cleanId(request.data.materialId, "materialId", 140);
    const material = await db.collection("examContentFiles").doc(materialId).get();
    if (!material.exists || material.data().published !== true) throw new HttpsError("not-found", "Published study material not found.");
    amount = Number(material.data().price || 0);
    if (!(amount > 0)) throw new HttpsError("failed-precondition", "This material is free; use its download option.");
  }
  const paymentRef = db.collection("paymentRecords").doc(reference);
  await paymentRef.create({
    uid, amount, reference, type, materialId, status: "pending",
    submittedByCandidate: true, createdAt: FieldValue.serverTimestamp()
  }).catch(error => {
    if (error.code === 6 || error.code === "already-exists") throw new HttpsError("already-exists", "This UPI reference has already been submitted.");
    throw error;
  });
  return { success: true, paymentId: reference, amount, status: "pending" };
});

exports.getMyPaymentRequests = onCall({ region: REGION }, async request => {
  const uid = requireUser(request);
  const snap = await db.collection("paymentRecords").where("uid", "==", uid).limit(50).get();
  return { payments: snap.docs.map(d => ({ id: d.id, amount: d.data().amount, type: d.data().type,
    status: d.data().status, reference: d.data().reference, createdAt: d.data().createdAt && d.data().createdAt.toMillis ? d.data().createdAt.toMillis() : null })) };
});

exports.getStudyMaterialDownloadUrl = onCall({ region: REGION }, async request => {
  const uid = requireUser(request);
  const fileId = cleanId(request.data.fileId, "fileId", 140);
  const snap = await db.collection("examContentFiles").doc(fileId).get();
  if (!snap.exists || snap.data().published !== true) throw new HttpsError("not-found", "Published study material not found.");
  const item = snap.data();
  if (Number(item.price || 0) > 0) {
    const entitlement = await db.collection("materialEntitlements").doc(uid).collection("items").doc(fileId).get();
    if (!entitlement.exists || entitlement.data().active !== true) throw new HttpsError("permission-denied", "Purchase this study material before downloading.");
  }
  const bucket = require("firebase-admin/storage").getStorage().bucket();
  const [url] = await bucket.file(item.storagePath).getSignedUrl({ action: "read", expires: Date.now() + 5 * 60 * 1000 });
  return { url, expiresInSeconds: 300 };
});

exports.adminSetMaterialPublication = onCall({ region: REGION }, async request => {
  const uid = requireAdmin(request);
  const fileId = cleanId(request.data.fileId, "fileId", 140);
  const published = request.data.published === true;
  const ref = db.collection("examContentFiles").doc(fileId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Study material PDF not found.");
  await ref.update({ published, updatedAt: FieldValue.serverTimestamp(), publicationUpdatedBy: uid });
  await db.collection("adminAuditLogs").doc().set({ action: "set_study_material_publication",
    fileId, published, actorUid: uid, createdAt: FieldValue.serverTimestamp() });
  return { success: true, fileId, published };
});

exports.getPublicStoreSettings = onCall({ region: REGION }, async request => {
  requireUser(request);
  const snap = await db.collection("appSettings").doc("finance").get();
  const x = snap.exists ? snap.data() : {};
  return {
    subscriptionPrice: Number.isFinite(x.subscriptionPrice) ? x.subscriptionPrice : 300,
    subscriptionDays: Number.isFinite(x.subscriptionDays) ? x.subscriptionDays : 30,
    merchantUpiId: typeof x.merchantUpiId === "string" ? x.merchantUpiId : "",
    merchantName: typeof x.merchantName === "string" ? x.merchantName : "Railway Mitra"
  };
});
