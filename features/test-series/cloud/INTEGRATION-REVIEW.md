# Railway Mitra CBT — Integration Review

Review scope: isolated Test Series modules on `feature/test-series-cloud-access`.
This is a source-level review with local Firebase Emulator CI evidence. It is not live Firebase, real-device, staging or production certification.

## Confirmed isolated module wiring

- Student standalone portal loads `student/portal.js` as an ES module and provides login, catalogue, dashboard, exam and results views.
- Student catalogue uses the cloud client for published tests and routes free claims, paid checkout and already-unlocked tests through server-verified access checks.
- Student OTP reCAPTCHA is scoped to the Firebase Auth instance and DOM container; a failed SMS initiation clears the cached verifier so a retry creates a fresh challenge.
- Student exam flow starts or resumes server-timed attempts, fetches allow-listed question data, saves canonical answer indexes, restores pending local drafts, handles reconnect/timeout recovery, submits for server-side scoring and retrieves the student's own result.
- Student question media is delivered through an attempt-owner-checked callable and short-lived URL. Published media is sanitized from a private quarantine flow; direct client access to the storage prefixes is denied by the feature rules.
- Student results expose leaderboard navigation; leaderboard data is fetched separately and presented without exposing private student identifiers.
- Owner standalone portal loads `admin/owner-portal.js`, fetches `admin-dashboard.html` and initializes the dashboard with Firebase Auth and Functions.
- Owner dashboard includes test management, question bank, student activity, payment inspection/reconciliation, results/analytics and protected test-access management. Owner callables enforce the server-side UID + second-factor guard; UI requests are fenced across session changes.
- Backup and system-settings controls remain disabled. The signed-in main app now exposes a single Railway Departmental Test Series card linking to `features/test-series/index.html`; that landing page links to the Student portal and the Owner Admin portal. The Owner link is navigation only: the backend still independently enforces the configured Owner UID, approved primary provider, verified phone MFA and App Check. These links do not establish that Firebase is deployed or that either portal has passed real-device testing.

## Implemented and emulator-covered flows

1. **Student OTP-to-exam and scoring:** Auth Emulator phone verification produces a phone-provider ID token. The browser verifier cache/retry lifecycle is covered by isolated Node regression tests; this does not send real SMS. The test opens the published catalogue, starts a paid-test attempt using synthetic captured-payment/order/entitlement ledger rows, fetches student-safe questions without answer-key leakage, saves answers, resumes the same attempt, restores answers, submits and verifies server-side score/result/dashboard. A separate GDCE JE Civil fixture covers 150 questions and a 120-minute server deadline, save/resume without deadline extension, and scoring with 1 correct, 1 wrong and 148 unanswered at 1/3 negative marking.
2. **Owner authorization and access management:** Emulator coverage enrolls phone MFA for an isolated verified Owner, completes a fresh password + phone-MFA sign-in, checks primary-only denial, grants/revokes complimentary-test access, validates idempotent replay and conflicting request IDs, and checks bounded access listing and audit events.
3. **Question media:** Uploads enter private quarantine; finalization verifies bytes/checksum, decodes and re-encodes supported image formats without metadata, publishes with create-only generation preconditions and creates a ready mapping. Student delivery checks attempt ownership, active status/deadline, mapping and exact object generation before issuing a short-lived URL.
4. **Question bank and test builder:** Client and server validation cover question shape, options, section labels, bulk import and test configuration. Server-side persisted-paper, section mapping, answer-key and scoring configuration are independently revalidated before delivery, answer save or submission.
5. **Payment safety:** Checkout callbacks do not grant access. Paid access is based on server-validated payment/order/entitlement records; Owner payment inspection and reconciliation remain read-only support workflows. Emulator fixtures use synthetic ledger records and do not prove a live Razorpay transaction.
6. **Exam recovery and lifecycle:** Server-issued deadlines, active-attempt ownership, answer persistence, reconnect recovery, automatic timeout submission recovery and stale-session/view fencing have unit and Emulator regression coverage.

These are local CI/emulator results only. They do not certify production OTP, production MFA, live payment processing, real-device behavior or concurrent-user capacity.

## Remaining release gates

- **Main-app integration:** A minimal signed-in main-app card now links to the Test Series landing page, which exposes Student and Owner Admin navigation links. These are navigation-only links; they do not bypass student phone-provider authentication or Owner UID + primary-provider + phone-MFA + App Check authorization. The main-app change is intentionally limited to one feature-card insertion; existing authentication guards and calculator logic were not changed in this integration step. Still verify the signed-in navigation on real Android devices before release.
- **Firebase staging:** Confirm project identity, merge/review existing Firestore and Storage rules, configure Auth providers and App Check, and obtain cost approval before any staging deployment. The feature's deny-all Firestore rules must not be deployed blindly over existing application rules.
- **Real-device checks:** Verify student phone OTP, connectivity interruption/recovery, media rendering and Owner provider + phone-MFA behavior in an approved non-production environment.
- **Razorpay Test Mode:** Complete a controlled staging order, signature/webhook, duplicate-event, refund/reconciliation and entitlement-revocation walkthrough. No live payment is enabled by this review.
- **Backup/restore:** Implement and verify export, retention, restore, auditability and Owner authorization before enabling backup controls.
- **Production readiness:** Complete privacy/security review, operational monitoring, retention policy, incident/recovery procedures and cost validation. No production-readiness claim is made here.

## Safety and load-test boundaries

- No merge, deployment, production OTP, live payment, Firebase billing change or App Check enforcement is authorized by this review.
- Keep the current development authentication behavior unchanged.
- Synthetic 20/100/250/500-student load tests and capacity benchmarking are deferred at the user's request. Do not run them until separately authorized.
- Emulator checks are not a production capacity claim; no concurrent-user capacity is certified.

## Current branch and CI evidence

Reviewed 2026-11-17. Historical CI evidence below applies only to the exact commits listed. At the preceding checkpoint, PR head was `88706ec890c055a10c7801713c4b33c65386fce5`; the GitHub workflow/status query returned no runs or status checks for that checkpoint. This is historical context only; check the current PR head before treating any change as CI-certified.

For that exact code-bearing commit:
- Test Series Functions validation: run [44071701022](https://github.com/sharerohit111-pixel/railway-mitra/actions/runs/44071701022) — completed, **success**.
- Test Series CBT Emulator tests: run [44071701147](https://github.com/sharerohit111-pixel/railway-mitra/actions/runs/44071701147) — completed, **success**. The workflow passed isolated student regressions, 291 CBT backend/unit tests, Firestore Rules emulator checks, and the synthetic Auth/Firestore backup-restore smoke test.

The earlier runs [44062177441](https://github.com/sharerohit111-pixel/railway-mitra/actions/runs/44062177441) and [44062177830](https://github.com/sharerohit111-pixel/railway-mitra/actions/runs/44062177830) apply only to code-bearing baseline `2b93c0505c2de53b2e269ba1ff93becb46e0c3d2`; they are historical evidence, not evidence for later changes. These checks are local CI/emulator results only and do not imply live Firebase, real-device, staging or production certification. Re-check the PR's latest checks after any subsequent code commit.

PR #136 remains open and draft. This review does not authorize merging it.


## Follow-up integration check

- Main app card insertion and landing-page Student/Owner links were read back from `feature/test-series-cloud-access` and confirmed present.
- PR #136 currently reports `mergeable: false`; no merge was attempted.
- The PR's changed-file list currently includes unrelated live-updates and P-Way calculator files in addition to the CBT modules. Keep those files under explicit regression review; do not assume the PR is CBT-only or merge based on the CBT checks alone.


## Main-app entry regression follow-up

- Added `features/test-series/admin/tests/main-app-integration.test.mjs`. It checks for exactly one Test Series entry in `app.html`, verifies that the existing `assets/js/auth-guard.js` module script remains present, and checks for exactly one Student and Owner navigation link on the Test Series landing page without embedding credentials.
- Updated `.github/workflows/test-series-functions.yml` so changes to `app.html` and `features/test-series/index.html` trigger the admin regression suite on both push and pull request.
- These are source-level regression assertions; they do not replace a real Android signed-in navigation test. The current GitHub status query returned no checks for the latest head, so no CI pass is claimed.
