# Railway Mitra CBT — Cloud Architecture

## Target
1,000 registered students; design and load-test for 500 simultaneous examinees. Login: mobile number + OTP only. Supports mock and scheduled exams.

## Firebase project status
No Firebase configuration or project files were found in the inspected repository branch. This does not prove whether a project exists in the user's Google account. Check Firebase Console before creating a new project to avoid duplicates.

## Services
- Firebase Authentication: Phone provider; Firebase UID is the stable student identity.
- Cloud Firestore: test metadata, private answer keys, attempts, answer records, entitlements and results.
- Cloud Functions v2 in asia-south1: start, save, submit, scoring and owner authorization.
- Cloud Storage: optional question media and PDFs.
- App Check: enforced on callable endpoints.
- Razorpay: later phase; order creation and signature/webhook verification must be server-side.
- Owner dashboard: separate module; OWNER_UID is configured only in backend environment.

## Data model
- testSeriesTests/{testId}: title, status, mode ('mock'|'scheduled'), durationMinutes, scheduleStartAt, scheduleEndAt, price, marksPerQuestion, negativeMarks.
- testSeriesAnswerKeys/{testId}: private questions map keyed by questionId; never client-readable.
- testSeriesAttempts/{attemptId}: uid, testId, status, startedAt, expiresAt, answers map, score summary.
- testSeriesActiveSessions/{uid}: active attempt pointer.
- testSeriesResults/{attemptId}: final score summary.
- testSeriesEntitlements/{uid_testId}: server-created paid entitlement containing `uid`, `testId` and `status`; `rmStartExam` checks both identity fields against the authenticated student and requested test before granting access. A future payment webhook must create this record only after provider signature verification and idempotency checks.
- testSeriesFreeAttempts/{uid}: one-time free attempt claim.

## Important implementation note
The callable functions are a foundation, not a completed TCS-scale platform. For 500 simultaneous candidates, load testing must determine Firestore document contention, read/write volume, answer payload sizes and autosave cadence. The current initial implementation stores answers on one attempt document and must be stress-tested. If measured contention or document growth is high, move answers into per-question documents or a dedicated answer-write service before launch.

## Budget guardrail
The user's initial monthly target is ₹500. This is a target, not a guaranteed maximum. Firebase Phone Auth SMS, Cloud Functions, Firestore overages, storage and egress may exceed it. Do not enable paid usage, deploy billable functions, send production OTPs, or run load tests without explicit user approval after a cost estimate. Use test phone numbers and Firebase Emulator first.

## Deployment prerequisites
1. Confirm existing Firebase project in Firebase Console; don't create duplicate.
2. Configure Phone Authentication and authorized domains.
3. Configure App Check for the web/PWA client.
4. Deploy Firestore rules (deny all direct client access).
5. Deploy Functions codebase and set OWNER_UID securely server-side.
6. Add test metadata and answer keys through owner-only backend.
7. Implement student-safe question delivery (without correct answers).
8. Add robust attempt policy, idempotent submission, schedule controls and monitoring.
9. Load-test 500 virtual users in a staging project.
10. Review billing and alerts before public release.

## Current limitations
- Student-facing question delivery and CBT UI integration are not complete.
- Free-attempt claim is one per Firebase UID, not fraud-proof against multiple phone numbers.
- Payment verification, owner CRUD endpoints, question import, backup/restore and full MFA onboarding are pending.
- Firestore rules deny all direct client access; server functions use Admin SDK and are unaffected.
