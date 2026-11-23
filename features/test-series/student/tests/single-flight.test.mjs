import { test } from "node:test";
import assert from "node:assert/strict";
import { runSingleFlight } from "../single-flight.mjs";

test("concurrent calls for the same key share one operation and promise", async () => {
  const key = {};
  let calls = 0;
  let resolveOperation;
  const operation = () => {
    calls += 1;
    return new Promise(resolve => { resolveOperation = resolve; });
  };
  const first = runSingleFlight(key, operation);
  const second = runSingleFlight(key, operation);
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);
  resolveOperation("loaded");
  assert.equal(await first, "loaded");
});

test("a failed operation clears its key so the user can retry", async () => {
  const key = {};
  let calls = 0;
  await assert.rejects(runSingleFlight(key, async () => {
    calls += 1;
    throw new Error("temporary failure");
  }), /temporary failure/);
  assert.equal(await runSingleFlight(key, async () => {
    calls += 1;
    return "retried";
  }), "retried");
  assert.equal(calls, 2);
});

test("different keys run independently", async () => {
  const firstKey = {};
  const secondKey = {};
  let calls = 0;
  const [first, second] = await Promise.all([
    runSingleFlight(firstKey, async () => ++calls),
    runSingleFlight(secondKey, async () => ++calls)
  ]);
  assert.deepEqual([first, second], [1, 2]);
});

test("invalid keys and operations are rejected", () => {
  assert.throws(() => runSingleFlight(null, () => {}), TypeError);
  assert.throws(() => runSingleFlight({}, null), TypeError);
});

test("a synchronous operation error also releases the key", async () => {
  const key = {};
  assert.equal(await runSingleFlight(key, () => {
    throw new Error("sync failure");
  }).catch(error => error.message), "sync failure");
  assert.equal(await runSingleFlight(key, () => "recovered"), "recovered");
});

test("a synchronous throw is shared by concurrent callers", async () => {
  const key = {};
  let calls = 0;
  const operation = () => {
    calls += 1;
    throw new Error("shared sync failure");
  };
  const first = runSingleFlight(key, operation);
  const second = runSingleFlight(key, operation);
  assert.equal(first, second);
  const outcomes = await Promise.allSettled([first, second]);
  assert.equal(calls, 1);
  assert.deepEqual(outcomes.map(item => item.status), ["rejected", "rejected"]);
  assert.equal(outcomes[0].reason.message, "shared sync failure");
});
