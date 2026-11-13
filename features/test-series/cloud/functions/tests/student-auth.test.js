const { test } = require("node:test");
const assert = require("node:assert/strict");
const { hasStudentPhoneSignIn } = require("../student-auth");

test("student access accepts only Firebase phone-provider sign-in", () => {
  assert.equal(hasStudentPhoneSignIn({ firebase: { sign_in_provider: "phone" } }), true);
  assert.equal(hasStudentPhoneSignIn({ firebase: { sign_in_provider: "password" } }), false);
  assert.equal(hasStudentPhoneSignIn({ firebase: { sign_in_provider: "google.com" } }), false);
  assert.equal(hasStudentPhoneSignIn({ firebase: { sign_in_provider: "custom" } }), false);
  assert.equal(hasStudentPhoneSignIn({ firebase: { sign_in_provider: "password", sign_in_second_factor: "phone" } }), false);
  assert.equal(hasStudentPhoneSignIn({ firebase: {} }), false);
  assert.equal(hasStudentPhoneSignIn(null), false);
  assert.equal(hasStudentPhoneSignIn(undefined), false);
});
