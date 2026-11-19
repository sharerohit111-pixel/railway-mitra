"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { getExamDurationMinutes } = require("../exam-duration");

test("accepts only canonical integer exam durations from 1 through 240 minutes", () => {
  for (const durationMinutes of [1, 30, 120, 240]) {
    assert.equal(getExamDurationMinutes({ durationMinutes }), durationMinutes);
  }
});

test("rejects missing, coercible, fractional and out-of-range persisted durations", () => {
  for (const durationMinutes of [
    undefined, null, "", "30", " 30 ", true, false, [], {},
    0, -1, 0.5, 1.5, 240.1, 241, NaN, Infinity, -Infinity
  ]) {
    assert.throws(
      () => getExamDurationMinutes({ durationMinutes }),
      error => error.code === "invalid_exam_duration",
      "durationMinutes=" + String(durationMinutes)
    );
  }
  for (const testRecord of [null, undefined, [], "test"]) {
    assert.throws(
      () => getExamDurationMinutes(testRecord),
      error => error.code === "invalid_exam_duration"
    );
  }
});

test("rmStartExam validates duration before access/session writes and uses it without coercion", () => {
  const source = readFileSync(require.resolve("../index"), "utf8");
  const start = source.indexOf("exports.rmStartExam =");
  const end = source.indexOf("exports.rmGetExamQuestions =", start);
  assert.ok(start >= 0 && end > start, "rmStartExam handler must exist");
  const handler = source.slice(start, end);
  const durationGuard = handler.indexOf("getExamDurationMinutes(test)");
  const accessBranch = handler.indexOf("let freeClaimSnap");
  const attemptExpiry = handler.indexOf("durationMinutes * 60000");

  assert.ok(durationGuard >= 0 && durationGuard < accessBranch,
    "invalid duration must be rejected before payment/free-access and attempt-session work");
  assert.ok(attemptExpiry > durationGuard,
    "the validated duration must drive the server-side attempt expiry");
  assert.doesNotMatch(handler, /Number\(test\.durationMinutes\s*\|\|\s*30\)/,
    "exam start must not coerce or silently default malformed persisted duration");
});
