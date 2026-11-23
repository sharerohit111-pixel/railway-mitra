"use strict";

const { FieldValue } = require("firebase-admin/firestore");
const { validateCapturedPayment } = require("./payment-validation");
const { paymentStudentTestLockDocumentId } = require("./payment-order-request");
const { paidEntitlementDocumentId } = require("./payment-entitlement");

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function safeDocumentId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function samePaymentRecord(record, payment) {
  return record.paymentId === payment.paymentId &&
    record.razorpayOrderId === payment.orderId &&
    record.uid === payment.uid &&
    record.testId === payment.testId &&
    record.amount === payment.amount &&
    record.currency === payment.currency;
}

/**
 * A verified capture webhook may be redelivered after a full refund has
 * already committed. Treat it as a no-op only when the complete payment,
 * order and revoked-entitlement ledger still agrees. Partial refunds remain
 * captured/paid/active; a full refund must be refunded/refunded/revoked.
 */
function matchesExistingPaymentState({ payment, order, entitlement, paymentId, orderId, validation } = {}) {
  if (!payment || !order || !entitlement || !validation) return false;
  const amountRefunded = payment.amountRefunded === undefined ? 0 : payment.amountRefunded;
  const isCaptured = payment.status === "captured" &&
    Number.isSafeInteger(amountRefunded) && amountRefunded >= 0 && amountRefunded < validation.amount;
  const isRefunded = payment.status === "refunded" &&
    Number.isSafeInteger(amountRefunded) && amountRefunded === validation.amount;
  if (!isCaptured && !isRefunded) return false;

  const expectedOrderStatus = isRefunded ? "refunded" : "paid";
  const expectedEntitlementStatus = isRefunded ? "revoked" : "active";
  return samePaymentRecord({
    paymentId: payment.paymentId,
    razorpayOrderId: payment.razorpayOrderId,
    uid: payment.uid,
    testId: payment.testId,
    amount: payment.amount,
    currency: payment.currency
  }, validation) &&
    order.status === expectedOrderStatus &&
    order.paymentId === paymentId &&
    order.razorpayOrderId === orderId &&
    order.uid === validation.uid &&
    order.testId === validation.testId &&
    order.amount === validation.amount &&
    order.currency === validation.currency &&
    entitlement.status === expectedEntitlementStatus &&
    entitlement.uid === validation.uid &&
    entitlement.testId === validation.testId &&
    entitlement.paymentId === paymentId &&
    entitlement.razorpayOrderId === orderId &&
    entitlement.amount === validation.amount &&
    entitlement.currency === validation.currency;
}

/**
 * Atomically records a signature-verified captured payment and grants one
 * entitlement. Call only after the HTTP webhook's raw-body signature passes.
 *
 * The server-created order is re-read inside the transaction. Event IDs and
 * payment IDs are independently unique so provider retries and alternate event
 * deliveries cannot create a second entitlement.
 */
async function applyCapturedPayment({ db, event, eventId } = {}) {
  if (!db || typeof db.runTransaction !== "function" || typeof db.doc !== "function") {
    fail("invalid_database", "A Firestore database instance is required");
  }
  if (!safeDocumentId(eventId)) fail("invalid_event_id", "A valid provider event ID is required");

  const paymentEntity = event && event.payload && event.payload.payment && event.payload.payment.entity;
  if (!event || event.event !== "payment.captured" || !paymentEntity || paymentEntity.status !== "captured") {
    fail("payment_not_captured", "Only a captured-payment event can grant access");
  }
  const paymentId = paymentEntity && paymentEntity.id;
  const orderId = paymentEntity && paymentEntity.order_id;
  if (!safeDocumentId(paymentId) || !safeDocumentId(orderId)) {
    fail("invalid_payment_identity", "Captured payment and order IDs are required");
  }

  const orderRef = db.doc("testSeriesPaymentOrders/" + orderId);
  const eventRef = db.doc("testSeriesPaymentEvents/" + eventId);
  const paymentRef = db.doc("testSeriesPayments/" + paymentId);

  return db.runTransaction(async tx => {
    const [eventSnap, paymentSnap, orderSnap] = await Promise.all([
      tx.get(eventRef),
      tx.get(paymentRef),
      tx.get(orderRef)
    ]);

    if (eventSnap.exists) {
      const previousEvent = eventSnap.data();
      // Reusing an event ID for another payment/order is a conflict even when
      // the alternate payment has no ledger document yet. Check identity before
      // looking up the alternate payment's ledger records.
      if (previousEvent.paymentId !== paymentId || previousEvent.razorpayOrderId !== orderId) {
        fail("event_id_conflict", "Provider event ID was already used for a different payment payload");
      }
      if (!orderSnap.exists || !paymentSnap.exists) {
        fail("event_ledger_inconsistent", "Previously processed event is missing its order or payment ledger record");
      }

      const order = orderSnap.data();
      const duplicateOrder = ["paid", "refunded"].includes(order.status) && order.paymentId === paymentId
        ? { ...order, status: "created" }
        : order;
      const duplicateValidation = validateCapturedPayment({ event, order: duplicateOrder });
      if (!duplicateValidation.valid) {
        fail("event_id_conflict", "Provider event ID was already used for a different payment payload");
      }

      const entitlementRef = db.doc("testSeriesEntitlements/" + paidEntitlementDocumentId(duplicateValidation.uid, duplicateValidation.testId));
      const entitlementSnap = await tx.get(entitlementRef);
      const previousPayment = paymentSnap.data();
      const entitlement = entitlementSnap.exists ? entitlementSnap.data() : null;
      const eventMatches = previousEvent.eventId === eventId &&
        (previousEvent.status === "processed" || previousEvent.status === "duplicate") &&
        previousEvent.paymentId === paymentId &&
        previousEvent.razorpayOrderId === orderId &&
        previousEvent.uid === duplicateValidation.uid &&
        previousEvent.testId === duplicateValidation.testId &&
        previousEvent.amount === duplicateValidation.amount &&
        previousEvent.currency === duplicateValidation.currency;
      const ledgerMatches = matchesExistingPaymentState({
        payment: previousPayment, order, entitlement, paymentId, orderId,
        validation: duplicateValidation
      });

      // A replay is a no-op only while the complete payment/order/entitlement
      // state agrees. A fully refunded purchase is terminal: acknowledge its
      // old capture event without restoring the revoked entitlement.
      if (!eventMatches || !ledgerMatches) {
        fail("event_ledger_inconsistent", "Previously processed event is not backed by a complete matching payment ledger");
      }
      return {
        granted: false, duplicate: true, paymentId, orderId,
        refunded: previousPayment.status === "refunded"
      };
    }

    if (!orderSnap.exists) fail("order_not_found", "Server-created payment order was not found");
    const order = orderSnap.data();

    if (paymentSnap.exists) {
      // A repeated payment delivery may have a new provider event ID. Validate
      // the payload against the same trusted order, then confirm the original
      // transaction already committed both the paid order and entitlement.
      const duplicateOrder = ["paid", "refunded"].includes(order.status) && order.paymentId === paymentId
        ? { ...order, status: "created" }
        : order;
      const duplicateValidation = validateCapturedPayment({ event, order: duplicateOrder });
      if (!duplicateValidation.valid) {
        fail("payment_" + duplicateValidation.reason, "Repeated payment does not match the original order");
      }
      const previousPayment = paymentSnap.data();
      const entitlementRef = db.doc("testSeriesEntitlements/" + paidEntitlementDocumentId(duplicateValidation.uid, duplicateValidation.testId));
      const entitlementSnap = await tx.get(entitlementRef);
      const entitlement = entitlementSnap.exists ? entitlementSnap.data() : null;
      if (!matchesExistingPaymentState({
        payment: previousPayment, order, entitlement, paymentId, orderId,
        validation: duplicateValidation
      })) {
        fail("payment_id_conflict", "Payment ID is already recorded against a different or incomplete purchase");
      }
      // The provider event ID is supplied in a header, outside the raw-body
      // HMAC. Once this payment is already ledgered, do not create an audit
      // document for each caller-selected replay ID: a captured signed payload
      // could otherwise amplify Firestore writes without changing access.
      // A terminal full-refund ledger is also acknowledged as a no-op; it can
      // never reactivate the revoked entitlement.
      return {
        granted: false, duplicate: true, paymentId, orderId,
        refunded: previousPayment.status === "refunded"
      };
    }

    if (order.status !== "created") {
      fail("order_not_payable", "Payment order is not in the created state");
    }
    const validation = validateCapturedPayment({ event, order });
    if (!validation.valid) {
      fail("payment_" + validation.reason, "Captured payment does not match the server-created order");
    }

    const entitlementRef = db.doc("testSeriesEntitlements/" + paidEntitlementDocumentId(validation.uid, validation.testId));
    const paymentLockRef = db.doc("testSeriesPaymentLocks/" + paymentStudentTestLockDocumentId({
      uid: validation.uid, testId: validation.testId
    }));
    const [entitlementSnap, paymentLockSnap] = await Promise.all([
      tx.get(entitlementRef), tx.get(paymentLockRef)
    ]);
    if (entitlementSnap.exists) {
      fail("entitlement_conflict", "An entitlement already exists for this student and test");
    }
    if (paymentLockSnap.exists && (
      !order.paymentRequestId ||
      paymentLockSnap.data().requestDocId !== order.paymentRequestId ||
      paymentLockSnap.data().uid !== validation.uid ||
      paymentLockSnap.data().testId !== validation.testId
    )) {
      fail("payment_lock_conflict", "The student-test payment lock does not match the captured order");
    }

    const ledgerRecord = {
      paymentId: validation.paymentId,
      razorpayOrderId: validation.orderId,
      uid: validation.uid,
      testId: validation.testId,
      amount: validation.amount,
      currency: validation.currency
    };
    tx.create(paymentRef, {
      ...ledgerRecord,
      firstEventId: eventId,
      status: "captured",
      recordedAt: FieldValue.serverTimestamp()
    });
    tx.create(eventRef, {
      eventId,
      ...ledgerRecord,
      status: "processed",
      processedAt: FieldValue.serverTimestamp()
    });
    tx.update(orderRef, {
      status: "paid",
      paymentId: validation.paymentId,
      paidAt: FieldValue.serverTimestamp()
    });
    tx.create(entitlementRef, {
      uid: validation.uid,
      testId: validation.testId,
      status: "active",
      paymentId: validation.paymentId,
      razorpayOrderId: validation.orderId,
      amount: validation.amount,
      currency: validation.currency,
      grantedAt: FieldValue.serverTimestamp()
    });
    if (paymentLockSnap.exists) tx.delete(paymentLockRef);

    return {
      granted: true,
      duplicate: false,
      paymentId: validation.paymentId,
      orderId: validation.orderId,
      uid: validation.uid,
      testId: validation.testId
    };
  });
}

module.exports = { applyCapturedPayment };
