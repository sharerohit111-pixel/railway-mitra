"use strict";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 8192;
const MAX_IMAGE_PIXELS = 25_000_000;
const OUTPUTS = Object.freeze({
  "image/jpeg": { format: "jpeg", options: { quality: 85, mozjpeg: true } },
  "image/png": { format: "png", options: { compressionLevel: 9, adaptiveFiltering: true } },
  "image/webp": { format: "webp", options: { quality: 85, effort: 4 } }
});

function invalid() {
  throw new Error("Image could not be safely decoded and re-encoded");
}

/**
 * Full decoder/re-encoder boundary. The Sharp factory is injected so this
 * module can be tested without loading a native binary. Production callers
 * MUST pass the pinned Sharp runtime dependency; header inspection alone is
 * never a substitute for this function.
 */
async function sanitizeImageBuffer(input, mimeType, { sharp } = {}) {
  if (!Buffer.isBuffer(input) || input.length < 1 || input.length > MAX_IMAGE_BYTES) invalid();
  const output = OUTPUTS[mimeType];
  if (!output || typeof sharp !== "function") invalid();

  const inputOptions = {
    failOn: "error",
    limitInputPixels: MAX_IMAGE_PIXELS,
    limitInputChannels: 4,
    sequentialRead: true,
    animated: false
  };
  const expectedInputFormat = mimeType.slice(6);
  let result;
  try {
    const sourceMetadata = await sharp(input, inputOptions).metadata();
    if (!sourceMetadata || sourceMetadata.format !== expectedInputFormat ||
        !Number.isInteger(sourceMetadata.width) || !Number.isInteger(sourceMetadata.height) ||
        sourceMetadata.width < 1 || sourceMetadata.height < 1 ||
        sourceMetadata.width > MAX_IMAGE_DIMENSION || sourceMetadata.height > MAX_IMAGE_DIMENSION ||
        sourceMetadata.width * sourceMetadata.height > MAX_IMAGE_PIXELS ||
        (Number.isInteger(sourceMetadata.pages) && sourceMetadata.pages !== 1)) invalid();

    // Decode the complete source, apply EXIF orientation, and encode a fresh
    // single-frame image. Sharp omits EXIF/XMP/IPTC metadata unless explicitly
    // asked to preserve it; this pipeline never calls withMetadata().
    result = await sharp(input, inputOptions)
      .rotate()
      .toFormat(output.format, output.options)
      .toBuffer({ resolveWithObject: true });
  } catch (_) {
    invalid();
  }

  const data = result && result.data;
  const info = result && result.info;
  if (!Buffer.isBuffer(data) || data.length < 1 || data.length > MAX_IMAGE_BYTES ||
      !info || info.format !== output.format ||
      !Number.isInteger(info.width) || !Number.isInteger(info.height) ||
      info.width < 1 || info.height < 1 ||
      info.width > MAX_IMAGE_DIMENSION || info.height > MAX_IMAGE_DIMENSION ||
      info.width * info.height > MAX_IMAGE_PIXELS) invalid();

  return {
    data,
    mimeType,
    format: output.format,
    width: info.width,
    height: info.height,
    sizeBytes: data.length
  };
}

module.exports = {
  sanitizeImageBuffer,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS
};
