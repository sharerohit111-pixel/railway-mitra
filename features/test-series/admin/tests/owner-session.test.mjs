"use strict";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { watchOwnerSession } from "../owner-session.mjs";

function createHarness(overrides = {}) {
  let listener;
  let unsubscribed = false;
  const calls = { verify: 0, signOut: 0, signOutUsers: [], signedOut: 0, checking: [], mfaRequired: 0, authorized: [], errors: [] };
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
    signOut: async user => { calls.signOut += 1; calls.signOutUsers.push(user); },
    onSignedOut: () => { calls.signedOut += 1; },
    onChecking: user => calls.checking.push(user),
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

test("clears the prior Owner workspace immediately while a new account is being verified", async () => {
  let resolveVerification;
  const user = { uid: "owner-two" };
  const h = createHarness({
    verifyOwner: () => new Promise(resolve => { resolveVerification = resolve; })
  });

  h.emit(user);
  assert.deepEqual(h.calls.checking, [user], "the old dashboard is cleared synchronously on the auth transition");
  assert.equal(h.calls.authorized.length, 0);
  await Promise.resolve();
  assert.equal(typeof resolveVerification, "function");
  resolveVerification({ authorized: true });
  await flush();
  assert.equal(h.calls.authorized.length, 1);
});

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
  const user = { uid: "not-authorized" };
  const h = createHarness({ verifyOwner: async () => ({ authorized: false }) });
  h.emit(user);
  await flush();

  assert.equal(h.calls.authorized.length, 0);
  assert.equal(h.calls.signOut, 1);
  assert.deepEqual(h.calls.signOutUsers, [user]);
  assert.equal(h.calls.errors.length, 1);
});

test("an error-reporting callback cannot prevent sign-out after server authorization is rejected", async () => {
  const user = { uid: "rejected-owner" };
  const h = createHarness({
    verifyOwner: async () => ({ authorized: false }),
    onError: () => { throw new Error("status element unavailable"); }
  });
  h.emit(user);
  await flush();

  assert.equal(h.calls.signOut, 1);
  assert.deepEqual(h.calls.signOutUsers, [user]);
  assert.equal(h.calls.authorized.length, 0);
});

test("signs out when pre-authorization workspace cleanup fails and skips server verification", async () => {
  const user = { uid: "owner-with-cleanup-error" };
  const h = createHarness({
    onChecking: () => { throw new Error("workspace cleanup failed"); }
  });
  h.emit(user);
  await flush();

  assert.equal(h.calls.verify, 0);
  assert.equal(h.calls.signOut, 1);
  assert.deepEqual(h.calls.signOutUsers, [user]);
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

test("ignores an earlier account authorization when the signed-in Owner account changes", async () => {
  let resolveFirst;
  let verifyCalls = 0;
  const firstUser = { uid: "owner-one" };
  const secondUser = { uid: "owner-two" };
  const h = createHarness({
    verifyOwner: user => {
      verifyCalls += 1;
      return user.uid === firstUser.uid
        ? new Promise(resolve => { resolveFirst = resolve; })
        : Promise.resolve({ authorized: true, email: "second@example.test" });
    }
  });

  h.emit(firstUser);
  await Promise.resolve();
  h.emit(secondUser);
  await flush();
  resolveFirst({ authorized: true, email: "first@example.test" });
  await flush();

  assert.equal(verifyCalls, 2);
  assert.equal(h.calls.authorized.length, 1);
  assert.equal(h.calls.authorized[0].user, secondUser);
  assert.equal(h.calls.authorized[0].result.email, "second@example.test");
  assert.equal(h.calls.signOut, 0);
});

test("a stale authorization failure cannot sign out a newer Owner account", async () => {
  let rejectFirst;
  const firstUser = { uid: "owner-one" };
  const secondUser = { uid: "owner-two" };
  const h = createHarness({
    verifyOwner: user => user.uid === firstUser.uid
      ? new Promise((resolve, reject) => { rejectFirst = reject; })
      : Promise.resolve({ authorized: true, email: "second@example.test" })
  });

  h.emit(firstUser);
  await Promise.resolve();
  h.emit(secondUser);
  await flush();
  rejectFirst(new Error("old account verification failed"));
  await flush();

  assert.equal(h.calls.authorized.length, 1);
  assert.equal(h.calls.authorized[0].user, secondUser);
  assert.equal(h.calls.signOut, 0);
});

test("disposing the watcher makes late failures inert and unsubscribes", async () => {
  let rejectVerification;
  const h = createHarness({
    verifyOwner: () => new Promise((resolve, reject) => { rejectVerification = reject; })
  });
  h.emit({ uid: "owner-uid" });
  await Promise.resolve();
  h.stop();
  rejectVerification(new Error("late failure"));
  await flush();

  assert.equal(h.unsubscribed, true);
  assert.equal(h.calls.signOut, 0);
  assert.equal(h.calls.errors.length, 0);
});

test("Owner logout hides privileged content synchronously before awaiting Firebase signOut", async () => {
  const dashboard = readFileSync(new URL("../admin-dashboard.js", import.meta.url), "utf8");
  const logoutStart = dashboard.indexOf('el("rm-owner-logout").addEventListener("click", async () => {');
  const hideHome = dashboard.indexOf("home.hidden = true", logoutStart);
  const hideSetup = dashboard.indexOf("setup.hidden = true", logoutStart);
  const showLogin = dashboard.indexOf("login.hidden = false", logoutStart);
  const clearHistory = dashboard.indexOf("clearPaymentHistory()", logoutStart);
  const signOutCall = dashboard.indexOf("await signOut(auth)", logoutStart);
  const catchBlock = dashboard.indexOf("} catch (error) {", signOutCall);

  assert.ok(logoutStart >= 0, "Owner logout handler exists");
  assert.ok(hideHome > logoutStart && hideHome < signOutCall, "privileged dashboard is hidden before sign-out");
  assert.ok(hideSetup > logoutStart && hideSetup < signOutCall, "MFA setup is hidden before sign-out");
  assert.ok(showLogin > logoutStart && showLogin < signOutCall, "login panel is restored before sign-out");
  assert.ok(clearHistory > logoutStart && clearHistory < signOutCall, "sensitive payment history is cleared before sign-out");
  assert.ok(catchBlock > signOutCall, "sign-out failures are handled without reopening the dashboard");
  assert.match(dashboard.slice(catchBlock, catchBlock + 500), /Owner dashboard remains locked/);
});

test("Owner session adapter signs out only the UID rejected by the current authorization generation", async () => {
  const dashboard = readFileSync(new URL("../admin-dashboard.js", import.meta.url), "utf8");
  assert.match(dashboard, /signOut: expectedUser => \{/);
  assert.match(dashboard, /auth\.currentUser\?\.uid !== expectedUser\.uid/);
  assert.match(dashboard, /if \(expectedUser && auth\.currentUser\?\.uid !== expectedUser\.uid\) return Promise\.resolve\(\)/);
  assert.match(dashboard, /return signOut\(auth\)/);
});


test("fails closed when asynchronous Owner dashboard initialization rejects", async () => {
  const user = { uid: "owner-dashboard-init-failed" };
  const failure = new Error("Owner dashboard initialization failed");
  const h = createHarness({
    onAuthorized: async () => { throw failure; }
  });

  h.emit(user);
  await flush();

  assert.equal(h.calls.authorized.length, 0);
  assert.equal(h.calls.signOut, 1);
  assert.deepEqual(h.calls.signOutUsers, [user]);
  assert.deepEqual(h.calls.errors, [failure]);
});

test("ignores a stale asynchronous dashboard initialization failure after an account switch", async () => {
  let rejectFirstInitialization;
  const firstUser = { uid: "owner-one" };
  const secondUser = { uid: "owner-two" };
  const authorizedUsers = [];
  const h = createHarness({
    onAuthorized: user => {
      if (user.uid === firstUser.uid) {
        return new Promise((resolve, reject) => { rejectFirstInitialization = reject; });
      }
      authorizedUsers.push(user);
    }
  });

  h.emit(firstUser);
  await flush();
  assert.equal(typeof rejectFirstInitialization, "function");

  h.emit(secondUser);
  await flush();
  rejectFirstInitialization(new Error("retired dashboard initialization failed"));
  await flush();

  assert.deepEqual(authorizedUsers, [secondUser]);
  assert.equal(h.calls.signOut, 0);
  assert.equal(h.calls.errors.length, 0);
});
