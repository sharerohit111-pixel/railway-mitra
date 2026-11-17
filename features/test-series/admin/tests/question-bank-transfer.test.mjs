import { test } from "node:test";
import assert from "node:assert/strict";
import { exportQuestionBankRows, parseQuestionImportJson } from "../question-bank-transfer.mjs";

test("question bank export preserves metadata and the server question schema", () => {
  const rows = exportQuestionBankRows([{
    topic: "Civil",
    chapter: "Soil Mechanics",
    folder: "GDCE JE",
    question: {
      section: "Technical",
      text: "What is the liquid limit?",
      options: ["A", "B", "C", "D"],
      explanation: "Casagrande method"
    },
    correctIndex: 2
  }]);
  assert.deepEqual(rows, [{
    topic: "Civil",
    chapter: "Soil Mechanics",
    folder: "GDCE JE",
    section: "Technical",
    text: "What is the liquid limit?",
    options: ["A", "B", "C", "D"],
    correctIndex: 2,
    explanation: "Casagrande method"
  }]);
});

test("JSON export round-trips through the same import parser", () => {
  const source = exportQuestionBankRows([{
    topic: "Civil", chapter: "Surveying", folder: "Practice",
    question: { section: "Core", text: "Define BM", options: ["A", "B"], explanation: "Benchmark" },
    correctIndex: 1
  }]);
  const downloadedJson = JSON.stringify(source, null, 2);
  assert.deepEqual(parseQuestionImportJson(downloadedJson), source);
});

test("JSON import tolerates a UTF-8 BOM but export remains plain JSON", () => {
  const rows = [{ text: "Question", options: ["A", "B"], correctIndex: 0 }];
  assert.deepEqual(parseQuestionImportJson("\uFEFF" + JSON.stringify(rows)), rows);
  assert.throws(() => parseQuestionImportJson("not JSON"), SyntaxError);
});

test("parser accepts the wrapped questions format and rejects non-text input", () => {
  const rows = [{ text: "Q", options: ["A", "B"], correctIndex: 1 }];
  assert.deepEqual(parseQuestionImportJson(JSON.stringify({ questions: rows })), rows);
  assert.throws(() => parseQuestionImportJson(null), TypeError);
});
