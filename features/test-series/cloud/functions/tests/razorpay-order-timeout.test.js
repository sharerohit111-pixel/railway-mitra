"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  createRazorpayOrder,
  RazorpayOrderRejectedError,
  DEFAULT_RAZORPAY_ORDER_TIMEOUT_MS,
  MAX_RAZORPAY_ORDER_TIMEOUT_MS
} = require("../razorpay-order");

function input(overrides = {}) {
  return {
    keyId: "rzp_test_key",
    keySecret: "test_secret",
    amount: 49900,
    currency: "INR",
    receipt: "rm_order_123",
    notes: { uid: "student_1", testId: "paid_test_1" },
    ...overrides
  };
}

function createdOrderResponse() {
  return {
    ok: true,
    json: async () => ({ id: "order_Abc123", amount: 49900, currency: "INR", status: "created" })
  };
}

test("uses a bounded AbortSignal for provider order creation", async () => {
  let requestOptions;
  const result = await createRazorpayOrder({
    ...input(),
    fetchImpl: async (_url, options) => { requestOptions = options; return createdOrderResponse(); }
  });
  assert.equal(DEFAULT_RAZORPAY_ORDER_TIMEOUT_MS, 15000);
  assert.equal(MAX_RAZORPAY_ORDER_TIMEOUT_MS, 60000);
  assert.ok(requestOptions.signal instanceof AbortSignal);
  assert.equal(requestOptions.signal.aborted, false);
  assert.equal(result.id, "order_Abc123");
});

test("rejects unsafe timeout settings before calling the provider", async () => {
  let calls = 0;
  for (const timeoutMs of [0, -1, 60001, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "15000"]) {
    await assert.rejects(createRazorpayOrder({
      ...input(), timeoutMs,
      fetchImpl: async () => { calls += 1; throw new Error("provider must not be called"); }
    }), /timeout must be a positive integer/);
  }
  assert.equal(calls, 0);
});

test("a provider request timeout remains an ambiguous outcome, not a definite rejection", async () => {
  let observedSignal;
  // AbortSignal.timeout uses an unreferenced timer; keep this focused test alive
  // until the timeout event is delivered.
  const keepAlive = setTimeout(() => {}, 100);
  try {
    await assert.rejects(createRazorpayOrder({
      ...input(),
      timeoutMs: 10,
      fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
        observedSignal = signal;
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      })
    }), error => error && error.name === "TimeoutError" && !(error instanceof RazorpayOrderRejectedError));
    assert.equal(observedSignal.aborted, true);
  } finally {
    clearTimeout(keepAlive);
  }
});
