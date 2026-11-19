# Student answer-draft write contract

The browser draft is only a best-effort recovery copy of answers that the server has not confirmed. The server-side attempt document remains authoritative for scoring and submission.

## Write-time validation

Before replacing an existing local draft, `writePendingAnswerDraft` requires:

- A non-empty storage key and an available storage adapter.
- An array of no more than 500 answer pairs.
- Every pair to contain exactly two values.
- A non-empty question ID, unique within the draft.
- An option index encoded as a canonical decimal string (for example, `"0"` or `"12"`), representing a safe integer.

Sparse pairs, duplicate question IDs, numeric/coercible values, signs, leading zeroes, decimal notation and unsafe integer strings are rejected. The serialized UTF-8 payload must remain within 128 KiB.

A rejected write returns `false` and leaves the previously stored draft unchanged. It must never overwrite a recoverable draft with malformed or oversized data.

## Restore-time validation

On restore, the helper independently checks every question ID against the currently delivered paper and verifies that the option index is within that question's option range. Duplicate IDs in the delivered paper are treated as ambiguous even when only one duplicate has a valid options array; empty and whitespace-only IDs are never eligible for restoration. Draft entries for those IDs, malformed entries and out-of-range values are discarded rather than mapped to an arbitrary question definition. A local draft never changes the server's saved-answer state and is cleared only as best-effort cleanup after server confirmation.

## Focused regression commands

```sh
node --test features/test-series/student/tests/answer-draft-store.test.mjs
node --test features/test-series/student/tests/answer-draft-ambiguous-paper.test.mjs
```

The write-validation and restore regressions cover malformed/sparse pairs, duplicate draft IDs, duplicate or blank delivered-paper IDs, canonical option-index formatting, safe-integer bounds, storage-key validation, successful round-trip restoration and preservation of the previous draft on rejected writes.
