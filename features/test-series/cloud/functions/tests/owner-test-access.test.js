const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateOwnerTestAccessRequest,
  manualAccessDocumentId,
  ownerAccessRequestFingerprint
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
