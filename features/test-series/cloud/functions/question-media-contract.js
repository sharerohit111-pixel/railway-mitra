"use strict";

const MEDIA_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_MEDIA_PER_QUESTION = 3;
const MAX_ALT_TEXT_LENGTH = 200;

/**
 * Validate and project only the non-secret media descriptor fields.
 * Storage paths, download URLs, tokens and answer metadata are never returned.
 * This contract does not itself authorize or serve media bytes.
 */
function projectStudentQuestionMedia(media) {
  if (media === undefined || media === null) return undefined;
  if (!Array.isArray(media) || media.length < 1 || media.length > MAX_MEDIA_PER_QUESTION) {
    throw new Error("Question paper contains invalid student question media");
  }

  const seenIds = new Set();
  const projected = [];
  for (let index = 0; index < media.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(media, index)) {
      throw new Error("Question paper contains invalid student question media");
    }
    const item = media[index];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Question paper contains invalid student question media");
    }
    const { id, altText, mimeType } = item;
    if (typeof id !== "string" || !MEDIA_ID_PATTERN.test(id) || seenIds.has(id) ||
        typeof altText !== "string" || !altText.trim() || altText.length > MAX_ALT_TEXT_LENGTH ||
        typeof mimeType !== "string" || !ALLOWED_IMAGE_TYPES.has(mimeType)) {
      throw new Error("Question paper contains invalid student question media");
    }
    seenIds.add(id);
    projected.push({ id, altText: altText.trim(), mimeType });
  }
  return projected;
}

module.exports = {
  projectStudentQuestionMedia,
  MAX_MEDIA_PER_QUESTION,
  MAX_ALT_TEXT_LENGTH,
  ALLOWED_IMAGE_TYPES
};
