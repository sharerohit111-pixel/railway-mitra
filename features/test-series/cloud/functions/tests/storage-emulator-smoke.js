"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { inspectImageBuffer } = require("../question-image-inspector");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getStorage } = require("firebase-admin/storage");
const { initializeApp: initializeClientApp, deleteApp: deleteClientApp } = require("firebase/app");
const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, deleteUser } = require("firebase/auth");
const { getStorage: getClientStorage, connectStorageEmulator, ref, uploadBytes, getBytes, deleteObject } = require("firebase/storage");

async function main() {
  if (process.env.STORAGE_EMULATOR_HOST !== "http://127.0.0.1:9199") {
    throw new Error("Storage smoke test requires the isolated loopback Storage Emulator");
  }
  const app = initializeApp({
    projectId: "demo-railway-mitra-cbt",
    storageBucket: "demo-railway-mitra-cbt.appspot.com"
  }, "test-series-storage-smoke");
  const bucket = getStorage(app).bucket();
  const objectPath = "test-series-question-media/emulator-smoke/question-1/diagram-1";
  const quarantineObjectPath = "test-series-question-media-quarantine/emulator-smoke/question-1/diagram-1";
  // Minimal PNG signature + complete 13-byte IHDR payload used only by the
  // header preflight parser; this is not a fully decoded/valid PNG image.
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(640, 16);
  bytes.writeUInt32BE(480, 20);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  assert.deepEqual(inspectImageBuffer(bytes, "image/png"), { width: 640, height: 480, format: "png" });
  const file = bucket.file(objectPath);
  const quarantineFile = bucket.file(quarantineObjectPath);
  const clientApp = initializeClientApp({
    apiKey: "demo-api-key",
    authDomain: "localhost",
    projectId: "demo-railway-mitra-cbt",
    storageBucket: "demo-railway-mitra-cbt.appspot.com",
    appId: "1:000000000000:web:0000000000000000"
  }, "test-series-storage-rules-client");
  const clientAuth = getAuth(clientApp);
  connectAuthEmulator(clientAuth, "http://127.0.0.1:9099", { disableWarnings: true });
  const clientStorage = getClientStorage(clientApp);
  connectStorageEmulator(clientStorage, "127.0.0.1", 9199);
  let clientUser = null;
  try {
    await quarantineFile.save(bytes, {
      resumable: false,
      metadata: { contentType: "image/png" },
      preconditionOpts: { ifGenerationMatch: 0 }
    });
    await file.save(bytes, {
      resumable: false,
      metadata: {
        contentType: "image/png",
        metadata: {
          testid: "emulator-smoke",
          questionid: "question-1",
          mediaid: "diagram-1",
          sha256
        }
      },
      preconditionOpts: { ifGenerationMatch: 0 }
    });
    const [metadata] = await file.getMetadata();
    assert.equal(metadata.contentType, "image/png");
    assert.equal(Number(metadata.size), bytes.length);
    assert.equal(metadata.metadata.testid, "emulator-smoke");
    assert.equal(metadata.metadata.questionid, "question-1");
    assert.equal(metadata.metadata.mediaid, "diagram-1");
    assert.equal(metadata.metadata.sha256, sha256);
    assert.ok(Number(metadata.generation) > 0);
    const [downloaded] = await file.download();
    assert.deepEqual(downloaded, bytes);
    const credential = await createUserWithEmailAndPassword(
      clientAuth, "storage-smoke@example.invalid", "EmulatorOnly-Password-123!"
    );
    clientUser = credential.user;
    await assert.rejects(
      uploadBytes(ref(clientStorage, objectPath), Buffer.from("client-write-must-be-denied"), {
        contentType: "image/png"
      }),
      error => error.code === "storage/unauthorized"
    );
    await assert.rejects(
      getBytes(ref(clientStorage, objectPath)),
      error => error.code === "storage/unauthorized"
    );
    await assert.rejects(
      getBytes(ref(clientStorage, quarantineObjectPath)),
      error => error.code === "storage/unauthorized"
    );
    await assert.rejects(
      uploadBytes(ref(clientStorage, quarantineObjectPath), Buffer.from("quarantine-client-write-must-be-denied"), {
        contentType: "image/png"
      }),
      error => error.code === "storage/unauthorized"
    );
    await assert.rejects(
      deleteObject(ref(clientStorage, objectPath)),
      error => error.code === "storage/unauthorized"
    );
    await assert.rejects(
      deleteObject(ref(clientStorage, quarantineObjectPath)),
      error => error.code === "storage/unauthorized"
    );
    const [publishedStillExists] = await file.exists();
    const [quarantineStillExists] = await quarantineFile.exists();
    assert.equal(publishedStillExists, true, "a denied client delete must leave published media intact");
    assert.equal(quarantineStillExists, true, "a denied client delete must leave quarantined media intact");
    console.log("Storage Emulator smoke test passed: PNG header inspection, Admin upload/download, custom metadata/checksum, generation, byte-for-byte download, and authenticated client read/write/delete denial for both quarantine and published prefixes.");
  } finally {
    if (clientUser) await deleteUser(clientUser).catch(() => {});
    await deleteClientApp(clientApp).catch(() => {});
    await file.delete({ ignoreNotFound: true }).catch(() => {});
    await quarantineFile.delete({ ignoreNotFound: true }).catch(() => {});
    await deleteApp(app);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
