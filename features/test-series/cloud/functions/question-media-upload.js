"use strict";

const crypto = require("node:crypto");
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function mediaMappingId(testId, questionId, mediaId) {
  return crypto.createHash("sha256")
    .update(JSON.stringify([testId, questionId, mediaId]))
    .digest("hex");
}

function mediaObjectPath(testId, questionId, mediaId) {
  return "test-series-question-media/" + testId + "/" + questionId + "/" + mediaId;
}

function validateMediaUploadRequest({ testId, questionId, mediaId, mimeType, sizeBytes, sha256 }) {
  for (const value of [testId, questionId, mediaId]) {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) {
      throw new Error("Invalid question media identifier");
    }
  }
  if (typeof mimeType !== "string" || !ALLOWED_IMAGE_TYPES.has(mimeType)) {
    throw new Error("Only JPEG, PNG and WebP images are allowed");
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_IMAGE_BYTES) {
    throw new Error("Image must be between 1 byte and 5 MiB");
  }
  if (typeof sha256 !== "string" || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error("A valid SHA-256 image checksum is required");
  }
  return {
    testId, questionId, mediaId, mimeType, sizeBytes, sha256,
    objectPath: mediaObjectPath(testId, questionId, mediaId),
    mappingId: mediaMappingId(testId, questionId, mediaId)
  };
}

module.exports = {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  mediaMappingId,
  mediaObjectPath,
  validateMediaUploadRequest
};
