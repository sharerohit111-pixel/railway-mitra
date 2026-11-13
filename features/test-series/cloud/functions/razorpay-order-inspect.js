"use strict";

function validOrderId(value) {
  return typeof value === "string" && /^order_[A-Za-z0-9]{6,40}$/.test(value);
}

const PAYMENT_STATUSES = new Set(["created", "authorized", "captured", "refunded", "failed"]);
const CAPTURED_PAYMENT_STATUSES = new Set(["captured", "refunded"]);

function safePayment(row) {
  const capturedStatus = Boolean(row && CAPTURED_PAYMENT_STATUSES.has(row.status));
  if (!row || typeof row !== "object" ||
      typeof row.id !== "string" || !/^pay_[A-Za-z0-9]{6,40}$/.test(row.id) ||
      !PAYMENT_STATUSES.has(row.status) ||
      !Number.isSafeInteger(row.amount) || row.amount <= 0 ||
      row.currency !== "INR" || !validOrderId(row.order_id) ||
      typeof row.captured !== "boolean" || row.captured !== capturedStatus) {
    throw new Error("Razorpay returned an invalid payment record");
  }
  return {
    paymentId: row.id,
    status: row.status,
    amountPaise: row.amount,
    currency: row.currency,
    orderId: row.order_id,
    captured: row.captured === true
  };
}

async function inspectRazorpayOrder({
  fetchImpl = globalThis.fetch,
  keyId,
  keySecret,
  orderId,
  expectedReceipt,
  expectedAmountPaise,
  expectedUid,
  expectedTestId
} = {}) {
  if (typeof keyId !== "string" || !keyId.trim() ||
      typeof keySecret !== "string" || !keySecret.trim()) {
    throw new Error("Razorpay API credentials are not configured");
  }
  if (!validOrderId(orderId)) throw new Error("A valid Razorpay order ID is required");
  if (typeof fetchImpl !== "function") throw new Error("A supported HTTP client is required");

  const headers = {
    Authorization: "Basic " + Buffer.from(keyId + ":" + keySecret).toString("base64"),
    Accept: "application/json"
  };
  async function getJson(url, label) {
    const response = await fetchImpl(url, { method: "GET", headers });
    let payload;
    try { payload = await response.json(); }
    catch { throw new Error("Razorpay returned an unreadable " + label + " response"); }
    if (!response.ok) {
      const message = payload && payload.error && payload.error.description;
      throw new Error(typeof message === "string" ? message : "Razorpay " + label + " lookup failed");
    }
    return payload;
  }

  const order = await getJson("https://api.razorpay.com/v1/orders/" + encodeURIComponent(orderId), "order");
  if (!order || order.id !== orderId || !Number.isSafeInteger(order.amount) ||
      order.amount <= 0 || order.currency !== "INR" ||
      !["created", "attempted", "paid"].includes(order.status)) {
    throw new Error("Razorpay returned an invalid order record");
  }
  const paymentPayload = await getJson(
    "https://api.razorpay.com/v1/orders/" + encodeURIComponent(orderId) + "/payments",
    "payment"
  );
  if (!paymentPayload || !Array.isArray(paymentPayload.items) || paymentPayload.items.length > 100) {
    throw new Error("Razorpay returned an invalid order payments list");
  }
  const payments = paymentPayload.items.map(safePayment);
  if (payments.some(payment => payment.orderId !== orderId)) {
    throw new Error("Razorpay returned a payment linked to a different order");
  }

  const notes = order.notes && typeof order.notes === "object" ? order.notes : {};
  const matchesRequest = order.receipt === expectedReceipt &&
    order.amount === expectedAmountPaise && order.currency === "INR" &&
    notes.uid === expectedUid && notes.testId === expectedTestId;

  return {
    matchesRequest,
    order: {
      orderId: order.id,
      status: order.status,
      amountPaise: order.amount,
      currency: order.currency,
      receipt: typeof order.receipt === "string" ? order.receipt : null,
      amountPaidPaise: Number.isSafeInteger(order.amount_paid) ? order.amount_paid : null,
      amountDuePaise: Number.isSafeInteger(order.amount_due) ? order.amount_due : null
    },
    payments
  };
}

module.exports = { inspectRazorpayOrder, validOrderId };
