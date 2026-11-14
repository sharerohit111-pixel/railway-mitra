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
  assert.match(portal.slice(invalidation, invalidationCallEnd), /\\bview\\b/, "the previous student's rendered view is passed for synchronous clearing");
  assert.ok(tokenLookup > invalidation, "token verification happens only after teardown");
});
