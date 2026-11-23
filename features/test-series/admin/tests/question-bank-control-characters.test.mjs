import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeQuestionBankImportRow,
  normalizeTestBuilderImportRows,
  questionBankItemAsTestQuestion
} from "../question-bank-transfer.mjs";

const bankRow = {
  topic: "Civil",
  chapter: "Surveying",
  folder: "Practice",
  text: "Define benchmark",
  options: ["Reduced Level", "Benchmark"],
  correctIndex: 1,
  section: "Technical",
  explanation: "A fixed reference point"
};

const builderRow = {
  text: "Define benchmark",
  options: ["Reduced Level", "Benchmark"],
  correctIndex: 1,
  section: "Technical",
  explanation: "A fixed reference point"
};

const bankItem = {
  itemId: "qb_1",
  question: {
    text: "Define benchmark",
    options: ["Reduced Level", "Benchmark"],
    section: "Technical",
    explanation: "A fixed reference point"
  },
  correctIndex: 1
};

test("Question Bank import rejects C1 controls in labels, question fields and fallback defaults", () => {
  for (const code of [0x80, 0x85, 0x9f]) {
    const control = String.fromCharCode(code);
    for (const field of ["topic", "chapter", "folder", "section"]) {
      assert.throws(
        () => normalizeQuestionBankImportRow({ ...bankRow, [field]: "Civil" + control }, 3),
        /पंक्ति 3:/,
        field + " C1 code " + code
      );
    }
    for (const field of ["text", "explanation"]) {
      assert.throws(
        () => normalizeQuestionBankImportRow({ ...bankRow, [field]: "Question" + control }, 4),
        /पंक्ति 4:/,
        field + " C1 code " + code
      );
    }
    assert.throws(
      () => normalizeQuestionBankImportRow({ ...bankRow, options: ["A", "B" + control] }, 5),
      /पंक्ति 5:/,
      "option C1 code " + code
    );
    assert.throws(
      () => normalizeQuestionBankImportRow({ ...bankRow, topic: "" }, 6, { topic: "Civil" + control }),
      /पंक्ति 6:/,
      "fallback topic C1 code " + code
    );
  }
});

test("Test Builder import rejects C1 controls before normalizing text and section fields", () => {
  for (const code of [0x80, 0x85, 0x9f]) {
    const control = String.fromCharCode(code);
    for (const field of ["text", "explanation", "section"]) {
      assert.throws(
        () => normalizeTestBuilderImportRows([{ ...builderRow, [field]: "Question" + control }]),
        /पंक्ति 1:/,
        field + " C1 code " + code
      );
    }
    assert.throws(
      () => normalizeTestBuilderImportRows([{ ...builderRow, options: ["A", "B" + control] }]),
      /पंक्ति 1:/,
      "option C1 code " + code
    );
  }
});

test("Question Bank to Test Builder mapping rejects C1 controls in stored and active content", () => {
  for (const code of [0x80, 0x85, 0x9f]) {
    const control = String.fromCharCode(code);
    for (const field of ["text", "explanation", "section"]) {
      assert.throws(
        () => questionBankItemAsTestQuestion({
          ...bankItem,
          question: { ...bankItem.question, [field]: "Question" + control }
        }),
        RangeError,
        field + " C1 code " + code
      );
    }
    assert.throws(
      () => questionBankItemAsTestQuestion({
        ...bankItem,
        question: { ...bankItem.question, options: ["A", "B" + control] }
      }),
      RangeError,
      "option C1 code " + code
    );
    assert.throws(
      () => questionBankItemAsTestQuestion(bankItem, "Technical" + control),
      RangeError,
      "active section C1 code " + code
    );
  }
});

test("Question Bank content still preserves permitted TAB, LF and CR formatting", () => {
  const normalized = normalizeQuestionBankImportRow({
    ...bankRow,
    text: "Question line 1\nQuestion line 2",
    options: ["Option\tA", "Option B"],
    explanation: "Reason line 1\r\nReason line 2"
  }, 1);
  assert.equal(normalized.question.text, "Question line 1\nQuestion line 2");
  assert.equal(normalized.question.options[0], "Option\tA");
  assert.equal(normalized.question.explanation, "Reason line 1\r\nReason line 2");

  const builder = normalizeTestBuilderImportRows([{
    ...builderRow,
    text: "Question line 1\nQuestion line 2",
    options: ["Option\tA", "Option B"],
    explanation: "Reason line 1\r\nReason line 2"
  }])[0];
  assert.equal(builder.text, "Question line 1\nQuestion line 2");
  assert.equal(builder.options[0], "Option\tA");
  assert.equal(builder.explanation, "Reason line 1\r\nReason line 2");
});
