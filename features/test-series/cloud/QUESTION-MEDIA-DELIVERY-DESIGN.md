# CBT question image delivery — security design

## Current implementation boundary

The student question projector accepts an optional `media` array and returns only:
- `id`: opaque question-media identifier
- `altText`: required accessible description
- `mimeType`: one of JPEG, PNG or WebP

It rejects malformed/sparse arrays, duplicate identifiers, unsupported MIME types, blank/oversized alt text and more than three media descriptors per question. Storage paths, download URLs, tokens, correct answers and explanations are excluded from the student response.

This is metadata validation only. It does **not** fetch, authorize, sign or serve image bytes. Do not upload media or show media descriptors as working image links until the authenticated delivery endpoint below is implemented and tested.

## Required storage model

Keep original question media in a private Cloud Storage bucket. Store a server-owned mapping keyed by test ID, question ID and media ID. The mapping must include the exact object path, verified content type, byte size, checksum and immutable object generation. Never accept an object path or URL from the student client.

Suggested server-only record (document ID is the SHA-256 hex digest of the JSON tuple `[testId, questionId, mediaId]`):
`testSeriesQuestionMedia/{sha256-id}`
- `testId`, `questionId`, `mediaId`
- `objectPath` (private; never returned to clients; must start with `test-series-question-media/`)
- `contentType`, `sizeBytes` (1 byte–5 MiB), `sha256` (64 lowercase hex characters), `generation`
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

- Accept only JPEG, PNG and WebP; verify file signatures rather than trusting extensions or browser MIME labels.
- Enforce a documented maximum byte size and image dimensions before publication.
- Generate opaque object names server-side; do not reuse user-provided filenames.
- Keep uploaded objects private and quarantine them until validation completes.
- Bind each media record to one test and question. Replacing a published image must create a new immutable generation or media ID.
- Do not publish a test if any referenced media record is missing, quarantined or mismatched.

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

Still pending: Owner-side image upload/quarantine workflow, creation and integrity verification of private mapping records, Storage bucket/project configuration confirmation, end-to-end emulator coverage with a real Storage Emulator, browser rendering tests, rate limiting, and staging verification. The mapping schema described above must be provisioned by a trusted Owner-only workflow; students must never write it. Do not describe diagram questions as production-ready until those gates pass.
