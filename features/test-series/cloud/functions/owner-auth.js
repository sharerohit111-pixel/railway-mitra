"use strict";

const OWNER_PRIMARY_PROVIDERS = new Set(["google.com", "password"]);

function hasAllowedOwnerPrimaryProvider(token) {
  return Boolean(
    token &&
    token.firebase &&
    OWNER_PRIMARY_PROVIDERS.has(token.firebase.sign_in_provider)
  );
}

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
    hasAllowedOwnerPrimaryProvider(token) &&
    hasVerifiedPhoneMfa(token)
  );
}

module.exports = {
  hasAllowedOwnerPrimaryProvider,
  hasVerifiedPhoneMfa,
  isAuthorizedOwner
};
