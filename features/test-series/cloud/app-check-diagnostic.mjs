/**
 * Keep the App Check diagnostic limited to a real initialized web App Check
 * instance. The isolated Firebase Emulator intentionally skips web App Check.
 */
export function canRunAppCheckDiagnostic(mode, appCheck) {
  return mode === "production" && appCheck !== null && appCheck !== undefined;
}

/**
 * Expose only a bounded Firebase error code in the diagnostic UI/log. Provider
 * messages may contain URLs or request details and are not needed by operators.
 */
export function safeAppCheckDiagnosticErrorCode(error) {
  const code = error && typeof error.code === "string" ? error.code : "";
  return /^[A-Za-z0-9][A-Za-z0-9/_-]{0,119}$/.test(code)
    ? code
    : "unknown-error";
}
