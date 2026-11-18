import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../portal.js", import.meta.url), "utf8");

test("student portal uses the shared Auth-scoped reCAPTCHA verifier", () => {
  assert.ok(source.includes(
    'import { clearStudentRecaptchaVerifier, getStudentRecaptchaVerifier } from "../cloud/student-recaptcha.mjs";'
  ));
  assert.match(
    source,
    /function getRecaptcha\(\)\s*\{\s*return getStudentRecaptchaVerifier\(\s*auth,\s*"rm-student-recaptcha",\s*\(instance, containerId\) => new RecaptchaVerifier\(instance, containerId, \{ size: "invisible" \}\)\s*\);\s*\}/
  );
  assert.doesNotMatch(source, /let confirmation\s*=\s*null,\s*confirmationVersion\s*=\s*null,\s*recaptcha\s*=\s*null/);
  assert.doesNotMatch(source, /recaptcha\.clear\(\)/);
});

test("failed SMS initiation invalidates the cached student verifier", () => {
  const start = source.indexOf("async function sendOtp()");
  const end = source.indexOf("async function verifyOtp()");
  assert.ok(start >= 0 && end > start);
  const sendOtpSource = source.slice(start, end);
  assert.match(sendOtpSource, /clearStudentRecaptchaVerifier\(auth\)/);
});

test("logout clears the verifier before asynchronous sign-out", () => {
  const start = source.indexOf('logoutButton.addEventListener("click"');
  const end = source.indexOf('document.querySelectorAll("[data-view]")');
  assert.ok(start >= 0 && end > start);
  const logoutSource = source.slice(start, end);
  assert.ok(logoutSource.indexOf("clearStudentRecaptchaVerifier(auth)") < logoutSource.indexOf("await signOut(auth)"));
});

test("every Firebase auth-state transition clears the previous verifier", () => {
  const start = source.indexOf("onAuthStateChanged(auth, async user => {");
  assert.ok(start >= 0);
  const authStateSource = source.slice(start, start + 900);
  assert.match(authStateSource, /otpFlow\.invalidate\(\);\s*clearStudentRecaptchaVerifier\(auth\);/);
});
