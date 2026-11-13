// Student phone-only sign-in and CBT callable client.
// Host app must initialize Firebase Auth, Functions and App Check before calling these helpers.
import { RecaptchaVerifier, signInWithPhoneNumber } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";

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
export async function getCbtExamQuestions(app, attemptId) { return (await callable(app, "rmGetExamQuestions")({ attemptId })).data; }
export async function saveCbtAnswer(app, attemptId, questionId, answer) {
  return (await callable(app, "rmSaveAnswer")({ attemptId, questionId, answer })).data;
}
export async function submitCbtExam(app, attemptId) {
  return (await callable(app, "rmSubmitExam")({ attemptId })).data;
}

export async function getCbtAttemptResult(app, attemptId) {
  return (await callable(app, "rmGetCbtAttemptResult")({ attemptId })).data;
}

export async function getStudentActiveCbtAttempt(app, testId) {
  return (await callable(app, "rmGetStudentActiveAttempt")({ testId })).data;
}
export async function claimFreeCbtAttempt(app) {
  return (await callable(app, "rmClaimFreeAttempt")({})).data;
}

// Generate once per deliberate checkout. Keep the returned ID and pass the same
// value to createStudentPaymentOrder again if the network response is lost.
export function createPaymentRequestId() {
  const webCrypto = globalThis.crypto;
  if (!webCrypto || typeof webCrypto.getRandomValues !== "function") {
    throw new Error("Secure browser randomness is required for payment checkout");
  }
  if (typeof webCrypto.randomUUID === "function") return webCrypto.randomUUID();
  const bytes = new Uint8Array(16);
  webCrypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return [...bytes].map((value, index) =>
    (index === 4 || index === 6 || index === 8 || index === 10 ? "-" : "") +
    value.toString(16).padStart(2, "0")
  ).join("");
}

export async function createStudentPaymentOrder(app, testId, requestId) {
  if (typeof requestId !== "string" || !/^[A-Za-z0-9_-]{20,128}$/.test(requestId)) {
    throw new Error("Generate one secure payment request ID and reuse it for retries");
  }
  return (await callable(app, "rmCreatePaymentOrder")({ testId, requestId })).data;
}

export async function listAvailableCbtTests(app) {
  return (await callable(app, "rmListAvailableTests")({})).data;
}

export async function getStudentCbtDashboard(app) {
  return (await callable(app, "rmGetStudentDashboard")({})).data;
}

export async function getCbtTestLeaderboard(app, testId) {
  return (await callable(app, "rmGetTestLeaderboard")({ testId })).data;
}
