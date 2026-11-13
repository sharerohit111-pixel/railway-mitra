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

  let event;
  try {
    event = req.body && typeof req.body === "object"
      ? req.body
      : JSON.parse(rawBody.toString("utf8"));
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
    if (["event_id_conflict", "payment_id_conflict", "payment_not_captured",
      "invalid_event_id", "invalid_payment_identity"].includes(error && error.code)) {
      res.status(200).json({ received: true, rejected: true });
      return;
    }
    res.status(500).send("Payment event could not be safely recorded");
  }
}

module.exports = { handleRazorpayWebhook };
