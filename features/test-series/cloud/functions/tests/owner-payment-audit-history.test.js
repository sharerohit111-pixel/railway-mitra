"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { listOwnerPaymentAudit, serializeAudit } = require("../owner-payment-audit-history");

function timestamp(iso) { return { toDate: () => new Date(iso) }; }
function fakeDb(rows) {
  return {
    collection(name) {
      assert.equal(name, "testSeriesPaymentAudit");
      return {
        orderBy(field, direction) {
          assert.equal(field, "createdAt"); assert.equal(direction, "desc");
          return {
            async limit(size) {
              return { docs: rows.slice(0, size).map(row => ({
                id: row.id, data: () => row.data
              })) };
            },
            startAfter(cursor) { return this; }
          };
        }
      };
    },
    doc(path) {
      const id = path.split("/").pop();
      const row = rows.find(item => item.id === id);
      return { async get() { return { exists: Boolean(row), data: () => row && row.data }; } };
    }
  };
}

test("lists only allow-listed audit metadata and paginates newest-first", async () => {
  const rows = [
    { id: "audit_1", data: { action: "razorpay_order_inspected", ownerUid: "owner_1",
      requestRecordId: "a".repeat(64), outcome: "success", matchesRequest: true,
      orderStatus: "paid", paymentStatuses: ["captured"], paymentCount: 1,
      createdAt: timestamp("2026-11-13T10:00:00Z"), secret: "never return" } },
    { id: "audit_2", data: { action: "razorpay_order_inspected", ownerUid: "owner_1",
      requestRecordId: "b".repeat(64), outcome: "provider_lookup_failed",
      paymentStatuses: [], paymentCount: 0, createdAt: timestamp("2026-11-13T09:00:00Z") } }
  ];
  const result = await listOwnerPaymentAudit({ db: fakeDb(rows), pageSize: 1 });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].auditId, "audit_1");
  assert.equal(result.records[0].matchesRequest, true);
  assert.equal(result.nextCursor, "audit_1");
  assert.equal(result.hasMore, true);
  assert.equal(JSON.stringify(result).includes("never return"), false);
});

test("rejects invalid page size and cursor", async () => {
  const db = fakeDb([]);
  await assert.rejects(listOwnerPaymentAudit({ db, pageSize: 0 }), /Page size/);
  await assert.rejects(listOwnerPaymentAudit({ db, cursor: "../bad" }), /cursor/);
});

test("serializer drops unknown status values and private fields", () => {
  const result = serializeAudit({ id: "audit_3", data: () => ({
    action: "bad", outcome: "unknown", ownerUid: "owner_1",
    requestRecordId: "x", orderStatus: "unknown",
    paymentStatuses: ["captured", "secret"], phone: "9999999999",
    createdAt: timestamp("2026-11-13T10:00:00Z")
  }) });
  assert.equal(result.action, "review_required");
  assert.equal(result.outcome, "review_required");
  assert.equal(result.requestRecordId, null);
  assert.deepEqual(result.paymentStatuses, ["captured"]);
  assert.equal("phone" in result, false);
});
