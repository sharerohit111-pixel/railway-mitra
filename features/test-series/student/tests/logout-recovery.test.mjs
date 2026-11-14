import test from "node:test";
import assert from "node:assert/strict";
import { createStudentLogoutRecovery } from "../logout-recovery.mjs";

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

test("persists a pending logout marker and blocks the same restored student", () => {
  const storage = memoryStorage();
  const firstPage = createStudentLogoutRecovery(() => storage);
  assert.equal(firstPage.block("student-a"), true);

  // A new helper instance represents a page reload using the same origin storage.
  const reloadedPage = createStudentLogoutRecovery(() => storage);
  assert.equal(reloadedPage.shouldBlock("student-a"), true);
});

test("successful sign-out clears the persisted marker", () => {
  const storage = memoryStorage();
  const recovery = createStudentLogoutRecovery(() => storage);
  recovery.block("student-a");
  assert.equal(recovery.clear(), true);
  assert.equal(createStudentLogoutRecovery(() => storage).shouldBlock("student-a"), false);
});

test("a different authenticated UID clears a stale logout marker", () => {
  const storage = memoryStorage();
  const recovery = createStudentLogoutRecovery(() => storage);
  recovery.block("student-a");
  assert.equal(recovery.shouldBlock("student-b"), false);
  assert.equal(createStudentLogoutRecovery(() => storage).shouldBlock("student-a"), false);
});

test("storage failures retain an in-memory lock and report persistence failure", () => {
  const recovery = createStudentLogoutRecovery(() => { throw new Error("storage blocked"); });
  assert.equal(recovery.block("student-a"), false);
  assert.equal(recovery.shouldBlock("student-a"), true);
  assert.equal(recovery.shouldBlock("student-b"), false);
});

test("invalid UIDs cannot create a logout marker", () => {
  const storage = memoryStorage();
  const recovery = createStudentLogoutRecovery(() => storage);
  for (const uid of [null, undefined, "", "   ", 7, {}]) {
    assert.equal(recovery.block(uid), false);
  }
  assert.equal(recovery.shouldBlock("student-a"), false);
});
