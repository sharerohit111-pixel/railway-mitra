"use strict";

const { createHmac, timingSafeEqual } = require("node:crypto");

const SHA256_HEX = /^[a-f0-9]{64}$/i;

function hasExactText(value) {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function matchesDigest(expectedDigest, suppliedSignature) {
  if (typeof suppliedSignature !== "string" || !SHA256_HEX.test(suppliedSignature)) return false;
  const suppliedDigest = Buffer.from(suppliedSignature, "hex");
  return suppliedDigest.length === expectedDigest.length &&
    timingSafeEqual(expectedDigest, suppliedDigest);
}

/**
 * Verify Razorpay's webhook signature against the exact HTTP request bytes.
 * Do not pass JSON.stringify(req.body): whitespace/key-order changes alter the digest.
 */
function verifyRazorpayWebhookSignature(rawBody, signature, webhookSecret) {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0 || !hasExactText(webhookSecret)) return false;
  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest();
  return matchesDigest(expected, signature);
}

/**
 * Verify the Razorpay Checkout response signature:
 * HMAC-SHA256(keySecret, order_id + "|" + payment_id).
 */
function verifyRazorpayCheckoutSignature({ orderId, paymentId, signature, keySecret } = {}) {
  if (!hasExactText(orderId) || !hasExactText(paymentId) || !hasExactText(keySecret)) return false;
  const expected = createHmac("sha256", keySecret)
    .update(orderId + "|" + paymentId, "utf8")
    .digest();
  return matchesDigest(expected, signature);
}

module.exports = {
  verifyRazorpayWebhookSignature,
  verifyRazorpayCheckoutSignature
};
