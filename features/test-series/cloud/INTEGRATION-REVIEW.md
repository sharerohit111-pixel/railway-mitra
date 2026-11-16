# Railway Mitra CBT — Integration Review

Review scope: isolated Test Series modules on `feature/test-series-cloud-access`.
This is a source-level integration review with local Firebase Emulator CI evidence, not live Firebase, real-device, staging or production certification.

## Confirmed module wiring

- Student standalone portal loads `student/portal.js` as an ES module and provides login, catalogue and results view containers.
- Student portal links catalogue and dashboard views; catalogue calls the cloud student client for published tests and starts free, paid-checkout or already-unlocked flows.
- Student dashboard reads the signed-in student's recent submitted results through the cloud client.
- Leaderboard implementation is exposed from each submitted result through a `View Test Leaderboard` action. The portal passes that result's `testId` to the leaderboard module and provides a return path to My Results.
- Owner standalone portal loads `admin/owner-portal.js`, fetches `admin-dashboard.html`, and initializes `admin-dashboard.js` with Firebase Auth and Functions.
- Owner dashboard exposes Test Management, Question Bank, Students, Payments, Results/Ranking and protected Test Access Management. The access panel uses Owner-only callables for grants/revocations, bounded access listing and audit history; it displays server-computed expiry status and fences stale responses across session changes. Cloud Backup and System Settings remain explicitly disabled.
- Student and Owner portals are standalone pages under the feature folder; this review does not establish that they are linked from the main Railway Mitra application.

## Integration gaps / next work

1. **Student leaderboard entry point — implemented in the isolated portal:** each submitted result exposes a `View Test Leaderboard` action. The portal passes that result's `testId` to the existing leaderboard module, checks the active student-session/view generation before navigation, and provides a return path to My Results. Ranking is loaded separately from the server.
2. **Owner access management:** the isolated Owner access panel and server callables are implemented, with request idempotency, complimentary-test-only grants, audit writes, bounded/filterable pagination, cursor validation and effective expiry display. The CBT emulator suite creates an isolated verified email/password Owner, enables phone MFA in the Auth Emulator project config, enrolls a phone factor through the emulator Identity Toolkit REST flow, reads the SMS code only from the local emulator, and completes a fresh password + phone-MFA sign-in. It invokes Owner callables using the resulting emulator-issued ID token and verifies primary-only denial, grant, same-request replay without duplicate audit, conflicting request-ID rejection, effective access listing, revoke, and expected audit events. The test restores the prior MFA project config and cleans up synthetic records. This is emulator evidence, not production MFA certification; never weaken the Owner guard or fabricate MFA claims.
3. **Student OTP-to-exam and scoring — implemented and emulator-tested:** a real Auth Emulator phone verification issues a phone-provider ID token; that token opens the published catalogue, starts a paid-test attempt backed by synthetic captured-payment/order/entitlement ledger rows, fetches the student-safe paper without answer-key leakage, saves answers, resumes the same attempt, restores saved answers, submits, and verifies server-side score/result/dashboard. The scoring fixture has one correct, one wrong and one unanswered question, with 1 mark per question and 1/3 negative marking; the expected server score is 2/3. Synthetic payment, attempt, result, active-session and Auth records are cleaned up. This validates the scoring rule with a small emulator fixture, not a full 150-question load or a live Razorpay payment/production OTP.
4. **Question diagrams and full exam validation:** student paper projection currently validates and exposes text, options and optional section labels. Diagram/image question delivery, image storage/access controls and corresponding student rendering still need a separate design and test. Also add an explicit 150-question paper and two-hour exam lifecycle validation before treating the specified GDCE JE Civil format as verified.
5. **Backup and system settings:** keep disabled until export/restore, retention, auditability, restore verification and Owner authorization are implemented and tested. Never expose backup controls as functional placeholders.
6. **Main-app entry points and staging:** integration into the main app is a separate controlled step. Do not alter existing navigation or authentication guard without explicit approval and regression review. Run student OTP, Owner provider + phone MFA, create/publish test, question import, free claim, exam save/resume/submit, result/leaderboard, payment staging and support reconciliation against a dedicated Firebase staging project only after project identity, rules merge and cost approval are confirmed.
7. **Capacity validation:** local emulator checks are not a production capacity claim. Run staged local emulator loads first; staging cloud load requires a written cost estimate and explicit approval.

## Safety and release boundaries

- Keep live payments, production OTP, production deployment and PR merge disabled pending explicit approval.
- Do not deploy the draft Firestore rules as-is. Merge them with the current live rules and review all existing collection permissions first.
- Keep the current development authentication behavior unchanged.
- No claim is made here that 500 concurrent examinees have been proven.

## Current CI evidence

The code commit `96bdf964564d98ee62da50a3fb0994adc62847eb` has successful Test Series Functions Validation and CBT Emulator workflows. The emulator workflow passed the CBT unit and Firestore Rules suite, including Student OTP-to-exam with 1/3 negative marking and Owner MFA callable coverage, followed by synthetic Auth/Firestore backup-restore verification. This is CI emulator evidence only, not live Firebase, real-device, staging or production certification.
