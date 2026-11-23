import test from "node:test";
import assert from "node:assert/strict";
import { invalidateStudentPortalSession } from "../session-transition.mjs";

function harness(controller = null) {
  const state = {
    viewRequestVersion: 7,
    activeExamController: controller,
    currentUser: { uid: "previous-student" },
    currentTestId: "test-123",
    activeView: "exam"
  };
  const calls = { destroyed: 0, cleared: 0 };
  const ui = {
    workspace: { hidden: false },
    login: { hidden: true },
    logoutButton: { hidden: false },
    view: { replaceChildren() { calls.cleared += 1; } }
  };
  return { state, calls, ui };
}

test("student auth transition invalidates pending views and clears the previous student's workspace", () => {
  const h = harness({ destroy() { h.calls.destroyed += 1; } });
  invalidateStudentPortalSession(h.state, h.ui);

  assert.equal(h.state.viewRequestVersion, 8);
  assert.equal(h.state.activeExamController, null);
  assert.equal(h.state.currentUser, null);
  assert.equal(h.state.currentTestId, null);
  assert.equal(h.state.activeView, "catalogue");
  assert.equal(h.ui.workspace.hidden, true);
  assert.equal(h.ui.login.hidden, false);
  assert.equal(h.ui.logoutButton.hidden, true);
  assert.equal(h.calls.cleared, 1);
  assert.equal(h.calls.destroyed, 1);
});

test("a broken old exam controller cannot prevent fail-closed session cleanup", () => {
  const h = harness({ destroy() { h.calls.destroyed += 1; throw new Error("stale controller"); } });
  assert.doesNotThrow(() => invalidateStudentPortalSession(h.state, h.ui));

  assert.equal(h.calls.destroyed, 1);
  assert.equal(h.state.currentUser, null);
  assert.equal(h.ui.workspace.hidden, true);
  assert.equal(h.ui.login.hidden, false);
  assert.equal(h.calls.cleared, 1);
});

test("invalid portal state or missing UI elements are rejected", () => {
  const h = harness();
  assert.throws(() => invalidateStudentPortalSession(null, h.ui), /valid student portal state/);
  assert.throws(() => invalidateStudentPortalSession(h.state, { ...h.ui, view: null }), /UI elements/);
});
