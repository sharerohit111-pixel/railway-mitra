"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getExamAnswerKey } = require("../exam-answer-key");

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
