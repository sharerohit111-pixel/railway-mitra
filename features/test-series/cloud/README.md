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

## Student authentication boundary

Every student callable uses a server-side guard that requires the Firebase ID token claim `firebase.sign_in_provider === "phone"`. A valid Firebase login through email/password, Google, or a custom token is not sufficient for student catalogue, free-claim, CBT, dashboard, leaderboard, or payment-order access. The standalone student portal also checks the restored ID token before revealing the student workspace. Owner access remains separate: the exact server-configured `OWNER_UID` plus the verified phone MFA second-factor claim is required. The pure auth-policy tests accept only the phone provider and reject password, Google, custom-token and phone-MFA-only claims. The callable emulator harness uses custom-token fixtures only when both `FUNCTIONS_EMULATOR=true` and the explicit emulator-only `TEST_SERIES_ALLOW_CUSTOM_AUTH_FOR_EMULATOR=true` flag are present; email/password-only sessions are still exercised and denied. This fixture exception is not available in production.

## Free-trial selection lifecycle

The Owner may change the configured free test only before the first student claim. The first successful `rmClaimFreeAttempt` writes `hasClaims: true` and `firstClaimAt` to `testSeriesConfig/freeTest` in the same transaction that creates the student's claim and attempt. The Owner selection transaction reads and writes the same config document, so a concurrent first claim and selection change serialize instead of leaving a student with a claim for an obsolete test. Re-selecting the already configured test is idempotent. When the lock marker is absent (older data), the Owner callable checks for an existing legacy claim before allowing a change. The dashboard shows the current selection after each refresh.

## Razorpay payment integration — staging code only, not deployed
- `functions/razorpay-order.js` creates Razorpay Orders through the provider API. It validates credentials, integer paise amount, INR currency, server-generated receipt and the provider response.
- `rmCreatePaymentOrder` derives UID from Firebase Authentication and price/test metadata from a published Firestore test. The client cannot supply amount, currency, UID or provider credentials. It writes the trusted order record under `testSeriesPaymentOrders/{razorpayOrderId}` and returns only the public Key ID plus order details.
- `functions/razorpay-webhook-signature.js` verifies HMAC-SHA256 against the exact raw HTTP body using constant-time comparison.
- `functions/razorpay-webhook-handler.js` handles POST requests, verifies the signature against `req.rawBody`, then parses the event only from those exact signed bytes (never from `req.body`). It requires the provider event ID, acknowledges non-capture events, and distinguishes permanent conflicts from retryable failures. A regression test supplies a valid signed body alongside a conflicting parsed `req.body` and confirms only the signed payload reaches the ledger.
- `rmRazorpayWebhook` is the HTTP endpoint that invokes the isolated handler.
- `functions/payment-validation.js` accepts only a captured payment that exactly matches the trusted server-created order's provider order ID, amount and currency. UID/test ID are sourced only from that order; client-supplied payment notes are ignored.
- `functions/payment-ledger.js` atomically records a validated capture, marks the server order paid, stores provider event/payment records, and creates the matching student entitlement in one Firestore transaction. Repeated event IDs and payment IDs are checked against the complete original ledger before being acknowledged. When a previously recorded payment arrives with a new provider event ID, the existing entitlement must also match the authoritative UID, test ID, payment ID, order ID, amount and currency; an incomplete or drifted grant is rejected and left retryable rather than acknowledged as a successful duplicate.
- Unit tests cover provider order requests, raw-body signatures, HTTP webhook responses/retries, and payment ledger emulator flows. GitHub Actions validate the isolated Functions syntax and run CBT/GDCE regression tests.
- Owner payment-history emulator fixtures use a dedicated `testSeriesPaymentHistoryFixtures` collection; they must never seed or clear the live-shaped `testSeriesPayments` ledger collection. This keeps the pagination/privacy test deterministic and isolated from payment-ledger scenarios.
- These endpoints are code-only until separately configured and deployed. Paid tests must remain unavailable to real students until the secrets, provider dashboard webhook, client checkout flow, staging end-to-end test and operational refund/support process are configured and approved.

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
