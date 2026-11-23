import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCbtStorageKey } from "../attempt-storage-key.mjs";

const base = { appId: "railway-mitra", studentUid: "student-1", testId: "gdce-je" };

test("creates stable attempt, pending-answer and position keys", () => {
  assert.equal(
    buildCbtStorageKey({ ...base, purpose: "attempt" }),
    "rm-cbt-attempt:railway-mitra:student-1:gdce-je"
  );
  assert.equal(
    buildCbtStorageKey({ ...base, purpose: "pending", attemptId: "attempt-7" }),
    "rm-cbt-pending:railway-mitra:student-1:gdce-je:attempt-7"
  );
  assert.equal(
    buildCbtStorageKey({ ...base, purpose: "position", attemptId: "attempt-7" }),
    "rm-cbt-position:railway-mitra:student-1:gdce-je:attempt-7"
  );
});

test("isolates every local key between students sharing one browser profile", () => {
  for (const purpose of ["attempt", "pending", "position"]) {
    const attempt = purpose === "attempt" ? {} : { attemptId: "attempt-7" };
    const first = buildCbtStorageKey({ ...base, ...attempt, purpose });
    const second = buildCbtStorageKey({ ...base, studentUid: "student-2", ...attempt, purpose });
    assert.notEqual(first, second);
  }
});

test("isolates local keys across Firebase apps and tests", () => {
  const key = buildCbtStorageKey({ ...base, purpose: "attempt" });
  assert.notEqual(key, buildCbtStorageKey({ ...base, appId: "another-app", purpose: "attempt" }));
  assert.notEqual(key, buildCbtStorageKey({ ...base, testId: "another-test", purpose: "attempt" }));
});

test("encodes delimiters so identity components cannot collide", () => {
  const first = buildCbtStorageKey({ ...base, testId: "alpha:beta", purpose: "attempt" });
  const second = buildCbtStorageKey({ ...base, studentUid: "student-1:alpha", testId: "beta", purpose: "attempt" });
  assert.notEqual(first, second);
  assert.match(first, /alpha%3Abeta$/);
});

test("rejects missing identity, attempt ID and unsupported purpose", () => {
  assert.throws(() => buildCbtStorageKey({ ...base, studentUid: "", purpose: "attempt" }), /studentUid/);
  assert.throws(() => buildCbtStorageKey({ ...base, studentUid: null, purpose: "attempt" }), /studentUid/);
  assert.throws(() => buildCbtStorageKey({ ...base, testId: "", purpose: "attempt" }), /testId/);
  assert.throws(() => buildCbtStorageKey({ ...base, purpose: "pending" }), /attemptId/);
  assert.throws(() => buildCbtStorageKey({ ...base, attemptId: "", purpose: "position" }), /attemptId/);
  assert.throws(() => buildCbtStorageKey({ ...base, purpose: "unknown" }), /purpose/);
});

test("portal passes the authenticated session UID and exam requires it", () => {
  const exam = readFileSync(new URL("../exam.js", import.meta.url), "utf8");
  const portal = readFileSync(new URL("../portal.js", import.meta.url), "utf8");
  assert.match(exam, /buildCbtStorageKey/);
  assert.match(exam, /studentUid/);
  assert.match(exam, /purpose: "pending"/);
  assert.match(exam, /purpose: "position"/);
  assert.match(portal, /studentUid:\s*sessionUid/);
});
