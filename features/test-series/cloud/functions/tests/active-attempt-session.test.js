"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isActiveAttemptSession } = require("../active-attempt-session");

const now = new Date("2026-11-16T12:00:00.000Z");
const expiresAt = new Date(now.getTime() + 60_000);

function validSession() {
  return {
    uid: "student-a",
    attemptId: "attempt-a",
    attempt: {
      uid: "student-a",
      testId: "test-a",
      status: "in_progress",
      expiresAt
    },
    activeSession: {
      uid: "student-a",
      testId: "test-a",
      attemptId: "attempt-a",
      status: "in_progress",
      expiresAt
    },
    now
  };
}

test("accepts only the exact unexpired active attempt and matching deadline", () => {
  assert.equal(isActiveAttemptSession(validSession()), true);
});

test("rejects a stale attempt after the active pointer switches to another attempt", () => {
  const input = validSession();
  input.activeSession.attemptId = "attempt-b";
  assert.equal(isActiveAttemptSession(input), false);
});

test("rejects missing sessions and mismatched student, test, or status", () => {
  const input = validSession();
  assert.equal(isActiveAttemptSession({ ...input, activeSession: null }), false);
  assert.equal(isActiveAttemptSession({ ...input, activeSession: { ...input.activeSession, uid: "student-b" } }), false);
  assert.equal(isActiveAttemptSession({ ...input, activeSession: { ...input.activeSession, testId: "test-b" } }), false);
  assert.equal(isActiveAttemptSession({ ...input, activeSession: { ...input.activeSession, status: "completed" } }), false);
  assert.equal(isActiveAttemptSession({ ...input, attempt: { ...input.attempt, uid: "student-b" } }), false);
});

test("rejects missing, malformed, expired, or non-matching deadlines", () => {
  const input = validSession();
  assert.equal(isActiveAttemptSession({ ...input, attempt: { ...input.attempt, expiresAt: null } }), false);
  assert.equal(isActiveAttemptSession({ ...input, activeSession: { ...input.activeSession, expiresAt: "not-a-date" } }), false);
  assert.equal(isActiveAttemptSession({ ...input, now: new Date(expiresAt.getTime() + 1) }), false);
  assert.equal(isActiveAttemptSession({ ...input, activeSession: { ...input.activeSession, expiresAt: new Date(expiresAt.getTime() + 1) } }), false);
});
