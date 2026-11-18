import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getCurrentOwnerForMfa,
  runOwnerPhoneMfaEnrollment
} from "../owner-mfa-session.mjs";

const adminAuth = readFileSync(new URL("../admin-auth.js", import.meta.url), "utf8");

function createEnrollmentHarness({ switchAt = null, failAt = null } = {}) {
  const owner = { uid: "owner-123" };
  const other = { uid: "student-456" };
  const auth = { currentUser: owner };
  const calls = [];
  let cleared = 0;
  const maybeSwitch = stage => {
    if (switchAt === stage) auth.currentUser = other;
    if (failAt === stage) throw new Error(`failed at ${stage}`);
  };
  const operation = runOwnerPhoneMfaEnrollment({
    auth,
    getSession: async user => { calls.push(["getSession", user]); maybeSwitch("getSession"); return "mfa-session"; },
    sendPhoneChallenge: async session => { calls.push(["sendPhoneChallenge", session]); maybeSwitch("sendPhoneChallenge"); return "verification-id"; },
    requestOtp: async () => { calls.push(["requestOtp"]); maybeSwitch("requestOtp"); return "123456"; },
    createCredential: (verificationId, otp) => { calls.push(["createCredential", verificationId, otp]); return "credential"; },
    enrollFactor: async (user, credential) => { calls.push(["enrollFactor", user, credential]); maybeSwitch("enrollFactor"); },
    clearVerifier: () => { cleared += 1; }
  });
  return { operation, auth, owner, other, calls, get cleared() { return cleared; } };
}

test("returns the current Owner only when the original UID still matches", () => {
  const user = { uid: "owner-123" };
  assert.equal(getCurrentOwnerForMfa({ currentUser: user }, "owner-123"), user);
});

test("fails closed after sign-out or an account switch", () => {
  assert.throws(() => getCurrentOwnerForMfa({ currentUser: null }, "owner-123"), /account changed/);
  assert.throws(() => getCurrentOwnerForMfa({ currentUser: { uid: "student-456" } }, "owner-123"), /account changed/);
});

test("rejects invalid Auth and expected-UID inputs", () => {
  assert.throws(() => getCurrentOwnerForMfa(null, "owner-123"), /Auth instance/);
  assert.throws(() => getCurrentOwnerForMfa({}, "  "), /original Owner UID/);
});

test("completes enrollment against the original Owner and clears the verifier", async () => {
  const h = createEnrollmentHarness();
  const result = await h.operation;
  assert.equal(result, h.owner);
  assert.deepEqual(h.calls.map(call => call[0]), [
    "getSession", "sendPhoneChallenge", "requestOtp", "createCredential", "enrollFactor"
  ]);
  assert.equal(h.calls.find(call => call[0] === "enrollFactor")[1], h.owner);
  assert.equal(h.cleared, 1);
});

for (const stage of ["getSession", "sendPhoneChallenge", "requestOtp"]) {
  test(`stops before enrollment when the account changes during ${stage}`, async () => {
    const h = createEnrollmentHarness({ switchAt: stage });
    await assert.rejects(h.operation, /account changed/);
    assert.equal(h.calls.some(call => call[0] === "enrollFactor"), false);
    assert.equal(h.cleared, 1);
  });
}

test("uses the captured Owner object even if auth changes while Firebase enrolls", async () => {
  const h = createEnrollmentHarness({ switchAt: "enrollFactor" });
  await assert.rejects(h.operation, /account changed/);
  const enrollCall = h.calls.find(call => call[0] === "enrollFactor");
  assert.equal(enrollCall[1], h.owner, "never enroll the currently signed-in replacement account");
  assert.equal(h.cleared, 1);
});

test("clears the verifier when an earlier Firebase step fails", async () => {
  const h = createEnrollmentHarness({ failAt: "sendPhoneChallenge" });
  await assert.rejects(h.operation, /failed at sendPhoneChallenge/);
  assert.equal(h.cleared, 1);
});

test("admin-auth delegates MFA enrollment through the UID-bound orchestration helper", () => {
  assert.match(adminAuth, /import \{ runOwnerPhoneMfaEnrollment \} from "\.\/owner-mfa-session\.mjs"/);
  const start = adminAuth.indexOf("export async function enrollOwnerPhoneMfa");
  const end = adminAuth.indexOf("export function hasPhoneMfa", start);
  const body = adminAuth.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(body, /return runOwnerPhoneMfaEnrollment\(/);
  assert.match(body, /getSession: user => multiFactor\(user\)\.getSession\(\)/);
  assert.match(body, /enrollFactor: \(user, credential\) => multiFactor\(user\)\.enroll/);
  assert.doesNotMatch(body, /multiFactor\(auth\.currentUser\)\.enroll/);
});
