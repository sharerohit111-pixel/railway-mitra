"use strict";

function validateOrderInput({ keyId, keySecret, amount, currency = "INR", receipt, notes } = {}) {
  if (typeof keyId !== "string" || !keyId.trim() ||
      typeof keySecret !== "string" || !keySecret.trim()) {
    throw new Error("Razorpay API credentials are not configured");
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("Order amount must be a positive integer in the smallest currency unit");
  }
  if (currency !== "INR") throw new Error("Only INR orders are supported");
  if (typeof receipt !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(receipt)) {
    throw new Error("A valid server-generated receipt is required");
  }
  if (!notes || typeof notes !== "object" || Array.isArray(notes)) {
    throw new Error("Server-owned order notes are required");
  }
}

class RazorpayOrderRejectedError extends Error {
  constructor(message) { super(message); this.name = "RazorpayOrderRejectedError"; }
}

async function createRazorpayOrder({
  fetchImpl = globalThis.fetch,
  keyId,
  keySecret,
  amount,
  currency = "INR",
  receipt,
  notes
} = {}) {
  validateOrderInput({ keyId, keySecret, amount, currency, receipt, notes });
  if (typeof fetchImpl !== "function") throw new Error("A supported HTTP client is required");

  const response = await fetchImpl("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(keyId + ":" + keySecret).toString("base64"),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ amount, currency, receipt, notes })
  });

  let payload;
  try { payload = await response.json(); }
  catch { throw new Error("Razorpay returned an unreadable order response"); }

  if (!response.ok) {
    const message = payload && payload.error && payload.error.description;
    throw new RazorpayOrderRejectedError(typeof message === "string" ? message : "Razorpay order creation failed");
  }
  if (!payload || typeof payload.id !== "string" || !/^order_[A-Za-z0-9]+$/.test(payload.id) ||
      payload.amount !== amount || payload.currency !== currency || payload.status !== "created") {
    throw new Error("Razorpay returned an invalid order record");
  }
  return { id: payload.id, amount: payload.amount, currency: payload.currency, status: payload.status };
}

module.exports = { createRazorpayOrder, RazorpayOrderRejectedError };
