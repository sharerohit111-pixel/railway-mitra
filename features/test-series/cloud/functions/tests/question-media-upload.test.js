const test = require("node:test");
const assert = require("node:assert/strict");
const {
  mediaMappingId,
  mediaObjectPath,
  mediaQuarantineObjectPath,
  validateMediaUploadRequest,
  MAX_IMAGE_BYTES
} = require("../question-media-upload");

const valid = {
  testId: "civil_mock_01",
  questionId: "q_diagram_01",
  mediaId: "turnout_figure",
  mimeType: "image/png",
  sizeBytes: 1024,
  sha256: "a".repeat(64)
};

test("creates deterministic opaque mapping IDs and canonical private object paths", () => {
  const expectedPath = "test-series-question-media/civil_mock_01/q_diagram_01/turnout_figure";
  assert.equal(mediaObjectPath(valid.testId, valid.questionId, valid.mediaId), expectedPath);
  assert.equal(mediaQuarantineObjectPath(valid.testId, valid.questionId, valid.mediaId),
    "test-series-question-media-quarantine/civil_mock_01/q_diagram_01/turnout_figure");
  assert.match(mediaMappingId(valid.testId, valid.questionId, valid.mediaId), /^[a-f0-9]{64}$/);
  assert.equal(mediaMappingId(valid.testId, valid.questionId, valid.mediaId),
    mediaMappingId(valid.testId, valid.questionId, valid.mediaId));
});

test("validates supported MIME types, bounded size and SHA-256 checksum", () => {
  assert.deepEqual(validateMediaUploadRequest(valid), {
    ...valid,
    objectPath: mediaObjectPath(valid.testId, valid.questionId, valid.mediaId),
    quarantineObjectPath: mediaQuarantineObjectPath(valid.testId, valid.questionId, valid.mediaId),
    mappingId: mediaMappingId(valid.testId, valid.questionId, valid.mediaId)
  });
  for (const mimeType of ["image/svg+xml", "text/html", "application/pdf"]) {
    assert.throws(() => validateMediaUploadRequest({ ...valid, mimeType }), /Only JPEG, PNG and WebP/);
  }
  for (const sizeBytes of [0, -1, MAX_IMAGE_BYTES + 1, 1.5, "1024"]) {
    assert.throws(() => validateMediaUploadRequest({ ...valid, sizeBytes }), /between 1 byte and 5 MiB/);
  }
  assert.throws(() => validateMediaUploadRequest({ ...valid, sha256: "not-a-hash" }), /SHA-256/);
});

test("rejects unsafe identifiers before constructing storage paths", () => {
  for (const field of ["testId", "questionId", "mediaId"]) {
    assert.throws(() => validateMediaUploadRequest({ ...valid, [field]: "../private" }), /Invalid question media identifier/);
  }
});

test("Owner upload endpoints require Owner authorization and validate the draft question before storage access", () => {
  const { readFileSync } = require("node:fs");
  const source = readFileSync(require.resolve("../index"), "utf8");
  const createStart = source.indexOf("exports.rmOwnerCreateQuestionMediaUpload =");
  const finalizeStart = source.indexOf("exports.rmOwnerFinalizeQuestionMediaUpload =", createStart);
  const studentStart = source.indexOf("exports.rmGetQuestionMediaUrl =", finalizeStart);
  const createHandler = source.slice(createStart, finalizeStart);
  const finalizeHandler = source.slice(finalizeStart, studentStart);
  assert.ok(createStart >= 0 && finalizeStart > createStart && studentStart > finalizeStart);
  assert.match(createHandler, /owner\(req\)/);
  assert.match(createHandler, /testSnap\.data\(\)\.status !== "draft"/);
  assert.match(createHandler, /question\.media/);
  assert.match(createHandler, /action: "write"/);
  assert.match(createHandler, /upload\.quarantineObjectPath/);
  assert.match(createHandler, /ifGenerationMatch: "0"/);
  assert.match(createHandler, /contentType: upload\.mimeType/);
  assert.match(createHandler, /extensionHeaders:/);
  for (const header of ["x-goog-meta-testid", "x-goog-meta-questionid", "x-goog-meta-mediaid", "x-goog-meta-sha256"]) {
    assert.ok(createHandler.includes(header), `signed upload must bind ${header}`);
  }
  assert.match(createHandler, /expires: expiresAt/);
  assert.match(createHandler, /Date\.now\(\) \+ 5 \* 60 \* 1000/);
  assert.match(finalizeHandler, /owner\(req\)/);
  assert.match(finalizeHandler, /testSnap\.data\(\)\.status !== "draft"/);
  assert.match(finalizeHandler, /quarantineFile\.download\(\)/);
  assert.match(finalizeHandler, /bucket\.file\(upload\.objectPath\)/);
  assert.match(finalizeHandler, /quarantineFile\.delete\(\{ ignoreNotFound: true \}\)/);
  assert.match(finalizeHandler, /actualSha256 !== upload\.sha256/);
  assert.match(finalizeHandler, /tx\.create\(mappingRef, mapping\)/);
});

test("Owner draft save preserves validated media descriptors in the student question paper", () => {
  const { readFileSync } = require("node:fs");
  const source = readFileSync(require.resolve("../index"), "utf8");
  const start = source.indexOf("function ownerTestPayload");
  const end = source.indexOf("exports.rmOwnerSaveTest =", start);
  const payloadBuilder = source.slice(start, end);
  assert.match(payloadBuilder, /projectStudentQuestionMedia\(q\.media\)/);
  assert.match(payloadBuilder, /\.\.\.\(media \? \{ media \} : \{\}\)/);
});

test("publishing is blocked until every declared question image has a verified ready mapping", () => {
  const { readFileSync } = require("node:fs");
  const source = readFileSync(require.resolve("../index"), "utf8");
  const start = source.indexOf("exports.rmOwnerPublishTest =");
  const end = source.indexOf("exports.rmOwnerGetTest =", start);
  const handler = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(handler, /mediaMappingId\(testId, questionId, media\.id\)/);
  assert.match(handler, /tx\.get\(ref\)/);
  assert.match(handler, /mapping\.status !== "ready"/);
  assert.match(handler, /mapping\.objectPath !== mediaObjectPath\(testId, questionId, media\.id\)/);
  assert.match(handler, /Every question image must be uploaded and verified before publishing/);
});

test("finalize rejects non-image bytes and records inspected image dimensions", () => {
  const { readFileSync } = require("node:fs");
  const source = readFileSync(require.resolve("../index"), "utf8");
  const start = source.indexOf("exports.rmOwnerFinalizeQuestionMediaUpload =");
  const end = source.indexOf("exports.rmGetQuestionMediaUrl =", start);
  const handler = source.slice(start, end);
  assert.match(handler, /sanitizeImageBuffer\(bytes, upload\.mimeType, \{ sharp: require\("sharp"\) \}\)/);
  assert.match(handler, /Uploaded file could not be fully decoded and safely re-encoded/);
  assert.match(handler, /await quarantineFile\.delete\(\{ ignoreNotFound: true \}\)/);
  assert.match(handler, /width: imageInfo\.width/);
  assert.match(handler, /file\.save\(imageInfo\.data/);
  assert.match(handler, /upload\.quarantineObjectPath/);
  assert.match(handler, /ifGenerationMatch: 0/);
  assert.match(handler, /preconditionOpts: \{ ifGenerationMatch: 0 \}/);
  assert.match(handler, /sanitizedSha256/);
  assert.match(handler, /sanitizedGeneration/);
  assert.match(handler, /height: imageInfo\.height/);
  assert.ok(handler.includes('!/^[1-9]\\d*$/.test(sanitizedGeneration)'));
});

test("publication requires a canonical positive decimal object-generation string", () => {
  const { readFileSync } = require("node:fs");
  const source = readFileSync(require.resolve("../index"), "utf8");
  const start = source.indexOf("exports.rmOwnerPublishTest =");
  const end = source.indexOf("exports.rmOwnerGetTest =", start);
  const handler = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(handler.includes('typeof mapping.generation !== "string"'));
  assert.ok(handler.includes('!/^[1-9]\\d*$/.test(mapping.generation)'));
});

test("student signed image delivery uses one transaction snapshot before Storage metadata and URL access", () => {
  const { readFileSync } = require("node:fs");
  const source = readFileSync(require.resolve("../index"), "utf8");
  const start = source.indexOf("exports.rmGetQuestionMediaUrl =");
  const end = source.indexOf("\nexports.", start + 1);
  const handler = source.slice(start, end > 0 ? end : undefined);
  assert.ok(start >= 0);
  assert.match(handler, /const uid = student\(req\)/);
  assert.match(handler, /const \{ testId, media, mapping \} = await db\.runTransaction\(async tx => \{/);
  assert.match(handler, /const attemptSnap = await tx\.get\(attemptRef\)/);
  assert.match(handler, /attemptSnap\.data\(\)\.uid !== uid/);
  assert.match(handler, /attempt\.status !== "in_progress"/);
  assert.match(handler, /const now = new Date\(\)/);
  assert.match(handler, /const activeSessionSnap = await tx\.get\(activeSessionRef\)/);
  assert.match(handler, /isActiveAttemptSession\(\{ uid, attemptId, attempt, activeSession, now \}\)/);
  assert.match(handler, /const paperSnap = await tx\.get\(paperRef\)/);
  assert.match(handler, /const mappingSnap = await tx\.get\(mappingRef\)/);
  assert.match(handler, /mapping\.status !== "ready"/);
  assert.ok(handler.includes('!/^[1-9]\\d*$/.test(mapping.generation)'));
  assert.match(handler, /generation !== mapping\.generation/);
  assert.match(handler, /action: "read"/);
  assert.match(handler, /Date\.now\(\) \+ 60 \* 1000/);
  assert.match(handler, /response-content-disposition": "inline"/);

  const transactionStart = handler.indexOf("await db.runTransaction(async tx => {");
  const transactionEnd = handler.indexOf("\n  });", transactionStart);
  const storageStart = handler.indexOf("const bucket = getStorage().bucket();", transactionEnd);
  assert.ok(transactionEnd > transactionStart, "authorization transaction must close");
  assert.ok(storageStart > transactionEnd, "Storage inspection must happen only after the Firestore snapshot resolves");
  assert.doesNotMatch(handler, /db\.doc\("testSeriesActiveSessions\/" \+ uid\)\.get\(\)/,
    "legacy independent Active Session reads must not return");
});
