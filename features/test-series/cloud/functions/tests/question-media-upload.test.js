const test = require("node:test");
const assert = require("node:assert/strict");
const {
  mediaMappingId,
  mediaObjectPath,
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
  assert.match(mediaMappingId(valid.testId, valid.questionId, valid.mediaId), /^[a-f0-9]{64}$/);
  assert.equal(mediaMappingId(valid.testId, valid.questionId, valid.mediaId),
    mediaMappingId(valid.testId, valid.questionId, valid.mediaId));
});

test("validates supported MIME types, bounded size and SHA-256 checksum", () => {
  assert.deepEqual(validateMediaUploadRequest(valid), {
    ...valid,
    objectPath: mediaObjectPath(valid.testId, valid.questionId, valid.mediaId),
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
