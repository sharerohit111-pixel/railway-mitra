"use strict";

const { toValidDate } = require("./exam-time");

/**
 * Require an in-progress attempt to be the authenticated student's one
 * server-owned active session. Expiry must match exactly so a stale pointer
 * cannot extend or revive an attempt.
 */
function isActiveAttemptSession({ uid, attemptId, attempt, activeSession, now = new Date() } = {}) {
  if (typeof uid !== "string" || !uid ||
      typeof attemptId !== "string" || !attemptId ||
      !attempt || typeof attempt !== "object" ||
      !activeSession || typeof activeSession !== "object" ||
      !(now instanceof Date) || !Number.isFinite(now.getTime())) {
    return false;
  }

  const attemptExpiresAt = toValidDate(attempt.expiresAt);
  const activeExpiresAt = toValidDate(activeSession.expiresAt);
  return Boolean(
    attempt.uid === uid &&
    typeof attempt.testId === "string" && attempt.testId.length > 0 &&
    attempt.status === "in_progress" &&
    attemptExpiresAt && attemptExpiresAt > now &&
    activeSession.uid === uid &&
    activeSession.attemptId === attemptId &&
    activeSession.testId === attempt.testId &&
    activeSession.status === "in_progress" &&
    activeExpiresAt && activeExpiresAt > now &&
    activeExpiresAt.getTime() === attemptExpiresAt.getTime()
  );
}

module.exports = { isActiveAttemptSession };
