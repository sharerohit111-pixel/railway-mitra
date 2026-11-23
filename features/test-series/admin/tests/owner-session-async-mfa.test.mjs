"use strict";

import test from "node:test";
import assert from "node:assert/strict";
import { watchOwnerSession } from "../owner-session.mjs";

const flush = () => new Promise(resolve => setImmediate(resolve));

function harness(overrides = {}) {
  let listener;
  const calls = { verify: [], mfaRequired: [], authorized: [], signOut: [], errors: [] };
  const stop = watchOwnerSession({
    subscribe(callback) { listener = callback; return () => {}; },
    hasPhoneMfa: () => true,
    verifyOwner: async user => {
      calls.verify.push(user.uid);
      return { authorized: true, uid: user.uid };
    },
    signOut: async user => { calls.signOut.push(user?.uid || null); },
    onMfaRequired: user => calls.mfaRequired.push(user.uid),
    onAuthorized: user => calls.authorized.push(user.uid),
    onError: error => calls.errors.push(error),
    ...overrides
  });
  return { calls, emit: user => listener(user), stop };
}

test("waits for asynchronous phone-MFA inspection before server authorization", async () => {
  let resolveMfa;
  const user = { uid: "owner-async-mfa" };
  const h = harness({
    hasPhoneMfa: () => new Promise(resolve => { resolveMfa = resolve; })
  });

  h.emit(user);
  await flush();
  assert.equal(typeof resolveMfa, "function");
  assert.deepEqual(h.calls.verify, []);
  assert.deepEqual(h.calls.authorized, []);

  resolveMfa(true);
  await flush();
  assert.deepEqual(h.calls.verify, [user.uid]);
  assert.deepEqual(h.calls.authorized, [user.uid]);
  assert.deepEqual(h.calls.signOut, []);
});

test("routes an asynchronously confirmed missing phone factor to MFA setup", async () => {
  const user = { uid: "owner-needs-mfa" };
  const h = harness({ hasPhoneMfa: async () => false });

  h.emit(user);
  await flush();

  assert.deepEqual(h.calls.mfaRequired, [user.uid]);
  assert.deepEqual(h.calls.verify, []);
  assert.deepEqual(h.calls.authorized, []);
  assert.deepEqual(h.calls.signOut, []);
});

test("fails closed when asynchronous phone-MFA inspection rejects", async () => {
  const user = { uid: "owner-mfa-inspection-failed" };
  const failure = new Error("MFA inspection failed");
  const h = harness({ hasPhoneMfa: async () => { throw failure; } });

  h.emit(user);
  await flush();

  assert.deepEqual(h.calls.verify, []);
  assert.deepEqual(h.calls.authorized, []);
  assert.deepEqual(h.calls.signOut, [user.uid]);
  assert.deepEqual(h.calls.errors, [failure]);
});

test("ignores a delayed MFA result from a retired Owner account", async () => {
  let resolveFirstMfa;
  const firstUser = { uid: "owner-before-switch" };
  const secondUser = { uid: "owner-after-switch" };
  const h = harness({
    hasPhoneMfa: user => user.uid === firstUser.uid
      ? new Promise(resolve => { resolveFirstMfa = resolve; })
      : Promise.resolve(true)
  });

  h.emit(firstUser);
  await flush();
  assert.equal(typeof resolveFirstMfa, "function");

  h.emit(secondUser);
  await flush();
  assert.deepEqual(h.calls.verify, [secondUser.uid]);
  assert.deepEqual(h.calls.authorized, [secondUser.uid]);

  resolveFirstMfa(true);
  await flush();
  assert.deepEqual(h.calls.verify, [secondUser.uid]);
  assert.deepEqual(h.calls.authorized, [secondUser.uid]);
  assert.deepEqual(h.calls.signOut, []);
  assert.deepEqual(h.calls.errors, []);
  h.stop();
});
