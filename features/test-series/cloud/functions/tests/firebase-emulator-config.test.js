"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

test("the explicit local opt-in selects only the demo Firebase project and local emulators", async () => {
  const { resolveTestSeriesFirebaseMode } = await import("../../firebase-emulator-config.mjs");
  const result = resolveTestSeriesFirebaseMode({
    protocol: "http:",
    hostname: "127.0.0.1",
    search: "?rmFirebaseEmulator=1"
  });

  assert.equal(result.mode, "emulator");
  assert.equal(result.firebaseConfig.projectId, "demo-railway-mitra-cbt");
  assert.equal(result.firebaseConfig.apiKey, "demo-api-key");
  assert.deepEqual(result.endpoints, {
    auth: "http://127.0.0.1:9099",
    firestore: { host: "127.0.0.1", port: 8080 },
    functions: { host: "127.0.0.1", port: 5001 }
  });
});

test("production Firebase is selected only on approved Railway Mitra origins", async () => {
  const { resolveTestSeriesFirebaseMode } = await import("../../firebase-emulator-config.mjs");
  for (const location of [
    {
      protocol: "https:",
      hostname: "railway-mitra.com",
      pathname: "/features/test-series/student/portal.html",
      search: ""
    },
    {
      protocol: "https:",
      hostname: "sharerohit111-pixel.github.io",
      pathname: "/railway-mitra/features/test-series/student/portal.html",
      search: ""
    },
    {
      protocol: "https:",
      hostname: "sharerohit111-pixel.github.io",
      pathname: "/railway-mitra",
      search: ""
    }
  ]) {
    assert.deepEqual(resolveTestSeriesFirebaseMode(location), { mode: "production" });
  }
});

test("preview and unrelated hosted origins fail closed before production Firebase initialization", async () => {
  const { resolveTestSeriesFirebaseMode } = await import("../../firebase-emulator-config.mjs");
  for (const location of [
    {
      protocol: "https:",
      hostname: "preview.railway-mitra.com",
      pathname: "/features/test-series/student/portal.html",
      search: ""
    },
    {
      protocol: "https:",
      hostname: "staging.railway-mitra.com",
      pathname: "/features/test-series/student/portal.html",
      search: ""
    },
    {
      protocol: "https:",
      hostname: "example.invalid",
      pathname: "/features/test-series/student/portal.html",
      search: ""
    },
    {
      protocol: "https:",
      hostname: "sharerohit111-pixel.github.io",
      pathname: "/another-project/features/test-series/student/portal.html",
      search: ""
    },
    {
      protocol: "https:",
      hostname: "sharerohit111-pixel.github.io",
      pathname: "/railway-mitra-preview/features/test-series/student/portal.html",
      search: ""
    }
  ]) {
    assert.throws(
      () => resolveTestSeriesFirebaseMode(location),
      /Unapproved Test Series hosted origin/
    );
  }
});

test("hosted production Firebase requires HTTPS", async () => {
  const { resolveTestSeriesFirebaseMode } = await import("../../firebase-emulator-config.mjs");
  for (const location of [
    { protocol: "http:", hostname: "railway-mitra.com", pathname: "/", search: "" },
    { protocol: "http:", hostname: "192.168.1.25", pathname: "/", search: "" }
  ]) {
    assert.throws(
      () => resolveTestSeriesFirebaseMode(location),
      /Hosted Test Series Firebase requires HTTPS/
    );
  }
});

test("non-web origins such as file URLs fail closed before Firebase initialization", async () => {
  const { resolveTestSeriesFirebaseMode } = await import("../../firebase-emulator-config.mjs");
  for (const location of [
    { protocol: "file:", hostname: "", pathname: "", search: "" },
    { protocol: "about:", hostname: "", pathname: "", search: "" },
    { protocol: "", hostname: "", pathname: "", search: "" }
  ]) {
    assert.throws(
      () => resolveTestSeriesFirebaseMode(location),
      /Unsupported Test Series origin/
    );
  }
});

test("a loopback origin without explicit emulator opt-in never selects production Firebase", async () => {
  const { resolveTestSeriesFirebaseMode } = await import("../../firebase-emulator-config.mjs");
  for (const location of [
    { protocol: "http:", hostname: "localhost", pathname: "/", search: "" },
    { protocol: "https:", hostname: "127.0.0.1", pathname: "/", search: "" },
    { protocol: "http:", hostname: "::1", pathname: "/", search: "" },
    { protocol: "http:", hostname: "[::1]", pathname: "/", search: "" }
  ]) {
    assert.throws(
      () => resolveTestSeriesFirebaseMode(location),
      /Local Test Series origin requires explicit emulator opt-in/
    );
  }
});

test("an emulator opt-in on a hosted or non-loopback origin fails closed", async () => {
  const { resolveTestSeriesFirebaseMode } = await import("../../firebase-emulator-config.mjs");
  for (const location of [
    { protocol: "https:", hostname: "railway-mitra.com", pathname: "/", search: "?rmFirebaseEmulator=1" },
    { protocol: "https:", hostname: "preview.railway-mitra.com", pathname: "/", search: "?rmFirebaseEmulator=1" },
    { protocol: "http:", hostname: "127.0.0.2", pathname: "/", search: "?rmFirebaseEmulator=1" },
    { protocol: "http:", hostname: "localhost.example", pathname: "/", search: "?rmFirebaseEmulator=1" }
  ]) {
    assert.throws(
      () => resolveTestSeriesFirebaseMode(location),
      /restricted to localhost loopback origins/
    );
  }
});

test("malformed or repeated emulator flags fail closed", async () => {
  const { resolveTestSeriesFirebaseMode } = await import("../../firebase-emulator-config.mjs");
  for (const search of [
    "?rmFirebaseEmulator=true",
    "?rmFirebaseEmulator=0",
    "?rmFirebaseEmulator=1&rmFirebaseEmulator=1",
    "?rmFirebaseEmulator=1&rmFirebaseEmulator=0"
  ]) {
    assert.throws(
      () => resolveTestSeriesFirebaseMode({
        protocol: "http:",
        hostname: "localhost",
        pathname: "/",
        search
      }),
      /Invalid Test Series Firebase Emulator opt-in/
    );
  }
});

test("Functions validation emulator commands use the isolated demo project and explicit synthetic-auth opt-in", () => {
  const workflowPath = resolve(__dirname, "../../../../../.github/workflows/test-series-functions.yml");
  const workflow = readFileSync(workflowPath, "utf8");
  const projectIds = [...workflow.matchAll(/emulators:exec[^\n]*--project\s+([^\s]+)/g)]
    .map(match => match[1]);

  assert.deepEqual(projectIds, [
    "demo-railway-mitra-cbt",
    "demo-railway-mitra-cbt",
    "demo-railway-mitra-cbt"
  ]);
  assert.match(
    workflow,
    /syntax:\s*\n\s+runs-on: ubuntu-latest\s*\n\s+env:\s*\n\s+GCLOUD_PROJECT: demo-railway-mitra-cbt/
  );

  const start = workflow.indexOf("- name: Run isolated CBT Auth, Firestore, Functions and Storage emulator tests");
  const end = workflow.indexOf("\n      - name:", start + 1);
  assert.ok(start >= 0 && end > start, "The authenticated CBT emulator step must exist");
  const step = workflow.slice(start, end);
  assert.match(step, /OWNER_UID: railway-mitra-cbt-emulator-owner/);
  assert.match(step, /TEST_SERIES_ALLOW_CUSTOM_AUTH_FOR_EMULATOR: ["']true["']/);
  assert.match(step, /--project demo-railway-mitra-cbt/);
  assert.doesNotMatch(workflow, /--project\s+railway-mitra(?:\s|$)/);
});
