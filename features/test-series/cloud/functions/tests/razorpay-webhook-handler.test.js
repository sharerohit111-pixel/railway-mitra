"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { handleRazorpayWebhook } = require("../razorpay-webhook-handler");

const secret = "webhook-test-secret";
const event = {
  event: "payment.captured",
  payload: { payment: { entity: {
    id: "pay_handler_1", order_id: "order_handler_1",
    amount: 49900, currency: "INR", status: "captured"
  } } }
};

function request({ method = "POST", body = event, rawBody, signature, eventId = "evt_handler_1" } = {}) {
  const bytes = rawBody || Buffer.from(JSON.stringify(body));
  return {
    method,
    rawBody: bytes,
    body,
    get(name) {
      if (name === "x-razorpay-signature") return signature ||
        crypto.createHmac("sha256", secret).update(bytes).digest("hex");
      if (name === "x-razorpay-event-id") return eventId;
      return undefined;
    }
  };
}

function response() {
  return {
    code: null, body: null, headers: {},
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.code = code; return this; },
    send(body) { this.body = body; return this; },
    json(body) { this.body = body; return this; }
  };
}

test("rejects non-POST requests and invalid signatures before ledger access", async () => {
  let calls = 0;
  const applyPayment = async () => { calls++; };
  const methodRes = response();
  await handleRazorpayWebhook({ req: request({ method: "GET" }), res: methodRes, secret, db: {}, applyPayment });
  assert.equal(methodRes.code, 405);
  assert.equal(methodRes.headers.Allow, "POST");

  const badSignatureRes = response();
  await handleRazorpayWebhook({
    req: request({ signature: "0".repeat(64) }),
    res: badSignatureRes, secret, db: {}, applyPayment
  });
  assert.equal(badSignatureRes.code, 400);
  assert.equal(calls, 0);
});

test("acknowledges verified non-capture events without creating a ledger entry", async () => {
  let calls = 0;
  const body = { ...event, event: "payment.authorized" };
  const res = response();
  await handleRazorpayWebhook({
    req: request({ body }), res, secret, db: {},
    applyPayment: async () => { calls++; }
  });
  assert.equal(res.code, 200);
  assert.equal(res.body, "Event ignored");
  assert.equal(calls, 0);
});

test("passes verified captured events to the payment ledger and reports duplicates", async () => {
  let received;
  const res = response();
  const db = { marker: "test-db" };
  await handleRazorpayWebhook({
    req: request(), res, secret, db,
    applyPayment: async args => {
      received = args;
      return { granted: false, duplicate: true };
    }
  });
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { received: true, duplicate: true });
  assert.equal(received.db, db);
  assert.equal(received.eventId, "evt_handler_1");
  assert.deepEqual(received.event, event);
});

test("rejects malformed payload and missing event IDs before ledger access", async () => {
  let calls = 0;
  const malformedBytes = Buffer.from("{not-json");
  const malformedRes = response();
  await handleRazorpayWebhook({
    req: request({ body: null, rawBody: malformedBytes }),
    res: malformedRes, secret, db: {},
    applyPayment: async () => { calls++; }
  });
  assert.equal(malformedRes.code, 400);

  const missingIdRes = response();
  await handleRazorpayWebhook({
    req: request({ eventId: "" }), res: missingIdRes, secret, db: {},
    applyPayment: async () => { calls++; }
  });
  assert.equal(missingIdRes.code, 400);
  assert.equal(calls, 0);
});

test("acknowledges permanent conflicts but asks the provider to retry transient ledger failures", async () => {
  const permanentRes = response();
  await handleRazorpayWebhook({
    req: request(), res: permanentRes, secret, db: {},
    applyPayment: async () => { const error = new Error("conflict"); error.code = "event_id_conflict"; throw error; }
  });
  assert.equal(permanentRes.code, 200);
  assert.deepEqual(permanentRes.body, { received: true, rejected: true });

  const invalidOrderRes = response();
  await handleRazorpayWebhook({
    req: request(), res: invalidOrderRes, secret, db: {},
    applyPayment: async () => { const error = new Error("order missing"); error.code = "order_not_found"; throw error; }
  });
  assert.equal(invalidOrderRes.code, 200);
  assert.deepEqual(invalidOrderRes.body, { received: true, rejected: true });

  const transientRes = response();
  await handleRazorpayWebhook({
    req: request(), res: transientRes, secret, db: {},
    applyPayment: async () => { throw new Error("temporary firestore outage"); }
  });
  assert.equal(transientRes.code, 500);
});
