"use strict";

function invalidExamDuration() {
  const error = new Error("Exam duration configuration is invalid");
  error.code = "invalid_exam_duration";
  return error;
}

/**
 * Published CBT papers must carry the same canonical integer duration that
 * the Owner publish validator requires. Never coerce or silently default a
 * malformed persisted value at the exam-start boundary.
 */
function getExamDurationMinutes(test) {
  if (!test || typeof test !== "object" || Array.isArray(test) ||
      !Number.isInteger(test.durationMinutes) ||
      test.durationMinutes < 1 || test.durationMinutes > 240) {
    throw invalidExamDuration();
  }
  return test.durationMinutes;
}

module.exports = { getExamDurationMinutes };
