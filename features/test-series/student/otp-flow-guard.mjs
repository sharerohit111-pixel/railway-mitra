/**
 * Guards asynchronous student OTP requests against stale auth/logout transitions.
 * A completion may update the login UI only while its generation remains current.
 * Phone-code verification is single-flight so a new SMS challenge cannot race
 * a Firebase confirmation that may already be establishing the signed-in user.
 */
export function createStudentOtpFlowGuard() {
  let generation = 0;
  let verificationGeneration = null;

  const isCurrent = token => Number.isSafeInteger(token) && token === generation;

  return Object.freeze({
    begin() {
      if (verificationGeneration !== null) return null;
      generation += 1;
      return generation;
    },
    invalidate() {
      generation += 1;
      verificationGeneration = null;
      return generation;
    },
    isCurrent,
    isVerifying() {
      return verificationGeneration !== null;
    },
    beginVerification(token) {
      if (!isCurrent(token) || verificationGeneration !== null) return false;
      verificationGeneration = token;
      return true;
    },
    finishVerification(token) {
      if (verificationGeneration !== token) return false;
      verificationGeneration = null;
      return true;
    }
  });
}
