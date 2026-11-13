"use strict";

const { verifyRazorpayWebhookSignature } = require("./razorpay-webhook-signature");

async function handleRazorpayWebhook({ req, res, secret, db, applyPayment } = {}) {
  if (req.method !== "POST") {
    res.set("Allow", "POST").status(405).send("Method not allowed");
    return;
  }

  const rawBody = req.rawBody;
  const signature = req.get("x-razorpay-signature");
  if (!verifyRazorpayWebhookSignature({ rawBody, signature, secret })) {
    res.status(400).send("Invalid webhook signature");
    return;
  }

  // The event must come from the exact bytes whose HMAC was verified above.
  // Never prefer req.body: middleware or test adapters could expose a parsed
  // object that is not the payload covered by the provider's signature.
  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(400).send("Invalid webhook payload");
    return;
  }

  if (!event || event.event !== "payment.captured") {
    res.status(200).send("Event ignored");
    return;
  }

  const eventId = req.get("x-razorpay-event-id");
  if (typeof eventId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(eventId)) {
    res.status(400).send("Missing or invalid event ID");
    return;
  }

  try {
    const result = await applyPayment({ db, event, eventId });
    res.status(200).json({ received: true, duplicate: Boolean(result.duplicate) });
  } catch (error) {
    console.error("Razorpay captured-payment ledger rejected event", {
      eventId,
      code: error && error.code ? error.code : "unknown"
    });
    const permanentErrors = new Set([
      "event_id_conflict",
      "payment_id_conflict",
      "payment_not_captured",
      "invalid_event_id",
      "invalid_payment_identity",
      "order_not_found",
      "order_not_payable",
      "entitlement_conflict",
      "payment_unsupported_event",
      "payment_payment_not_captured",
      "payment_invalid_server_order",
      "payment_invalid_payment_fields",
      "payment_order_mismatch",
      "payment_amount_mismatch",
      "payment_currency_mismatch"
    ]);
    if (permanentErrors.has(error && error.code)) {
      res.status(200).json({ received: true, rejected: true });
      return;
    }
    res.status(500).send("Payment event could not be safely recorded");
  }
}

module.exports = { handleRazorpayWebhook };
