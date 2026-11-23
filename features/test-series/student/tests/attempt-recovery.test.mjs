import test from "node:test";
import assert from "node:assert/strict";
import { classifyCbtAttemptResultError } from "../attempt-recovery.mjs";

test("recognizes only the server's explicit in-progress result response", () => {
  assert.equal(classifyCbtAttemptResultError({
    code: "functions/failed-precondition",
    message: "Exam result is not available yet"
  }), "in_progress");
});

test("recognizes an attempt that is missing or not owned by the authenticated student", () => {
  assert.equal(classifyCbtAttemptResultError({
    code: "functions/permission-denied",
    message: "Attempt not found"
  }), "missing");
});

test("does not reinterpret transport, authentication or unrelated server failures as recovery states", () => {
  for (const error of [
    { code: "functions/unavailable", message: "network unavailable" },
    { code: "functions/unauthenticated", message: "Sign in required" },
    { code: "functions/permission-denied", message: "Student access required" },
    { code: "functions/failed-precondition", message: "Exam is closed" },
    new Error("unknown failure"),
    null
  ]) {
    assert.equal(classifyCbtAttemptResultError(error), "fatal");
  }
});
