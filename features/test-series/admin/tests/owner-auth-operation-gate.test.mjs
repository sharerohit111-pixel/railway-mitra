"use strict";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createOwnerAuthOperationGate } from "../owner-auth-operation-gate.mjs";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const dashboard = readFileSync(new URL("../admin-dashboard.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../admin-dashboard.html", import.meta.url), "utf8");

test("only one Owner provider/MFA operation may remain pending at a time", async () => {
  const gate = createOwnerAuthOperationGate();
  const pending = deferred();
  let firstCalls = 0;
  let secondCalls = 0;

  const first = gate.run(() => {
    firstCalls += 1;
    return pending.promise;
  });
  assert.equal(gate.isPending(), true);
  assert.throws(() => gate.run(() => { secondCalls += 1; }), /already in progress/);
  assert.equal(firstCalls, 1);
  assert.equal(secondCalls, 0);

  pending.resolve("verified");
  assert.equal(await first, "verified");
  assert.equal(gate.isPending(), false);
  assert.equal(await gate.run(async () => "retry"), "retry");
});

test("a rejected OTP/login operation releases the gate for a deliberate retry", async () => {
  const gate = createOwnerAuthOperationGate();
  const pending = deferred();
  const first = gate.run(() => pending.promise);
  pending.reject(new Error("OTP cancelled"));
  await assert.rejects(first, /OTP cancelled/);
  assert.equal(gate.isPending(), false);
  assert.equal(await gate.run(() => "new attempt"), "new attempt");
});

test("a synchronous operation error also releases the gate", async () => {
  const gate = createOwnerAuthOperationGate();
  assert.throws(() => gate.run(() => { throw new Error("popup failed"); }), /popup failed/);
  assert.equal(gate.isPending(), false);
  assert.equal(await gate.run(() => "recovered"), "recovered");
});

test("invalid operations are rejected without locking the gate", () => {
  const gate = createOwnerAuthOperationGate();
  assert.throws(() => gate.run(null), /authentication operation/);
  assert.equal(gate.isPending(), false);
});

test("Google, Email and enrollment share one gate and disable competing entry buttons", () => {
  assert.match(dashboard, /import \{ createOwnerAuthOperationGate \} from "\.\/owner-auth-operation-gate\.mjs"/);
  assert.match(dashboard, /const ownerAuthGate = createOwnerAuthOperationGate\(\)/);
  assert.match(dashboard, /async function runOwnerAuthOperation\(/);
  assert.match(dashboard, /ownerAuthButtons\.forEach\(button => \{ button\.disabled = true; \}\)/);
  assert.match(dashboard, /ownerAuthGate\.run\(operation\)/);
  assert.match(dashboard, /runOwnerAuthOperation\([\s\S]*?signInOwnerGoogle/);
  assert.match(dashboard, /runOwnerAuthOperation\([\s\S]*?signInOwnerEmail/);
  assert.match(dashboard, /runOwnerAuthOperation\([\s\S]*?enrollOwnerPhoneMfa/);
});

test("OTP prompt cannot be overwritten and can be explicitly cancelled", () => {
  assert.match(dashboard, /if \(pendingVerification\)\s*\{\s*reject\(new Error\("An Owner OTP challenge is already active/);
  assert.match(dashboard, /function cancelPendingOtp\([\s\S]*?pendingVerification = null;[\s\S]*?pending\.reject\(new Error\(message\)\)/);
  assert.match(dashboard, /el\("rm-owner-otp-cancel"\)\.addEventListener\("click"/);
  assert.match(html, /id="rm-owner-otp-cancel"[^>]*>Cancel sign-in<\/button>/);
});

test("Owner Auth transitions cancel a pending OTP prompt before session UI handling", () => {
  for (const marker of ["onChecking: () => {", "onSignedOut: () => {", "onMfaRequired: () => {", "onAuthorized: (user, authorization) => {"]) {
    const start = dashboard.indexOf(marker);
    const next = dashboard.indexOf("\n    },", start);
    assert.ok(start >= 0 && next > start, marker + " callback exists");
    assert.ok(dashboard.slice(start, next).includes("cancelPendingOtp();"), marker + " cancels the previous prompt");
  }
});
