"use strict";

const {
  isRazorpayTestModeKeyId,
  DEFAULT_RAZORPAY_ORDER_TIMEOUT_MS,
  MAX_RAZORPAY_ORDER_TIMEOUT_MS
} = require("./razorpay-order");

function validOrderId(value) {
  return typeof value === "string" && /^order_[A-Za-z0-9]{6,40}$/.test(value);
}

const PAYMENT_STATUSES = new Set(["created", "authorized", "captured", "refunded", "failed"]);
const CAPTURED_PAYMENT_STATUSES = new Set(["captured", "refunded"]);
const PAYMENT_PAGE_SIZE = 100;
const MAX_INSPECTED_PAYMENTS = 500;
const DEFAULT_RAZORPAY_INSPECTION_TIMEOUT_MS = DEFAULT_RAZORPAY_ORDER_TIMEOUT_MS;
const MAX_RAZORPAY_INSPECTION_TIMEOUT_MS = MAX_RAZORPAY_ORDER_TIMEOUT_MS;

function createInspectionTimeoutSignal(timeoutMs) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_RAZORPAY_INSPECTION_TIMEOUT_MS) {
    throw new Error("Razorpay order inspection timeout must be a positive integer no greater than 60000 ms");
  }
  if (typeof AbortSignal === "undefined" || typeof AbortSignal.timeout !== "function") {
    throw new Error("The runtime does not support bounded Razorpay order inspection requests");
  }
  return AbortSignal.timeout(timeoutMs);
}

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
  expectedTestId,
  timeoutMs = DEFAULT_RAZORPAY_INSPECTION_TIMEOUT_MS
} = {}) {
  if (!isRazorpayTestModeKeyId(keyId)) {
    throw new Error("A valid Razorpay Test Mode Key ID is required; live-mode keys are disabled");
  }
  if (typeof keySecret !== "string" || !keySecret.trim()) {
    throw new Error("Razorpay API credentials are not configured");
  }
  if (!validOrderId(orderId)) throw new Error("A valid Razorpay order ID is required");
  if (typeof fetchImpl !== "function") throw new Error("A supported HTTP client is required");

  // One deadline covers the order lookup and every paginated payment lookup.
  // This bounds the complete Owner inspection rather than resetting the clock
  // for each provider page.
  const signal = createInspectionTimeoutSignal(timeoutMs);
  const headers = {
    Authorization: "Basic " + Buffer.from(keyId + ":" + keySecret).toString("base64"),
    Accept: "application/json"
  };
  async function getJson(url, label) {
    const response = await fetchImpl(url, { method: "GET", headers, signal });
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
  // Razorpay returns only 10 payments by default. Explicitly page through
  // every attempt (up to a conservative safety ceiling) before concluding
  // that no captured payment exists. A full final page at the ceiling is
  // ambiguous, so fail closed rather than silently ignore later attempts.
  const payments = [];
  const seenPaymentIds = new Set();
  for (let skip = 0; ; skip += PAYMENT_PAGE_SIZE) {
    const paymentPayload = await getJson(
      "https://api.razorpay.com/v1/orders/" + encodeURIComponent(orderId) +
        "/payments?count=" + PAYMENT_PAGE_SIZE + "&skip=" + skip,
      "payment"
    );
    if (!paymentPayload || !Array.isArray(paymentPayload.items) ||
        paymentPayload.items.length > PAYMENT_PAGE_SIZE) {
      throw new Error("Razorpay returned an invalid order payments list");
    }
    const page = paymentPayload.items.map(safePayment);
    if (page.some(payment => payment.orderId !== orderId)) {
      throw new Error("Razorpay returned a payment linked to a different order");
    }
    for (const payment of page) {
      if (seenPaymentIds.has(payment.paymentId)) {
        throw new Error("Razorpay returned a duplicate payment across pages");
      }
      seenPaymentIds.add(payment.paymentId);
      payments.push(payment);
    }
    if (page.length < PAYMENT_PAGE_SIZE) break;
    if (payments.length >= MAX_INSPECTED_PAYMENTS) {
      throw new Error("Razorpay order has more payment attempts than the safe inspection limit");
    }
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

module.exports = {
  inspectRazorpayOrder,
  validOrderId,
  DEFAULT_RAZORPAY_INSPECTION_TIMEOUT_MS,
  MAX_RAZORPAY_INSPECTION_TIMEOUT_MS
};
