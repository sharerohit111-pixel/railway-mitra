import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createStudentOtpFlowGuard } from "../otp-flow-guard.mjs";

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test("a newly started OTP request is current", () => {
  const guard = createStudentOtpFlowGuard();
  const token = guard.begin();
  assert.equal(guard.isCurrent(token), true);
});

test("logout or an auth transition invalidates a pending OTP completion", () => {
  const guard = createStudentOtpFlowGuard();
  const pendingRequest = guard.begin();
  guard.invalidate();
  assert.equal(guard.isCurrent(pendingRequest), false);
});

test("a newer OTP request supersedes an older asynchronous completion", () => {
  const guard = createStudentOtpFlowGuard();
  const first = guard.begin();
  const second = guard.begin();
  assert.equal(guard.isCurrent(first), false);
  assert.equal(guard.isCurrent(second), true);
});

test("invalid generation tokens are never considered current", () => {
  const guard = createStudentOtpFlowGuard();
  guard.begin();
  for (const token of [null, undefined, "1", {}, 0, -1, Number.NaN, 1.5]) {
    assert.equal(guard.isCurrent(token), false);
  }
});

test("a late OTP send completion cannot store confirmation or re-enable its button", async () => {
  const guard = createStudentOtpFlowGuard();
  const pending = deferred();
  const requestVersion = guard.begin();
  let confirmation = null;
  let sendEnabled = false;

  const task = (async () => {
    try {
      const result = await pending.promise;
      if (!guard.isCurrent(requestVersion)) return;
      confirmation = result;
    } finally {
      if (guard.isCurrent(requestVersion)) sendEnabled = true;
    }
  })();

  guard.invalidate();
  pending.resolve({ id: "stale-confirmation" });
  await task;

  assert.equal(confirmation, null);
  assert.equal(sendEnabled, false);
});

test("a late OTP verification completion cannot update status or re-enable its button", async () => {
  const guard = createStudentOtpFlowGuard();
  const pending = deferred();
  const requestVersion = guard.begin();
  let status = "";
  let verifyEnabled = false;

  const task = (async () => {
    try {
      await pending.promise;
      if (!guard.isCurrent(requestVersion)) return;
      status = "Phone verified.";
    } finally {
      if (guard.isCurrent(requestVersion)) verifyEnabled = true;
    }
  })();

  guard.invalidate();
  pending.resolve();
  await task;

  assert.equal(status, "");
  assert.equal(verifyEnabled, false);
});

test("sendOtp ignores a late Firebase confirmation and guards its finally block", () => {
  const portal = readFileSync(new URL("../portal.js", import.meta.url), "utf8");
  const start = portal.indexOf("async function sendOtp()");
  const awaitSend = portal.indexOf("await signInWithPhoneNumber", start);
  const staleCheck = portal.indexOf("if (!otpFlow.isCurrent(requestVersion)) return;", awaitSend);
  const assignConfirmation = portal.indexOf("confirmation = nextConfirmation", start);
  const finallyStart = portal.indexOf("} finally {", start);
  const finallyEnd = portal.indexOf("async function verifyOtp()", finallyStart);
  const finallyBody = portal.slice(finallyStart, finallyEnd);

  assert.ok(start >= 0 && awaitSend > start);
  assert.ok(staleCheck > awaitSend && staleCheck < assignConfirmation);
  assert.ok(finallyEnd > finallyStart, "sendOtp finally block has a bounded source range");
  assert.match(finallyBody, /if \(otpFlow\.isCurrent\(requestVersion\)\)/);
});

test("verifyOtp ignores stale confirmation results after an auth transition", () => {
  const portal = readFileSync(new URL("../portal.js", import.meta.url), "utf8");
  const start = portal.indexOf("async function verifyOtp()");
  const awaitConfirm = portal.indexOf("await activeConfirmation.confirm(code)", start);
  const staleCheck = portal.indexOf("if (!otpFlow.isCurrent(requestVersion)) return;", awaitConfirm);
  const finallyStart = portal.indexOf("} finally {", start);
  const finallyEnd = portal.indexOf('el("rm-student-send-otp")', finallyStart);
  const finallyBody = portal.slice(finallyStart, finallyEnd);

  assert.ok(start >= 0 && awaitConfirm > start);
  assert.ok(staleCheck > awaitConfirm);
  assert.ok(finallyEnd > finallyStart, "verifyOtp finally block has a bounded source range");
  assert.match(finallyBody, /if \(otpFlow\.isCurrent\(requestVersion\)\)/);
});

test("logout and auth-state changes invalidate OTP work before asynchronous operations", () => {
  const portal = readFileSync(new URL("../portal.js", import.meta.url), "utf8");
  const logoutStart = portal.indexOf('logoutButton.addEventListener("click", async () => {');
  const logoutInvalidation = portal.indexOf("otpFlow.invalidate()", logoutStart);
  const signOutCall = portal.indexOf("await signOut(auth)", logoutStart);
  const authStart = portal.indexOf("onAuthStateChanged(auth, async user => {");
  const authInvalidation = portal.indexOf("otpFlow.invalidate()", authStart);
  const tokenLookup = portal.indexOf("await user.getIdTokenResult()", authStart);

  assert.ok(logoutInvalidation > logoutStart && logoutInvalidation < signOutCall);
  assert.ok(authInvalidation > authStart && authInvalidation < tokenLookup);
});
