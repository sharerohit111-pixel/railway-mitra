"use strict";

// A view failure may update shared portal status only while both its view
// generation and the authenticated student session are still current.
export function shouldApplyStudentViewError({
  expectedRequestVersion,
  currentRequestVersion,
  isSessionActive
} = {}) {
  if (!Number.isSafeInteger(expectedRequestVersion) || expectedRequestVersion < 1 ||
      expectedRequestVersion !== currentRequestVersion || typeof isSessionActive !== "function") {
    return false;
  }
  try {
    return isSessionActive() === true;
  } catch (_) {
    return false;
  }
}
