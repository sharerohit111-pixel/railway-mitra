import { app, auth } from "../cloud/firebase-app-check-init.js";
import { RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { initStudentTestCatalogue } from "./catalogue.js";
import { initStudentCbtExam } from "./exam.js";
import { initStudentDashboard } from "./dashboard.js";
import { invalidateStudentPortalSession } from "./session-transition.mjs";
import { createStudentOtpFlowGuard } from "./otp-flow-guard.mjs";
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
let confirmation = null, confirmationVersion = null, recaptcha = null;

function setOtpControlsLocked(locked) {
  el("rm-student-send-otp").disabled = locked;
  el("rm-student-verify-otp").disabled = locked;
}
async function retryPendingSignOut() {
  setBusy(retrySignOutButton, true, "Retrying sign out…");
  try {
    await signOut(auth);
    logoutRecovery.clear();
    retrySignOutButton.hidden = true;
    authStatus.textContent = "You have signed out.";
    setOtpControlsLocked(false);
  } catch (error) {
    retrySignOutButton.disabled = false;
    retrySignOutButton.textContent = "Retry sign out";
    authStatus.textContent = error.message || "Sign-out is still unconfirmed. Keep this page open and retry.";
  }
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  if (label) button.textContent = label;
}
function getRecaptcha() {
  if (!recaptcha) recaptcha = new RecaptchaVerifier(auth, "rm-student-recaptcha", { size: "invisible" });
  return recaptcha;
}
function isCurrentStudentSession(version, uid) {
  return version === portalState.authStateVersion && Boolean(uid) && auth.currentUser?.uid === uid && portalState.currentUser?.uid === uid;
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
    await initStudentTestCatalogue({ app, studentUid: sessionUid, root: document, onStart: async ({ test }) => {
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
    await initStudentDashboard({ app, root: document });
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
    back.addEventListener("click", () => showView("catalogue"));
    view.prepend(back);
    portalState.activeExamController = initStudentCbtExam({ app, testId, studentUid: sessionUid, root: document });
  }
}
async function showExam(test) {
  portalState.currentTestId = test.testId;
  await showView("exam");
}
async function openWorkspace(user) {
  portalState.currentUser = user;
  login.hidden = true;
  workspace.hidden = false;
  el("rm-portal-logout").hidden = false;
  el("rm-student-account").textContent = user.phoneNumber || "Verified student";
  await showView("catalogue");
  if (!isCurrentStudentSession(portalState.authStateVersion, user.uid)) return;
}
async function sendOtp() {
  const button = el("rm-student-send-otp");
  const phone = el("rm-student-phone").value.trim();
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    authStatus.textContent = "Enter a valid phone number with country code, for example +91XXXXXXXXXX.";
    return;
  }
  const requestVersion = otpFlow.begin();
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
    if (recaptcha) { try { recaptcha.clear(); } catch (_) {} recaptcha = null; }
  } finally {
    // A stale request must never re-enable controls after logout or an auth change.
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
  setBusy(button, true, "Verifying…");
  try {
    await activeConfirmation.confirm(code);
    if (!otpFlow.isCurrent(requestVersion)) return;
    authStatus.textContent = "Phone verified.";
  } catch (error) {
    if (!otpFlow.isCurrent(requestVersion)) return;
    authStatus.textContent = error.message || "OTP verification failed.";
  } finally {
    if (otpFlow.isCurrent(requestVersion)) setBusy(button, false, "Verify & Sign in");
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
  confirmation = null;
  confirmationVersion = null;
  // Lock and clear the previous student's workspace synchronously, before
  // waiting for Firebase signOut or its asynchronous auth-state callback.
  invalidateStudentPortalSession(portalState, {
    workspace,
    login,
    logoutButton,
    view
  });
  el("rm-student-otp-panel").hidden = true;
  el("rm-student-otp").value = "";
  if (recaptcha) {
    try { recaptcha.clear(); } catch (_) {}
    recaptcha = null;
  }

  const sendOtpButton = el("rm-student-send-otp");
  const verifyOtpButton = el("rm-student-verify-otp");
  sendOtpButton.disabled = true;
  verifyOtpButton.disabled = true;
  authStatus.textContent = "Signing out…";
  try {
    await signOut(auth);
    authStatus.textContent = "You have signed out.";
    sendOtpButton.disabled = false;
    verifyOtpButton.disabled = false;
  } catch (error) {
    // Do not allow a new OTP flow to race an unconfirmed sign-out.
    authStatus.textContent = error.message || "Sign-out could not be confirmed. The student workspace remains locked; reload before signing in again.";
  }
});
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => {
  showView(button.dataset.view).catch(error => { portalStatus.textContent = error.message; });
}));

onAuthStateChanged(auth, async user => {
  otpFlow.invalidate();
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
  setOtpControlsLocked(false);

  try {
    const token = await user.getIdTokenResult();
    if (version !== portalState.authStateVersion || auth.currentUser?.uid !== user.uid) return;
    if (token.claims?.firebase?.sign_in_provider !== "phone") {
      authStatus.textContent = "Student access requires mobile OTP sign-in. Enter your phone number to continue.";
      return;
    }
    await openWorkspace(user);
  } catch (error) {
    if (version !== portalState.authStateVersion) return;
    authStatus.textContent = error.message || "Student session could not be verified.";
  }
});
