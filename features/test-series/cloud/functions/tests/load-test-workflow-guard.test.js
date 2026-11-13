"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "../../../../../");
const readWorkflow = name => fs.readFileSync(path.join(repositoryRoot, ".github/workflows", name), "utf8");
const cbtWorkflow = readWorkflow("test-series-cbt-emulator.yml");
const firestoreLoadWorkflow = readWorkflow("test-series-firestore-load-emulator.yml");
const callableLoadWorkflow = readWorkflow("test-series-callable-load-emulator.yml");

function assertManualOptInWorkflow(workflow, label) {
  const onStart = workflow.indexOf("\\non:");
  const permissionsStart = workflow.indexOf("\\npermissions:");
  assert.ok(onStart >= 0 && permissionsStart > onStart, label + " trigger block must be present");
  const triggerBlock = workflow.slice(onStart, permissionsStart);
  assert.match(triggerBlock, /workflow_dispatch:/);
  assert.doesNotMatch(triggerBlock, /^\\s*(push|pull_request|schedule):/m);
  assert.match(
    workflow,
    /confirm_load_test:[\\s\\S]*?required:\\s*true[\\s\\S]*?default:\\s*false[\\s\\S]*?type:\\s*boolean/
  );
  assert.match(workflow, /if:\\s*\\$\\{\\{\\s*inputs\\.confirm_load_test\\s*==\\s*true\\s*\\}\\}/);
}

test("ordinary CBT emulator CI never invokes a load-test harness", () => {
  assert.doesNotMatch(cbtWorkflow, /CALLABLE_LOAD_|load:callable:emulator|load:emulator/);
  assert.match(cbtWorkflow, /Run CBT unit and Firestore Rules emulator tests/);
});

test("Firestore load workflow is manual-only and disabled without explicit opt-in", () => {
  assertManualOptInWorkflow(firestoreLoadWorkflow, "Firestore load workflow");
});

test("authenticated callable load workflow is manual-only and disabled without explicit opt-in", () => {
  assertManualOptInWorkflow(callableLoadWorkflow, "Callable load workflow");
  assert.match(callableLoadWorkflow, /CALLABLE_LOAD_STUDENTS:[\\s\\S]*?\\[1, 100\\]/);
  assert.match(callableLoadWorkflow, /CALLABLE_LOAD_CONCURRENCY:[\\s\\S]*?\\[1, 100\\]/);
  assert.match(callableLoadWorkflow, /CALLABLE_LOAD_QUESTIONS:[\\s\\S]*?\\[1, 100\\]/);
  assert.match(callableLoadWorkflow, /127\\.0\\.0\\.1:9099/);
  assert.match(callableLoadWorkflow, /127\\.0\\.0\\.1:8080/);
  assert.match(callableLoadWorkflow, /127\\.0\\.0\\.1:5001/);
  assert.match(callableLoadWorkflow, /demo-railway-mitra-callable-load/);
  assert.doesNotMatch(callableLoadWorkflow, /firebase deploy|prod(uction)?\\./i);
});
