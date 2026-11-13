"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { getCallableOptions } = require("../app-check-policy");

const repositoryRoot = path.resolve(__dirname, "../../../../..");
function readRepositoryFile(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function firebaseConfigValue(source, key) {
  const match = source.match(new RegExp("\\b" + key + "\\s*:\\s*[\"']([^\"']+)[\"']"));
  return match ? match[1] : null;
}

test("deployed callable policy requires App Check and only the Functions Emulator bypasses it", () => {
  assert.deepEqual(getCallableOptions({}), {
    region: "asia-south1",
    enforceAppCheck: true
  });
  assert.deepEqual(getCallableOptions({ FUNCTIONS_EMULATOR: "true" }), {
    region: "asia-south1",
    enforceAppCheck: false
  });
  assert.equal(
    getCallableOptions({ FUNCTIONS_EMULATOR: "false", APP_CHECK_ENFORCE: "false" }).enforceAppCheck,
    true,
    "an unrelated environment flag must not disable production enforcement"
  );
});

test("every exported callable uses the shared fail-closed App Check options", () => {
  const source = readRepositoryFile("features/test-series/cloud/functions/index.js");
  const declarations = [...source.matchAll(/exports\\.(\\w+)\\s*=\\s*onCall\\(([\\s\\S]*?),\\s*async\\s+req\\s*=>/g)];
  const callCount = (source.match(/\\bonCall\\s*\\(/g) || []).length;

  assert.ok(declarations.length >= 20, "expected the Test Series callable surface to be covered");
  assert.equal(declarations.length, callCount, "every onCall declaration must be matched");
  for (const declaration of declarations) {
    assert.match(declaration[2], /CALLABLE_OPTIONS/, declaration[1] + " must use shared App Check options");
  }
  assert.match(source, /exports\\.rmRazorpayWebhook\\s*=\\s*onRequest/);
  assert.match(source, /secrets:\\s*\\[RAZORPAY_WEBHOOK_SECRET\\]/);
});

test("App Check initializes on a dedicated Test Series app before Auth and Firestore clients", () => {
  const sharedConfig = readRepositoryFile("assets/js/firebase.js");
  const bootstrap = readRepositoryFile("features/test-series/cloud/firebase-app-check-init.js");

  for (const key of ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"]) {
    assert.equal(
      firebaseConfigValue(bootstrap, key),
      firebaseConfigValue(sharedConfig, key),
      "Test Series Firebase config must stay aligned for " + key
    );
  }

  assert.match(bootstrap, /initializeApp\\(firebaseConfig,\\s*["']railway-mitra-test-series["']\\)/);
  const appCheckPosition = bootstrap.indexOf("initializeRailwayMitraAppCheck(app)");
  const authPosition = bootstrap.indexOf("getAuth(app)");
  const firestorePosition = bootstrap.indexOf("getFirestore(app)");
  assert.ok(appCheckPosition >= 0 && authPosition > appCheckPosition && firestorePosition > appCheckPosition);
  assert.doesNotMatch(bootstrap, /assets\\/js\\/firebase\\.js/);
});

test("Owner and Student portals consume the dedicated App Check bootstrap", () => {
  for (const file of [
    "features/test-series/admin/owner-portal.js",
    "features/test-series/student/portal.js"
  ]) {
    const source = readRepositoryFile(file);
    assert.match(source, /from ["']\\.\\.\\/cloud\\/firebase-app-check-init\\.js["']/);
    assert.doesNotMatch(source, /assets\\/js\\/firebase\\.js/);
  }
});
