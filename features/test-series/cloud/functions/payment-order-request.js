"use strict";

const crypto = require("node:crypto");

const PAYMENT_REQUEST_STATES = Object.freeze({
  CREATING: "creating",
  CREATED: "created",
  FAILED: "failed",
  UNKNOWN: "unknown"
});

function validatePaymentRequestId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{20,128}$/.test(value)) {
    throw new Error("A cryptographically random payment request ID is required");
  }
  return value;
}

function paymentRequestDocumentId({ uid, testId, requestId } = {}) {
  if (typeof uid !== "string" || !uid.trim() || typeof testId !== "string" || !testId.trim()) {
    throw new Error("Authenticated student and test identifiers are required");
  }
  validatePaymentRequestId(requestId);
  return crypto.createHash("sha256")
    .update(uid + "\0" + testId + "\0" + requestId, "utf8")
    .digest("hex");
}

function paymentRequestFingerprint({ uid, testId, amount, currency = "INR" } = {}) {
  if (typeof uid !== "string" || !uid.trim() || typeof testId !== "string" || !testId.trim()) {
    throw new Error("Authenticated student and test identifiers are required");
  }
  if (!Number.isSafeInteger(amount) || amount <= 0 || currency !== "INR") {
    throw new Error("A valid INR amount is required");
  }
  return crypto.createHash("sha256")
    .update(uid + "\0" + testId + "\0" + amount + "\0" + currency, "utf8")
    .digest("hex");
}

function inspectPaymentRequest(existing, expectedFingerprint) {
  if (!existing || typeof existing !== "object") return { action: "reserve" };
  if (existing.fingerprint !== expectedFingerprint) {
    return { action: "reject", reason: "request_id_payload_conflict" };
  }
  switch (existing.status) {
    case PAYMENT_REQUEST_STATES.CREATED:
      if (typeof existing.razorpayOrderId !== "string" || !existing.razorpayOrderId) {
        return { action: "reconcile", reason: "created_order_id_missing" };
      }
      return { action: "replay", orderId: existing.razorpayOrderId };
    case PAYMENT_REQUEST_STATES.CREATING:
      return { action: "wait", reason: "provider_creation_in_progress" };
    case PAYMENT_REQUEST_STATES.UNKNOWN:
      return { action: "reconcile", reason: "provider_outcome_unknown" };
    case PAYMENT_REQUEST_STATES.FAILED:
      return { action: "reject", reason: "previous_attempt_failed_use_new_request_id" };
    default:
      return { action: "reconcile", reason: "unrecognized_request_state" };
  }
}

module.exports = {
  PAYMENT_REQUEST_STATES,
  validatePaymentRequestId,
  paymentRequestDocumentId,
  paymentRequestFingerprint,
  inspectPaymentRequest
};
