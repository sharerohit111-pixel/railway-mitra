"use strict";

/**
 * Resolve the same Firebase principal that started Owner phone-MFA enrollment.
 * Never continue an enrollment after sign-out or an account switch.
 */
export function getCurrentOwnerForMfa(auth, expectedUid) {
  if (!auth || (typeof auth !== "object" && typeof auth !== "function")) {
    throw new TypeError("A Firebase Auth instance is required");
  }
  if (typeof expectedUid !== "string" || !expectedUid.trim()) {
    throw new TypeError("The original Owner UID is required");
  }

  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid !== expectedUid) {
    throw new Error("Owner account changed during phone MFA enrollment. Sign in again and restart enrollment.");
  }
  return currentUser;
}

/**
 * Run Owner phone-MFA enrollment while binding every async step to one UID.
 * Firebase-specific operations are injected so account-switch races are unit-testable.
 */
export async function runOwnerPhoneMfaEnrollment({
  auth,
  getSession,
  sendPhoneChallenge,
  requestOtp,
  createCredential,
  enrollFactor,
  clearVerifier
} = {}) {
  const initialUser = auth?.currentUser;
  if (!initialUser?.uid) throw new Error("पहले Owner अकाउंट से लॉगिन करें।");

  const callbacks = { getSession, sendPhoneChallenge, requestOtp, createCredential, enrollFactor, clearVerifier };
  for (const [name, callback] of Object.entries(callbacks)) {
    if (typeof callback !== "function") throw new TypeError(`${name} must be a function`);
  }

  const ownerUid = initialUser.uid;
  try {
    const session = await getSession(initialUser);
    getCurrentOwnerForMfa(auth, ownerUid);

    const verificationId = await sendPhoneChallenge(session);
    getCurrentOwnerForMfa(auth, ownerUid);

    const otp = await requestOtp();
    const currentOwner = getCurrentOwnerForMfa(auth, ownerUid);
    const credential = createCredential(verificationId, otp);
    await enrollFactor(currentOwner, credential);

    // Do not let a completion for the previous account appear successful in a
    // newly authenticated account's Owner UI.
    getCurrentOwnerForMfa(auth, ownerUid);
    return currentOwner;
  } finally {
    try {
      clearVerifier();
    } catch (_) {
      // Cleanup is best-effort and must not mask the enrollment/auth error.
    }
  }
}
