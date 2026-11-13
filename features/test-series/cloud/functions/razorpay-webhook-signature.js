"use strict";

const crypto = require("node:crypto");

function verifyRazorpayWebhookSignature({ rawBody, signature, secret } = {}) {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0 ||
      typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature) ||
      typeof secret !== "string" || !secret) {
    return false;
  }
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest();
  const supplied = Buffer.from(signature, "hex");
  return supplied.length === expected.length && crypto.timingSafeEqual(expected, supplied);
}

module.exports = { verifyRazorpayWebhookSignature };
