/**
 * Guards asynchronous student OTP requests against stale auth/logout transitions.
 * A completion may update the login UI only while its generation remains current.
 * SMS sends and phone-code verification are single-flight so duplicate challenges
 * cannot race a Firebase confirmation or replace its active session.
 */
export function createStudentOtpFlowGuard() {
  let generation = 0;
  let sendingGeneration = null;
  let verificationGeneration = null;

  const isCurrent = token => Number.isSafeInteger(token) && token > 0 && token === generation;

  return Object.freeze({
    begin() {
      if (sendingGeneration !== null || verificationGeneration !== null) return null;
      generation += 1;
      sendingGeneration = generation;
      return generation;
    },
    finishSend(token) {
      if (!isCurrent(token) || sendingGeneration !== token) return false;
      sendingGeneration = null;
      return true;
    },
    invalidate() {
      generation += 1;
      sendingGeneration = null;
      verificationGeneration = null;
      return generation;
    },
    isCurrent,
    isSending() {
      return sendingGeneration !== null;
    },
    isVerifying() {
      return verificationGeneration !== null;
    },
    beginVerification(token) {
      if (!isCurrent(token) || sendingGeneration !== null || verificationGeneration !== null) return false;
      verificationGeneration = token;
      return true;
    },
    finishVerification(token) {
      if (!isCurrent(token) || verificationGeneration !== token) return false;
      verificationGeneration = null;
      return true;
    }
  });
}
