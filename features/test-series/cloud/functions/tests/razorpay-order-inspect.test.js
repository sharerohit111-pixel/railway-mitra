"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { inspectRazorpayOrder, validOrderId } = require("../razorpay-order-inspect");

function response(payload, ok = true) {
  return { ok, json: async () => payload };
}

function inspectWithPayments(items) {
  return inspectRazorpayOrder({
    keyId: "rzp_test_key",
    keySecret: "secret",
    orderId: "order_123456",
    expectedReceipt: "rm_receipt_123",
    expectedAmountPaise: 49900,
    expectedUid: "student_uid",
    expectedTestId: "gdce_test",
    fetchImpl: async url => url.endsWith("/payments")
      ? response({ items })
      : response({
        id: "order_123456",
        status: "paid",
        amount: 49900,
        currency: "INR",
        receipt: "rm_receipt_123",
        notes: { uid: "student_uid", testId: "gdce_test" }
      })
  });
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
    orderId: "order_123456", expectedReceipt: "rm_receipt_123",
    expectedAmountPaise: 49900, expectedUid: "student_uid", expectedTestId: "gdce_test",
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
        notes: { uid: "student_uid", testId: "gdce_test", private: "must not escape" }
      });
    }
  });
  assert.equal(calls.length, 2);
  assert.equal(result.matchesRequest, true);
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

test("accepts documented payment states only with a consistent captured flag", async () => {
  const states = [
    ["created", false],
    ["authorized", false],
    ["captured", true],
    ["refunded", true],
    ["failed", false]
  ];
  const rows = states.map(([status, captured], index) => ({
    id: "pay_12345" + index,
    status,
    amount: 49900,
    currency: "INR",
    order_id: "order_123456",
    captured
  }));
  const result = await inspectWithPayments(rows);
  assert.deepEqual(result.payments.map(payment => [payment.status, payment.captured]), states);
});

test("fails closed for unknown or inconsistent provider payment rows", async () => {
  const valid = {
    id: "pay_123456",
    status: "captured",
    amount: 49900,
    currency: "INR",
    order_id: "order_123456",
    captured: true
  };
  const invalidRows = [
    { ...valid, status: "pending", captured: false },
    { ...valid, status: "captured", captured: false },
    { ...valid, status: "refunded", captured: false },
    { ...valid, status: "authorized", captured: true },
    { ...valid, amount: 0 },
    { ...valid, order_id: "not-an-order" },
    { ...valid, captured: "true" }
  ];
  for (const payment of invalidRows) {
    await assert.rejects(inspectWithPayments([payment]), /invalid payment record/);
  }
});
