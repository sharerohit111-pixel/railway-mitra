const { test } = require("node:test");
const assert = require("node:assert/strict");
const { hasStudentPhoneSignIn, hasStudentAccess } = require("../student-auth");

test("student access accepts only Firebase phone-provider sign-in in production", () => {
  assert.equal(hasStudentPhoneSignIn({ firebase: { sign_in_provider: "phone" } }), true);
  assert.equal(hasStudentPhoneSignIn({ firebase: { sign_in_provider: "password" } }), false);
  assert.equal(hasStudentPhoneSignIn({ firebase: { sign_in_provider: "google.com" } }), false);
  assert.equal(hasStudentPhoneSignIn({ firebase: { sign_in_provider: "custom" } }), false);
  assert.equal(hasStudentPhoneSignIn({ firebase: { sign_in_provider: "password", sign_in_second_factor: "phone" } }), false);
  assert.equal(hasStudentPhoneSignIn({ firebase: {} }), false);
  assert.equal(hasStudentPhoneSignIn(null), false);
  assert.equal(hasStudentPhoneSignIn(undefined), false);
});

test("custom-token fixtures are allowed only with both explicit emulator safeguards", () => {
  const customToken = { firebase: { sign_in_provider: "custom" } };
  assert.equal(hasStudentAccess(customToken, {}), false);
  assert.equal(hasStudentAccess(customToken, { FUNCTIONS_EMULATOR: "true" }), false);
  assert.equal(hasStudentAccess(customToken, { TEST_SERIES_ALLOW_CUSTOM_AUTH_FOR_EMULATOR: "true" }), false);
  assert.equal(hasStudentAccess(customToken, {
    FUNCTIONS_EMULATOR: "true",
    TEST_SERIES_ALLOW_CUSTOM_AUTH_FOR_EMULATOR: "true"
  }), true);
  assert.equal(hasStudentAccess(customToken, {
    FUNCTIONS_EMULATOR: "false",
    TEST_SERIES_ALLOW_CUSTOM_AUTH_FOR_EMULATOR: "true"
  }), false);
  assert.equal(hasStudentAccess(customToken, {
    FUNCTIONS_EMULATOR: "true",
    TEST_SERIES_ALLOW_CUSTOM_AUTH_FOR_EMULATOR: "false"
  }), false);
  assert.equal(hasStudentAccess({ firebase: { sign_in_provider: "phone" } }, {}), true);
});
