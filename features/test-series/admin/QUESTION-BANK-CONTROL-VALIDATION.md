# Question Bank control-character validation

The Owner Question Bank import, direct Test Builder import, Question Bank-to-Test
mapping, and server-side Question Bank callable now apply one consistent control
character policy.

- Topic, chapter, folder and section labels reject C0 controls, DEL and C1
  controls (U+0080–U+009F) in the original value, before trimming.
- Question text, options and explanations continue to allow ordinary TAB, LF
  and CR formatting. They reject the other C0 controls, DEL and all C1 controls
  before trimming.
- Question Bank list search and topic/chapter/folder filters reject control
  characters before trimming.
- Leading or trailing controls cannot be hidden by JavaScript `trim()`.
- Hindi and other Unicode text, ordinary spaces and normal multiline question
  formatting remain supported.

The browser checks provide early feedback only. The Cloud Functions
`normalizeQuestionBankItem` and `normalizeQuestionBankListRequest` checks are
the authoritative import/list validation boundary.

The final server-side Owner Test Publish validator also applies the same C1
control policy to legacy question papers, including drafts created before the
Question Bank import checks were added. Question text, options and explanations
continue to allow ordinary TAB, LF and CR formatting, but reject C1 controls
(U+0080–U+009F) before publication.

Focused final-publish regression command:

```bash
node --test features/test-series/cloud/functions/tests/owner-test-editor.test.js
```

Focused regression commands:

```bash
node --test features/test-series/admin/tests/question-bank-control-characters.test.mjs
node --test features/test-series/cloud/functions/tests/question-bank-control-characters.test.js
```

These checks are isolated to Railway Mitra Test Series Question Bank workflows.
They do not change Firebase project configuration, live Auth providers, App
Check enforcement, payment settings, deployment behavior, or unrelated
Railway Mitra modules.
