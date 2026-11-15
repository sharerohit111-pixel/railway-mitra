"use strict";

const QUESTION_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

function fail() {
  throw new Error("Question paper contains invalid student question data");
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

module.exports = { projectStudentQuestions };
