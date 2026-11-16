const crypto = require("node:crypto");

const ACTIONS = new Set(["grant", "revoke"]);

function invalid(message) {
  const error = new Error(message);
  error.code = "invalid-argument";
  throw error;
}

function validateOwnerTestAccessRequest(input, nowMs = Date.now()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid("A valid access request is required");
  const studentUid = input.studentUid;
  const testId = input.testId;
  const action = input.action;
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  const requestId = input.requestId;
  if (typeof studentUid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(studentUid)) invalid("Invalid student UID");
  if (typeof testId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(testId)) invalid("Invalid test ID");
  if (!ACTIONS.has(action)) invalid("Action must be grant or revoke");
  if (reason.length < 5 || reason.length > 300 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(reason)) {
    invalid("Reason must contain 5 to 300 printable characters");
  }
  if (typeof requestId !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(requestId)) invalid("Invalid request ID");

  let expiresAt = null;
  if (input.expiresAt !== undefined && input.expiresAt !== null) {
    if (action !== "grant" || typeof input.expiresAt !== "string") invalid("Expiry is supported only as an ISO timestamp on a grant");
    const parsed = new Date(input.expiresAt);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== input.expiresAt || parsed.getTime() <= nowMs) {
      invalid("Grant expiry must be a future ISO timestamp");
    }
    expiresAt = parsed.toISOString();
  }
  return Object.freeze({ studentUid, testId, action, reason, requestId, expiresAt });
}

function isOwnerAccessGrantUnexpired(request, nowMs = Date.now()) {
  if (!request || request.action !== "grant" || request.expiresAt === null || request.expiresAt === undefined) return true;
  const expiryMs = Date.parse(request.expiresAt);
  return Number.isFinite(expiryMs) && expiryMs > nowMs;
}

function manualAccessDocumentId(studentUid, testId) {
  if (typeof studentUid !== "string" || !studentUid || typeof testId !== "string" || !testId) {
    invalid("Student UID and test ID are required");
  }
  return crypto.createHash("sha256").update(studentUid).update("\0").update(testId).digest("hex");
}

function ownerAccessRequestFingerprint(request, nowMs = Date.now()) {
  const validated = validateOwnerTestAccessRequest(request, nowMs);
  return crypto.createHash("sha256").update(JSON.stringify([
    validated.studentUid, validated.testId, validated.action,
    validated.reason, validated.expiresAt
  ])).digest("hex");
}

function isValidCursorTimestamp(value) {
  try {
    if (value instanceof Date) {
      return Number.isFinite(Date.prototype.getTime.call(value));
    }
    if (!value || typeof value !== "object") return false;
    const toMillis = value.toMillis;
    if (typeof toMillis !== "function") return false;
    return Number.isFinite(toMillis.call(value));
  } catch (_) {
    return false;
  }
}

function ownerAccessCursorMatches(cursorData, filterField, filterValue, timestampField) {
  if (!cursorData || typeof cursorData !== "object" ||
      !["updatedAt", "createdAt"].includes(timestampField) ||
      !isValidCursorTimestamp(cursorData[timestampField])) return false;
  if (filterValue === null || filterValue === undefined) return true;
  return cursorData[filterField] === filterValue;
}

module.exports = {
  ownerAccessCursorMatches,
  isOwnerAccessGrantUnexpired,
  validateOwnerTestAccessRequest,
  manualAccessDocumentId,
  ownerAccessRequestFingerprint
};
