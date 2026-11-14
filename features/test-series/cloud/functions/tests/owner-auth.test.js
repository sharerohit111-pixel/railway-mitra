"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { hasVerifiedPhoneMfa, isAuthorizedOwner } = require("../owner-auth");

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

test("Owner authorization requires the exact configured UID and verified phone MFA", () => {
  const token = { firebase: { sign_in_second_factor: "phone" } };
  assert.equal(isAuthorizedOwner({ uid: "owner-123", ownerUid: "owner-123", token }), true);
  assert.equal(isAuthorizedOwner({ uid: "student-456", ownerUid: "owner-123", token }), false);
  assert.equal(isAuthorizedOwner({ uid: "owner-123", ownerUid: "other-owner", token }), false);
  assert.equal(isAuthorizedOwner({ uid: "owner-123", ownerUid: "", token }), false);
  assert.equal(isAuthorizedOwner({ uid: "owner-123", ownerUid: undefined, token }), false);
  assert.equal(isAuthorizedOwner({
    uid: "owner-123",
    ownerUid: "owner-123",
    token: { firebase: { sign_in_second_factor: "totp" } }
  }), false);
  assert.equal(isAuthorizedOwner({ uid: "", ownerUid: "owner-123", token }), false);
  assert.equal(isAuthorizedOwner({ uid: null, ownerUid: "owner-123", token }), false);
});
