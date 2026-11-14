"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  hasAllowedOwnerPrimaryProvider,
  hasVerifiedPhoneMfa,
  isAuthorizedOwner
} = require("../owner-auth");

test("Owner primary sign-in accepts only Google and Email/Password claims", () => {
  for (const provider of ["google.com", "password"]) {
    assert.equal(hasAllowedOwnerPrimaryProvider({
      firebase: { sign_in_provider: provider }
    }), true);
  }

  for (const token of [
    null,
    undefined,
    {},
    { firebase: null },
    { firebase: {} },
    { firebase: { sign_in_provider: "phone" } },
    { firebase: { sign_in_provider: "custom" } },
    { firebase: { sign_in_provider: "anonymous" } },
    { firebase: { sign_in_provider: "" } },
    { firebase: { sign_in_provider: true } }
  ]) {
    assert.equal(hasAllowedOwnerPrimaryProvider(token), false);
  }
});

test("owner MFA accepts only a Firebase phone second-factor claim", () => {
  assert.equal(hasVerifiedPhoneMfa({
    firebase: { sign_in_second_factor: "phone" }
  }), true);
});

test("owner MFA rejects missing, malformed and non-phone factor claims", () => {
  for (const token of [
    null,
    undefined,
    {},
    { firebase: null },
    { firebase: {} },
    { firebase: { sign_in_second_factor: "totp" } },
    { firebase: { sign_in_second_factor: "" } },
    { firebase: { sign_in_second_factor: true } }
  ]) {
    assert.equal(hasVerifiedPhoneMfa(token), false);
  }
});

test("Owner authorization requires exact UID, Google or password primary sign-in, and phone MFA", () => {
  for (const provider of ["google.com", "password"]) {
    const token = {
      firebase: {
        sign_in_provider: provider,
        sign_in_second_factor: "phone"
      }
    };
    assert.equal(isAuthorizedOwner({
      uid: "owner-123",
      ownerUid: "owner-123",
      token
    }), true);
  }

  const phoneMfaOnly = { firebase: { sign_in_second_factor: "phone" } };
  assert.equal(isAuthorizedOwner({
    uid: "owner-123",
    ownerUid: "owner-123",
    token: phoneMfaOnly
  }), false, "a missing primary provider must not authorize the Owner");

  for (const provider of ["phone", "custom", "anonymous"]) {
    assert.equal(isAuthorizedOwner({
      uid: "owner-123",
      ownerUid: "owner-123",
      token: {
        firebase: {
          sign_in_provider: provider,
          sign_in_second_factor: "phone"
        }
      }
    }), false, provider + " is not an allowed Owner primary provider");
  }

  const validToken = {
    firebase: {
      sign_in_provider: "google.com",
      sign_in_second_factor: "phone"
    }
  };
  assert.equal(isAuthorizedOwner({ uid: "student-456", ownerUid: "owner-123", token: validToken }), false);
  assert.equal(isAuthorizedOwner({ uid: "owner-123", ownerUid: "other-owner", token: validToken }), false);
  assert.equal(isAuthorizedOwner({ uid: "owner-123", ownerUid: "", token: validToken }), false);
  assert.equal(isAuthorizedOwner({ uid: "owner-123", ownerUid: undefined, token: validToken }), false);
  assert.equal(isAuthorizedOwner({
    uid: "owner-123",
    ownerUid: "owner-123",
    token: { firebase: { sign_in_provider: "google.com", sign_in_second_factor: "totp" } }
  }), false);
  assert.equal(isAuthorizedOwner({ uid: "", ownerUid: "owner-123", token: validToken }), false);
  assert.equal(isAuthorizedOwner({ uid: null, ownerUid: "owner-123", token: validToken }), false);
});
