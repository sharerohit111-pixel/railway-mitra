"use strict";

function fail(message, rowNumber) {
  const prefix = Number.isInteger(rowNumber) && rowNumber > 0 ? "Invalid question at row " + rowNumber + ": " : "";
  throw new Error(prefix + message);
}

function hasControlCharacters(value) {
  return Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return code <= 31 || (code >= 127 && code <= 159);
  });
}

function hasDisallowedQuestionControls(value) {
  // Preserve ordinary multiline question formatting (LF, CR and TAB), but
  // reject the remaining C0 controls, DEL and the full C1 control range.
  return Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return code === 0 || (code >= 1 && code <= 8) ||
      code === 11 || code === 12 || (code >= 14 && code <= 31) ||
      (code >= 127 && code <= 159);
  });
}

function requiredLabel(value, field, maxLength, rowNumber) {
  if (typeof value !== "string") fail(field + " must be text", rowNumber);
  if (hasControlCharacters(value)) {
    fail(field + " is required and must be within " + maxLength + " characters", rowNumber);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    fail(field + " is required and must be within " + maxLength + " characters", rowNumber);
  }
  return normalized;
}

/**
 * Normalize one Owner question-bank record for both single and bulk writes.
 * This is pure validation: persistence and Owner authorization remain in index.js.
 */
function normalizeQuestionBankItem(item, rowNumber) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    fail("record must be an object", rowNumber);
  }
  const topic = requiredLabel(item.topic, "Topic", 80, rowNumber);
  const chapter = requiredLabel(item.chapter, "Chapter", 100, rowNumber);
  const folder = requiredLabel(item.folder, "Folder", 120, rowNumber);
  const question = item.question;
  if (!question || typeof question !== "object" || Array.isArray(question)) {
    fail("question must be an object", rowNumber);
  }

  const rawText = typeof question.text === "string" ? question.text : "";
  const rawOptions = Array.isArray(question.options) ? question.options : [];
  const correctIndex = question.correctIndex;
  if (!rawText.trim() || rawText.length > 4000 || hasDisallowedQuestionControls(rawText) ||
      rawOptions.length < 2 || rawOptions.length > 6 ||
      rawOptions.some(option => typeof option !== "string" || !option.trim() ||
        option.length > 1000 || hasDisallowedQuestionControls(option)) ||
      !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= rawOptions.length) {
    fail("question text, 2–6 text options and a valid correctIndex are required", rowNumber);
  }
  const text = rawText.trim();
  const options = rawOptions.map(option => option.trim());

  if (question.section !== undefined && question.section !== null && typeof question.section !== "string") {
    fail("section must be text", rowNumber);
  }
  const rawSection = typeof question.section === "string" ? question.section : "";
  if (rawSection.length > 80 || hasControlCharacters(rawSection)) {
    fail("section must be within 80 characters and contain no control characters", rowNumber);
  }
  const section = rawSection.trim();

  if (question.explanation !== undefined && question.explanation !== null && typeof question.explanation !== "string") {
    fail("explanation must be text", rowNumber);
  }
  const explanation = typeof question.explanation === "string" ? question.explanation : "";
  if (explanation.length > 4000 || hasDisallowedQuestionControls(explanation)) {
    fail("explanation must be within 4000 characters and contain no unsupported control characters", rowNumber);
  }

  return {
    topic,
    chapter,
    folder,
    question: {
      text,
      options,
      ...(section ? { section } : {}),
      explanation
    },
    correctIndex
  };
}


/**
 * Validate list filters without silently coercing malformed client values.
 * Cursor existence and Firestore pagination remain the callable's responsibility.
 */
function normalizeQuestionBankListRequest(data = {}) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    fail("question bank list request must be an object");
  }
  const pageSize = data.pageSize === undefined ? 50 : data.pageSize;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    fail("Page size must be from 1 to 100");
  }
  let search = "";
  if (data.search !== undefined && data.search !== null) {
    if (typeof data.search !== "string") fail("Search must be text");
    if (hasControlCharacters(data.search)) {
      fail("Search must be within 120 characters and contain no control characters");
    }
    search = data.search.trim();
    if (search.length > 120) {
      fail("Search must be within 120 characters and contain no control characters");
    }
  }
  const filters = {};
  for (const field of ["topic", "chapter", "folder"]) {
    if (data[field] === undefined || data[field] === null) continue;
    if (typeof data[field] !== "string") fail(field + " filter must be text");
    if (hasControlCharacters(data[field])) fail("Invalid " + field + " filter");
    const value = data[field].trim();
    if (!value) continue;
    const max = field === "topic" ? 80 : field === "chapter" ? 100 : 120;
    if (value.length > max) fail("Invalid " + field + " filter");
    filters[field] = value;
  }
  return { pageSize, searchText: search.toLocaleLowerCase(), filters };
}

module.exports = { normalizeQuestionBankItem, normalizeQuestionBankListRequest };
