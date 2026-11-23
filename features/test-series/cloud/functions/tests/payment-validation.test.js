"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validateCapturedPayment } = require("../payment-validation");

function fixture() {
  return {
    order: {
      uid: "student_uid_01",
      testId: "paid_test_01",
      razorpayOrderId: "order_server_123",
      amount: 49900,
      currency: "INR",
      status: "created"
    },
    event: {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_captured_123",
            order_id: "order_server_123",
            amount: 49900,
            currency: "INR",
            status: "captured",
            notes: { uid: "attacker_uid", testId: "another_test" }
          }
        }
      }
    }
  };
}

test("captured payment is bound to the trusted server order identity", () => {
  const { order, event } = fixture();
  const result = validateCapturedPayment({ order, event });

  assert.deepEqual(result, {
    valid: true,
    paymentId: "pay_captured_123",
    orderId: "order_server_123",
    uid: "student_uid_01",
    testId: "paid_test_01",
    amount: 49900,
    currency: "INR"
  });
  // Deliberately conflicting payment notes never override the server-created order.
  assert.notEqual(result.uid, event.payload.payment.entity.notes.uid);
  assert.notEqual(result.testId, event.payload.payment.entity.notes.testId);
});

test("unsupported webhook events and non-captured payments are rejected", () => {
  const { order, event } = fixture();
  assert.equal(validateCapturedPayment({ order, event: { ...event, event: "payment.authorized" } }).reason, "unsupported_event");

  const authorized = structuredClone(event);
  authorized.payload.payment.entity.status = "authorized";
  assert.equal(validateCapturedPayment({ order, event: authorized }).reason, "payment_not_captured");
});

test("payment must match the server order ID, amount and currency exactly", () => {
  const { order, event } = fixture();

  const wrongOrder = structuredClone(event);
  wrongOrder.payload.payment.entity.order_id = "order_other";
  assert.equal(validateCapturedPayment({ order, event: wrongOrder }).reason, "order_mismatch");

  const wrongAmount = structuredClone(event);
  wrongAmount.payload.payment.entity.amount = 1;
  assert.equal(validateCapturedPayment({ order, event: wrongAmount }).reason, "amount_mismatch");

  const wrongCurrency = structuredClone(event);
  wrongCurrency.payload.payment.entity.currency = "USD";
  assert.equal(validateCapturedPayment({ order, event: wrongCurrency }).reason, "currency_mismatch");
});

test("missing or malformed payment fields and untrusted order records are rejected", () => {
  const { order, event } = fixture();
  const noPaymentId = structuredClone(event);
  delete noPaymentId.payload.payment.entity.id;
  assert.equal(validateCapturedPayment({ order, event: noPaymentId }).reason, "invalid_payment_fields");

  assert.equal(validateCapturedPayment({ order: { ...order, status: "paid" }, event }).reason, "invalid_server_order");
  assert.equal(validateCapturedPayment({ order: { ...order, amount: 0 }, event }).reason, "invalid_server_order");
  assert.equal(validateCapturedPayment({ order: { ...order, uid: "bad uid" }, event }).reason, "invalid_server_order");
  assert.equal(validateCapturedPayment({ order: null, event }).reason, "invalid_server_order");
  assert.equal(validateCapturedPayment({ order, event: null }).reason, "unsupported_event");
});
