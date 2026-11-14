// This test is deliberately pinned to the local Firebase Auth Emulator.
// It never contacts production Firebase Auth or a carrier SMS gateway.
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { setTimeout: delay } = require("node:timers/promises");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getAuth: getAdminAuth } = require("firebase-admin/auth");
const { initializeApp: initializeClientApp, deleteApp: deleteClientApp } = require("firebase/app");
const {
  getAuth,
  connectAuthEmulator,
  onAuthStateChanged,
  signInWithCustomToken,
  signOut
} = require("firebase/auth");

const PROJECT = process.env.GCLOUD_PROJECT || "railway-mitra";
const AUTH_EMULATOR_URL = "http://127.0.0.1:9099";

async function waitFor(predicate, label, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(20);
  }
  assert.ok(predicate(), "Timed out waiting for " + label);
}

async function signInAsEmulatorUid(auth, adminAuth, uid) {
  const token = await adminAuth.createCustomToken(uid);
  const credential = await signInWithCustomToken(auth, token);
  return credential.user;
}

test("Auth Emulator clears Student A before Student B's unsupported provider is rejected", { timeout: 15000 }, async () => {
  const adminApp = initializeApp({ projectId: PROJECT }, "student-switch-admin");
  const adminAuth = getAdminAuth(adminApp);
  const clientApp = initializeClientApp({
    apiKey: "fake-api-key",
    projectId: PROJECT,
    appId: "1:123456789:web:student-session-switch-emulator"
  }, "student-switch-client");
  const auth = getAuth(clientApp);
  connectAuthEmulator(auth, AUTH_EMULATOR_URL, { disableWarnings: true });

  const { invalidateStudentPortalSession } = await import("../../../student/session-transition.mjs");
  const state = {
    authStateVersion: 0,
    viewRequestVersion: 0,
    activeExamController: null,
    currentUser: null,
    currentTestId: null,
    activeView: "catalogue"
  };
  const ui = {
    workspace: { hidden: true },
    login: { hidden: false },
    logoutButton: { hidden: true },
    view: {
      children: [],
      replaceChildren() { this.children = []; }
    }
  };
  const snapshots = [];
  const tokenChecks = [];
  const rejectedUids = new Set();
  const callbackErrors = [];
  let initialStateSeen = false;
  let resolveInitialState;
  const initialState = new Promise(resolve => { resolveInitialState = resolve; });

  const unsubscribe = onAuthStateChanged(auth, user => {
    const version = ++state.authStateVersion;
    const previousUid = state.currentUser?.uid || null;

    // This is the same teardown helper used by the production student portal.
    // Capture the UI after teardown and before awaiting incoming token claims.
    invalidateStudentPortalSession(state, {
      workspace: ui.workspace,
      login: ui.login,
      logoutButton: ui.logoutButton,
      view: ui.view
    });
    snapshots.push({
      uid: user?.uid || null,
      previousUid,
      workspaceHidden: ui.workspace.hidden,
      viewChildren: [...ui.view.children],
      currentTestId: state.currentTestId
    });

    if (!user) {
      if (!initialStateSeen) {
        initialStateSeen = true;
        resolveInitialState();
      }
      return;
    }

    void (async () => {
      try {
        const token = await user.getIdTokenResult();
        if (version !== state.authStateVersion || auth.currentUser?.uid !== user.uid) return;
        const provider = token.claims?.firebase?.sign_in_provider || null;
        tokenChecks.push({ uid: user.uid, provider });
        if (provider !== "phone") {
          rejectedUids.add(user.uid);
          return;
        }

        state.currentUser = user;
        ui.workspace.hidden = false;
        ui.login.hidden = true;
        ui.logoutButton.hidden = false;
        ui.view.children = ["workspace:" + user.uid];
      } catch (error) {
        callbackErrors.push(error);
      }
    })();
  });

  const suffix = String(Date.now());
  const uidA = "student-a-session-switch-" + suffix;
  const uidB = "student-b-session-switch-" + suffix;
  let userA = null;
  let userB = null;

  try {
    await initialState;

    userA = await signInAsEmulatorUid(auth, adminAuth, uidA);
    await waitFor(() => tokenChecks.some(item => item.uid === uidA), "Student A token claims");
    assert.equal(tokenChecks.find(item => item.uid === uidA).provider, "custom");
    assert.equal(ui.workspace.hidden, true, "custom-token sessions are not admitted as student phone sessions");

    // Seed an already-open Student A exam view to exercise the shared teardown
    // helper used when a valid previous session is being explicitly signed out.
    let previousExamDestroyed = false;
    state.currentUser = userA;
    state.activeExamController = {
      destroy() { previousExamDestroyed = true; }
    };
    state.currentTestId = "student-a-private-test";
    state.activeView = "exam";
    ui.workspace.hidden = false;
    ui.login.hidden = true;
    ui.logoutButton.hidden = false;
    ui.view.children = ["student-a-private-exam-content"];

    invalidateStudentPortalSession(state, {
      workspace: ui.workspace,
      login: ui.login,
      logoutButton: ui.logoutButton,
      view: ui.view
    });
    assert.equal(previousExamDestroyed, true);
    assert.equal(state.currentUser, null);
    assert.equal(state.currentTestId, null);
    assert.equal(ui.workspace.hidden, true);
    assert.equal(ui.login.hidden, false);
    assert.deepEqual(ui.view.children, []);

    const nullEventsBeforeSignOut = snapshots.filter(item => item.uid === null).length;
    await signOut(auth);
    await waitFor(
      () => snapshots.filter(item => item.uid === null).length > nullEventsBeforeSignOut,
      "Student A sign-out auth-state event"
    );
    assert.equal(auth.currentUser, null);

    userB = await signInAsEmulatorUid(auth, adminAuth, uidB);
    assert.notEqual(userA.uid, userB.uid, "Student B must be a different Firebase account");
    await waitFor(() => tokenChecks.some(item => item.uid === uidB), "Student B token claims");

    const studentBTransition = [...snapshots].reverse().find(item => item.uid === uidB);
    assert.ok(studentBTransition, "the Auth listener observed Student B");
    assert.equal(studentBTransition.workspaceHidden, true);
    assert.deepEqual(studentBTransition.viewChildren, []);
    assert.equal(studentBTransition.previousUid, null);
    assert.equal(studentBTransition.currentTestId, null);
    assert.equal(tokenChecks.find(item => item.uid === uidB).provider, "custom");
    assert.equal(rejectedUids.has(uidB), true, "the portal provider gate must reject B's non-phone session");

    assert.equal(auth.currentUser?.uid, uidB);
    assert.equal(state.currentUser, null);
    assert.equal(ui.workspace.hidden, true);
    assert.equal(ui.login.hidden, false);
    assert.deepEqual(ui.view.children, []);
    assert.deepEqual(callbackErrors, []);
  } finally {
    unsubscribe();
    await signOut(auth).catch(() => {});
    await adminAuth.deleteUser(uidA).catch(() => {});
    await adminAuth.deleteUser(uidB).catch(() => {});
    await deleteClientApp(clientApp).catch(() => {});
    await deleteApp(adminApp).catch(() => {});
  }
});
