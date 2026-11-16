# Railway Mitra CBT — Integration Review

Review scope: isolated Test Series modules on `feature/test-series-cloud-access`.
This is a source-level integration review, not a live Firebase or real-device certification.

## Confirmed module wiring

- Student standalone portal loads `student/portal.js` as an ES module and provides the login, catalogue and results view containers.
- Student portal links catalogue and dashboard views; catalogue calls the cloud student client for published tests and starts free, paid-checkout or already-unlocked flows.
- Student dashboard reads the signed-in student's recent submitted results through the cloud client.
- Leaderboard implementation exists as a separate module, but the inspected student portal navigation exposes only Available Tests and My Results. A user-facing leaderboard entry point is not confirmed by this review.
- Owner standalone portal loads `admin/owner-portal.js`, fetches `admin-dashboard.html`, and initializes `admin-dashboard.js` with Firebase Auth and Functions.
- Owner dashboard exposes Test Management, Question Bank, Students, Payments, Results/Ranking and the protected Test Access Management panel. The access panel uses Owner-only callables for grants/revocations, bounded access listing and audit history; it displays server-computed expiry status and fences stale responses across session changes. Cloud Backup and System Settings remain explicitly disabled.
- Student and Owner portals are standalone pages under the feature folder; this review does not establish that they are linked from the main Railway Mitra application.

## Integration gaps / next work

1. **Student leaderboard entry point — implemented in the isolated portal:** each submitted result now exposes a `View Test Leaderboard` action. The portal passes that result's `testId` to the existing leaderboard module, checks the active student-session/view generation before navigation, and provides a return path to My Results. The dashboard remains a bounded latest-100 history; ranking is loaded separately from the server. Functions Validation and CBT Emulator workflows passed on the current code PR head `3f645ba24786f1c67321d663367980032ea169c0`.
2. **Owner access management:** the isolated Owner access panel and server callables are implemented, with request idempotency, complimentary-test-only grants, audit writes, bounded/filterable pagination, cursor validation and effective expiry display. The CBT emulator suite now creates an isolated verified email/password Owner, enables phone MFA in the Auth Emulator project config, enrolls a phone factor through the emulator Identity Toolkit REST flow, reads the SMS code only from the local emulator, and completes a fresh password + phone-MFA sign-in. It invokes Owner callables using the resulting emulator-issued ID token and verifies primary-only denial, grant, same-request replay without duplicate audit, conflicting request-ID rejection, effective access listing, revoke, and the two expected audit events. The test restores the prior MFA project config and cleans up its synthetic Owner and test records. This is emulator evidence, not production MFA certification; never weaken the Owner guard or fabricate MFA claims.
3. **Student OTP-to-exam flow — implemented and emulator-tested:** a real Auth Emulator phone verification issues a phone-provider ID token; that token opens the published catalogue, starts a paid-test attempt backed by synthetic captured-payment/order/entitlement ledger rows, fetches the student-safe paper without answer-key leakage, saves an answer, resumes the same attempt, restores the saved answer, submits, and verifies server-side score/result/dashboard. Synthetic payment, attempt, result, active-session and Auth records are cleaned up in `finally`. This proves the callable flow against local emulators only; it does not test a live Razorpay payment or production OTP.
3. **Backup and system settings:** keep disabled until export/restore, retention, auditability, restore verification and Owner authorization are implemented and tested. Never expose backup controls as functional placeholders.
4. **Main-app entry points:** integration into the main app is a separate controlled step. Do not alter existing navigation or authentication guard without explicit approval and regression review.
5. **End-to-end verification:** run student OTP, Owner provider + phone MFA, create/publish test, question import, free claim, exam save/resume/submit, result/leaderboard, payment staging and support reconciliation against a dedicated Firebase staging project only after project identity, rules merge and cost approval are confirmed.
6. **Capacity validation:** local emulator checks are not a production capacity claim. Run staged local emulator loads first; staging cloud load requires a written cost estimate and explicit approval.

## Safety and release boundaries

- Keep live payments, production OTP, production deployment and PR merge disabled pending explicit approval.
- Do not deploy the draft Firestore rules as-is. Merge them with the current live rules and review all existing collection permissions first.
- Keep the current development authentication behavior unchanged.
- No claim is made here that 500 concurrent examinees have been proven.

## Current CI evidence

The current code PR head `132c54e163ae178b10200566f2a78ac07e0cc51d` has successful Test Series Functions Validation. The CBT emulator test step, including the Student OTP-to-exam flow and Owner MFA callable coverage, has passed; the same workflow is completing its synthetic Auth/Firestore backup-restore verification. Treat this as CI emulator evidence only, not live Firebase, real-device, staging, or production certification.


