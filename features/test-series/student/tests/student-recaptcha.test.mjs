import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  clearStudentRecaptchaVerifier,
  getStudentRecaptchaVerifier
} from "../../cloud/student-recaptcha.mjs";

test("reuses one verifier only for the same Auth instance and container", () => {
  const auth = {};
  const verifier = { clear() {} };
  let created = 0;
  const first = getStudentRecaptchaVerifier(auth, "student-recaptcha", () => {
    created += 1;
    return verifier;
  });
  const second = getStudentRecaptchaVerifier(auth, "student-recaptcha", () => {
    throw new Error("factory must not run for a cached verifier");
  });

  assert.equal(first, verifier);
  assert.equal(second, verifier);
  assert.equal(created, 1);
});

test("does not share a verifier between Firebase Auth instances", () => {
  const firstAuth = {};
  const secondAuth = {};
  const firstVerifier = {};
  const secondVerifier = {};

  assert.equal(getStudentRecaptchaVerifier(firstAuth, "student-recaptcha", () => firstVerifier), firstVerifier);
  assert.equal(getStudentRecaptchaVerifier(secondAuth, "student-recaptcha", () => secondVerifier), secondVerifier);
});

test("changing the DOM container clears the old verifier before creating another", () => {
  const auth = {};
  let clearCount = 0;
  const oldVerifier = { clear() { clearCount += 1; } };
  const nextVerifier = {};

  getStudentRecaptchaVerifier(auth, "old-container", () => oldVerifier);
  const actual = getStudentRecaptchaVerifier(auth, "new-container", () => nextVerifier);

  assert.equal(actual, nextVerifier);
  assert.equal(clearCount, 1);
});

test("explicit cleanup invalidates the cache even when Firebase clear throws", () => {
  const auth = {};
  let created = 0;
  const first = { clear() { throw new Error("widget already detached"); } };
  const second = {};

  getStudentRecaptchaVerifier(auth, "student-recaptcha", () => first);
  assert.equal(clearStudentRecaptchaVerifier(auth), true);
  assert.equal(clearStudentRecaptchaVerifier(auth), false);
  assert.equal(getStudentRecaptchaVerifier(auth, "student-recaptcha", () => {
    created += 1;
    return second;
  }), second);
  assert.equal(created, 1);
});

test("invalid inputs and failed factories do not leave cached verifier state", () => {
  assert.throws(() => getStudentRecaptchaVerifier(null, "student-recaptcha", () => ({})), /Auth instance/);
  assert.throws(() => getStudentRecaptchaVerifier({}, " ", () => ({})), /container ID/);
  assert.throws(() => getStudentRecaptchaVerifier({}, "student-recaptcha", null), /factory/);

  const auth = {};
  assert.throws(() => getStudentRecaptchaVerifier(auth, "student-recaptcha", () => {
    throw new Error("construction failed");
  }), /construction failed/);
  const verifier = {};
  assert.equal(getStudentRecaptchaVerifier(auth, "student-recaptcha", () => verifier), verifier);
});

test("student OTP send clears the cached verifier after a failed SMS initiation", () => {
  const source = readFileSync(new URL("../../cloud/student-client.js", import.meta.url), "utf8");
  assert.match(source, /getStudentRecaptchaVerifier[\s\S]*new RecaptchaVerifier/);
  assert.match(
    source,
    /try \{\s*return await signInWithPhoneNumber\(auth, phoneNumber, getVerifier\(auth\)\);\s*\} catch \(error\) \{\s*\/\/ A failed SMS challenge must not leave a consumed\/stale verifier cached\.\s*clearStudentRecaptchaVerifier\(auth\);\s*throw error;\s*\}/
  );
});
