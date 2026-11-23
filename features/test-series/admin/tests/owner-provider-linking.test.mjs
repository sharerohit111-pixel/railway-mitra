"use strict";

import test from "node:test";
import assert from "node:assert/strict";
import { assertOwnerLinkSession, linkOwnerProvider } from "../owner-provider-linking.mjs";
import { readFileSync } from "node:fs";

const owner = () => ({
  uid: "configured-owner-uid",
  providerData: [{ providerId: "password" }]
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test("links Google only when Firebase keeps the same UID and confirms the provider", async () => {
  const currentUser = owner();
  const auth = { currentUser };
  const linkedUser = {
    uid: currentUser.uid,
    providerData: [...currentUser.providerData, { providerId: "google.com" }]
  };
  const result = await linkOwnerProvider({
    auth,
    currentUser,
    providerId: "google.com",
    link: async user => {
      assert.equal(user, currentUser);
      return { user: linkedUser };
    }
  });
  assert.equal(result.linked, true);
  assert.equal(result.user.uid, currentUser.uid);
});

test("does not attempt to link a provider already present on the account", async () => {
  const currentUser = {
    uid: "owner",
    providerData: [{ providerId: "google.com" }]
  };
  const result = await linkOwnerProvider({
    auth: { currentUser },
    currentUser,
    providerId: "google.com",
    link: async () => assert.fail("link must not be called")
  });
  assert.equal(result.linked, false);
  assert.equal(result.reason, "already-linked");
});

test("rejects a provider link that resolves to a different Firebase UID", async () => {
  const currentUser = owner();
  await assert.rejects(
    linkOwnerProvider({
      auth: { currentUser },
      currentUser,
      providerId: "google.com",
      link: async () => ({
        uid: "different-uid",
        providerData: [{ providerId: "google.com" }]
      })
    }),
    /did not preserve the original Owner UID/
  );
});

test("rejects a result that does not confirm the linked provider", async () => {
  const currentUser = owner();
  await assert.rejects(
    linkOwnerProvider({
      auth: { currentUser },
      currentUser,
      providerId: "google.com",
      link: async user => ({ uid: user.uid, providerData: user.providerData })
    }),
    /did not confirm the requested provider/
  );
});

test("rejects unsupported providers and unauthenticated callers", async () => {
  const currentUser = owner();
  await assert.rejects(
    linkOwnerProvider({
      auth: { currentUser },
      currentUser,
      providerId: "phone",
      link: async () => owner()
    }),
    /Only Google and Email/
  );
  await assert.rejects(
    linkOwnerProvider({
      auth: { currentUser: null },
      currentUser: null,
      providerId: "google.com",
      link: async () => owner()
    }),
    /authenticated Owner/
  );
});

test("provider-link completion is accepted only while the initiating Owner UID remains active", () => {
  const ownerUser = { uid: "configured-owner-uid" };
  assert.equal(assertOwnerLinkSession({ currentUser: ownerUser }, ownerUser.uid), ownerUser);
});

test("provider-link completion fails closed after sign-out or account switch", () => {
  assert.throws(
    () => assertOwnerLinkSession({ currentUser: null }, "configured-owner-uid"),
    /account changed during provider linking/
  );
  assert.throws(
    () => assertOwnerLinkSession({ currentUser: { uid: "replacement-user" } }, "configured-owner-uid"),
    /account changed during provider linking/
  );
});

test("a provider popup that completes after an account switch cannot report success", async () => {
  const currentUser = owner();
  const replacementUser = { uid: "replacement-user", providerData: [] };
  const auth = { currentUser };
  const popup = deferred();
  let linkedAgainst = null;

  const operation = linkOwnerProvider({
    auth,
    currentUser,
    providerId: "google.com",
    link(user) {
      linkedAgainst = user;
      return popup.promise;
    }
  });

  auth.currentUser = replacementUser;
  popup.resolve({
    uid: currentUser.uid,
    providerData: [...currentUser.providerData, { providerId: "google.com" }]
  });

  await assert.rejects(operation, /account changed during provider linking/);
  assert.equal(linkedAgainst, currentUser,
    "the Firebase operation remains bound to the original user object");
  assert.equal(auth.currentUser, replacementUser,
    "the replacement account must not be changed by the stale completion");
});

test("a provider link cannot start after the original Owner session has signed out", async () => {
  const currentUser = owner();
  const auth = { currentUser: null };
  let linkCalls = 0;
  await assert.rejects(
    linkOwnerProvider({
      auth,
      currentUser,
      providerId: "google.com",
      link: async () => { linkCalls += 1; return currentUser; }
    }),
    /account changed during provider linking/
  );
  assert.equal(linkCalls, 0);
});

test("both Firebase provider adapters pass the live Auth instance to the UID-bound helper", () => {
  const auth = readFileSync(new URL("../admin-auth.js", import.meta.url), "utf8");
  for (const [name, nextName] of [
    ["export async function linkOwnerGoogleProvider", "export async function linkOwnerEmailProvider"],
    ["export async function linkOwnerEmailProvider", "export { signOut;"]
  ]) {
    const start = auth.indexOf(name);
    const end = auth.indexOf(nextName, start + name.length);
    const body = auth.slice(start, end < 0 ? undefined : end);
    assert.ok(start >= 0, name + " exists");
    assert.match(body, /const currentUser = auth\.currentUser/);
    assert.match(body, /const result = await linkOwnerProvider\(\s*\{\s*auth,/);
  }
});

test("provider linking shares the Owner auth gate and ignores stale status completions", () => {
  const dashboard = readFileSync(new URL("../admin-dashboard.js", import.meta.url), "utf8");
  assert.match(dashboard, /el\("rm-owner-link-google"\),\s*el\("rm-owner-link-email"\)/);
  const start = dashboard.indexOf("async function runOwnerProviderLink");
  const end = dashboard.indexOf('el("rm-owner-link-google").addEventListener', start);
  const body = dashboard.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(body, /ownerAuthGate\.run\(operation\)/);
  assert.match(body, /auth\.currentUser\?\.uid !== ownerUid/);
  assert.match(dashboard, /runOwnerProviderLink\([\s\S]*?linkOwnerGoogleProvider\(auth\)/);
  assert.match(dashboard, /runOwnerProviderLink\([\s\S]*?linkOwnerEmailProvider\(auth,/);
});
