# Railway Mitra Exam Cloud Functions

This is the trusted backend source for the Railway Mitra GDCE and LDCE exam features. It is not deployed by committing code to GitHub.

## Deploy only after reviewing Firebase project and billing

1. Install Node.js 22 and Firebase CLI on a trusted development computer.
2. From the repository root, run `npm --prefix functions install`.
3. Confirm the selected Firebase project is exactly `railway-mitra` using `firebase projects:list` and `firebase use railway-mitra`.
4. Review the actual live Firestore rules before changing them. `features/exams/FIRESTORE_RULES_SETUP.txt` is only an exam-rules template, not a verified complete live ruleset. Never paste it over the live rules; merge only the exam-specific match blocks while preserving every existing production path.
5. Deploy only these functions with `firebase deploy --only functions`. The root `firebase.json` configures only the Functions source and does not configure Firestore rules.
6. Verify the owner UID from Firebase Console → Authentication → Users. Then, from a trusted computer authenticated with Google Application Default Credentials and the correct project selected, set `GOOGLE_CLOUD_PROJECT=railway-mitra` and run `npm run set-owner-admin -- <FIREBASE_AUTH_UID>` from the `functions` folder. The script preserves existing custom claims and verifies the result. Never expose a service-account key in GitHub or browser code. Do not use an email address in place of the UID.
7. Test with a private unpublished test first, using a separate test account. Verify that unauthenticated calls fail, non-admin publishing fails, question endpoints do not reveal keys, and score is computed by the backend.

## Local Firebase Emulator test suite

These tests use only local Auth, Firestore, and Functions emulators. They create temporary test users and test documents, then clean them up. They do not deploy code or change production Firebase data.

From the repository root on a trusted development computer:

```bash
npm --prefix functions install
firebase emulators:exec --project railway-mitra --only auth,firestore,functions "npm --prefix functions test"
```

The emulator ports are configured in the root `firebase.json`: Auth 9099, Firestore 8080, Functions 5001. The suite checks unauthenticated rejection, answer-key separation, free test start, server-side scoring, idempotent submission, paid-test entitlement denial, and admin-only publishing.

A passing local emulator suite is a prerequisite, not a substitute for a separately approved production deployment and live Firestore rules review.

## Callable functions

- `listPublishedTests({streamId, category})`: metadata only; requires sign-in.
- `startExam({testId})`: checks publication and subscription entitlement, creates a server-owned attempt, returns question text/options only.
- `submitExam({attemptId, answers})`: checks attempt ownership, scores using private answer keys, and returns review only after submission.
- `adminPublishTest({test})`: owner custom claim required; stores public question content and private answer keys separately.

Region: `asia-south1`.

## Access policy

- First mock test in each supported GDCE and LDCE stream is forced free.
- Every subsequent mock test, previous-year paper and practice set requires the ₹300 all-tests subscription. Tests are not individually priced; study material remains separately priced per item.
- Paid access requires a trusted `userEntitlements/{uid}` record with `active: true` and an optional future `expiresAt` timestamp.
- No payment gateway or browser-side entitlement editor is included.
- Existing test IDs are immutable in this first version; create a new test ID for a new paper/version.
- The question bank and answer keys are never directly readable from browser clients; only callable functions using Admin SDK can access them.

## Paper source metadata

The owner publishing form accepts an optional source label and paper year. These values are stored in `examTestCatalog` and shown in the published test list. Record the official paper/source details accurately; do not label generated practice questions as official previous-year papers.


## Candidate store and payment workflow (manual UPI verification)

- Owner configures merchant UPI ID, display name, subscription price and validity in the Finance Admin Panel.
- Candidates open `features/exams/store.html`, view the subscription and published study PDFs, pay through the configured UPI intent, and submit the UTR/reference.
- Candidate payment requests are stored as `pending`; only the owner can approve them from Finance Admin.
- Subscription approval writes `userEntitlements/{uid}`; material approval writes `materialEntitlements/{uid}/items/{fileId}`.
- Owner publishes/unpublishes study PDFs in Content Manager. New PDFs are private/unpublished by default.
- `getStudyMaterialDownloadUrl` issues a short-lived signed URL only for free published PDFs or candidates with an active material entitlement.
- Automatic payment verification is not active. The owner must independently confirm each UPI transaction in the merchant bank/UPI app before approval. Do not approve based on screenshots alone.

## LDCE stream support

- Candidate navigation and owner publishing support separate stream IDs: `ldce-je-civil`, `ldce-je-electrical`, `ldce-je-mechanical`, and `ldce-other-posts`.
- LDCE tests use the same secure CBT engine, private answer-key separation, scoring, candidate history, subscription rules and owner publishing workflow as GDCE.
- LDCE question papers are not preloaded. The owner must upload and verify LDCE question banks before candidates see any tests. No preloaded question bank is included in this release.

## Question-bank content policy

- No question bank is preloaded by this release. The owner must supply, verify and publish each LDCE/GDCE test from the appropriate source.
- Uploading a PDF stores it in the content library; it does not automatically convert the PDF into CBT questions. Question banks are entered through the protected Exam Admin publishing workflow.
- Do not label generated practice questions as official previous-year papers. Preserve source labels and years accurately.

## Storage rules deployment safety

`storage.rules` currently contains only the new exam-content path. It is not a complete copy of the live project's Storage rules. Before deploying Storage rules, export the actual deployed rules from Firebase Console, preserve every existing path, merge only the `exam-content/{uid}/{folderId}/{fileName}` match block, review the result, and only then run `firebase deploy --only storage`. Deploying the current file as a full replacement could break other app features. Do not deploy it as-is.

## Additional owner and candidate callables

Owner-only content administration:
- `listExamContent`, `createExamContentFolder`, `renameExamContentFolder`, `deleteExamContentFolder` (deletes a selected subfolder tree and its PDFs; protected main roots cannot be deleted)
- `registerExamContentFile`, `renameExamContentFile`, `deleteExamContentFile`, `searchExamContent`
- `adminSetMaterialPrice`, `adminSetMaterialPublication`
- `adminListExamAttempts`: most recent submitted candidate attempts and score summaries.

Owner-only finance administration:
- `adminGetFinanceSettings`, `adminSaveFinanceSettings`
- `adminRecordPayment`, `adminListPayments`, `adminApprovePayment`

Candidate store:
- `getPublicStoreSettings`, `listStudyMaterials`
- `createCandidatePaymentRequest`, `getMyPaymentRequests`
- `getStudyMaterialDownloadUrl`: returns a five-minute signed URL only after publication and required entitlement checks.
- `getMyExamAttempts`: candidate-owned submitted test history.
