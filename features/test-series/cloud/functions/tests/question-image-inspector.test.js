const test = require("node:test");
const assert = require("node:assert/strict");
const { inspectImageBuffer, MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } = require("../question-image-inspector");

function png(width, height) {
  const data = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(data, 0);
  data.writeUInt32BE(13, 8);
  data.write("IHDR", 12, "ascii");
  data.writeUInt32BE(width, 16);
  data.writeUInt32BE(height, 20);
  return data;
}

function jpeg(width, height) {
  const data = Buffer.from([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08,
    (height >> 8) & 255, height & 255,
    (width >> 8) & 255, width & 255,
    0x03, 0x01, 0x11, 0x00
  ]);
  return data;
}

function webpVp8x(width, height) {
  const data = Buffer.alloc(30);
  data.write("RIFF", 0, "ascii");
  data.writeUInt32LE(22, 4);
  data.write("WEBP", 8, "ascii");
  data.write("VP8X", 12, "ascii");
  data.writeUInt32LE(10, 16);
  data.writeUIntLE(width - 1, 24, 3);
  data.writeUIntLE(height - 1, 27, 3);
  return data;
}

test("accepts valid PNG, JPEG and WebP signatures and reads dimensions", () => {
  assert.deepEqual(inspectImageBuffer(png(640, 480), "image/png"), { width: 640, height: 480, format: "png" });
  assert.deepEqual(inspectImageBuffer(jpeg(320, 240), "image/jpeg"), { width: 320, height: 240, format: "jpeg" });
  assert.deepEqual(inspectImageBuffer(webpVp8x(800, 600), "image/webp"), { width: 800, height: 600, format: "webp" });
});

test("rejects MIME spoofing, truncated headers and unsupported formats", () => {
  assert.throws(() => inspectImageBuffer(Buffer.from("<svg></svg>"), "image/png"), /signature or dimensions/);
  assert.throws(() => inspectImageBuffer(png(20, 20), "image/jpeg"), /signature or dimensions/);
  assert.throws(() => inspectImageBuffer(Buffer.alloc(20), "image/webp"), /signature or dimensions/);
  assert.throws(() => inspectImageBuffer(png(20, 20), "image/svg+xml"), /signature or dimensions/);
});

test("rejects zero, oversized and excessive-pixel image dimensions", () => {
  assert.throws(() => inspectImageBuffer(png(0, 1), "image/png"), /signature or dimensions/);
  assert.throws(() => inspectImageBuffer(png(MAX_IMAGE_DIMENSION + 1, 1), "image/png"), /signature or dimensions/);
  assert.throws(() => inspectImageBuffer(png(5001, 5000), "image/png"), /signature or dimensions/);
  assert.ok(MAX_IMAGE_PIXELS < MAX_IMAGE_DIMENSION * MAX_IMAGE_DIMENSION);
});

test("rejects oversized image buffers", () => {
  assert.throws(() => inspectImageBuffer(Buffer.alloc(5 * 1024 * 1024 + 1), "image/png"), /signature or dimensions/);
});
