"use strict";

const QUESTION_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const PROTOTYPE_SENSITIVE_IDS = new Set(["__proto__", "constructor", "toString", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable", "toLocaleString", "valueOf", "__defineGetter__", "__defineSetter__"]);
const ENCODED_QUESTION_ID_PREFIX = "q:";
function studentAnswerStorageKey(questionId) {
  if (!PROTOTYPE_SENSITIVE_IDS.has(questionId)) return questionId;
  return ENCODED_QUESTION_ID_PREFIX + Buffer.from(questionId, "utf8").toString("base64url");
}
function studentAnswerQuestionId(storageKey) {
  if (typeof storageKey !== "string" || !storageKey.startsWith(ENCODED_QUESTION_ID_PREFIX)) return storageKey;
  const decoded = Buffer.from(storageKey.slice(ENCODED_QUESTION_ID_PREFIX.length), "base64url").toString("utf8");
  return PROTOTYPE_SENSITIVE_IDS.has(decoded) && studentAnswerStorageKey(decoded) === storageKey ? decoded : storageKey;
}

function fail() {
  throw new Error("Question paper contains invalid student question data");
}

/**
 * Accept only the exact decimal string format shared by answer saving,
 * attempt recovery and submission. Numeric coercion is intentionally avoided.
 */
function isCanonicalStudentAnswerIndex(question, answer) {
  if (!question || typeof question !== "object" || Array.isArray(question) ||
      !Array.isArray(question.options) || question.options.length < 2 ||
      question.options.length > 6 || typeof answer !== "string" ||
      !/^(0|[1-9]\d*)$/.test(answer)) return false;

  const optionIndex = Number(answer);
  return Number.isSafeInteger(optionIndex) &&
    optionIndex >= 0 && optionIndex < question.options.length;
}

/**
 * Return only the public question fields required by the student CBT client.
 * Validate option primitives before projection so nested/private option metadata
 * can never cross the callable boundary.
 */
function projectStudentQuestions(questions) {
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 500) fail();

  const seenIds = new Set();
  return questions.map(question => {
    if (!question || typeof question !== "object" || Array.isArray(question)) fail();

    const { id, text, options, section } = question;
    if (typeof id !== "string" || !QUESTION_ID_PATTERN.test(id) || seenIds.has(id)) fail();
    seenIds.add(id);

    if (typeof text !== "string" || !text.trim() || text.length > 5000) fail();
    if (!Array.isArray(options) || options.length < 2 || options.length > 6 ||
        options.some(option => typeof option !== "string" || !option.trim() || option.length > 1000)) fail();

    const safeQuestion = { id, text, options: options.map(option => option) };
    if (section !== undefined && section !== null) {
      if (typeof section !== "string" || !section.trim() || section.length > 80) fail();
      safeQuestion.section = section;
    }
    return safeQuestion;
  });
}

/**
 * Return only canonical option indexes belonging to the current validated paper.
 * Attempt documents are private server state, but corrupted/legacy fields must
 * not be reflected into the Student response.
 */
function projectStudentSavedAnswers(questions, answers) {
  const safeQuestions = projectStudentQuestions(questions);
  if (answers === undefined || answers === null) return {};
  if (typeof answers !== "object" || Array.isArray(answers)) {
    throw new Error("Attempt contains invalid saved student answers");
  }

  const questionById = new Map(safeQuestions.map(question => [question.id, question]));
  const projectedEntries = [];
  const seenQuestionIds = new Set();
  for (const [storageKey, answer] of Object.entries(answers)) {
    const questionId = studentAnswerQuestionId(storageKey);
    const question = questionById.get(questionId);
    if (seenQuestionIds.has(questionId)) throw new Error("Attempt contains duplicate saved student answers");
    seenQuestionIds.add(questionId);
    if (!question || typeof answer !== "string" || !/^(0|[1-9]\d*)$/.test(answer)) {
      throw new Error("Attempt contains invalid saved student answers");
    }
    if (!isCanonicalStudentAnswerIndex(question, answer)) {
      throw new Error("Attempt contains invalid saved student answers");
    }
    projectedEntries.push([questionId, answer]);
  }

  // Object.fromEntries creates own data properties even for keys such as
  // "__proto__", rather than invoking Object.prototype setters.
  return Object.fromEntries(projectedEntries);
}


module.exports = {
  projectStudentQuestions,
  projectStudentSavedAnswers,
  isCanonicalStudentAnswerIndex,
  studentAnswerStorageKey,
  studentAnswerQuestionId
};
