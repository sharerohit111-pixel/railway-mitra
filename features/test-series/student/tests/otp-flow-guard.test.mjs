import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createStudentOtpFlowGuard } from "../otp-flow-guard.mjs";
import { setStudentOtpControlsLocked, shouldUnlockStudentOtpControls } from "../otp-control-state.mjs";

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test("a newly started OTP request is current and owns the send lock", () => {
  const guard = createStudentOtpFlowGuard();
  const token = guard.begin();
  assert.equal(guard.isCurrent(token), true);
  assert.equal(guard.isSending(), true);
  assert.equal(guard.finishSend(token), true);
  assert.equal(guard.isSending(), false);
});


test("idle and invalid generation tokens cannot finish an OTP operation", () => {
  const guard = createStudentOtpFlowGuard();
  assert.equal(guard.isCurrent(0), false, "generation zero is not an active OTP request");
  assert.equal(guard.finishSend(null), false);
  assert.equal(guard.finishVerification(null), false);
  assert.equal(guard.finishSend(0), false);
  assert.equal(guard.finishVerification(0), false);

  const token = guard.begin();
  assert.equal(token, 1);
  assert.equal(guard.isCurrent(token), true);
  assert.equal(guard.finishSend(token), true);
  assert.equal(guard.beginVerification(token), true);
  assert.equal(guard.finishVerification(token), true);
});

test("a stale send completion cannot release a newer generation's send lock", () => {
  const guard = createStudentOtpFlowGuard();
  const staleToken = guard.begin();
  guard.invalidate();

  const currentToken = guard.begin();
  assert.notEqual(currentToken, staleToken);
  assert.equal(guard.finishSend(staleToken), false);
  assert.equal(guard.isSending(), true);
  assert.equal(guard.isCurrent(currentToken), true);
  assert.equal(guard.finishSend(currentToken), true);
});

test("logout or an auth transition invalidates a pending OTP send", () => {
  const guard = createStudentOtpFlowGuard();
  const pendingRequest = guard.begin();
  guard.invalidate();
  assert.equal(guard.isCurrent(pendingRequest), false);
  assert.equal(guard.isSending(), false);
  assert.equal(guard.finishSend(pendingRequest), false);
});

test("a second SMS request cannot supersede an in-flight send and retry is allowed after settlement", () => {
  const guard = createStudentOtpFlowGuard();
  const first = guard.begin();
  assert.equal(guard.begin(), null);
  assert.equal(guard.isCurrent(first), true);
  assert.equal(guard.isSending(), true);

  assert.equal(guard.finishSend(first), true);
  const second = guard.begin();
  assert.notEqual(second, null);
  assert.equal(guard.isCurrent(first), false);
  assert.equal(guard.isCurrent(second), true);
  assert.equal(guard.finishSend(second), true);
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
      guard.finishSend(requestVersion);
      if (guard.isCurrent(requestVersion)) sendEnabled = true;
    }
  })();

  guard.invalidate();
  pending.resolve({ id: "stale-confirmation" });
  await task;

  assert.equal(confirmation, null);
  assert.equal(sendEnabled, false);
  assert.equal(guard.isSending(), false);
});

test("a late OTP verification completion cannot update status or re-enable its button", async () => {
  const guard = createStudentOtpFlowGuard();
  const pending = deferred();
  const requestVersion = guard.begin();
  assert.equal(guard.finishSend(requestVersion), true);
  assert.equal(guard.beginVerification(requestVersion), true);
  let status = "";
  let verifyEnabled = false;

  const task = (async () => {
    try {
      await pending.promise;
      if (!guard.isCurrent(requestVersion)) return;
      status = "Phone verified.";
    } finally {
      if (guard.finishVerification(requestVersion) && guard.isCurrent(requestVersion)) {
        verifyEnabled = true;
      }
    }
  })();

  guard.invalidate();
  pending.resolve();
  await task;

  assert.equal(status, "");
  assert.equal(verifyEnabled, false);
});

test("sendOtp ignores a late Firebase confirmation and releases only its own send lock", () => {
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
  assert.ok(finallyBody.indexOf("otpFlow.finishSend(requestVersion)") >= 0);
  assert.ok(finallyBody.indexOf("otpFlow.finishSend(requestVersion)") < finallyBody.indexOf("otpFlow.isCurrent(requestVersion)"));
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
  assert.match(finallyBody, /otpFlow\.finishVerification\(requestVersion\) && otpFlow\.isCurrent\(requestVersion\)/);
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

test("only one phone-code verification may own the current OTP generation", () => {
  const guard = createStudentOtpFlowGuard();
  const token = guard.begin();
  assert.equal(guard.finishSend(token), true);

  assert.equal(guard.beginVerification(token), true);
  assert.equal(guard.isVerifying(), true);
  assert.equal(guard.beginVerification(token), false, "a second confirmation must not overlap");
  assert.equal(guard.begin(), null, "a new SMS request must not supersede an in-flight confirmation");
  assert.equal(guard.finishVerification(token), true);
  assert.equal(guard.isVerifying(), false);
  assert.equal(guard.beginVerification(token), true, "a rejected OTP may be retried after the first attempt settles");
  assert.equal(guard.finishVerification(token), true);
});

test("an auth transition cancels old verification ownership without unlocking a newer one", () => {
  const guard = createStudentOtpFlowGuard();
  const oldToken = guard.begin();
  assert.equal(guard.finishSend(oldToken), true);
  assert.equal(guard.beginVerification(oldToken), true);

  guard.invalidate();
  const newToken = guard.begin();
  assert.equal(guard.finishSend(newToken), true);
  assert.equal(guard.beginVerification(newToken), true);
  assert.equal(guard.finishVerification(oldToken), false);
  assert.equal(guard.isVerifying(), true);
  assert.equal(guard.finishVerification(newToken), true);
  assert.equal(guard.isVerifying(), false);
});

test("Student Portal blocks overlapping SMS sends and locks both controls during OTP confirmation", () => {
  const portal = readFileSync(new URL("../portal.js", import.meta.url), "utf8");
  const sendStart = portal.indexOf("async function sendOtp()");
  const sendEnd = portal.indexOf("async function verifyOtp()", sendStart);
  const send = portal.slice(sendStart, sendEnd);
  assert.ok(sendStart >= 0 && sendEnd > sendStart);
  assert.ok(send.indexOf("otpFlow.isSending()") < send.indexOf("otpFlow.begin()"));
  assert.ok(send.indexOf("otpFlow.isVerifying()") < send.indexOf("otpFlow.begin()"));
  assert.match(send, /if \(!requestVersion\) return;/);

  const verifyStart = portal.indexOf("async function verifyOtp()");
  const verifyEnd = portal.indexOf('el("rm-student-send-otp")', verifyStart);
  const verify = portal.slice(verifyStart, verifyEnd);
  assert.ok(verifyStart >= 0 && verifyEnd > verifyStart);
  assert.ok(verify.indexOf("otpFlow.beginVerification(requestVersion)") < verify.indexOf("await activeConfirmation.confirm(code)"));
  assert.ok(verify.indexOf("setOtpControlsLocked(true)") < verify.indexOf("await activeConfirmation.confirm(code)"));
  assert.match(verify, /otpFlow\.finishVerification\(requestVersion\) && otpFlow\.isCurrent\(requestVersion\)/);
  assert.match(verify, /setOtpControlsLocked\(false\)/);
});


test("unlocking Student OTP controls restores labels left busy by an invalidated request", () => {
  const controls = {
    sendButton: { disabled: true, textContent: "Sending OTP…" },
    verifyButton: { disabled: true, textContent: "Verifying…" }
  };
  setStudentOtpControlsLocked(controls, false);
  assert.equal(controls.sendButton.disabled, false);
  assert.equal(controls.verifyButton.disabled, false);
  assert.equal(controls.sendButton.textContent, "Send OTP");
  assert.equal(controls.verifyButton.textContent, "Verify & Sign in");
});

test("locking preserves busy labels and disables both Student OTP controls", () => {
  const controls = {
    sendButton: { disabled: false, textContent: "Sending OTP…" },
    verifyButton: { disabled: false, textContent: "Verifying…" }
  };
  setStudentOtpControlsLocked(controls, true);
  assert.equal(controls.sendButton.disabled, true);
  assert.equal(controls.verifyButton.disabled, true);
  assert.equal(controls.sendButton.textContent, "Sending OTP…");
  assert.equal(controls.verifyButton.textContent, "Verifying…");
});

test("invalid OTP control configuration fails closed", () => {
  assert.throws(() => setStudentOtpControlsLocked({}, false), /Both Student OTP controls/);
  assert.throws(() => setStudentOtpControlsLocked({
    sendButton: { disabled: false, textContent: "Send OTP" },
    verifyButton: { disabled: false, textContent: "Verify & Sign in" }
  }, undefined), /must be boolean/);
});

test("Student Portal uses the tested control helper and resets labels on auth transitions", () => {
  const portal = readFileSync(new URL("../portal.js", import.meta.url), "utf8");
  assert.ok(portal.includes('import { setStudentOtpControlsLocked, shouldUnlockStudentOtpControls } from "./otp-control-state.mjs";'));
  const lockStart = portal.indexOf("function setOtpControlsLocked(locked)");
  const lockEnd = portal.indexOf("async function retryPendingSignOut()", lockStart);
  const lockBody = portal.slice(lockStart, lockEnd);
  assert.ok(lockStart >= 0 && lockEnd > lockStart);
  assert.match(lockBody, /setStudentOtpControlsLocked\(/);
  const authStart = portal.indexOf("onAuthStateChanged(auth, async user => {");
  const authEnd = portal.indexOf("\n});", authStart);
  const authBody = portal.slice(authStart, authEnd);
  assert.ok(authStart >= 0 && authEnd > authStart);
  assert.match(authBody, /otpFlow\.invalidate\(\)/);
  assert.match(authBody, /setOtpControlsLocked\(false\)/);
});



test("OTP controls unlock from sign-out recovery only when Firebase Auth explicitly has no current user", () => {
  assert.equal(shouldUnlockStudentOtpControls(null), true);
  assert.equal(shouldUnlockStudentOtpControls({ uid: "replacement-student" }), false);
  assert.equal(shouldUnlockStudentOtpControls(undefined), false,
    "an uninitialized or unavailable Auth state must fail closed");
});

test("pending sign-out retry is bound to its original UID and cannot sign out a replacement account", () => {
  const portal = readFileSync(new URL("../portal.js", import.meta.url), "utf8");
  const retryStart = portal.indexOf("async function retryPendingSignOut()");
  const retryEnd = portal.indexOf("function setBusy", retryStart);
  assert.ok(retryStart >= 0 && retryEnd > retryStart, "retry handler has a bounded source range");
  const retry = portal.slice(retryStart, retryEnd);
  const capture = retry.indexOf("const retryingUid = auth.currentUser?.uid || null;");
  const markerCheck = retry.indexOf("logoutRecovery.shouldBlock(retryingUid)");
  const signOutCall = retry.indexOf("await signOut(auth)");
  assert.ok(capture >= 0 && markerCheck > capture && signOutCall > markerCheck,
    "the current UID must match the pending marker before Firebase signOut is called");
  assert.ok(retry.includes("if (auth.currentUser?.uid === retryingUid)"));
  assert.ok(retry.includes("setPostSignOutStatus()"));
});

test("sign-out completion does not unlock OTP controls while an authenticated replacement session exists", () => {
  const portal = readFileSync(new URL("../portal.js", import.meta.url), "utf8");
  const helperStart = portal.indexOf("function unlockOtpControlsIfSignedOut()");
  const helperEnd = portal.indexOf("function setPostSignOutStatus()", helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  const helper = portal.slice(helperStart, helperEnd);
  assert.ok(helper.includes("shouldUnlockStudentOtpControls(auth.currentUser)"));
  assert.ok(helper.includes("if (signedOut) setOtpControlsLocked(false)"));
  assert.equal(helper.includes("else setOtpControlsLocked(false)"), false);

  const logoutStart = portal.indexOf('logoutButton.addEventListener("click", async () => {');
  const logoutEnd = portal.indexOf('document.querySelectorAll("[data-view]")', logoutStart);
  assert.ok(logoutStart >= 0 && logoutEnd > logoutStart);
  const logout = portal.slice(logoutStart, logoutEnd);
  assert.ok(logout.includes("setPostSignOutStatus()"));
  assert.equal(logout.includes("setOtpControlsLocked(false)"), false);
});
