"use strict";

function assertFreeTestSelectionAllowed({
  currentConfig = null,
  legacyClaimExists = false,
  requestedTestId
} = {}) {
  if (typeof requestedTestId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(requestedTestId)) {
    throw new Error("A valid free test ID is required");
  }

  if (currentConfig && currentConfig.hasClaims !== undefined &&
      typeof currentConfig.hasClaims !== "boolean") {
    throw new Error("Free-test claim state is inconsistent; reconcile before changing the selection");
  }

  const currentTestId = currentConfig && typeof currentConfig.testId === "string"
    ? currentConfig.testId
    : null;

  // Re-selecting the same test is an idempotent operation, even after claims exist.
  if (currentTestId === requestedTestId) return { changed: false };

  if ((currentConfig && currentConfig.hasClaims === true) || legacyClaimExists === true) {
    throw new Error("The free test cannot be changed after a student has claimed the free attempt");
  }

  return { changed: true };
}

module.exports = { assertFreeTestSelectionAllowed };
