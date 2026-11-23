"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getStudentTestAccessType } = require("../student-test-access");
const { paidEntitlementDocumentId } = require("../payment-entitlement");

function paidRecords() {
  const uid = "student_access_1";
  const testId = "test_access_1";
  const paymentId = "pay_access_1";
  const orderId = "order_access_1";
  const amount = 2500;
  return {
    uid,
    testId,
    records: new Map([
      ["testSeriesEntitlements/" + paidEntitlementDocumentId(uid, testId), {
        uid, testId, status: "active", paymentId,
        razorpayOrderId: orderId, amount, currency: "INR"
      }],
      ["testSeriesPayments/" + paymentId, {
        uid, testId, paymentId, razorpayOrderId: orderId,
        amount, currency: "INR", status: "captured", amountRefunded: 0
      }],
      ["testSeriesPaymentOrders/" + orderId, {
        uid, testId, paymentId, razorpayOrderId: orderId,
        amount, currency: "INR", status: "paid"
      }]
    ])
  };
}

function snapshot(data) {
  return { exists: data !== undefined, data: () => data };
}

test("paid access reads entitlement, payment and order in one read-only transaction", async () => {
  const fixture = paidRecords();
  const reads = [];
  let optionsSeen = null;
  const db = {
    doc: path => ({ path }),
    runTransaction: async (callback, options) => {
      optionsSeen = options;
      return callback({
        get: async ref => {
          reads.push(ref.path);
          return snapshot(fixture.records.get(ref.path));
        }
      });
    }
  };

  const accessType = await getStudentTestAccessType({
    db, uid: fixture.uid, testId: fixture.testId,
    test: { price: 25 }, freeTestId: null
  });

  assert.equal(accessType, "unlocked");
  assert.deepEqual(optionsSeen, { readOnly: true });
  assert.deepEqual(reads, [
    "testSeriesEntitlements/" + paidEntitlementDocumentId(fixture.uid, fixture.testId),
    "testSeriesPayments/pay_access_1",
    "testSeriesPaymentOrders/order_access_1"
  ]);
});

test("a callable-owned transaction is reused without opening a nested transaction", async () => {
  const fixture = paidRecords();
  const reads = [];
  const db = {
    doc: path => ({ path }),
    runTransaction: async () => {
      throw new Error("nested transaction must not be opened");
    }
  };
  const transaction = {
    get: async ref => {
      reads.push(ref.path);
      return snapshot(fixture.records.get(ref.path));
    }
  };

  const accessType = await getStudentTestAccessType({
    db, transaction, uid: fixture.uid, testId: fixture.testId,
    test: { price: 25 }, freeTestId: null
  });

  assert.equal(accessType, "unlocked");
  assert.equal(reads.length, 3);
});

test("orphaned entitlement fails closed without reading untrusted ledger IDs", async () => {
  const fixture = paidRecords();
  const entitlementPath = "testSeriesEntitlements/" + paidEntitlementDocumentId(fixture.uid, fixture.testId);
  fixture.records.set(entitlementPath, {
    uid: fixture.uid, testId: fixture.testId, status: "active",
    paymentId: "../outside", razorpayOrderId: "order_access_1",
    amount: 2500, currency: "INR"
  });
  const reads = [];
  const db = {
    doc: path => ({ path }),
    runTransaction: async callback => callback({
      get: async ref => {
        reads.push(ref.path);
        return snapshot(fixture.records.get(ref.path));
      }
    })
  };

  assert.equal(await getStudentTestAccessType({
    db, uid: fixture.uid, testId: fixture.testId,
    test: { price: 25 }, freeTestId: null
  }), "paid");
  assert.deepEqual(reads, [entitlementPath]);
});

test("free and unavailable tests do not read paid ledgers", async () => {
  const db = {
    doc: path => ({ path }),
    runTransaction: async () => {
      throw new Error("free or unavailable access must not read payment ledgers");
    }
  };
  assert.equal(await getStudentTestAccessType({
    db, uid: "student_access_1", testId: "free_test",
    test: { price: 0 }, freeTestId: "free_test"
  }), "free_trial");
  assert.equal(await getStudentTestAccessType({
    db, uid: "student_access_1", testId: "other_zero_test",
    test: { price: 0 }, freeTestId: "free_test"
  }), "unavailable");
});

module.exports = {};
