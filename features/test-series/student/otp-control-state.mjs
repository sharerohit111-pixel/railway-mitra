const SEND_BUSY_LABEL = "Sending OTP…";
const VERIFY_BUSY_LABEL = "Verifying…";

/**
 * Keep Student OTP controls and their visible labels in sync with the current
 * authentication generation. Unlocking after an auth transition also clears
 * stale in-flight labels left by an invalidated async request.
 */
export function setStudentOtpControlsLocked({ sendButton, verifyButton } = {}, locked) {
  if (!sendButton || !verifyButton) {
    throw new TypeError("Both Student OTP controls are required");
  }
  if (typeof locked !== "boolean") {
    throw new TypeError("The Student OTP lock state must be boolean");
  }

  sendButton.disabled = locked;
  verifyButton.disabled = locked;

  if (!locked) {
    if (sendButton.textContent === SEND_BUSY_LABEL) sendButton.textContent = "Send OTP";
    if (verifyButton.textContent === VERIFY_BUSY_LABEL) verifyButton.textContent = "Verify & Sign in";
  }
  return locked;
}
