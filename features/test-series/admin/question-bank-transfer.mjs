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

function questionImportRowError(rowNumber, message) {
  const prefix = Number.isSafeInteger(rowNumber) && rowNumber > 0
    ? "पंक्ति " + rowNumber + ": "
    : "";
  throw new TypeError(prefix + message);
}

function hasControlCharacters(value) {
  return Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function hasDisallowedQuestionControls(value) {
  // Preserve ordinary multiline question formatting (LF, CR and TAB).
  return Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return code === 0 || (code >= 1 && code <= 8) ||
      code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
  });
}

/**
 * Normalize one spreadsheet/JSON import row without coercing arbitrary values
 * into strings. Numeric answer options remain supported for spreadsheet cells.
 */
export function normalizeQuestionBankImportRow(row, rowNumber, defaults = {}) {
  if (!Number.isSafeInteger(rowNumber) || rowNumber < 1) {
    throw new RangeError("Question import row number must be a positive integer.");
  }
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    questionImportRowError(rowNumber, "प्रश्न रिकॉर्ड Object होना चाहिए।");
  }
  if (!defaults || typeof defaults !== "object" || Array.isArray(defaults)) {
    questionImportRowError(rowNumber, "डिफ़ॉल्ट विषय/अध्याय/फ़ोल्डर का प्रारूप सही नहीं है।");
  }

  const normalized = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [String(key).trim().toLowerCase(), value])
  );
  const readLabel = (value, fallback, label, maxLength) => {
    const candidate = value === undefined || value === null || value === "" ? fallback : value;
    if (candidate === undefined || candidate === null || typeof candidate !== "string") {
      questionImportRowError(rowNumber, label + " text होना चाहिए।");
    }
    if (hasControlCharacters(candidate)) {
      questionImportRowError(rowNumber, label + " में control characters स्वीकार नहीं हैं।");
    }
    const normalizedValue = candidate.trim();
    if (!normalizedValue || normalizedValue.length > maxLength) {
      questionImportRowError(rowNumber, label + " आवश्यक है और अधिकतम " + maxLength + " अक्षरों का होना चाहिए।");
    }
    return normalizedValue;
  };

  const topic = readLabel(normalized.topic, defaults.topic ?? "", "विषय", 80);
  const chapter = readLabel(normalized.chapter, defaults.chapter ?? "", "अध्याय", 100);
  const folder = readLabel(normalized.folder, defaults.folder ?? "General", "फ़ोल्डर", 120);

  const rawText = normalized.text ?? normalized.question ?? "";
  if (typeof rawText !== "string") {
    questionImportRowError(rowNumber, "प्रश्न का टेक्स्ट text होना चाहिए।");
  }
  if (rawText.length > 4000 || hasDisallowedQuestionControls(rawText)) {
    questionImportRowError(rowNumber, "प्रश्न का टेक्स्ट आवश्यक है, अधिकतम 4000 अक्षरों का हो और उसमें असमर्थित control characters न हों।");
  }
  const text = rawText.trim();
  if (!text) {
    questionImportRowError(rowNumber, "प्रश्न का टेक्स्ट आवश्यक है, अधिकतम 4000 अक्षरों का हो और उसमें असमर्थित control characters न हों।");
  }

  const rawSection = normalized.section;
  if (rawSection !== undefined && rawSection !== null && rawSection !== "" && typeof rawSection !== "string") {
    questionImportRowError(rowNumber, "सेक्शन का नाम text होना चाहिए।");
  }
  const section = typeof rawSection === "string" ? rawSection.trim() : "";
  if ((typeof rawSection === "string" && rawSection.length > 80) ||
      (typeof rawSection === "string" && hasControlCharacters(rawSection))) {
    questionImportRowError(rowNumber, "सेक्शन अधिकतम 80 अक्षरों का हो और उसमें control characters न हों।");
  }

  const rawExplanation = normalized.explanation;
  if (rawExplanation !== undefined && rawExplanation !== null && typeof rawExplanation !== "string") {
    questionImportRowError(rowNumber, "Explanation text होना चाहिए।");
  }
  const explanation = typeof rawExplanation === "string" ? rawExplanation : "";
  if (explanation.length > 4000 || hasDisallowedQuestionControls(explanation)) {
    questionImportRowError(rowNumber, "Explanation अधिकतम 4000 अक्षरों का हो और उसमें असमर्थित control characters न हों।");
  }

  let rawOptions = normalized.options;
  if (typeof rawOptions === "string" && rawOptions.trim().startsWith("[")) {
    try {
      rawOptions = JSON.parse(rawOptions);
    } catch {
      questionImportRowError(rowNumber, "विकल्पों का JSON सही प्रारूप में नहीं है।");
    }
  }

  const toOptionText = (value, index) => {
    let text;
    if (typeof value === "string") text = value;
    else if (typeof value === "number" && Number.isFinite(value)) text = String(value);
    else questionImportRowError(rowNumber, "विकल्प " + (index + 1) + " text या finite number होना चाहिए।");
    if (!text.trim() || text.length > 1000 || hasDisallowedQuestionControls(text)) {
      questionImportRowError(rowNumber, "विकल्प " + (index + 1) + " गैर-खाली होना चाहिए, अधिकतम 1000 अक्षरों का हो और उसमें असमर्थित control characters न हों।");
    }
    return text.trim();
  };

  let options;
  if (Array.isArray(rawOptions)) {
    options = rawOptions.map(toOptionText);
  } else if (rawOptions === undefined || rawOptions === null || rawOptions === "") {
    const columns = ["A", "B", "C", "D", "E", "F"]
      .map(letter => normalized["option" + letter.toLowerCase()])
      .filter(value => value !== undefined && value !== null && value !== "");
    options = columns.map(toOptionText);
  } else {
    questionImportRowError(rowNumber, "विकल्प Array या JSON Array text होना चाहिए।");
  }
  if (options.length < 2 || options.length > 6 ||
      options.some(option => !option || option.length > 1000 || hasDisallowedQuestionControls(option))) {
    questionImportRowError(rowNumber, "2 से 6 गैर-खाली विकल्प आवश्यक हैं; हर विकल्प अधिकतम 1000 अक्षरों का होना चाहिए।");
  }

  const rawIndex = normalized.correctindex ?? normalized.correct_index ?? normalized.answerindex;
  let correctIndex = NaN;
  if (typeof rawIndex === "number") {
    correctIndex = rawIndex;
  } else if (typeof rawIndex === "string" && rawIndex.trim() !== "") {
    correctIndex = Number(rawIndex.trim());
  } else if (rawIndex !== undefined && rawIndex !== null && rawIndex !== "") {
    questionImportRowError(rowNumber, "सही उत्तर का क्रमांक number या numeric text होना चाहिए।");
  }
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
    questionImportRowError(rowNumber, "सही उत्तर का क्रमांक उपलब्ध विकल्पों की सीमा में होना चाहिए।");
  }

  return {
    topic,
    chapter,
    folder,
    question: {
      text,
      ...(section ? { section } : {}),
      options,
      correctIndex,
      explanation
    }
  };
}


/**
 * Normalize one direct Test Management JSON/spreadsheet row.
 * This is intentionally separate from Question Bank persistence: it produces
 * the exact question-editor shape and never coerces arbitrary objects/booleans
 * into apparently valid question text.
 */
export function normalizeTestBuilderImportRow(row, rowNumber) {
  if (!Number.isSafeInteger(rowNumber) || rowNumber < 1) {
    throw new RangeError("Test import row number must be a positive integer.");
  }
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    questionImportRowError(rowNumber, "प्रश्न रिकॉर्ड Object होना चाहिए।");
  }

  const normalized = Object.create(null);
  for (const [rawKey, value] of Object.entries(row)) {
    const key = String(rawKey).trim().toLowerCase();
    if (!key) continue;
    if (Object.prototype.hasOwnProperty.call(normalized, key)) {
      questionImportRowError(rowNumber, "एक ही नाम का column दोहराया गया है: " + key + "।");
    }
    normalized[key] = value;
  }

  let id = "q" + rowNumber;
  if (normalized.id !== undefined && normalized.id !== null && normalized.id !== "") {
    if (typeof normalized.id === "string") id = normalized.id.trim();
    else if (typeof normalized.id === "number" && Number.isSafeInteger(normalized.id)) id = String(normalized.id);
    else questionImportRowError(rowNumber, "प्रश्न ID सुरक्षित text या integer होना चाहिए।");
  }
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) {
    questionImportRowError(rowNumber, "प्रश्न ID में केवल 1 से 100 सुरक्षित अक्षर, अंक, _ या - स्वीकार हैं।");
  }

  const rawText = normalized.text ?? normalized.question ?? "";
  if (typeof rawText !== "string") {
    questionImportRowError(rowNumber, "प्रश्न का टेक्स्ट text होना चाहिए।");
  }
  if (rawText.length > 5000 || hasDisallowedQuestionControls(rawText)) {
    questionImportRowError(rowNumber, "प्रश्न का टेक्स्ट आवश्यक है, अधिकतम 5000 अक्षरों का हो और उसमें असमर्थित control characters न हों।");
  }
  const text = rawText.trim();
  if (!text) {
    questionImportRowError(rowNumber, "प्रश्न का टेक्स्ट आवश्यक है, अधिकतम 5000 अक्षरों का हो और उसमें असमर्थित control characters न हों।");
  }

  let rawOptions = normalized.options;
  if (typeof rawOptions === "string" && rawOptions.trim().startsWith("[")) {
    try {
      rawOptions = JSON.parse(rawOptions);
    } catch {
      questionImportRowError(rowNumber, "विकल्पों का JSON सही प्रारूप में नहीं है।");
    }
  }

  const toOptionText = (value, index) => {
    let text;
    if (typeof value === "string") text = value;
    else if (typeof value === "number" && Number.isFinite(value)) text = String(value);
    else questionImportRowError(rowNumber, "विकल्प " + (index + 1) + " text या finite number होना चाहिए।");
    if (!text.trim() || text.length > 1000 || hasDisallowedQuestionControls(text)) {
      questionImportRowError(rowNumber, "विकल्प " + (index + 1) + " गैर-खाली होना चाहिए, अधिकतम 1000 अक्षरों का हो और उसमें असमर्थित control characters न हों।");
    }
    return text.trim();
  };

  let options;
  if (Array.isArray(rawOptions)) {
    options = rawOptions.map(toOptionText);
  } else if (rawOptions === undefined || rawOptions === null || rawOptions === "" ||
      (typeof rawOptions === "string" && !rawOptions.trim().startsWith("["))) {
    const columns = ["a", "b", "c", "d", "e", "f"]
      .map(letter => normalized["option" + letter])
      .filter(value => value !== undefined && value !== null && value !== "");
    options = columns.map(toOptionText);
    if (!options.length && typeof rawOptions === "string" && rawOptions.trim()) {
      questionImportRowError(rowNumber, "विकल्प Array या JSON Array text होना चाहिए।");
    }
  } else {
    questionImportRowError(rowNumber, "विकल्प Array या JSON Array text होना चाहिए।");
  }

  if (options.length < 2 || options.length > 6 ||
      options.some(option => !option || option.length > 1000 || hasDisallowedQuestionControls(option))) {
    questionImportRowError(rowNumber, "2 से 6 गैर-खाली विकल्प आवश्यक हैं; हर विकल्प अधिकतम 1000 अक्षरों का होना चाहिए।");
  }

  const answerKey = ["correctindex", "correct_index", "answerindex", "answer_index"]
    .find(key => Object.prototype.hasOwnProperty.call(normalized, key));
  const rawIndex = answerKey ? normalized[answerKey] : undefined;
  let correctIndex = NaN;
  if (typeof rawIndex === "number") {
    correctIndex = rawIndex;
  } else if (typeof rawIndex === "string" && /^\d+$/.test(rawIndex.trim())) {
    correctIndex = Number(rawIndex.trim());
  } else {
    questionImportRowError(rowNumber, "सही उत्तर का क्रमांक number या numeric text होना चाहिए।");
  }
  if (!Number.isSafeInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
    questionImportRowError(rowNumber, "सही उत्तर का क्रमांक उपलब्ध विकल्पों की सीमा में होना चाहिए।");
  }

  const rawSection = normalized.section;
  if (rawSection !== undefined && rawSection !== null && rawSection !== "" && typeof rawSection !== "string") {
    questionImportRowError(rowNumber, "सेक्शन का नाम text होना चाहिए।");
  }
  const section = typeof rawSection === "string" ? rawSection.trim() : "";
  if ((typeof rawSection === "string" && rawSection.length > 80) ||
      (typeof rawSection === "string" && hasControlCharacters(rawSection))) {
    questionImportRowError(rowNumber, "सेक्शन अधिकतम 80 अक्षरों का हो और उसमें control characters न हों।");
  }

  const rawExplanation = normalized.explanation;
  if (rawExplanation !== undefined && rawExplanation !== null && rawExplanation !== "" && typeof rawExplanation !== "string") {
    questionImportRowError(rowNumber, "Explanation text होना चाहिए।");
  }
  const rawExplanationText = typeof rawExplanation === "string" ? rawExplanation : "";
  if (rawExplanationText.length > 4000 || hasDisallowedQuestionControls(rawExplanationText)) {
    questionImportRowError(rowNumber, "Explanation अधिकतम 4000 अक्षरों का हो और उसमें असमर्थित control characters न हों।");
  }
  const explanation = rawExplanationText.trim();

  return {
    id,
    text,
    options,
    correctIndex,
    ...(section ? { section } : {}),
    ...(explanation ? { explanation } : {})
  };
}

/** Validate the complete import before the Test Management editor is changed. */
export function normalizeTestBuilderImportRows(rows) {
  if (!Array.isArray(rows)) {
    throw new TypeError("Test import में प्रश्नों की Array होनी चाहिए।");
  }
  if (rows.length < 1 || rows.length > 500) {
    throw new RangeError("एक Test में 1 से 500 प्रश्न आयात किए जा सकते हैं।");
  }
  const ids = new Set();
  return rows.map((row, index) => {
    const question = normalizeTestBuilderImportRow(row, index + 1);
    if (ids.has(question.id)) {
      questionImportRowError(index + 1, "प्रश्न ID दोहराई गई है: " + question.id + "।");
    }
    ids.add(question.id);
    return question;
  });
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
  const rawText = typeof source.text === "string" ? source.text : "";
  if (!rawText.trim() || rawText.length > 5000 || hasDisallowedQuestionControls(rawText)) {
    throw new RangeError("Question Bank प्रश्न-पाठ आवश्यक है (अधिकतम 5000 अक्षर) और उसमें असमर्थित control characters नहीं होने चाहिए।");
  }
  const text = rawText.trim();
  const rawOptions = Array.isArray(source.options) ? source.options : [];
  if (rawOptions.length < 2 || rawOptions.length > 6 ||
      rawOptions.some(option => typeof option !== "string" || !option.trim() ||
        option.length > 1000 || hasDisallowedQuestionControls(option))) {
    throw new RangeError("Question Bank प्रश्न में 2 से 6 वैध विकल्प होने चाहिए और उनमें असमर्थित control characters नहीं होने चाहिए।");
  }
  const options = rawOptions.map(option => option.trim());
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
  const rawActiveSection = typeof activeSection === "string" ? activeSection : "";
  const rawStoredSection = typeof source.section === "string" ? source.section : "";
  const rawSection = rawActiveSection.trim() ? rawActiveSection : rawStoredSection;
  if (rawSection.length > 80 || hasControlCharacters(rawSection)) {
    throw new RangeError("Question Bank Section अधिकतम 80 अक्षरों का हो सकता है और उसमें control characters नहीं होने चाहिए।");
  }
  const section = rawSection.trim();
  const explanation = source.explanation === undefined || source.explanation === null ? "" : source.explanation;
  if (typeof explanation !== "string" || explanation.length > 4000 ||
      hasDisallowedQuestionControls(explanation)) {
    throw new RangeError("Question Bank Explanation text, अधिकतम 4000 अक्षरों का और असमर्थित control characters से मुक्त होना चाहिए।");
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
