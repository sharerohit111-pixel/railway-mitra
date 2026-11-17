/**
 * Keeps invisible reCAPTCHA instances scoped to the Firebase Auth object and
 * DOM container that created them. A failed SMS send clears the instance so a
 * deliberate retry gets a fresh challenge instead of reusing stale state.
 */
const verifierByAuth = new WeakMap();

function isObject(value) {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

export function getStudentRecaptchaVerifier(auth, containerId, createVerifier) {
  if (!isObject(auth)) throw new TypeError("A Firebase Auth instance is required");
  if (typeof containerId !== "string" || !containerId.trim()) {
    throw new TypeError("A reCAPTCHA container ID is required");
  }
  if (typeof createVerifier !== "function") throw new TypeError("A verifier factory is required");

  const current = verifierByAuth.get(auth);
  if (current && current.containerId === containerId) return current.verifier;
  if (current) clearStudentRecaptchaVerifier(auth);

  const verifier = createVerifier(auth, containerId);
  if (!isObject(verifier)) throw new TypeError("The reCAPTCHA verifier factory returned no verifier");
  verifierByAuth.set(auth, { containerId, verifier });
  return verifier;
}

export function clearStudentRecaptchaVerifier(auth) {
  if (!isObject(auth)) return false;
  const current = verifierByAuth.get(auth);
  if (!current) return false;

  // Remove the cache entry before calling Firebase so a clear() exception
  // cannot make the next OTP attempt reuse the stale verifier.
  verifierByAuth.delete(auth);
  try {
    if (typeof current.verifier.clear === "function") current.verifier.clear();
  } catch (_) {
    // Cleanup is best-effort; preserve the original OTP error for the caller.
  }
  return true;
}
