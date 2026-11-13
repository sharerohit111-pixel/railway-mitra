"use strict";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;
const SCAN_LIMIT = 500;
const RECONCILIATION_STATES = new Set(["creating", "unknown"]);

function inputError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function safeDocumentId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function timestampToIso(value) {
  try {
    const date = value && typeof value.toDate === "function"
      ? value.toDate()
      : value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  } catch {
    return null;
  }
}

function normalizePageSize(value) {
  if (value === undefined || value === null) return DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
    throw inputError("invalid_page_size", "Page size must be an integer from 1 to 50");
  }
  return value;
}

function serializeReconciliationRequest(document) {
  const record = document.data() || {};
  const status = RECONCILIATION_STATES.has(record.status) ? record.status : "review_required";
  const amountPaise = Number.isSafeInteger(record.amount) && record.amount > 0 ? record.amount : null;
  const failureCode = typeof record.failureCode === "string" &&
    /^[A-Za-z0-9_:-]{1,80}$/.test(record.failureCode) ? record.failureCode : null;

  // Explicit allow-list: reservation tokens, request fingerprints, raw provider payloads, phone, email and
  // arbitrary metadata never leave Firestore. Only a strict server-generated receipt
  // reference is returned as a non-secret lookup key for the provider dashboard.
  return {
    requestRecordId: document.id,
    studentUid: safeDocumentId(record.uid) ? record.uid : null,
    testId: safeDocumentId(record.testId) ? record.testId : null,
    amountPaise,
    currency: record.currency === "INR" ? "INR" : null,
    receiptRef: typeof record.receipt === "string" && /^rm_[A-Za-z0-9_-]{1,32}$/.test(record.receipt)
      ? record.receipt : null,
    status,
    failureCode,
    providerOrderIdObserved: safeDocumentId(record.providerOrderIdObserved)
      ? record.providerOrderIdObserved : null,
    createdAt: timestampToIso(record.createdAt),
    updatedAt: timestampToIso(record.updatedAt)
  };
}

/**
 * Owner-only caller lists unresolved provider-order reservations.
 * The caller must authorize the Owner before invoking this helper.
 *
 * A bounded scan avoids requiring a new composite index. If the scan reaches
 * its cap, the cursor advances past the scanned window even when that window
 * contains fewer visible reconciliation rows than the requested page size.
 */
async function listOwnerPaymentReconciliation({
  db,
  cursor = null,
  pageSize,
  collectionName = "testSeriesPaymentRequests"
} = {}) {
  if (!db || typeof db.collection !== "function" || typeof db.doc !== "function") {
    throw new TypeError("A Firestore database instance is required");
  }
  if (typeof collectionName !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(collectionName)) {
    throw new TypeError("A valid payment request collection name is required");
  }

  const size = normalizePageSize(pageSize);
  let query = db.collection(collectionName).orderBy("updatedAt", "desc");
  if (cursor !== null) {
    if (!safeDocumentId(cursor)) throw inputError("invalid_cursor", "Payment reconciliation cursor is invalid");
    const cursorSnapshot = await db.doc(collectionName + "/" + cursor).get();
    if (!cursorSnapshot.exists || !timestampToIso(cursorSnapshot.data().updatedAt)) {
      throw inputError("invalid_cursor", "Payment reconciliation cursor was not found");
    }
    query = query.startAfter(cursorSnapshot);
  }

  const snapshot = await query.limit(SCAN_LIMIT).get();
  const unresolved = snapshot.docs.filter(document => RECONCILIATION_STATES.has((document.data() || {}).status));
  const page = unresolved.slice(0, size);
  const hasMoreInWindow = unresolved.length > size;
  const scanWasCapped = snapshot.size === SCAN_LIMIT;
  const nextCursor = hasMoreInWindow
    ? page[page.length - 1].id
    : scanWasCapped && snapshot.docs.length
      ? snapshot.docs[snapshot.docs.length - 1].id
      : null;

  return {
    requests: page.map(serializeReconciliationRequest),
    nextCursor,
    hasMore: Boolean(nextCursor),
    scanLimited: scanWasCapped
  };
}

module.exports = {
  listOwnerPaymentReconciliation,
  serializeReconciliationRequest,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  SCAN_LIMIT
};
