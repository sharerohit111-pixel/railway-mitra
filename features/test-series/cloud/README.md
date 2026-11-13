# Railway Mitra CBT Cloud

See ARCHITECTURE.md for target architecture, data model, budget guardrails and deployment prerequisites.

## Callable functions
- rmClaimFreeAttempt: claims one free test attempt per authenticated UID.
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

## Razorpay payment integration — staging code only, not deployed
- `functions/razorpay-order.js` creates Razorpay Orders through the provider API. It validates credentials, integer paise amount, INR currency, server-generated receipt and the provider response.
- `rmCreatePaymentOrder` derives UID from Firebase Authentication and price/test metadata from a published Firestore test. The client cannot supply amount, currency, UID or provider credentials. It writes the trusted order record under `testSeriesPaymentOrders/{razorpayOrderId}` and returns only the public Key ID plus order details.
- `functions/razorpay-webhook-signature.js` verifies HMAC-SHA256 against the exact raw HTTP body using constant-time comparison.
- `functions/razorpay-webhook-handler.js` handles POST requests, verifies signature before JSON processing/ledger access, requires the provider event ID, acknowledges non-capture events, and distinguishes permanent conflicts from retryable failures.
- `rmRazorpayWebhook` is the HTTP endpoint that invokes the isolated handler.
- `functions/payment-validation.js` accepts only a captured payment that exactly matches the trusted server-created order's provider order ID, amount and currency. UID/test ID are sourced only from that order; client-supplied payment notes are ignored.
- `functions/payment-ledger.js` atomically records a validated capture, marks the server order paid, stores provider event/payment records, and creates the matching student entitlement in one Firestore transaction. Repeated event IDs and payment IDs are checked against the complete original ledger before being acknowledged.
- Unit tests cover provider order requests, raw-body signatures, HTTP webhook responses/retries, and payment ledger emulator flows. GitHub Actions validate the isolated Functions syntax and run CBT/GDCE regression tests.
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
1. Confirm the Firebase Console App Check app entry shows **Railway Mitra Web — Registered** with Fraud Defense.
2. Deploy this branch to a staging URL or merge it only after review; GitHub Pages on the default branch will not serve branch-only changes automatically.
3. Open `features/test-series/cloud/app-check-test.html` on one of the registered/authorized domains and tap **App Check जाँचें**.
4. A success message means the client obtained an App Check token. It does not mean callable functions are deployed or that enforcement is enabled.
5. Keep App Check enforcement OFF until the app has been tested on Android/PWA and every Firebase client entry point is confirmed to initialize App Check.

App Check is initialized only by `firebase-app-check-init.js` inside the isolated CBT module; the existing `assets/js/firebase.js` is intentionally unchanged to avoid disturbing other app features. The site key in `app-check.js` is a public web site key, not a private service-account secret. Never put service-account credentials or private keys in browser code.


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
