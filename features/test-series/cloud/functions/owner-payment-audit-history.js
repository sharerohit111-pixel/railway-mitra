"use strict";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;

function validId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function toIso(value) {
  try {
    const date = value && typeof value.toDate === "function"
      ? value.toDate()
      : value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  } catch {
    return null;
  }
}

function serializeAudit(document) {
  const row = document.data() || {};
  const outcome = ["success", "provider_lookup_failed"].includes(row.outcome)
    ? row.outcome : "review_required";
  const statuses = Array.isArray(row.paymentStatuses)
    ? row.paymentStatuses.filter(status => ["created", "authorized", "captured", "refunded", "failed"].includes(status)).slice(0, 500)
    : [];
  return {
    auditId: document.id,
    action: row.action === "razorpay_order_inspected" ? row.action : "review_required",
    ownerUid: validId(row.ownerUid) ? row.ownerUid : null,
    requestRecordId: /^[a-f0-9]{64}$/.test(row.requestRecordId || "") ? row.requestRecordId : null,
    outcome,
    matchesRequest: typeof row.matchesRequest === "boolean" ? row.matchesRequest : null,
    orderStatus: ["created", "attempted", "paid"].includes(row.orderStatus) ? row.orderStatus : null,
    paymentStatuses: statuses,
    paymentCount: Number.isInteger(row.paymentCount) && row.paymentCount >= 0 ? row.paymentCount : statuses.length,
    createdAt: toIso(row.createdAt)
  };
}

async function listOwnerPaymentAudit({ db, cursor = null, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  if (!db || typeof db.collection !== "function" || typeof db.doc !== "function") {
    throw new TypeError("A Firestore database instance is required");
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    const error = new Error("Page size must be an integer from 1 to 50");
    error.code = "invalid_page_size";
    throw error;
  }
  let query = db.collection("testSeriesPaymentAudit").orderBy("createdAt", "desc");
  if (cursor !== null) {
    if (!validId(cursor)) {
      const error = new Error("Payment audit cursor is invalid");
      error.code = "invalid_cursor";
      throw error;
    }
    const cursorSnap = await db.doc("testSeriesPaymentAudit/" + cursor).get();
    if (!cursorSnap.exists || !toIso(cursorSnap.data().createdAt)) {
      const error = new Error("Payment audit cursor was not found");
      error.code = "invalid_cursor";
      throw error;
    }
    query = query.startAfter(cursorSnap);
  }
  const snap = await query.limit(pageSize + 1).get();
  const hasMore = snap.docs.length > pageSize;
  const page = snap.docs.slice(0, pageSize);
  return {
    records: page.map(serializeAudit),
    nextCursor: hasMore && page.length ? page[page.length - 1].id : null,
    hasMore
  };
}

module.exports = { listOwnerPaymentAudit, serializeAudit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };
