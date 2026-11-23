"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { recordPaymentInspectionAudit } = require("../payment-reconciliation-audit");

function fakeDb() {
  const writes = [];
  return {
    writes,
    collection(name) {
      assert.equal(name, "testSeriesPaymentAudit");
      return { doc() {
        return { id: "audit_123", async create(record) { writes.push(record); } };
      } };
    }
  };
}

test("records only allow-listed provider inspection metadata", async () => {
  const db = fakeDb();
  const result = await recordPaymentInspectionAudit({
    db, serverTimestamp: () => "SERVER_TIME",
    ownerUid: "owner_123", requestRecordId: "a".repeat(64),
    outcome: "success", matchesRequest: true,
    orderStatus: "created", paymentStatuses: ["failed", "failed"]
  });
  assert.deepEqual(result, { auditId: "audit_123" });
  assert.deepEqual(db.writes[0], {
    action: "razorpay_order_inspected", ownerUid: "owner_123",
    requestRecordId: "a".repeat(64), outcome: "success",
    matchesRequest: true, orderStatus: "created",
    paymentStatuses: ["failed", "failed"], paymentCount: 2,
    createdAt: "SERVER_TIME"
  });
  assert.equal("email" in db.writes[0], false);
  assert.equal("phone" in db.writes[0], false);
  assert.equal("rawPayload" in db.writes[0], false);
});

test("records provider lookup failures without copying error text", async () => {
  const db = fakeDb();
  await recordPaymentInspectionAudit({
    db, serverTimestamp: () => "SERVER_TIME",
    ownerUid: "owner_123", requestRecordId: "b".repeat(64),
    outcome: "provider_lookup_failed"
  });
  assert.equal(db.writes[0].matchesRequest, null);
  assert.equal(db.writes[0].orderStatus, null);
  assert.deepEqual(db.writes[0].paymentStatuses, []);
});


test("accepts the full bounded 500-payment inspection history", async () => {
  const db = fakeDb();
  const statuses = Array(500).fill("failed");
  await recordPaymentInspectionAudit({
    db, serverTimestamp: () => "SERVER_TIME",
    ownerUid: "owner_123", requestRecordId: "d".repeat(64),
    outcome: "success", matchesRequest: true,
    orderStatus: "attempted", paymentStatuses: statuses
  });
  assert.equal(db.writes[0].paymentCount, 500);
  assert.equal(db.writes[0].paymentStatuses.length, 500);
});

test("rejects invalid identities, statuses and oversized payment lists", async () => {
  const db = fakeDb();
  const base = {
    db, serverTimestamp: () => "SERVER_TIME",
    ownerUid: "owner_123", requestRecordId: "c".repeat(64),
    outcome: "success"
  };
  await assert.rejects(recordPaymentInspectionAudit({ ...base, outcome: "paid" }), /outcome/);
  await assert.rejects(recordPaymentInspectionAudit({ ...base, orderStatus: "cancelled" }), /order status/);
  await assert.rejects(recordPaymentInspectionAudit({ ...base, paymentStatuses: Array(501).fill("failed") }), /payment status/);
  await assert.rejects(recordPaymentInspectionAudit({ ...base, requestRecordId: "bad" }), /identifiers/);
});
