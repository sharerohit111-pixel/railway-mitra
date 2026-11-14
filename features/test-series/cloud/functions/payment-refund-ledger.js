"use strict";

const { FieldValue } = require("firebase-admin/firestore");

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function safeId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

/**
 * Apply a verified refund.processed event. Partial refunds are recorded but
 * retain access; a full refund revokes the matching paid entitlement.
 * Call only after raw-body webhook signature verification.
 */
async function applyProcessedRefund({ db, event, eventId } = {}) {
  if (!db || typeof db.doc !== "function" || typeof db.runTransaction !== "function") {
    fail("invalid_database", "A Firestore database instance is required");
  }
  if (!safeId(eventId)) fail("invalid_event_id", "A valid provider event ID is required");

  const refund = event && event.payload && event.payload.refund && event.payload.refund.entity;
  if (!event || event.event !== "refund.processed" || !refund || refund.status !== "processed") {
    fail("invalid_refund_event", "A processed refund entity is required");
  }
  if (!safeId(refund.id) || !safeId(refund.payment_id) ||
      !Number.isSafeInteger(refund.amount) || refund.amount <= 0 ||
      typeof refund.currency !== "string" || !/^[A-Z]{3}$/.test(refund.currency)) {
    fail("invalid_refund_fields", "Refund identity, amount or currency is invalid");
  }

  const paymentRef = db.doc("testSeriesPayments/" + refund.payment_id);
  const eventRef = db.doc("testSeriesPaymentEvents/" + eventId);
  const refundRef = db.doc("testSeriesRefunds/" + refund.id);

  return db.runTransaction(async tx => {
    const [eventSnap, refundSnap, paymentSnap] = await Promise.all([
      tx.get(eventRef), tx.get(refundRef), tx.get(paymentRef)
    ]);
    if (eventSnap.exists || refundSnap.exists) {
      const prior = refundSnap.exists ? refundSnap.data() : eventSnap.data();
      if (prior.refundId !== refund.id || prior.paymentId !== refund.payment_id ||
          prior.amount !== refund.amount || prior.currency !== refund.currency) {
        fail("refund_id_conflict", "Refund or event ID was reused for a different refund");
      }
      if (!paymentSnap.exists) fail("refund_ledger_inconsistent", "Refund payment ledger is missing");
      const current = paymentSnap.data();
      if (current.paymentId !== refund.payment_id || current.status !== "captured" && current.status !== "refunded") {
        fail("refund_ledger_inconsistent", "Refund payment ledger is inconsistent");
      }
      return { duplicate: true, revoked: current.status === "refunded", paymentId: refund.payment_id };
    }
    if (!paymentSnap.exists) fail("refund_payment_not_found", "Refund does not match a captured payment in this application");
    const payment = paymentSnap.data();
    if (payment.status !== "captured" || payment.paymentId !== refund.payment_id ||
        payment.currency !== refund.currency || !Number.isSafeInteger(payment.amount) ||
        payment.amount <= 0 || !Number.isSafeInteger(payment.amountRefunded || 0)) {
      fail("refund_payment_mismatch", "Refund does not match the captured payment ledger");
    }
    const nextAmountRefunded = (payment.amountRefunded || 0) + refund.amount;
    if (!Number.isSafeInteger(nextAmountRefunded) || nextAmountRefunded > payment.amount) {
      fail("refund_amount_exceeds_payment", "Processed refunds exceed the original captured payment");
    }
    const orderRef = db.doc("testSeriesPaymentOrders/" + payment.razorpayOrderId);
    const entitlementRef = db.doc("testSeriesEntitlements/" + payment.uid + "_" + payment.testId);
    const [orderSnap, entitlementSnap] = await Promise.all([tx.get(orderRef), tx.get(entitlementRef)]);
    if (!orderSnap.exists || !entitlementSnap.exists) {
      fail("refund_ledger_inconsistent", "Refund payment order or entitlement is missing");
    }
    const order = orderSnap.data(), entitlement = entitlementSnap.data();
    if (order.status !== "paid" || order.paymentId !== refund.payment_id ||
        order.uid !== payment.uid || order.testId !== payment.testId ||
        entitlement.status !== "active" || entitlement.paymentId !== refund.payment_id ||
        entitlement.uid !== payment.uid || entitlement.testId !== payment.testId) {
      fail("refund_ledger_inconsistent", "Refund order and entitlement do not match the captured payment");
    }

    const fullyRefunded = nextAmountRefunded === payment.amount;
    const record = {
      refundId: refund.id,
      paymentId: refund.payment_id,
      amount: refund.amount,
      currency: refund.currency,
      eventId,
      status: "processed",
      processedAt: FieldValue.serverTimestamp()
    };
    tx.create(refundRef, record);
    tx.create(eventRef, {
      eventId, refundId: refund.id, paymentId: refund.payment_id,
      uid: payment.uid, testId: payment.testId,
      amount: refund.amount, currency: refund.currency,
      status: "refund_processed", processedAt: FieldValue.serverTimestamp()
    });
    if (fullyRefunded) {
      tx.update(paymentRef, {
        status: "refunded",
        amountRefunded: nextAmountRefunded,
        refundedAt: FieldValue.serverTimestamp()
      });
      tx.update(orderRef, { status: "refunded", refundedAt: FieldValue.serverTimestamp() });
      tx.update(entitlementRef, { status: "revoked", revokedAt: FieldValue.serverTimestamp(), revokeReason: "full_refund" });
    } else {
      tx.update(paymentRef, { amountRefunded: nextAmountRefunded, updatedAt: FieldValue.serverTimestamp() });
    }
    return { duplicate: false, revoked: fullyRefunded, paymentId: refund.payment_id };
  });
}

module.exports = { applyProcessedRefund };
