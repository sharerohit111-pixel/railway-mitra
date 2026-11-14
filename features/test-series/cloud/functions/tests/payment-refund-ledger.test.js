"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { applyProcessedRefund } = require("../payment-refund-ledger");

function harness({ refundAmount = 49900 } = {}) {
  const docs = new Map([
    ["testSeriesPayments/pay_refund_1", { paymentId: "pay_refund_1", razorpayOrderId: "order_refund_1", uid: "student_1", testId: "test_1", amount: 49900, currency: "INR", status: "captured" }],
    ["testSeriesPaymentOrders/order_refund_1", { paymentId: "pay_refund_1", uid: "student_1", testId: "test_1", status: "paid" }],
    ["testSeriesEntitlements/student_1_test_1", { paymentId: "pay_refund_1", uid: "student_1", testId: "test_1", status: "active" }]
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
      refund: { entity: { id: "rfnd_1", payment_id: "pay_refund_1", amount: refundAmount, currency: "INR", status: "processed" } }
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
  const h = harness({ refundAmount: 10000 });
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

test("rejects refund identity, amount and payment mismatches", async () => {
  const h = harness();
  const badId = structuredClone(h.event);
  badId.payload.refund.entity.payment_id = "pay_other";
  await assert.rejects(() => applyProcessedRefund({ db: h.db, event: badId, eventId: "evt_bad_1" }), { code: "invalid_refund_event" });

  const badAmount = structuredClone(h.event);
  badAmount.payload.refund.entity.amount = 0;
  await assert.rejects(() => applyProcessedRefund({ db: h.db, event: badAmount, eventId: "evt_bad_2" }), { code: "invalid_refund_fields" });

  const mismatch = structuredClone(h.event);
  mismatch.payload.refund.entity.currency = "USD";
  await assert.rejects(() => applyProcessedRefund({ db: h.db, event: mismatch, eventId: "evt_bad_3" }), { code: "invalid_refund_fields" });
});

test("does not revoke access for refund events that are not processed", async () => {
  const h = harness();
  h.event.payload.refund.entity.status = "pending";
  await assert.rejects(() => applyProcessedRefund({ db: h.db, event: h.event, eventId: "evt_pending_1" }), { code: "invalid_refund_event" });
  assert.equal(h.docs.get("testSeriesEntitlements/student_1_test_1").status, "active");
});

test("separate partial refunds revoke access only when their cumulative total equals payment", async () => {
  const h = harness({ refundAmount: 20000 });
  await applyProcessedRefund({ db: h.db, event: h.event, eventId: "evt_partial_a" });
  const second = structuredClone(h.event);
  second.payload.refund.entity.id = "rfnd_2";
  second.payload.refund.entity.amount = 29900;
  const result = await applyProcessedRefund({ db: h.db, event: second, eventId: "evt_partial_b" });
  assert.equal(result.revoked, true);
  assert.equal(h.docs.get("testSeriesPayments/pay_refund_1").amountRefunded, 49900);
  assert.equal(h.docs.get("testSeriesEntitlements/student_1_test_1").status, "revoked");
});

test("rejects cumulative processed refunds above original payment amount", async () => {
  const h = harness({ refundAmount: 30000 });
  await applyProcessedRefund({ db: h.db, event: h.event, eventId: "evt_over_a" });
  const second = structuredClone(h.event);
  second.payload.refund.entity.id = "rfnd_over_2";
  second.payload.refund.entity.amount = 20000;
  await assert.rejects(() => applyProcessedRefund({ db: h.db, event: second, eventId: "evt_over_b" }), { code: "refund_amount_exceeds_payment" });
});
