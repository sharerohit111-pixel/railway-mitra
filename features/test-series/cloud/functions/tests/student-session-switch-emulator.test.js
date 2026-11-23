// This test is deliberately pinned to the local Firebase Auth Emulator.
// It never contacts production Firebase Auth or a carrier SMS gateway.
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { setTimeout: delay } = require("node:timers/promises");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getAuth: getAdminAuth } = require("firebase-admin/auth");

const PROJECT = process.env.GCLOUD_PROJECT || "railway-mitra";
const AUTH_EMULATOR_URL = "http://127.0.0.1:9099";
const AUTH_EMULATOR_API_KEY = "fake-api-key";
const { hasStudentPhoneSignIn } = require("../student-auth");

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
    const match = matchingEntries.find(item => /^\d{6}$/.test(String(item.code ?? item.sessionCode ?? "")));
    observedEntries = matchingEntries.map(item => ({
      keys: Object.keys(item || {}),
      codeType: typeof (item.code ?? item.sessionCode),
      hasUsableCode: /^\d{6}$/.test(String(item.code ?? item.sessionCode ?? ""))
    }));
    if (match) return String(match.code ?? match.sessionCode);
    await delay(25);
  }
  assert.fail(
    "Timed out waiting for the local Auth Emulator SMS code for " + phoneNumber +
    " (project=" + PROJECT +
    ", responseKeys=" + responseKeys.join(",") +
    ", matchingEntryMetadata=" + JSON.stringify(observedEntries) + ")"
  );
}

async function signInAsEmulatorPhone(adminAuth, phoneNumber) {
  const verification = await authEmulatorRequest("/identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=" + AUTH_EMULATOR_API_KEY, {
    method: "POST",
    body: { phoneNumber }
  });
  assert.equal(typeof verification.sessionInfo, "string");
  assert.ok(verification.sessionInfo.length > 0);

  const code = await getEmulatorSmsCode(phoneNumber);
  const signedIn = await authEmulatorRequest("/identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=" + AUTH_EMULATOR_API_KEY, {
    method: "POST",
    body: { sessionInfo: verification.sessionInfo, code }
  });
  assert.equal(typeof signedIn.idToken, "string");
  assert.ok(signedIn.idToken.length > 0);
  assert.equal(typeof signedIn.localId, "string");
  assert.equal(signedIn.phoneNumber, phoneNumber);

  // Verify the emulator-issued ID token with the Admin SDK. This checks the
  // actual provider claim without importing browser-only PhoneAuthProvider.
  const claims = await adminAuth.verifyIdToken(signedIn.idToken);
  assert.equal(claims.uid, signedIn.localId);
  return { uid: claims.uid, phoneNumber, claims };
}

function makeEmulatorUser(account) {
  return {
    uid: account.uid,
    async getIdTokenResult() {
      return { claims: account.claims };
    }
  };
}

test("Auth Emulator issues phone OTP tokens for Student A and B and the transition helper clears A before B opens", { timeout: 20000 }, async () => {
  const adminApp = initializeApp({ projectId: PROJECT }, "student-switch-admin");
  const adminAuth = getAdminAuth(adminApp);
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

  async function applyEmulatedAuthState(user) {
    const version = ++state.authStateVersion;
    const previousUid = state.currentUser?.uid || null;

    // Mirrors the production listener's fail-closed order. The separate
    // portal source-order test verifies the real listener calls this helper
    // before awaiting getIdTokenResult().
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

    if (!user) return;

    const token = await user.getIdTokenResult();
    if (version !== state.authStateVersion) return;
    const provider = token.claims?.firebase?.sign_in_provider || null;
    tokenChecks.push({
      uid: user.uid,
      provider,
      studentAccess: hasStudentPhoneSignIn(token.claims)
    });
    if (!hasStudentPhoneSignIn(token.claims)) {
      rejectedUids.add(user.uid);
      return;
    }

    state.currentUser = user;
    ui.workspace.hidden = false;
    ui.login.hidden = true;
    ui.logoutButton.hidden = false;
    ui.view.children = ["workspace:" + user.uid];
  }

  const phoneA = "+16505550101";
  const phoneB = "+16505550102";
  let accountA = null;
  let accountB = null;

  try {
    accountA = await signInAsEmulatorPhone(adminAuth, phoneA);
    assert.equal(accountA.claims.firebase?.sign_in_provider, "phone");
    assert.equal(hasStudentPhoneSignIn(accountA.claims), true);
    await applyEmulatedAuthState(makeEmulatorUser(accountA));

    assert.equal(state.currentUser?.uid, accountA.uid);
    assert.equal(ui.workspace.hidden, false, "Student A's verified phone token should open the student workspace");

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

    await applyEmulatedAuthState(null);
    assert.equal(previousExamDestroyed, true);
    assert.equal(state.currentUser, null);
    assert.equal(state.currentTestId, null);
    assert.equal(ui.workspace.hidden, true);
    assert.equal(ui.login.hidden, false);
    assert.deepEqual(ui.view.children, []);

    accountB = await signInAsEmulatorPhone(adminAuth, phoneB);
    assert.notEqual(accountA.uid, accountB.uid, "Student B must be a different Firebase account");
    assert.equal(accountB.claims.firebase?.sign_in_provider, "phone");
    assert.equal(hasStudentPhoneSignIn(accountB.claims), true);

    await applyEmulatedAuthState(makeEmulatorUser(accountB));
    const studentBTransition = [...snapshots].reverse().find(item => item.uid === accountB.uid);
    assert.ok(studentBTransition, "the transition harness observed Student B");
    assert.equal(studentBTransition.workspaceHidden, true);
    assert.deepEqual(studentBTransition.viewChildren, []);
    assert.equal(studentBTransition.previousUid, null);
    assert.equal(studentBTransition.currentTestId, null);

    const studentAToken = tokenChecks.find(item => item.uid === accountA.uid);
    const studentBToken = tokenChecks.find(item => item.uid === accountB.uid);
    assert.equal(studentAToken.provider, "phone");
    assert.equal(studentAToken.studentAccess, true);
    assert.equal(studentBToken.provider, "phone");
    assert.equal(studentBToken.studentAccess, true);
    assert.equal(rejectedUids.has(accountB.uid), false);

    assert.equal(state.currentUser?.uid, accountB.uid);
    assert.equal(ui.workspace.hidden, false, "Student B's workspace should open after the clean transition");
    assert.equal(ui.login.hidden, true);
    assert.deepEqual(ui.view.children, ["workspace:" + accountB.uid]);

    // A slow token refresh for an older auth event must not replace the
    // workspace opened by a newer Student B auth event.
    let releaseLateToken;
    const delayedStudentA = {
      uid: accountA.uid,
      getIdTokenResult() {
        return new Promise(resolve => { releaseLateToken = resolve; });
      }
    };
    const staleStudentARefresh = applyEmulatedAuthState(delayedStudentA);
    assert.equal(typeof releaseLateToken, "function");
    await applyEmulatedAuthState(makeEmulatorUser(accountB));
    releaseLateToken({ claims: accountA.claims });
    await staleStudentARefresh;

    assert.equal(state.currentUser?.uid, accountB.uid,
      "a stale Student A token result must not replace Student B");
    assert.deepEqual(ui.view.children, ["workspace:" + accountB.uid]);
    assert.equal(ui.workspace.hidden, false);
    assert.equal(ui.login.hidden, true);
  } finally {
    if (accountA?.uid) await adminAuth.deleteUser(accountA.uid).catch(() => {});
    if (accountB?.uid) await adminAuth.deleteUser(accountB.uid).catch(() => {});
    await deleteApp(adminApp).catch(() => {});
  }
});
