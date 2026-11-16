const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateOwnerTestAccessRequest,
  manualAccessDocumentId,
  ownerAccessRequestFingerprint,
  ownerAccessCursorMatches
} = require("../owner-test-access");

const base = Object.freeze({
  studentUid: "student_UID-123",
  testId: "gdce-je-civil-2026",
  action: "grant",
  reason: "Approved support access",
  requestId: "request_1234567890"
});
const NOW = Date.parse("2026-11-16T00:00:00.000Z");

test("normalizes a valid grant and keeps an omitted expiry explicit as null", () => {
  assert.deepEqual(validateOwnerTestAccessRequest(base, NOW), { ...base, reason: base.reason, expiresAt: null });
});

test("accepts only a canonical future ISO expiry for grants", () => {
  const request = { ...base, expiresAt: "2026-12-01T00:00:00.000Z" };
  assert.equal(validateOwnerTestAccessRequest(request, NOW).expiresAt, request.expiresAt);
  for (const expiresAt of ["2026-11-15T00:00:00.000Z", "2026-12-01", "not-a-date", 1796083200000]) {
    assert.throws(() => validateOwnerTestAccessRequest({ ...base, expiresAt }, NOW), /expiry/i);
  }
});

test("rejects malformed identities, actions, reasons and request IDs", () => {
  const invalidRequests = [
    { ...base, studentUid: "../student" },
    { ...base, studentUid: "x".repeat(129) },
    { ...base, testId: "bad/test" },
    { ...base, action: "delete" },
    { ...base, reason: "no" },
    { ...base, reason: "valid\u0000reason" },
    { ...base, reason: "x".repeat(301) },
    { ...base, requestId: "short" },
    { ...base, requestId: "x".repeat(129) },
    { ...base, expiresAt: "2026-12-01T00:00:00.000Z", action: "revoke" }
  ];
  for (const request of invalidRequests) assert.throws(() => validateOwnerTestAccessRequest(request, NOW));
});

test("manual-access document IDs are deterministic and delimiter-safe", () => {
  assert.equal(manualAccessDocumentId("a_b", "c"), manualAccessDocumentId("a_b", "c"));
  assert.notEqual(manualAccessDocumentId("a_b", "c"), manualAccessDocumentId("a", "b_c"));
  assert.match(manualAccessDocumentId("uid", "test"), /^[a-f0-9]{64}$/);
});

test("request fingerprint is stable and changes when the requested operation changes", () => {
  const first = ownerAccessRequestFingerprint(base);
  assert.equal(first, ownerAccessRequestFingerprint({ ...base }));
  assert.notEqual(first, ownerAccessRequestFingerprint({ ...base, reason: "Different approved reason" }));
  assert.notEqual(first, ownerAccessRequestFingerprint({ ...base, action: "revoke" }));
});

test("request fingerprint validates grant expiry against the same captured clock", () => {
  const nowMs = Date.parse("2026-11-16T00:00:00.000Z");
  const expiringGrant = { ...base, expiresAt: "2026-11-16T00:00:00.001Z" };
  assert.equal(
    ownerAccessRequestFingerprint(expiringGrant, nowMs),
    ownerAccessRequestFingerprint({ ...expiringGrant }, nowMs)
  );
  assert.throws(
    () => ownerAccessRequestFingerprint(expiringGrant, nowMs + 1),
    /expiry/i
  );
});

test("access pagination cursors must belong to the active filter and carry its ordering timestamp", () => {
  const accessCursor = { uid: "student_UID-123", testId: "gdce-je-civil-2026", status: "active", updatedAt: new Date() };
  const auditCursor = { targetUid: "student_UID-123", testId: "gdce-je-civil-2026", action: "grant", createdAt: new Date() };
  assert.equal(ownerAccessCursorMatches(accessCursor, "uid", "student_UID-123", "updatedAt"), true);
  assert.equal(ownerAccessCursorMatches(accessCursor, "uid", "another-student", "updatedAt"), false);
  assert.equal(ownerAccessCursorMatches(accessCursor, "testId", "another-test", "updatedAt"), false);
  assert.equal(ownerAccessCursorMatches(accessCursor, "status", "revoked", "updatedAt"), false);
  assert.equal(ownerAccessCursorMatches(accessCursor, "uid", null, "updatedAt"), true);
  assert.equal(ownerAccessCursorMatches({ ...accessCursor, updatedAt: { toMillis: () => 1794787200000 } }, "uid", null, "updatedAt"), true);
  assert.equal(ownerAccessCursorMatches({ ...accessCursor, updatedAt: { toMillis: () => NaN } }, "uid", null, "updatedAt"), false);
  assert.equal(ownerAccessCursorMatches({ ...accessCursor, updatedAt: { toMillis: () => { throw new Error("bad timestamp"); } } }, "uid", null, "updatedAt"), false);
  assert.equal(ownerAccessCursorMatches({ ...accessCursor, updatedAt: "not-a-timestamp" }, "uid", null, "updatedAt"), false);
  assert.equal(ownerAccessCursorMatches({ ...accessCursor, updatedAt: {} }, "uid", null, "updatedAt"), false);
  assert.equal(ownerAccessCursorMatches({ ...accessCursor, updatedAt: null }, "uid", null, "updatedAt"), false);
  assert.equal(ownerAccessCursorMatches(auditCursor, "targetUid", "student_UID-123", "createdAt"), true);
  assert.equal(ownerAccessCursorMatches(auditCursor, "targetUid", "other", "createdAt"), false);
  assert.equal(ownerAccessCursorMatches(auditCursor, "action", "revoke", "createdAt"), false);
  assert.equal(ownerAccessCursorMatches(auditCursor, "targetUid", null, "updatedAt"), false);
});

test("cursor timestamp inspection fails closed when timestamp accessors throw", () => {
  const accessCursor = { uid: "student_UID-123", updatedAt: new Date() };
  const throwingTimestamp = {};
  Object.defineProperty(throwingTimestamp, "toMillis", {
    get() { throw new Error("unreadable timestamp accessor"); }
  });
  assert.equal(
    ownerAccessCursorMatches({ ...accessCursor, updatedAt: throwingTimestamp }, "uid", null, "updatedAt"),
    false
  );

  const overriddenDate = new Date();
  Object.defineProperty(overriddenDate, "getTime", {
    get() { throw new Error("unreadable Date accessor"); }
  });
  assert.equal(ownerAccessCursorMatches({ ...accessCursor, updatedAt: overriddenDate }, "uid", null, "updatedAt"), true);
  assert.equal(
    ownerAccessCursorMatches({ ...accessCursor, updatedAt: new Proxy(new Date(), {}) }, "uid", null, "updatedAt"),
    false
  );
});
