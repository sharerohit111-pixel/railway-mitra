function hasStudentPhoneSignIn(token) {
  return Boolean(token && token.firebase && token.firebase.sign_in_provider === "phone");
}

module.exports = { hasStudentPhoneSignIn };
