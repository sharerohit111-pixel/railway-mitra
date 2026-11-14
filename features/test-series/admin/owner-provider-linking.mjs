"use strict";

const SUPPORTED_PROVIDER_IDS = new Set(["google.com", "password"]);

export async function linkOwnerProvider({
  currentUser,
  providerId,
  link
} = {}) {
  if (!currentUser || typeof currentUser.uid !== "string" || !currentUser.uid.trim()) {
    throw new Error("An authenticated Owner account is required before linking a provider.");
  }
  if (!SUPPORTED_PROVIDER_IDS.has(providerId)) {
    throw new Error("Only Google and Email/Password providers can be linked.");
  }
  if (typeof link !== "function") throw new TypeError("link must be a function");

  const originalUid = currentUser.uid;
  const alreadyLinked = Array.isArray(currentUser.providerData)
    && currentUser.providerData.some(provider => provider && provider.providerId === providerId);
  if (alreadyLinked) {
    return { user: currentUser, linked: false, reason: "already-linked" };
  }

  const result = await link(currentUser);
  const linkedUser = result && result.user ? result.user : result;
  if (!linkedUser || linkedUser.uid !== originalUid) {
    throw new Error("Provider linking did not preserve the original Owner UID.");
  }
  const verified = Array.isArray(linkedUser.providerData)
    && linkedUser.providerData.some(provider => provider && provider.providerId === providerId);
  if (!verified) {
    throw new Error("Firebase did not confirm the requested provider on the Owner account.");
  }
  return { user: linkedUser, linked: true, reason: "linked" };
}
