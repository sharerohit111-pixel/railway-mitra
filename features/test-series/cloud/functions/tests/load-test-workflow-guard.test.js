"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "../../../../../");
const readWorkflow = name => fs.readFileSync(path.join(repositoryRoot, ".github/workflows", name), "utf8");
const cbtWorkflow = readWorkflow("test-series-cbt-emulator.yml");
const functionsWorkflow = readWorkflow("test-series-functions.yml");
const firestoreLoadWorkflow = readWorkflow("test-series-firestore-load-emulator.yml");
const callableLoadWorkflow = readWorkflow("test-series-callable-load-emulator.yml");


function eventPathFilters(workflow, eventName) {
  const event = workflow.match(new RegExp(
    "^  " + eventName + ":\\n([\\s\\S]*?)(?=^  [A-Za-z_][\\w-]*:\\n|^permissions:)",
    "m"
  ));
  assert.ok(event, eventName + " trigger must be present");
  const paths = event[1].match(/^    paths:\n((?:      - [^\n]+\n)+)/m);
  assert.ok(paths, eventName + " path filters must be explicit");
  return [...paths[1].matchAll(/^      - "([^"]+)"$/gm)].map(match => match[1]);
}

function assertManualOptInWorkflow(workflow, label) {
  const onStart = workflow.indexOf("\non:");
  const permissionsStart = workflow.indexOf("\npermissions:");
  assert.ok(onStart >= 0 && permissionsStart > onStart, label + " trigger block must be present");
  const triggerBlock = workflow.slice(onStart, permissionsStart);
  assert.match(triggerBlock, /workflow_dispatch:/);
  assert.doesNotMatch(triggerBlock, /^\s*(push|pull_request|schedule):/m);
  assert.match(
    workflow,
    /confirm_load_test:[\s\S]*?required:\s*true[\s\S]*?default:\s*false[\s\S]*?type:\s*boolean/
  );
  assert.match(workflow, /if:\s*\$\{\{\s*inputs\.confirm_load_test\s*==\s*true\s*\}\}/);
}

test("ordinary CBT emulator CI never invokes a load-test harness", () => {
  assert.doesNotMatch(cbtWorkflow, /CALLABLE_LOAD_|load:callable:emulator|load:emulator/);
  assert.match(cbtWorkflow, /Run CBT unit and Firestore Rules emulator tests/);
});

test("automated Test Series validation workflows grant only read-only repository contents", () => {
  for (const [label, workflow] of [
    ["CBT emulator workflow", cbtWorkflow],
    ["Functions validation workflow", functionsWorkflow]
  ]) {
    const permissions = workflow.match(/^permissions:\s*\n((?:[ \t]+[^\n]*\n)+)/m);
    assert.ok(permissions, label + " must declare explicit token permissions");
    assert.deepEqual(
      permissions[1].trim().split(/\r?\n/).map(line => line.trim()),
      ["contents: read"],
      label + " must not receive write or broader token permissions"
    );
  }
});


test("security-sensitive Firestore Rules and App Check changes trigger the right CI workflows", () => {
  for (const eventName of ["push", "pull_request"]) {
    const cbtPaths = eventPathFilters(cbtWorkflow, eventName);
    const functionsPaths = eventPathFilters(functionsWorkflow, eventName);
    assert.ok(cbtPaths.includes("features/test-series/cloud/firestore.rules"),
      "CBT " + eventName + " must run when isolated Firestore Rules change");
    assert.ok(functionsPaths.includes("features/test-series/cloud/firestore.rules"),
      "Functions " + eventName + " validation must run when isolated Firestore Rules change");
    assert.ok(functionsPaths.includes("features/test-series/cloud/app-check.js"),
      "Functions " + eventName + " validation must run when App Check initialization changes");
    assert.ok(functionsPaths.includes("features/test-series/cloud/firebase-app-check-init.js"),
      "Functions " + eventName + " validation must run when Firebase/App Check bootstrap changes");
  }
});

test("Firestore load workflow is manual-only and disabled without explicit opt-in", () => {
  assertManualOptInWorkflow(firestoreLoadWorkflow, "Firestore load workflow");
});

test("authenticated callable load workflow is manual-only and disabled without explicit opt-in", () => {
  assertManualOptInWorkflow(callableLoadWorkflow, "Callable load workflow");
  assert.ok(callableLoadWorkflow.includes("CALLABLE_LOAD_STUDENTS: [1, 500]"));
  assert.ok(callableLoadWorkflow.includes("CALLABLE_LOAD_CONCURRENCY: [1, 500]"));
  assert.match(callableLoadWorkflow, /CALLABLE_LOAD_QUESTIONS:[\s\S]*?\[1, 100\]/);
  assert.match(callableLoadWorkflow, /127\.0\.0\.1:9099/);
  assert.match(callableLoadWorkflow, /127\.0\.0\.1:8080/);
  assert.match(callableLoadWorkflow, /127\.0\.0\.1:5001/);
  assert.match(callableLoadWorkflow, /demo-railway-mitra-callable-load/);
  assert.ok(callableLoadWorkflow.includes("firebase.test-series-cbt-emulator.json"));
  assert.ok(callableLoadWorkflow.includes('default: "20"'));
  assert.match(callableLoadWorkflow, /singleProjectMode !== true/);
  assert.ok(callableLoadWorkflow.includes("            config.emulators?.singleProjectMode !== true"));
  assert.ok(callableLoadWorkflow.includes("inputs.students || '20'"));
  assert.ok(callableLoadWorkflow.includes("inputs.concurrency || '20'"));
  assert.match(callableLoadWorkflow, /single-project emulator mode/);
  assert.match(callableLoadWorkflow, /Verify isolated Test Series emulator configuration/);
  assert.ok(callableLoadWorkflow.includes('functions[0].codebase !== "test-series"'));
  assert.doesNotMatch(callableLoadWorkflow, /firebase deploy|prod(uction)?\./i);
});

test("callable load fixtures satisfy paid entitlement ledger checks and clean up", () => {
  const callableLoadScript = fs.readFileSync(
    path.join(repositoryRoot, "features/test-series/cloud/functions/tests/load/callable-emulator-load.js"),
    "utf8"
  );
  assert.match(callableLoadScript, /paymentId:\s*"loadpay-/);
  assert.match(callableLoadScript, /orderId:\s*"loadorder-/);
  assert.match(callableLoadScript, /testSeriesPayments\//);
  assert.match(callableLoadScript, /testSeriesPaymentOrders\//);
  assert.match(callableLoadScript, /status:\s*"captured"/);
  assert.match(callableLoadScript, /status:\s*"paid"/);
  assert.match(callableLoadScript, /razorpayOrderId:\s*student\.orderId/);
  assert.match(callableLoadScript, /amount:\s*100/);
  assert.match(callableLoadScript, /currency:\s*"INR"/);
  assert.match(callableLoadScript, /Capture the server-created attempt before validating the response/);
  assert.ok(
    callableLoadScript.indexOf("attemptIds.push(result.attemptId)") <
    callableLoadScript.indexOf('if (!student.attemptId || result.resumed)')
  );
  assert.match(callableLoadScript, /cleanupRefs/);
  assert.match(callableLoadScript, /testSeriesPayments\/" \+ s\.paymentId/);
  assert.match(callableLoadScript, /testSeriesPaymentOrders\/" \+ s\.orderId/);
});
