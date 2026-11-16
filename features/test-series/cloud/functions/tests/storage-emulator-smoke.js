"use strict";

const assert = require("node:assert/strict");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getStorage } = require("firebase-admin/storage");

async function main() {
  if (process.env.STORAGE_EMULATOR_HOST !== "127.0.0.1:9199") {
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
    assert.equal(metadata.metadata.testid, "emulator-smoke");
    assert.equal(metadata.metadata.questionid, "question-1");
    assert.equal(metadata.metadata.mediaid, "diagram-1");
    assert.ok(Number(metadata.generation) > 0);
    const [downloaded] = await file.download();
    assert.deepEqual(downloaded, bytes);
    console.log("Storage Emulator smoke test passed: create-only upload, custom metadata, generation and byte-for-byte download.");
  } finally {
    await file.delete({ ignoreNotFound: true }).catch(() => {});
    await deleteApp(app);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
