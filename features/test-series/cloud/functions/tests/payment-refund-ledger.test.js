"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { applyProcessedRefund } = require("../payment-refund-ledger");

function harness({ refundAmount = 49900, amountRefunded = 49900, refundStatus = "full" } = {}) {
  const docs = new Map([
    ["testSeriesPayments/pay_refund_1", { paymentId: "pay_refund_1", razorpayOrderId: "order_refund_1", uid: "student_1", testId: "test_1", amount: 49900, currency: "INR", status: "captured" }],
    ["testSeriesPaymentOrders/order_refund_1", { paymentId: "pay_refund_1", razorpayOrderId: "order_refund_1", uid: "student_1", testId: "test_1", amount: 49900, currency: "INR", status: "paid" }],
    ["testSeriesEntitlements/student_1_test_1", { paymentId: "pay_refund_1", razorpayOrderId: "order_refund_1", uid: "student_1", testId: "test_1", amount: 49900, currency: "INR", status: "active" }]
  ]);
  const db = {
    doc(path) { return { path }; },
    async runTransaction(fn) {
      const writes = [];
      const tx = {
        async get(ref) { return { exists: docs.has(ref.path), data: () => docs.get(ref.path) }; },
        create(ref, value) { writes.push(["create", ref.path, value]); },
        update(ref, value) { writes.push(["update", ref.path, value]); }
      };
      const result = await fn(tx);
      for (const [op, path, value] of writes) {
        if (op === "create" && docs.has(path)) throw new Error("already exists");
        docs.set(path, { ...(docs.get(path) || {}), ...value });
      }
      return result;
    }
  };
  const event = {
    event: "refund.processed",
    payload: {
      refund: { entity: { id: "rfnd_1", payment_id: "pay_refund_1", amount: refundAmount, currency: "INR", status: "processed" } },
      payment: { entity: { id: "pay_refund_1", amount: 49900, amount_refunded: amountRefunded, currency: "INR", refund_status: refundStatus, status: "captured" } }
    }
  };
  return { db, event, docs };
}

test("fully processed refund revokes matching paid access atomically", async () => {
  const h = harness();
  const result = await applyProcessedRefund({ db: h.db, event: h.event, eventId: "evt_refund_1" });
  assert.equal(result.revoked, true);
  assert.equal(h.docs.get("testSeriesPayments/pay_refund_1").status, "refunded");
  assert.equal(h.docs.get("testSeriesPaymentOrders/order_refund_1").status, "refunded");
  assert.equal(h.docs.get("testSeriesEntitlements/student_1_test_1").status, "revoked");
  assert.equal(h.docs.get("testSeriesRefunds/rfnd_1").status, "processed");
});

test("partial refund is recorded without revoking access", async () => {
  const h = harness({ refundAmount: 10000, amountRefunded: 10000, refundStatus: "partial" });
  const result = await applyProcessedRefund({ db: h.db, event: h.event, eventId: "evt_partial_1" });
  assert.equal(result.revoked, false);
  assert.equal(h.docs.get("testSeriesPayments/pay_refund_1").status, "captured");
  assert.equal(h.docs.get("testSeriesPayments/pay_refund_1").amountRefunded, 10000);
  assert.equal(h.docs.get("testSeriesEntitlements/student_1_test_1").status, "active");
  assert.equal(h.docs.get("testSeriesRefunds/rfnd_1").status, "processed");
});

test("duplicate refund delivery is idempotent", async () => {
  const h = harness();
  await applyProcessedRefund({ db: h.db, event: h.event, eventId: "evt_refund_1" });
  const duplicate = await applyProcessedRefund({ db: h.db, event: h.event, eventId: "evt_refund_1" });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.revoked, true);
});

test("duplicate refund replay fails closed when the entitlement has drifted", async () => {
  const h = harness();
  await applyProcessedRefund({ db: h.db, event: h.event, eventId: "evt_refund_drift" });
  h.docs.set("testSeriesEntitlements/student_1_test_1", {
    ...h.docs.get("testSeriesEntitlements/student_1_test_1"),
    status: "active"
  });
  await assert.rejects(
    () => applyProcessedRefund({ db: h.db, event: h.event, eventId: "evt_refund_drift" }),
    { code: "refund_ledger_inconsistent" }
  );
});

test("same refund under a new event ID verifies the original event and stays write-free", async () => {
  const h = harness();
  await applyProcessedRefund({ db: h.db, event: h.event, eventId: "evt_refund_original" });
  const duplicate = await applyProcessedRefund({ db: h.db, event: h.event, eventId: "evt_refund_delivery_2" });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.revoked, true);
  assert.equal(h.docs.has("testSeriesPaymentEvents/evt_refund_delivery_2"), false);
});

test("new-event refund replay fails when the original event record is missing", async () => {
  const h = harness();
  await applyProcessedRefund({ db: h.db, event: h.event, eventId: "evt_refund_original_missing" });
  h.docs.delete("testSeriesPaymentEvents/evt_refund_original_missing");
  await assert.rejects(
    () => applyProcessedRefund({ db: h.db, event: h.event, eventId: "evt_refund_delivery_after_missing" }),
    { code: "refund_ledger_inconsistent" }
  );
});

test("event ledger without its refund record is not acknowledged as a duplicate", async () => {
  const h = harness();
  await applyProcessedRefund({ db: h.db, event: h.event, eventId: "evt_refund_partial_record" });
  h.docs.delete("testSeriesRefunds/rfnd_1");
  await assert.rejects(
    () => applyProcessedRefund({ db: h.db, event: h.event, eventId: "evt_refund_partial_record" }),
    { code: "refund_ledger_inconsistent" }
  );
});

test("rejects impossible stored cumulative refund state", async () => {
  const h = harness();
  h.docs.set("testSeriesPayments/pay_refund_1", {
    ...h.docs.get("testSeriesPayments/pay_refund_1"),
    amountRefunded: 50000
  });
  await assert.rejects(
    () => applyProcessedRefund({ db: h.db, event: h.event, eventId: "evt_bad_stored_refund_total" }),
    { code: "refund_ledger_inconsistent" }
  );
});

test("rejects a provider refund status that contradicts its cumulative amount", async () => {
  const h = harness({ refundAmount: 10000, amountRefunded: 10000, refundStatus: "full" });
  await assert.rejects(
    () => applyProcessedRefund({ db: h.db, event: h.event, eventId: "evt_bad_provider_refund_status" }),
    { code: "invalid_refund_fields" }
  );
});

test("rejects refund identity, amount and payment mismatches", async () => {
  const h = harness();
  const badId = structuredClone(h.event);
  badId.payload.refund.entity.payment_id = "pay_other";
  await assert.rejects(() => applyProcessedRefund({ db: h.db, event: badId, eventId: "evt_bad_1" }), { code: "invalid_refund_event" });

  const badAmount = structuredClone(h.event);
  badAmount.payload.refund.entity.amount = 0;
  await assert.rejects(() => applyProcessedRefund({ db: h.db, event: badAmount, eventId: "evt_bad_2" }), { code: "invalid_refund_fields" });

  const mismatch = structuredClone(h.event);
  mismatch.payload.payment.entity.amount = 50000;
  await assert.rejects(() => applyProcessedRefund({ db: h.db, event: mismatch, eventId: "evt_bad_3" }), { code: "refund_payment_mismatch" });
});

test("does not revoke access for refund events that are not processed", async () => {
  const h = harness();
  h.event.payload.refund.entity.status = "pending";
  await assert.rejects(() => applyProcessedRefund({ db: h.db, event: h.event, eventId: "evt_pending_1" }), { code: "invalid_refund_event" });
  assert.equal(h.docs.get("testSeriesEntitlements/student_1_test_1").status, "active");
});

test("separate partial refunds revoke access only when their cumulative total equals payment", async () => {
  const h = harness({ refundAmount: 20000, amountRefunded: 20000, refundStatus: "partial" });
  await applyProcessedRefund({ db: h.db, event: h.event, eventId: "evt_partial_a" });
  const second = structuredClone(h.event);
  second.payload.refund.entity.id = "rfnd_2";
  second.payload.refund.entity.amount = 29900;
  second.payload.payment.entity.amount_refunded = 49900;
  second.payload.payment.entity.refund_status = "full";
  const result = await applyProcessedRefund({ db: h.db, event: second, eventId: "evt_partial_b" });
  assert.equal(result.revoked, true);
  assert.equal(h.docs.get("testSeriesPayments/pay_refund_1").amountRefunded, 49900);
  assert.equal(h.docs.get("testSeriesEntitlements/student_1_test_1").status, "revoked");
});

test("rejects a provider cumulative refund snapshot above the original payment amount", async () => {
  const h = harness({ refundAmount: 30000, amountRefunded: 30000, refundStatus: "partial" });
  await applyProcessedRefund({ db: h.db, event: h.event, eventId: "evt_over_a" });
  const second = structuredClone(h.event);
  second.payload.refund.entity.id = "rfnd_over_2";
  second.payload.refund.entity.amount = 20000;
  second.payload.payment.entity.amount_refunded = 50000;
  second.payload.payment.entity.refund_status = "full";
  // The provider snapshot itself is impossible (₹500 > the ₹499 payment),
  // so validation rejects it before the transaction/ledger comparison.
  await assert.rejects(() => applyProcessedRefund({ db: h.db, event: second, eventId: "evt_over_b" }), { code: "invalid_refund_fields" });
});


test("older partial-refund webhook arriving after full refund cannot reactivate access", async () => {
  const h = harness();
  await applyProcessedRefund({ db: h.db, event: h.event, eventId: "evt_full_first" });
  const older = structuredClone(h.event);
  older.payload.refund.entity.id = "rfnd_older_partial";
  older.payload.refund.entity.amount = 10000;
  older.payload.payment.entity.amount_refunded = 10000;
  older.payload.payment.entity.refund_status = "partial";
  const result = await applyProcessedRefund({ db: h.db, event: older, eventId: "evt_old_partial" });
  assert.equal(result.revoked, true);
  assert.equal(h.docs.get("testSeriesPayments/pay_refund_1").status, "refunded");
  assert.equal(h.docs.get("testSeriesEntitlements/student_1_test_1").status, "revoked");
  assert.equal(h.docs.get("testSeriesPayments/pay_refund_1").amountRefunded, 49900);
});
