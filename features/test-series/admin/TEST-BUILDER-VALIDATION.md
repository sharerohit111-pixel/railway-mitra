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
