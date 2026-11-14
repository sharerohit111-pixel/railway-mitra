"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createRazorpayOrder } = require("../razorpay-order");

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

test("creates an INR Razorpay order using server-supplied credentials and payload", async () => {
  let request;
  const result = await createRazorpayOrder({
    ...input(),
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        json: async () => ({
          id: "order_Abc123",
          amount: 49900,
          currency: "INR",
          status: "created"
        })
      };
    }
  });

  assert.deepEqual(result, { id: "order_Abc123", amount: 49900, currency: "INR", status: "created" });
  assert.equal(request.url, "https://api.razorpay.com/v1/orders");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["Content-Type"], "application/json");
  assert.equal(
    request.options.headers.Authorization,
    "Basic " + Buffer.from("rzp_test_key:test_secret").toString("base64")
  );
  assert.deepEqual(JSON.parse(request.options.body), {
    amount: 49900,
    currency: "INR",
    receipt: "rm_order_123",
    notes: { uid: "student_1", testId: "paid_test_1" }
  });
});

test("rejects missing credentials, unsafe amounts, unsupported currency and invalid receipt", async () => {
  const fetchImpl = async () => { throw new Error("HTTP request must not run"); };
  await assert.rejects(createRazorpayOrder(input({ keySecret: "" , fetchImpl })), /credentials/);
  await assert.rejects(createRazorpayOrder(input({ amount: 0, fetchImpl })), /positive integer/);
  await assert.rejects(createRazorpayOrder(input({ amount: 499.5, fetchImpl })), /positive integer/);
  await assert.rejects(createRazorpayOrder(input({ currency: "USD", fetchImpl })), /Only INR/);
  await assert.rejects(createRazorpayOrder(input({ receipt: "bad receipt", fetchImpl })), /receipt/);
});

test("surfaces provider errors without accepting an invalid order response", async () => {
  await assert.rejects(createRazorpayOrder({
    ...input(),
    fetchImpl: async () => ({
      ok: false,
      json: async () => ({ error: { description: "Invalid API credentials" } })
    })
  }), /Invalid API credentials/);

  await assert.rejects(createRazorpayOrder({
    ...input(),
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ id: "order_wrong", amount: 1, currency: "INR", status: "created" })
    })
  }), /invalid order record/);
});

test("classifies explicit provider HTTP rejection as definite, unlike network ambiguity", async () => {
  const { RazorpayOrderRejectedError } = require("../razorpay-order");
  await assert.rejects(createRazorpayOrder({
    ...input(),
    fetchImpl: async () => ({
      ok: false,
      json: async () => ({ error: { description: "Invalid API credentials" } })
    })
  }), error => error instanceof RazorpayOrderRejectedError);

  await assert.rejects(createRazorpayOrder({
    ...input(),
    fetchImpl: async () => { throw new Error("socket timeout"); }
  }), error => !(error instanceof RazorpayOrderRejectedError) && /socket timeout/.test(error.message));
});
