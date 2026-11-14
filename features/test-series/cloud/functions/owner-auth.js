"use strict";

function hasVerifiedPhoneMfa(token) {
  return Boolean(
    token &&
    token.firebase &&
    token.firebase.sign_in_second_factor === "phone"
  );
}

function isAuthorizedOwner({ uid, token, ownerUid } = {}) {
  return Boolean(
    typeof ownerUid === "string" &&
    ownerUid.length > 0 &&
    typeof uid === "string" &&
    uid.length > 0 &&
    uid === ownerUid &&
    hasVerifiedPhoneMfa(token)
  );
}

module.exports = { hasVerifiedPhoneMfa, isAuthorizedOwner };
