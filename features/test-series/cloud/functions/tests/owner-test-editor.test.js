const test = require("node:test");
const assert = require("node:assert/strict");
const { restoreOwnerQuestionAnswerKeys } = require("../owner-test-editor");

const questions = [
  { id: "q1", text: "Question 1", options: ["A", "B"] },
  { id: "q2", text: "Question 2", options: ["A", "B", "C"] }
];

test("restores answer indexes from the private answer-key map", () => {
  const result = restoreOwnerQuestionAnswerKeys(questions, {
    q1: { correctAnswer: "0" },
    q2: { correctAnswer: "2" }
  });
  assert.deepEqual(result.map(question => question.correctIndex), [0, 2]);
  assert.equal(Object.hasOwn(questions[0], "correctIndex"), false);
});

test("allows an empty question set without an answer-key document", () => {
  assert.deepEqual(restoreOwnerQuestionAnswerKeys([], null), []);
});

test("rejects a missing answer key for a non-empty test", () => {
  assert.throws(() => restoreOwnerQuestionAnswerKeys(questions, null), /answer key is unavailable/);
});

test("rejects missing, malformed, negative and out-of-range answer indexes", () => {
  for (const answerMap of [
    { q1: { correctAnswer: "0" } },
    { q1: { correctAnswer: "x" }, q2: { correctAnswer: "1" } },
    { q1: { correctAnswer: "00" }, q2: { correctAnswer: "1" } },
    { q1: { correctAnswer: "-1" }, q2: { correctAnswer: "1" } },
    { q1: { correctAnswer: "2" }, q2: { correctAnswer: "1" } },
    { q1: { correctAnswer: "0" }, q2: { correctAnswer: "3" } }
  ]) {
    assert.throws(() => restoreOwnerQuestionAnswerKeys(questions, answerMap), /answer key is missing or inconsistent/);
  }
});

test("rejects malformed question collections and records", () => {
  assert.throws(() => restoreOwnerQuestionAnswerKeys({}, {}), /question set is invalid/);
  assert.throws(() => restoreOwnerQuestionAnswerKeys([null], {}), /Question record is invalid/);
});
