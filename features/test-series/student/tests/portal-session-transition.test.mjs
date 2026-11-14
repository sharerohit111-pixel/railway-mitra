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
  const sendDisabled = portal.indexOf("sendOtpButton.disabled = true", logoutStart);
  const signOutCall = portal.indexOf("await signOut(auth)", logoutStart);

  assert.ok(logoutStart >= 0, "logout handler exists");
  assert.ok(invalidation > logoutStart, "logout synchronously invalidates the old student workspace");
  assert.ok(confirmationClear > invalidation, "logout discards the previous OTP confirmation");
  assert.ok(sendDisabled > confirmationClear, "new OTP controls are locked during sign-out");
  assert.ok(signOutCall > sendDisabled, "Firebase sign-out is awaited only after local lockout");
});

test("logout does not re-enable OTP controls when Firebase signOut fails", () => {
  const portal = readFileSync(new URL("../portal.js", import.meta.url), "utf8");
  const logoutStart = portal.indexOf('logoutButton.addEventListener("click", async () => {');
  const signOutCall = portal.indexOf("await signOut(auth)", logoutStart);
  const catchStart = portal.indexOf("} catch (error) {", signOutCall);
  const catchEnd = portal.indexOf("\n  }\n});", catchStart);
  const catchBody = portal.slice(catchStart, catchEnd);

  assert.ok(signOutCall > logoutStart, "logout awaits Firebase sign-out");
  assert.ok(catchStart > signOutCall, "logout handles sign-out failure");
  assert.match(catchBody, /student workspace remains locked/);
  assert.ok(!catchBody.includes("sendOtpButton.disabled = false"), "OTP controls remain disabled after an unconfirmed sign-out");
});
