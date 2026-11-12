"use strict";

function isNonEmptyText(value) {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function isSafeIdentity(value) {
  return isNonEmptyText(value) && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

/**
 * Validate a Razorpay payment.captured webhook against the server-created order.
 *
 * The order record is authoritative for UID, test ID, amount and currency.
 * Never grant access from payment notes or other client-controlled metadata.
 * Signature verification must happen before this helper is called.
 */
function validateCapturedPayment({ event, order } = {}) {
  if (!event || typeof event !== "object" || event.event !== "payment.captured") {
    return { valid: false, reason: "unsupported_event" };
  }

  const payment = event.payload && event.payload.payment && event.payload.payment.entity;
  if (!payment || typeof payment !== "object" || payment.status !== "captured") {
    return { valid: false, reason: "payment_not_captured" };
  }

  if (!order || typeof order !== "object" || order.status !== "created" ||
      !isSafeIdentity(order.uid) || !isSafeIdentity(order.testId) ||
      !isNonEmptyText(order.razorpayOrderId) ||
      !Number.isSafeInteger(order.amount) || order.amount <= 0 ||
      !isNonEmptyText(order.currency) || !/^[A-Z]{3}$/.test(order.currency)) {
    return { valid: false, reason: "invalid_server_order" };
  }

  if (!isNonEmptyText(payment.id) || !isNonEmptyText(payment.order_id) ||
      !Number.isSafeInteger(payment.amount) || !isNonEmptyText(payment.currency)) {
    return { valid: false, reason: "invalid_payment_fields" };
  }

  if (payment.order_id !== order.razorpayOrderId) {
    return { valid: false, reason: "order_mismatch" };
  }
  if (payment.amount !== order.amount) {
    return { valid: false, reason: "amount_mismatch" };
  }
  if (payment.currency !== order.currency) {
    return { valid: false, reason: "currency_mismatch" };
  }

  return {
    valid: true,
    paymentId: payment.id,
    orderId: order.razorpayOrderId,
    uid: order.uid,
    testId: order.testId,
    amount: order.amount,
    currency: order.currency
  };
}

module.exports = { validateCapturedPayment };
