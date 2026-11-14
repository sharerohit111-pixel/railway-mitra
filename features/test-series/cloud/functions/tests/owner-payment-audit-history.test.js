"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { listOwnerPaymentAudit, serializeAudit } = require("../owner-payment-audit-history");

function timestamp(iso) { return { toDate: () => new Date(iso) }; }
function fakeDb(rows) {
  return {
    collection(name) {
      assert.equal(name, "testSeriesPaymentAudit");
      let afterId = null;
      return {
        orderBy(field, direction) {
          assert.equal(field, "createdAt"); assert.equal(direction, "desc");
          return {
            startAfter(cursor) { afterId = cursor.id; return this; },
            limit(size) {
              return {
                async get() {
                  const start = afterId ? rows.findIndex(row => row.id === afterId) + 1 : 0;
                  return { docs: rows.slice(start, start + size).map(row => ({
                    id: row.id, data: () => row.data
                  })) };
                }
              };
            }
          };
        }
      };
    },
    doc(path) {
      const id = path.split("/").pop();
      const row = rows.find(item => item.id === id);
      return { id, async get() { return { exists: Boolean(row), id, data: () => row && row.data }; } };
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
  const db = fakeDb(rows);
  const result = await listOwnerPaymentAudit({ db, pageSize: 1 });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].auditId, "audit_1");
  assert.equal(result.records[0].matchesRequest, true);
  assert.equal(result.nextCursor, "audit_1");
  assert.equal(result.hasMore, true);
  assert.equal(JSON.stringify(result).includes("never return"), false);

  const next = await listOwnerPaymentAudit({ db, pageSize: 1, cursor: result.nextCursor });
  assert.equal(next.records.length, 1);
  assert.equal(next.records[0].auditId, "audit_2");
  assert.equal(next.nextCursor, null);
  assert.equal(next.hasMore, false);
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
