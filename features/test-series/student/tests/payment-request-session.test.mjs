"use strict";

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  requirePaymentSessionStorage,
  getOrCreatePaymentRequestId,
  clearPaymentRequestId,
  isDefiniteProviderOrderRejection,
  markPaymentSubmitted,
  hasPaymentBeenSubmitted,
  clearPaymentSubmitted
} from "../payment-request-session.mjs";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}

const validId = "d8a2f0c6-1c3b-4a75-9e2f-1b7a6c8d9e10";

test("reuses the same request ID for reload-safe retries in the same session", () => {
  const storage = memoryStorage();
  let generated = 0;
  const createId = () => { generated += 1; return validId; };
  assert.equal(getOrCreatePaymentRequestId(storage, "student_a", "test_1", createId), validId);
  assert.equal(getOrCreatePaymentRequestId(storage, "student_a", "test_1", createId), validId);
  assert.equal(generated, 1);
});

test("isolates request IDs by test and rejects malformed IDs", () => {
  const storage = memoryStorage();
  assert.equal(getOrCreatePaymentRequestId(storage, "student_a", "test_1", () => validId), validId);
  assert.equal(getOrCreatePaymentRequestId(storage, "student_a", "test_2", () => "f8a2f0c6-1c3b-4a75-9e2f-1b7a6c8d9e10"), "f8a2f0c6-1c3b-4a75-9e2f-1b7a6c8d9e10");
  assert.throws(() => getOrCreatePaymentRequestId(storage, "student_a", "test_3", () => "bad"), /generated payment request ID is invalid/);
  assert.throws(() => getOrCreatePaymentRequestId(storage, "student_a", "../test", () => validId), /valid test ID/);
});

test("does not start checkout when session storage cannot be read or written", () => {
  assert.throws(() => requirePaymentSessionStorage({ sessionStorage: null }), /Secure session storage is unavailable/);
  const broken = { getItem() { throw new Error("blocked"); }, setItem() {}, removeItem() {} };
  assert.throws(() => getOrCreatePaymentRequestId(broken, "student_a", "test_1", () => validId), /could not be read/);
  const writeBlocked = { getItem() { return null; }, setItem() { throw new Error("blocked"); }, removeItem() {} };
  assert.throws(() => getOrCreatePaymentRequestId(writeBlocked, "student_a", "test_1", () => validId), /could not be saved/);
});

test("clears only an explicitly definite provider rejection", () => {
  const storage = memoryStorage();
  getOrCreatePaymentRequestId(storage, "student_a", "test_1", () => validId);
  assert.equal(isDefiniteProviderOrderRejection({ details: { retryableNewRequest: true } }), true);
  assert.equal(isDefiniteProviderOrderRejection(new Error("network timeout")), false);
  clearPaymentRequestId(storage, "student_a", "test_1");
  assert.equal(storage.getItem("railway-mitra.test-series.payment-request.v1:student_a:test_1"), null);
});

test("persists submitted payment state across catalogue reloads and clears it only after verification", () => {
  const storage = memoryStorage();
  assert.equal(hasPaymentBeenSubmitted(storage, "student_a", "test_1"), false);
  markPaymentSubmitted(storage, "student_a", "test_1");
  // A newly initialized catalogue reads the same session storage after reload.
  assert.equal(hasPaymentBeenSubmitted(storage, "student_a", "test_1"), true);
  assert.equal(hasPaymentBeenSubmitted(storage, "student_a", "test_2"), false);
  clearPaymentSubmitted(storage, "student_a", "test_1");
  assert.equal(hasPaymentBeenSubmitted(storage, "student_a", "test_1"), false);
});

test("does not silently accept malformed test IDs for submitted payment markers", () => {
  const storage = memoryStorage();
  assert.throws(() => markPaymentSubmitted(storage, "student_a", "../test"), /valid test ID/);
  assert.equal(hasPaymentBeenSubmitted(storage, "student_a", "../test"), false);
});

test("isolates payment request and submitted markers between student accounts", () => {
  const storage = memoryStorage();
  const otherId = "a8a2f0c6-1c3b-4a75-9e2f-1b7a6c8d9e10";
  assert.equal(getOrCreatePaymentRequestId(storage, "student_a", "test_1", () => validId), validId);
  assert.equal(getOrCreatePaymentRequestId(storage, "student_b", "test_1", () => otherId), otherId);
  markPaymentSubmitted(storage, "student_a", "test_1");
  assert.equal(hasPaymentBeenSubmitted(storage, "student_a", "test_1"), true);
  assert.equal(hasPaymentBeenSubmitted(storage, "student_b", "test_1"), false);
});
