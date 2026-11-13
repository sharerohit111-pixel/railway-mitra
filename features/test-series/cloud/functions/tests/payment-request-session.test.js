"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const sessionModule = import("../../../student/payment-request-session.mjs");

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

const TEST_ID = "gdce_je_civil";
const REQUEST_ID = "d8a2f0c6-1c3b-4a75-9e2f-1b7a6c8d9e10";

test("reuses the same request ID after a page reload in the same tab", async () => {
  const { getOrCreatePaymentRequestId } = await sessionModule;
  const tabSessionStorage = createStorage();
  const first = getOrCreatePaymentRequestId(tabSessionStorage, TEST_ID, () => REQUEST_ID);
  const afterReload = getOrCreatePaymentRequestId(tabSessionStorage, TEST_ID, () => {
    throw new Error("A stored request ID should be reused");
  });
  assert.equal(first, REQUEST_ID);
  assert.equal(afterReload, first);
});

test("keeps request IDs isolated by test and replaces malformed stored values", async () => {
  const { getOrCreatePaymentRequestId } = await sessionModule;
  const storage = createStorage();
  const first = getOrCreatePaymentRequestId(storage, TEST_ID, () => REQUEST_ID);
  const second = getOrCreatePaymentRequestId(storage, "another_test", () => "e8a2f0c6-1c3b-4a75-9e2f-1b7a6c8d9e10");
  assert.notEqual(first, second);

  storage.setItem("railway-mitra.test-series.payment-request.v1:broken_test", "not-a-request-id");
  const repaired = getOrCreatePaymentRequestId(storage, "broken_test", () => REQUEST_ID);
  assert.equal(repaired, REQUEST_ID);
});

test("requires a valid secure ID generator and verifies the stored value", async () => {
  const { getOrCreatePaymentRequestId } = await sessionModule;
  assert.throws(() => getOrCreatePaymentRequestId(createStorage(), TEST_ID, () => "short"), /generated payment request ID/);
  const failingStorage = {
    getItem() { return null; },
    setItem() { throw new Error("quota"); }
  };
  assert.throws(() => getOrCreatePaymentRequestId(failingStorage, TEST_ID, () => REQUEST_ID), /could not be saved/);
});

test("fails closed when browser session storage is unavailable or blocked", async () => {
  const { requirePaymentSessionStorage } = await sessionModule;
  assert.throws(() => requirePaymentSessionStorage({}), /Secure session storage is unavailable/);
  const blocked = {};
  Object.defineProperty(blocked, "sessionStorage", { get() { throw new Error("blocked"); } });
  assert.throws(() => requirePaymentSessionStorage(blocked), /Secure session storage is unavailable/);
  const storage = createStorage();
  assert.equal(requirePaymentSessionStorage({ defaultView: { sessionStorage: storage } }), storage);
});

test("clears only the selected test key after an explicit definite provider rejection", async () => {
  const { getOrCreatePaymentRequestId, clearPaymentRequestId, isDefiniteProviderOrderRejection } = await sessionModule;
  const storage = createStorage();
  getOrCreatePaymentRequestId(storage, TEST_ID, () => REQUEST_ID);
  getOrCreatePaymentRequestId(storage, "another_test", () => "e8a2f0c6-1c3b-4a75-9e2f-1b7a6c8d9e10");

  assert.equal(isDefiniteProviderOrderRejection({ details: { retryableNewRequest: true } }), true);
  assert.equal(isDefiniteProviderOrderRejection({ code: "unavailable" }), false);
  assert.equal(isDefiniteProviderOrderRejection({ details: { retryableNewRequest: false } }), false);
  assert.equal(isDefiniteProviderOrderRejection({ details: { outcomeUnknown: true } }), false);

  clearPaymentRequestId(storage, TEST_ID);
  assert.equal(storage.getItem("railway-mitra.test-series.payment-request.v1:" + TEST_ID), null);
  assert.equal(storage.getItem("railway-mitra.test-series.payment-request.v1:another_test"), "e8a2f0c6-1c3b-4a75-9e2f-1b7a6c8d9e10");
});

test("rejects malformed test identifiers before touching storage", async () => {
  const { getOrCreatePaymentRequestId } = await sessionModule;
  const storage = createStorage();
  assert.throws(() => getOrCreatePaymentRequestId(storage, "../private", () => REQUEST_ID), /valid test ID/);
  assert.equal(storage.values.size, 0);
});
