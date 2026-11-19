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
6. **Exam recovery and lifecycle:** Server-issued deadlines, active-attempt ownership, answer persistence, reconnect recovery, automatic timeout submission recovery and stale-session/view fencing have unit and Emulator regression coverage. A dedicated Emulator case also saves different question IDs concurrently, then verifies both answers survive resume and server-side scoring. Submission reads the result document in the same transaction and creates new results with create-only semantics; a pre-existing result paired with an in-progress attempt fails closed rather than being overwritten.

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

- Expanded `features/test-series/admin/tests/main-app-integration.test.mjs` to verify exactly one main-app Test Series entry; the `auth-pending` body-hiding style; inline pending-state bootstrap before the single `assets/js/auth-guard.js` module in the document head; the existing signed-in release and unauthenticated return-to-login branches; and exactly one Student and Owner landing-page link with no embedded credentials.
- The regression is source-level only. It does not edit `app.html` or `assets/js/auth-guard.js`, change the current development authentication behavior, or replace a real Android signed-in navigation test.
- `.github/workflows/test-series-functions.yml` already includes `features/test-series/admin/**`, `app.html` and `features/test-series/index.html` in its push and pull-request path filters, so the admin regression suite runs for these integration changes.
- On code-bearing head `06835ba3ad9abdc1d8de34d50be1500b8ca242a0`, Test Series Functions validation run [44079941355](https://github.com/sharerohit111-pixel/railway-mitra/actions/runs/44079941355) completed, **success**; this includes the admin regression suite. CBT Emulator run [44079941286](https://github.com/sharerohit111-pixel/railway-mitra/actions/runs/44079941286) was still in progress at the time of this review. Check its final result before claiming full emulator validation.


## Submission retry regression follow-up

- Added a GDCE JE Civil 150-question emulator assertion that repeats `rmSubmitExam` for the same completed attempt, verifies the retry returns the original score/counts, confirms exactly one `testSeriesResults` document exists for the attempt, and re-reads the unchanged result.
- This covers idempotent client retry after a lost response at the emulator-test level; it does not certify a live network or production deployment.
- Latest PR #136 head checked during this review: `13fccdca52fd68f2a85e95e4025910a6d2181a60`. GitHub reported no PR workflow runs and no combined status checks for this head at the time of the check. Do not infer a CI pass from earlier commits; rerun and verify checks on the current head.
- PR #136 remains open, draft, and `mergeable: false`; no merge or deployment was performed.


## Concurrent answer-write regression follow-up

- Added `concurrent saves for different questions preserve both answers through resume and scoring` to `features/test-series/cloud/functions/tests/cbt-emulator.test.js`.
- The test starts one synthetic paid-test attempt in the isolated Auth/Firestore/Functions Emulator, sends two `rmSaveAnswer` calls for different question IDs concurrently, verifies both values in the attempt document and resumed question payload, then checks the final server-side score and result.
- This is a correctness regression using synthetic emulator fixtures, not a synthetic load test or capacity benchmark. The 20/100/250/500-student tests and all capacity benchmarking remain deferred until separately authorized.

## Retry queue drains concurrent answer edits

- The retry operation now drains pending answers until the queue has no unacknowledged values, rather than checking only the snapshot captured when Retry began.
- If a student changes an answer while an older retry is in flight, the newer value remains pending, is picked up on the next drain pass, and must receive its own server acknowledgement before Retry resolves.
- A failed latest write still rejects the retry and remains in the local pending draft for a later explicit retry; this change does not treat local queue completion as proof of server persistence.
- Explicit exam submission locks answer controls before draining the queue, so the submission waits for the final selected values. Server-side attempt ownership, deadline checks, Firestore writes and scoring remain authoritative.


## Publish-boundary question text validation

- The server-side Owner publish validator now independently rejects non-printing control characters in legacy or directly modified draft question text, options, section labels and optional explanations.
- Question text, options and explanations retain ordinary line breaks and tabs where applicable; section labels reject all control characters.
- Optional explanations are type-checked and bounded to 4,000 characters, matching the question-bank input contract.
- This is a publish-time integrity check. Owner authorization, private answer-key separation and student allowlist projection remain unchanged.


## Result-record immutability regression follow-up

- `rmSubmitExam` now reads the attempt's result document in the same Firestore transaction as the active-session and scoring inputs.
- An existing result paired with an `in_progress` attempt is treated as an inconsistent record requiring support reconciliation; it is never overwritten. New result documents use Firestore transaction `create` semantics.
- The focused Auth + Firestore + Functions Emulator regression seeds a conflicting result and verifies the callable rejects without changing the attempt, existing result or active-session pointer.
- This is a single-attempt data-integrity regression. It is not a synthetic load test or capacity benchmark.


## Razorpay Test Mode-only guard (2026-11-19)

- The `rmCreatePaymentOrder` callable validates the configured Key ID as `rzp_test_` plus a non-empty alphanumeric suffix before creating a payment-request document or student/test lock. A missing, malformed or `rzp_live_` Key ID fails closed with `failed-precondition` and no provider request.
- `createRazorpayOrder` repeats the same check before its HTTP client is invoked, protecting direct/helper callers as well as the callable path.
- Focused unit regressions cover accepted Test Mode IDs, rejection of live/malformed IDs without provider calls, and source-level ordering of the callable's guard before reservation. These checks do not contact Razorpay or inspect Secret Manager values.
- Staging remains blocked until the intended non-production Firebase project, Test Mode API credentials and matching Test Mode webhook secret are independently verified and a controlled provider walkthrough is approved. No secrets, live Firebase configuration or deployment were changed.
