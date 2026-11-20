"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repositoryRoot = path.resolve(__dirname, "../../../../..");

test("App Check diagnostic is available only with the production web App Check instance", async () => {
  const {
    canRunAppCheckDiagnostic
  } = await import("../../app-check-diagnostic.mjs");

  assert.equal(canRunAppCheckDiagnostic("production", {}), true);
  assert.equal(canRunAppCheckDiagnostic("production", null), false);
  assert.equal(canRunAppCheckDiagnostic("emulator", null), false);
  assert.equal(canRunAppCheckDiagnostic("emulator", {}), false);
  assert.equal(canRunAppCheckDiagnostic("unknown", {}), false);
  assert.equal(canRunAppCheckDiagnostic("production", undefined), false);
});

test("App Check diagnostic exposes only a bounded safe Firebase error code", async () => {
  const {
    safeAppCheckDiagnosticErrorCode
  } = await import("../../app-check-diagnostic.mjs");

  assert.equal(
    safeAppCheckDiagnosticErrorCode({ code: "appCheck/throttled" }),
    "appCheck/throttled"
  );
  assert.equal(safeAppCheckDiagnosticErrorCode(null), "unknown-error");
  assert.equal(safeAppCheckDiagnosticErrorCode({}), "unknown-error");
  assert.equal(safeAppCheckDiagnosticErrorCode({ code: "token:secret-value" }), "unknown-error");
  assert.equal(safeAppCheckDiagnosticErrorCode({ code: "provider-error\nprivate-detail" }), "unknown-error");
  assert.equal(safeAppCheckDiagnosticErrorCode({ code: "x".repeat(121) }), "unknown-error");
});

test("App Check diagnostic page skips emulator token requests and never renders raw provider errors", () => {
  const source = fs.readFileSync(
    path.join(repositoryRoot, "features/test-series/cloud/app-check-test.html"),
    "utf8"
  );

  assert.match(source, /firebaseBootstrapMode,\s*testSeriesAppCheck/);
  assert.match(source, /canRunAppCheckDiagnostic\(firebaseBootstrapMode,\s*testSeriesAppCheck\)/);
  assert.match(source, /स्थानीय Emulator mode में web App Check जानबूझकर बंद है/);
  assert.match(source, /getToken\(testSeriesAppCheck,\s*false\)/);
  assert.match(source, /safeAppCheckDiagnosticErrorCode\(error\)/);
  assert.doesNotMatch(source, /error\.message/);
  assert.doesNotMatch(source, /console\.error\([^)]*error/);
});


test("App Check diagnostic changes trigger both push and pull-request validation workflows", () => {
  const requiredPaths = [
    "features/test-series/cloud/app-check.js",
    "features/test-series/cloud/firebase-app-check-init.js",
    "features/test-series/cloud/app-check-diagnostic.mjs",
    "features/test-series/cloud/app-check-test.html"
  ];
  const workflows = [
    ".github/workflows/test-series-functions.yml",
    ".github/workflows/test-series-cbt-emulator.yml"
  ];

  for (const workflowPath of workflows) {
    const workflow = fs.readFileSync(path.join(repositoryRoot, workflowPath), "utf8");
    for (const requiredPath of requiredPaths) {
      const entry = `      - "${requiredPath}"`;
      assert.equal(
        workflow.split(entry).length - 1,
        2,
        workflowPath + " must trigger on both push and pull_request for " + requiredPath
      );
    }
  }
});
