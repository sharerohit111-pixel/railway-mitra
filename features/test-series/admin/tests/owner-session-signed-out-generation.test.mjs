"use strict";

import test from "node:test";
import assert from "node:assert/strict";
import { watchOwnerSession } from "../owner-session.mjs";

const flush = () => new Promise(resolve => setImmediate(resolve));

function harness(overrides = {}) {
  let listener;
  const calls = { verify: 0, authorized: [], errors: [], signOut: 0 };
  const stop = watchOwnerSession({
    subscribe(callback) { listener = callback; return () => {}; },
    hasPhoneMfa: () => true,
    verifyOwner: async user => {
      calls.verify += 1;
      return { authorized: true, uid: user.uid };
    },
    signOut: async () => { calls.signOut += 1; },
    onAuthorized: user => calls.authorized.push(user.uid),
    onError: error => calls.errors.push(error),
    ...overrides
  });
  return { calls, emit: user => listener(user), stop };
}

test("ignores a late signed-out cleanup rejection after a replacement Owner session starts", async () => {
  let rejectCleanup;
  const h = harness({
    onSignedOut: () => new Promise((resolve, reject) => { rejectCleanup = reject; })
  });

  h.emit(null);
  await flush();
  assert.equal(typeof rejectCleanup, "function");

  const replacement = { uid: "replacement-owner" };
  h.emit(replacement);
  await flush();
  assert.equal(h.calls.verify, 1);
  assert.deepEqual(h.calls.authorized, [replacement.uid]);

  rejectCleanup(new Error("retired signed-out cleanup failed"));
  await flush();

  assert.deepEqual(h.calls.errors, []);
  assert.equal(h.calls.signOut, 0);
  h.stop();
});

test("does not report a signed-out cleanup rejection after the Owner watcher is disposed", async () => {
  let rejectCleanup;
  const h = harness({
    onSignedOut: () => new Promise((resolve, reject) => { rejectCleanup = reject; })
  });

  h.emit(null);
  await flush();
  assert.equal(typeof rejectCleanup, "function");
  h.stop();
  rejectCleanup(new Error("cleanup failed after disposal"));
  await flush();

  assert.deepEqual(h.calls.errors, []);
  assert.equal(h.calls.verify, 0);
  assert.equal(h.calls.signOut, 0);
});
