"use strict";

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { listOwnerPaymentHistory } = require("../owner-payment-history");

const collectionName = "testSeriesPaymentHistoryFixtures";
const ids = ["pay_owner_history_latest","pay_owner_history_middle","pay_owner_history_oldest","pay_owner_history_corrupt"];
let app;
let db;

async function clearFixtures() {
  if (!db) return;
  await Promise.all(ids.map(id => db.doc(collectionName + "/" + id).delete().catch(() => {})));
}

before(async () => {
  app = initializeApp({ projectId: "railway-mitra" }, "owner-payment-history-emulator");
  db = getFirestore(app);
  await clearFixtures();
});

after(async () => {
  await clearFixtures();
  if (app) await deleteApp(app);
});

test("owner payment history paginates newest-first and returns only allow-listed fields", async () => {
  const records = [
    { id: ids[0], at: "2026-11-13T12:00:00.000Z",
      data: { paymentId: ids[0], razorpayOrderId: "order_owner_history_latest", uid: "student_history_a",
        testId: "gdce_je_civil", amount: 49900, currency: "INR", status: "captured",
        phone: "+919999999999", email: "private@example.invalid", notes: { secret: "never return" } } },
    { id: ids[1], at: "2026-11-13T11:59:00.000Z",
      data: { paymentId: ids[1], razorpayOrderId: "order_owner_history_middle", uid: "student_history_b",
        testId: "gdce_je_civil", amount: 25000, currency: "INR", status: "captured" } },
    { id: ids[2], at: "2026-11-13T11:58:00.000Z",
      data: { paymentId: ids[2], razorpayOrderId: "order_owner_history_oldest", uid: "student_history_c",
        testId: "rrb_paramedical", amount: 12500, currency: "INR", status: "captured" } },
    { id: ids[3], at: "2026-11-13T11:57:00.000Z",
      data: { paymentId: "mismatched_payment_id", razorpayOrderId: "order_owner_history_corrupt",
        uid: "student_history_d", testId: "gdce_je_civil", amount: -1, currency: "USD", status: "created" } }
  ];
  await Promise.all(records.map(record => db.doc(collectionName + "/" + record.id).set({
    ...record.data, recordedAt: new Date(record.at)
  })));

  const first = await listOwnerPaymentHistory({ db, pageSize: 2, collectionName });
  assert.deepEqual(first.payments.map(item => item.paymentId), [ids[0], ids[1]]);
  assert.equal(first.hasMore, true);
  assert.equal(first.nextCursor, ids[1]);
  assert.deepEqual(Object.keys(first.payments[0]).sort(), [
    "amountPaise", "currency", "orderId", "paymentId", "recordedAt", "status", "studentUid", "testId"
  ].sort());
  assert.equal(first.payments[0].status, "captured");
  assert.equal(Object.hasOwn(first.payments[0], "phone"), false);
  assert.equal(Object.hasOwn(first.payments[0], "email"), false);
  assert.equal(Object.hasOwn(first.payments[0], "notes"), false);

  const second = await listOwnerPaymentHistory({ db, pageSize: 2, cursor: first.nextCursor, collectionName });
  assert.deepEqual(second.payments.map(item => item.paymentId), [ids[2], ids[3]]);
  assert.equal(second.payments[1].status, "review_required");
  assert.equal(second.payments[1].amountPaise, null);
  assert.equal(second.hasMore, false);
  assert.equal(second.nextCursor, null);
});

test("owner payment history rejects invalid page sizes and unknown cursors", async () => {
  for (const pageSize of [0, -1, 1.5, 51, "25"]) {
    await assert.rejects(listOwnerPaymentHistory({ db, pageSize, collectionName }), error => error.code === "invalid_page_size");
  }
  await assert.rejects(
    listOwnerPaymentHistory({ db, cursor: "pay_owner_history_missing", collectionName }),
    error => error.code === "invalid_cursor"
  );
  await assert.rejects(
    listOwnerPaymentHistory({ db, cursor: "../not-a-payment", collectionName }),
    error => error.code === "invalid_cursor"
  );
});
