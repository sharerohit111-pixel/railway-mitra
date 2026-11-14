"use strict";

function invalidAnswerKey() {
  const error = new Error("Exam answer key is inconsistent with its question paper");
  error.code = "invalid_exam_answer_key";
  return error;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validate the persisted private answer key against the exact published paper
 * before scoring. A missing, extra, duplicated, or out-of-range key must never
 * silently change the denominator or create a partial result.
 */
function getExamAnswerKey(questions, answerQuestions) {
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 500 || !isRecord(answerQuestions)) {
    throw invalidAnswerKey();
  }

  const seen = new Set();
  const validated = [];
  for (const question of questions) {
    if (!isRecord(question) || typeof question.id !== "string" ||
        !/^[A-Za-z0-9_-]{1,100}$/.test(question.id) || seen.has(question.id) ||
        !Array.isArray(question.options) || question.options.length < 2 || question.options.length > 6 ||
        question.options.some(option => typeof option !== "string" || !option.trim())) {
      throw invalidAnswerKey();
    }
    seen.add(question.id);

    const answer = answerQuestions[question.id];
    if (!isRecord(answer) || typeof answer.correctAnswer !== "string" ||
        !/^(0|[1-9]\d*)$/.test(answer.correctAnswer)) {
      throw invalidAnswerKey();
    }
    const correctIndex = Number(answer.correctAnswer);
    if (!Number.isSafeInteger(correctIndex) || correctIndex >= question.options.length) {
      throw invalidAnswerKey();
    }
    validated.push(Object.freeze({ questionId: question.id, correctAnswer: answer.correctAnswer }));
  }

  const answerIds = Object.keys(answerQuestions);
  if (answerIds.length !== seen.size || answerIds.some(questionId => !seen.has(questionId))) {
    throw invalidAnswerKey();
  }

  return Object.freeze(validated);
}

module.exports = { getExamAnswerKey };
