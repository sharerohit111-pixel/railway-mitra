"use strict";

const {
  paidEntitlementDocumentId,
  getPaidEntitlementLedgerReferences,
  validatePaidEntitlement
} = require("./payment-entitlement");

/**
 * Resolve one student's access to one published test using only the
 * authoritative free-test selection or the complete captured-payment ledger.
 *
 * When a caller already owns a Firestore transaction, reuse it so test
 * metadata and payment records can be evaluated from the same snapshot.
 * Catalogue callers without a transaction get a read-only snapshot here.
 */
async function getStudentTestAccessType({
  db, transaction, uid, testId, test, freeTestId
} = {}) {
  if (!db || typeof db.doc !== "function" ||
      typeof uid !== "string" || !uid ||
      typeof testId !== "string" || !testId ||
      !test || typeof test !== "object" ||
      (transaction && typeof transaction.get !== "function")) {
    throw new TypeError("Database, authenticated student, test ID and test data are required");
  }

  if (testId === freeTestId) return "free_trial";
  const price = Number(test.price || 0);
  if (!(price > 0)) return "unavailable";

  const readLedger = async tx => {
    const entitlementSnap = await tx.get(db.doc(
      "testSeriesEntitlements/" + paidEntitlementDocumentId(uid, testId)
    ));
    const entitlement = entitlementSnap.exists ? entitlementSnap.data() : null;
    const ledgerRefs = getPaidEntitlementLedgerReferences({ uid, testId, entitlement });
    if (!ledgerRefs) return "paid";

    const [paymentSnap, orderSnap] = await Promise.all([
      tx.get(db.doc("testSeriesPayments/" + ledgerRefs.paymentId)),
      tx.get(db.doc("testSeriesPaymentOrders/" + ledgerRefs.orderId))
    ]);
    const access = validatePaidEntitlement({
      uid,
      testId,
      entitlement,
      payment: paymentSnap.exists ? paymentSnap.data() : null,
      order: orderSnap.exists ? orderSnap.data() : null
    });
    return access.valid ? "unlocked" : "paid";
  };

  if (transaction) return readLedger(transaction);
  if (typeof db.runTransaction !== "function") {
    throw new TypeError("A Firestore read-only transaction is required for paid access lookup");
  }
  return db.runTransaction(readLedger, { readOnly: true });
}

module.exports = { getStudentTestAccessType };
