"use strict";

const MAX_IMAGE_DIMENSION = 8192;
const MAX_IMAGE_PIXELS = 25_000_000;

function invalidImage() {
  throw new Error("Image file signature or dimensions are invalid");
}

function dimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) ||
      width < 1 || height < 1 ||
      width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION ||
      width * height > MAX_IMAGE_PIXELS) invalidImage();
  return { width, height };
}

function parsePng(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(signature) ||
      buffer.readUInt32BE(8) !== 13 ||
      buffer.toString("ascii", 12, 16) !== "IHDR") invalidImage();
  return dimensions(buffer.readUInt32BE(16), buffer.readUInt32BE(20));
}

function parseJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) invalidImage();
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) invalidImage();
    while (offset < buffer.length && buffer[offset] === 0xff) offset++;
    if (offset >= buffer.length) break;
    const marker = buffer[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) invalidImage();
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) invalidImage();
    if (sof.has(marker)) {
      if (length < 7) invalidImage();
      return dimensions(buffer.readUInt16BE(offset + 5), buffer.readUInt16BE(offset + 3));
    }
    offset += length;
  }
  invalidImage();
}

function parseWebp(buffer) {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" ||
      buffer.readUInt32LE(4) + 8 > buffer.length ||
      buffer.toString("ascii", 8, 12) !== "WEBP") invalidImage();
  const chunk = buffer.toString("ascii", 12, 16);
  const chunkSize = buffer.readUInt32LE(16);
  if (chunkSize + 20 > buffer.length) invalidImage();
  if (chunk === "VP8X") {
    if (chunkSize < 10) invalidImage();
    const width = 1 + buffer.readUIntLE(24, 3);
    const height = 1 + buffer.readUIntLE(27, 3);
    return dimensions(width, height);
  }
  if (chunk === "VP8 ") {
    if (chunkSize < 10 || buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) invalidImage();
    return dimensions(buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff);
  }
  if (chunk === "VP8L") {
    if (chunkSize < 5 || buffer[20] !== 0x2f) invalidImage();
    const b1 = buffer[21], b2 = buffer[22], b3 = buffer[23], b4 = buffer[24];
    const width = 1 + b1 + ((b2 & 0x3f) << 8);
    const height = 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10);
    return dimensions(width, height);
  }
  invalidImage();
}

// Security boundary: this is a bounded signature/dimension preflight parser only.
// It does NOT fully decode, sanitize, strip metadata or re-encode image content.
// Never use its result alone to mark an uploaded image safe for student delivery.
function inspectImageBuffer(input, mimeType) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
  if (!Number.isSafeInteger(buffer.length) || buffer.length < 12 || buffer.length > 5 * 1024 * 1024) {
    invalidImage();
  }
  let result;
  if (mimeType === "image/png") result = parsePng(buffer);
  else if (mimeType === "image/jpeg") result = parseJpeg(buffer);
  else if (mimeType === "image/webp") result = parseWebp(buffer);
  else invalidImage();
  return { ...result, format: mimeType.slice(6) };
}

module.exports = { inspectImageBuffer, MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS };
