import { createPaymentRequestId, createStudentPaymentOrder } from "../cloud/student-client.js";
import {
  clearPaymentRequestId,
  getOrCreatePaymentRequestId,
  isDefiniteProviderOrderRejection,
  requirePaymentSessionStorage
} from "./payment-request-session.mjs";

const CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";
let checkoutScriptPromise = null;

function loadCheckoutScript(root = document) {
  if (typeof globalThis.Razorpay === "function") return Promise.resolve();
  if (!checkoutScriptPromise) {
    checkoutScriptPromise = new Promise((resolve, reject) => {
      const script = root.createElement("script");
      script.src = CHECKOUT_SCRIPT;
      script.async = true;
      script.onload = () => typeof globalThis.Razorpay === "function"
        ? resolve()
        : reject(new Error("Razorpay Checkout could not be initialized."));
      script.onerror = () => {
        checkoutScriptPromise = null;
        reject(new Error("Payment service could not be loaded. Please try again."));
      };
      root.head.append(script);
    }).catch(error => {
      // Do not cache a rejected promise: a transient script/CSP/load failure
      // must not permanently disable checkout for the rest of this tab.
      checkoutScriptPromise = null;
      throw error;
    });
  }
  return checkoutScriptPromise;
}

// A checkout success callback is only a user-facing acknowledgement. Access is
// granted exclusively by the verified server-side captured-payment webhook.
export async function startStudentTestCheckout({ app, test, onStatus, root = document }) {
  if (!test || typeof test.testId !== "string" || !test.testId) {
    throw new Error("A valid test is required for checkout.");
  }
  if (test.accessType !== "paid" || !Number.isFinite(Number(test.price)) || Number(test.price) <= 0) {
    throw new Error("This test is not available for paid checkout.");
  }
  if (typeof onStatus === "function") onStatus("Preparing secure payment…");
  await loadCheckoutScript(root);

  // Persist the opaque idempotency key in this tab so a reload or lost
  // callable response reuses the same server reservation instead of creating
  // another provider order. Unknown outcomes deliberately retain this key.
  const storage = requirePaymentSessionStorage(root);
  const requestId = getOrCreatePaymentRequestId(storage, test.testId, createPaymentRequestId);
  let order;
  try {
    order = await createStudentPaymentOrder(app, test.testId, requestId);
  } catch (error) {
    // The server sets this detail only after Razorpay explicitly rejected order
    // creation. Network ambiguity never clears the key and remains locked for
    // reconciliation.
    if (isDefiniteProviderOrderRejection(error)) clearPaymentRequestId(storage, test.testId);
    throw error;
  }
  if (!order || !order.orderId || !order.keyId || !Number.isSafeInteger(order.amount) || order.amount <= 0 ||
      order.currency !== "INR" || order.testId !== test.testId) {
    throw new Error("The payment order response could not be verified.");
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(value);
    };
    const checkout = new globalThis.Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      order_id: order.orderId,
      name: "Railway Mitra",
      description: test.title || "Test Series Access",
      handler: response => {
        if (typeof onStatus === "function") {
          onStatus("Payment submitted. Access will activate after server verification; refresh your tests shortly.");
        }
        finish(null, { submitted: true, paymentId: response && response.razorpay_payment_id });
      },
      modal: {
        ondismiss: () => finish(new Error("Payment window closed. No access has been granted.")),
        animation: true
      },
      notes: { testId: test.testId }
    });
    checkout.on("payment.failed", event => {
      const message = event && event.error && event.error.description;
      finish(new Error(message || "Payment was not completed. Please try again."));
    });
    checkout.open();
  });
}
