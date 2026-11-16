const ALLOWED_CBT_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isSafeCbtQuestionMediaResponse(response, descriptor) {
  return Boolean(
    response && descriptor &&
    typeof response.url === "string" &&
    response.url.startsWith("https://") &&
    response.mimeType === descriptor.mimeType &&
    ALLOWED_CBT_IMAGE_MIME_TYPES.has(response.mimeType)
  );
}
