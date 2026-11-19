# Railway Mitra CBT Cloud

See ARCHITECTURE.md for target architecture, data model, budget guardrails and deployment prerequisites.

## Callable functions
- rmClaimFreeAttempt: claims one free test attempt per authenticated UID. The first successful claim sets `testSeriesConfig/freeTest.hasClaims` in the same Firestore transaction, locking the selected free test so later Owner changes cannot strand existing claimants.
- rmStartExam: creates or resumes a server-timed mock/scheduled attempt. Every resume (including a revoked Owner-manual grant's in-flight attempt) uses the shared active-session fence: authenticated UID, attempt ID, test ID, in-progress status and exact unexpired deadline must agree. A contradictory pointer to a still-live attempt owned by the authenticated student fails closed instead of silently creating a second attempt. An expired attempt can be replaced and a dangling or foreign pointer can be repaired. The one-time free-claim record may repair a stale pointer only when it points to the exact attempt created by that claim; it cannot override a different still-live attempt owned by the same student. For paid tests, the server also verifies the entitlement record's `uid` and `testId` against the authenticated student and requested test; an active status by itself is not sufficient.
- rmSaveAnswer: saves a scalar answer only for the authenticated attempt owner.
- rmSubmitExam: scores using private server-side answer keys and records the result.
- rmGetExamQuestions: returns the authenticated active attempt paper without private answer keys.
- rmGetStudentActiveAttempt: discovers the authenticated student’s active/completed attempt for safe cross-device recovery. It reads the session pointer and attempt in one Firestore transaction; in-progress status and the exact server-issued deadline must match, while a completed pointer must agree with a submitted attempt.
- rmGetCbtAttemptResult: retrieves only the authenticated student’s submitted result.
- rmListAvailableTests: lists published test metadata and access type. Paid-test unlock labels use the same captured-payment, paid-order and entitlement validator as exam start.
- rmGetStudentTestAccess: returns only `{ testId, accessType }` for one published test, using the authenticated student's UID and the same complete payment-ledger validator. The Student Portal uses this bounded lookup after checkout instead of paging through the full catalogue; a checkout callback never grants access.
- rmGetStudentDashboard: returns only the authenticated student’s submitted results.
- rmGetTestLeaderboard: returns anonymized leaderboard entries and the requesting student’s own rank.
- rmGetOwnerAdminSession: checks server-configured OWNER_UID and Firebase second-factor claim.
- rmOwnerListTests: returns the Owner test catalogue plus the currently configured `freeTestId`, allowing the dashboard to preserve the existing selection on refresh.
- rmOwnerSetFreeTest: accepts only a published zero-price test and permits changing the selection only before the first free claim. Legacy claim documents are checked when the lock marker is absent; same-test re-selection remains idempotent.
- rmOwnerSetStudentTestAccess: Owner-only transaction that validates a real Firebase student account and a published test, then writes a per-student/test manual-access status, an append-only audit event, and an idempotency receipt atomically. It requires a bounded support reason and optional future ISO expiry; request-ID reuse with a different operation is rejected. **Current scope:** `rmStartExam` now checks an active Owner manual grant only for a published zero-price test that is not the configured one-time free test. A manual grant never unlocks a paid test and never bypasses the configured free-test claim. Grant expiry is enforced fail-closed. Revoking/expiring a grant prevents a new attempt; an already-started manual-access attempt may resume only until its original server deadline, and is not deleted or extended. Paid tests continue to require the captured payment + paid order + entitlement checks. Owner-only `rmOwnerListStudentTestAccess` and `rmOwnerListStudentAccessAudit` provide bounded, allow-listed pages; Firestore rules deny direct client access to the manual-access, audit and idempotency collections. The Owner dashboard includes an enabled Test Access Management panel in `admin-dashboard.html`, initialized by `admin-dashboard.js` through the isolated `owner-test-access-panel.mjs` module. The panel supports bounded access and audit listing, one-at-a-time UID/test/status or action filters, complimentary grant with a support reason and optional expiry, and revocation of active grants. Server-side Owner UID + phone-MFA authorization remains mandatory; this UI does not grant paid-test access or bypass the configured free-test claim.
- rmOwnerListPaymentReconciliation: Owner-only, read-only paginated view of payment-order requests in `creating` or `unknown` state. The Owner UID + phone-MFA guard runs before any Firestore read; the response is an explicit allow-list and excludes reservation tokens, request fingerprints, phone, email and provider payloads. It returns only a strictly validated server-generated `receiptRef` (not provider credentials or a payment token) so the Owner can search the Razorpay Dashboard when no provider order ID was durably recorded.

## Question image quarantine and sanitization

Owner uploads receive a short-lived signed write URL for the separate
`test-series-question-media-quarantine/` prefix. The finalize callable verifies
the uploaded object size, MIME metadata, generation and original SHA-256, then
uses the pinned Sharp 0.35.5 runtime to fully decode a single-frame JPEG, PNG or
WebP image, apply EXIF orientation, enforce pixel/dimension/channel limits and
re-encode it without copying EXIF/XMP/IPTC metadata.

Only the newly encoded bytes are written with a create-only generation
precondition to `test-series-question-media/`. The server verifies the
published object's size, MIME type, generation and sanitized SHA-256 before it
creates the Firestore `ready` mapping. The raw quarantine object is then
deleted. A failed decode, checksum, storage verification or mapping write
fails closed and removes the associated temporary object.

Firebase Storage rules deny direct client reads and writes to both prefixes.
Student delivery continues to use an attempt-owner-checked callable and a
short-lived signed read URL for the published object only. The header inspector
is a bounded preflight/test helper; it is not the production image-sanitization
boundary.

The isolated Functions package pins Sharp exactly and commits its npm
`package-lock.json`; CI installs optional native platform packages under
Node.js 22 and exercises real JPEG, PNG and WebP decode/re-encode tests.

## CBT section mapping integrity

The Owner save callable validates raw question and configured-section labels before trimming or writing any draft documents. Non-text labels and control characters are rejected even at the beginning or end of a label; the browser draft validator applies the same type/control-character preflight. The server also validates each persisted question paper against its test's section configuration before returning questions, starting a section timer, or saving any answer (including an unsectioned question in a mixed paper). Every non-empty question section must match exactly one canonical configured section name; duplicate configured names (case-insensitive), malformed labels, invalid time limits and orphaned question-section references fail closed with a failed-precondition response. The returned section question counts are derived from the actual question paper rather than trusting stored counters. Unsectioned questions remain valid in tests that do not use sections. This protects the section timer and answer-save boundary even if a stale or manually corrupted Firestore document bypasses the Owner draft validator. The pure mapping rules are covered by tests/section-integrity.test.js, and callable-emulator regressions confirm malformed Owner draft labels are rejected before writes and mismatched persisted sections cannot be read, entered or answered.

## Server-side answer-key integrity

The submission callable reads the published question paper and private answer-key record in the same Firestore transaction used to finalize the attempt. Before scoring, it requires a non-empty paper of at most 500 questions, unique safe question IDs, 2–6 non-empty text options per question, and an exact one-to-one match between paper question IDs and answer-key entries. Each stored correct-answer index must be a canonical decimal string within that question's option range. Missing keys, extra keys, duplicate IDs, malformed options or out-of-range answers fail closed with `failed-precondition`; the attempt remains in progress and no result document is written. Pure boundary tests and callable-emulator regressions cover missing, extra and out-of-range answer-key entries. Private answer keys are never returned by the student question callable.

## Server-side exam scoring integrity

The Owner test-draft validator constrains marks per question to a finite value greater than 0 and at most 100, and negative marks to a finite value from 0 through 100. The submission callable independently revalidates the persisted Firestore values before calculating or writing a result; the Owner form is not treated as a trust boundary. Missing legacy fields retain the existing defaults (1 mark and 0 negative marks). Invalid, non-finite, zero, negative, or out-of-range scoring configuration fails closed with `failed-precondition`, leaving the attempt unsubmitted and creating no result record. Pure boundary tests and a CBT Functions Emulator regression test cover this behavior.

## Owner question bank validation

Single-item saves (`rmOwnerSaveQuestionBankItem`) and bulk imports (`rmOwnerBulkSaveQuestionBank`) share the pure server-side normalizer in `functions/question-bank-validation.js`. The Owner UID + phone-MFA authorization check remains in each callable and runs before validation or Firestore access. The shared contract requires text topic/chapter/folder labels, a non-empty question, 2–6 text options, and an integer `correctIndex` within the option range. Optional section labels are trimmed, limited to 80 characters, and reject control characters while preserving Hindi/Unicode text; blank section labels are omitted. Question text, options and explanations reject non-printing C0 controls and DEL while preserving LF, CR and TAB for normal formatting; Hindi/Unicode content and ordinary letters or digits remain valid. Regression tests cover the rejected control ranges and the allowed formatting characters. Bulk errors include the source row number. This prevents single and bulk imports from silently accepting different question shapes. Regression tests run as part of the isolated Functions test suite; no Firestore schema or published test snapshot is changed by this validation refactor.

## Student browser attempt recovery

The browser's locally stored attempt ID is a recovery hint, not an authorization source. When the result lookup reports the expected `Attempt not found` permission response, the Student exam controller clears that stale local pointer and asks `rmGetStudentActiveAttempt` for the authenticated student's server-owned active/completed attempt. A valid in-progress pointer resumes the server attempt; a completed pointer loads its server result. If no valid server pointer exists, the controller stops and asks the student to press Start again rather than silently creating a replacement attempt during recovery.

Only the explicit `Exam result is not available yet` failed-precondition response is treated as a normal in-progress attempt. Network, unauthenticated, other permission, configuration and unrelated server errors remain visible and do not trigger an automatic submit. The separate closed-exam recovery still submits only after `rmGetExamQuestions` explicitly returns `Exam is closed`. The client classifier has unit coverage, and the CBT Emulator verifies that a stale local attempt ID is denied while the authenticated server pointer still returns the valid attempt.

## Student authentication boundary

Every student callable uses a server-side guard that requires the Firebase ID token claim `firebase.sign_in_provider === "phone"`. A valid Firebase login through email/password, Google, or a custom token is not sufficient for student catalogue, free-claim, CBT, dashboard, leaderboard, or payment-order access. The standalone student portal also checks the restored ID token before revealing the student workspace. Owner access remains separate: the exact server-configured `OWNER_UID`, an allowed primary provider (`google.com` or `password`), and the verified phone MFA second-factor claim are required. The pure auth-policy tests accept only the phone provider and reject password, Google, custom-token and phone-MFA-only claims. The callable emulator harness uses custom-token fixtures only when both `FUNCTIONS_EMULATOR=true` and the explicit emulator-only `TEST_SERIES_ALLOW_CUSTOM_AUTH_FOR_EMULATOR=true` flag are present; email/password-only sessions are still exercised and denied. This fixture exception is not available in production.

## Free-trial selection lifecycle

The Owner may change the configured free test only before the first student claim. The first successful `rmClaimFreeAttempt` writes `hasClaims: true` and `firstClaimAt` to `testSeriesConfig/freeTest` in the same transaction that creates the student's claim and attempt. The Owner selection transaction reads and writes the same config document, so a concurrent first claim and selection change serialize instead of leaving a student with a claim for an obsolete test. Re-selecting the already configured test is idempotent. When the lock marker is absent (older data), the Owner callable checks for an existing legacy claim before allowing a change. The dashboard shows the current selection after each refresh.

## Razorpay payment integration — staging code only, not deployed
- `functions/razorpay-order.js` creates Razorpay Orders through the provider API. It validates credentials, integer paise amount, INR currency, server-generated receipt and the provider response.
- `rmCreatePaymentOrder` derives UID from Firebase Authentication and price/test metadata from a published Firestore test. The client cannot supply amount, currency, UID or provider credentials. It writes the trusted order record under `testSeriesPaymentOrders/{razorpayOrderId}` and returns only the public Key ID plus order details.
- `functions/razorpay-webhook-signature.js` verifies HMAC-SHA256 against the exact raw HTTP body using constant-time comparison.
- `functions/razorpay-webhook-handler.js` handles POST requests, verifies the signature against `req.rawBody`, then parses the event only from those exact signed bytes (never from `req.body`). It requires the provider event ID, routes verified `payment.captured` and `refund.processed` events to their separate ledger processors, acknowledges unsupported event types without grants, and distinguishes permanent conflicts from retryable failures. A regression test supplies a valid signed body alongside a conflicting parsed `req.body` and confirms only the signed payload reaches the ledger.
- Refund webhook ordering is handled conservatively: a verified `refund.processed` event that arrives before its `payment.captured` event has created the application payment ledger returns HTTP 500 (`refund_payment_not_found`) so the provider can retry it. It is not acknowledged as a permanent rejection. Once the capture event commits the payment, paid-order and entitlement records, a retry can atomically record the refund and revoke access for a full refund. The emulator regression test exercises this exact order. Provider retry windows are finite, so production operations must monitor webhook delivery and reconcile any refund that remains undelivered after provider retries; this code does not claim indefinite retry or automatic repair.
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
5. Before deploying the callable code, verify App Check tokens from every real Test Series client entry point on staging. The callable code intentionally sets `enforceAppCheck: true` in deployed environments; the local Functions Emulator bypass is allowed only when Firebase sets `FUNCTIONS_EMULATOR=true`, the runtime project ID begins with `demo-`, and no Cloud Run runtime marker (`K_SERVICE`, `K_REVISION` or `K_CONFIGURATION`) is present. Keep any broader Firestore/Storage enforcement switches off until their client coverage and impact on existing Railway Mitra features have been separately reviewed and approved.

The Owner and Student portals use a dedicated Firebase app instance named `railway-mitra-test-series`. `firebase-app-check-init.js` initializes that app, then initializes App Check, and only afterward creates its Auth and Firestore clients. This ordering ensures the protected callable client starts with App Check available. The Test Series bootstrap carries the same public Firebase config as `assets/js/firebase.js`; a regression test compares all config fields so the isolated copy cannot silently drift. The shared `assets/js/firebase.js` and all unrelated Railway Mitra features remain unchanged. Server callables use one fail-closed policy: App Check is enforced by default and bypassed only when the Firebase Functions Emulator runtime marker (`FUNCTIONS_EMULATOR=true`) and a `GCLOUD_PROJECT` ID beginning with `demo-` are present. The Functions Emulator may also set synthetic `K_SERVICE` and `K_REVISION=1` values for its local function runtime; only that exact pair (with no `K_CONFIGURATION`) is treated as emulator-owned. A deployed Cloud Run revision identifier or any `K_CONFIGURATION` marker keeps App Check enforced. A stray emulator marker in the real `railway-mitra` project therefore cannot disable App Check. The Razorpay webhook is an HTTP provider callback and is authenticated by its raw-body HMAC secret rather than browser App Check. The site key in `app-check.js` is a public web site key, not a private service-account secret. Never put service-account credentials or private keys in browser code.


## Isolated Functions codebase
The root `firebase.json` now declares two codebases:
- `default` → existing `functions/` (left unchanged)
- `test-series` → `features/test-series/cloud/functions/`

After staging configuration and explicit billing approval, deploy only the CBT backend with:

```bash
firebase deploy --only functions:test-series
```

Install the locked dependencies for local validation from `features/test-series/cloud/functions/` with `npm ci --ignore-scripts --no-audit --no-fund --include=optional` under Node.js 22. This reproduces the committed lockfile used by CI. GitHub Actions also checks the isolated codebase configuration and JavaScript syntax. Validation does not deploy anything.

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

A verified `refund.processed` event is acknowledged as a duplicate only when the refund record, its original event record, payment ledger, paid/refunded order and active/revoked entitlement remain mutually consistent. A replay with a new provider event ID re-reads the original event referenced by the refund record and does not create another event document. An event record without its atomically-created refund record, a missing order or entitlement, a mismatched identity/amount/currency, or an impossible stored cumulative refund amount remains retryable and fails closed. A duplicate delivery never repairs or rewrites a damaged ledger automatically. A duplicate refund replay whose signed provider snapshot reports a higher cumulative `amount_refunded` than the committed payment ledger is also retryable and fails closed; it is not acknowledged until the missing cumulative refund state is recorded.

The provider snapshot must identify the underlying payment as captured (`captured: true`) before any refund ledger mutation. For a full refund, Razorpay can report `status: "refunded"` while `captured: true` and `refund_status: "full"` remain present; do not require `status: "captured"` for a full-refund snapshot. Partial-refund snapshots remain `status: "captured"` with `refund_status: "partial"`. Emulator fixtures mirror these distinct provider states. Provider auto-refunds for uncaptured payments, or snapshots missing the captured flag, are rejected and cannot revoke a paid entitlement. This matches Razorpay's documented refund webhook sample, which includes the captured flag: https://d6xcmfyh68wv8.cloudfront.net/docs/webhooks/payloads/refunds/. The snapshot must also agree with its cumulative refund state: `full` requires `amount_refunded` to equal the original payment amount; `partial` requires a smaller positive cumulative amount. Stored cumulative refunds must be an integer between zero and the original amount. A captured payment must still have a paid order and active entitlement; a fully refunded payment must have the full cumulative amount, a refunded order and a revoked entitlement. Older partial events arriving after a full refund cannot restore access.

The CBT Firestore Emulator regression sends a raw-body-HMAC-verified full-refund webhook through the same handler and ledger processor, verifies that the student catalogue no longer reports the test as unlocked, confirms `rmStartExam` denies access, and checks that a replay is acknowledged only against the intact revoked ledger. Partial refunds currently remain recorded without revoking access; that is the present product policy and must be explicitly reviewed before real paid tests launch.

## Paid entitlement cumulative-refund validation

The shared `validatePaidEntitlement` check is used both when the student catalogue labels a paid test as unlocked and inside the transactional `rmStartExam` authorization path. In addition to matching the active entitlement, captured payment and paid order, it validates the payment ledger's cumulative `amountRefunded` field. Older captured-payment records with the field absent are treated as zero for backward compatibility. If present, the value must be a safe integer from zero up to (but not including) the original payment amount. A captured-status record with a full, negative, fractional, non-finite, over-payment or non-numeric refund total is treated as inconsistent and cannot unlock or start a paid test. Legitimate partial refunds continue to retain access under the current product policy; a full refund must be reflected as `status: "refunded"` with a revoked entitlement by the refund ledger. Unit regressions cover legacy records, partial refunds and malformed/full cumulative totals. This validation is a fail-closed consistency check, not a substitute for reconciling provider records before production launch. The CBT emulator suite also seeds a captured-status payment whose cumulative refund equals the original amount and verifies that the student catalogue keeps it locked and `rmStartExam` rejects the attempt.

## Test Series CI token permissions

The automated Test Series Functions validation and CBT Emulator workflows grant the GitHub Actions token only `contents: read`. Their syntax, Owner/student regression and emulator checks do not require repository write access. A regression test in `functions/tests/load-test-workflow-guard.test.js` keeps this least-privilege policy explicit for both workflows.

The separate Firestore and callable load-test workflows remain manual-only and require the explicit `confirm_load_test` input. Do not dispatch either load-test workflow without the user's separate approval; ordinary CBT CI must never invoke a load harness.


## Security-sensitive CI path coverage

The normal CBT Emulator workflow must run for every change to `features/test-series/cloud/firestore.rules`, on both feature-branch pushes and pull requests, because that workflow executes the Firestore Rules Emulator suite. The Functions validation workflow also runs for changes to those rules and to `app-check.js` or `firebase-app-check-init.js`, so security bootstrap and rules changes cannot bypass the routine validation path. A regression test in `functions/tests/load-test-workflow-guard.test.js` asserts these path filters for both events. The shared root `firestore.indexes.json` is intentionally not included in this Test Series-only trigger list because it is shared repository configuration and may change for unrelated Railway Mitra modules.


## Local browser integration testing — emulator-only bootstrap

The Student and Owner portals support an explicit local Firebase Emulator mode for browser integration tests. Serve the repository from a loopback origin and open the portal with the exact query flag `?rmFirebaseEmulator=1`. Production Firebase selection requires HTTPS: non-loopback HTTP origins, `file://`, `about:blank`, and missing or unsupported protocols fail closed before Firebase initialization. Use HTTPS for hosted staging and the explicit loopback flag for local testing; do not open the portal HTML directly as a local file, because local-file pages must never default to the live Railway Mitra project. The flag is accepted only on `localhost`, `127.0.0.1` or the IPv6 loopback address. If the flag is malformed, repeated, or used on any hosted/non-loopback origin, the bootstrap throws before Firebase app initialization; it does not silently fall back to the production project.

Emulator mode uses the demo project ID `demo-railway-mitra-cbt`, connects Auth to `127.0.0.1:9099`, Firestore to `127.0.0.1:8080`, and Functions in `asia-south1` to `127.0.0.1:5001`. It deliberately skips web App Check because the local Functions Emulator uses its isolated emulator-only policy. Auth, Firestore and Functions are connected to their emulators before portal modules can issue requests. No real phone SMS or production OTP is required; use synthetic Auth Emulator verification sessions/codes only.

On a non-loopback hosted origin without the flag, the production bootstrap uses the existing Railway Mitra Firebase config and initializes reCAPTCHA Enterprise App Check before Auth, Firestore and Functions. On `localhost`, `127.0.0.1` or IPv6 loopback, omitting the exact flag now throws before Firebase app initialization instead of falling back to the live project. This fail-closed guard prevents a local developer from accidentally sending a real production OTP or writing to live data when the emulator flag is forgotten. Use only `?rmFirebaseEmulator=1` for local browser integration tests. This mode is local test infrastructure only; it does not deploy, change Firebase Console settings, or alter live App Check enforcement.

## Leaderboard scaling and ranking contract

`rmGetTestLeaderboard` no longer loads a capped 1,000-result sample into memory. It uses a Firestore aggregate count for the submitted-result count, an indexed descending-score/ascending-submission-time query for the top 20 attempts, and a separate indexed `limit(1)` query for the requesting student's best attempt. It then uses a second aggregate count for the number of scores strictly above that best score. The personal-best lookup reads at most one result document regardless of how many attempts the student has submitted. Tied scores share competition rank.

For compatibility, `participantCount` counts submitted result documents (attempts), not distinct student UIDs, and the public top-20 list remains attempt-based; a student with multiple attempts may appear more than once. Public rows expose only rank, score and an anonymous candidate label.

The top-20 query requires `testSeriesResults(testId ASC, score DESC, submittedAt ASC)`; the bounded personal-best query requires `testSeriesResults(testId ASC, uid ASC, score DESC, submittedAt ASC)`. Both are additive composite indexes in the root `firestore.indexes.json`. The CBT emulator suite seeds more than 1,000 results and verifies the exact count, best-attempt rank, top-20 scores, tie ranking and UID/attempt-ID privacy. This is an emulator regression, not a production load test.


## Delayed capture webhook after a full refund

A signed `payment.captured` webhook may be redelivered after the corresponding full-refund webhook has already committed. The capture ledger treats this only as a no-op duplicate when the payment is consistently `status: refunded` with `amountRefunded === amount`, the order is `refunded`, and the matching entitlement is `revoked`. The original capture event ID and a new provider event ID are both acknowledged without creating a new event ledger entry or restoring access. Captured payments with valid partial-refund totals still require a `paid` order and `active` entitlement. Any identity, amount, currency, status or entitlement mismatch remains fail-closed for reconciliation. The CBT emulator webhook-ordering regression covers both same-event and new-event capture redelivery after full refund.

## Student question payload integrity

`rmGetExamQuestions` now uses a dedicated server-side projection before returning a question paper to a student. The projection validates a non-empty paper of at most 500 questions, unique safe question IDs, non-empty text, and 2–6 non-empty text options per question. Option entries must be strings; object-valued options are rejected rather than forwarded, because nested option objects could carry answer flags or other private metadata. The response contains only `id`, `text`, `options` and the optional validated `section`; fields such as `correctIndex`, `correctAnswer`, `explanation`, Owner notes and tags remain server-side. Invalid persisted paper data fails closed with `failed-precondition` instead of returning a partial or potentially sensitive payload.

Pure unit tests cover allowlist projection, private-field omission, nested option rejection, duplicate/invalid IDs and malformed paper shapes. The CBT Functions Emulator regression also seeds an object-valued option containing answer metadata and verifies that the student callable rejects the paper. These checks do not modify the question bank, published paper, answer-key ledger or Firestore schema.


### Student question delivery regression contract

The Owner/editor regression test checks that `rmGetExamQuestions` delegates to `projectStudentQuestions(questions)` and returns that validated projection. Keep the allowlist in the dedicated `student-question-delivery.js` module; do not reintroduce an inline `questions.map(...)` response projection in the callable. This keeps the callable integration test aligned with the single validation boundary and prevents future refactors from bypassing the answer-key/private-field filter.

## Student saved-answer projection integrity

When `rmGetExamQuestions` resumes an attempt, it no longer returns the stored `attempt.answers` map directly. The dedicated `projectStudentSavedAnswers` boundary revalidates the current question paper, accepts only canonical decimal option indexes within each question's option range, and requires every stored answer key to belong to that paper. Unknown keys, non-string values, non-canonical indexes and out-of-range indexes fail closed with `failed-precondition` rather than being reflected into the browser response. Missing legacy answer maps are treated as empty. The projection uses safe own data properties for question IDs, including prototype-sensitive names. Pure unit tests and a callable Functions Emulator regression cover valid resume data, malformed/private extra fields and prototype-sensitive keys. The Firestore schema and answer-save contract are unchanged.


## Canonical answer-save integrity

The rmSaveAnswer callable uses the same pure validator as saved-answer projection. It accepts only canonical decimal strings such as 0 or 2 that identify an existing option in the current question. It rejects leading-zero aliases (00, 01), numeric JSON values, booleans, null, negative/fractional values and indexes outside the option list before writing to the attempt. This keeps the answer-save contract aligned with resume projection so an answer accepted during the exam cannot make the next resume fail closed. Pure unit tests and a callable Functions Emulator regression cover the canonical format and verify rejected values do not mutate the saved-answer map.


## Prototype-safe private answer-key fields

Question IDs such as "__proto__" are valid under the existing identifier contract. Owner draft creation now defines answer-key entries as own enumerable data properties rather than assigning through JavaScript's special prototype setter. Scoring also requires each answer-key entry to be an own property; inherited values can never satisfy a question's private key. This preserves the existing Firestore document shape and does not expose answer keys to students. Unit tests cover "__proto__", "constructor", inherited entries and malformed indexes; the CBT Functions Emulator regression exercises save, resume and server-side scoring with a "__proto__" question ID.

## Prototype-safe Firestore answer-map keys

The attempt document retains its `answers` map. Only JavaScript prototype-sensitive question IDs (for example `__proto__`, `constructor` and `toString`) are encoded for Firestore storage as `q:` plus canonical base64url UTF-8 bytes. Ordinary question IDs remain unchanged. The `q:` prefix contains a colon, which is excluded by the question-ID validation pattern, so an encoded key cannot be mistaken for a valid raw question ID.

The storage-key decoder accepts only canonical encodings of the explicitly listed prototype-sensitive IDs. A previous prefix made only from underscores and letters could collide with a legitimate raw question ID; the reserved `q:` namespace removes that ambiguity. Student resume and server-side scoring decode the stored keys back to the original question IDs, and the callable response contract remains unchanged.

The CBT Functions Emulator regression saves, resumes and scores `__proto__`, `constructor` and `toString`. A pure unit regression also uses the former-prefix string as a valid raw question ID beside `__proto__` and verifies both answers remain distinct. No collection or top-level Firestore field was added.


## Prototype-safe answer scoring

Before a result is calculated, `rmSubmitExam` now projects the persisted answer map through `projectStudentSavedAnswers` against the current question paper. Only canonical option-index strings stored as own answer properties are eligible for scoring. Inherited object members such as `constructor`, `toString` or `__proto__` are never interpreted as student responses; a missing own answer is counted as unattempted. Unknown question IDs and malformed or out-of-range stored answers fail closed before a result is written. The CBT Functions Emulator regression submits a second attempt with an empty answer map for prototype-sensitive question IDs and verifies zero correct, zero wrong, all questions unattempted and a zero score.


## Owner access cursor validation

The Owner manual-access and access-audit callables reject cursors whose ordering timestamp is missing, malformed, or non-finite. Timestamp inspection is fail-closed even when an in-memory timestamp-like object's `toMillis` accessor or method throws. Native `Date` values are read through `Date.prototype.getTime`, so an overridden instance property cannot turn a valid date into an unexpected callable error. Invalid cursor timestamps are reported as invalid cursors before Firestore pagination continues.


## Collision-free paid entitlement document IDs

Paid entitlements use the deterministic key `testSeriesEntitlements/{uidLength:uid:testId}`. The UID length marks the exact boundary between the validated identity segments, so pairs such as `(student_a, test)` and `(student, a_test)` cannot collide. Payment capture, exam access, catalogue access and refund reconciliation must all use the shared `paidEntitlementDocumentId(uid, testId)` helper; do not recreate the key with underscore concatenation.

This changes the pre-launch document key from the legacy `{uid_testId}` format. Before any production deployment, inspect existing entitlement documents and migrate them using their stored `uid` and `testId` fields. Detect legacy ID collisions and reconcile them explicitly; do not blindly copy or merge conflicting grants. No live Firebase data was read or modified for this branch-only change.


### Payment request identity segment validation

Payment request and student-test lock IDs are SHA-256 hashes of NUL-delimited identity tuples. The shared helper now accepts only canonical ASCII UID and test-ID segments matching `[A-Za-z0-9_-]{1,128}` before hashing. This prevents an embedded delimiter or path separator from making two different identity tuples ambiguous, and keeps direct helper use aligned with the callable's identifier validation. Invalid segments and malformed request-lock hashes fail closed before reservation decisions. Keep this contract aligned with the server's `id()` guard; do not weaken it to whitespace-only checks.


### Razorpay webhook body ceiling

The isolated Razorpay webhook handler rejects a raw request body larger than 1 MiB with HTTP 413 before HMAC verification or JSON parsing. The limit bounds application-level signature and parsing work; it does not replace an ingress/request-size limit because the hosting platform may already have buffered the request before the handler runs. Keep the ceiling above normal provider event payloads, and change it only with a matching boundary regression test. Signature verification continues to use the exact `req.rawBody` bytes.


### Razorpay webhook payload-limit boundary regression

The 1 MiB application limit is inclusive: a raw body of exactly 1,048,576 bytes may proceed to HMAC verification and normal event handling, while any larger Buffer is rejected with HTTP 413 before signature-header lookup. The exact-boundary regression signs a valid capture event padded only with JSON whitespace, verifies the original event reaches the payment processor, and complements the existing one-byte-over-limit rejection test. Keep both sides of this boundary covered if the limit changes.

### Razorpay refund payment-state consistency

A processed refund webhook must carry a captured payment snapshot whose top-level payment status agrees with its cumulative refund state: `refund_status: partial` requires `status: captured` and `refund_status: full` requires `status: refunded`. The cumulative `amount_refunded` must remain below the payment amount for partial refunds and equal it for full refunds. Contradictory snapshots fail closed before any refund/event ledger write or entitlement change. This follows Razorpay's documented payment-state contract: a payment remains captured while only partially refunded and moves to refunded only after the full amount is refunded. The unit regression covers both contradictory directions and verifies that payment and entitlement records remain unchanged.

## GDCE JE Civil 150-question / 120-minute lifecycle regression

The CBT Functions Emulator suite includes a synthetic paid-test fixture for the specified GDCE JE Civil format. It seeds 150 unique questions and matching private answer keys, a captured-payment/order/active-entitlement triplet, and a 120-minute mock exam.

The callable flow verifies the server-issued two-hour deadline, student-safe delivery of all 150 questions without answer-key fields, two saved answers, resume of the same attempt without extending its deadline, and server-side submission with one correct, one wrong and 148 unanswered answers. With 1 mark per correct answer and 1/3 negative marking, the expected score is 2/3. Synthetic Auth, payment, entitlement, attempt and result records are deleted by the fixture.

This is a single-student local Emulator integration test. It is not a concurrency/load test, a live Razorpay payment, production OTP verification, or production-capacity certification.


### Emulator-only student custom-auth fixture hardening

The student callable guard accepts the normal Firebase phone provider in deployed environments. Its custom-token exception for synthetic tests requires **all** of the following: `FUNCTIONS_EMULATOR=true`, the explicit `TEST_SERIES_ALLOW_CUSTOM_AUTH_FOR_EMULATOR=true` test flag, a `demo-*` project ID, and the same isolated Functions Emulator runtime signature used by the App Check policy. The exact emulator-generated `K_SERVICE` plus `K_REVISION=1` marker pair is allowed only without `K_CONFIGURATION`; deployed Cloud Run service, revision or configuration markers disable the exception. Merely setting the two environment flags in a real Firebase project is not sufficient to authorize a custom-token student. Regression tests cover the real-project, missing-flag and deployed-runtime cases. This does not enable or relax deployed App Check enforcement.

### CI emulator identity and synthetic student authentication

The Functions-validation workflow follows the same emulator-only identity contract as the dedicated CBT emulator workflow: its `GCLOUD_PROJECT` and all Auth/Firestore/Functions/Storage emulator commands use `demo-railway-mitra-cbt`. The authenticated CBT test step supplies a synthetic `OWNER_UID` and the explicit `TEST_SERIES_ALLOW_CUSTOM_AUTH_FOR_EMULATOR=true` opt-in required by the custom-token fixture.

Do not replace the demo project ID with a real Firebase project ID or copy the custom-auth opt-in into a deployed environment. The exception is restricted by the server-side student guard to the isolated Functions Emulator runtime; deployed Student access continues to require Firebase phone-provider sign-in.

### Owner question-bank explanation size contract

Owner single-item saves and bulk imports share the same question-bank validator. An explanation may contain at most 4,000 characters; exactly 4,000 is accepted and 4,001 is rejected with an invalid-argument error. Oversized explanations are not silently truncated, so the Owner UI cannot report a successful save after losing part of the supplied content. The Auth + Functions Emulator regression verifies that an accepted boundary value persists and a rejected update leaves the previous question unchanged.

## Persisted student option-array integrity

Student question delivery and answer-save validation share the same option validator. Every question must contain 2–6 dense array entries, and every option must be an own indexed, non-empty string of at most 1,000 characters. Sparse array slots, object-valued options, empty strings and oversized option text fail closed. This is a second defensive boundary for persisted Firestore data: a malformed paper cannot be projected to the student, and a direct callable answer-save request cannot select an invalid option index. Unit tests cover sparse question/option arrays; the Functions Emulator regression verifies that a nested object option is neither delivered nor answerable and that no answer is persisted.


### Active-session binding for signed question media

Before issuing a signed question-image read URL, `rmGetQuestionMediaUrl`
now verifies the server-owned `testSeriesActiveSessions/{uid}` pointer against
the requested attempt. The UID, attempt ID, test ID, in-progress state and
original expiry timestamp must all match the authenticated student's active
session. Missing, stale, switched, expired or inconsistent pointers fail
closed before Storage metadata is read or a new signed URL is issued.

This prevents an older still-unexpired attempt from obtaining fresh image URLs
after the student has moved to a different active exam. A signed URL issued
before the switch remains a short-lived bearer URL until its existing 60-second
expiry; changing the active-session pointer does not revoke an already-issued
URL. The CBT Functions Emulator regression seeds two synthetic attempts and
confirms that the stale attempt cannot obtain a new media URL. No live bucket
or production account is used.


## Active-session fence for student question delivery

Both `rmGetExamQuestions` and `rmGetQuestionMediaUrl` require the requested
attempt to match the authenticated student's server-owned
`testSeriesActiveSessions/{uid}` record. UID, attempt ID, test ID, in-progress
status and the original expiry timestamp must match; both deadlines must still
be in the future. A stale but unexpired attempt cannot fetch a new question
paper or request new image URLs after another exam becomes active.

The shared pure validator is covered by unit tests for switched attempt IDs,
cross-student/test pointers, invalid status and deadline mismatches. The CBT
Functions Emulator regression starts with two synthetic in-progress attempts,
points the active-session record at the newer attempt, confirms the older
attempt is rejected, and confirms the current attempt still receives its
student-safe paper. The submit callable remains separate: it may finalize a
timed-out attempt from already-persisted answers without replacing a newer
active-session pointer. No production data or SMS is used.


## Active-session fence for answer writes and section entry

The student callables `rmSaveAnswer` and `rmEnterCbtSection` read the
server-owned `testSeriesActiveSessions/{uid}` pointer inside the same
Firestore transaction that validates and updates the attempt. The pointer must
match the authenticated UID, attempt ID, test ID, in-progress status and exact
original expiry timestamp; both attempt and pointer deadlines must still be
in the future. A stale but unexpired attempt cannot save an answer or start /
resume a timed section after another attempt becomes active.

Because the active-session document is part of the transaction read set, a
concurrent pointer switch causes Firestore to retry the transaction rather
than committing an answer or section timer against a stale session. The CBT
Functions Emulator regression creates two synthetic attempts, points the
active-session record at the newer one, verifies that the stale attempt cannot
save or enter a section, and verifies that the current attempt can enter its
section and save an answer. The submit callable remains separate so a timed-out
attempt can still be finalized from answers already persisted before expiry.
No production data, OTP, or live Firebase resource is used.

## Question-media static regression and active-session contract

The source-level regression for `rmGetQuestionMediaUrl` verifies that the callable
reads `testSeriesActiveSessions/{uid}` and delegates the UID, attempt, test, status
and exact-expiry checks to the shared `isActiveAttemptSession` validator. It does
not require a duplicate inline `date(attempt.expiresAt)` comparison: expiry policy
belongs to the shared helper and is covered by its unit tests. The Functions
Emulator regression separately verifies that a stale attempt cannot obtain a new
signed question-media URL. Keep the static source guard aligned with the shared
validator so future refactors do not reintroduce a second, divergent session rule.


## Snapshot-consistent student question reads

`rmGetExamQuestions` and `rmGetQuestionMediaUrl` read the attempt, the
student's active-session pointer, and the Firestore-backed paper metadata
inside one Firestore transaction. The media callable also reads its ready
media mapping in that same transaction. This prevents separate document reads
from observing a mixed state when an attempt pointer or question metadata
changes between reads.

Authorization is evaluated against the transaction snapshot. A response
already returned to a client cannot be recalled; signed question-image URLs
remain short-lived (60 seconds) and are not retroactively revoked when the
student's active attempt changes.

## Refund entitlement Firestore Emulator regressions

The isolated CBT Functions Emulator suite exercises the refund ledger against the real Firestore Emulator transaction engine using synthetic payment, order, entitlement, refund and event documents. It verifies that concurrent partial-refund deliveries preserve the highest cumulative `amountRefunded` snapshot instead of allowing a retried older transaction to regress it, while keeping the paid order and entitlement active. A separate out-of-order scenario applies a provider full-refund snapshot before an earlier partial-refund webhook arrives; the delayed event and its replay must leave the payment and order refunded and the entitlement revoked. The fixtures are deleted after each test. These tests do not contact Razorpay, use production credentials, or certify provider-side webhook delivery.

### Refund webhook retry behavior

A verified `refund.processed` webhook that cannot be reconciled with the stored payment, order, refund and entitlement records must remain retryable (HTTP 500) rather than being acknowledged as a permanent rejection. This allows provider retries after a transient ordering gap or after an operator repairs a ledger inconsistency. Permanent identity and field conflicts remain acknowledged as rejected according to the webhook handler's explicit permanent-error allowlist. The handler regression uses a synthetic, internally consistent full-refund payload and verifies that `refund_ledger_inconsistent` is not silently acknowledged. No provider request or live payment is made.


## Snapshot-consistent active-attempt recovery

The student recovery callable reads `testSeriesActiveSessions/{uid}` and its referenced attempt in one read-only Firestore transaction. This prevents a session switch between separate reads from returning an obsolete attempt ID to a re-entering browser.

An in-progress attempt is returned only when the active pointer matches the authenticated UID, attempt ID, test ID, in-progress status and exact unexpired server deadline. A submitted attempt is returned as completed only when the pointer is also marked completed. Missing, malformed, stale or contradictory pointers return `found: false`; they do not authorize exam access. The CBT Emulator regression covers mismatched session status and deadline, and the existing lifecycle regression verifies normal in-progress recovery and completed-result recovery.

## Snapshot-consistent single-test access

`rmGetStudentTestAccess` reads the published test, configured free-trial
selection, entitlement, captured payment and paid order in one Firestore
read-only transaction. The shared `getStudentTestAccessType` helper reuses a
caller-owned transaction; catalogue lookups without one open their own
read-only transaction for the payment ledger. This prevents a single response
from combining records observed on opposite sides of an atomic refund update.

The access response remains a point-in-time UI hint, not the final authorization
to start an exam. A refund may commit after the snapshot is read, so
`rmStartExam` must continue to revalidate the complete payment ledger in its
own write transaction before creating or resuming an attempt. A Firestore
Emulator regression commits a synthetic full refund between the entitlement
read and payment/order reads: the in-flight snapshot sees the coherent
pre-refund grant, while the next callable lookup sees the revoked grant. No
Razorpay request, production credential or live Firebase resource is used.

## Student catalogue request lifecycle

The student catalogue checks its authenticated view/session fence before starting a page request and after the request settles. If the student signs out, switches accounts, or navigates away while the catalogue request is pending, both successful and failed responses are discarded. A stale request cannot replace the current view's status message or re-enable an obsolete Load More control. Session-guard exceptions are treated as inactive (fail closed). This protects UI state only; all test access and payment authorization remain server-enforced by the callable and `rmStartExam` transaction.


## Owner test section configuration save integrity

The Owner test-save callable distinguishes an omitted `sections` field (which permits question section labels to be derived with the default zero-minute section limit) from an explicitly supplied malformed value. A supplied section configuration must be an array. Every configured section must contain at least one question in the same draft; otherwise the entire save is rejected before Firestore writes. The Owner Admin preflight enforces the same rule, so a section time limit cannot be silently discarded because its section is empty or the configuration has the wrong shape. The Auth + Functions Emulator regression verifies malformed and unused section configurations leave all three draft documents (metadata, question set and private answer key) absent, while a valid populated section preserves its canonical name, question count and time limit. This does not change published tests or student answer/scoring behavior.


## Server clock anchor for student exam timing

`rmGetExamQuestions` returns a server-generated ISO `serverNow` timestamp with the attempt's overall expiry and persisted section deadlines. The Student exam controller uses this anchor with a monotonic browser clock so a device wall-clock change cannot prematurely trigger the local overall timeout or lock a section early. Missing/invalid anchors fail the client exam initialization rather than silently falling back to device time. This is display/reliability protection only: `rmSaveAnswer`, `rmEnterCbtSection` and `rmSubmitExam` continue to enforce deadlines using server time. A client timer is never an authorization boundary.

### Razorpay order-creation request timeout

The isolated Razorpay order client applies a 15-second AbortSignal timeout to the outbound provider order request. The timeout is bounded to a positive integer no greater than 60 seconds when overridden by a caller; the production callable uses the 15-second default. This prevents a stalled provider connection from occupying the callable indefinitely.

A timeout is an **ambiguous provider outcome**, not a definite HTTP rejection: Razorpay may have created the order before the client stopped waiting. The same fail-closed classification applies to HTTP 408, 409 and 425 responses, every 5xx response, an unreadable/missing HTTP status, malformed response bodies, and network failures. Only an explicit 4xx response other than 408, 409 or 425 is treated as a definite provider rejection; this includes 429 rate limiting. Definite rejections may be retried with a new request ID, while ambiguous outcomes are recorded as unknown and retain the student/test payment lock. The callable must not issue a fresh provider order or release that lock automatically for an ambiguous outcome. Owner/support must reconcile the saved receipt with the Razorpay Dashboard before a safe retry is allowed. This classification does not verify a payment, alter webhook handling, or grant an entitlement. Focused unit tests cover the HTTP status classes as well as timeout-signal propagation and invalid timeout bounds; no provider credentials or live request are used.

## Submission guard for superseded attempts

`rmSubmitExam` accepts an in-progress attempt only when it is still the student's active session. If another exam has replaced its active-session pointer while the old attempt's original deadline is still in the future, submission fails with `failed-precondition` and does not score or finalize that stale attempt. A timed-out older attempt may still be finalized from answers already persisted by `rmSaveAnswer`; that late result never overwrites the newer active-session pointer. Repeated submission of an already-submitted attempt continues to return its original result. The CBT Emulator suite covers both rejection of a still-live superseded attempt and safe late finalization after expiry.
