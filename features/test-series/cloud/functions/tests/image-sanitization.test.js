"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeImageBuffer, MAX_IMAGE_BYTES } = require("../image-sanitization");

function fakeSharp({ data, info, error } = {}) {
  return (input, options) => {
    assert.ok(Buffer.isBuffer(input));
    assert.equal(options.failOn, "error");
    assert.equal(options.limitInputPixels, 25_000_000);
    assert.equal(options.limitInputChannels, 4);
    const pipeline = {
      rotateCalled: false,
      metadata: async () => ({
        format: options.format || "png",
        width: 640,
        height: 480,
        pages: options.pages === undefined ? 1 : options.pages
      }),
      rotate() { this.rotateCalled = true; return this; },
      toFormat(format) { this.format = format; return this; },
      async toBuffer() {
        if (error) throw error;
        assert.equal(this.rotateCalled, true);
        return { data: data || Buffer.from("re-encoded-image"), info: info || {
          format: this.format, width: 640, height: 480
        } };
      }
    };
    return pipeline;
  };
}

test("fully decodes and re-encodes each supported format with bounded dimensions", async () => {
  for (const [mimeType, format] of [
    ["image/jpeg", "jpeg"], ["image/png", "png"], ["image/webp", "webp"]
  ]) {
    const result = await sanitizeImageBuffer(Buffer.from("input"), mimeType, { sharp: fakeSharp({ format }) });
    assert.equal(result.format, format);
    assert.equal(result.mimeType, mimeType);
    assert.equal(result.width, 640);
    assert.equal(result.height, 480);
    assert.equal(result.sizeBytes, result.data.length);
  }
});

test("rejects unsupported MIME, missing decoder and oversized input", async () => {
  await assert.rejects(sanitizeImageBuffer(Buffer.from("x"), "image/svg+xml", { sharp: fakeSharp() }));
  await assert.rejects(sanitizeImageBuffer(Buffer.from("x"), "image/png"));
  await assert.rejects(sanitizeImageBuffer(Buffer.alloc(MAX_IMAGE_BYTES + 1), "image/png", { sharp: fakeSharp() }));
});

test("rejects decoder errors, wrong output format and unsafe dimensions", async () => {
  await assert.rejects(sanitizeImageBuffer(Buffer.from("x"), "image/png", {
    sharp: fakeSharp({ error: new Error("truncated image") })
  }));
  await assert.rejects(sanitizeImageBuffer(Buffer.from("x"), "image/png", {
    sharp: fakeSharp({ info: { format: "jpeg", width: 1, height: 1 } })
  }));
  await assert.rejects(sanitizeImageBuffer(Buffer.from("x"), "image/png", {
    sharp: fakeSharp({ info: { format: "png", width: 9000, height: 1 } })
  }));
  await assert.rejects(sanitizeImageBuffer(Buffer.from("x"), "image/png", {
    sharp: fakeSharp({ format: "jpeg" })
  }));
  await assert.rejects(sanitizeImageBuffer(Buffer.from("x"), "image/png", {
    sharp: fakeSharp({ pages: 2 })
  }));
  await assert.rejects(sanitizeImageBuffer(Buffer.from("x"), "image/png", {
    sharp: fakeSharp({ data: Buffer.alloc(MAX_IMAGE_BYTES + 1) })
  }));
});
