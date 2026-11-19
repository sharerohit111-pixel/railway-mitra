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

test("deployed callable policy requires App Check and emulator bypass needs a demo project", () => {
  assert.deepEqual(getCallableOptions({}), {
    region: "asia-south1",
    enforceAppCheck: true
  });
  assert.deepEqual(getCallableOptions({
    FUNCTIONS_EMULATOR: "true",
    GCLOUD_PROJECT: "demo-railway-mitra-cbt"
  }), {
    region: "asia-south1",
    enforceAppCheck: false
  });
  assert.equal(
    getCallableOptions({ FUNCTIONS_EMULATOR: "true", GCLOUD_PROJECT: "railway-mitra" }).enforceAppCheck,
    true,
    "the emulator marker must not bypass App Check for the real Railway Mitra project"
  );
  for (const marker of ["K_SERVICE", "K_REVISION", "K_CONFIGURATION"]) {
    assert.equal(
      getCallableOptions({
        FUNCTIONS_EMULATOR: "true",
        GCLOUD_PROJECT: "demo-railway-mitra-cbt",
        [marker]: "railway-mitra-test-series"
      }).enforceAppCheck,
      true,
      marker + " without the exact emulator runtime signature must prevent the bypass"
    );
  }
  assert.equal(
    getCallableOptions({
      FUNCTIONS_EMULATOR: "true",
      GCLOUD_PROJECT: "demo-railway-mitra-cbt",
      K_SERVICE: "asia-south1-rmStartExam",
      K_REVISION: "1"
    }).enforceAppCheck,
    false,
    "the Functions Emulator's synthetic function/revision markers must not disable emulator tests"
  );
  assert.equal(
    getCallableOptions({
      FUNCTIONS_EMULATOR: "true",
      GCLOUD_PROJECT: "demo-railway-mitra-cbt",
      K_SERVICE: "asia-south1-rmStartExam",
      K_REVISION: "1",
      K_CONFIGURATION: "railway-mitra-test-series"
    }).enforceAppCheck,
    true,
    "a Cloud Run configuration marker must override the emulator-like revision"
  );
  assert.equal(
    getCallableOptions({
      FUNCTIONS_EMULATOR: "true",
      GCLOUD_PROJECT: "demo-railway-mitra-cbt",
      K_SERVICE: "railway-mitra-test-series",
      K_REVISION: "railway-mitra-test-series-00001-abc"
    }).enforceAppCheck,
    true,
    "a deployed Cloud Run revision identifier must keep App Check enforced"
  );
  assert.equal(
    getCallableOptions({ FUNCTIONS_EMULATOR: "true" }).enforceAppCheck,
    true,
    "the emulator marker without a demo project ID must fail closed"
  );
  assert.equal(
    getCallableOptions({ GCLOUD_PROJECT: "demo-railway-mitra-cbt" }).enforceAppCheck,
    true,
    "a demo project ID without the emulator runtime marker must still enforce App Check"
  );
  assert.equal(
    getCallableOptions({ FUNCTIONS_EMULATOR: "false", APP_CHECK_ENFORCE: "false" }).enforceAppCheck,
    true,
    "an unrelated environment flag must not disable production enforcement"
  );
});

test("every exported callable uses the shared fail-closed App Check options", () => {
  const source = readRepositoryFile("features/test-series/cloud/functions/index.js");
  const declarations = [...source.matchAll(/exports\.(\w+)\s*=\s*onCall\(([\s\S]*?),\s*async\s+req\s*=>/g)];
  const callCount = (source.match(/\bonCall\s*\(/g) || []).length;

  assert.ok(declarations.length >= 20, "expected the Test Series callable surface to be covered");
  assert.equal(declarations.length, callCount, "every onCall declaration must be matched");
  for (const declaration of declarations) {
    assert.match(declaration[2], /CALLABLE_OPTIONS/, declaration[1] + " must use shared App Check options");
  }
  assert.match(source, /exports\.rmRazorpayWebhook\s*=\s*onRequest/);
  assert.match(source, /secrets:\s*\[RAZORPAY_WEBHOOK_SECRET\]/);
});

test("production App Check initializes before Auth, Firestore and Functions clients", () => {
  const sharedConfig = readRepositoryFile("assets/js/firebase.js");
  const bootstrap = readRepositoryFile("features/test-series/cloud/firebase-app-check-init.js");
  const provider = readRepositoryFile("features/test-series/cloud/app-check.js");

  for (const key of ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"]) {
    assert.equal(
      firebaseConfigValue(bootstrap, key),
      firebaseConfigValue(sharedConfig, key),
      "Test Series production Firebase config must stay aligned for " + key
    );
  }

  assert.match(bootstrap, /resolveTestSeriesFirebaseMode\(globalThis\.location\)/);
  assert.match(bootstrap, /initializeApp\(firebaseConfig,\s*["']railway-mitra-test-series["']\)/);
  assert.match(bootstrap, /bootstrapMode\.mode === ["']emulator["']\s*\?\s*null\s*:\s*initializeRailwayMitraAppCheck\(app\)/);
  const appCheckPosition = bootstrap.indexOf("initializeRailwayMitraAppCheck(app)");
  const authPosition = bootstrap.indexOf("getAuth(app)");
  const firestorePosition = bootstrap.indexOf("getFirestore(app)");
  const functionsPosition = bootstrap.indexOf('getFunctions(app, "asia-south1")');
  assert.ok(appCheckPosition >= 0 && authPosition > appCheckPosition && firestorePosition > appCheckPosition && functionsPosition > appCheckPosition);
  assert.doesNotMatch(bootstrap, /from ["'][^"']*assets\/js\/firebase\.js["']/);
  assert.match(provider, /new ReCaptchaEnterpriseProvider\(SITE_KEY\)/);
  assert.match(provider, /isTokenAutoRefreshEnabled:\s*true/);
});

test("emulator bootstrap connects all Firebase services before portal modules execute", () => {
  const bootstrap = readRepositoryFile("features/test-series/cloud/firebase-app-check-init.js");
  assert.match(bootstrap, /connectAuthEmulator\(auth,/);
  assert.match(bootstrap, /connectFirestoreEmulator\(db,/);
  assert.match(bootstrap, /connectFunctionsEmulator\(functions,/);
  assert.match(bootstrap, /firebaseBootstrapMode = bootstrapMode\.mode/);
});

test("Owner and Student portals consume the dedicated App Check bootstrap", () => {
  for (const file of [
    "features/test-series/admin/owner-portal.js",
    "features/test-series/student/portal.js"
  ]) {
    const source = readRepositoryFile(file);
    assert.match(source, /from ["']\.\.\/cloud\/firebase-app-check-init\.js["']/);
    assert.doesNotMatch(source, /from ["'][^"']*assets\/js\/firebase\.js["']/);
  }
});

test("Razorpay webhook is the only HTTP endpoint and verifies signed raw bytes before ledger processing", () => {
  const source = readRepositoryFile("features/test-series/cloud/functions/index.js");
  const httpDeclarations = [...source.matchAll(/\bonRequest\s*\(/g)];
  assert.equal(
    httpDeclarations.length,
    1,
    "new HTTP endpoints must receive an explicit authentication and App Check boundary review"
  );
  assert.match(
    source,
    /exports\.rmRazorpayWebhook\s*=\s*onRequest\(\s*\{\s*region:\s*REGION,\s*secrets:\s*\[RAZORPAY_WEBHOOK_SECRET\]\s*\}/
  );

  const handler = readRepositoryFile("features/test-series/cloud/functions/razorpay-webhook-handler.js");
  const methodGuard = handler.indexOf('if (req.method !== "POST")');
  const sizeGuard = handler.indexOf("rawBody.length > MAX_WEBHOOK_BODY_BYTES");
  const signatureGuard = handler.indexOf("if (!verifyRazorpayWebhookSignature({ rawBody, signature, secret }))");
  const signedPayloadParse = handler.indexOf('event = JSON.parse(rawBody.toString("utf8"))');
  const eventIdValidation = handler.indexOf('const eventId = req.get("x-razorpay-event-id")');
  const ledgerDispatch = handler.indexOf("await processor({ db, event, eventId })");

  assert.ok(methodGuard >= 0, "webhook must reject non-POST requests");
  assert.ok(sizeGuard > methodGuard, "webhook body size must be bounded before signature work");
  assert.ok(signatureGuard > sizeGuard, "HMAC verification must follow the body-size guard");
  assert.ok(signedPayloadParse > signatureGuard, "only the verified raw body may be parsed");
  assert.ok(eventIdValidation > signedPayloadParse, "event identity must be validated before ledger dispatch");
  assert.ok(ledgerDispatch > eventIdValidation, "payment/refund ledger writes must occur after all request guards");
});
