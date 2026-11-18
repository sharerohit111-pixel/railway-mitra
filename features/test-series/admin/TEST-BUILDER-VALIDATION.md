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
