"use strict";

const assert = require("node:assert/strict");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getStorage } = require("firebase-admin/storage");
const { initializeApp: initializeClientApp, deleteApp: deleteClientApp } = require("firebase/app");
const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, deleteUser } = require("firebase/auth");
const { getStorage: getClientStorage, connectStorageEmulator, ref, uploadBytes, getBytes } = require("firebase/storage");

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
  const bytes = Buffer.from("railway-mitra-storage-emulator-smoke");
  const file = bucket.file(objectPath);
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
    await file.save(bytes, {
      resumable: false,
      metadata: {
        contentType: "image/png",
        metadata: {
          testid: "emulator-smoke",
          questionid: "question-1",
          mediaid: "diagram-1",
          sha256: "emulator-smoke-checksum"
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
    console.log("Storage Emulator smoke test passed: Admin upload/download, custom metadata, generation, byte-for-byte download, and authenticated client read/write denial.");
  } finally {
    if (clientUser) await deleteUser(clientUser).catch(() => {});
    await deleteClientApp(clientApp).catch(() => {});
    await file.delete({ ignoreNotFound: true }).catch(() => {});
    await deleteApp(app);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
