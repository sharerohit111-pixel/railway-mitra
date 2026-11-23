"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeQuestionBankItem,
  normalizeQuestionBankListRequest
} = require("../question-bank-validation");

const validItem = (overrides = {}) => {
  const { question: questionOverrides = {}, ...fields } = overrides;
  return {
    topic: "Civil Engineering",
    chapter: "Surveying",
    folder: "Practice",
    ...fields,
    question: {
      text: "Define benchmark",
      options: ["Reduced Level", "Benchmark"],
      correctIndex: 0,
      explanation: "A fixed reference point",
      ...questionOverrides
    }
  };
};

test("server Question Bank validation rejects C1 controls in metadata and question content", () => {
  for (const code of [0x80, 0x85, 0x9f]) {
    const control = String.fromCharCode(code);
    for (const field of ["topic", "chapter", "folder"]) {
      assert.throws(
        () => normalizeQuestionBankItem(validItem({ [field]: "Civil" + control })),
        undefined,
        field + " C1 code " + code
      );
    }
    for (const field of ["text", "section", "explanation"]) {
      assert.throws(
        () => normalizeQuestionBankItem(validItem({
          question: { [field]: "Question" + control }
        })),
        undefined,
        field + " C1 code " + code
      );
    }
    assert.throws(
      () => normalizeQuestionBankItem(validItem({
        question: { options: ["A", "B" + control] }
      })),
      undefined,
      "option C1 code " + code
    );
  }
});

test("server Question Bank validation rejects raw controls before trim can hide them", () => {
  assert.throws(() => normalizeQuestionBankItem(validItem({ topic: "\tCivil" })));
  assert.throws(() => normalizeQuestionBankItem(validItem({
    question: { section: "Technical\t" }
  })));
  assert.throws(() => normalizeQuestionBankItem(validItem({
    question: { text: "\u000bQuestion" }
  })));
  assert.throws(() => normalizeQuestionBankItem(validItem({
    question: { options: ["A", "B\u000c"] }
  })));
});

test("question text, options and explanations retain ordinary TAB, LF and CR", () => {
  const result = normalizeQuestionBankItem(validItem({
    question: {
      text: "Question line 1\nQuestion line 2",
      options: ["Option\tA", "Option B"],
      explanation: "Reason line 1\r\nReason line 2"
    }
  }));
  assert.equal(result.question.text, "Question line 1\nQuestion line 2");
  assert.equal(result.question.options[0], "Option\tA");
  assert.equal(result.question.explanation, "Reason line 1\r\nReason line 2");
});

test("server list search and metadata filters reject C1 controls before trimming", () => {
  for (const code of [0x80, 0x85, 0x9f]) {
    const control = String.fromCharCode(code);
    assert.throws(() => normalizeQuestionBankListRequest({ search: "Civil" + control }));
    for (const field of ["topic", "chapter", "folder"]) {
      assert.throws(() => normalizeQuestionBankListRequest({ [field]: "Civil" + control }));
    }
  }
  assert.throws(() => normalizeQuestionBankListRequest({ search: "\tCivil" }));
  assert.throws(() => normalizeQuestionBankListRequest({ topic: "Civil\t" }));
});
