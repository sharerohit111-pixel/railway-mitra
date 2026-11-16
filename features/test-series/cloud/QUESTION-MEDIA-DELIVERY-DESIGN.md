# CBT question image delivery — security design

## Current implementation boundary

The student question projector accepts an optional `media` array and returns only:
- `id`: opaque question-media identifier
- `altText`: required accessible description
- `mimeType`: one of JPEG, PNG or WebP

It rejects malformed/sparse arrays, duplicate identifiers, unsupported MIME types, blank/oversized alt text and more than three media descriptors per question. Storage paths, download URLs, tokens, correct answers and explanations are excluded from the student response.

The projector itself is metadata validation only; it does **not** fetch, authorize, sign or serve image bytes. The branch also implements Owner upload/finalize and an authenticated short-lived signed-URL endpoint. End-to-end Storage Emulator and browser rendering verification remain release gates, so diagram delivery is not yet production-ready.

## Required storage model

Keep original question media in a private Cloud Storage bucket. Store a server-owned mapping keyed by test ID, question ID and media ID. The mapping must include the exact object path, verified content type, byte size, checksum and immutable object generation. Never accept an object path or URL from the student client.

Suggested server-only record (document ID is the SHA-256 hex digest of the JSON tuple `[testId, questionId, mediaId]`):
`testSeriesQuestionMedia/{sha256-id}`
- `testId`, `questionId`, `mediaId`
- `objectPath` (private; never returned to clients; must exactly equal `test-series-question-media/{testId}/{questionId}/{mediaId}`)
- `contentType`, `sizeBytes` (1 byte–5 MiB), `sha256` (64 lowercase hex characters), `generation` (canonical positive decimal string; never a JavaScript number)
- Storage custom metadata must bind `testId`, `questionId`, `mediaId`, and `sha256` exactly to the record
- `status` (`ready` only after upload validation)

## Authenticated delivery contract

Implement a callable or authenticated HTTP endpoint that accepts only `attemptId`, `questionId` and `mediaId`:
1. Require Firebase student phone-provider authentication and App Check.
2. Load the attempt server-side; require its UID to equal the authenticated UID, status to be in progress, and server deadline not expired.
3. Load the attempt's published test and question; require the question and media ID to belong to that exact paper.
4. Resolve the private object path only from the server-owned media mapping. Ignore/reject client-supplied URLs, bucket names and paths.
5. Verify object metadata and immutable generation against the media record.
6. Stream the bytes through the authenticated endpoint, or issue a very short-lived read URL only after the checks. Prefer streaming if the hosting/runtime constraints allow it.
7. Set a strict image content type, `X-Content-Type-Options: nosniff`, private cache policy and a restrictive content-security policy. Never serve SVG or HTML as question media.
8. Rate-limit/bound requests per active attempt and cap object size before streaming.
9. Log only safe identifiers and outcome codes; do not log tokens, signed URLs or image bytes.

## Owner upload and publication

Implemented on the feature branch:
- Owner Dashboard lets the Owner add a media descriptor to a question JSON, save the draft, then upload the selected image.
- The create-upload callable requires Owner authorization, an existing draft test and a matching question/media descriptor. It issues a five-minute V4 write URL for the canonical object path, with a create-only generation precondition and signed content/metadata headers.
- The finalize callable rechecks Owner authorization and draft/question membership, verifies exact byte size, content type, custom metadata and SHA-256 against the uploaded bytes, inspects JPEG/PNG/WebP signatures and dimensions/pixel bounds, then creates a server-only ready mapping.
- Only JPEG, PNG and WebP are accepted; maximum image size is 5 MiB. SVG/HTML are rejected. Object names are generated from validated test/question/media IDs; user filenames are never used.
- Finalize checks the actual file signature and reads PNG/JPEG/WebP image dimensions. Width/height are capped at 8,192 pixels and total pixels at 25 million; invalid headers, MIME spoofing and oversized dimensions are rejected and the uploaded object is deleted.
- The verified mapping records the inspected width, height and format along with checksum and immutable generation.
- Test publication now fails closed unless every declared question image has a matching ready mapping with canonical object path, verified size, SHA-256 and a canonical positive decimal generation string.
- Replacing an image requires a new media ID; an existing ready mapping cannot be overwritten.

Still required before release:
- Configure and test Cloud Storage CORS for the signed PUT headers on the exact production/staging origins.
- Header inspection is not a full image decode/re-encode or malware scan. Before production, add a trusted decoder/re-encoder and consider metadata stripping and abuse scanning.
- The CBT Emulator CI suite now passes, including 76 Firestore Security Rules checks and a Storage Emulator smoke test. The Storage smoke test uses a PNG-signature/IHDR fixture, validates its dimensions and SHA-256, verifies Admin SDK upload metadata/object generation/byte-for-byte download, and confirms authenticated client reads and writes are denied. The Storage Emulator did not reject a second Admin SDK save with `ifGenerationMatch: 0`, so enforcement of the create-only precondition is not claimed as emulator-verified; retain the signed V4 URL precondition and verify it against a real staging bucket before release. This does not exercise signed browser PUT URLs or production CORS.
- Verify Storage bucket IAM, private access and retention/cleanup of abandoned partial uploads.
- Add a trusted image decode/re-encode or malware scan; header inspection is not a full decoder or content-sanitization step.
- Merge the `test-series-question-media` deny rule into the actual live Storage rules; do not deploy this branch's partial `storage.rules` as a replacement for existing app rules.

## Required tests before enabling diagrams

- Student A cannot request Student B's attempt media.
- A student cannot request media from another test or an unrelated question.
- Completed, cancelled and expired attempts cannot fetch media.
- Unknown media IDs and client-supplied paths/URLs are rejected.
- Wrong object generation, MIME mismatch, oversized object and missing object fail closed.
- SVG, HTML, malformed image signatures and duplicate media IDs are rejected.
- A valid active attempt receives only its referenced image bytes.
- No signed URL, object path, answer key or explanation appears in callable responses or logs.

## Release gate

The descriptor contract, student-safe projection, Owner metadata validation, authenticated callable for short-lived signed read URLs, and student CBT image rendering are implemented in this branch. The callable checks phone-OTP student access, App Check through the shared callable policy, attempt ownership/status/deadline, exact question/media membership, server-owned mapping status, object generation, content type and a 5 MiB object-size ceiling. Signed URLs expire after 60 seconds.

Still pending: Storage bucket/project/IAM and CORS confirmation, abandoned-upload cleanup, end-to-end Storage Emulator coverage for signed upload/finalize and active-attempt reads, browser rendering/accessibility tests, per-attempt rate limiting, trusted image decode/re-encode or malware scanning, and staging verification. Owner-only upload and mapping creation are implemented, but these Firestore checks do not replace Storage Emulator or browser verification. Students must never write media mappings. Do not describe diagram questions as production-ready until these gates pass.

## Image sanitization implementation plan (not yet implemented)

The current `inspectImageBuffer` helper is a bounded header/dimension parser only. It is useful as an inexpensive preflight check, but it must never be described as proof that the complete image is decodable, harmless, or metadata-free.

Before enabling question images in production, move the upload pipeline to a quarantine-to-published flow:

1. The Owner upload URL writes only to a private quarantine prefix. The object is not referenced by student question mappings and cannot be read by students.
2. A trusted server-side image processor reads the exact uploaded object generation, enforces the existing 5 MiB input cap and dimension/pixel limits, and fully decodes the image. Decode failures, truncated streams, unsupported codecs, animation, and resource-limit violations fail closed.
3. Re-encode pixels into an allowlisted output format (JPEG, PNG or WebP), strip EXIF/XMP/IPTC and other ancillary metadata, and write a new immutable published object using a create-only generation precondition. Never copy the original bytes into the published prefix.
4. Calculate SHA-256, byte size, MIME type and dimensions from the re-encoded output bytes. Create the ready media mapping only after the published object is read back and its generation/metadata are verified.
5. Delete or lifecycle-expire quarantine originals and failed outputs. Cleanup must be idempotent and must not delete a published generation referenced by a ready mapping.
6. Keep the student delivery endpoint restricted to the published prefix and server-owned ready mappings. It must never issue a read URL for quarantine objects.

### Dependency and runtime decision

No image decoder/re-encoder is currently declared in the isolated Functions package. Do not treat the existing signature parser as a substitute, and do not add an unpinned or transitively unreviewed native dependency. Before selecting a processor (for example, a pinned Sharp/libvips build compatible with the deployed Node 22 Linux runtime), verify its supported platform artifact, security-update policy, license, package-lock reproducibility, cold-start/memory footprint, and emulator/CI install behavior. If the Functions runtime cannot meet those constraints reliably, use a separately isolated image-processing service with explicit cost and IAM review rather than weakening the validation.

### Required sanitizer tests

- Valid JPEG, PNG and WebP decode and re-encode to valid output bytes.
- Correctly signed but truncated/corrupt image data fails full decode.
- MIME spoofing, polyglot/non-image payloads, animated formats and unsupported codecs fail closed.
- EXIF GPS, camera, XMP/IPTC and ancillary metadata are absent from sanitized output.
- Oversized compressed input, excessive dimensions/pixels and decompression/resource bombs are rejected within bounded memory/time.
- The output MIME, dimensions, size and SHA-256 are computed from the output bytes, not copied from client metadata.
- A failed sanitizer never creates a ready mapping; a retry cannot overwrite an existing published generation.
- Student delivery cannot access quarantine paths, even with a valid attempt.

Until this pipeline and its staging tests exist, question-image upload remains a draft-authoring capability only and diagram delivery remains a release blocker.



### Decoder dependency feasibility review (2026-11-16)

A first-party Sharp compatibility review was performed before adding any native dependency:
- Sharp's current installation guidance requires a Node-API v9 runtime (Node.js >=20.9), so the repository's declared Node.js 22 engine meets the documented Node API floor.
- Sharp publishes prebuilt Linux x64 and Linux ARM64 binaries, but the deployment's actual CPU architecture and glibc baseline must still be confirmed against the selected Cloud Functions runtime image. The documented prebuilt Linux baseline is glibc >=2.28 (and musl >=1.2.5 for musl builds).
- Sharp documents that untrusted input is rejected when decode warnings occur and exposes controls such as `failOn`, `limitInputPixels` and `limitInputChannels`. These are useful controls, not a replacement for our own byte, pixel, concurrency and execution-time limits.
- The Sharp npm package is Apache-2.0; its prebuilt libvips dependency has separate LGPL-3.0-or-later licensing. Review the full dependency license set before adoption.
- The isolated Functions package currently has no package lock. Do not add Sharp until a reproducible lockfile with the required optional platform packages is generated and CI proves a clean Node 22 install on the same Linux architecture/runtime baseline used by deployment. Keep optional dependencies enabled.

References reviewed:
- https://sharp.pixelplumbing.com/install/
- https://sharp.pixelplumbing.com/security/
- https://www.npmjs.com/package/sharp

**Decision:** Sharp is a technically plausible candidate for Node 22, but it is not yet approved or installed. The Cloud Functions architecture/glibc baseline, package-lock reproducibility, full transitive license inventory, CI install, cold-start and memory limits remain unverified. No dependency or runtime behavior was changed in this review. Continue to keep image publication blocked until the quarantine/decode/re-encode pipeline is implemented and tested.
