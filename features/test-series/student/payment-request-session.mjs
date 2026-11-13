const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;
const TEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const STORAGE_PREFIX = "railway-mitra.test-series.payment-request.v1";

function storageKey(testId) {
  if (typeof testId !== "string" || !TEST_ID_PATTERN.test(testId)) {
    throw new Error("A valid test ID is required for payment request storage");
  }
  return STORAGE_PREFIX + ":" + testId;
}

export function requirePaymentSessionStorage(root = globalThis) {
  try {
    const target = root && root.defaultView ? root.defaultView : root;
    const storage = target && target.sessionStorage;
    if (!storage || typeof storage.getItem !== "function" ||
        typeof storage.setItem !== "function" || typeof storage.removeItem !== "function") {
      throw new Error("unavailable");
    }
    return storage;
  } catch {
    throw new Error("Secure session storage is unavailable. Payment checkout is paused to avoid duplicate orders.");
  }
}

/**
 * Reuses the opaque idempotency key for this test in the current browser tab.
 * sessionStorage survives reloads but is isolated from other tabs and users.
 */
export function getOrCreatePaymentRequestId(storage, testId, createId) {
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
    throw new Error("Payment session storage is required");
  }
  if (typeof createId !== "function") throw new Error("A secure payment request ID generator is required");
  const key = storageKey(testId);
  let existing;
  try {
    existing = storage.getItem(key);
  } catch {
    throw new Error("Payment session storage could not be read. Checkout was not started.");
  }
  if (typeof existing === "string" && REQUEST_ID_PATTERN.test(existing)) return existing;

  const requestId = createId();
  if (typeof requestId !== "string" || !REQUEST_ID_PATTERN.test(requestId)) {
    throw new Error("The generated payment request ID is invalid");
  }
  try {
    storage.setItem(key, requestId);
    if (storage.getItem(key) !== requestId) throw new Error("storage verification failed");
  } catch {
    throw new Error("Payment request ID could not be saved. Checkout was not started.");
  }
  return requestId;
}

export function clearPaymentRequestId(storage, testId) {
  if (!storage || typeof storage.removeItem !== "function") {
    throw new Error("Payment session storage is required");
  }
  try {
    storage.removeItem(storageKey(testId));
  } catch {
    throw new Error("The completed failed-request marker could not be cleared. Please reload before retrying.");
  }
}

export function isDefiniteProviderOrderRejection(error) {
  return Boolean(error && error.details && error.details.retryableNewRequest === true);
}
