import { app, auth } from "../cloud/firebase-app-check-init.js";
import { RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { clearStudentRecaptchaVerifier, getStudentRecaptchaVerifier } from "../cloud/student-recaptcha.mjs";
import { initStudentTestCatalogue } from "./catalogue.js";
import { initStudentCbtExam } from "./exam.js";
import { initStudentDashboard } from "./dashboard.js";
import { initStudentLeaderboard } from "./leaderboard.js";
import { invalidateStudentPortalSession } from "./session-transition.mjs";
import { shouldApplyStudentViewError } from "./view-error-fence.mjs";
import { createStudentOtpFlowGuard } from "./otp-flow-guard.mjs";
import { setStudentOtpControlsLocked, shouldUnlockStudentOtpControls } from "./otp-control-state.mjs";
import { createStudentLogoutRecovery } from "./logout-recovery.mjs";

const el = id => document.getElementById(id);
const login = el("rm-portal-login"), workspace = el("rm-portal-app"), view = el("rm-portal-view");
const authStatus = el("rm-portal-auth-status"), portalStatus = el("rm-portal-status");
const portalState = {
  currentUser: null,
  currentTestId: null,
  activeView: "catalogue",
  authStateVersion: 0,
  viewRequestVersion: 0,
  activeExamController: null
};
const otpFlow = createStudentOtpFlowGuard();
const logoutRecovery = createStudentLogoutRecovery(() => window.localStorage);
const retrySignOutButton = el("rm-student-retry-signout");
let confirmation = null, confirmationVersion = null;

function setOtpControlsLocked(locked) {
  setStudentOtpControlsLocked({
    sendButton: el("rm-student-send-otp"),
    verifyButton: el("rm-student-verify-otp")
  }, locked);
}
function unlockOtpControlsIfSignedOut() {
  const signedOut = shouldUnlockStudentOtpControls(auth.currentUser);
  // An authenticated replacement session is owned by onAuthStateChanged.
  // Do not unlock it while its phone-provider claim may still be pending.
  if (signedOut) setOtpControlsLocked(false);
  return signedOut;
}
function setPostSignOutStatus() {
  const signedOut = unlockOtpControlsIfSignedOut();
  authStatus.textContent = signedOut
    ? "You have signed out."
    : "A different authenticated session is active or being verified. Its access check remains in control.";
}
async function retryPendingSignOut() {
  const retryingUid = auth.currentUser?.uid || null;
  // A stale retry button must never sign out a replacement account. The marker
  // is bound to the UID whose earlier sign-out could not be confirmed.
  if (!retryingUid || !logoutRecovery.shouldBlock(retryingUid)) {
    if (!retryingUid) {
      logoutRecovery.clear();
      setPostSignOutStatus();
    } else {
      retrySignOutButton.hidden = true;
      authStatus.textContent = "The pending sign-out belongs to a different session. The current account will be checked independently.";
    }
    retrySignOutButton.hidden = true;
    return;
  }

  setBusy(retrySignOutButton, true, "Retrying sign out…");
  try {
    await signOut(auth);
    if (auth.currentUser?.uid === retryingUid) {
      retrySignOutButton.disabled = false;
      retrySignOutButton.textContent = "Retry sign out";
      authStatus.textContent = "Sign-out is still unconfirmed. Keep this page open and retry.";
      return;
    }
    logoutRecovery.clear();
    retrySignOutButton.hidden = true;
    setPostSignOutStatus();
  } catch (error) {
    if (auth.currentUser?.uid === retryingUid) {
      retrySignOutButton.disabled = false;
      retrySignOutButton.textContent = "Retry sign out";
      authStatus.textContent = error.message || "Sign-out is still unconfirmed. Keep this page open and retry.";
      return;
    }
    logoutRecovery.clear();
    retrySignOutButton.hidden = true;
    setPostSignOutStatus();
  }
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  if (label) button.textContent = label;
}
function getRecaptcha() {
  return getStudentRecaptchaVerifier(
    auth,
    "rm-student-recaptcha",
    (instance, containerId) => new RecaptchaVerifier(instance, containerId, { size: "invisible" })
  );
}
function isCurrentStudentSession(version, uid) {
  return version === portalState.authStateVersion && Boolean(uid) && auth.currentUser?.uid === uid && portalState.currentUser?.uid === uid;
}

function showViewSafely(name) {
  // showView increments its request version synchronously before its first await.
  // Capture both the expected view generation and authenticated student identity
  // so an old network failure cannot overwrite a newer view or signed-out screen.
  const expectedRequestVersion = portalState.viewRequestVersion + 1;
  const sessionVersion = portalState.authStateVersion;
  const sessionUid = portalState.currentUser?.uid;
  return showView(name).catch(error => {
    if (!shouldApplyStudentViewError({
      expectedRequestVersion,
      currentRequestVersion: portalState.viewRequestVersion,
      isSessionActive: () => isCurrentStudentSession(sessionVersion, sessionUid)
    })) return;
    portalStatus.textContent = error.message || "Student view could not be opened.";
  });
}

async function showView(name) {
  const requestVersion = ++portalState.viewRequestVersion;
  const sessionVersion = portalState.authStateVersion;
  const sessionUid = portalState.currentUser?.uid;
  if (!isCurrentStudentSession(sessionVersion, sessionUid)) return;
  portalState.activeExamController?.destroy();
  portalState.activeExamController = null;
  portalState.activeView = name;
  document.querySelectorAll("[data-view]").forEach(button => button.classList.toggle("active", button.dataset.view === name));
  view.replaceChildren();
  portalStatus.textContent = "";
  if (name === "catalogue") {
    const response = await fetch("./catalogue.html");
    const markup = await response.text();
    if (!response.ok) throw new Error("Test catalogue could not be loaded.");
    if (requestVersion !== portalState.viewRequestVersion || !isCurrentStudentSession(sessionVersion, sessionUid)) return;
    view.innerHTML = markup;
    await initStudentTestCatalogue({ app, studentUid: sessionUid, root: document,
      isSessionActive: () => requestVersion === portalState.viewRequestVersion && isCurrentStudentSession(sessionVersion, sessionUid),
      onStart: async ({ test }) => {
      if (requestVersion !== portalState.viewRequestVersion || !isCurrentStudentSession(sessionVersion, sessionUid)) return;
      portalState.currentTestId = test.testId;
      await showExam(test);
    }});
    if (requestVersion !== portalState.viewRequestVersion || !isCurrentStudentSession(sessionVersion, sessionUid)) return;
  } else if (name === "dashboard") {
    const response = await fetch("./dashboard.html");
    const markup = await response.text();
    if (!response.ok) throw new Error("Student results could not be loaded.");
    if (requestVersion !== portalState.viewRequestVersion || !isCurrentStudentSession(sessionVersion, sessionUid)) return;
    view.innerHTML = markup;
    // initStudentDashboard owns the single refresh listener; do not attach a
    // second handler here or each click will issue duplicate dashboard requests.
    await initStudentDashboard({ app, root: document,
      isSessionActive: () => requestVersion === portalState.viewRequestVersion && isCurrentStudentSession(sessionVersion, sessionUid),
      onLeaderboard: testId => {
      if (requestVersion !== portalState.viewRequestVersion || !isCurrentStudentSession(sessionVersion, sessionUid)) return;
      portalState.currentTestId = testId;
      showViewSafely("leaderboard");
    }});
    if (requestVersion !== portalState.viewRequestVersion || !isCurrentStudentSession(sessionVersion, sessionUid)) return;
  } else if (name === "leaderboard") {
    const testId = portalState.currentTestId;
    if (!testId) throw new Error("Submit or select a test before opening its leaderboard.");
    const response = await fetch("./leaderboard.html");
    const markup = await response.text();
    if (!response.ok) throw new Error("Leaderboard screen could not be loaded.");
    if (requestVersion !== portalState.viewRequestVersion || !isCurrentStudentSession(sessionVersion, sessionUid)) return;
    view.innerHTML = markup;
    const back = document.createElement("button");
    back.type = "button";
    back.className = "rm-portal-back";
    back.textContent = "← Back to My Results";
    back.addEventListener("click", () => showViewSafely("dashboard"));
    view.prepend(back);
    await initStudentLeaderboard({ app, testId, root: document,
      isSessionActive: () => requestVersion === portalState.viewRequestVersion && isCurrentStudentSession(sessionVersion, sessionUid)
    });
    if (requestVersion !== portalState.viewRequestVersion || !isCurrentStudentSession(sessionVersion, sessionUid)) return;
  } else if (name === "exam") {
    const testId = portalState.currentTestId;
    if (!testId) throw new Error("Select a test before opening the exam.");
    const response = await fetch("./exam.html");
    const testMarkup = await response.text();
    if (!response.ok) throw new Error("Exam screen could not be loaded.");
    if (requestVersion !== portalState.viewRequestVersion || !isCurrentStudentSession(sessionVersion, sessionUid)) return;
    view.innerHTML = testMarkup;
    const back = document.createElement("button");
    back.type = "button";
    back.className = "rm-portal-back";
    back.textContent = "← Back to Available Tests";
    back.addEventListener("click", () => showViewSafely("catalogue"));
    view.prepend(back);
    portalState.activeExamController = initStudentCbtExam({ app, testId, studentUid: sessionUid, root: document });
  }
}
async function showExam(test) {
  portalState.currentTestId = test.testId;
  await showViewSafely("exam");
}
async function openWorkspace(user) {
  portalState.currentUser = user;
  login.hidden = true;
  workspace.hidden = false;
  el("rm-portal-logout").hidden = false;
  el("rm-student-account").textContent = user.phoneNumber || "Verified student";
  await showViewSafely("catalogue");
  if (!isCurrentStudentSession(portalState.authStateVersion, user.uid)) return;
}
async function sendOtp() {
  const button = el("rm-student-send-otp");
  const phone = el("rm-student-phone").value.trim();
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    authStatus.textContent = "Enter a valid phone number with country code, for example +91XXXXXXXXXX.";
    return;
  }
  if (otpFlow.isSending()) {
    authStatus.textContent = "An OTP request is already in progress. Please wait.";
    return;
  }
  if (otpFlow.isVerifying()) {
    authStatus.textContent = "OTP verification is in progress. Please wait.";
    return;
  }
  const requestVersion = otpFlow.begin();
  if (!requestVersion) return;
  confirmation = null;
  confirmationVersion = null;
  el("rm-student-otp-panel").hidden = true;
  setBusy(button, true, "Sending OTP…");
  try {
    const nextConfirmation = await signInWithPhoneNumber(auth, phone, getRecaptcha());
    if (!otpFlow.isCurrent(requestVersion)) return;
    confirmation = nextConfirmation;
    confirmationVersion = requestVersion;
    el("rm-student-otp-panel").hidden = false;
    authStatus.textContent = "OTP sent. Enter the 6-digit code to continue.";
  } catch (error) {
    if (!otpFlow.isCurrent(requestVersion)) return;
    authStatus.textContent = error.message || "OTP could not be sent. Please retry.";
    clearStudentRecaptchaVerifier(auth);
  } finally {
    // Release only this request's lock; a stale completion cannot unlock a newer request.
    otpFlow.finishSend(requestVersion);
    if (otpFlow.isCurrent(requestVersion)) setBusy(button, false, "Send OTP");
  }
}
async function verifyOtp() {
  const button = el("rm-student-verify-otp"), code = el("rm-student-otp").value.trim();
  const requestVersion = confirmationVersion;
  const activeConfirmation = confirmation;
  if (!activeConfirmation || !otpFlow.isCurrent(requestVersion) || !/^\d{6}$/.test(code)) {
    authStatus.textContent = "Enter the 6-digit OTP sent to your phone.";
    return;
  }
  if (!otpFlow.beginVerification(requestVersion)) {
    authStatus.textContent = "OTP verification is already in progress. Please wait.";
    return;
  }
  // Lock both controls while Firebase confirms the code. A second SMS request
  // must not supersede a confirmation that may already be signing the user in.
  setOtpControlsLocked(true);
  setBusy(button, true, "Verifying…");
  try {
    await activeConfirmation.confirm(code);
    if (!otpFlow.isCurrent(requestVersion)) return;
    authStatus.textContent = "Phone verified.";
  } catch (error) {
    if (!otpFlow.isCurrent(requestVersion)) return;
    authStatus.textContent = error.message || "OTP verification failed.";
  } finally {
    if (otpFlow.finishVerification(requestVersion) && otpFlow.isCurrent(requestVersion)) {
      setOtpControlsLocked(false);
      setBusy(button, false, "Verify & Sign in");
    }
  }
}

el("rm-student-send-otp").addEventListener("click", sendOtp);
el("rm-student-verify-otp").addEventListener("click", verifyOtp);
const logoutButton = el("rm-portal-logout");
retrySignOutButton.addEventListener("click", retryPendingSignOut);
logoutButton.addEventListener("click", async () => {
  const signingOutUid = auth.currentUser?.uid || null;
  // Invalidate pending OTP promises before starting any asynchronous logout work.
  otpFlow.invalidate();
  // Lock and clear the previous student's workspace synchronously, before
  // waiting for Firebase signOut or its asynchronous auth-state callback.
  invalidateStudentPortalSession(portalState, {
    workspace,
    login,
    logoutButton,
    view
  });
  confirmation = null;
  confirmationVersion = null;
  el("rm-student-otp-panel").hidden = true;
  el("rm-student-otp").value = "";
  clearStudentRecaptchaVerifier(auth);

  setOtpControlsLocked(true);
  authStatus.textContent = "Signing out…";
  try {
    await signOut(auth);
    logoutRecovery.clear();
    retrySignOutButton.hidden = true;
    setPostSignOutStatus();
  } catch (error) {
    // Do not allow a new OTP flow to race an unconfirmed logout. Persist a
    // same-UID lock so a restored Firebase session cannot reopen the workspace.
    if (signingOutUid && auth.currentUser?.uid === signingOutUid) {
      const persisted = logoutRecovery.block(signingOutUid);
      retrySignOutButton.hidden = false;
      retrySignOutButton.disabled = false;
      retrySignOutButton.textContent = "Retry sign out";
      authStatus.textContent = persisted
        ? (error.message || "Sign-out could not be confirmed. Retry sign out before continuing.")
        : "Sign-out could not be confirmed. Keep this page open and retry; session-lock storage is unavailable.";
    } else {
      logoutRecovery.clear();
      retrySignOutButton.hidden = true;
      setPostSignOutStatus();
    }
  }
});
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => {
  showViewSafely(button.dataset.view);
}));

onAuthStateChanged(auth, async user => {
  otpFlow.invalidate();
  clearStudentRecaptchaVerifier(auth);
  confirmation = null;
  confirmationVersion = null;
  const version = ++portalState.authStateVersion;
  invalidateStudentPortalSession(portalState, {
    workspace,
    login,
    logoutButton: el("rm-portal-logout"),
    view
  });
  if (!user) {
    logoutRecovery.clear();
    retrySignOutButton.hidden = true;
    setOtpControlsLocked(false);
    return;
  }

  if (logoutRecovery.shouldBlock(user.uid)) {
    retrySignOutButton.hidden = false;
    retrySignOutButton.disabled = false;
    retrySignOutButton.textContent = "Retry sign out";
    setOtpControlsLocked(true);
    authStatus.textContent = "A previous sign-out is still unconfirmed. Retry sign out to unlock student access.";
    return;
  }
  retrySignOutButton.hidden = true;
  // Keep OTP controls locked until this incoming Firebase identity has been
  // checked. An auth-state event fires as soon as confirm() signs in, before
  // getIdTokenResult() has resolved its provider claim.
  setOtpControlsLocked(true);

  try {
    const token = await user.getIdTokenResult();
    if (version !== portalState.authStateVersion || auth.currentUser?.uid !== user.uid) return;
    if (token.claims?.firebase?.sign_in_provider !== "phone") {
      authStatus.textContent = "Student access requires mobile OTP sign-in. Enter your phone number to continue.";
      setOtpControlsLocked(false);
      return;
    }
    await openWorkspace(user);
  } catch (error) {
    if (version !== portalState.authStateVersion || auth.currentUser?.uid !== user.uid) return;
    authStatus.textContent = error.message || "Student session could not be verified.";
    setOtpControlsLocked(false);
  }
});
