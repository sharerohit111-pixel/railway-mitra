"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { verifyRazorpayWebhookSignature } = require("../razorpay-webhook-signature");

test("verifies the HMAC SHA-256 signature over the exact raw request bytes", () => {
  const secret = "local-test-webhook-secret";
  const rawBody = Buffer.from('{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_1"}}}}');
  const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  assert.equal(verifyRazorpayWebhookSignature({ rawBody, signature, secret }), true);
  assert.equal(verifyRazorpayWebhookSignature({ rawBody: Buffer.from(rawBody.toString() + " "), signature, secret }), false);
});

test("rejects absent, malformed and incorrect signatures safely", () => {
  const rawBody = Buffer.from('{"event":"payment.captured"}');
  assert.equal(verifyRazorpayWebhookSignature({ rawBody, signature: "", secret: "secret" }), false);
  assert.equal(verifyRazorpayWebhookSignature({ rawBody, signature: "not-hex", secret: "secret" }), false);
  assert.equal(verifyRazorpayWebhookSignature({ rawBody, signature: "a".repeat(64), secret: "secret" }), false);
  assert.equal(verifyRazorpayWebhookSignature({ rawBody: "not-a-buffer", signature: "a".repeat(64), secret: "secret" }), false);
  assert.equal(verifyRazorpayWebhookSignature({ rawBody, signature: "a".repeat(64), secret: "" }), false);
});
