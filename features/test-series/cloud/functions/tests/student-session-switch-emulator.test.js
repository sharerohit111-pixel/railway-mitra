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
const AUTH_EMULATOR_API_KEY = "fake-api-key";
const { hasStudentPhoneSignIn } = require("../student-auth");

async function waitFor(predicate, label, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(20);
  }
  assert.ok(predicate(), "Timed out waiting for " + label);
}

async function authEmulatorRequest(path, { method = "GET", body } = {}) {
  const response = await fetch(AUTH_EMULATOR_URL + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json();
  assert.equal(response.ok, true, "Auth Emulator request failed: " + (payload.error?.message || response.status));
  return payload;
}

function normalizeEmulatorPhoneNumber(value) {
  return typeof value === "string" ? value.replace(/[^0-9]/g, "") : "";
}

async function getEmulatorSmsCode(phoneNumber) {
  const deadline = Date.now() + 8000;
  let observedEntries = [];
  let responseKeys = [];
  while (Date.now() < deadline) {
    const payload = await authEmulatorRequest("/emulator/v1/projects/" + encodeURIComponent(PROJECT) + "/verificationCodes");
    const entries = Array.isArray(payload.verificationCodes) ? payload.verificationCodes : [];
    responseKeys = Object.keys(payload || {});
    const wanted = normalizeEmulatorPhoneNumber(phoneNumber);
    const matchingEntries = entries.filter(item => normalizeEmulatorPhoneNumber(item.phoneNumber) === wanted);
    const match = matchingEntries.find(item => /^\d{6}$/.test(String(item.code ?? "")));
    observedEntries = matchingEntries.map(item => ({
      keys: Object.keys(item || {}),
      codeType: typeof item.code,
      hasUsableCode: /^\d{6}$/.test(String(item.code ?? ""))
    }));
    if (match) return String(match.code);
    await delay(25);
  }
  assert.fail(
    "Timed out waiting for the local Auth Emulator SMS code for " + phoneNumber +
    " (project=" + PROJECT +
    ", responseKeys=" + responseKeys.join(",") +
    ", matchingEntryMetadata=" + JSON.stringify(observedEntries) + ")"
  );
}

async function signInAsEmulatorPhone(auth, phoneNumber) {
  const verification = await authEmulatorRequest("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=" + AUTH_EMULATOR_API_KEY, {
    method: "POST", body: { phoneNumber }
  });
  assert.equal(typeof verification.sessionInfo, "string");
  assert.ok(verification.sessionInfo.length > 0);
  const code = await getEmulatorSmsCode(phoneNumber);
  const credential = PhoneAuthProvider.credential(verification.sessionInfo, code);
  return (await signInWithCredential(auth, credential)).user;
}

test("Auth Emulator signs in Student A and Student B with phone OTP and clears A before B's workspace opens", { timeout: 20000 }, async () => {
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
        tokenChecks.push({ uid: user.uid, provider, studentAccess: hasStudentPhoneSignIn(token.claims) });
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

  const phoneA = "+16505550101";
  const phoneB = "+16505550102";
  let userA = null;
  let userB = null;

  try {
    await initialState;

    userA = await signInAsEmulatorPhone(auth, phoneA);
    await waitFor(() => tokenChecks.some(item => item.uid === userA.uid), "Student A phone token claims");
    const studentAToken = tokenChecks.find(item => item.uid === userA.uid);
    assert.equal(studentAToken.provider, "phone");
    assert.equal(studentAToken.studentAccess, true, "the server student policy must accept a real phone-provider claim");
    assert.equal(state.currentUser?.uid, userA.uid);
    assert.equal(ui.workspace.hidden, false, "Student A's phone session should open the student workspace");

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

    userB = await signInAsEmulatorPhone(auth, phoneB);
    assert.notEqual(userA.uid, userB.uid, "Student B must be a different Firebase account");
    await waitFor(() => tokenChecks.some(item => item.uid === userB.uid), "Student B phone token claims");

    const studentBTransition = [...snapshots].reverse().find(item => item.uid === userB.uid);
    assert.ok(studentBTransition, "the Auth listener observed Student B");
    assert.equal(studentBTransition.workspaceHidden, true);
    assert.deepEqual(studentBTransition.viewChildren, []);
    assert.equal(studentBTransition.previousUid, null);
    assert.equal(studentBTransition.currentTestId, null);
    const studentBToken = tokenChecks.find(item => item.uid === userB.uid);
    assert.equal(studentBToken.provider, "phone");
    assert.equal(studentBToken.studentAccess, true, "the server student policy must accept Student B's phone-provider claim");
    assert.equal(rejectedUids.has(userB.uid), false);

    assert.equal(auth.currentUser?.uid, userB.uid);
    assert.equal(state.currentUser?.uid, userB.uid);
    assert.equal(ui.workspace.hidden, false, "Student B's workspace should open after the clean transition");
    assert.equal(ui.login.hidden, true);
    assert.deepEqual(ui.view.children, ["workspace:" + userB.uid]);
    assert.deepEqual(callbackErrors, []);
  } finally {
    unsubscribe();
    await signOut(auth).catch(() => {});
    if (userA?.uid) await adminAuth.deleteUser(userA.uid).catch(() => {});
    if (userB?.uid) await adminAuth.deleteUser(userB.uid).catch(() => {});
    await deleteClientApp(clientApp).catch(() => {});
    await deleteApp(adminApp).catch(() => {});
  }
});
