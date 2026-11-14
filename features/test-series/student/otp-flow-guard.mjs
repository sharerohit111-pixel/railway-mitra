/**
 * Guards asynchronous student OTP requests against stale auth/logout transitions.
 * A completion may update the login UI only while its generation remains current.
 */
export function createStudentOtpFlowGuard() {
  let generation = 0;

  return Object.freeze({
    begin() {
      generation += 1;
      return generation;
    },
    invalidate() {
      generation += 1;
      return generation;
    },
    isCurrent(token) {
      return Number.isSafeInteger(token) && token === generation;
    }
  });
}
