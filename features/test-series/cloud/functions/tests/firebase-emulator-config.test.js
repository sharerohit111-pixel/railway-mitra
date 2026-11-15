"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

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

test("the production bootstrap remains the default on non-loopback origins without an emulator opt-in", async () => {
  const { resolveTestSeriesFirebaseMode } = await import("../../firebase-emulator-config.mjs");
  for (const location of [
    { protocol: "https:", hostname: "railway-mitra.com", search: "" },
    { protocol: "https:", hostname: "preview.railway-mitra.com", search: "" }
  ]) {
    assert.deepEqual(resolveTestSeriesFirebaseMode(location), { mode: "production" });
  }
});

test("a loopback origin without explicit emulator opt-in never selects production Firebase", async () => {
  const { resolveTestSeriesFirebaseMode } = await import("../../firebase-emulator-config.mjs");
  for (const location of [
    { protocol: "http:", hostname: "localhost", search: "" },
    { protocol: "https:", hostname: "127.0.0.1", search: "" },
    { protocol: "http:", hostname: "::1", search: "" },
    { protocol: "http:", hostname: "[::1]", search: "" }
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
    { protocol: "https:", hostname: "railway-mitra.com", search: "?rmFirebaseEmulator=1" },
    { protocol: "https:", hostname: "preview.railway-mitra.com", search: "?rmFirebaseEmulator=1" },
    { protocol: "http:", hostname: "127.0.0.2", search: "?rmFirebaseEmulator=1" },
    { protocol: "http:", hostname: "localhost.example", search: "?rmFirebaseEmulator=1" }
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
      () => resolveTestSeriesFirebaseMode({ protocol: "http:", hostname: "localhost", search }),
      /Invalid Test Series Firebase Emulator opt-in/
    );
  }
});
