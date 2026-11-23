"use strict";

const { createHmac } = require("node:crypto");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  verifyRazorpayWebhookSignature,
  verifyRazorpayCheckoutSignature
} = require("../razorpay-signature");

function hmac(secret, value) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

test("Razorpay webhook signature verifies the exact raw request body", () => {
  const secret = "emulator-only-webhook-secret";
  const rawBody = Buffer.from('{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_123"}}}}');
  const signature = hmac(secret, rawBody);

  assert.equal(verifyRazorpayWebhookSignature(rawBody, signature, secret), true);
  assert.equal(verifyRazorpayWebhookSignature(Buffer.from(rawBody.toString() + " "), signature, secret), false);
  assert.equal(verifyRazorpayWebhookSignature(Buffer.from(rawBody.toString().replace("payment.captured", "payment.failed")), signature, secret), false);
});

test("Razorpay webhook signature rejects malformed inputs and non-raw bodies", () => {
  const secret = "emulator-only-webhook-secret";
  const rawBody = Buffer.from('{"event":"payment.captured"}');
  const signature = hmac(secret, rawBody);

  assert.equal(verifyRazorpayWebhookSignature(rawBody.toString(), signature, secret), false);
  assert.equal(verifyRazorpayWebhookSignature(rawBody, "not-a-signature", secret), false);
  assert.equal(verifyRazorpayWebhookSignature(rawBody, "a".repeat(63), secret), false);
  assert.equal(verifyRazorpayWebhookSignature(rawBody, signature, ""), false);
  assert.equal(verifyRazorpayWebhookSignature(Buffer.alloc(0), signature, secret), false);
});

test("Razorpay Checkout signature binds the exact order and payment IDs", () => {
  const keySecret = "emulator-only-key-secret";
  const orderId = "order_123";
  const paymentId = "pay_456";
  const signature = hmac(keySecret, orderId + "|" + paymentId);

  assert.equal(verifyRazorpayCheckoutSignature({ orderId, paymentId, signature, keySecret }), true);
  assert.equal(verifyRazorpayCheckoutSignature({ orderId: "order_other", paymentId, signature, keySecret }), false);
  assert.equal(verifyRazorpayCheckoutSignature({ orderId, paymentId: "pay_other", signature, keySecret }), false);
  assert.equal(verifyRazorpayCheckoutSignature({ orderId, paymentId, signature, keySecret: "wrong-secret" }), false);
});

test("Razorpay Checkout signature rejects missing identifiers and malformed signatures", () => {
  const keySecret = "emulator-only-key-secret";
  const signature = hmac(keySecret, "order_123|pay_456");

  assert.equal(verifyRazorpayCheckoutSignature({ paymentId: "pay_456", signature, keySecret }), false);
  assert.equal(verifyRazorpayCheckoutSignature({ orderId: "order_123", signature, keySecret }), false);
  assert.equal(verifyRazorpayCheckoutSignature({ orderId: " order_123", paymentId: "pay_456", signature, keySecret }), false);
  assert.equal(verifyRazorpayCheckoutSignature({ orderId: "order_123", paymentId: "pay_456", signature: "z".repeat(64), keySecret }), false);
});
