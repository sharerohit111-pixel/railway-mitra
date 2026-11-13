"use strict";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;

function inputError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function safeDocumentId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function normalizePageSize(value) {
  if (value === undefined || value === null) return DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
    throw inputError("invalid_page_size", "Page size must be an integer from 1 to 50");
  }
  return value;
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

function serializePayment(document) {
  const record = document.data() || {};
  const orderId = safeDocumentId(record.razorpayOrderId) ? record.razorpayOrderId : null;
  const studentUid = safeDocumentId(record.uid) ? record.uid : null;
  const testId = safeDocumentId(record.testId) ? record.testId : null;
  const amountPaise = Number.isSafeInteger(record.amount) && record.amount > 0 ? record.amount : null;
  const currency = record.currency === "INR" ? "INR" : null;
  const recordedAt = timestampToIso(record.recordedAt);
  const validCapture = record.paymentId === document.id &&
    Boolean(orderId && studentUid && testId && amountPaise && currency && recordedAt) &&
    record.status === "captured";

  // Explicit allow-list: never return provider payloads, notes, phone, email,
  // receipt data or any other fields stored on the Admin SDK ledger document.
  return {
    paymentId: document.id,
    orderId,
    studentUid,
    testId,
    amountPaise,
    currency,
    status: validCapture ? "captured" : "review_required",
    recordedAt
  };
}

async function listOwnerPaymentHistory({ db, cursor = null, pageSize } = {}) {
  if (!db || typeof db.collection !== "function" || typeof db.doc !== "function") {
    throw new TypeError("A Firestore database instance is required");
  }
  const size = normalizePageSize(pageSize);
  let query = db.collection("testSeriesPayments").orderBy("recordedAt", "desc");
  if (cursor !== null) {
    if (!safeDocumentId(cursor)) throw inputError("invalid_cursor", "Payment history cursor is invalid");
    const cursorSnapshot = await db.doc("testSeriesPayments/" + cursor).get();
    if (!cursorSnapshot.exists || !timestampToIso(cursorSnapshot.data().recordedAt)) {
      throw inputError("invalid_cursor", "Payment history cursor was not found");
    }
    query = query.startAfter(cursorSnapshot);
  }
  const snapshot = await query.limit(size + 1).get();
  const hasMore = snapshot.docs.length > size;
  const page = snapshot.docs.slice(0, size);
  return {
    payments: page.map(serializePayment),
    nextCursor: hasMore && page.length ? page[page.length - 1].id : null,
    hasMore
  };
}

module.exports = { listOwnerPaymentHistory, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };
