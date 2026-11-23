import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_QUESTION_IMPORT_BYTES, appendQuestionBankItemsToTest, assertQuestionImportSize, exportQuestionBankRows, parseQuestionImportJson, parseQuestionBankImportJson, questionBankItemAsTestQuestion, normalizeQuestionBankImportRow, normalizeTestBuilderImportRows } from "../question-bank-transfer.mjs";

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



test("Test Builder mapping rejects non-canonical Question Bank document IDs without trimming", () => {
  const base = {
    itemId: "qb-1",
    question: { text: "Question?", options: ["A", "B"] },
    correctIndex: 1
  };
  assert.equal(questionBankItemAsTestQuestion(base).id, "bank_qb-1");
  const invalidIds = [
    " qb-1",
    "qb-1 ",
    String.fromCharCode(9) + "qb-1",
    "qb-1" + String.fromCharCode(10),
    String.fromCharCode(13) + "qb-1"
  ];
  for (const itemId of invalidIds) {
    assert.throws(
      () => questionBankItemAsTestQuestion({ ...base, itemId }),
      RangeError,
      "non-canonical document ID " + JSON.stringify(itemId)
    );
  }
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

test("Question Bank append does not alias malformed whitespace IDs to canonical bank IDs", () => {
  const malformedExisting = [{ id: " bank_qb-1 " }];
  const source = {
    itemId: "qb-1",
    question: { text: "Question qb-1", options: ["A", "B"] },
    correctIndex: 0
  };
  const result = appendQuestionBankItemsToTest(malformedExisting, [source]);
  assert.equal(result.addedCount, 1);
  assert.equal(result.skippedCount, 0);
  assert.deepEqual(result.questions.map(question => question.id), [" bank_qb-1 ", "bank_qb-1"]);
  assert.deepEqual(malformedExisting, [{ id: " bank_qb-1 " }]);
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


test("normalizes spreadsheet rows without coercing malformed values into text", () => {
  const normalized = normalizeQuestionBankImportRow({
    topic: "Civil",
    chapter: "Surveying",
    folder: "",
    question: "Define benchmark",
    optionA: 1,
    optionB: 2,
    correct_index: "1",
    explanation: "A reference point"
  }, 4, { folder: "Practice" });
  assert.deepEqual(normalized, {
    topic: "Civil",
    chapter: "Surveying",
    folder: "Practice",
    question: {
      text: "Define benchmark",
      options: ["1", "2"],
      correctIndex: 1,
      explanation: "A reference point"
    }
  });
});

test("normalizes JSON option arrays and preserves an optional section label", () => {
  assert.deepEqual(normalizeQuestionBankImportRow({
    topic: "Civil",
    chapter: "Soil Mechanics",
    folder: "GDCE",
    text: "What is LL?",
    section: "Technical",
    options: '["Liquid limit", "Plastic limit"]',
    correctIndex: 0
  }, 1), {
    topic: "Civil",
    chapter: "Soil Mechanics",
    folder: "GDCE",
    question: {
      text: "What is LL?",
      section: "Technical",
      options: ["Liquid limit", "Plastic limit"],
      correctIndex: 0,
      explanation: ""
    }
  });
});

test("rejects malformed row and non-text metadata/question fields with row context", () => {
  const base = {
    topic: "Civil", chapter: "Surveying", folder: "Practice",
    text: "Define BM", options: ["A", "B"], correctIndex: 0
  };
  for (const row of [
    null,
    [],
    { ...base, topic: { value: "Civil" } },
    { ...base, chapter: 12 },
    { ...base, folder: false },
    { ...base, text: { value: "Define BM" } },
    { ...base, section: true },
    { ...base, explanation: { value: "Reason" } },
    { ...base, options: ["A", { label: "B" }] },
    { ...base, options: [true, "B"] },
    { ...base, options: "{not-json" },
    { ...base, correctIndex: { value: 0 } }
  ]) {
    assert.throws(
      () => normalizeQuestionBankImportRow(row, 7),
      /पंक्ति 7:/
    );
  }
});

test("rejects malformed option JSON and invalid import defaults", () => {
  const base = {
    topic: "Civil", chapter: "Surveying", folder: "Practice",
    text: "Define BM", options: ["A", "B"], correctIndex: 0
  };
  assert.throws(() => normalizeQuestionBankImportRow({
    ...base, options: '["A",'
  }, 2), /पंक्ति 2:.*विकल्पों का JSON/);
  assert.throws(() => normalizeQuestionBankImportRow(base, 2, []), /पंक्ति 2:/);
  assert.throws(() => normalizeQuestionBankImportRow(base, 0), /row number/);
});


test("import normalizer matches server-required Question Bank field limits", () => {
  const base = {
    topic: "Civil", chapter: "Surveying", folder: "Practice",
    text: "Define BM", options: ["A", "B"], correctIndex: 0
  };
  const invalidRows = [
    { ...base, topic: " " },
    { ...base, topic: "x".repeat(81) },
    { ...base, chapter: "x".repeat(101) },
    { ...base, folder: "x".repeat(121) },
    { ...base, text: " " },
    { ...base, text: "x".repeat(4001) },
    { ...base, options: ["A"] },
    { ...base, options: ["A", "B", "C", "D", "E", "F", "G"] },
    { ...base, options: ["A", "x".repeat(1001)] },
    { ...base, options: ["A", "B"], correctIndex: 2 },
    { ...base, options: ["A", "B"], correctIndex: 0.5 },
    { ...base, section: "x".repeat(81) },
    { ...base, explanation: "x".repeat(4001) }
  ];
  for (const row of invalidRows) {
    assert.throws(() => normalizeQuestionBankImportRow(row, 9), /पंक्ति 9:/);
  }
});

test("import normalizer rejects disallowed control characters but preserves ordinary multiline text", () => {
  const newline = String.fromCharCode(10);
  const carriageReturn = String.fromCharCode(13);
  const tab = String.fromCharCode(9);
  const nul = String.fromCharCode(0);
  const bell = String.fromCharCode(7);
  const base = {
    topic: "Civil", chapter: "Surveying", folder: "Practice",
    text: "Line one" + newline + "Line two" + tab + "continued",
    options: ["A", "B"], correctIndex: 0,
    explanation: "Reason" + carriageReturn + newline + "continued"
  };
  assert.equal(normalizeQuestionBankImportRow(base, 1).question.text, base.text);
  assert.equal(normalizeQuestionBankImportRow(base, 1).question.explanation, base.explanation);
  for (const row of [
    { ...base, topic: "Civil" + newline + "Track" },
    { ...base, chapter: "Survey" + nul + "ing" },
    { ...base, section: "Core" + tab + "Section" },
    { ...base, text: "Question" + nul + "text" },
    { ...base, options: ["A" + nul, "B"] },
    { ...base, explanation: "Why" + bell }
  ]) {
    assert.throws(() => normalizeQuestionBankImportRow(row, 3), /पंक्ति 3:/);
  }
});

test("Question Bank metadata labels reject trim-removable controls before normalization", () => {
  const base = {
    topic: "Civil", chapter: "Surveying", folder: "Practice",
    text: "Define BM", options: ["A", "B"], correctIndex: 0
  };
  const trimRemovableControls = [9, 10, 13, 11, 12].map(code => String.fromCharCode(code));

  for (const field of ["topic", "chapter", "folder"]) {
    for (const control of trimRemovableControls) {
      for (const value of ["Civil" + control, control + "Civil"]) {
        assert.throws(
          () => normalizeQuestionBankImportRow({ ...base, [field]: value }, 5),
          /पंक्ति 5:/,
          field + " raw control must be rejected before trim"
        );
      }
      const defaults = { topic: "Civil", chapter: "Surveying", folder: "Practice" };
      defaults[field] = "Valid" + control;
      assert.throws(
        () => normalizeQuestionBankImportRow({ ...base, [field]: "" }, 5, defaults),
        /पंक्ति 5:/,
        field + " fallback control must be rejected before trim"
      );
    }
  }

  const normalized = normalizeQuestionBankImportRow({
    ...base, topic: " Civil ", chapter: " Surveying ", folder: " Practice "
  }, 5);
  assert.deepEqual(
    [normalized.topic, normalized.chapter, normalized.folder],
    ["Civil", "Surveying", "Practice"]
  );
});

test("spreadsheet option cells are trimmed and numeric answers remain supported", () => {
  const row = normalizeQuestionBankImportRow({
    topic: " Civil ", chapter: " Surveying ", folder: " Practice ",
    text: " Define BM ", optionA: " RL ", optionB: 12, correctIndex: "1"
  }, 2);
  assert.deepEqual(row, {
    topic: "Civil", chapter: "Surveying", folder: "Practice",
    question: { text: "Define BM", options: ["RL", "12"], correctIndex: 1, explanation: "" }
  });
});

test("Question Bank export JSON can be imported directly into the Test Builder", () => {
  const exported = exportQuestionBankRows([{
    topic: "Civil",
    chapter: "Surveying",
    folder: "Practice",
    question: {
      section: "Technical",
      text: "Define benchmark",
      options: ["Reduced Level", "Benchmark"],
      explanation: "A fixed reference point"
    },
    correctIndex: 1
  }]);
  const parsed = parseQuestionBankImportJson(JSON.stringify(exported));
  assert.deepEqual(normalizeTestBuilderImportRows(parsed), [{
    id: "q1",
    text: "Define benchmark",
    options: ["Reduced Level", "Benchmark"],
    correctIndex: 1,
    section: "Technical",
    explanation: "A fixed reference point"
  }]);
});

test("Test Builder import normalizes JSON and spreadsheet columns without unsafe coercion", () => {
  assert.deepEqual(normalizeTestBuilderImportRows([{
    ID: "civil_1",
    Question: "  What is BM?  ",
    optionA: 10,
    optionB: " 20 ",
    correct_index: "1",
    section: " Core "
  }]), [{
    id: "civil_1",
    text: "What is BM?",
    options: ["10", "20"],
    correctIndex: 1,
    section: "Core"
  }]);

  assert.deepEqual(normalizeTestBuilderImportRows([{
    text: "Question",
    options: '["A","B"]',
    correctIndex: 0
  }]), [{
    id: "q1",
    text: "Question",
    options: ["A", "B"],
    correctIndex: 0
  }]);
});

test("Test Builder import accepts Question Bank items/questions envelopes and numeric answer text", () => {
  const rows = [{ text: "Question", options: ["A", "B"], correctIndex: "1" }];
  assert.deepEqual(
    normalizeTestBuilderImportRows(parseQuestionBankImportJson(JSON.stringify({ items: rows }))),
    [{ id: "q1", text: "Question", options: ["A", "B"], correctIndex: 1 }]
  );
  assert.deepEqual(
    normalizeTestBuilderImportRows(parseQuestionBankImportJson(JSON.stringify({ questions: rows }))),
    [{ id: "q1", text: "Question", options: ["A", "B"], correctIndex: 1 }]
  );
});

test("Test Builder import rejects objects, booleans and duplicate normalized columns", () => {
  const base = { text: "Question", options: ["A", "B"], correctIndex: 0 };
  for (const row of [
    { ...base, text: { value: "Question" } },
    { ...base, optionA: true, options: undefined },
    { ...base, section: { name: "Core" } },
    { ...base, explanation: false },
    { ...base, id: {} },
    { ...base, options: ["A", { label: "B" }] }
  ]) {
    assert.throws(() => normalizeTestBuilderImportRows([row]), /पंक्ति 1:/);
  }
  assert.throws(
    () => normalizeTestBuilderImportRows([{ text: "Question", TEXT: "Other", options: ["A", "B"], correctIndex: 0 }]),
    /पंक्ति 1:.*column दोहराया/
  );
});

test("Test Builder import rejects duplicate IDs, invalid indexes and malformed options", () => {
  assert.throws(() => normalizeTestBuilderImportRows([
    { id: "same", text: "Q1", options: ["A", "B"], correctIndex: 0 },
    { id: "same", text: "Q2", options: ["A", "B"], correctIndex: 1 }
  ]), /पंक्ति 2:.*ID दोहराई/);

  for (const row of [
    { text: "Q", options: ["A", "B"], correctIndex: -1 },
    { text: "Q", options: ["A", "B"], correctIndex: 2 },
    { text: "Q", options: ["A", "B"], correctIndex: "1.5" },
    { text: "Q", options: "[not-json", optionA: "A", optionB: "B", correctIndex: 0 },
    { text: "Q", options: ["A"], correctIndex: 0 },
    { text: "Q", options: ["A", "B", "C", "D", "E", "F", "G"], correctIndex: 0 }
  ]) {
    assert.throws(() => normalizeTestBuilderImportRows([row]), /पंक्ति 1:/);
  }
});

test("Test Builder import enforces text limits and rejects unsupported controls", () => {
  const base = { text: "Question", options: ["A", "B"], correctIndex: 0 };
  for (const row of [
    { ...base, text: "x".repeat(5001) },
    { ...base, text: "Question" + String.fromCharCode(0) + "text" },
    { ...base, options: ["A", "B" + String.fromCharCode(7)] },
    { ...base, section: "Core" + String.fromCharCode(10) + "Section" },
    { ...base, explanation: "x".repeat(4001) }
  ]) {
    assert.throws(() => normalizeTestBuilderImportRows([row]), /पंक्ति 1:/);
  }
  const multiline = "Line 1" + String.fromCharCode(10) + "Line 2" + String.fromCharCode(9) + "continued";
  assert.equal(normalizeTestBuilderImportRows([{ ...base, text: multiline }])[0].text, multiline);
});

test("Test Builder import validates the complete array before editor use", () => {
  assert.throws(() => normalizeTestBuilderImportRows(null), /Array/);
  assert.throws(() => normalizeTestBuilderImportRows([]), /1 से 500/);
  assert.throws(() => normalizeTestBuilderImportRows(Array.from({ length: 501 }, () => ({
    text: "Q", options: ["A", "B"], correctIndex: 0
  }))), /1 से 500/);
});


test("Question Bank to Test Builder preflight rejects unsupported controls before draft insertion", () => {
  const base = {
    itemId: "qb-controls",
    question: { text: "Question?", options: ["A", "B"], section: "Core", explanation: "Reason" },
    correctIndex: 1
  };
  for (const code of [0, 7, 11, 12, 127]) {
    const control = String.fromCharCode(code);
    assert.throws(() => questionBankItemAsTestQuestion({
      ...base, question: { ...base.question, text: "Question" + control }
    }), RangeError, "question text control code " + code);
    assert.throws(() => questionBankItemAsTestQuestion({
      ...base, question: { ...base.question, options: ["A" + control, "B"] }
    }), RangeError, "option control code " + code);
    assert.throws(() => questionBankItemAsTestQuestion({
      ...base, question: { ...base.question, explanation: "Reason" + control }
    }), RangeError, "explanation control code " + code);
  }
  for (const code of [0, 9, 10, 13, 127]) {
    const control = String.fromCharCode(code);
    assert.throws(() => questionBankItemAsTestQuestion({
      ...base, question: { ...base.question, section: "Core" + control + "Section" }
    }), RangeError, "stored section control code " + code);
    assert.throws(() => questionBankItemAsTestQuestion(base, "Core" + control + "Section"),
      RangeError, "active section control code " + code);
  }
});

test("Question Bank mapping preserves TAB, LF and CR formatting accepted by publish validation", () => {
  const item = {
    itemId: "qb-formatted",
    question: {
      text: "Question line 1\\r\\nQuestion line 2",
      options: ["Option\\tA", "Option B"],
      section: "Technical Ability",
      explanation: "Reason line 1\\r\\nReason line 2"
    },
    correctIndex: 0
  };
  const mapped = questionBankItemAsTestQuestion(item);
  assert.equal(mapped.text, item.question.text);
  assert.equal(mapped.options[0], item.question.options[0]);
  assert.equal(mapped.explanation, item.question.explanation);
  assert.equal(mapped.section, "Technical Ability");
});


test("Question Bank and Test Builder preflight reject trailing controls before trimming", () => {
  const verticalTab = String.fromCharCode(11);
  const trailingTab = String.fromCharCode(9);
  const trailingNewline = String.fromCharCode(10);
  const bankRow = {
    topic: "Civil", chapter: "Surveying", folder: "Practice",
    text: "Question?", options: ["A", "B"], correctIndex: 0
  };
  const builderRow = { text: "Question?", options: ["A", "B"], correctIndex: 0 };
  const bankItem = {
    itemId: "qb-trailing",
    question: { text: "Question?", options: ["A", "B"], section: "Core", explanation: "Reason" },
    correctIndex: 0
  };

  for (const value of [
    { ...bankRow, text: "Question?" + verticalTab },
    { ...bankRow, options: ["A" + verticalTab, "B"] }
  ]) {
    assert.throws(() => normalizeQuestionBankImportRow(value, 1), /पंक्ति 1:/);
  }
  for (const value of [
    { ...builderRow, text: "Question?" + verticalTab },
    { ...builderRow, options: ["A" + verticalTab, "B"] }
  ]) {
    assert.throws(() => normalizeTestBuilderImportRows([value]), /पंक्ति 1:/);
  }
  assert.throws(() => questionBankItemAsTestQuestion({
    ...bankItem, question: { ...bankItem.question, text: "Question?" + verticalTab }
  }), RangeError);
  assert.throws(() => questionBankItemAsTestQuestion({
    ...bankItem, question: { ...bankItem.question, options: ["A" + verticalTab, "B"] }
  }), RangeError);
  assert.throws(() => questionBankItemAsTestQuestion({
    ...bankItem, question: { ...bankItem.question, explanation: "Reason" + verticalTab }
  }), RangeError);

  assert.throws(() => normalizeQuestionBankImportRow({ ...bankRow, section: "Core" + trailingTab }, 1), /पंक्ति 1:/);
  assert.throws(() => normalizeTestBuilderImportRows([{ ...builderRow, section: "Core" + trailingNewline }]), /पंक्ति 1:/);
  assert.throws(() => questionBankItemAsTestQuestion({
    ...bankItem, question: { ...bankItem.question, section: "Core" + trailingNewline }
  }), RangeError);
  assert.throws(() => questionBankItemAsTestQuestion(bankItem, "Technical" + trailingTab), RangeError);
});

 
test("Question Bank import rejects duplicate columns after case and whitespace normalization", () => {
  const base = {
    topic: "Civil",
    chapter: "Surveying",
    folder: "Practice",
    text: "Define BM",
    options: ["A", "B"],
    correctIndex: 0
  };

  assert.throws(
    () => normalizeQuestionBankImportRow({ ...base, " TEXT ": "Conflicting question" }, 4),
    /पंक्ति 4:.*column दोहराया गया है: text/
  );
  assert.throws(
    () => normalizeQuestionBankImportRow({ ...base, " Topic ": "Geography" }, 5),
    /पंक्ति 5:.*column दोहराया गया है: topic/
  );
  assert.throws(
    () => normalizeQuestionBankImportRow({ ...base, optionA: "A1", " OPTIONA ": "A2" }, 6),
    /पंक्ति 6:.*column दोहराया गया है: optiona/
  );
});


test("JSON import rejects duplicate object keys before JSON.parse can overwrite them", () => {
  const duplicateSources = [
    '[{"text":"first","text":"second"}]',
    '[{"text":"first","te\\u0078t":"second"}]',
    '[{"text":"first"," TEXT ":"second"}]',
    '{"items":[{"text":"Question","options":["A","B"],"correctIndex":0,"metadata":{"source":"one","source":"two"}}]}'
  ];
  for (const source of duplicateSources) {
    assert.throws(
      () => parseQuestionBankImportJson(source),
      /duplicate normalized object key/i
    );
  }
  assert.throws(
    () => parseQuestionImportJson('[{"text":"first","text":"second"}]'),
    /duplicate normalized object key/i
  );
});

test("JSON import permits the same property names in separate row objects", () => {
  const rows = [
    { topic: "Civil", chapter: "Surveying", folder: "Practice", text: "Question 1", options: ["A", "B"], correctIndex: 0 },
    { topic: "Civil", chapter: "Surveying", folder: "Practice", text: "Question 2", options: ["A", "B"], correctIndex: 1 }
  ];
  assert.deepEqual(parseQuestionBankImportJson(JSON.stringify(rows)), rows);
});

test("direct Test Builder import rejects non-canonical question IDs without trimming", () => {
  const row = {
    id: "q-1",
    text: "Define benchmark",
    options: ["Reduced Level", "Benchmark"],
    correctIndex: 1
  };
  assert.equal(normalizeTestBuilderImportRows([row])[0].id, "q-1");
  assert.equal(normalizeTestBuilderImportRows([{ ...row, id: 12 }])[0].id, "12");

  const invalidIds = [
    " q-1",
    "q-1 ",
    String.fromCharCode(9) + "q-1",
    "q-1" + String.fromCharCode(10),
    String.fromCharCode(13) + "q-1"
  ];
  for (const id of invalidIds) {
    assert.throws(
      () => normalizeTestBuilderImportRows([{ ...row, id }]),
      /प्रश्न ID/,
      "non-canonical imported question ID " + JSON.stringify(id)
    );
  }
});
