"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getExamScoringConfig } = require("../exam-scoring");

test("exam scoring preserves the documented defaults", () => {
  assert.deepEqual(getExamScoringConfig({}), {
    marksPerQuestion: 1,
    negativeMarks: 0
  });
});

test("exam scoring accepts the configured numeric boundaries", () => {
  assert.deepEqual(getExamScoringConfig({
    marksPerQuestion: 100,
    negativeMarks: 100
  }), {
    marksPerQuestion: 100,
    negativeMarks: 100
  });
  assert.deepEqual(getExamScoringConfig({
    marksPerQuestion: "2",
    negativeMarks: "0.5"
  }), {
    marksPerQuestion: 2,
    negativeMarks: 0.5
  });
});

test("exam scoring rejects zero, negative, excessive, and non-finite marks", () => {
  for (const value of [0, -1, 100.01, Infinity, -Infinity, NaN, "not-a-number"]) {
    assert.throws(
      () => getExamScoringConfig({ marksPerQuestion: value }),
      error => error.code === "invalid_scoring_config"
    );
  }
  for (const value of [-0.01, 100.01, Infinity, -Infinity, NaN, "not-a-number"]) {
    assert.throws(
      () => getExamScoringConfig({ marksPerQuestion: 1, negativeMarks: value }),
      error => error.code === "invalid_scoring_config"
    );
  }
});

test("exam scoring rejects a missing or non-object persisted test record", () => {
  for (const value of [null, undefined, [], "test"]) {
    assert.throws(
      () => getExamScoringConfig(value),
      error => error.code === "invalid_scoring_config"
    );
  }
});
