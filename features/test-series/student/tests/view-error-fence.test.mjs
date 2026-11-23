import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldApplyStudentViewError } from "../view-error-fence.mjs";

const active = () => true;

test("current view errors are reportable only for the current authenticated session", () => {
  assert.equal(shouldApplyStudentViewError({ expectedRequestVersion: 4, currentRequestVersion: 4, isSessionActive: active }), true);
});

test("a late error from an older view request is ignored", () => {
  assert.equal(shouldApplyStudentViewError({ expectedRequestVersion: 4, currentRequestVersion: 5, isSessionActive: active }), false);
});

test("logout or account switch suppresses a late view error", () => {
  assert.equal(shouldApplyStudentViewError({ expectedRequestVersion: 4, currentRequestVersion: 4, isSessionActive: () => false }), false);
});

test("session-check exceptions fail closed", () => {
  assert.equal(shouldApplyStudentViewError({ expectedRequestVersion: 4, currentRequestVersion: 4, isSessionActive: () => { throw new Error("auth unavailable"); } }), false);
});

test("invalid generations and missing callbacks fail closed", () => {
  for (const expectedRequestVersion of [0, -1, 1.5, NaN, Infinity, "4", null]) {
    assert.equal(shouldApplyStudentViewError({ expectedRequestVersion, currentRequestVersion: expectedRequestVersion, isSessionActive: active }), false);
  }
  assert.equal(shouldApplyStudentViewError({ expectedRequestVersion: 4, currentRequestVersion: 4 }), false);
});

test("portal routes every asynchronous view failure through the session and generation fence", () => {
  const source = readFileSync(new URL("../portal.js", import.meta.url), "utf8");
  assert.match(source, /import \{ shouldApplyStudentViewError \} from "\.\/view-error-fence\.mjs"/);
  assert.match(source, /function showViewSafely\(name\)/);
  assert.match(source, /expectedRequestVersion,\s*currentRequestVersion: portalState\.viewRequestVersion/);
  assert.match(source, /isSessionActive: \(\) => isCurrentStudentSession\(sessionVersion, sessionUid\)/);
  assert.match(source, /showViewSafely\("leaderboard"\)/);
  assert.match(source, /showViewSafely\("dashboard"\)/);
  assert.match(source, /showViewSafely\("catalogue"\)/);
  assert.match(source, /showViewSafely\("exam"\)/);
  assert.match(source, /showViewSafely\(button\.dataset\.view\)/);
  assert.doesNotMatch(source, /showView\((?:button\.dataset\.view|"leaderboard"|"dashboard"|"catalogue"|"exam")\)\.catch/);
});
