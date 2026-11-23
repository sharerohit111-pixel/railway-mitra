"use strict";

/**
 * Keeps Owner MFA reCAPTCHA instances scoped to the Firebase Auth object and
 * DOM container that created them. Clear the verifier after each challenge
 * flow so a failed/consumed challenge cannot poison the next Owner sign-in.
 */
const verifierByAuth = new WeakMap();

function isObject(value) {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

export function getOwnerRecaptchaVerifier(auth, containerId, createVerifier) {
  if (!isObject(auth)) throw new TypeError("A Firebase Auth instance is required");
  if (typeof containerId !== "string" || !containerId.trim()) {
    throw new TypeError("A reCAPTCHA container ID is required");
  }
  if (typeof createVerifier !== "function") throw new TypeError("A verifier factory is required");

  const current = verifierByAuth.get(auth);
  if (current && current.containerId === containerId) return current.verifier;
  if (current) clearOwnerRecaptchaVerifier(auth);

  const verifier = createVerifier(auth, containerId);
  if (!isObject(verifier)) throw new TypeError("The reCAPTCHA verifier factory returned no verifier");
  verifierByAuth.set(auth, { containerId, verifier });
  return verifier;
}

export function clearOwnerRecaptchaVerifier(auth) {
  if (!isObject(auth)) return false;
  const current = verifierByAuth.get(auth);
  if (!current) return false;

  // Delete before calling Firebase so a clear() exception cannot preserve stale state.
  verifierByAuth.delete(auth);
  try {
    if (typeof current.verifier.clear === "function") current.verifier.clear();
  } catch (_) {
    // Cleanup is best-effort; preserve the original MFA flow error.
  }
  return true;
}
