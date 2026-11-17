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

test("catalogue does not start a list request after its student view is stale", () => {
  assert.match(catalogue, /async function loadPage\(\{ append = false \} = \) \{\s*if \(loading\) return;\s*if \(!sessionIsActive\(\)\) return \{ tests: \[\], stale: true \};\s*loading = true;/);
});

test("catalogue discards request failures after the student session changes", () => {
  assert.match(catalogue, /catch \(error\) \{\s*if \(!sessionIsActive\(\)\) return \{ tests: \[\], stale: true \};\s*status\.textContent = error\.message/);
});

test("catalogue restores a load-more control only while its original view is active", () => {
  assert.match(catalogue, /finally \{\s*loading = false;\s*if \(sessionIsActive\(\) && loadButton\) loadButton\.disabled = false;/);
});

test("catalogue treats session-guard exceptions as inactive rather than allowing UI updates", () => {
  assert.match(catalogue, /const sessionIsActive = \(\) => \{\s*try \{\s*return typeof isSessionActive === "function" && isSessionActive\(\);\s*\} catch \{\s*return false;\s*\}\s*\};/);
});
