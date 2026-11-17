import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_QUESTION_IMPORT_BYTES, appendQuestionBankItemsToTest, assertQuestionImportSize, exportQuestionBankRows, parseQuestionImportJson, parseQuestionBankImportJson, questionBankItemAsTestQuestion } from "../question-bank-transfer.mjs";

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

test("Test Builder mapping preserves answer data and applies the selected section", () => {
  const item = {
    itemId: "qb-42",
    question: { text: "What is a benchmark?", options: ["RL", "BM"], section: "Survey" },
    correctIndex: 1
  };
  assert.deepEqual(questionBankItemAsTestQuestion(item), {
    id: "bank_qb-42", text: "What is a benchmark?", options: ["RL", "BM"],
    correctIndex: 1, explanation: "", section: "Survey"
  });
  assert.equal(questionBankItemAsTestQuestion(item, "Technical").section, "Technical");
});


test("bounds admin question imports to 10 MiB and rejects invalid file sizes", () => {
  assert.equal(assertQuestionImportSize(MAX_QUESTION_IMPORT_BYTES), MAX_QUESTION_IMPORT_BYTES);
  assert.equal(assertQuestionImportSize(0), 0);
  for (const size of [-1, 1.5, NaN, Infinity, undefined, MAX_QUESTION_IMPORT_BYTES + 1]) {
    assert.throws(() => assertQuestionImportSize(size), RangeError);
  }
  assert.throws(() => parseQuestionImportJson(" ".repeat(MAX_QUESTION_IMPORT_BYTES + 1)), /10 MiB/);
});


test("Test Builder mapping keeps bank-prefixed question IDs within the 100-character validator limit", () => {
  const item = {
    itemId: "x".repeat(95),
    question: { text: "Question?", options: ["A", "B"] },
    correctIndex: 1
  };
  assert.equal(questionBankItemAsTestQuestion(item).id.length, 100);
  assert.throws(() => questionBankItemAsTestQuestion({ ...item, itemId: "x".repeat(96) }), /95/);
  assert.throws(() => questionBankItemAsTestQuestion({ ...item, itemId: "../unsafe" }), /95/);
});

test("Test Builder mapping rejects malformed bank questions before they enter the draft", () => {
  const base = {
    itemId: "qb-1",
    question: { text: "Question?", options: ["A", "B"], section: "Core", explanation: "Why" },
    correctIndex: 1
  };
  for (const item of [
    { ...base, question: null },
    { ...base, question: { ...base.question, text: " " } },
    { ...base, question: { ...base.question, options: ["A"] } },
    { ...base, question: { ...base.question, options: ["A", "B"], correctIndex: 0 }, correctIndex: 2 },
    { ...base, question: { ...base.question, section: "x".repeat(81) } },
    { ...base, question: { ...base.question, explanation: "x".repeat(4001) } }
  ]) {
    assert.throws(() => questionBankItemAsTestQuestion(item));
  }
  assert.throws(() => questionBankItemAsTestQuestion(base, {}), TypeError);
});

test("Question Bank append shares IDs across existing and selected rows and never mutates the current draft", () => {
  const existing = [{ id: "bank_qb-1", text: "Already present" }];
  const source = id => ({
    itemId: id,
    question: { text: "Question " + id, options: ["A", "B"] },
    correctIndex: 0
  });
  const result = appendQuestionBankItemsToTest(existing, [source("qb-1"), source("qb-2"), source("qb-2")]);
  assert.equal(result.addedCount, 1);
  assert.equal(result.skippedCount, 2);
  assert.deepEqual(existing, [{ id: "bank_qb-1", text: "Already present" }]);
  assert.deepEqual(result.questions.map(question => question.id), ["bank_qb-1", "bank_qb-2"]);
});

test("Question Bank append rejects a draft overflow atomically at the 500-question ceiling", () => {
  const current = Array.from({ length: 499 }, (_, index) => ({ id: "q" + index }));
  const source = id => ({
    itemId: id,
    question: { text: "Question " + id, options: ["A", "B"] },
    correctIndex: 0
  });
  assert.throws(
    () => appendQuestionBankItemsToTest(current, [source("bank-a"), source("bank-b")]),
    /500/
  );
  assert.equal(current.length, 499);
  assert.throws(() => appendQuestionBankItemsToTest([...current, { id: "q500" }], [source("bank-c")]), /500/);
});


test("Question Bank JSON import accepts arrays, items/questions envelopes and a UTF-8 BOM", () => {
  const rows = [{ topic: "Civil", chapter: "Surveying", folder: "Practice", section: "Core", text: "Define BM", options: ["A", "B"], correctIndex: 1, explanation: "Benchmark" }];
  assert.deepEqual(parseQuestionBankImportJson(JSON.stringify(rows)), rows);
  assert.deepEqual(parseQuestionBankImportJson("\uFEFF" + JSON.stringify({ items: rows })), rows);
  assert.deepEqual(parseQuestionBankImportJson(JSON.stringify({ questions: rows })), rows);
});

test("Question Bank JSON import rejects invalid envelopes, non-text input and oversized UTF-8 content", () => {
  for (const source of [JSON.stringify({ rows: [] }), JSON.stringify({ items: "not-an-array" }), "null", "42"]) {
    assert.throws(() => parseQuestionBankImportJson(source), TypeError);
  }
  assert.throws(() => parseQuestionBankImportJson(null), TypeError);
  assert.throws(() => parseQuestionBankImportJson(" ".repeat(MAX_QUESTION_IMPORT_BYTES + 1)), /10 MiB/);
});

test("Question Bank export JSON remains directly importable without reshaping its flat row schema", () => {
  const rows = exportQuestionBankRows([{
    topic: "Civil", chapter: "Surveying", folder: "Practice",
    question: { section: "Core", text: "Define BM", options: ["A", "B"], explanation: "Benchmark" },
    correctIndex: 1
  }]);
  assert.deepEqual(parseQuestionBankImportJson(JSON.stringify(rows)), rows);
});
