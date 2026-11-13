function hasVerifiedPhoneMfa(token) {
  return Boolean(
    token &&
    token.firebase &&
    token.firebase.sign_in_second_factor === "phone"
  );
}

module.exports = { hasVerifiedPhoneMfa };
