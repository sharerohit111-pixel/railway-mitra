/**
 * Fail closed while Firebase Auth moves between student sessions.
 * Invalidate pending view work before destroying the previous exam controller.
 */
export function invalidateStudentPortalSession(state, { workspace, login, logoutButton, view } = {}) {
  if (!state || typeof state !== "object" || !Number.isSafeInteger(state.viewRequestVersion)) {
    throw new TypeError("A valid student portal state is required");
  }
  if (!workspace || !login || !logoutButton || !view || typeof view.replaceChildren !== "function") {
    throw new TypeError("Student portal session UI elements are required");
  }

  state.viewRequestVersion += 1;
  const previousExamController = state.activeExamController;
  state.activeExamController = null;
  state.currentUser = null;
  state.currentTestId = null;
  state.activeView = "catalogue";

  // Cleanup must never keep the previous student's workspace visible.
  try {
    previousExamController?.destroy?.();
  } catch (_) {
    // The session transition remains fail-closed even if a stale controller misbehaves.
  }

  // Remove the previous student's rendered exam before a new workspace can open.
  workspace.hidden = true;
  login.hidden = false;
  logoutButton.hidden = true;
  view.replaceChildren();
}
