# Railway Mitra CBT Cloud

See ARCHITECTURE.md for target architecture, data model, budget guardrails and deployment prerequisites.

## Callable functions
- rmClaimFreeAttempt: claims one free test attempt per authenticated UID. The first successful claim sets `testSeriesConfig/freeTest.hasClaims` in the same Firestore transaction, locking the selected free test so later Owner changes cannot strand existing claimants.
- rmStartExam: creates or resumes a server-timed mock/scheduled attempt. A student with a valid active attempt cannot start a second test in parallel; stale session pointers are checked against the attempt record before resume. The one-time free-claim record is also used to recover the original attempt if the active-session pointer becomes stale. For paid tests, the server also verifies that the entitlement record's `uid` and `testId` match the authenticated student and requested test; an active status by itself is not sufficient.
- rmSaveAnswer: saves a scalar answer only for the authenticated attempt owner.
- rmSubmitExam: scores using private server-side answer keys and records the result.
- rmGetExamQuestions: returns the authenticated active attempt paper without private answer keys.
- rmGetStudentActiveAttempt: discovers the authenticated student’s active/completed attempt for safe cross-device recovery.
- rmGetCbtAttemptResult: retrieves only the authenticated student’s submitted result.
- rmListAvailableTests: lists published test metadata and access type.
- rmGetStudentDashboard: returns only the authenticated student’s submitted results.
- rmGetTestLeaderboard: returns anonymized leaderboard entries and the requesting student’s own rank.
- rmGetOwnerAdminSession: checks server-configured OWNER_UID and Firebase second-factor claim.
- rmOwnerListTests: returns the Owner test catalogue plus the currently configured `freeTestId`, allowing the dashboard to preserve the existing selection on refresh.
- rmOwnerSetFreeTest: accepts only a published zero-price test and permits changing the selection only before the first free claim. Legacy claim documents are checked when the lock marker is absent; same-test re-selection remains idempotent.
- rmOwnerListPaymentReconciliation: Owner-only, read-only paginated view of payment-order requests in `creating` or `unknown` state. The Owner UID + phone-MFA guard runs before any Firestore read; the response is an explicit allow-list and excludes reservation tokens, request fingerprints, phone, email and provider payloads. It returns only a strictly validated server-generated `receiptRef` (not provider credentials or a payment token) so the Owner can search the Razorpay Dashboard when no provider order ID was durably recorded.

## CBT section mapping integrity

The server validates each persisted question paper against its test's section configuration before returning questions, starting a section timer, or saving any answer (including an unsectioned question in a mixed paper). Every non-empty question section must match exactly one canonical configured section name; duplicate configured names (case-insensitive), malformed labels, invalid time limits and orphaned question-section references fail closed with a failed-precondition response. The returned section question counts are derived from the actual question paper rather than trusting stored counters. Unsectioned questions remain valid in tests that do not use sections. This protects the section timer and answer-save boundary even if a stale or manually corrupted Firestore document bypasses the Owner draft validator. The pure mapping rules are covered by tests/section-integrity.test.js, and a callable-emulator regression test confirms a mismatched persisted section cannot be read, entered or answered.

## Server-side answer-key integrity

The submission callable reads the published question paper and private answer-key record in the same Firestore transaction used to finalize the attempt. Before scoring, it requires a non-empty paper of at most 500 questions, unique safe question IDs, 2–6 non-empty text options per question, and an exact one-to-one match between paper question IDs and answer-key entries. Each stored correct-answer index must be a canonical decimal string within that question's option range. Missing keys, extra keys, duplicate IDs, malformed options or out-of-range answers fail closed with `failed-precondition`; the attempt remains in progress and no result document is written. Pure boundary tests and callable-emulator regressions cover missing, extra and out-of-range answer-key entries. Private answer keys are never returned by the student question callable.

## Server-side exam scoring integrity

The Owner test-draft validator constrains marks per question to a finite value greater than 0 and at most 100, and negative marks to a finite value from 0 through 100. The submission callable independently revalidates the persisted Firestore values before calculating or writing a result; the Owner form is not treated as a trust boundary. Missing legacy fields retain the existing defaults (1 mark and 0 negative marks). Invalid, non-finite, zero, negative, or out-of-range scoring configuration fails closed with `failed-precondition`, leaving the attempt unsubmitted and creating no result record. Pure boundary tests and a CBT Functions Emulator regression test cover this behavior.

## Owner question bank validation

Single-item saves (`rmOwnerSaveQuestionBankItem`) and bulk imports (`rmOwnerBulkSaveQuestionBank`) share the pure server-side normalizer in `functions/question-bank-validation.js`. The Owner UID + phone-MFA authorization check remains in each callable and runs before validation or Firestore access. The shared contract requires text topic/chapter/folder labels, a non-empty question, 2–6 text options, and an integer `correctIndex` within the option range. Optional section labels are trimmed, limited to 80 characters, and reject control characters while preserving Hindi/Unicode text; blank section labels are omitted. Question text, options and explanations reject non-printing C0 controls and DEL while preserving LF, CR and TAB for normal formatting; Hindi/Unicode content and ordinary letters or digits remain valid. Regression tests cover the rejected control ranges and the allowed formatting characters. Bulk errors include the source row number. This prevents single and bulk imports from silently accepting different question shapes. Regression tests run as part of the isolated Functions test suite; no Firestore schema or published test snapshot is changed by this validation refactor.

## Student authentication boundary

Every student callable uses a server-side guard that requires the Firebase ID token claim `firebase.sign_in_provider === "phone"`. A valid Firebase login through email/password, Google, or a custom token is not sufficient for student catalogue, free-claim, CBT, dashboard, leaderboard, or payment-order access. The standalone student portal also checks the restored ID token before revealing the student workspace. Owner access remains separate: the exact server-configured `OWNER_UID` plus the verified phone MFA second-factor claim is required. The pure auth-policy tests accept only the phone provider and reject password, Google, custom-token and phone-MFA-only claims. The callable emulator harness uses custom-token fixtures only when both `FUNCTIONS_EMULATOR=true` and the explicit emulator-only `TEST_SERIES_ALLOW_CUSTOM_AUTH_FOR_EMULATOR=true` flag are present; email/password-only sessions are still exercised and denied. This fixture exception is not available in production.

## Free-trial selection lifecycle

The Owner may change the configured free test only before the first student claim. The first successful `rmClaimFreeAttempt` writes `hasClaims: true` and `firstClaimAt` to `testSeriesConfig/freeTest` in the same transaction that creates the student's claim and attempt. The Owner selection transaction reads and writes the same config document, so a concurrent first claim and selection change serialize instead of leaving a student with a claim for an obsolete test. Re-selecting the already configured test is idempotent. When the lock marker is absent (older data), the Owner callable checks for an existing legacy claim before allowing a change. The dashboard shows the current selection after each refresh.

## Razorpay payment integration — staging code only, not deployed
- `functions/razorpay-order.js` creates Razorpay Orders through the provider API. It validates credentials, integer paise amount, INR currency, server-generated receipt and the provider response.
- `rmCreatePaymentOrder` derives UID from Firebase Authentication and price/test metadata from a published Firestore test. The client cannot supply amount, currency, UID or provider credentials. It writes the trusted order record under `testSeriesPaymentOrders/{razorpayOrderId}` and returns only the public Key ID plus order details.
- `functions/razorpay-webhook-signature.js` verifies HMAC-SHA256 against the exact raw HTTP body using constant-time comparison.
- `functions/razorpay-webhook-handler.js` handles POST requests, verifies the signature against `req.rawBody`, then parses the event only from those exact signed bytes (never from `req.body`). It requires the provider event ID, routes verified `payment.captured` and `refund.processed` events to their separate ledger processors, acknowledges unsupported event types without grants, and distinguishes permanent conflicts from retryable failures. A regression test supplies a valid signed body alongside a conflicting parsed `req.body` and confirms only the signed payload reaches the ledger.
- `rmRazorpayWebhook` is the HTTP endpoint that invokes the isolated handler.
- `functions/payment-validation.js` accepts only a captured payment that exactly matches the trusted server-created order's provider order ID, amount and currency. UID/test ID are sourced only from that order; client-supplied payment notes are ignored.
- `functions/payment-ledger.js` atomically records a validated capture, marks the server order paid, stores provider event/payment records, and creates the matching student entitlement in one Firestore transaction. Repeated event IDs are checked against the complete original ledger before acknowledgement. If an already-recorded payment is replayed with a different event ID, the ledger validates the complete original payment, order and entitlement but does not create another event document. Razorpay supplies the event ID in a request header outside the raw-body HMAC, so persisting every caller-selected replay ID could amplify Firestore writes without changing student access. When a previously recorded payment arrives with a new provider event ID, the existing entitlement must also match the authoritative UID, test ID, payment ID, order ID, amount and currency; an incomplete or drifted grant is rejected and left retryable rather than acknowledged as a successful duplicate.
- The student catalogue labels a paid test `unlocked` only after checking that the active entitlement, captured payment and paid provider-order records agree on authenticated UID, test ID, payment ID, Razorpay order ID, integer paise amount and INR currency. This catalogue read is a display hint, not authorization; it can conservatively show `paid` during reconciliation. Before a paid exam starts, `rmStartExam` repeats the same checks inside its Firestore transaction and remains the authoritative access gate. Missing, orphaned, refunded or drifted records fail closed. Emulator coverage verifies that an entitlement without both ledgers, a refunded payment, or a mismatched order cannot produce an `unlocked` catalogue state, and that incomplete grants cannot start a paid test.
- Unit tests cover provider order requests, raw-body signatures, HTTP webhook responses/retries, and payment ledger emulator flows. GitHub Actions validate the isolated Functions syntax and run CBT/GDCE regression tests.
- Owner payment-history emulator fixtures use a dedicated `testSeriesPaymentHistoryFixtures` collection; they must never seed or clear the live-shaped `testSeriesPayments` ledger collection. This keeps the pagination/privacy test deterministic and isolated from payment-ledger scenarios.
- Owner payment-reconciliation emulator fixtures use a separate `testSeriesPaymentReconciliationFixtures` collection. The queue scans at most 500 payment-request documents ordered by immutable `createdAt` (not mutable `updatedAt`), returns only `creating`/`unknown` rows, and exposes a continuation cursor when the bounded scan is full. `updatedAt` remains display metadata only, so status/provider updates cannot move a request across an already-issued page cursor. It does not mutate requests, retry provider calls, or grant/revoke entitlements; an Owner must reconcile the provider outcome before support tells a student to retry checkout.
- These endpoints are code-only until separately configured and deployed. Paid tests must remain unavailable to real students until the secrets, provider dashboard webhook, client checkout flow, staging end-to-end test and operational refund/support process are configured and approved.


### Student checkout request-ID persistence

The student checkout stores its opaque payment request ID in browser `sessionStorage`, scoped to the test and current tab. A page reload in that tab therefore reuses the same UID/test/request reservation, allowing the server to replay a completed provider order or keep an ambiguous outcome locked for reconciliation. If session storage is unavailable or cannot be verified, checkout fails closed before calling the payment-order callable. The request ID is not a payment credential and contains no student or provider data.

The client clears that stored ID only when the callable returns the explicit `details.retryableNewRequest === true` marker. The server emits this marker only after Razorpay returned a definite order-creation rejection; an unknown network/provider outcome never carries it and the client retains the original key. The student can then deliberately start a new attempt after a definite rejection. Do not clear browser session data or generate a new request ID to work around an unknown outcome: contact support and reconcile the provider order first. This is tab-scoped protection, not a cross-device or cross-tab payment lock; server-side reservation and payment-ledger checks remain authoritative.

### Required Secret Manager names
Set secrets only in the intended Firebase staging project, using the Firebase CLI's interactive secret prompt (do not paste secret values into source code, GitHub, chat, or command-line arguments):
- `RAZORPAY_KEY_ID` — Razorpay API Key ID for the selected test/live mode.
- `RAZORPAY_KEY_SECRET` — matching Razorpay API Key Secret.
- `RAZORPAY_WEBHOOK_SECRET` — independently configured webhook signing secret from the Razorpay Dashboard.

Example interactive commands (run locally only after confirming the staging project ID and explicit approval):
```bash
firebase use <staging-project-id>
firebase functions:secrets:set RAZORPAY_KEY_ID
firebase functions:secrets:set RAZORPAY_KEY_SECRET
firebase functions:secrets:set RAZORPAY_WEBHOOK_SECRET
```
Do not configure live-mode secrets or deploy these functions without explicit approval. Do not print or commit secret values. The public Key ID returned to the browser is not a private secret.

## Firestore rules — review required
`firestore.rules` is a draft, NOT approved for deployment. It includes example employee paths and a default-deny rule that could block existing Railway Mitra collections if deployed as-is. Before any deployment, retrieve the current live Firestore Rules, merge the CBT deny-by-default paths without removing existing permissions, review the complete result, and obtain explicit approval. Do not overwrite production rules with this draft.

## Not production-ready
The existing Firebase project is identified from the repository configuration as `railway-mitra`; this confirms the project ID configured in code, not the live console state or billing status. No functions have been deployed and no live student UI is connected. Do not run paid deployment or real SMS until the user explicitly approves the cost.


## App Check verification (web/PWA)
1. Confirm the Firebase Console App Check app entry shows **Railway Mitra Web — Registered** with reCAPTCHA Enterprise/Fraud Defense and the intended authorized domains.
2. Serve the branch from an approved staging origin; GitHub Pages on the default branch will not serve branch-only changes automatically.
3. Open `features/test-series/cloud/app-check-test.html` on that origin and tap **App Check जाँचें**.
4. A success message proves only that this browser obtained a token. It does not prove that Cloud Functions are deployed, that Android/PWA clients work, or that the project is production-ready.
5. Before deploying the callable code, verify App Check tokens from every real Test Series client entry point on staging. The callable code intentionally sets `enforceAppCheck: true` in deployed environments; only the local Functions Emulator bypasses it. Keep any broader Firestore/Storage enforcement switches off until their client coverage and impact on existing Railway Mitra features have been separately reviewed and approved.

The Owner and Student portals use a dedicated Firebase app instance named `railway-mitra-test-series`. `firebase-app-check-init.js` initializes that app, then initializes App Check, and only afterward creates its Auth and Firestore clients. This ordering ensures the protected callable client starts with App Check available. The Test Series bootstrap carries the same public Firebase config as `assets/js/firebase.js`; a regression test compares all config fields so the isolated copy cannot silently drift. The shared `assets/js/firebase.js` and all unrelated Railway Mitra features remain unchanged. Server callables use one fail-closed policy: App Check is enforced in deployed environments and bypassed only when the Firebase Functions Emulator explicitly sets `FUNCTIONS_EMULATOR=true`. The Razorpay webhook is an HTTP provider callback and is authenticated by its raw-body HMAC secret rather than browser App Check. The site key in `app-check.js` is a public web site key, not a private service-account secret. Never put service-account credentials or private keys in browser code.


## Isolated Functions codebase
The root `firebase.json` now declares two codebases:
- `default` → existing `functions/` (left unchanged)
- `test-series` → `features/test-series/cloud/functions/`

After staging configuration and explicit billing approval, deploy only the CBT backend with:

```bash
firebase deploy --only functions:test-series
```

Install dependencies for local validation from `features/test-series/cloud/functions/` with `npm install`. GitHub Actions also checks the isolated codebase configuration and JavaScript syntax. This does not deploy anything.

**Important:** The existing project may require the Blaze plan for Cloud Functions deployment. Do not upgrade or deploy until the projected cost and budget are approved. The ₹500 target cannot be guaranteed for 500 simultaneous exam users.


## CI and load-test safety

The normal Test Series CBT push/pull-request workflow runs the isolated unit, callable-emulator and Firestore Rules checks; it does not run either synthetic load harness. The Firestore load-test workflow is manual-only and its job remains skipped unless the required `confirm_load_test` checkbox is explicitly selected (default: false). Do not dispatch it without explicit project-owner approval. See `PERFORMANCE-LOAD-TEST.md` for bounded settings and interpretation limits.

### Student-test pending payment lock

The server now maintains one deterministic `testSeriesPaymentLocks/{sha256(uid,testId)}` record per student and test. The lock is reserved in the same Firestore transaction as the payment request, before the Razorpay API call. A different request ID from another tab or device is rejected while the lock points to a `creating`, `created`, or `unknown` request. The same request ID can wait or replay its existing order only when the lock and request record agree.

A definite provider rejection marks that request failed and deletes only its matching lock. A network/provider ambiguity, or a Firestore failure after provider success, retains or repairs the matching lock as `unknown`; a later request must not create another provider order. A signature-verified captured-payment webhook creates the payment ledger and entitlement and deletes the matching student-test lock in the same transaction. If a lock exists but does not match the trusted order's `paymentRequestId`, capture processing fails closed.

There is deliberately no automatic lock expiry. A stale `creating` or `unknown` lock requires Owner/support reconciliation using the payment request record and Razorpay Dashboard before a safe release procedure is implemented. Do not delete a lock manually merely to let a student retry: the provider may already have created an order. This is a server-side one-pending-order guard, not proof of payment. Only the verified capture ledger grants paid access.

### Razorpay order inspection completeness

The Owner-only Razorpay order inspector explicitly requests 100 payment rows per page and follows the provider's `skip` pagination until a short page is returned. It validates every row, rejects cross-order rows and duplicate payment IDs, and refuses to produce a complete inspection when the 500-payment safety ceiling is reached with another full page. This read-only inspection does not release a payment lock or grant/revoke an entitlement. A full inspection result is evidence for Owner/support reconciliation only; access remains controlled exclusively by the signature-verified captured-payment ledger.


### Refund replay ledger integrity

A verified `refund.processed` event is acknowledged as a duplicate only when the refund record, any matching event record, payment ledger, paid/refunded order and active/revoked entitlement remain mutually consistent. An event record without its atomically-created refund record, a missing order or entitlement, a mismatched identity/amount/currency, or an impossible stored cumulative refund amount remains retryable and fails closed. A duplicate delivery never repairs or rewrites a damaged ledger automatically.

The provider snapshot must agree with its cumulative refund state: `full` requires `amount_refunded` to equal the original payment amount; `partial` requires a smaller positive cumulative amount. Stored cumulative refunds must be an integer between zero and the original amount. A captured payment must still have a paid order and active entitlement; a fully refunded payment must have the full cumulative amount, a refunded order and a revoked entitlement. Older partial events arriving after a full refund cannot restore access.

The CBT Firestore Emulator regression sends a raw-body-HMAC-verified full-refund webhook through the same handler and ledger processor, verifies that the student catalogue no longer reports the test as unlocked, confirms `rmStartExam` denies access, and checks that a replay is acknowledged only against the intact revoked ledger. Partial refunds currently remain recorded without revoking access; that is the present product policy and must be explicitly reviewed before real paid tests launch.
