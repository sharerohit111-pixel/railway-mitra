"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { inspectRazorpayOrder, validOrderId } = require("../razorpay-order-inspect");

function response(payload, ok = true) {
  return { ok, json: async () => payload };
}

function inspectWithPayments(items) {
  return inspectRazorpayOrder({
    keyId: "rzp_test_key",
    keySecret: "secret",
    orderId: "order_123456",
    expectedReceipt: "rm_receipt_123",
    expectedAmountPaise: 49900,
    expectedUid: "student_uid",
    expectedTestId: "gdce_test",
    fetchImpl: async url => url.includes("/payments?")
      ? response({ items })
      : response({
        id: "order_123456",
        status: "paid",
        amount: 49900,
        currency: "INR",
        receipt: "rm_receipt_123",
        notes: { uid: "student_uid", testId: "gdce_test" }
      })
  });
}

test("validates provider order IDs", () => {
  assert.equal(validOrderId("order_123456"), true);
  assert.equal(validOrderId("order_bad-id"), false);
  assert.equal(validOrderId("../orders"), false);
});

test("reads and allow-lists order plus payment status from Razorpay", async () => {
  const calls = [];
  const result = await inspectRazorpayOrder({
    keyId: "rzp_test_key",
    keySecret: "secret",
    orderId: "order_123456", expectedReceipt: "rm_receipt_123",
    expectedAmountPaise: 49900, expectedUid: "student_uid", expectedTestId: "gdce_test",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.includes("/payments?")) return response({ items: [{
        id: "pay_123456", status: "captured", amount: 49900, currency: "INR",
        order_id: "order_123456", captured: true, email: "private@example.com",
        contact: "9999999999"
      }] });
      return response({
        id: "order_123456", status: "paid", amount: 49900, currency: "INR",
        receipt: "rm_receipt_123", amount_paid: 49900, amount_due: 0,
        notes: { uid: "student_uid", testId: "gdce_test", private: "must not escape" }
      });
    }
  });
  assert.equal(calls.length, 2);
  assert.equal(result.matchesRequest, true);
  assert.match(calls[0].options.headers.Authorization, /^Basic /);
  assert.deepEqual(result.order, {
    orderId: "order_123456", status: "paid", amountPaise: 49900,
    currency: "INR", receipt: "rm_receipt_123",
    amountPaidPaise: 49900, amountDuePaise: 0
  });
  assert.deepEqual(result.payments, [{
    paymentId: "pay_123456", status: "captured", amountPaise: 49900,
    currency: "INR", orderId: "order_123456", captured: true
  }]);
  assert.equal(JSON.stringify(result).includes("9999999999"), false);
  assert.equal(JSON.stringify(result).includes("private@example.com"), false);
});

test("rejects malformed provider responses and cross-order payment rows", async () => {
  await assert.rejects(inspectRazorpayOrder({
    keyId: "rzp_test_key", keySecret: "secret", orderId: "order_123456",
    fetchImpl: async () => response({ id: "order_654321", status: "paid", amount: 1, currency: "INR" })
  }), /invalid order record/);
  await assert.rejects(inspectRazorpayOrder({
    keyId: "rzp_test_key", keySecret: "secret", orderId: "order_123456",
    fetchImpl: async url => url.includes("/payments?")
      ? response({ items: [{ id: "pay_123456", status: "captured", amount: 100, currency: "INR", order_id: "order_654321", captured: true }] })
      : response({ id: "order_123456", status: "paid", amount: 100, currency: "INR" })
  }), /different order/);
});

test("rejects missing Test Mode credentials and invalid order IDs before network access", async () => {
  let called = false;
  await assert.rejects(inspectRazorpayOrder({
    orderId: "order_123456",
    fetchImpl: async () => { called = true; }
  }), /Razorpay Test Mode Key ID/);
  await assert.rejects(inspectRazorpayOrder({
    keyId: "rzp_test_key", keySecret: "", orderId: "order_123456",
    fetchImpl: async () => { called = true; }
  }), /credentials/);
  await assert.rejects(inspectRazorpayOrder({
    keyId: "rzp_test_key", keySecret: "secret", orderId: "../orders",
    fetchImpl: async () => { called = true; }
  }), /valid Razorpay order ID/);
  assert.equal(called, false);
});

test("accepts documented payment states only with a consistent captured flag", async () => {
  const states = [
    ["created", false],
    ["authorized", false],
    ["captured", true],
    ["refunded", true],
    ["failed", false]
  ];
  const rows = states.map(([status, captured], index) => ({
    id: "pay_12345" + index,
    status,
    amount: 49900,
    currency: "INR",
    order_id: "order_123456",
    captured
  }));
  const result = await inspectWithPayments(rows);
  assert.deepEqual(result.payments.map(payment => [payment.status, payment.captured]), states);
});

test("fails closed for unknown or inconsistent provider payment rows", async () => {
  const valid = {
    id: "pay_123456",
    status: "captured",
    amount: 49900,
    currency: "INR",
    order_id: "order_123456",
    captured: true
  };
  const invalidRows = [
    { ...valid, status: "pending", captured: false },
    { ...valid, status: "captured", captured: false },
    { ...valid, status: "refunded", captured: false },
    { ...valid, status: "authorized", captured: true },
    { ...valid, amount: 0 },
    { ...valid, order_id: "not-an-order" },
    { ...valid, captured: "true" }
  ];
  for (const payment of invalidRows) {
    await assert.rejects(inspectWithPayments([payment]), /invalid payment record/);
  }
});


test("paginates beyond Razorpay's default page and inspects every payment attempt", async () => {
  const calls = [];
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    id: "pay_page1" + String(index).padStart(6, "0"),
    status: "failed", amount: 49900, currency: "INR",
    order_id: "order_123456", captured: false
  }));
  const secondPage = [{
    id: "pay_latecap123", status: "captured", amount: 49900,
    currency: "INR", order_id: "order_123456", captured: true
  }];
  const result = await inspectRazorpayOrder({
    keyId: "rzp_test_key", keySecret: "secret", orderId: "order_123456",
    expectedReceipt: "rm_receipt_123", expectedAmountPaise: 49900,
    expectedUid: "student_uid", expectedTestId: "gdce_test",
    fetchImpl: async url => {
      calls.push(url);
      if (url.includes("/payments?")) {
        return response({ items: url.includes("skip=0") ? firstPage : secondPage });
      }
      return response({
        id: "order_123456", status: "paid", amount: 49900, currency: "INR",
        receipt: "rm_receipt_123", notes: { uid: "student_uid", testId: "gdce_test" }
      });
    }
  });
  assert.equal(calls.filter(url => url.includes("/payments?")).length, 2);
  assert.ok(calls.some(url => url.includes("count=100&skip=0")));
  assert.ok(calls.some(url => url.includes("count=100&skip=100")));
  assert.equal(result.payments.length, 101);
  assert.equal(result.payments[100].status, "captured");
});

test("fails closed when the inspection safety ceiling cannot prove all payment attempts were read", async () => {
  let paymentPage = 0;
  await assert.rejects(inspectRazorpayOrder({
    keyId: "rzp_test_key", keySecret: "secret", orderId: "order_123456",
    fetchImpl: async url => {
      if (url.includes("/payments?")) {
        paymentPage += 1;
        return response({ items: Array.from({ length: 100 }, (_, index) => ({
          id: "pay_" + String(paymentPage).padStart(2, "0") + String(index).padStart(4, "0"),
          status: "failed", amount: 100, currency: "INR",
          order_id: "order_123456", captured: false
        })) });
      }
      return response({
        id: "order_123456", status: "attempted", amount: 100,
        currency: "INR", receipt: "rm_receipt_123",
        notes: { uid: "student_uid", testId: "gdce_test" }
      });
    }
  }), /safe inspection limit/);
  assert.equal(paymentPage, 5);
});


test("rejects live and malformed Razorpay keys before provider access", async () => {
  let calls = 0;
  for (const keyId of ["rzp_live_liveKey123", "rzp_test_", "not-a-razorpay-key"]) {
    await assert.rejects(inspectRazorpayOrder({
      keyId,
      keySecret: "secret",
      orderId: "order_123456",
      fetchImpl: async () => { calls += 1; return response({}); }
    }), /Razorpay Test Mode Key ID/);
  }
  assert.equal(calls, 0);
});

test("uses one bounded AbortSignal for the order and every payment page", async () => {
  const signals = [];
  await inspectRazorpayOrder({
    keyId: "rzp_test_key",
    keySecret: "secret",
    orderId: "order_123456",
    expectedReceipt: "rm_receipt_123",
    expectedAmountPaise: 49900,
    expectedUid: "student_uid",
    expectedTestId: "gdce_test",
    fetchImpl: async (url, options) => {
      signals.push(options.signal);
      return url.includes("/payments?")
        ? response({ items: [] })
        : response({
          id: "order_123456",
          status: "paid",
          amount: 49900,
          currency: "INR",
          receipt: "rm_receipt_123",
          notes: { uid: "student_uid", testId: "gdce_test" }
        });
    }
  });

  assert.equal(signals.length, 2);
  assert.ok(signals[0] instanceof AbortSignal);
  assert.equal(signals[0], signals[1], "all pages must share the same overall inspection deadline");
  assert.equal(signals[0].aborted, false);
});

test("rejects invalid inspection timeout bounds before provider access", async () => {
  let calls = 0;
  for (const timeoutMs of [0, -1, 1.5, 60001]) {
    await assert.rejects(inspectRazorpayOrder({
      keyId: "rzp_test_key",
      keySecret: "secret",
      orderId: "order_123456",
      timeoutMs,
      fetchImpl: async () => { calls += 1; return response({}); }
    }), /inspection timeout/);
  }
  assert.equal(calls, 0);
});

test("aborts a stalled provider inspection at the configured deadline", async () => {
  // AbortSignal.timeout uses an unref'ed timer in Node. Keep this test process
  // alive until the timeout fires so the assertion observes the abort result.
  const keepAlive = setTimeout(() => {}, 50);
  try {
    await assert.rejects(inspectRazorpayOrder({
      keyId: "rzp_test_key",
      keySecret: "secret",
      orderId: "order_123456",
      timeoutMs: 5,
      fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
        if (options.signal.aborted) {
          reject(options.signal.reason);
          return;
        }
        options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
      })
    }), error => error && error.name === "TimeoutError");
  } finally {
    clearTimeout(keepAlive);
  }
});

test("rejects duplicate payment IDs returned across paginated provider pages", async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    id: index === 0 ? "pay_duplicate123" : "pay_page1" + String(index).padStart(6, "0"),
    status: "failed",
    amount: 49900,
    currency: "INR",
    order_id: "order_123456",
    captured: false
  }));
  const secondPage = [{
    id: "pay_duplicate123",
    status: "captured",
    amount: 49900,
    currency: "INR",
    order_id: "order_123456",
    captured: true
  }];
  let paymentPageRequests = 0;

  await assert.rejects(inspectRazorpayOrder({
    keyId: "rzp_test_key",
    keySecret: "secret",
    orderId: "order_123456",
    expectedReceipt: "rm_receipt_123",
    expectedAmountPaise: 49900,
    expectedUid: "student_uid",
    expectedTestId: "gdce_test",
    fetchImpl: async url => {
      if (url.includes("/payments?")) {
        paymentPageRequests += 1;
        return response({ items: paymentPageRequests === 1 ? firstPage : secondPage });
      }
      return response({
        id: "order_123456",
        status: "paid",
        amount: 49900,
        currency: "INR",
        receipt: "rm_receipt_123",
        notes: { uid: "student_uid", testId: "gdce_test" }
      });
    }
  }), /duplicate payment across pages/);

  assert.equal(paymentPageRequests, 2, "the duplicate must be detected on the second provider page");
});
