"use strict";

function invalidScoringConfig() {
  const error = new Error("Exam scoring configuration is invalid");
  error.code = "invalid_scoring_config";
  return error;
}

/**
 * Validate persisted scoring values again at the server submission boundary.
 * The Owner form is not a security boundary: old or manually-corrupted
 * Firestore documents must never produce NaN, infinite, or negative scores.
 */
function getExamScoringConfig(test) {
  if (!test || typeof test !== "object" || Array.isArray(test)) {
    throw invalidScoringConfig();
  }

  const marksPerQuestion = Number(test.marksPerQuestion ?? 1);
  const negativeMarks = Number(test.negativeMarks ?? 0);

  if (!Number.isFinite(marksPerQuestion) || marksPerQuestion <= 0 || marksPerQuestion > 100) {
    throw invalidScoringConfig();
  }
  if (!Number.isFinite(negativeMarks) || negativeMarks < 0 || negativeMarks > 100) {
    throw invalidScoringConfig();
  }

  return Object.freeze({ marksPerQuestion, negativeMarks });
}

module.exports = { getExamScoringConfig };
