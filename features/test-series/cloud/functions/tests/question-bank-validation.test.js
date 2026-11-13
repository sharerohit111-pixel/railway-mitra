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
