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

test("custom-token fixtures require the explicit flag and isolated demo-project emulator signature", () => {
  const customToken = { firebase: { sign_in_provider: "custom" } };
  const isolatedEmulator = {
    FUNCTIONS_EMULATOR: "true",
    GCLOUD_PROJECT: "demo-railway-mitra-cbt"
  };

  assert.equal(hasStudentAccess(customToken, {}), false);
  assert.equal(hasStudentAccess(customToken, { FUNCTIONS_EMULATOR: "true" }), false);
  assert.equal(hasStudentAccess(customToken, {
    ...isolatedEmulator,
    TEST_SERIES_ALLOW_CUSTOM_AUTH_FOR_EMULATOR: "false"
  }), false);
  assert.equal(hasStudentAccess(customToken, {
    ...isolatedEmulator,
    TEST_SERIES_ALLOW_CUSTOM_AUTH_FOR_EMULATOR: "true"
  }), true);

  assert.equal(hasStudentAccess(customToken, {
    FUNCTIONS_EMULATOR: "true",
    GCLOUD_PROJECT: "railway-mitra",
    TEST_SERIES_ALLOW_CUSTOM_AUTH_FOR_EMULATOR: "true"
  }), false);

  assert.equal(hasStudentAccess(customToken, {
    ...isolatedEmulator,
    K_SERVICE: "asia-south1-rmStartExam",
    K_REVISION: "1",
    TEST_SERIES_ALLOW_CUSTOM_AUTH_FOR_EMULATOR: "true"
  }), true);

  for (const runtime of [
    { K_SERVICE: "railway-mitra-test-series" },
    { K_REVISION: "railway-mitra-test-series-00001-abc" },
    { K_CONFIGURATION: "railway-mitra-test-series" },
    {
      K_SERVICE: "asia-south1-rmStartExam",
      K_REVISION: "1",
      K_CONFIGURATION: "railway-mitra-test-series"
    }
  ]) {
    assert.equal(hasStudentAccess(customToken, {
      ...isolatedEmulator,
      ...runtime,
      TEST_SERIES_ALLOW_CUSTOM_AUTH_FOR_EMULATOR: "true"
    }), false);
  }
});

test("real phone-provider sign-in remains accepted independently of emulator configuration", () => {
  assert.equal(hasStudentAccess({ firebase: { sign_in_provider: "phone" } }, {}), true);
  assert.equal(hasStudentAccess({ firebase: { sign_in_provider: "phone" } }, {
    FUNCTIONS_EMULATOR: "true",
    GCLOUD_PROJECT: "railway-mitra",
    TEST_SERIES_ALLOW_CUSTOM_AUTH_FOR_EMULATOR: "true",
    K_SERVICE: "railway-mitra-test-series",
    K_REVISION: "railway-mitra-test-series-00001-abc"
  }), true);
});
