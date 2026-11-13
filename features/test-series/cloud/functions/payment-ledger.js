"use strict";

const { FieldValue } = require("firebase-admin/firestore");
const { validateCapturedPayment } = require("./payment-validation");

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
      if (!orderSnap.exists || !paymentSnap.exists) {
        fail("event_ledger_inconsistent", "Previously processed event is missing its order or payment ledger record");
      }

      const order = orderSnap.data();
      const duplicateOrder = order.status === "paid" && order.paymentId === paymentId
        ? { ...order, status: "created" }
        : order;
      const duplicateValidation = validateCapturedPayment({ event, order: duplicateOrder });
      if (!duplicateValidation.valid) {
        fail("event_id_conflict", "Provider event ID was already used for a different payment payload");
      }

      const entitlementRef = db.doc("testSeriesEntitlements/" + duplicateValidation.uid + "_" + duplicateValidation.testId);
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
      const paymentMatches = previousPayment.status === "captured" && samePaymentRecord({
        paymentId: previousPayment.paymentId,
        razorpayOrderId: previousPayment.razorpayOrderId,
        uid: previousPayment.uid,
        testId: previousPayment.testId,
        amount: previousPayment.amount,
        currency: previousPayment.currency
      }, duplicateValidation);
      const orderMatches = order.status === "paid" &&
        order.paymentId === paymentId &&
        order.razorpayOrderId === duplicateValidation.orderId &&
        order.uid === duplicateValidation.uid &&
        order.testId === duplicateValidation.testId &&
        order.amount === duplicateValidation.amount &&
        order.currency === duplicateValidation.currency;
      const entitlementMatches = entitlement &&
        entitlement.status === "active" &&
        entitlement.uid === duplicateValidation.uid &&
        entitlement.testId === duplicateValidation.testId &&
        entitlement.paymentId === paymentId &&
        entitlement.razorpayOrderId === orderId &&
        entitlement.amount === duplicateValidation.amount &&
        entitlement.currency === duplicateValidation.currency;

      // A replay is a no-op only while the complete original ledger and access
      // grant still agree. Do not silently accept a damaged or partial record.
      if (!eventMatches || !paymentMatches || !orderMatches || !entitlementMatches) {
        fail("event_ledger_inconsistent", "Previously processed event is not backed by a complete matching payment ledger");
      }
      return { granted: false, duplicate: true, paymentId, orderId };
    }

    if (!orderSnap.exists) fail("order_not_found", "Server-created payment order was not found");
    const order = orderSnap.data();

    if (paymentSnap.exists) {
      // A repeated payment delivery may have a new provider event ID. Validate
      // the payload against the same trusted order, then confirm the original
      // transaction already committed both the paid order and entitlement.
      const duplicateOrder = order.status === "paid" && order.paymentId === paymentId
        ? { ...order, status: "created" }
        : order;
      const duplicateValidation = validateCapturedPayment({ event, order: duplicateOrder });
      if (!duplicateValidation.valid) {
        fail("payment_" + duplicateValidation.reason, "Repeated payment does not match the original order");
      }
      const previousPayment = paymentSnap.data();
      const entitlementRef = db.doc("testSeriesEntitlements/" + duplicateValidation.uid + "_" + duplicateValidation.testId);
      const entitlementSnap = await tx.get(entitlementRef);
      if (!samePaymentRecord({
        paymentId: previousPayment.paymentId,
        razorpayOrderId: previousPayment.razorpayOrderId,
        uid: previousPayment.uid,
        testId: previousPayment.testId,
        amount: previousPayment.amount,
        currency: previousPayment.currency
      }, duplicateValidation) ||
          order.status !== "paid" ||
          order.paymentId !== paymentId ||
          !entitlementSnap.exists ||
          entitlementSnap.data().status !== "active" ||
          entitlementSnap.data().paymentId !== paymentId) {
        fail("payment_id_conflict", "Payment ID is already recorded against a different or incomplete purchase");
      }
      tx.create(eventRef, {
        eventId,
        paymentId,
        razorpayOrderId: orderId,
        uid: duplicateValidation.uid,
        testId: duplicateValidation.testId,
        amount: duplicateValidation.amount,
        currency: duplicateValidation.currency,
        status: "duplicate",
        processedAt: FieldValue.serverTimestamp()
      });
      return { granted: false, duplicate: true, paymentId, orderId };
    }

    if (order.status !== "created") {
      fail("order_not_payable", "Payment order is not in the created state");
    }
    const validation = validateCapturedPayment({ event, order });
    if (!validation.valid) {
      fail("payment_" + validation.reason, "Captured payment does not match the server-created order");
    }

    const entitlementRef = db.doc("testSeriesEntitlements/" + validation.uid + "_" + validation.testId);
    const entitlementSnap = await tx.get(entitlementRef);
    if (entitlementSnap.exists) {
      fail("entitlement_conflict", "An entitlement already exists for this student and test");
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
