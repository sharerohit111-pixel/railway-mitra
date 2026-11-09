# Railway Mitra Exam Cloud Functions

This is the trusted backend source for the GDCE exam feature. It is not deployed by committing code to GitHub.

## Deploy only after reviewing Firebase project and billing

1. Install Node.js 22 and Firebase CLI on a trusted development computer.
2. From the repository root, run `npm --prefix functions install`.
3. Confirm the selected Firebase project is exactly `railway-mitra` using `firebase projects:list` and `firebase use railway-mitra`.
4. Review the live Firestore rules before changing them. The proposed merged rules are in `features/exams/FIRESTORE_RULES_SETUP.txt`; do not overwrite live rules without merging every existing production path.
5. Deploy only these functions with `firebase deploy --only functions`. The root `firebase.json` configures only the Functions source and does not configure Firestore rules.
6. Assign the `admin: true` custom claim to the verified owner UID only from a trusted Admin SDK environment. Never expose a service-account key in GitHub or browser code.
7. Test with a private unpublished test first, using a separate test account. Verify that unauthenticated calls fail, non-admin publishing fails, question endpoints do not reveal keys, and score is computed by the backend.

## Callable functions

- `listPublishedTests({streamId, category})`: metadata only; requires sign-in.
- `startExam({testId})`: checks publication and subscription entitlement, creates a server-owned attempt, returns question text/options only.
- `submitExam({attemptId, answers})`: checks attempt ownership, scores using private answer keys, and returns review only after submission.
- `adminPublishTest({test})`: owner custom claim required; stores public question content and private answer keys separately.

Region: `asia-south1`.

## Access policy

- First mock test in each GDCE stream is forced free.
- Every subsequent mock test, previous-year paper and practice set requires the ₹300 all-tests subscription. Tests are not individually priced; study material remains separately priced per item.
- Paid access requires a trusted `userEntitlements/{uid}` record with `active: true` and an optional future `expiresAt` timestamp.
- No payment gateway or browser-side entitlement editor is included.
- Existing test IDs are immutable in this first version; create a new test ID for a new paper/version.
- The question bank and answer keys are never directly readable from browser clients; only callable functions using Admin SDK can access them.
