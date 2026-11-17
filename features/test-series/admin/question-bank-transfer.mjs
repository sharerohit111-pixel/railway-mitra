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
  const text = source.charCodeAt(0) === 0xFEFF ? source.slice(1) : source;
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : parsed?.questions;
}
