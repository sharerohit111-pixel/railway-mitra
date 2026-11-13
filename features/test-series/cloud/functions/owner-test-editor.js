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

module.exports = { restoreOwnerQuestionAnswerKeys };
