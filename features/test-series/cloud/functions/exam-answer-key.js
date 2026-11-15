"use strict";

function invalidAnswerKey() {
  const error = new Error("Exam answer key is inconsistent with its question paper");
  error.code = "invalid_exam_answer_key";
  return error;
}

const ENCODED_KEY_PREFIX = "__rm_answer_qid__";
const PROTOTYPE_SENSITIVE_IDS = new Set(["__proto__", "constructor", "toString", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable", "toLocaleString", "valueOf", "__defineGetter__", "__defineSetter__"]);
function answerKeyStorageKey(questionId) {
  return PROTOTYPE_SENSITIVE_IDS.has(questionId) ? ENCODED_KEY_PREFIX + Buffer.from(questionId, "utf8").toString("base64url") : questionId;
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

    const storageKey = answerKeyStorageKey(question.id);
    if (!Object.prototype.hasOwnProperty.call(answerQuestions, storageKey)) throw invalidAnswerKey();
    const answer = answerQuestions[storageKey];
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

  const expectedStorageKeys = new Set([...seen].map(answerKeyStorageKey));
  const answerIds = Object.keys(answerQuestions);
  if (answerIds.length !== expectedStorageKeys.size || answerIds.some(key => !expectedStorageKeys.has(key))) {
    throw invalidAnswerKey();
  }

  return Object.freeze(validated);
}

/**
 * Add a private answer-key entry without invoking Object.prototype setters.
 * In particular, "__proto__" is a valid question ID and must remain an own
 * enumerable Firestore field rather than changing the map's prototype.
 */
function addExamAnswerKeyEntry(answerQuestions, questionId, correctIndex) {
  if (!isRecord(answerQuestions) ||
      typeof questionId !== "string" ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(questionId) ||
      Object.prototype.hasOwnProperty.call(answerQuestions, answerKeyStorageKey(questionId)) ||
      !Number.isSafeInteger(correctIndex) || correctIndex < 0) {
    throw invalidAnswerKey();
  }
  answerQuestions[answerKeyStorageKey(questionId)] = { correctAnswer: String(correctIndex) };
  return answerQuestions;
}

module.exports = { getExamAnswerKey, addExamAnswerKeyEntry, answerKeyStorageKey };
