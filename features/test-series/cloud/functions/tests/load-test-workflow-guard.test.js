"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "../../../../../");
const cbtWorkflow = fs.readFileSync(
  path.join(repositoryRoot, ".github/workflows/test-series-cbt-emulator.yml"),
  "utf8"
);
const loadWorkflow = fs.readFileSync(
  path.join(repositoryRoot, ".github/workflows/test-series-firestore-load-emulator.yml"),
  "utf8"
);

test("ordinary CBT emulator CI never invokes a load-test harness", () => {
  assert.doesNotMatch(cbtWorkflow, /CALLABLE_LOAD_|load:callable:emulator|load:emulator/);
  assert.match(cbtWorkflow, /Run CBT unit and Firestore Rules emulator tests/);
});

test("Firestore load workflow is manual-only and disabled without explicit opt-in", () => {
  const onStart = loadWorkflow.indexOf("\non:");
  const permissionsStart = loadWorkflow.indexOf("\npermissions:");
  assert.ok(onStart >= 0 && permissionsStart > onStart, "workflow trigger block must be present");
  const triggerBlock = loadWorkflow.slice(onStart, permissionsStart);

  assert.match(triggerBlock, /workflow_dispatch:/);
  assert.doesNotMatch(triggerBlock, /^\s*(push|pull_request):/m);
  assert.match(
    loadWorkflow,
    /confirm_load_test:[\s\S]*?required:\s*true[\s\S]*?default:\s*false[\s\S]*?type:\s*boolean/
  );
  assert.match(
    loadWorkflow,
    /if:\s*\$\{\{\s*inputs\.confirm_load_test\s*==\s*true\s*\}\}/
  );
});
