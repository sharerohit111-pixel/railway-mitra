const CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

function checkoutReady(getCheckout) {
  try {
    return typeof getCheckout() === "function";
  } catch {
    return false;
  }
}

export function createCheckoutScriptLoader({
  getCheckout,
  createScript,
  appendScript,
  removeScript = script => {
    if (script && typeof script.remove === "function") script.remove();
    else if (script && script.parentNode && typeof script.parentNode.removeChild === "function") {
      script.parentNode.removeChild(script);
    }
  }
} = {}) {
  if (typeof getCheckout !== "function" || typeof createScript !== "function" ||
      typeof appendScript !== "function" || typeof removeScript !== "function") {
    throw new TypeError("Checkout script loader requires checkout, script creation and DOM callbacks");
  }

  let pending = null;
  return function loadCheckoutScript() {
    if (checkoutReady(getCheckout)) return Promise.resolve();
    if (pending) return pending;

    pending = new Promise((resolve, reject) => {
      let script = null;
      let settled = false;
      const cleanup = remove => {
        if (!script) return;
        script.onload = null;
        script.onerror = null;
        if (remove) {
          try { removeScript(script); } catch { /* preserve the original load error */ }
        }
      };
      const fail = error => {
        if (settled) return;
        settled = true;
        cleanup(true);
        reject(error instanceof Error ? error : new Error("Payment service could not be loaded. Please try again."));
      };

      try {
        script = createScript();
        if (!script || typeof script !== "object") throw new Error("Payment script element could not be created.");
        script.src = CHECKOUT_SCRIPT;
        script.async = true;
        script.onload = () => {
          if (!checkoutReady(getCheckout)) {
            fail(new Error("Razorpay Checkout could not be initialized."));
            return;
          }
          if (settled) return;
          settled = true;
          cleanup(false);
          resolve();
        };
        script.onerror = () => fail(new Error("Payment service could not be loaded. Please try again."));
        appendScript(script);
      } catch (error) {
        fail(error);
      }
    }).catch(error => {
      // A failed load must not poison this tab: remove the failed element and
      // allow a later user retry to create a fresh script element.
      pending = null;
      throw error;
    });
    return pending;
  };
}
