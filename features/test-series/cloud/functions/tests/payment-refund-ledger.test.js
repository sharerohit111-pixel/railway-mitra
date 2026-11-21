"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { applyProcessedRefund } = require("../payment-refund-ledger");
const { paidEntitlementDocumentId } = require("../payment-entitlement");
const entitlementPath = "testSeriesEntitlements/" + paidEntitlementDocumentId("student_1", "test_1");

function harness({ refundAmount = 49900, amountRefunded = 49900, refundStatus = "full" } = {}) {
  const docs = new Map([
    ["testSeriesPayments/pay_refund_1", { paymentId: "pay_refund_1", razorpayOrderId: "order_refund_1", uid: "student_1", testId: "test_1", amount: 49900, currency: "INR", status: "captured" }],
    ["testSeriesPaymentOrders/order_refund_1", { paymentId: "pay_refund_1", razorpayOrderId: "order_refund_1", uid: "student_1", testId: "test_1", amount: 49900, currency: "INR", status: "paid" }],
    [entitlementPath, { paymentId: "pay_refund_1", razorpayOrderId: "order_refund_1", uid: "student_1", testId: "test_1", amount: 49900, currency: "INR", status: "active" }]
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
      payment: { entity: { id: "pay_refund_1", amount: 49900, amount_refunded: amountRefunded, currency: "INR", refund_status: refundStatus, status: refundStatus === "full" ? "refunded" : "captured", captured: true } }
    }
  };
  return { db, event, docs };
}

test("full refund accepts Razorpay refunded status while captured remains true", async () => {
  const h = harness();
  assert.equal(h.event.payload.payment.entity.status, "refunded");
  assert.equal(h.event.payload.payment.entity.captured, true);
  const result = await applyProcessedRefund({ db: h.db, event: h.event, eventId: "evt_refund_1" });
  assert.equal(result.revoked, true);
  assert.equal(h.docs.get("testSeriesPayments/pay_refund_1").status, "refunded");
  assert.equal(h.docs.get("testSeriesPaymentOrders/order_refund_1").status, "refunded");
  assert.equal(h.docs.get(entitlementPath).status, "revoked");
  assert.equal(h.docs.get("testSeriesRefunds/rfnd_1").status, "processed");
});

test("partial refund is recorded without revoking access", async () => {
  const h = harness({ refundAmount: 10000, amountRefunded: 10000, refundStatus: "partial" });
  const result = await applyProcessedRefund({ db: h.db, event: h.event, eventId: "evt_partial_1" });
  assert.equal(result.revoked, false);
  assert.equal(h.docs.get("testSeriesPayments/pay_refund_1").status, "captured");
  assert.equal(h.docs.get("testSeriesPayments/pay_refund_1").amountRefunded, 10000);
  assert.equal(h.docs.get(entitlementPath).status, "active");
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
  h.docs.set(entitlementPath, {
    ...h.docs.get(entitlementPath),
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

test("classifies a reused captured-payment event ID as a permanent refund conflict without writes", async () => {
  const h = harness();
  const eventId = "evt_capture_collision";
  const captureEvent = {
    eventId,
    paymentId: "pay_refund_1",
    razorpayOrderId: "order_refund_1",
    uid: "student_1",
    testId: "test_1",
    amount: 49900,
    currency: "INR",
    status: "processed"
  };
  h.docs.set("testSeriesPaymentEvents/" + eventId, captureEvent);
  const beforePayment = structuredClone(h.docs.get("testSeriesPayments/pay_refund_1"));
  const beforeOrder = structuredClone(h.docs.get("testSeriesPaymentOrders/order_refund_1"));
  const beforeEntitlement = structuredClone(h.docs.get(entitlementPath));

  await assert.rejects(
    () => applyProcessedRefund({ db: h.db, event: h.event, eventId }),
    { code: "refund_id_conflict" }
  );

  assert.deepEqual(h.docs.get("testSeriesPaymentEvents/" + eventId), captureEvent);
  assert.equal(h.docs.has("testSeriesRefunds/rfnd_1"), false);
  assert.deepEqual(h.docs.get("testSeriesPayments/pay_refund_1"), beforePayment);
  assert.deepEqual(h.docs.get("testSeriesPaymentOrders/order_refund_1"), beforeOrder);
  assert.deepEqual(h.docs.get(entitlementPath), beforeEntitlement);
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

test("rejects auto-refund snapshots for uncaptured or unspecified payments without changing access", async () => {
  for (const captured of [false, undefined]) {
    const h = harness();
    if (captured === undefined) {
      delete h.event.payload.payment.entity.captured;
    } else {
      h.event.payload.payment.entity.captured = captured;
    }

    await assert.rejects(
      () => applyProcessedRefund({ db: h.db, event: h.event, eventId: "evt_uncaptured_auto_refund" }),
      { code: "invalid_refund_fields" }
    );
    assert.equal(h.docs.has("testSeriesRefunds/rfnd_1"), false);
    assert.equal(h.docs.has("testSeriesPaymentEvents/evt_uncaptured_auto_refund"), false);
    assert.equal(h.docs.get("testSeriesPayments/pay_refund_1").status, "captured");
    assert.equal(h.docs.get(entitlementPath).status, "active");
  }
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
  // Keep the provider snapshot internally valid so the ledger comparison is reached.
  mismatch.payload.payment.entity.amount = 50000;
  mismatch.payload.payment.entity.amount_refunded = 50000;
  await assert.rejects(() => applyProcessedRefund({ db: h.db, event: mismatch, eventId: "evt_bad_3" }), { code: "refund_payment_mismatch" });
});

test("does not revoke access for refund events that are not processed", async () => {
  const h = harness();
  h.event.payload.refund.entity.status = "pending";
  await assert.rejects(() => applyProcessedRefund({ db: h.db, event: h.event, eventId: "evt_pending_1" }), { code: "invalid_refund_event" });
  assert.equal(h.docs.get(entitlementPath).status, "active");
});

test("separate partial refunds revoke access only when their cumulative total equals payment", async () => {
  const h = harness({ refundAmount: 20000, amountRefunded: 20000, refundStatus: "partial" });
  await applyProcessedRefund({ db: h.db, event: h.event, eventId: "evt_partial_a" });
  const second = structuredClone(h.event);
  second.payload.refund.entity.id = "rfnd_2";
  second.payload.refund.entity.amount = 29900;
  second.payload.payment.entity.amount_refunded = 49900;
  second.payload.payment.entity.refund_status = "full";
  second.payload.payment.entity.status = "refunded";
  const result = await applyProcessedRefund({ db: h.db, event: second, eventId: "evt_partial_b" });
  assert.equal(result.revoked, true);
  assert.equal(h.docs.get("testSeriesPayments/pay_refund_1").amountRefunded, 49900);
  assert.equal(h.docs.get(entitlementPath).status, "revoked");
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
  older.payload.payment.entity.status = "captured";
  const result = await applyProcessedRefund({ db: h.db, event: older, eventId: "evt_old_partial" });
  assert.equal(result.revoked, true);
  assert.equal(h.docs.get("testSeriesPayments/pay_refund_1").status, "refunded");
  assert.equal(h.docs.get(entitlementPath).status, "revoked");
  assert.equal(h.docs.get("testSeriesPayments/pay_refund_1").amountRefunded, 49900);
});

test("rejects payment status that contradicts the cumulative refund state before writing ledgers", async () => {
  const fullRefundWithCapturedStatus = harness();
  fullRefundWithCapturedStatus.event.payload.payment.entity.status = "captured";
  await assert.rejects(
    () => applyProcessedRefund({
      db: fullRefundWithCapturedStatus.db,
      event: fullRefundWithCapturedStatus.event,
      eventId: "evt_full_status_mismatch"
    }),
    { code: "invalid_refund_fields" }
  );
  assert.equal(fullRefundWithCapturedStatus.docs.has("testSeriesRefunds/rfnd_1"), false);
  assert.equal(fullRefundWithCapturedStatus.docs.has("testSeriesPaymentEvents/evt_full_status_mismatch"), false);
  assert.equal(fullRefundWithCapturedStatus.docs.get("testSeriesPayments/pay_refund_1").status, "captured");
  assert.equal(fullRefundWithCapturedStatus.docs.get(entitlementPath).status, "active");

  const partialRefundWithRefundedStatus = harness({
    refundAmount: 10000,
    amountRefunded: 10000,
    refundStatus: "partial"
  });
  partialRefundWithRefundedStatus.event.payload.payment.entity.status = "refunded";
  await assert.rejects(
    () => applyProcessedRefund({
      db: partialRefundWithRefundedStatus.db,
      event: partialRefundWithRefundedStatus.event,
      eventId: "evt_partial_status_mismatch"
    }),
    { code: "invalid_refund_fields" }
  );
  assert.equal(partialRefundWithRefundedStatus.docs.has("testSeriesRefunds/rfnd_1"), false);
  assert.equal(partialRefundWithRefundedStatus.docs.has("testSeriesPaymentEvents/evt_partial_status_mismatch"), false);
  assert.equal(partialRefundWithRefundedStatus.docs.get("testSeriesPayments/pay_refund_1").status, "captured");
  assert.equal(partialRefundWithRefundedStatus.docs.get(entitlementPath).status, "active");
});

test("keeps malformed captured-event records retryable instead of classifying them as permanent ID collisions", async () => {
  const baseRecord = {
    eventId: "evt_capture_collision_malformed",
    paymentId: "pay_refund_1",
    razorpayOrderId: "order_refund_1",
    uid: "student_1",
    testId: "test_1",
    amount: 49900,
    currency: "INR",
    status: "processed"
  };
  const malformedRecords = [
    (() => { const record = { ...baseRecord }; delete record.currency; return record; })(),
    { ...baseRecord, currency: "inr" },
    { ...baseRecord, amount: 0 }
  ];

  for (let index = 0; index < malformedRecords.length; index++) {
    const h = harness();
    const eventId = baseRecord.eventId + "_" + index;
    const malformedRecord = { ...malformedRecords[index], eventId };
    h.docs.set("testSeriesPaymentEvents/" + eventId, malformedRecord);
    const beforePayment = structuredClone(h.docs.get("testSeriesPayments/pay_refund_1"));
    const beforeOrder = structuredClone(h.docs.get("testSeriesPaymentOrders/order_refund_1"));
    const beforeEntitlement = structuredClone(h.docs.get(entitlementPath));

    await assert.rejects(
      () => applyProcessedRefund({ db: h.db, event: h.event, eventId }),
      { code: "refund_ledger_inconsistent" }
    );

    assert.deepEqual(h.docs.get("testSeriesPaymentEvents/" + eventId), malformedRecord);
    assert.equal(h.docs.has("testSeriesRefunds/rfnd_1"), false);
    assert.deepEqual(h.docs.get("testSeriesPayments/pay_refund_1"), beforePayment);
    assert.deepEqual(h.docs.get("testSeriesPaymentOrders/order_refund_1"), beforeOrder);
    assert.deepEqual(h.docs.get(entitlementPath), beforeEntitlement);
  }
});

test("keeps a structurally valid capture-event collision retryable when its backing order is missing", async () => {
  const h = harness();
  const eventId = "evt_capture_missing_order";
  const captureEvent = {
    eventId,
    paymentId: "pay_refund_1",
    razorpayOrderId: "order_refund_1",
    uid: "student_1",
    testId: "test_1",
    amount: 49900,
    currency: "INR",
    status: "processed"
  };
  h.docs.set("testSeriesPaymentEvents/" + eventId, captureEvent);
  h.docs.delete("testSeriesPaymentOrders/order_refund_1");
  const beforePayment = structuredClone(h.docs.get("testSeriesPayments/pay_refund_1"));
  const beforeEntitlement = structuredClone(h.docs.get(entitlementPath));

  await assert.rejects(
    () => applyProcessedRefund({ db: h.db, event: h.event, eventId }),
    { code: "refund_ledger_inconsistent" }
  );

  assert.equal(h.docs.has("testSeriesRefunds/rfnd_1"), false);
  assert.deepEqual(h.docs.get("testSeriesPaymentEvents/" + eventId), captureEvent);
  assert.deepEqual(h.docs.get("testSeriesPayments/pay_refund_1"), beforePayment);
  assert.deepEqual(h.docs.get(entitlementPath), beforeEntitlement);
});

test("keeps a capture-event collision retryable when its backing entitlement has drifted", async () => {
  const h = harness();
  const eventId = "evt_capture_entitlement_drift";
  const captureEvent = {
    eventId,
    paymentId: "pay_refund_1",
    razorpayOrderId: "order_refund_1",
    uid: "student_1",
    testId: "test_1",
    amount: 49900,
    currency: "INR",
    status: "processed"
  };
  h.docs.set("testSeriesPaymentEvents/" + eventId, captureEvent);
  h.docs.set(entitlementPath, {
    ...h.docs.get(entitlementPath),
    status: "revoked"
  });
  const beforePayment = structuredClone(h.docs.get("testSeriesPayments/pay_refund_1"));
  const beforeOrder = structuredClone(h.docs.get("testSeriesPaymentOrders/order_refund_1"));
  const beforeEntitlement = structuredClone(h.docs.get(entitlementPath));

  await assert.rejects(
    () => applyProcessedRefund({ db: h.db, event: h.event, eventId }),
    { code: "refund_ledger_inconsistent" }
  );

  assert.equal(h.docs.has("testSeriesRefunds/rfnd_1"), false);
  assert.deepEqual(h.docs.get("testSeriesPaymentEvents/" + eventId), captureEvent);
  assert.deepEqual(h.docs.get("testSeriesPayments/pay_refund_1"), beforePayment);
  assert.deepEqual(h.docs.get("testSeriesPaymentOrders/order_refund_1"), beforeOrder);
  assert.deepEqual(h.docs.get(entitlementPath), beforeEntitlement);
});

test("keeps a captured-event collision retryable when any backing ledger record is missing or mismatched", async () => {
  const baseEvent = {
    paymentId: "pay_refund_1",
    razorpayOrderId: "order_refund_1",
    uid: "student_1",
    testId: "test_1",
    amount: 49900,
    currency: "INR",
    status: "processed"
  };
  const paymentPath = "testSeriesPayments/pay_refund_1";
  const orderPath = "testSeriesPaymentOrders/order_refund_1";
  const scenarios = [
    ["missing payment", h => h.docs.delete(paymentPath)],
    ["payment identity drift", h => h.docs.set(paymentPath, {
      ...h.docs.get(paymentPath), uid: "student_other"
    })],
    ["order amount drift", h => h.docs.set(orderPath, {
      ...h.docs.get(orderPath), amount: 49800
    })],
    ["missing entitlement", h => h.docs.delete(entitlementPath)],
    ["entitlement payment identity drift", h => h.docs.set(entitlementPath, {
      ...h.docs.get(entitlementPath), paymentId: "pay_other"
    })]
  ];
  const ledgerPaths = [paymentPath, orderPath, entitlementPath];

  for (let index = 0; index < scenarios.length; index++) {
    const [label, mutate] = scenarios[index];
    const h = harness();
    const eventId = "evt_capture_backing_drift_" + index;
    const captureEvent = { ...baseEvent, eventId };
    const eventPath = "testSeriesPaymentEvents/" + eventId;
    h.docs.set(eventPath, captureEvent);
    mutate(h);

    const before = new Map(ledgerPaths.map(path => [
      path,
      h.docs.has(path) ? structuredClone(h.docs.get(path)) : null
    ]));

    await assert.rejects(
      () => applyProcessedRefund({ db: h.db, event: h.event, eventId }),
      error => {
        assert.equal(error.code, "refund_ledger_inconsistent", label);
        return true;
      }
    );

    assert.equal(h.docs.has("testSeriesRefunds/rfnd_1"), false, label + ": no refund document");
    assert.deepEqual(h.docs.get(eventPath), captureEvent, label + ": existing event is unchanged");
    for (const path of ledgerPaths) {
      const existedBefore = before.get(path) !== null;
      assert.equal(h.docs.has(path), existedBefore, label + ": existence unchanged for " + path);
      if (existedBefore) {
        assert.deepEqual(h.docs.get(path), before.get(path), label + ": value unchanged for " + path);
      }
    }
  }
});

