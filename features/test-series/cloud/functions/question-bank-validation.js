function fail(message, rowNumber) {
  const prefix = Number.isInteger(rowNumber) && rowNumber > 0 ? "Invalid question at row " + rowNumber + ": " : "";
  throw new Error(prefix + message);
}

function hasControlCharacters(value) {
  return Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function requiredLabel(value, field, maxLength, rowNumber) {
  if (typeof value !== "string") fail(field + " must be text", rowNumber);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || hasControlCharacters(normalized)) {
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

  const text = typeof question.text === "string" ? question.text.trim() : "";
  const options = Array.isArray(question.options)
    ? question.options.map(value => typeof value === "string" ? value.trim() : "")
    : [];
  const correctIndex = question.correctIndex;
  if (!text || text.length > 4000 || options.length < 2 || options.length > 6 ||
      options.some(option => !option || option.length > 1000) ||
      !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
    fail("question text, 2–6 text options and a valid correctIndex are required", rowNumber);
  }

  if (question.section !== undefined && question.section !== null && typeof question.section !== "string") {
    fail("section must be text", rowNumber);
  }
  const section = typeof question.section === "string" ? question.section.trim() : "";
  if (section.length > 80 || hasControlCharacters(section)) {
    fail("section must be within 80 characters and contain no control characters", rowNumber);
  }
  if (question.explanation !== undefined && question.explanation !== null && typeof question.explanation !== "string") {
    fail("explanation must be text", rowNumber);
  }

  return {
    topic,
    chapter,
    folder,
    question: {
      text,
      options,
      ...(section ? { section } : {}),
      explanation: typeof question.explanation === "string" ? question.explanation.slice(0, 4000) : ""
    },
    correctIndex
  };
}

module.exports = { normalizeQuestionBankItem };
