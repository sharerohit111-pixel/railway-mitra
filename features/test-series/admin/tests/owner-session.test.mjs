"use strict";

import test from "node:test";
import assert from "node:assert/strict";
import { watchOwnerSession } from "../owner-session.mjs";

function createHarness(overrides = {}) {
  let listener;
  let unsubscribed = false;
  const calls = { verify: 0, signOut: 0, signedOut: 0, mfaRequired: 0, authorized: [], errors: [] };
  const stop = watchOwnerSession({
    subscribe(callback) {
      listener = callback;
      return () => { unsubscribed = true; };
    },
    hasPhoneMfa: () => true,
    verifyOwner: async () => {
      calls.verify += 1;
      return { authorized: true, email: "owner@example.test" };
    },
    signOut: async () => { calls.signOut += 1; },
    onSignedOut: () => { calls.signedOut += 1; },
    onMfaRequired: () => { calls.mfaRequired += 1; },
    onAuthorized: (user, result) => calls.authorized.push({ user, result }),
    onError: error => calls.errors.push(error),
    ...overrides
  });
  return {
    calls,
    emit(user) { listener(user); },
    stop,
    get unsubscribed() { return unsubscribed; }
  };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

test("restores a persisted Owner session only after server authorization", async () => {
  const h = createHarness();
  const user = { uid: "owner-uid", email: "owner@example.test" };
  h.emit(user);
  await flush();

  assert.equal(h.calls.verify, 1);
  assert.equal(h.calls.authorized.length, 1);
  assert.equal(h.calls.authorized[0].user, user);
  assert.equal(h.calls.authorized[0].result.authorized, true);
  assert.equal(h.calls.signOut, 0);
});

test("requires phone MFA enrollment before calling the Owner authorization endpoint", async () => {
  const user = { uid: "owner-uid" };
  const h = createHarness({ hasPhoneMfa: () => false });
  h.emit(user);
  await flush();

  assert.equal(h.calls.mfaRequired, 1);
  assert.equal(h.calls.verify, 0);
  assert.equal(h.calls.authorized.length, 0);
});

test("signs out a restored session when the server rejects Owner authorization", async () => {
  const h = createHarness({ verifyOwner: async () => ({ authorized: false }) });
  h.emit({ uid: "not-authorized" });
  await flush();

  assert.equal(h.calls.authorized.length, 0);
  assert.equal(h.calls.signOut, 1);
  assert.equal(h.calls.errors.length, 1);
});

test("does not reveal the dashboard when a pending authorization finishes after sign-out", async () => {
  let resolveVerification;
  const h = createHarness({
    verifyOwner: () => new Promise(resolve => { resolveVerification = resolve; })
  });
  h.emit({ uid: "owner-uid" });
  await Promise.resolve();
  h.emit(null);
  resolveVerification({ authorized: true, email: "owner@example.test" });
  await flush();

  assert.equal(h.calls.signedOut, 1);
  assert.equal(h.calls.authorized.length, 0);
  assert.equal(h.calls.signOut, 0);
});

test("disposing the portal watcher cancels pending UI authorization and unsubscribes", async () => {
  let resolveVerification;
  const h = createHarness({
    verifyOwner: () => new Promise(resolve => { resolveVerification = resolve; })
  });
  h.emit({ uid: "owner-uid" });
  await Promise.resolve();
  h.stop();
  resolveVerification({ authorized: true });
  await flush();

  assert.equal(h.unsubscribed, true);
  assert.equal(h.calls.authorized.length, 0);
});
