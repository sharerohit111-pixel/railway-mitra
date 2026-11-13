"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  getPaidEntitlementLedgerReferences,
  validatePaidEntitlement
} = require("../payment-entitlement");

const validRecords = () => {
  const uid = "student_uid_1";
  const testId = "test_1";
  const entitlement = {
    uid, testId, status: "active",
    paymentId: "pay_123", razorpayOrderId: "order_123",
    amount: 49900, currency: "INR"
  };
  const payment = {
    paymentId: "pay_123", razorpayOrderId: "order_123",
    uid, testId, status: "captured", amount: 49900, currency: "INR"
  };
  const order = {
    razorpayOrderId: "order_123", paymentId: "pay_123",
    uid, testId, status: "paid", amount: 49900, currency: "INR"
  };
  return { uid, testId, entitlement, payment, order };
};

test("accepts only a complete matching active entitlement, captured payment and paid order", () => {
  const records = validRecords();
  assert.deepEqual(getPaidEntitlementLedgerReferences(records), {
    paymentId: "pay_123", orderId: "order_123"
  });
  assert.deepEqual(validatePaidEntitlement(records), {
    valid: true, paymentId: "pay_123", orderId: "order_123",
    amount: 49900, currency: "INR"
  });
});

test("rejects missing, inactive, cross-student and cross-test entitlements", () => {
  const records = validRecords();
  for (const entitlement of [
    null,
    { ...records.entitlement, status: "revoked" },
    { ...records.entitlement, uid: "another_student" },
    { ...records.entitlement, testId: "another_test" }
  ]) {
    assert.equal(getPaidEntitlementLedgerReferences({ ...records, entitlement }), null);
    assert.equal(validatePaidEntitlement({ ...records, entitlement }).valid, false);
  }
});

test("rejects unsafe payment and order IDs before Firestore path construction", () => {
  const records = validRecords();
  for (const entitlement of [
    { ...records.entitlement, paymentId: "../other" },
    { ...records.entitlement, razorpayOrderId: "order/other" },
    { ...records.entitlement, paymentId: "" }
  ]) {
    assert.equal(getPaidEntitlementLedgerReferences({ ...records, entitlement }), null);
  }
});

test("rejects invalid amount and currency in the entitlement", () => {
  const records = validRecords();
  for (const patch of [
    { amount: 0 },
    { amount: -1 },
    { amount: 49900.5 },
    { amount: Number.NaN },
    { amount: Number.POSITIVE_INFINITY },
    { currency: "USD" }
  ]) {
    assert.equal(validatePaidEntitlement({
      ...records, entitlement: { ...records.entitlement, ...patch }
    }).valid, false);
  }
});

test("rejects any mismatch or non-captured state in the payment ledger", () => {
  const records = validRecords();
  for (const payment of [
    null,
    { ...records.payment, status: "authorized" },
    { ...records.payment, paymentId: "pay_other" },
    { ...records.payment, razorpayOrderId: "order_other" },
    { ...records.payment, uid: "another_student" },
    { ...records.payment, testId: "another_test" },
    { ...records.payment, amount: 1 },
    { ...records.payment, currency: "USD" }
  ]) {
    assert.equal(validatePaidEntitlement({ ...records, payment }).valid, false);
  }
});

test("rejects any mismatch or non-paid state in the provider order ledger", () => {
  const records = validRecords();
  for (const order of [
    null,
    { ...records.order, status: "created" },
    { ...records.order, paymentId: "pay_other" },
    { ...records.order, razorpayOrderId: "order_other" },
    { ...records.order, uid: "another_student" },
    { ...records.order, testId: "another_test" },
    { ...records.order, amount: 1 },
    { ...records.order, currency: "USD" }
  ]) {
    assert.equal(validatePaidEntitlement({ ...records, order }).valid, false);
  }
});
