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
  PhoneAuthProvider,
  signInWithCredential,
  signOut
} = require("firebase/auth");

const PROJECT = process.env.GCLOUD_PROJECT || "railway-mitra";
const AUTH_EMULATOR_URL = "http://127.0.0.1:9099";
const AUTH_EMULATOR_CODES_URL =
  AUTH_EMULATOR_URL + "/emulator/v1/projects/" + PROJECT + "/verificationCodes";

async function waitFor(predicate, label, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(20);
  }
  assert.ok(predicate(), "Timed out waiting for " + label);
}

async function signInWithEmulatorPhone(auth, phoneNumber) {
  // Use the Auth Emulator's local verification endpoint, then complete the
  // phone credential with the Firebase client SDK. No browser reCAPTCHA or SMS
  // gateway is involved, and this remains a real phone-provider auth session.
  const sendResponse = await fetch(
    AUTH_EMULATOR_URL + "/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=fake-api-key",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phoneNumber,
        recaptchaToken: "railway-mitra-auth-emulator-only"
      })
    }
  );
  if (!sendResponse.ok) {
    throw new Error("Auth Emulator phone challenge returned HTTP " + sendResponse.status + ": " + await sendResponse.text());
  }
  const challenge = await sendResponse.json();
  if (typeof challenge.sessionInfo !== "string" || !challenge.sessionInfo) {
    throw new Error("Auth Emulator did not return a phone verification session.");
  }

  const deadline = Date.now() + 5000;
  let verificationCode = null;
  while (Date.now() < deadline && !verificationCode) {
    const response = await fetch(AUTH_EMULATOR_CODES_URL);
    if (!response.ok) {
      throw new Error("Auth Emulator verification-code endpoint returned HTTP " + response.status);
    }
    const payload = await response.json();
    const match = (payload.verificationCodes || [])
      .filter(item => item.phoneNumber === phoneNumber)
      .at(-1);
    verificationCode = match?.sessionCode || null;
    if (!verificationCode) await delay(20);
  }

  if (!verificationCode) {
    throw new Error("No SMS verification code appeared for the emulator-only phone number.");
  }
  const credential = PhoneAuthProvider.credential(challenge.sessionInfo, verificationCode);
  const userCredential = await signInWithCredential(auth, credential);
  return userCredential.user;
}

test("Auth Emulator isolates Student A logout before Student B phone sign-in", { timeout: 25000 }, async () => {
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
  const callbackErrors = [];
  const userIds = new Set();
  let initialStateSeen = false;
  let resolveInitialState;
  const initialState = new Promise(resolve => { resolveInitialState = resolve; });

  const unsubscribe = onAuthStateChanged(auth, user => {
    const version = ++state.authStateVersion;

    // This is the same teardown helper used by the production student portal.
    // Capture the UI immediately after teardown and before awaiting token claims.
    invalidateStudentPortalSession(state, {
      workspace: ui.workspace,
      login: ui.login,
      logoutButton: ui.logoutButton,
      view: ui.view
    });
    snapshots.push({
      uid: user?.uid || null,
      workspaceHidden: ui.workspace.hidden,
      viewChildren: [...ui.view.children],
      previousUid: state.currentUser?.uid || null,
      currentTestId: state.currentTestId
    });

    if (!user) {
      if (!initialStateSeen) {
        initialStateSeen = true;
        resolveInitialState();
      }
      return;
    }

    userIds.add(user.uid);
    void (async () => {
      try {
        const token = await user.getIdTokenResult();
        if (version !== state.authStateVersion || auth.currentUser?.uid !== user.uid) return;
        if (token.claims?.firebase?.sign_in_provider !== "phone") return;

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

  const suffix = String(Date.now()).slice(-4);
  const phoneA = "+1650555" + suffix;
  const phoneB = "+1650556" + suffix;
  let userA = null;
  let userB = null;

  try {
    await initialState;

    userA = await signInWithEmulatorPhone(auth, phoneA);
    await waitFor(() => state.currentUser?.uid === userA.uid, "Student A workspace");
    assert.equal((await userA.getIdTokenResult()).claims?.firebase?.sign_in_provider, "phone");

    let previousExamDestroyed = false;
    state.activeExamController = {
      destroy() { previousExamDestroyed = true; }
    };
    state.currentTestId = "student-a-private-test";
    state.activeView = "exam";
    ui.workspace.hidden = false;
    ui.login.hidden = true;
    ui.logoutButton.hidden = false;
    ui.view.children = ["student-a-private-exam-content"];

    // Match the portal's immediate logout path: clear the old account before
    // waiting for Firebase signOut and its asynchronous auth-state callback.
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

    userB = await signInWithEmulatorPhone(auth, phoneB);
    assert.notEqual(userA.uid, userB.uid, "Student B must be a different Firebase account");
    await waitFor(() => state.currentUser?.uid === userB.uid, "Student B workspace");
    assert.equal((await userB.getIdTokenResult()).claims?.firebase?.sign_in_provider, "phone");

    const studentBTransition = [...snapshots].reverse().find(item => item.uid === userB.uid);
    assert.ok(studentBTransition, "the Auth listener observed Student B");
    assert.equal(studentBTransition.workspaceHidden, true, "the workspace stays hidden while B's claims are checked");
    assert.deepEqual(studentBTransition.viewChildren, [], "Student A's rendered exam is gone before B's token lookup");
    assert.equal(studentBTransition.previousUid, null, "Student A's UID is cleared before B is admitted");
    assert.equal(studentBTransition.currentTestId, null, "Student A's test ID is cleared before B is admitted");

    assert.equal(auth.currentUser?.uid, userB.uid);
    assert.equal(state.currentUser?.uid, userB.uid);
    assert.deepEqual(ui.view.children, ["workspace:" + userB.uid]);
    assert.equal(ui.view.children.some(item => item.includes(userA.uid)), false);
    assert.deepEqual(callbackErrors, []);
  } finally {
    unsubscribe();
    await signOut(auth).catch(() => {});
    for (const uid of userIds) {
      await adminAuth.deleteUser(uid).catch(() => {});
    }
    if (userA?.uid && !userIds.has(userA.uid)) await adminAuth.deleteUser(userA.uid).catch(() => {});
    if (userB?.uid && !userIds.has(userB.uid)) await adminAuth.deleteUser(userB.uid).catch(() => {});
    await deleteClientApp(clientApp).catch(() => {});
    await deleteApp(adminApp).catch(() => {});
  }
});
