"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRazorpayOrder, isRazorpayTestModeKeyId } = require("../razorpay-order");

function input(overrides = {}) {
  return {
    keyId: "rzp_test_key",
    keySecret: "test_secret",
    amount: 49900,
    currency: "INR",
    receipt: "rm_order_123",
    notes: { uid: "student_1", testId: "paid_test_1" },
    ...overrides
  };
}

test("creates an INR Razorpay order using server-supplied credentials and payload", async () => {
  let request;
  const result = await createRazorpayOrder({
    ...input(),
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        json: async () => ({
          id: "order_Abc123",
          amount: 49900,
          currency: "INR",
          status: "created"
        })
      };
    }
  });

  assert.deepEqual(result, { id: "order_Abc123", amount: 49900, currency: "INR", status: "created" });
  assert.equal(request.url, "https://api.razorpay.com/v1/orders");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["Content-Type"], "application/json");
  assert.equal(
    request.options.headers.Authorization,
    "Basic " + Buffer.from("rzp_test_key:test_secret").toString("base64")
  );
  assert.deepEqual(JSON.parse(request.options.body), {
    amount: 49900,
    currency: "INR",
    receipt: "rm_order_123",
    notes: { uid: "student_1", testId: "paid_test_1" }
  });
});

test("rejects missing credentials, unsafe amounts, unsupported currency and invalid receipt", async () => {
  const fetchImpl = async () => { throw new Error("HTTP request must not run"); };
  await assert.rejects(createRazorpayOrder(input({ keySecret: "" , fetchImpl })), /credentials/);
  await assert.rejects(createRazorpayOrder(input({ amount: 0, fetchImpl })), /positive integer/);
  await assert.rejects(createRazorpayOrder(input({ amount: 499.5, fetchImpl })), /positive integer/);
  await assert.rejects(createRazorpayOrder(input({ currency: "USD", fetchImpl })), /Only INR/);
  await assert.rejects(createRazorpayOrder(input({ receipt: "bad receipt", fetchImpl })), /receipt/);
});

test("surfaces provider errors without accepting an invalid order response", async () => {
  await assert.rejects(createRazorpayOrder({
    ...input(),
    fetchImpl: async () => ({
      ok: false,
      json: async () => ({ error: { description: "Invalid API credentials" } })
    })
  }), /Invalid API credentials/);

  await assert.rejects(createRazorpayOrder({
    ...input(),
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ id: "order_wrong", amount: 1, currency: "INR", status: "created" })
    })
  }), /invalid order record/);
});

test("classifies definitive 4xx provider rejection separately from ambiguous HTTP failures", async () => {
  const { RazorpayOrderRejectedError } = require("../razorpay-order");
  for (const status of [400, 401, 403, 429]) {
    await assert.rejects(createRazorpayOrder({
      ...input(),
      fetchImpl: async () => ({
        ok: false,
        status,
        json: async () => ({ error: { description: "Provider rejected request" } })
      })
    }), error => error instanceof RazorpayOrderRejectedError);
  }

  for (const status of [408, 409, 425, 500, 502, 503, 504]) {
    await assert.rejects(createRazorpayOrder({
      ...input(),
      fetchImpl: async () => ({
        ok: false,
        status,
        json: async () => ({ error: { description: "Provider outcome may be ambiguous" } })
      })
    }), error => !(error instanceof RazorpayOrderRejectedError) &&
      error.message.includes("ambiguous") && error.message.includes("HTTP " + status));
  }

  await assert.rejects(createRazorpayOrder({
    ...input(),
    fetchImpl: async () => ({
      ok: false,
      json: async () => ({ error: { description: "Unknown response status" } })
    })
  }), error => !(error instanceof RazorpayOrderRejectedError) && error.message.includes("ambiguous"));

  await assert.rejects(createRazorpayOrder({
    ...input(),
    fetchImpl: async () => { throw new Error("socket timeout"); }
  }), error => !(error instanceof RazorpayOrderRejectedError) && /socket timeout/.test(error.message));
});


test("accepts only well-formed Razorpay Test Mode key IDs", () => {
  assert.equal(isRazorpayTestModeKeyId("rzp_test_1DP5mmOlF5G5ag"), true);
  for (const keyId of [
    "",
    "rzp_test_",
    "rzp_live_1DP5mmOlF5G5ag",
    "rzp_test_bad-key",
    " rzp_test_key",
    "rzp_test_key "
  ]) {
    assert.equal(isRazorpayTestModeKeyId(keyId), false, String(keyId));
  }
});

test("rejects live and malformed key IDs before making a provider request", async () => {
  let calls = 0;
  for (const keyId of ["rzp_live_liveKey123", "rzp_test_", "not-a-razorpay-key"]) {
    await assert.rejects(
      createRazorpayOrder({
        ...input({ keyId }),
        fetchImpl: async () => { calls += 1; throw new Error("provider must not be called"); }
      }),
      /Razorpay Test Mode Key ID/
    );
  }
  assert.equal(calls, 0);
});

test("payment callable validates persisted price before Test Mode and Test Mode before reservation", () => {
  const source = fs.readFileSync(path.join(__dirname, "../index.js"), "utf8");
  const start = source.indexOf("exports.rmCreatePaymentOrder = onCall(");
  const end = source.indexOf("exports.rmRazorpayWebhook = onRequest(", start);
  assert.ok(start >= 0 && end > start, "payment callable source must be present");
  const callable = source.slice(start, end);
  const priceValidation = callable.indexOf("const storedPrice =");
  const modeGuard = callable.indexOf("isRazorpayTestModeKeyId(keyId)");
  const requestDocument = callable.indexOf("const requestDocId =");
  const reservation = callable.indexOf("db.runTransaction");
  assert.ok(priceValidation >= 0 && priceValidation < modeGuard,
    "persisted test price must be validated before provider configuration");
  assert.ok(modeGuard >= 0, "Test Mode key validation must be present");
  assert.ok(requestDocument > modeGuard, "payment request document must be derived only after mode validation");
  assert.ok(reservation > requestDocument, "payment reservation must occur only after mode validation");
  assert.match(callable, /keyId,\s*testId/);
});
