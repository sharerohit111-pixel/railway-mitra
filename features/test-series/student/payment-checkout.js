import { createPaymentRequestId, createStudentPaymentOrder } from "../cloud/student-client.js";
import { createCheckoutScriptLoader } from "./checkout-script-loader.mjs";
import { runStudentCheckoutOnce } from "./checkout-flight.mjs";
import {
  clearPaymentRequestId,
  getOrCreatePaymentRequestId,
  isDefiniteProviderOrderRejection,
  requirePaymentSessionStorage
} from "./payment-request-session.mjs";

const checkoutLoaders = new WeakMap();

function loadCheckoutScript(root = document) {
  if (!root || typeof root !== "object") {
    return Promise.reject(new Error("Payment checkout document is unavailable."));
  }
  let loader = checkoutLoaders.get(root);
  if (!loader) {
    loader = createCheckoutScriptLoader({
      getCheckout: () => globalThis.Razorpay,
      createScript: () => root.createElement("script"),
      appendScript: script => root.head.append(script),
      removeScript: script => {
        if (script && typeof script.remove === "function") script.remove();
        else if (script && script.parentNode && typeof script.parentNode.removeChild === "function") {
          script.parentNode.removeChild(script);
        }
      }
    });
    checkoutLoaders.set(root, loader);
  }
  return loader();
}

// A checkout success callback is only a user-facing acknowledgement. Access is
// granted exclusively by the verified server-side captured-payment webhook.
// Keep one checkout/order flow active per Firebase app, student and test in this JS realm.
// The server-side request lock and verified webhook remain authoritative across tabs/devices.
export function startStudentTestCheckout(options = {}) {
  const app = options && options.app;
  const studentUid = options && options.studentUid;
  const testId = options && options.test && options.test.testId;
  if (!app || (typeof app !== "object" && typeof app !== "function") ||
      typeof studentUid !== "string" || !studentUid ||
      typeof testId !== "string" || !testId) {
    return performStudentTestCheckout(options);
  }
  return runStudentCheckoutOnce({
    app,
    studentUid,
    testId,
    operation: () => performStudentTestCheckout(options)
  });
}

async function performStudentTestCheckout({ app, test, studentUid, onStatus, isSessionActive = () => true, root = document } = {}) {
  const assertSessionActive = () => {
    if (typeof isSessionActive !== "function" || !isSessionActive()) {
      throw new Error("Student session changed. Payment checkout was paused; sign in again to continue.");
    }
  };
  if (typeof studentUid !== "string" || !studentUid) throw new Error("A verified student account is required for checkout.");
  if (!test || typeof test.testId !== "string" || !test.testId) {
    throw new Error("A valid test is required for checkout.");
  }
  if (test.accessType !== "paid" || !Number.isFinite(Number(test.price)) || Number(test.price) <= 0) {
    throw new Error("This test is not available for paid checkout.");
  }
  if (typeof onStatus === "function") onStatus("Preparing secure payment…");
  await loadCheckoutScript(root);
  assertSessionActive();

  // Persist the opaque idempotency key in this tab so a reload or lost
  // callable response reuses the same server reservation instead of creating
  // another provider order. Unknown outcomes deliberately retain this key.
  const storage = requirePaymentSessionStorage(root);
  const requestId = getOrCreatePaymentRequestId(storage, studentUid, test.testId, createPaymentRequestId);
  let order;
  try {
    order = await createStudentPaymentOrder(app, test.testId, requestId);
    assertSessionActive();
  } catch (error) {
    // The server sets this detail only after Razorpay explicitly rejected order
    // creation. Network ambiguity never clears the key and remains locked for
    // reconciliation.
    if (isDefiniteProviderOrderRejection(error)) clearPaymentRequestId(storage, studentUid, test.testId);
    throw error;
  }
  if (!order || !order.orderId || !order.keyId || !Number.isSafeInteger(order.amount) || order.amount <= 0 ||
      order.currency !== "INR" || order.testId !== test.testId) {
    throw new Error("The payment order response could not be verified.");
  }

  assertSessionActive();
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
