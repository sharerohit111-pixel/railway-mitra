"use strict";

function safeDocumentId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function validUid(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && !value.includes("/");
}

/**
 * Return only validated document IDs before they are used to construct
 * Firestore paths. A client cannot choose these values; they come from the
 * server-created entitlement record.
 */
function getPaidEntitlementLedgerReferences({ uid, testId, entitlement } = {}) {
  if (!validUid(uid) || !safeDocumentId(testId) ||
      !entitlement || entitlement.uid !== uid || entitlement.testId !== testId ||
      entitlement.status !== "active" ||
      !safeDocumentId(entitlement.paymentId) ||
      !safeDocumentId(entitlement.razorpayOrderId)) {
    return null;
  }
  return {
    paymentId: entitlement.paymentId,
    orderId: entitlement.razorpayOrderId
  };
}

/**
 * Validate the complete server-side payment grant before allowing a paid
 * attempt to start. The payment and order must be the exact records that
 * created the active entitlement.
 */
function validatePaidEntitlement({ uid, testId, entitlement, payment, order } = {}) {
  const refs = getPaidEntitlementLedgerReferences({ uid, testId, entitlement });
  if (!refs) return { valid: false, reason: "invalid_entitlement" };

  const amount = entitlement.amount;
  const currency = entitlement.currency;
  if (!Number.isSafeInteger(amount) || amount <= 0 || currency !== "INR") {
    return { valid: false, reason: "invalid_entitlement_amount_or_currency" };
  }

  const paymentMatches = payment &&
    payment.status === "captured" &&
    payment.paymentId === refs.paymentId &&
    payment.razorpayOrderId === refs.orderId &&
    payment.uid === uid &&
    payment.testId === testId &&
    payment.amount === amount &&
    payment.currency === currency;
  if (!paymentMatches) return { valid: false, reason: "payment_ledger_mismatch" };

  const orderMatches = order &&
    order.status === "paid" &&
    order.paymentId === refs.paymentId &&
    order.razorpayOrderId === refs.orderId &&
    order.uid === uid &&
    order.testId === testId &&
    order.amount === amount &&
    order.currency === currency;
  if (!orderMatches) return { valid: false, reason: "order_ledger_mismatch" };

  return {
    valid: true,
    paymentId: refs.paymentId,
    orderId: refs.orderId,
    amount,
    currency
  };
}

module.exports = { getPaidEntitlementLedgerReferences, validatePaidEntitlement };
