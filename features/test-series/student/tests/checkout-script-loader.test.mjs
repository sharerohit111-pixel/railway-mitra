import { test } from "node:test";
import assert from "node:assert/strict";
import { createCheckoutScriptLoader } from "../checkout-script-loader.mjs";

function harness({ initiallyReady = false, appendError = null } = {}) {
  let ready = initiallyReady;
  let appended = 0;
  let removed = 0;
  const scripts = [];
  const loader = createCheckoutScriptLoader({
    getCheckout: () => ready ? function Razorpay() {} : undefined,
    createScript: () => ({}),
    appendScript: script => {
      appended += 1;
      scripts.push(script);
      if (appendError) throw appendError;
    },
    removeScript: () => { removed += 1; }
  });
  return {
    loader,
    scripts,
    setReady(value) { ready = value; },
    get appended() { return appended; },
    get removed() { return removed; }
  };
}

test("concurrent callers share one script load for the same document loader", async () => {
  const state = harness();
  const first = state.loader();
  const second = state.loader();
  assert.equal(first, second);
  assert.equal(state.appended, 1);
  assert.equal(state.scripts[0].src, "https://checkout.razorpay.com/v1/checkout.js");
  assert.equal(state.scripts[0].async, true);

  state.setReady(true);
  state.scripts[0].onload();
  await Promise.all([first, second]);
  assert.equal(state.removed, 0);
  assert.equal(state.scripts[0].onload, null);
  assert.equal(state.scripts[0].onerror, null);
});

test("a network failure removes the failed element and a later retry can load", async () => {
  const state = harness();
  const first = state.loader();
  const failed = assert.rejects(first, /Payment service could not be loaded/);
  state.scripts[0].onerror();
  await failed;
  assert.equal(state.removed, 1);

  const retry = state.loader();
  assert.notEqual(retry, first);
  assert.equal(state.appended, 2);
  state.setReady(true);
  state.scripts[1].onload();
  await retry;
});

test("load event without the Razorpay constructor fails closed and permits retry", async () => {
  const state = harness();
  const first = state.loader();
  const failed = assert.rejects(first, /could not be initialized/);
  state.scripts[0].onload();
  await failed;
  assert.equal(state.removed, 1);
  assert.equal(state.appended, 1);

  const retry = state.loader();
  assert.equal(state.appended, 2);
  state.setReady(true);
  state.scripts[1].onload();
  await retry;
});

test("an already initialized Razorpay checkout does not append another script", async () => {
  const state = harness({ initiallyReady: true });
  await state.loader();
  assert.equal(state.appended, 0);
  assert.equal(state.removed, 0);
});

test("a synchronous append failure clears the pending load for retry", async () => {
  const state = harness({ appendError: new Error("CSP blocked script insertion") });
  await assert.rejects(state.loader(), /CSP blocked script insertion/);
  assert.equal(state.removed, 1);
  assert.equal(state.appended, 1);
});
