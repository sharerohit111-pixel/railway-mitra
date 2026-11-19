"use strict";

const { answerKeyStorageKey } = require("./exam-answer-key");
const { projectStudentQuestionMedia } = require("./question-media-contract");

function hasControlCharacters(value) {
  return Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return code <= 31 || (code >= 0x7f && code <= 0x9f);
  });
}

function normalizeOwnerTestTitle(value) {
  if (typeof value !== "string" || hasControlCharacters(value)) {
    throw new Error("Test title is invalid");
  }
  const title = value.trim();
  if (!title || title.length > 160) {
    throw new Error("Test title is invalid");
  }
  return title;
}

function hasDisallowedQuestionControls(value) {
  // Preserve ordinary multiline formatting (LF, CR and TAB), but reject the
  // remaining C0 controls, DEL and the full C1 control range at final publish.
  return Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return code === 0 || (code >= 1 && code <= 8) ||
      code === 11 || code === 12 || (code >= 14 && code <= 31) ||
      (code >= 127 && code <= 159);
  });
}

function hasDenseArray(value) {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  return true;
}

function restoreOwnerQuestionAnswerKeys(publicQuestions, answerMap) {
  if (!hasDenseArray(publicQuestions)) {
    throw new Error("Public question set is invalid");
  }
  if (!answerMap || typeof answerMap !== "object" || Array.isArray(answerMap)) {
    if (publicQuestions.length) throw new Error("Test answer key is unavailable");
    answerMap = {};
  }
  return publicQuestions.map(question => {
    if (!question || typeof question !== "object" || typeof question.id !== "string") {
      throw new Error("Question record is invalid");
    }
    const answer = Object.prototype.hasOwnProperty.call(answerMap, answerKeyStorageKey(question.id))
      ? answerMap[answerKeyStorageKey(question.id)]
      : null;
    const rawIndex = answer && answer.correctAnswer;
    const correctIndex = typeof rawIndex === "string" && /^(0|[1-9]\d*)$/.test(rawIndex)
      ? Number(rawIndex)
      : NaN;
    if (!Number.isSafeInteger(correctIndex) || correctIndex < 0
      || !hasDenseArray(question.options) || correctIndex >= question.options.length) {
      throw new Error("A question answer key is missing or inconsistent");
    }
    return { ...question, correctIndex };
  });
}

function validateOwnerQuestionPaper(test, publicQuestions, answerMap) {
  if (!test || typeof test !== "object" || Array.isArray(test)) {
    throw new Error("Test metadata is invalid");
  }
  const title = normalizeOwnerTestTitle(test.title);
  const rawCategory = typeof test.category === "string" ? test.category : "";
  const rawFolder = typeof test.folder === "string" ? test.folder : "";
  // Check the original metadata before trim: TAB/LF/CR and other C0/C1
  // controls must not disappear at the edges of a category or folder segment.
  if (hasControlCharacters(rawCategory) || hasControlCharacters(rawFolder)) {
    throw new Error("Test category or folder is invalid");
  }
  const category = rawCategory.trim();
  const folder = rawFolder.trim();
  const safeMetadataLabel = /^[\p{L}\p{M}\p{N} _-]+$/u;
  const folderParts = folder.split("/");
  if (!category || category.length > 60 || !safeMetadataLabel.test(category) ||
      !folder || folder.length > 120 || folderParts.length > 4 ||
      folderParts.some(part => {
        const segment = part.trim();
        return !segment || segment.length > 40 || !safeMetadataLabel.test(segment);
      })) {
    throw new Error("Test category or folder is invalid");
  }
  if (!["mock", "scheduled"].includes(test.mode)) throw new Error("Test mode is invalid");
  if (test.mode === "scheduled") {
    const start = test.scheduleStartAt && (test.scheduleStartAt.toDate ? test.scheduleStartAt.toDate() : new Date(test.scheduleStartAt));
    const end = test.scheduleEndAt && (test.scheduleEndAt.toDate ? test.scheduleEndAt.toDate() : new Date(test.scheduleEndAt));
    if (!start || !end || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      throw new Error("Scheduled test window is invalid");
    }
  }
  if (!Number.isInteger(test.durationMinutes) || test.durationMinutes < 1 || test.durationMinutes > 240) {
    throw new Error("Test duration is invalid");
  }
  if (!Number.isFinite(test.price) || test.price < 0 || test.price > 100000) {
    throw new Error("Test price is invalid");
  }
  if (!Number.isFinite(test.marksPerQuestion) || test.marksPerQuestion <= 0 || test.marksPerQuestion > 100 ||
      !Number.isFinite(test.negativeMarks) || test.negativeMarks < 0 || test.negativeMarks > 100) {
    throw new Error("Test marking configuration is invalid");
  }
  if (!hasDenseArray(publicQuestions) || publicQuestions.length < 1 || publicQuestions.length > 500 ||
      !Number.isInteger(test.questionCount) || publicQuestions.length !== test.questionCount) {
    throw new Error("Question count does not match test metadata");
  }
  // Publishing is a separate trust boundary: enforce the fixed GDCE JE Civil
  // pattern here too, including legacy or directly modified draft documents.
  if (test.category.trim().toLocaleLowerCase() === "gdce je civil" &&
      (publicQuestions.length !== 150 || test.durationMinutes !== 120 ||
       test.marksPerQuestion !== 1 || Math.abs(test.negativeMarks - (1 / 3)) > 1e-9)) {
    throw new Error("GDCE JE Civil requires 150 questions, 120 minutes, 1 mark per correct answer and 1/3 negative marking");
  }
  const ids = new Set();
  for (const [index, question] of publicQuestions.entries()) {
    if (!question || typeof question !== "object" || Array.isArray(question)) {
      throw new Error("Question " + (index + 1) + " is invalid");
    }
    if (typeof question.id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(question.id) || ids.has(question.id)) {
      throw new Error("Question " + (index + 1) + " ID is invalid or duplicated");
    }
    ids.add(question.id);
    if (Object.prototype.hasOwnProperty.call(question, "correctIndex")) {
      throw new Error("Public question paper must not contain private answer indexes");
    }
    if (typeof question.text !== "string" || !question.text.trim() || question.text.length > 5000 || hasDisallowedQuestionControls(question.text)) {
      throw new Error("Question " + (index + 1) + " text is invalid");
    }
    if (!hasDenseArray(question.options) || question.options.length < 2 || question.options.length > 6 ||
        question.options.some(option => typeof option !== "string" || !option.trim() || option.length > 1000 || hasDisallowedQuestionControls(option))) {
      throw new Error("Question " + (index + 1) + " options are invalid");
    }
    if (question.section !== undefined && question.section !== null &&
        (typeof question.section !== "string" || !question.section.trim() || question.section.length > 80 || hasControlCharacters(question.section))) {
      throw new Error("Question " + (index + 1) + " section is invalid");
    }
    if (question.explanation !== undefined && question.explanation !== null &&
        (typeof question.explanation !== "string" || question.explanation.length > 4000 ||
         hasDisallowedQuestionControls(question.explanation))) {
      throw new Error("Question " + (index + 1) + " explanation is invalid");
    }
    try {
      projectStudentQuestionMedia(question.media);
    } catch (_) {
      throw new Error("Question " + (index + 1) + " media descriptors are invalid");
    }
  }
  const expectedAnswerKeys = new Set([...ids].map(answerKeyStorageKey));
  if (!answerMap || typeof answerMap !== "object" || Array.isArray(answerMap) ||
      Object.keys(answerMap).length !== expectedAnswerKeys.size ||
      Object.keys(answerMap).some(key => !expectedAnswerKeys.has(key))) {
    throw new Error("Private answer key map does not exactly match the question paper");
  }
  return restoreOwnerQuestionAnswerKeys(publicQuestions, answerMap);
}

module.exports = { normalizeOwnerTestTitle, restoreOwnerQuestionAnswerKeys, validateOwnerQuestionPaper };
