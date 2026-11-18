# Owner Test Builder publish-validation parity

The browser-side Owner Test Builder now applies the same question-text and option
control-character policy as the server-side publish integrity check before it
sends a draft to Firebase.

- Question text and options reject C0 non-printing controls and DEL.
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
