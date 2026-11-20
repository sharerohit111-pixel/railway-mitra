import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { invalidateStudentPortalSession } from "../session-transition.mjs";

function makeFixture(controller = null) {
  const state = {
    viewRequestVersion: 7,
    activeExamController: controller,
    currentUser: { uid: "student-a" },
    currentTestId: "test-a",
    activeView: "exam"
  };
  const ui = {
    workspace: { hidden: false },
    login: { hidden: true },
    logoutButton: { hidden: false },
    view: {
      children: ["previous student exam"],
      replaceChildren() { this.children = []; this.cleared = true; }
    }
  };
  return { state, ui };
}

test("invalidates pending views and destroys the previous student's exam before showing login", () => {
  let destroyed = false;
  const controller = { destroy() { destroyed = true; } };
  const { state, ui } = makeFixture(controller);

  invalidateStudentPortalSession(state, ui);

  assert.equal(destroyed, true);
  assert.equal(state.viewRequestVersion, 8);
  assert.equal(state.activeExamController, null);
  assert.equal(state.currentUser, null);
  assert.equal(state.currentTestId, null);
  assert.equal(state.activeView, "catalogue");
  assert.equal(ui.workspace.hidden, true);
  assert.equal(ui.login.hidden, false);
  assert.equal(ui.logoutButton.hidden, true);
  assert.deepEqual(ui.view.children, []);
  assert.equal(ui.view.cleared, true);
});

test("keeps the workspace hidden even if stale exam cleanup throws", () => {
  const { state, ui } = makeFixture({ destroy() { throw new Error("stale controller"); } });

  assert.doesNotThrow(() => invalidateStudentPortalSession(state, ui));
  assert.equal(state.currentUser, null);
  assert.equal(ui.workspace.hidden, true);
  assert.equal(ui.login.hidden, false);
  assert.equal(ui.logoutButton.hidden, true);
  assert.deepEqual(ui.view.children, []);
  assert.equal(ui.view.cleared, true);
});

test("auth listener invalidates the old workspace before awaiting new token claims", () => {
  const portal = readFileSync(new URL("../portal.js", import.meta.url), "utf8");
  const handlerStart = portal.indexOf("onAuthStateChanged(auth, async user => {");
  const invalidation = portal.indexOf("invalidateStudentPortalSession(portalState", handlerStart);
  const tokenLookup = portal.indexOf("await user.getIdTokenResult()", handlerStart);

  assert.ok(handlerStart >= 0, "auth-state listener exists");
  assert.ok(invalidation > handlerStart, "auth-state listener immediately invalidates the old workspace");
  const invalidationCallEnd = portal.indexOf("});", invalidation);
  assert.ok(portal.slice(invalidation, invalidationCallEnd).includes("view"), "the previous student's rendered view is passed for synchronous clearing");
  assert.ok(tokenLookup > invalidation, "token verification happens only after teardown");
});

test("logout clears the prior workspace and OTP confirmation before awaiting Firebase signOut", () => {
  const portal = readFileSync(new URL("../portal.js", import.meta.url), "utf8");
  const logoutStart = portal.indexOf('logoutButton.addEventListener("click", async () => {');
  const invalidation = portal.indexOf("invalidateStudentPortalSession(portalState", logoutStart);
  const confirmationClear = portal.indexOf("confirmation = null", logoutStart);
  const sendDisabled = portal.indexOf("setOtpControlsLocked(true)", logoutStart);
  const signOutCall = portal.indexOf("await signOut(auth)", logoutStart);

  assert.ok(logoutStart >= 0, "logout handler exists");
  assert.ok(invalidation > logoutStart, "logout synchronously invalidates the old student workspace");
  assert.ok(confirmationClear > invalidation, "logout discards the previous OTP confirmation");
  assert.ok(sendDisabled > confirmationClear, "new OTP controls are locked during sign-out");
  assert.ok(signOutCall > sendDisabled, "Firebase sign-out is awaited only after local lockout");
});

test("logout persists a same-student lock and exposes retry when Firebase signOut fails", () => {
  const portal = readFileSync(new URL("../portal.js", import.meta.url), "utf8");
  const logoutStart = portal.indexOf('logoutButton.addEventListener("click", async () => {');
  const signOutCall = portal.indexOf("await signOut(auth)", logoutStart);
  const catchStart = portal.indexOf("} catch (error) {", signOutCall);
  const catchEnd = portal.indexOf("\n  }\n});", catchStart);
  const catchBody = portal.slice(catchStart, catchEnd);

  assert.ok(signOutCall > logoutStart, "logout awaits Firebase sign-out");
  assert.ok(catchStart > signOutCall, "logout handles sign-out failure");
  assert.match(catchBody, /logoutRecovery\.block\(signingOutUid\)/);
  assert.match(catchBody, /retrySignOutButton\.hidden = false/);
  const lockBeforeAwait = portal.indexOf("setOtpControlsLocked(true)", logoutStart);
  assert.ok(lockBeforeAwait > logoutStart && lockBeforeAwait < signOutCall, "OTP controls are locked before awaiting sign-out");
  const sameUidFailureBranch = catchBody.slice(0, catchBody.indexOf("} else {"));
  assert.ok(!sameUidFailureBranch.includes("setOtpControlsLocked(false)"), "OTP controls remain locked while the same UID is still authenticated");
});

test("successful logout clears the pending lock and hides retry control", () => {
  const portal = readFileSync(new URL("../portal.js", import.meta.url), "utf8");
  const logoutStart = portal.indexOf('logoutButton.addEventListener("click", async () => {');
  const signOutCall = portal.indexOf("await signOut(auth)", logoutStart);
  const successClear = portal.indexOf("logoutRecovery.clear()", signOutCall);
  const retryHidden = portal.indexOf("retrySignOutButton.hidden = true", successClear);
  const catchStart = portal.indexOf("} catch (error) {", signOutCall);
  const catchBody = portal.slice(catchStart, portal.indexOf("\n  }\n});", catchStart));

  assert.ok(successClear > signOutCall, "successful Firebase sign-out clears the persisted lock");
  assert.ok(retryHidden > successClear, "successful sign-out hides the retry control");
  assert.match(catchBody, /retrySignOutButton\.hidden = false/);
});

test("auth-state restoration blocks the same UID until sign-out succeeds", () => {
  const portal = readFileSync(new URL("../portal.js", import.meta.url), "utf8");
  const listener = portal.indexOf("onAuthStateChanged(auth, async user => {");
  const block = portal.indexOf("logoutRecovery.shouldBlock(user.uid)", listener);
  const tokenLookup = portal.indexOf("await user.getIdTokenResult()", listener);

  assert.ok(block > listener, "auth listener checks pending logout before opening workspace");
  assert.ok(tokenLookup > block, "token claims are not fetched before the pending-logout guard");
});



test("phone and OTP input validation retain their required regular-expression escapes", () => {
  const portal = readFileSync(new URL("../portal.js", import.meta.url), "utf8");

  const backslash = String.fromCharCode(92);
  assert.ok(portal.includes("/^" + backslash + "+[1-9]" + backslash + "d{7,14}$/"), "phone input requires a country-coded E.164-like value");
  assert.ok(portal.includes("/^" + backslash + "d{6}$/"), "OTP input requires exactly six digits");
});


test("auth listener keeps OTP controls locked until the current identity's provider claim is checked", () => {
  const portal = readFileSync(new URL("../portal.js", import.meta.url), "utf8");
  const listener = portal.indexOf("onAuthStateChanged(auth, async user => {");
  const tokenLookup = portal.indexOf("await user.getIdTokenResult()", listener);
  const providerCheck = portal.indexOf('token.claims?.firebase?.sign_in_provider !== "phone"', listener);
  const lockComment = portal.indexOf("// Keep OTP controls locked until this incoming Firebase identity has been", listener);
  const lock = portal.indexOf("setOtpControlsLocked(true)", lockComment);
  const unsupportedUnlock = portal.indexOf("setOtpControlsLocked(false)", providerCheck);
  const catchStart = portal.indexOf("} catch (error) {", tokenLookup);
  const catchGuard = portal.indexOf("auth.currentUser?.uid !== user.uid", catchStart);
  const catchUnlock = portal.indexOf("setOtpControlsLocked(false)", catchStart);

  assert.ok(lockComment > listener && lock > lockComment && lock < tokenLookup,
    "incoming user controls lock before asynchronous token verification");
  assert.equal(portal.slice(lock, tokenLookup).includes("setOtpControlsLocked(false)"), false,
    "controls must not unlock while provider claims are unresolved");
  assert.ok(providerCheck > tokenLookup, "provider claim is checked after token verification");
  assert.ok(unsupportedUnlock > providerCheck, "unsupported providers unlock only after the claim is rejected");
  assert.ok(catchStart > providerCheck && catchGuard > catchStart && catchUnlock > catchGuard,
    "a current token-verification failure unlocks only after checking the auth generation and UID");
});
