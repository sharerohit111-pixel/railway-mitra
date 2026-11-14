"use strict";

import test from "node:test";
import assert from "node:assert/strict";
import { linkOwnerProvider } from "../owner-provider-linking.mjs";

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
