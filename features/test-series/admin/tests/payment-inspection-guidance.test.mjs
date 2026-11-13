import { test } from "node:test";
import assert from "node:assert/strict";
import { getPaymentInspectionGuidance } from "../payment-inspection-guidance.mjs";

test("mismatched request always requires manual review", () => {
  const message = getPaymentInspectionGuidance({
    matchesRequest: false,
    orderStatus: "paid",
    payments: [{ status: "captured" }]
  });
  assert.match(message, /मिलान नहीं हुआ/);
  assert.match(message, /मैन्युअल समीक्षा/);
});

test("paid order without captured history is treated as an inconsistency", () => {
  const message = getPaymentInspectionGuidance({
    matchesRequest: true,
    orderStatus: "paid",
    payments: [{ status: "failed" }, { status: "authorized" }]
  });
  assert.match(message, /Order paid है/);
  assert.match(message, /असंगति/);
  assert.match(message, /lock न हटाएँ/);
});

test("captured and refunded payments both preserve the lock for ledger review", () => {
  for (const status of ["captured", "refunded"]) {
    const message = getPaymentInspectionGuidance({
      matchesRequest: true,
      orderStatus: "paid",
      payments: [{ status }]
    });
    assert.match(message, /capture का इतिहास/);
    assert.match(message, /ledger और entitlement/);
  }
});

test("authorized payment is not treated as terminal", () => {
  const message = getPaymentInspectionGuidance({
    matchesRequest: true,
    orderStatus: "attempted",
    payments: [{ status: "authorized" }]
  });
  assert.match(message, /देर से capture या refund संभव है/);
  assert.match(message, /lock न हटाएँ/);
});

test("failed attempts and empty attempts do not authorize lock removal", () => {
  for (const payments of [[], [{ status: "failed" }]]) {
    const message = getPaymentInspectionGuidance({
      matchesRequest: true,
      orderStatus: "attempted",
      payments
    });
    assert.match(message, /दोबारा भुगतान संभव है/);
    assert.match(message, /failed प्रयास देखकर lock न हटाएँ/);
  }
});
