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

// A duplicate provider delivery is acknowledged only while every authoritative
// record still agrees. Captured payments may have a partial cumulative refund;
// refunded payments must be fully refunded and have revoked access.
function validateRefundLedgerRecords({ payment, paymentId, order, entitlement } = {}) {
  const amountRefunded = payment && payment.amountRefunded === undefined ? 0 : payment && payment.amountRefunded;
  const identityValid = payment &&
    payment.paymentId === paymentId &&
    safeId(payment.razorpayOrderId) &&
    safeId(payment.uid) &&
    safeId(payment.testId) &&
    Number.isSafeInteger(payment.amount) && payment.amount > 0 &&
    typeof payment.currency === "string" && /^[A-Z]{3}$/.test(payment.currency) &&
    Number.isSafeInteger(amountRefunded) && amountRefunded >= 0 && amountRefunded <= payment.amount;
  const isCaptured = identityValid && payment.status === "captured" && amountRefunded < payment.amount;
  const isRefunded = identityValid && payment.status === "refunded" && amountRefunded === payment.amount;
  const expectedOrderStatus = isRefunded ? "refunded" : "paid";
  const expectedEntitlementStatus = isRefunded ? "revoked" : "active";
  const orderMatches = (isCaptured || isRefunded) && order &&
    order.status === expectedOrderStatus &&
    order.paymentId === paymentId &&
    order.razorpayOrderId === payment.razorpayOrderId &&
    order.uid === payment.uid &&
    order.testId === payment.testId &&
    order.amount === payment.amount &&
    order.currency === payment.currency;
  const entitlementMatches = (isCaptured || isRefunded) && entitlement &&
    entitlement.status === expectedEntitlementStatus &&
    entitlement.paymentId === paymentId &&
    entitlement.razorpayOrderId === payment.razorpayOrderId &&
    entitlement.uid === payment.uid &&
    entitlement.testId === payment.testId &&
    entitlement.amount === payment.amount &&
    entitlement.currency === payment.currency;

  if (!orderMatches || !entitlementMatches) {
    fail("refund_ledger_inconsistent", "Refund payment, order and entitlement records are not consistent");
  }
  return amountRefunded;
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
  const providerPayment = event && event.payload && event.payload.payment && event.payload.payment.entity;
  if (!event || event.event !== "refund.processed" || !refund || refund.status !== "processed" ||
      !providerPayment || providerPayment.id !== refund.payment_id) {
    fail("invalid_refund_event", "A processed refund and its matching payment snapshot are required");
  }
  const providerRefundSnapshotValid = providerPayment &&
    (providerPayment.refund_status === "full"
      ? providerPayment.amount_refunded === providerPayment.amount
      : providerPayment.refund_status === "partial" && providerPayment.amount_refunded < providerPayment.amount);
  if (!safeId(refund.id) || !safeId(refund.payment_id) ||
      !Number.isSafeInteger(refund.amount) || refund.amount <= 0 ||
      !Number.isSafeInteger(providerPayment.amount) || providerPayment.amount <= 0 ||
      !Number.isSafeInteger(providerPayment.amount_refunded) ||
      providerPayment.amount_refunded < refund.amount ||
      providerPayment.amount_refunded > providerPayment.amount ||
      !providerRefundSnapshotValid ||
      typeof refund.currency !== "string" || !/^[A-Z]{3}$/.test(refund.currency) ||
      providerPayment.currency !== refund.currency) {
    fail("invalid_refund_fields", "Refund amount, currency or provider payment snapshot is invalid");
  }

  const paymentRef = db.doc("testSeriesPayments/" + refund.payment_id);
  const eventRef = db.doc("testSeriesPaymentEvents/" + eventId);
  const refundRef = db.doc("testSeriesRefunds/" + refund.id);

  return db.runTransaction(async tx => {
    const [eventSnap, refundSnap, paymentSnap] = await Promise.all([
      tx.get(eventRef), tx.get(refundRef), tx.get(paymentRef)
    ]);

    if (eventSnap.exists || refundSnap.exists) {
      // Event and refund records are created atomically. An event without its
      // refund record is corruption, not a safe duplicate acknowledgement.
      if (eventSnap.exists && !refundSnap.exists) {
        fail("refund_ledger_inconsistent", "Processed refund event is missing its refund ledger record");
      }
      let priorEvent = null;
      if (refundSnap.exists) {
        const priorRefund = refundSnap.data();
        if (priorRefund.status !== "processed" ||
            priorRefund.refundId !== refund.id ||
            priorRefund.paymentId !== refund.payment_id ||
            priorRefund.amount !== refund.amount ||
            priorRefund.currency !== refund.currency ||
            !safeId(priorRefund.eventId)) {
          fail("refund_id_conflict", "Refund ID was reused for a different or incomplete refund");
        }
        if (eventSnap.exists && priorRefund.eventId !== eventId) {
          fail("refund_id_conflict", "Provider event ID was already used for a different refund delivery");
        }
        const originalEventSnap = priorRefund.eventId === eventId
          ? eventSnap
          : await tx.get(db.doc("testSeriesPaymentEvents/" + priorRefund.eventId));
        if (!originalEventSnap.exists) {
          fail("refund_ledger_inconsistent", "Refund record is missing its original event record");
        }
        priorEvent = originalEventSnap.data();
        if (priorEvent.eventId !== priorRefund.eventId ||
            priorEvent.status !== "refund_processed" ||
            priorEvent.refundId !== refund.id ||
            priorEvent.paymentId !== refund.payment_id ||
            priorEvent.amount !== refund.amount ||
            priorEvent.currency !== refund.currency) {
          fail("refund_ledger_inconsistent", "Original refund event does not match its refund record");
        }
      }
      if (eventSnap.exists) {
        const currentEvent = eventSnap.data();
        if (currentEvent.eventId !== eventId ||
            currentEvent.status !== "refund_processed" ||
            currentEvent.refundId !== refund.id ||
            currentEvent.paymentId !== refund.payment_id ||
            currentEvent.amount !== refund.amount ||
            currentEvent.currency !== refund.currency) {
          fail("refund_id_conflict", "Provider event ID was reused for a different refund");
        }
      }
      if (!paymentSnap.exists) fail("refund_ledger_inconsistent", "Refund payment ledger is missing");
      const current = paymentSnap.data();
      if (current.paymentId !== refund.payment_id ||
          current.amount !== providerPayment.amount ||
          current.currency !== refund.currency) {
        fail("refund_ledger_inconsistent", "Refund payment ledger does not match the provider snapshot");
      }
      const orderRef = db.doc("testSeriesPaymentOrders/" + current.razorpayOrderId);
      const entitlementRef = db.doc("testSeriesEntitlements/" + current.uid + "_" + current.testId);
      const [orderSnap, entitlementSnap] = await Promise.all([tx.get(orderRef), tx.get(entitlementRef)]);
      if (!orderSnap.exists || !entitlementSnap.exists) {
        fail("refund_ledger_inconsistent", "Refund payment order or entitlement is missing");
      }
      const amountRefunded = validateRefundLedgerRecords({
        payment: current,
        paymentId: refund.payment_id,
        order: orderSnap.data(),
        entitlement: entitlementSnap.data()
      });
      if (priorEvent && (priorEvent.uid !== current.uid || priorEvent.testId !== current.testId)) {
        fail("refund_ledger_inconsistent", "Refund event identity does not match its payment ledger");
      }
      return {
        duplicate: true,
        revoked: current.status === "refunded" && amountRefunded === current.amount,
        paymentId: refund.payment_id
      };
    }

    if (!paymentSnap.exists) fail("refund_payment_not_found", "Refund does not match a captured payment in this application");
    const payment = paymentSnap.data();
    if (payment.paymentId !== refund.payment_id ||
        payment.amount !== providerPayment.amount ||
        payment.currency !== refund.currency) {
      fail("refund_payment_mismatch", "Refund does not match the captured payment ledger");
    }
    const orderRef = db.doc("testSeriesPaymentOrders/" + payment.razorpayOrderId);
    const entitlementRef = db.doc("testSeriesEntitlements/" + payment.uid + "_" + payment.testId);
    const [orderSnap, entitlementSnap] = await Promise.all([tx.get(orderRef), tx.get(entitlementRef)]);
    if (!orderSnap.exists || !entitlementSnap.exists) {
      fail("refund_ledger_inconsistent", "Refund payment order or entitlement is missing");
    }
    const previousAmountRefunded = validateRefundLedgerRecords({
      payment,
      paymentId: refund.payment_id,
      order: orderSnap.data(),
      entitlement: entitlementSnap.data()
    });

    // Razorpay webhook deliveries are not guaranteed to arrive in order.
    // Keep the highest cumulative amount_refunded snapshot and never regress
    // a previously completed full refund when an older event arrives later.
    const nextAmountRefunded = Math.max(previousAmountRefunded, providerPayment.amount_refunded);
    const alreadyRevoked = payment.status === "refunded";
    const fullyRefunded = alreadyRevoked || nextAmountRefunded === payment.amount;
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
    if (fullyRefunded && !alreadyRevoked) {
      tx.update(paymentRef, {
        status: "refunded",
        amountRefunded: nextAmountRefunded,
        refundedAt: FieldValue.serverTimestamp()
      });
      tx.update(orderRef, { status: "refunded", refundedAt: FieldValue.serverTimestamp() });
      tx.update(entitlementRef, { status: "revoked", revokedAt: FieldValue.serverTimestamp(), revokeReason: "full_refund" });
    } else if (!alreadyRevoked) {
      tx.update(paymentRef, { amountRefunded: nextAmountRefunded, updatedAt: FieldValue.serverTimestamp() });
    }
    return { duplicate: false, revoked: fullyRefunded, paymentId: refund.payment_id };
  });
}

module.exports = { applyProcessedRefund };
