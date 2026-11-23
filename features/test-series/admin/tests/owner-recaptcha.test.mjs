"use strict";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  clearOwnerRecaptchaVerifier,
  getOwnerRecaptchaVerifier
} from "../owner-recaptcha.mjs";

test("reuses a verifier only for the same Owner Auth instance and container", () => {
  const auth = {};
  const verifier = { clear() {} };
  let created = 0;

  const first = getOwnerRecaptchaVerifier(auth, "rm-admin-recaptcha", () => {
    created += 1;
    return verifier;
  });
  const second = getOwnerRecaptchaVerifier(auth, "rm-admin-recaptcha", () => {
    throw new Error("factory must not run for a cached verifier");
  });

  assert.equal(first, verifier);
  assert.equal(second, verifier);
  assert.equal(created, 1);
});

test("never shares an Owner verifier between Firebase Auth instances", () => {
  const firstAuth = {};
  const secondAuth = {};
  const firstVerifier = {};
  const secondVerifier = {};

  assert.equal(getOwnerRecaptchaVerifier(firstAuth, "rm-admin-recaptcha", () => firstVerifier), firstVerifier);
  assert.equal(getOwnerRecaptchaVerifier(secondAuth, "rm-admin-recaptcha", () => secondVerifier), secondVerifier);
});

test("changing the Owner reCAPTCHA container clears the previous widget", () => {
  const auth = {};
  let clearCount = 0;
  const previous = { clear() { clearCount += 1; } };
  const next = {};

  getOwnerRecaptchaVerifier(auth, "old-owner-container", () => previous);
  assert.equal(getOwnerRecaptchaVerifier(auth, "rm-admin-recaptcha", () => next), next);
  assert.equal(clearCount, 1);
});

test("explicit cleanup invalidates the cache even if Firebase clear throws", () => {
  const auth = {};
  let created = 0;
  const stale = { clear() { throw new Error("widget already detached"); } };
  const fresh = {};

  getOwnerRecaptchaVerifier(auth, "rm-admin-recaptcha", () => stale);
  assert.equal(clearOwnerRecaptchaVerifier(auth), true);
  assert.equal(clearOwnerRecaptchaVerifier(auth), false);
  assert.equal(getOwnerRecaptchaVerifier(auth, "rm-admin-recaptcha", () => {
    created += 1;
    return fresh;
  }), fresh);
  assert.equal(created, 1);
});

test("invalid inputs and failed factories do not leave cached Owner verifier state", () => {
  assert.throws(() => getOwnerRecaptchaVerifier(null, "rm-admin-recaptcha", () => ({})), /Auth instance/);
  assert.throws(() => getOwnerRecaptchaVerifier({}, " ", () => ({})), /container ID/);
  assert.throws(() => getOwnerRecaptchaVerifier({}, "rm-admin-recaptcha", null), /factory/);

  const auth = {};
  assert.throws(() => getOwnerRecaptchaVerifier(auth, "rm-admin-recaptcha", () => {
    throw new Error("construction failed");
  }), /construction failed/);
  const verifier = {};
  assert.equal(getOwnerRecaptchaVerifier(auth, "rm-admin-recaptcha", () => verifier), verifier);
});

test("both Owner MFA sign-in and enrollment clear the verifier after success or failure", () => {
  const source = readFileSync(new URL("../admin-auth.js", import.meta.url), "utf8");
  const helper = readFileSync(new URL("../owner-mfa-session.mjs", import.meta.url), "utf8");
  assert.match(source, /import \{\s*clearOwnerRecaptchaVerifier,\s*getOwnerRecaptchaVerifier\s*\} from "\.\/owner-recaptcha\.mjs"/);
  assert.match(source, /getOwnerRecaptchaVerifier\(\s*auth,\s*"rm-admin-recaptcha",\s*\(instance, containerId\) => new RecaptchaVerifier\(instance, containerId, \{ size: "invisible" \}\)\s*\)/);
  assert.doesNotMatch(source, /let recaptcha\s*=\s*null/);

  const finishStart = source.indexOf("async function finishMfa");
  const finishEnd = source.indexOf("export async function signInOwnerGoogle", finishStart);
  const finishMfa = source.slice(finishStart, finishEnd);
  assert.match(finishMfa, /try \{[\s\S]*finally \{\s*clearOwnerRecaptchaVerifier\(auth\);\s*\}/);

  const enrollStart = source.indexOf("export async function enrollOwnerPhoneMfa");
  const enrollEnd = source.indexOf("export function hasPhoneMfa", enrollStart);
  const enroll = source.slice(enrollStart, enrollEnd);
  assert.match(enroll, /clearVerifier: \(\) => clearOwnerRecaptchaVerifier\(auth\)/);
  assert.match(helper, /finally\s*\{\s*try\s*\{\s*clearVerifier\(\);/);
});
