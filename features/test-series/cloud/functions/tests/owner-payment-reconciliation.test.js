"use strict";

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { listOwnerPaymentReconciliation } = require("../owner-payment-reconciliation");

const collectionName = "testSeriesPaymentReconciliationFixtures";
const ids = [
  "request_reconcile_latest",
  "request_reconcile_middle",
  "request_reconcile_oldest",
  "request_reconcile_failed",
  "request_reconcile_created"
];
let app;
let db;

async function clearFixtures() {
  if (!db) return;
  await Promise.all(ids.map(id => db.doc(collectionName + "/" + id).delete().catch(() => {})));
}

before(async () => {
  app = initializeApp({ projectId: "railway-mitra" }, "owner-payment-reconciliation-emulator");
  db = getFirestore(app);
  await clearFixtures();
});

after(async () => {
  await clearFixtures();
  if (app) await deleteApp(app);
});

test("lists only unresolved payment requests newest-first with safe allow-listed fields", async () => {
  const records = [
    {
      id: ids[0], at: "2026-11-13T12:00:00.000Z",
      data: {
        uid: "student_reconcile_a", testId: "gdce_je_civil", amount: 49900,
        currency: "INR", status: "unknown", failureCode: "provider_outcome_unknown",
        providerOrderIdObserved: "order_reconcile_latest",
        reservationToken: "private-reservation-token", fingerprint: "private-fingerprint",
        receipt: "private-receipt", requestId: "private-request-id",
        phone: "+919999999999", email: "private@example.invalid",
        providerPayload: { notes: { secret: "never return" } }
      }
    },
    {
      id: ids[1], at: "2026-11-13T11:59:00.000Z",
      data: {
        uid: "student_reconcile_b", testId: "gdce_je_civil", amount: 25000,
        currency: "INR", status: "creating"
      }
    },
    {
      id: ids[2], at: "2026-11-13T11:58:00.000Z",
      data: {
        uid: "student_reconcile_c", testId: "rrb_paramedical", amount: 12500,
        currency: "INR", status: "unknown", failureCode: "firestore_commit_after_provider_success"
      }
    },
    {
      id: ids[3], at: "2026-11-13T11:57:00.000Z",
      data: { uid: "student_reconcile_d", testId: "gdce_je_civil", amount: 10000, currency: "INR", status: "failed" }
    },
    {
      id: ids[4], at: "2026-11-13T11:56:00.000Z",
      data: { uid: "student_reconcile_e", testId: "gdce_je_civil", amount: 10000, currency: "INR", status: "created" }
    }
  ];

  await Promise.all(records.map(record => db.doc(collectionName + "/" + record.id).set({
    ...record.data,
    createdAt: new Date(record.at),
    updatedAt: new Date(record.at)
  })));

  const first = await listOwnerPaymentReconciliation({ db, pageSize: 1, collectionName });
  assert.deepEqual(first.requests.map(item => item.requestRecordId), [ids[0]]);
  assert.equal(first.hasMore, true);
  assert.equal(first.nextCursor, ids[0]);
  assert.equal(first.requests[0].status, "unknown");
  assert.equal(first.requests[0].amountPaise, 49900);
  assert.equal(first.requests[0].failureCode, "provider_outcome_unknown");
  assert.deepEqual(Object.keys(first.requests[0]).sort(), [
    "amountPaise", "createdAt", "currency", "failureCode", "providerOrderIdObserved",
    "requestRecordId", "status", "studentUid", "testId", "updatedAt"
  ].sort());
  for (const forbidden of ["reservationToken", "fingerprint", "receipt", "requestId", "phone", "email", "providerPayload"]) {
    assert.equal(Object.hasOwn(first.requests[0], forbidden), false, forbidden + " must not be returned");
  }

  const second = await listOwnerPaymentReconciliation({
    db, pageSize: 1, cursor: first.nextCursor, collectionName
  });
  assert.deepEqual(second.requests.map(item => item.requestRecordId), [ids[1]]);
  assert.equal(second.requests[0].status, "creating");
  assert.equal(second.hasMore, true);

  const third = await listOwnerPaymentReconciliation({
    db, pageSize: 1, cursor: second.nextCursor, collectionName
  });
  assert.deepEqual(third.requests.map(item => item.requestRecordId), [ids[2]]);
  assert.equal(third.hasMore, false);
  assert.equal(third.nextCursor, null);
});

test("rejects invalid page sizes and unknown or unsafe cursors", async () => {
  for (const pageSize of [0, -1, 1.5, 51, "25"]) {
    await assert.rejects(
      listOwnerPaymentReconciliation({ db, pageSize, collectionName }),
      error => error.code === "invalid_page_size"
    );
  }
  await assert.rejects(
    listOwnerPaymentReconciliation({ db, cursor: "request_reconcile_missing", collectionName }),
    error => error.code === "invalid_cursor"
  );
  await assert.rejects(
    listOwnerPaymentReconciliation({ db, cursor: "../not-a-request", collectionName }),
    error => error.code === "invalid_cursor"
  );
});
