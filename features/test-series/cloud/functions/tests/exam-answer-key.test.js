"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getExamAnswerKey, addExamAnswerKeyEntry, answerKeyStorageKey } = require("../exam-answer-key");

const paper = [
  { id: "q1", options: ["A", "B"] },
  { id: "q2", options: ["A", "B", "C"] }
];

test("answer-key integrity returns one canonical key per paper question", () => {
  assert.deepEqual(getExamAnswerKey(paper, {
    q1: { correctAnswer: "0" },
    q2: { correctAnswer: "2" }
  }), [
    { questionId: "q1", correctAnswer: "0" },
    { questionId: "q2", correctAnswer: "2" }
  ]);
});

test("answer-key integrity rejects missing and extra question keys", () => {
  assert.throws(() => getExamAnswerKey(paper, {
    q1: { correctAnswer: "0" }
  }), error => error.code === "invalid_exam_answer_key");
  assert.throws(() => getExamAnswerKey(paper, {
    q1: { correctAnswer: "0" },
    q2: { correctAnswer: "1" },
    q3: { correctAnswer: "0" }
  }), error => error.code === "invalid_exam_answer_key");
});

test("answer-key integrity rejects invalid and duplicate paper question IDs", () => {
  assert.throws(() => getExamAnswerKey([
    { id: "q1", options: ["A", "B"] },
    { id: "q1", options: ["A", "B"] }
  ], { q1: { correctAnswer: "0" } }), error => error.code === "invalid_exam_answer_key");
  assert.throws(() => getExamAnswerKey([
    { id: "bad/id", options: ["A", "B"] }
  ], { "bad/id": { correctAnswer: "0" } }), error => error.code === "invalid_exam_answer_key");
});

test("answer-key integrity rejects malformed option lists and answer indices", () => {
  for (const options of [[], ["A"], ["A", "B", "C", "D", "E", "F", "G"], ["A", " "]]) {
    assert.throws(() => getExamAnswerKey([{ id: "q1", options }], {
      q1: { correctAnswer: "0" }
    }), error => error.code === "invalid_exam_answer_key");
  }
  for (const correctAnswer of ["2", "-1", "1.0", "01", 1, "NaN", ""]) {
    assert.throws(() => getExamAnswerKey([{ id: "q1", options: ["A", "B"] }], {
      q1: { correctAnswer }
    }), error => error.code === "invalid_exam_answer_key");
  }
});

test("answer-key integrity rejects missing, array, or oversized paper data", () => {
  for (const questions of [null, [], Array.from({ length: 501 }, (_, index) => ({ id: `q${index}`, options: ["A", "B"] }))]) {
    assert.throws(() => getExamAnswerKey(questions, {}), error => error.code === "invalid_exam_answer_key");
  }
  for (const answerQuestions of [null, [], "invalid"]) {
    assert.throws(() => getExamAnswerKey(paper, answerQuestions), error => error.code === "invalid_exam_answer_key");
  }
});


test("private answer-key maps preserve prototype-sensitive and prefix-like IDs without collisions", () => {
  const answerMap = {};
  const prefixLikeId = "__rm_answer_qid__X19wcm90b19f";
  addExamAnswerKeyEntry(answerMap, "__proto__", 1);
  addExamAnswerKeyEntry(answerMap, "constructor", 0);
  addExamAnswerKeyEntry(answerMap, prefixLikeId, 1);

  assert.equal(Object.getPrototypeOf(answerMap), Object.prototype);
  assert.equal(answerKeyStorageKey(prefixLikeId).startsWith("__rm_answer_qid__"), true);
  assert.notEqual(answerKeyStorageKey(prefixLikeId), answerKeyStorageKey("__proto__"));
  assert.deepEqual(Object.keys(answerMap), [
    answerKeyStorageKey("__proto__"),
    answerKeyStorageKey("constructor"),
    answerKeyStorageKey(prefixLikeId)
  ]);
  assert.deepEqual(getExamAnswerKey([
    { id: "__proto__", options: ["A", "B"] },
    { id: "constructor", options: ["A", "B"] },
    { id: prefixLikeId, options: ["A", "B"] }
  ], answerMap), [
    { questionId: "__proto__", correctAnswer: "1" },
    { questionId: "constructor", correctAnswer: "0" },
    { questionId: prefixLikeId, correctAnswer: "1" }
  ]);
});

test("answer-key validation never accepts inherited answer entries", () => {
  const inherited = Object.create({ q1: { correctAnswer: "0" } });
  assert.throws(
    () => getExamAnswerKey([{ id: "q1", options: ["A", "B"] }], inherited),
    error => error.code === "invalid_exam_answer_key"
  );
});

test("answer-key entry builder rejects malformed IDs, duplicate keys and invalid indexes", () => {
  const answerMap = {};
  for (const [questionId, correctIndex] of [
    ["bad/id", 0], ["q1", -1], ["q2", 1.5], ["q3", Number.MAX_SAFE_INTEGER + 1]
  ]) {
    assert.throws(() => addExamAnswerKeyEntry(answerMap, questionId, correctIndex),
      error => error.code === "invalid_exam_answer_key");
  }
  addExamAnswerKeyEntry(answerMap, "q1", 0);
  assert.throws(() => addExamAnswerKeyEntry(answerMap, "q1", 1),
    error => error.code === "invalid_exam_answer_key");
});
