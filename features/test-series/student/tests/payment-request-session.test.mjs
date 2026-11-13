"use strict";

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  requirePaymentSessionStorage,
  getOrCreatePaymentRequestId,
  clearPaymentRequestId,
  isDefiniteProviderOrderRejection
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
  assert.equal(getOrCreatePaymentRequestId(storage, "test_1", createId), validId);
  assert.equal(getOrCreatePaymentRequestId(storage, "test_1", createId), validId);
  assert.equal(generated, 1);
});

test("isolates request IDs by test and rejects malformed IDs", () => {
  const storage = memoryStorage();
  assert.equal(getOrCreatePaymentRequestId(storage, "test_1", () => validId), validId);
  assert.equal(getOrCreatePaymentRequestId(storage, "test_2", () => "f8a2f0c6-1c3b-4a75-9e2f-1b7a6c8d9e10"),
    "f8a2f0c6-1c3b-4a75-9e2f-1b7a6c8d9e10");
  assert.throws(() => getOrCreatePaymentRequestId(storage, "test_3", () => "bad"), /generated payment request ID is invalid/);
  assert.throws(() => getOrCreatePaymentRequestId(storage, "../test", () => validId), /valid test ID/);
});

test("does not start checkout when session storage cannot be read or written", () => {
  assert.throws(() => requirePaymentSessionStorage({ sessionStorage: null }), /Secure session storage is unavailable/);
  const broken = {
    getItem() { throw new Error("blocked"); },
    setItem() {},
    removeItem() {}
  };
  assert.throws(() => getOrCreatePaymentRequestId(broken, "test_1", () => validId), /could not be read/);
  const writeBlocked = {
    getItem() { return null; },
    setItem() { throw new Error("blocked"); },
    removeItem() {}
  };
  assert.throws(() => getOrCreatePaymentRequestId(writeBlocked, "test_1", () => validId), /could not be saved/);
});

test("clears only an explicitly definite provider rejection", () => {
  const storage = memoryStorage();
  getOrCreatePaymentRequestId(storage, "test_1", () => validId);
  assert.equal(isDefiniteProviderOrderRejection({ details: { retryableNewRequest: true } }), true);
  assert.equal(isDefiniteProviderOrderRejection(new Error("network timeout")), false);
  clearPaymentRequestId(storage, "test_1");
  assert.equal(storage.getItem("railway-mitra.test-series.payment-request.v1:test_1"), null);
});
