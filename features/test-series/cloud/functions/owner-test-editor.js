"use strict";

function restoreOwnerQuestionAnswerKeys(publicQuestions, answerMap) {
  if (!Array.isArray(publicQuestions)) {
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
    const answer = Object.prototype.hasOwnProperty.call(answerMap, question.id)
      ? answerMap[question.id]
      : null;
    const rawIndex = answer && answer.correctAnswer;
    const correctIndex = typeof rawIndex === "string" && /^(0|[1-9]\d*)$/.test(rawIndex)
      ? Number(rawIndex)
      : NaN;
    if (!Number.isSafeInteger(correctIndex) || correctIndex < 0
      || !Array.isArray(question.options) || correctIndex >= question.options.length) {
      throw new Error("A question answer key is missing or inconsistent");
    }
    return { ...question, correctIndex };
  });
}

function validateOwnerQuestionPaper(test, publicQuestions, answerMap) {
  if (!test || typeof test !== "object" || Array.isArray(test)) {
    throw new Error("Test metadata is invalid");
  }
  const title = typeof test.title === "string" ? test.title.trim() : "";
  if (!title || title.length > 160) throw new Error("Test title is invalid");
  if (typeof test.category !== "string" || !test.category.trim() || test.category.length > 60 ||
      typeof test.folder !== "string" || !test.folder.trim() || test.folder.length > 120) {
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
  if (!Array.isArray(publicQuestions) || publicQuestions.length < 1 || publicQuestions.length > 500 ||
      !Number.isInteger(test.questionCount) || publicQuestions.length !== test.questionCount) {
    throw new Error("Question count does not match test metadata");
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
    if (typeof question.text !== "string" || !question.text.trim() || question.text.length > 5000) {
      throw new Error("Question " + (index + 1) + " text is invalid");
    }
    if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 6 ||
        question.options.some(option => typeof option !== "string" || !option.trim() || option.length > 1000)) {
      throw new Error("Question " + (index + 1) + " options are invalid");
    }
    if (question.section !== undefined && question.section !== null &&
        (typeof question.section !== "string" || !question.section.trim() || question.section.length > 80)) {
      throw new Error("Question " + (index + 1) + " section is invalid");
    }
  }
  if (!answerMap || typeof answerMap !== "object" || Array.isArray(answerMap) ||
      Object.keys(answerMap).length !== publicQuestions.length ||
      Object.keys(answerMap).some(key => !ids.has(key))) {
    throw new Error("Private answer key map does not exactly match the question paper");
  }
  return restoreOwnerQuestionAnswerKeys(publicQuestions, answerMap);
}

module.exports = { restoreOwnerQuestionAnswerKeys, validateOwnerQuestionPaper };
