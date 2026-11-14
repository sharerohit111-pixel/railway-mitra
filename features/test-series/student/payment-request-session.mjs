const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;
const SAFE_KEY_PART = /^[A-Za-z0-9_-]{1,128}$/;
const STORAGE_PREFIX = "railway-mitra.test-series.payment-request.v1";
const SUBMITTED_PREFIX = "railway-mitra.test-series.payment-submitted.v1";

function storageKey(studentUid, testId, prefix = STORAGE_PREFIX) {
  if (typeof studentUid !== "string" || !SAFE_KEY_PART.test(studentUid)) {
    throw new Error("A valid student account is required for payment session storage");
  }
  if (typeof testId !== "string" || !SAFE_KEY_PART.test(testId)) {
    throw new Error("A valid test ID is required for payment request storage");
  }
  return prefix + ":" + studentUid + ":" + testId;
}

export function requirePaymentSessionStorage(root = globalThis) {
  try {
    const target = root && root.defaultView ? root.defaultView : root;
    const storage = target && target.sessionStorage;
    if (!storage || typeof storage.getItem !== "function" ||
        typeof storage.setItem !== "function" || typeof storage.removeItem !== "function") throw new Error("unavailable");
    return storage;
  } catch {
    throw new Error("Secure session storage is unavailable. Payment checkout is paused to avoid duplicate orders.");
  }
}

export function getOrCreatePaymentRequestId(storage, studentUid, testId, createId) {
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") throw new Error("Payment session storage is required");
  if (typeof createId !== "function") throw new Error("A secure payment request ID generator is required");
  const key = storageKey(studentUid, testId);
  let existing;
  try { existing = storage.getItem(key); }
  catch { throw new Error("Payment session storage could not be read. Checkout was not started."); }
  if (typeof existing === "string" && REQUEST_ID_PATTERN.test(existing)) return existing;
  const requestId = createId();
  if (typeof requestId !== "string" || !REQUEST_ID_PATTERN.test(requestId)) throw new Error("The generated payment request ID is invalid");
  try {
    storage.setItem(key, requestId);
    if (storage.getItem(key) !== requestId) throw new Error("storage verification failed");
  } catch { throw new Error("Payment request ID could not be saved. Checkout was not started."); }
  return requestId;
}

export function markPaymentSubmitted(storage, studentUid, testId) {
  if (!storage || typeof storage.setItem !== "function" || typeof storage.getItem !== "function") throw new Error("Payment session storage is required");
  const key = storageKey(studentUid, testId, SUBMITTED_PREFIX);
  try {
    storage.setItem(key, "1");
    if (storage.getItem(key) !== "1") throw new Error("storage verification failed");
  } catch { throw new Error("Payment status could not be saved. Do not pay again; refresh and check test access."); }
}

export function hasPaymentBeenSubmitted(storage, studentUid, testId) {
  if (!storage || typeof storage.getItem !== "function") return false;
  try { return storage.getItem(storageKey(studentUid, testId, SUBMITTED_PREFIX)) === "1"; }
  catch { return false; }
}

export function clearPaymentSubmitted(storage, studentUid, testId) {
  if (!storage || typeof storage.removeItem !== "function") throw new Error("Payment session storage is required");
  try { storage.removeItem(storageKey(studentUid, testId, SUBMITTED_PREFIX)); }
  catch { throw new Error("The payment status marker could not be cleared. Please reload."); }
}

export function clearPaymentRequestId(storage, studentUid, testId) {
  if (!storage || typeof storage.removeItem !== "function") throw new Error("Payment session storage is required");
  try { storage.removeItem(storageKey(studentUid, testId)); }
  catch { throw new Error("The completed failed-request marker could not be cleared. Please reload before retrying."); }
}

export function isDefiniteProviderOrderRejection(error) {
  return Boolean(error && error.details && error.details.retryableNewRequest === true);
}
