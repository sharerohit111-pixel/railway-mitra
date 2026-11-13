function hasStudentPhoneSignIn(token) {
  return Boolean(token && token.firebase && token.firebase.sign_in_provider === "phone");
}

function hasStudentAccess(token, env = {}) {
  if (hasStudentPhoneSignIn(token)) return true;
  return env.FUNCTIONS_EMULATOR === "true" &&
    env.TEST_SERIES_ALLOW_CUSTOM_AUTH_FOR_EMULATOR === "true" &&
    Boolean(token && token.firebase && token.firebase.sign_in_provider === "custom");
}

module.exports = { hasStudentPhoneSignIn, hasStudentAccess };
