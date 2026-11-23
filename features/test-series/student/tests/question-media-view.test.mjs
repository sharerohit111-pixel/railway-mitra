import test from "node:test";
import assert from "node:assert/strict";
import { isSafeCbtQuestionMediaResponse } from "../question-media-view.mjs";

const descriptor = { id: "diagram-1", mimeType: "image/png" };

test("accepts only HTTPS URLs with an allowed MIME type matching the question descriptor", () => {
  assert.equal(isSafeCbtQuestionMediaResponse({ url: "https://storage.example/signed", mimeType: "image/png" }, descriptor), true);
  assert.equal(isSafeCbtQuestionMediaResponse({ url: "https://storage.example/signed", mimeType: "image/jpeg" }, descriptor), false);
  assert.equal(isSafeCbtQuestionMediaResponse({ url: "https://storage.example/signed", mimeType: "image/svg+xml" }, { mimeType: "image/svg+xml" }), false);
});

test("rejects insecure, malformed, and missing media responses", () => {
  for (const response of [null, undefined, {}, { url: "//storage.example/image", mimeType: "image/png" }, { url: "http://storage.example/image", mimeType: "image/png" }, { url: "javascript:alert(1)", mimeType: "image/png" }]) {
    assert.equal(isSafeCbtQuestionMediaResponse(response, descriptor), false);
  }
  assert.equal(isSafeCbtQuestionMediaResponse({ url: "https://storage.example/image", mimeType: "image/png" }, null), false);
});
