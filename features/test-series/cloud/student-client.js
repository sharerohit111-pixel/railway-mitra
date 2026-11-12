// Student phone-only sign-in and CBT callable client.
// Host app must initialize Firebase Auth, Functions and App Check before calling these helpers.
import { RecaptchaVerifier, signInWithPhoneNumber } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";

let verifier = null;
function getVerifier(auth, containerId = "rm-student-recaptcha") {
  if (!verifier) verifier = new RecaptchaVerifier(auth, containerId, { size: "invisible" });
  return verifier;
}
export async function sendStudentOtp(auth, phoneNumber) {
  if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber)) throw new Error("मोबाइल नंबर country code सहित लिखें, जैसे +91XXXXXXXXXX");
  return signInWithPhoneNumber(auth, phoneNumber, getVerifier(auth));
}
export async function verifyStudentOtp(confirmation, code) {
  if (!/^\d{6}$/.test(code)) throw new Error("6 अंकों का OTP दर्ज करें।");
  return confirmation.confirm(code);
}
function callable(app, name) { return httpsCallable(getFunctions(app, "asia-south1"), name); }
export async function startCbtExam(app, testId) { return (await callable(app, "rmStartExam")({ testId })).data; }
export async function saveCbtAnswer(app, attemptId, questionId, answer) {
  return (await callable(app, "rmSaveAnswer")({ attemptId, questionId, answer })).data;
}
export async function submitCbtExam(app, attemptId) {
  return (await callable(app, "rmSubmitExam")({ attemptId })).data;
}
export async function claimFreeCbtAttempt(app) {
  return (await callable(app, "rmClaimFreeAttempt")({})).data;
}
