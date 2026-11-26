import test from "node:test";
import assert from "node:assert/strict";
import { createPublicPollGuard } from "../src/public-poll-guard.js";

test("uses Appwrite client IP header supplied as an array", () => {
  const guard = createPublicPollGuard();
  const req = { headers: [{ name: "x-appwrite-client-ip", value: "203.0.113.8" }] };
  assert.equal(guard.allow(req, 10000), true);
  assert.equal(guard.allow(req, 14999), false);
  assert.equal(guard.allow(req, 15000), true);
});

test("uses Appwrite client IP header supplied as an object, case-insensitively", () => {
  const guard = createPublicPollGuard();
  const req = { headers: { "X-Appwrite-Client-IP": "2001:db8::1" } };
  assert.equal(guard.allow(req, 10000), true);
  assert.equal(guard.allow(req, 12000), false);
});

test("prefers the Appwrite gateway IP over forwarded client-controlled headers", () => {
  const guard = createPublicPollGuard();
  const req = { headers: [
    { name: "x-appwrite-client-ip", value: "203.0.113.8" },
    { name: "x-forwarded-for", value: "198.51.100.2" }
  ] };
  assert.equal(guard.allow(req, 10000), true);
  assert.equal(guard.allow({ headers: [{ name: "x-appwrite-client-ip", value: "203.0.113.8" }] }, 12000), false);
  assert.equal(guard.allow({ headers: [{ name: "x-appwrite-client-ip", value: "198.51.100.2" }] }, 12000), true);
});

test("fails closed when no usable client IP header is available", () => {
  const guard = createPublicPollGuard();
  assert.equal(guard.allow({ headers: [] }, 10000), false);
  assert.equal(guard.allow({}, 20000), false);
});

test("supports forwarded IP headers when the Appwrite header is unavailable", () => {
  const guard = createPublicPollGuard();
  const req = { headers: { "X-Forwarded-For": "198.51.100.4, 10.0.0.1" } };
  assert.equal(guard.allow(req, 10000), true);
  assert.equal(guard.allow(req, 12000), false);
});

test("rejects non-monotonic timestamps and accepts the exact throttle boundary", () => {
  const guard = createPublicPollGuard({ windowMs: 5000 });
  const req = { headers: [{ name: "x-appwrite-client-ip", value: "203.0.113.9" }] };
  assert.equal(guard.allow(req, 10000), true);
  assert.equal(guard.allow(req, 9000), false);
  assert.equal(guard.allow(req, 14999), false);
  assert.equal(guard.allow(req, 15000), true);
});

test("bounds retained IP entries and evicts stale entries", () => {
  const guard = createPublicPollGuard({ maxEntries: 2, staleAfterMs: 100 });
  const request = ip => ({ headers: [{ name: "x-appwrite-client-ip", value: ip }] });
  assert.equal(guard.allow(request("203.0.113.1"), 1000), true);
  assert.equal(guard.allow(request("203.0.113.2"), 1000), true);
  assert.equal(guard.allow(request("203.0.113.3"), 1200), true);
  assert.equal(guard.allow(request("203.0.113.1"), 1201), true);
});
