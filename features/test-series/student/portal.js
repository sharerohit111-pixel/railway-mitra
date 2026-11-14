import { app, auth } from "../cloud/firebase-app-check-init.js";
import { RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { initStudentTestCatalogue } from "./catalogue.js";
import { initStudentCbtExam } from "./exam.js";
import { initStudentDashboard } from "./dashboard.js";
import { invalidateStudentPortalSession } from "./session-transition.mjs";

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
let confirmation = null, recaptcha = null;

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
  setBusy(button, true, "Sending OTP…");
  try {
    confirmation = await signInWithPhoneNumber(auth, phone, getRecaptcha());
    el("rm-student-otp-panel").hidden = false;
    authStatus.textContent = "OTP sent. Enter the 6-digit code to continue.";
  } catch (error) {
    authStatus.textContent = error.message || "OTP could not be sent. Please retry.";
    if (recaptcha) { try { recaptcha.clear(); } catch (_) {} recaptcha = null; }
  } finally {
    setBusy(button, false, "Send OTP");
  }
}
async function verifyOtp() {
  const button = el("rm-student-verify-otp"), code = el("rm-student-otp").value.trim();
  if (!confirmation || !/^\d{6}$/.test(code)) {
    authStatus.textContent = "Enter the 6-digit OTP sent to your phone.";
    return;
  }
  setBusy(button, true, "Verifying…");
  try {
    await confirmation.confirm(code);
    authStatus.textContent = "Phone verified.";
  } catch (error) {
    authStatus.textContent = error.message || "OTP verification failed.";
  } finally {
    setBusy(button, false, "Verify & Sign in");
  }
}

el("rm-student-send-otp").addEventListener("click", sendOtp);
el("rm-student-verify-otp").addEventListener("click", verifyOtp);
el("rm-portal-logout").addEventListener("click", async () => {
  portalState.activeExamController?.destroy();
  portalState.activeExamController = null;
  await signOut(auth);
  portalState.currentUser = null;
  portalState.currentTestId = null;
  workspace.hidden = true;
  login.hidden = false;
  el("rm-portal-logout").hidden = true;
  authStatus.textContent = "You have signed out.";
});
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => {
  showView(button.dataset.view).catch(error => { portalStatus.textContent = error.message; });
}));

onAuthStateChanged(auth, async user => {
  const version = ++portalState.authStateVersion;
  invalidateStudentPortalSession(portalState, {
    workspace,
    login,
    logoutButton: el("rm-portal-logout"),
    view
  });
  if (!user) return;

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
