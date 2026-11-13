"use strict";

const ALLOWED_OUTCOMES = new Set(["success", "provider_lookup_failed"]);
const ALLOWED_ORDER_STATUSES = new Set(["created", "attempted", "paid"]);
const ALLOWED_PAYMENT_STATUSES = new Set(["created", "authorized", "captured", "refunded", "failed"]);

function validId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

/**
 * Append-only audit record for an Owner's live provider inspection.
 * Stores identifiers and allow-listed status metadata only; never raw provider
 * payloads, credentials, receipt values, contact details or arbitrary errors.
 */
async function recordPaymentInspectionAudit({
  db,
  serverTimestamp,
  ownerUid,
  requestRecordId,
  outcome,
  matchesRequest = null,
  orderStatus = null,
  paymentStatuses = []
} = {}) {
  if (!db || typeof db.collection !== "function" ||
      typeof serverTimestamp !== "function") {
    throw new TypeError("A database and server timestamp provider are required");
  }
  if (!validId(ownerUid) || !/^[a-f0-9]{64}$/.test(requestRecordId || "")) {
    throw new TypeError("Valid Owner and payment request identifiers are required");
  }
  if (!ALLOWED_OUTCOMES.has(outcome)) throw new TypeError("Invalid audit outcome");
  if (matchesRequest !== null && typeof matchesRequest !== "boolean") {
    throw new TypeError("Request match result must be boolean or null");
  }
  if (orderStatus !== null && !ALLOWED_ORDER_STATUSES.has(orderStatus)) {
    throw new TypeError("Invalid provider order status");
  }
  if (!Array.isArray(paymentStatuses) || paymentStatuses.length > 100 ||
      paymentStatuses.some(status => !ALLOWED_PAYMENT_STATUSES.has(status))) {
    throw new TypeError("Invalid provider payment status list");
  }

  const ref = db.collection("testSeriesPaymentAudit").doc();
  const record = {
    action: "razorpay_order_inspected",
    ownerUid,
    requestRecordId,
    outcome,
    matchesRequest,
    orderStatus,
    paymentStatuses: [...paymentStatuses],
    paymentCount: paymentStatuses.length,
    createdAt: serverTimestamp()
  };
  await ref.create(record);
  return { auditId: ref.id };
}

module.exports = { recordPaymentInspectionAudit };
