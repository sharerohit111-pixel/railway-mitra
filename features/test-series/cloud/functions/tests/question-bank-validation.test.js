const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeQuestionBankItem } = require("../question-bank-validation");

const validItem = (overrides = {}) => {
  const { question: questionOverrides = {}, ...fields } = overrides;
  return {
    topic: "Civil Engineering",
    chapter: "Soil Mechanics",
    folder: "GDCE / Practice",
    ...fields,
    question: {
      text: "Bearing capacity?",
      options: ["Safe", "Unsafe"],
      correctIndex: 0,
      explanation: "A short explanation",
      ...questionOverrides
    }
  };
};

test("normalizes a question-bank record and preserves a Hindi section name", () => {
  const result = normalizeQuestionBankItem(validItem({
    question: { section: "  सामान्य ज्ञान  " }
  }));
  assert.equal(result.topic, "Civil Engineering");
  assert.equal(result.folder, "GDCE / Practice");
  assert.equal(result.question.section, "सामान्य ज्ञान");
  assert.equal(result.question.options[0], "Safe");
  assert.equal(result.correctIndex, 0);
});

test("accepts an omitted or blank optional section without storing an empty label", () => {
  for (const section of [undefined, "", "   ", null]) {
    const input = validItem({ question: { section } });
    const result = normalizeQuestionBankItem(input);
    assert.equal(Object.hasOwn(result.question, "section"), false);
  }
});

test("rejects non-text labels and non-text question options instead of coercing objects", () => {
  assert.throws(() => normalizeQuestionBankItem(validItem({ topic: { value: "Civil" } })), /Topic must be text/);
  assert.throws(() => normalizeQuestionBankItem(validItem({
    question: { options: ["Safe", { label: "Unsafe" }] }
  })), /text options/);
});

test("rejects invalid section types, oversized labels and control characters", () => {
  assert.throws(() => normalizeQuestionBankItem(validItem({
    question: { section: 42 }
  })), /section must be text/);
  assert.throws(() => normalizeQuestionBankItem(validItem({
    question: { section: "x".repeat(81) }
  })), /80 characters/);
  assert.throws(() => normalizeQuestionBankItem(validItem({
    question: { section: "Technical\nAbility" }
  })), /control characters/);
});

test("retains the existing question, option and correct-answer boundaries", () => {
  assert.throws(() => normalizeQuestionBankItem(validItem({
    question: { text: " " }
  })), /question text/);
  assert.throws(() => normalizeQuestionBankItem(validItem({
    question: { options: ["Only one"] }
  })), /2–6 text options/);
  assert.throws(() => normalizeQuestionBankItem(validItem({
    question: { correctIndex: 2 }
  })), /valid correctIndex/);
});

test("includes the source row in bulk-import validation errors", () => {
  assert.throws(
    () => normalizeQuestionBankItem(validItem({ question: { section: "x".repeat(81) } }), 7),
    /row 7/
  );
});


test("validates question-bank list filters without coercing malformed values", () => {
  const { normalizeQuestionBankListRequest } = require("../question-bank-validation");
  assert.deepEqual(normalizeQuestionBankListRequest({
    pageSize: 25, search: "  Bearing  ", topic: " Civil ", chapter: " Soil ", folder: " Practice "
  }), {
    pageSize: 25,
    searchText: "bearing",
    filters: { topic: "Civil", chapter: "Soil", folder: "Practice" }
  });
});

test("rejects malformed page sizes, non-text filters and oversized search terms", () => {
  const { normalizeQuestionBankListRequest } = require("../question-bank-validation");
  for (const input of [
    { pageSize: 0 }, { pageSize: 101 }, { pageSize: "25" },
    { topic: { value: "Civil" } }, { chapter: 12 }, { folder: ["Practice"] },
    { search: { query: "bearing" } }, { search: "x".repeat(121) },
    { search: "bad\\nquery" }, { topic: "bad\\nfilter" }
  ]) {
    assert.throws(() => normalizeQuestionBankListRequest(input));
  }
});

test("accepts omitted and blank optional question-bank list filters", () => {
  const { normalizeQuestionBankListRequest } = require("../question-bank-validation");
  assert.deepEqual(normalizeQuestionBankListRequest({ search: "  ", topic: "  " }), {
    pageSize: 50, searchText: "", filters: {}
  });
});
