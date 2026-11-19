# Owner Test Builder publish-validation parity

The browser-side Owner Test Builder now applies the same question-text and option
control-character policy as the server-side publish integrity check before it
sends a draft to Firebase.

- Question text and options reject C0 non-printing controls, DEL and C1 controls (U+0080–U+009F).
- Ordinary TAB, LF and CR remain accepted so multiline question content and
  tab-separated option text are not damaged.
- Section labels remain stricter: all control characters are rejected, matching
  the server's section-name validation.
- This is early feedback for the Owner UI, not a security boundary. The callable
  save/publish handlers and server-side publish validator remain authoritative.

Focused regression coverage:

```bash
node --test features/test-series/admin/tests/test-builder-publish-parity.test.mjs
```

The normal Functions Validation workflow runs the complete isolated Owner Admin
suite with:

```bash
node --test features/test-series/admin/tests/*.test.mjs
```

No Firebase configuration, live project, Authentication provider, App Check
enforcement, payment setting, or deployment behavior is changed by this check.


## Question Bank → Test Builder validation parity

When a saved Question Bank item is attached to a Test Builder draft, the shared
preflight mapper applies the same content-integrity policy used by draft and
publish validation before the editor is changed:

- Question text, options and explanations reject unsupported non-printing
  controls while preserving ordinary TAB, LF and CR formatting.
- Stored and active section labels reject all control characters, including
  embedded tabs and line breaks.
- Existing length, option-count, answer-index, duplicate-ID and 500-question
  ceiling checks remain in force.
- A mixed selection is still atomic: one invalid item rejects the append rather
  than partially inserting the valid items.

This is Owner-side early validation only. The callable authorization, persisted
Question Bank validation and server-side publish boundary remain authoritative.

Focused regression command:

```bash
node --test features/test-series/admin/tests/question-bank-transfer.test.mjs
```


### Raw-input validation before trimming

All Question Bank import, direct Test Builder import, and Question Bank-to-Test
mapping helpers inspect the original string before trimming. This prevents
JavaScript `trim()` from silently removing a disallowed control character at
the beginning or end of a question, option, or section label. The policy still
permits ordinary TAB, LF and CR in question text, options and explanations,
while section labels reject every control character.

Topic, chapter and folder metadata labels also reject raw C0/DEL control
characters before trimming. This includes leading or trailing TAB, LF, CR,
vertical-tab and form-feed characters; ordinary surrounding spaces continue
to normalize normally. The same rule applies to fallback labels supplied by
the import defaults.

### Duplicate normalized import columns

Question Bank spreadsheet/JSON rows now reject column names that collide after
trimming and case normalization (for example, `text` plus ` TEXT `, or
`topic` plus `Topic`). Previously the later property silently replaced the
earlier one, making the imported value depend on column order. The importer now
reports the row number and conflicting normalized column before it validates
or maps any question fields. Blank/unknown columns remain ignored unless they
collide with another non-empty normalized name.

Focused regression coverage:

```bash
node --test features/test-series/admin/tests/question-bank-transfer.test.mjs
```


### Duplicate JSON object members before parsing

JavaScript's `JSON.parse` silently keeps the last value when the same object
property appears more than once. The Question Bank import now scans the raw,
size-bounded JSON text before using the parsed result and rejects duplicate
object keys after the same trim/lowercase normalization used by row mapping.
This also catches keys written with JSON Unicode escapes (for example,
`text` and `te\\u0078t`) and collisions inside nested objects. The check is
scoped per object, so normal property reuse across separate question rows is
still accepted.

Focused regression coverage includes exact duplicate keys, escaped-key
collisions, case/whitespace collisions, nested duplicate keys, the generic
question-import parser, and valid sibling rows:

```bash
node --test features/test-series/admin/tests/question-bank-transfer.test.mjs
```


### Server-side category and folder validation at publish

The publish integrity boundary now independently revalidates test category and
folder metadata instead of relying only on the save callable or browser form.
This protects older drafts and documents changed outside the normal Test
Builder flow.

- Category: 1–60 Unicode letters, combining marks, numbers, spaces, underscore
  or hyphen.
- Folder: at most 4 slash-separated levels; each trimmed level is 1–40
  characters using the same allowlist; the complete path is at most 120
  characters.
- Empty path levels, traversal-like punctuation, control characters and
  unsupported symbols block publication.
- Hindi and other Unicode letter/number labels remain supported.

Focused server regression command:

```bash
node --test features/test-series/cloud/functions/tests/owner-test-editor.test.js
```

The browser validation and save callable remain separate early-validation
layers; this server publish check is the final integrity gate for legacy drafts.


### Server-side test-title validation at draft save and publish

The Owner draft-save callable and the final publish integrity validator now use
one shared title normalizer. It checks the original value before trimming, so
leading or trailing control characters cannot disappear through JavaScript
`trim()` and pass validation.

- Titles must be strings containing 1–160 characters after safe trimming.
- C0 controls, DEL and C1 controls are rejected anywhere in the original title.
- Unicode titles and ordinary punctuation remain supported.
- The draft-save callable reports an invalid argument; legacy drafts with an
  unsafe title are blocked again at the publish boundary.

Focused server regression command:

```bash
node --test features/test-series/cloud/functions/tests/owner-test-editor.test.js
```

This is isolated Test Series validation logic. It does not change Firebase
project configuration, live Auth providers, App Check enforcement, payments,
or deployment behavior.


### Browser-side title and section control-character parity

The Owner Test Builder now rejects the same C0, DEL and C1 control ranges as
the server-side title and section validators. It checks the raw title before
trimming, so a leading or trailing TAB, newline, form-feed or other control
cannot be silently removed by `String.prototype.trim()`. Question-level and
configured section labels use the same C1-aware helper. Ordinary surrounding
spaces and Unicode title/section text remain supported.

Focused regression command:

```bash
node --test features/test-series/admin/tests/test-builder-publish-parity.test.mjs
```

This is client-side feedback only. The callable save/publish handlers and
server-side validation remain authoritative.


### Raw category and folder control validation before trimming

Both the browser draft validator and the final server publish validator now
inspect the original category and folder strings before calling \`trim()\`.
This closes the edge-whitespace gap where TAB, LF, CR, vertical-tab, form-feed,
other C0 controls, DEL or C1 controls could otherwise be silently removed from
a legacy category or folder path before the allowlist check.

- Category and folder metadata reject all C0, DEL and C1 controls anywhere in
  the original value, including the beginning/end of the value and folder
  segment boundaries.
- Ordinary surrounding spaces continue to normalize.
- Hindi and other Unicode letters/marks/numbers remain supported.
- Empty or whitespace-only values retain the existing \`General\` browser
  fallback; a value containing a control character is rejected rather than
  silently converted to that fallback.
- The server repeats this check at final publish, so older or directly edited
  drafts cannot rely on browser-side validation.

Focused regression commands:

\`\`\`bash
node --test features/test-series/admin/tests/test-builder-publish-parity.test.mjs
node --test features/test-series/cloud/functions/tests/owner-test-editor.test.js
\`\`\`

### Canonical Question Bank document IDs during Test Builder mapping

A Question Bank `itemId` is the Firestore document identity, not a display
label. The Test Builder mapper now validates the original ID without trimming
or otherwise normalizing it before adding the `bank_` prefix.

- IDs must already match the canonical 1–95 character `[A-Za-z0-9_-]` form.
- Leading/trailing spaces, tabs and line breaks are rejected rather than
  silently converted into another record ID.
- This prevents malformed legacy or externally supplied records from aliasing
  a different canonical Question Bank item during duplicate detection.
- Display labels and question text continue to use their separate, documented
  normalization rules.

Focused regression command:

```bash
node --test features/test-series/admin/tests/question-bank-transfer.test.mjs
```

### Canonical IDs in direct Test Builder imports

Direct JSON/spreadsheet imports treat a supplied question ID as a stable
question reference. The importer now validates the original string without
trimming it first. Leading/trailing spaces, TAB, CR and LF are rejected rather
than silently converted into another question ID. Safe integer IDs continue
to be converted to their decimal string representation, and rows without an
ID continue to receive the deterministic row-based fallback.

Focused regression command:

```bash
node --test features/test-series/admin/tests/question-bank-transfer.test.mjs
```

### Question image descriptors survive the Test Builder draft round-trip

The image editor adds a non-secret descriptor (id, altText, mimeType) to
the question JSON before the Owner saves a draft. The browser validator now
validates and retains that descriptor instead of silently dropping it.

- Only JPEG, PNG and WebP descriptors are accepted, with a canonical 1–100
  character media ID, non-empty alt text up to 200 characters, and at most
  three images per question.
- Sparse arrays, duplicate IDs, unsupported MIME types and malformed
  descriptors are rejected before the draft request.
- Extra fields such as storage paths and download URLs are stripped. The
  browser payload never stores upload credentials or private object locations.
- The cloud draft-save and Owner reload callables preserve the safe descriptor.
  Publishing remains blocked until the separate private upload/finalization
  flow creates a verified ready mapping for every referenced image.

Focused regression commands:

```bash
node --test features/test-series/admin/tests/admin-test-validation.test.mjs
npx --yes firebase-tools@latest emulators:exec --config firebase.test-series-cbt-emulator.json --project demo-railway-mitra-cbt --only auth,firestore,functions,storage "npm --prefix features/test-series/cloud/functions test"
```

The emulator case uses a synthetic Owner token and Firestore records. It does
not upload an image to a live bucket, change Firebase configuration, or certify
real Storage CORS/credentials.


### Dense question and option arrays across import, draft and publish

Question and option collections must now be dense arrays at every Test Series
validation boundary. A sparse array (one with a missing numeric slot) is
rejected instead of allowing JavaScript array methods such as `map()` or
`some()` to skip the missing entry.

- The Owner Test Builder rejects sparse question, option and configured-section
  arrays before constructing a draft payload.
- The Question Bank server normalizer rejects sparse option arrays before
  trimming or persisting imported question content.
- The final Owner publish validator and answer-key restore helper independently
  reject sparse question and option arrays, including legacy or directly edited
  records.
- Existing option-count, question-count, answer-index and private answer-key
  checks remain unchanged.

Focused regression commands:

```bash
node --test features/test-series/admin/tests/admin-test-validation.test.mjs
node --test features/test-series/cloud/functions/tests/question-bank-validation.test.js
node --test features/test-series/cloud/functions/tests/owner-test-editor.test.js
```

This is validation hardening for the isolated Test Series module. It does not
change Firebase project configuration, live Auth/App Check settings, payments,
deployment behavior or unrelated Railway features.
