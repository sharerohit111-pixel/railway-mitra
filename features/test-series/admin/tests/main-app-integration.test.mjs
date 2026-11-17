"use strict";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../../../../app.html", import.meta.url), "utf8");
const landing = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

test("signed-in main app exposes exactly one departmental Test Series entry", () => {
  const entries = app.match(/href="features\/test-series\/index\.html"/g) || [];
  assert.equal(entries.length, 1, "Main app must expose exactly one Test Series entry");
  assert.match(app, /<script\s+type="module"\s+src="assets\/js\/auth-guard\.js(?:\?[^"]*)?"\s*>/);
});

test("Test Series landing page exposes Student and Owner navigation without embedding credentials", () => {
  assert.equal((landing.match(/href="\.\/student\/portal\.html"/g) || []).length, 1);
  assert.equal((landing.match(/href="\.\/admin\/portal\.html"/g) || []).length, 1);
  assert.doesNotMatch(landing, /OWNER_UID|RAZORPAY_KEY_SECRET|serviceAccount/i);
});
