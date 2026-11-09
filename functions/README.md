# Railway Mitra Exam Cloud Functions

This is the trusted backend source for the GDCE exam feature. It is not deployed by committing code to GitHub.

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

- First mock test in each GDCE stream is forced free.
- Every subsequent mock test, previous-year paper and practice set requires the ₹300 all-tests subscription. Tests are not individually priced; study material remains separately priced per item.
- Paid access requires a trusted `userEntitlements/{uid}` record with `active: true` and an optional future `expiresAt` timestamp.
- No payment gateway or browser-side entitlement editor is included.
- Existing test IDs are immutable in this first version; create a new test ID for a new paper/version.
- The question bank and answer keys are never directly readable from browser clients; only callable functions using Admin SDK can access them.
