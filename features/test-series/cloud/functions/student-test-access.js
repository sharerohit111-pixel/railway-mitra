"use strict";

const {
  paidEntitlementDocumentId,
  getPaidEntitlementLedgerReferences,
  validatePaidEntitlement
} = require("./payment-entitlement");

/**
 * Resolve one student's access to one published test using only the
 * authoritative free-test selection or the complete captured-payment ledger.
 */
async function getStudentTestAccessType({ db, uid, testId, test, freeTestId } = {}) {
  if (!db || typeof db.doc !== "function" ||
      typeof uid !== "string" || !uid ||
      typeof testId !== "string" || !testId ||
      !test || typeof test !== "object") {
    throw new TypeError("Database, authenticated student, test ID and test data are required");
  }

  if (testId === freeTestId) return "free_trial";
  const price = Number(test.price || 0);
  if (!(price > 0)) return "unavailable";

  const entitlementSnap = await db.doc(
    "testSeriesEntitlements/" + paidEntitlementDocumentId(uid, testId)
  ).get();
  const entitlement = entitlementSnap.exists ? entitlementSnap.data() : null;
  const ledgerRefs = getPaidEntitlementLedgerReferences({ uid, testId, entitlement });
  if (!ledgerRefs) return "paid";

  const [paymentSnap, orderSnap] = await Promise.all([
    db.doc("testSeriesPayments/" + ledgerRefs.paymentId).get(),
    db.doc("testSeriesPaymentOrders/" + ledgerRefs.orderId).get()
  ]);
  const access = validatePaidEntitlement({
    uid,
    testId,
    entitlement,
    payment: paymentSnap.exists ? paymentSnap.data() : null,
    order: orderSnap.exists ? orderSnap.data() : null
  });
  return access.valid ? "unlocked" : "paid";
}

module.exports = { getStudentTestAccessType };
