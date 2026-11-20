"use strict";

import test from "node:test";
import assert from "node:assert/strict";
import { assertOwnerLinkSession, linkOwnerProvider } from "../owner-provider-linking.mjs";
import { readFileSync } from "node:fs";

const owner = () => ({
  uid: "configured-owner-uid",
  providerData: [{ providerId: "password" }]
});

test("links Google only when Firebase keeps the same UID and confirms the provider", async () => {
  const currentUser = owner();
  const linkedUser = {
    uid: currentUser.uid,
    providerData: [...currentUser.providerData, { providerId: "google.com" }]
  };
  const result = await linkOwnerProvider({
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
    currentUser,
    providerId: "google.com",
    link: async () => assert.fail("link must not be called")
  });
  assert.equal(result.linked, false);
  assert.equal(result.reason, "already-linked");
});

test("rejects a provider link that resolves to a different Firebase UID", async () => {
  await assert.rejects(
    linkOwnerProvider({
      currentUser: owner(),
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
  await assert.rejects(
    linkOwnerProvider({
      currentUser: owner(),
      providerId: "google.com",
      link: async user => ({ uid: user.uid, providerData: user.providerData })
    }),
    /did not confirm the requested provider/
  );
});

test("rejects unsupported providers and unauthenticated callers", async () => {
  await assert.rejects(
    linkOwnerProvider({ currentUser: owner(), providerId: "phone", link: async () => owner() }),
    /Only Google and Email/
  );
  await assert.rejects(
    linkOwnerProvider({ currentUser: null, providerId: "google.com", link: async () => owner() }),
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

test("both Firebase provider adapters verify the initiating UID after the async link resolves", () => {
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
    assert.match(body, /const result = await linkOwnerProvider\(/);
    assert.match(body, /assertOwnerLinkSession\(auth, currentUser\.uid\)/);
    assert.ok(body.indexOf("assertOwnerLinkSession(auth, currentUser.uid)") > body.indexOf("await linkOwnerProvider("),
      name + " must re-check the session after Firebase linking completes");
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
