"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { inspectRazorpayOrder, validOrderId } = require("../razorpay-order-inspect");

function response(payload, ok = true) {
  return { ok, json: async () => payload };
}

test("validates provider order IDs", () => {
  assert.equal(validOrderId("order_123456"), true);
  assert.equal(validOrderId("order_bad-id"), false);
  assert.equal(validOrderId("../orders"), false);
});

test("reads and allow-lists order plus payment status from Razorpay", async () => {
  const calls = [];
  const result = await inspectRazorpayOrder({
    keyId: "rzp_test_key",
    keySecret: "secret",
    orderId: "order_123456",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/payments")) return response({ items: [{
        id: "pay_123456", status: "captured", amount: 49900, currency: "INR",
        order_id: "order_123456", captured: true, email: "private@example.com",
        contact: "9999999999"
      }] });
      return response({
        id: "order_123456", status: "paid", amount: 49900, currency: "INR",
        receipt: "rm_receipt_123", amount_paid: 49900, amount_due: 0,
        notes: { private: "must not escape" }
      });
    }
  });
  assert.equal(calls.length, 2);
  assert.match(calls[0].options.headers.Authorization, /^Basic /);
  assert.deepEqual(result.order, {
    orderId: "order_123456", status: "paid", amountPaise: 49900,
    currency: "INR", receipt: "rm_receipt_123",
    amountPaidPaise: 49900, amountDuePaise: 0
  });
  assert.deepEqual(result.payments, [{
    paymentId: "pay_123456", status: "captured", amountPaise: 49900,
    currency: "INR", orderId: "order_123456", captured: true
  }]);
  assert.equal(JSON.stringify(result).includes("9999999999"), false);
  assert.equal(JSON.stringify(result).includes("private@example.com"), false);
});

test("rejects malformed provider responses and cross-order payment rows", async () => {
  await assert.rejects(inspectRazorpayOrder({
    keyId: "key", keySecret: "secret", orderId: "order_123456",
    fetchImpl: async () => response({ id: "order_other", status: "paid", amount: 1, currency: "INR" })
  }), /invalid order record/);
  await assert.rejects(inspectRazorpayOrder({
    keyId: "key", keySecret: "secret", orderId: "order_123456",
    fetchImpl: async url => url.endsWith("/payments")
      ? response({ items: [{ id: "pay_123456", status: "captured", amount: 100, currency: "INR", order_id: "order_other" }] })
      : response({ id: "order_123456", status: "paid", amount: 100, currency: "INR" })
  }), /different order/);
});

test("rejects missing credentials and invalid order IDs before network access", async () => {
  let called = false;
  await assert.rejects(inspectRazorpayOrder({ orderId: "order_123456", fetchImpl: async () => { called = true; } }), /credentials/);
  await assert.rejects(inspectRazorpayOrder({
    keyId: "key", keySecret: "secret", orderId: "../orders",
    fetchImpl: async () => { called = true; }
  }), /valid Razorpay order ID/);
  assert.equal(called, false);
});
