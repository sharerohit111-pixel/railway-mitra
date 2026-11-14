import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const catalogue = readFileSync(new URL("../catalogue.js", import.meta.url), "utf8");
const checkout = readFileSync(new URL("../payment-checkout.js", import.meta.url), "utf8");
const portal = readFileSync(new URL("../portal.js", import.meta.url), "utf8");

test("portal binds catalogue actions to the exact authenticated view and student session", () => {
  assert.match(portal, /isSessionActive:\s*\(\)\s*=>\s*requestVersion === portalState\.viewRequestVersion && isCurrentStudentSession\(sessionVersion, sessionUid\)/);
});

test("catalogue discards test-list responses after the student session changes", () => {
  assert.match(catalogue, /const page = await listAvailableCbtTests\(app, \{ pageSize: 50, cursor \}\);\s*if \(!sessionIsActive\(\)\) return \{ tests: \[\], stale: true \};/);
});

test("catalogue checks session liveness after free and purchased attempt requests before navigation", () => {
  assert.match(catalogue, /const session = await startCbtExam\(app, test\.testId\);\s*if \(!sessionIsActive\(\)\) return;\s*await onStart/);
  assert.match(catalogue, /const claim = await claimFreeCbtAttempt|claim = await claimFreeCbtAttempt/);
  assert.match(catalogue, /if \(!sessionIsActive\(\)\) return;\s*await onStart\(\{ test, session: claim \}\)/);
});

test("payment checkout checks session after script loading and order creation before opening Razorpay", () => {
  assert.match(checkout, /await loadCheckoutScript\(root\);\s*assertSessionActive\(\);/);
  assert.match(checkout, /order = await createStudentPaymentOrder\(app, test\.testId, requestId\);\s*assertSessionActive\(\);/);
  assert.match(checkout, /assertSessionActive\(\);\s*return new Promise\(\(resolve, reject\) => \{/);
});
