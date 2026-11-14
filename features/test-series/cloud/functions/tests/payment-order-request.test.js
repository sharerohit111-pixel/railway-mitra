"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  PAYMENT_REQUEST_STATES,
  validatePaymentRequestId,
  paymentRequestDocumentId,
  paymentStudentTestLockDocumentId,
  inspectStudentTestPaymentLock,
  paymentRequestFingerprint,
  inspectPaymentRequest
} = require("../payment-order-request");

const base = {
  uid: "student_uid_123",
  testId: "gdce_je_civil",
  requestId: "d8a2f0c6-1c3b-4a75-9e2f-1b7a6c8d9e10",
  amount: 49900,
  currency: "INR"
};

test("validates a client-generated opaque request ID", () => {
  assert.equal(validatePaymentRequestId(base.requestId), base.requestId);
  for (const invalid of ["", "short", "contains spaces and symbols!", 123, null]) {
    assert.throws(() => validatePaymentRequestId(invalid), /random payment request ID/);
  }
});

test("scopes deterministic request document IDs to student, test and request ID", () => {
  const key = paymentRequestDocumentId(base);
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(paymentRequestDocumentId(base), key);
  assert.notEqual(paymentRequestDocumentId({ ...base, uid: "another_student" }), key);
  assert.notEqual(paymentRequestDocumentId({ ...base, testId: "another_test" }), key);
  assert.notEqual(paymentRequestDocumentId({ ...base, requestId: "e8a2f0c6-1c3b-4a75-9e2f-1b7a6c8d9e10" }), key);
});

test("student-test payment lock blocks a different tab request until explicit resolution", () => {
  const requestDocId = paymentRequestDocumentId(base);
  const lockId = paymentStudentTestLockDocumentId(base);
  assert.match(lockId, /^[a-f0-9]{64}$/);
  assert.equal(lockId, "a09e045f461f314b69cd9338ff0dc4c6b1b0487cb0058b47f43b221f99a03093");
  assert.equal(paymentStudentTestLockDocumentId(base), lockId);
  assert.notEqual(paymentStudentTestLockDocumentId({ ...base, uid: "another_student" }), lockId);
  assert.notEqual(paymentStudentTestLockDocumentId({ ...base, testId: "another_test" }), lockId);
  assert.deepEqual(inspectStudentTestPaymentLock(null, { ...base, requestDocId }), { action: "reserve" });
  const lock = { uid: base.uid, testId: base.testId, requestDocId, status: PAYMENT_REQUEST_STATES.CREATED };
  assert.deepEqual(inspectStudentTestPaymentLock(lock, { ...base, requestDocId }), {
    action: "continue", status: PAYMENT_REQUEST_STATES.CREATED
  });
  const anotherRequest = paymentRequestDocumentId({ ...base, requestId: "f8a2f0c6-1c3b-4a75-9e2f-1b7a6c8d9e10" });
  assert.deepEqual(inspectStudentTestPaymentLock(lock, { ...base, requestDocId: anotherRequest }), {
    action: "reject", reason: "another_payment_request_pending"
  });
  assert.equal(inspectStudentTestPaymentLock({ ...lock, status: "paid" }, { ...base, requestDocId }).action, "reconcile");
  assert.equal(inspectStudentTestPaymentLock({ ...lock, uid: "other" }, { ...base, requestDocId }).action, "reconcile");
});

test("fingerprint binds request ID to authoritative identity, amount and currency", () => {
  const fingerprint = paymentRequestFingerprint(base);
  assert.match(fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(paymentRequestFingerprint(base), fingerprint);
  assert.notEqual(paymentRequestFingerprint({ ...base, amount: 50000 }), fingerprint);
  assert.notEqual(paymentRequestFingerprint({ ...base, testId: "another_test" }), fingerprint);
  assert.notEqual(paymentRequestFingerprint({ ...base, uid: "another_student" }), fingerprint);
  assert.throws(() => paymentRequestFingerprint({ ...base, amount: 0 }), /valid INR amount/);
  assert.throws(() => paymentRequestFingerprint({ ...base, currency: "USD" }), /valid INR amount/);
});

test("new requests reserve, completed requests replay, and in-flight requests wait", () => {
  const fingerprint = paymentRequestFingerprint(base);
  assert.deepEqual(inspectPaymentRequest(null, fingerprint), { action: "reserve" });
  assert.deepEqual(inspectPaymentRequest({
    fingerprint, status: PAYMENT_REQUEST_STATES.CREATED, razorpayOrderId: "order_123"
  }, fingerprint), { action: "replay", orderId: "order_123" });
  assert.deepEqual(inspectPaymentRequest({
    fingerprint, status: PAYMENT_REQUEST_STATES.CREATING
  }, fingerprint), { action: "wait", reason: "provider_creation_in_progress" });
});

test("unknown outcomes require reconciliation and are never retried as fresh orders", () => {
  const fingerprint = paymentRequestFingerprint(base);
  assert.deepEqual(inspectPaymentRequest({
    fingerprint, status: PAYMENT_REQUEST_STATES.UNKNOWN
  }, fingerprint), { action: "reconcile", reason: "provider_outcome_unknown" });
  assert.deepEqual(inspectPaymentRequest({
    fingerprint, status: PAYMENT_REQUEST_STATES.FAILED
  }, fingerprint), { action: "reject", reason: "previous_attempt_failed_use_new_request_id" });
});

test("rejects request ID reuse when the payload changes or stored state is malformed", () => {
  const fingerprint = paymentRequestFingerprint(base);
  assert.deepEqual(inspectPaymentRequest({
    fingerprint: paymentRequestFingerprint({ ...base, amount: 100 }), status: "created", razorpayOrderId: "order_123"
  }, fingerprint), { action: "reject", reason: "request_id_payload_conflict" });
  assert.deepEqual(inspectPaymentRequest({
    fingerprint, status: "created"
  }, fingerprint), { action: "reconcile", reason: "created_order_id_missing" });
});
