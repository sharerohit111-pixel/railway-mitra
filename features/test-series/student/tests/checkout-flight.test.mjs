import { test } from "node:test";
import assert from "node:assert/strict";
import { runStudentCheckoutOnce } from "../checkout-flight.mjs";

test("concurrent checkout calls for one app, student and test share one operation", async () => {
  const app = {};
  let calls = 0;
  let resolveOperation;
  const operation = () => {
    calls += 1;
    return new Promise(resolve => { resolveOperation = resolve; });
  };
  const args = { app, studentUid: "student-a", testId: "test-a", operation };
  const first = runStudentCheckoutOnce(args);
  const second = runStudentCheckoutOnce({ ...args, operation: () => { calls += 1; return "duplicate"; } });
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);
  resolveOperation({ submitted: true });
  assert.deepEqual(await Promise.all([first, second]), [{ submitted: true }, { submitted: true }]);
});

test("different students and tests do not block each other's checkout", async () => {
  const app = {};
  let calls = 0;
  const run = (studentUid, testId) => runStudentCheckoutOnce({
    app, studentUid, testId, operation: async () => ++calls
  });
  const values = await Promise.all([
    run("student-a", "test-a"),
    run("student-b", "test-a"),
    run("student-a", "test-b")
  ]);
  assert.deepEqual(values, [1, 2, 3]);
  assert.equal(calls, 3);
});

test("separate Firebase app instances keep checkout operations independent", async () => {
  let calls = 0;
  const run = app => runStudentCheckoutOnce({
    app, studentUid: "student-a", testId: "test-a", operation: async () => ++calls
  });
  assert.deepEqual(await Promise.all([run({}), run({})]), [1, 2]);
  assert.equal(calls, 2);
});

test("a rejected checkout clears its identity so a later retry can run", async () => {
  const app = {};
  let calls = 0;
  const args = { app, studentUid: "student-a", testId: "test-a", operation: async () => {
    calls += 1;
    throw new Error("checkout failed");
  }};
  await assert.rejects(runStudentCheckoutOnce(args), /checkout failed/);
  assert.equal(await runStudentCheckoutOnce({ ...args, operation: async () => {
    calls += 1;
    return "retried";
  }}), "retried");
  assert.equal(calls, 2);
});

test("a completed checkout does not leave a stale lock for the next attempt", async () => {
  const app = {};
  let calls = 0;
  const run = () => runStudentCheckoutOnce({
    app, studentUid: "student-a", testId: "test-a", operation: async () => ++calls
  });
  assert.equal(await run(), 1);
  assert.equal(await run(), 2);
});

test("invalid checkout identity and operation are rejected", () => {
  assert.throws(() => runStudentCheckoutOnce({ app: null, studentUid: "a", testId: "b", operation() {} }), /Firebase app/);
  assert.throws(() => runStudentCheckoutOnce({ app: {}, studentUid: "", testId: "b", operation() {} }), /student UID/);
  assert.throws(() => runStudentCheckoutOnce({ app: {}, studentUid: "a", testId: "", operation() {} }), /test ID/);
  assert.throws(() => runStudentCheckoutOnce({ app: {}, studentUid: "a", testId: "b" }), /checkout operation/);
});
