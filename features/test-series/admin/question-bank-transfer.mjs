export const MAX_QUESTION_IMPORT_BYTES = 10 * 1024 * 1024;

export function assertQuestionImportSize(size) {
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_QUESTION_IMPORT_BYTES) {
    throw new RangeError("Import file का आकार अधिकतम 10 MiB होना चाहिए।");
  }
  return size;
}

export function exportQuestionBankRows(items) {
  if (!Array.isArray(items)) throw new TypeError("Question Bank items must be an array.");
  return items.map(item => ({
    topic: item.topic || "",
    chapter: item.chapter || "",
    folder: item.folder || "General",
    section: item.question?.section || "",
    text: item.question?.text || "",
    options: Array.isArray(item.question?.options) ? item.question.options : [],
    correctIndex: Number(item.correctIndex),
    explanation: item.question?.explanation || ""
  }));
}

export function parseQuestionImportJson(source) {
  if (typeof source !== "string") throw new TypeError("Question import JSON must be text.");
  assertQuestionImportSize(new TextEncoder().encode(source).byteLength);
  const text = source.charCodeAt(0) === 0xFEFF ? source.slice(1) : source;
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : parsed?.questions;
}

export function parseQuestionBankImportJson(source) {
  if (typeof source !== "string") throw new TypeError("Question Bank import JSON must be text.");
  assertQuestionImportSize(new TextEncoder().encode(source).byteLength);
  const text = source.charCodeAt(0) === 0xFEFF ? source.slice(1) : source;
  const parsed = JSON.parse(text);
  const rows = Array.isArray(parsed) ? parsed
    : Array.isArray(parsed?.items) ? parsed.items
      : Array.isArray(parsed?.questions) ? parsed.questions
        : null;
  if (!rows) throw new TypeError("Question Bank JSON must be an array or contain an items/questions array.");
  return rows;
}

export function questionBankItemAsTestQuestion(item, activeSection = "") {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new TypeError("Question Bank record का प्रारूप सही नहीं है।");
  }
  const itemId = typeof item.itemId === "string" ? item.itemId.trim() : "";
  // The Test Builder prefixes bank IDs with "bank_"; keep the final ID
  // within the same 100-character limit enforced by the draft/server validators.
  if (!/^[A-Za-z0-9_-]{1,95}$/.test(itemId)) {
    throw new RangeError("Question Bank ID 1 से 95 सुरक्षित अक्षरों का होना चाहिए।");
  }
  const source = item.question;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new TypeError("Question Bank प्रश्न का प्रारूप सही नहीं है।");
  }
  const text = typeof source.text === "string" ? source.text.trim() : "";
  if (!text || text.length > 5000) {
    throw new RangeError("Question Bank प्रश्न-पाठ आवश्यक है (अधिकतम 5000 अक्षर)।");
  }
  const options = Array.isArray(source.options)
    ? source.options.map(option => typeof option === "string" ? option.trim() : "")
    : [];
  if (options.length < 2 || options.length > 6 ||
      options.some(option => !option || option.length > 1000)) {
    throw new RangeError("Question Bank प्रश्न में 2 से 6 वैध विकल्प होने चाहिए।");
  }
  const correctIndex = item.correctIndex;
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
    throw new RangeError("Question Bank प्रश्न का सही उत्तर विकल्पों के अनुरूप नहीं है।");
  }
  if (activeSection !== undefined && activeSection !== null && typeof activeSection !== "string") {
    throw new TypeError("Test Section का नाम text होना चाहिए।");
  }
  if (source.section !== undefined && source.section !== null && typeof source.section !== "string") {
    throw new TypeError("Question Bank Section का प्रारूप सही नहीं है।");
  }
  const section = (typeof activeSection === "string" ? activeSection.trim() : "") ||
    (typeof source.section === "string" ? source.section.trim() : "");
  if (section.length > 80) {
    throw new RangeError("Question Bank Section अधिकतम 80 अक्षरों का हो सकता है।");
  }
  const explanation = source.explanation === undefined || source.explanation === null ? "" : source.explanation;
  if (typeof explanation !== "string" || explanation.length > 4000) {
    throw new RangeError("Question Bank Explanation text और अधिकतम 4000 अक्षरों का होना चाहिए।");
  }
  return {
    id: "bank_" + itemId,
    text,
    options,
    correctIndex,
    explanation,
    ...(section ? { section } : {})
  };
}

export function appendQuestionBankItemsToTest(currentQuestions, items, activeSection = "") {
  if (!Array.isArray(currentQuestions)) {
    throw new TypeError("Test प्रश्न सूची Array होनी चाहिए।");
  }
  if (currentQuestions.length > 500) {
    throw new RangeError("Test में अधिकतम 500 प्रश्न हो सकते हैं। पहले मौजूदा प्रश्न ठीक करें।");
  }
  if (!Array.isArray(items) || !items.length) {
    throw new TypeError("कम से कम एक Question Bank प्रश्न चुनें।");
  }

  // Validate every selected source record before returning a new draft array.
  // This keeps a mixed valid/invalid selection atomic: no partial append occurs.
  const mapped = items.map(item => questionBankItemAsTestQuestion(item, activeSection));
  const questions = [...currentQuestions];
  const knownIds = new Set(currentQuestions
    .filter(question => question && typeof question.id === "string")
    .map(question => question.id.trim()));
  let addedCount = 0;
  let skippedCount = 0;
  for (const question of mapped) {
    if (knownIds.has(question.id)) {
      skippedCount += 1;
      continue;
    }
    knownIds.add(question.id);
    questions.push(question);
    addedCount += 1;
  }
  if (questions.length > 500) {
    throw new RangeError("Test में अधिकतम 500 प्रश्न हो सकते हैं। कुछ प्रश्न हटाकर फिर जोड़ें।");
  }
  return { questions, addedCount, skippedCount };
}
