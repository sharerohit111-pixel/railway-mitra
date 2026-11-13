"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { hasVerifiedPhoneMfa } = require("../owner-auth");

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
