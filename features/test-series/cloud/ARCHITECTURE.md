# Railway Mitra CBT — Cloud Architecture

## Target
1,000 registered students; design and load-test for 500 simultaneous examinees. Login: mobile number + OTP only. Supports mock and scheduled exams.

## Firebase project status
The branch contains `firebase.json` with separate `default` and `test-series` Functions codebases, and `firebase-app-check-init.js` contains the public web configuration for Firebase project `railway-mitra`. This public client configuration is not a service-account credential or proof that the deployed services are ready. A `.firebaserc` deployment target, verified Console settings, deployed Functions/rules, production `OWNER_UID`, and Razorpay secrets are not established by the source tree. Confirm the intended existing project and its current live configuration in Firebase Console before any deployment; do not create a duplicate project.

## Services
- Firebase Authentication: phone-provider sign-in is required for deployed student callables; Firebase UID is the stable student identity. Owner access uses a separate protected sign-in flow with server-verified phone second factor.
- Cloud Firestore: test metadata, private answer keys, attempts, answer records, payment ledgers, entitlements and results; browser clients are denied direct access to protected collections by the isolated rules.
- Cloud Functions v2 in `asia-south1`: exam lifecycle, scoring, question delivery, Owner administration and Razorpay order/webhook handlers are implemented in the isolated codebase.
- Cloud Storage: private question-media quarantine and published media prefixes are implemented with server-side sanitization and signed student delivery.
- App Check: client bootstrap and fail-closed callable enforcement are implemented in source. Provider registration, real-origin token verification and staging validation remain release gates.
- Razorpay: server-side order creation, checkout-signature verification, captured-payment webhook ledger and refund handling are implemented in source. Razorpay Test Mode end-to-end verification and operational reconciliation remain outstanding.
- Owner dashboard: separate protected module includes test/question management, student activity, payment inspection/reconciliation, result analytics and complimentary-test access management. `OWNER_UID` must be configured securely in the backend environment.

## Data model
- testSeriesTests/{testId}: title, status, mode ('mock'|'scheduled'), durationMinutes, scheduleStartAt, scheduleEndAt, price, marksPerQuestion, negativeMarks.
- testSeriesAnswerKeys/{testId}: private questions map keyed by questionId; never client-readable.
- testSeriesAttempts/{attemptId}: uid, testId, status, startedAt, expiresAt, answers map, score summary.
- testSeriesActiveSessions/{uid}: active attempt pointer.
- testSeriesResults/{attemptId}: final score summary.
- testSeriesEntitlements/{uidLength:uid:testId}: server-created paid entitlement containing `uid`, `testId` and `status`; `rmStartExam` checks both identity fields against the authenticated student and requested test before granting access. A future payment webhook must create this record only after provider signature verification and idempotency checks.
- testSeriesPaymentOrders/{razorpayOrderId}: trusted server-created order with `uid`, `testId`, amount in minor units, currency and status (`created` → `paid`).
- testSeriesPayments/{paymentId}: unique captured-payment ledger record bound to one order, student and test.
- testSeriesPaymentEvents/{eventId}: provider event audit record; duplicate deliveries are recorded as duplicates without granting another entitlement.
- testSeriesFreeAttempts/{uid}: one-time free attempt claim.
- testSeriesConfig/freeTest: enabled, testId, and a `hasClaims` lock marker set atomically with the first successful claim; `firstClaimAt` records when the lock was first established. Owner changes are blocked after a claim exists, while selecting the same test again is idempotent.

## Free-trial selection consistency

The configured free test is mutable only before the first student claim. `rmClaimFreeAttempt` writes the claim, initial attempt, and `testSeriesConfig/freeTest.hasClaims` marker in one Firestore transaction. Later claims read the lock without rewriting the shared config or moving `firstClaimAt`. `rmOwnerSetFreeTest` reads and writes that same config document, serializing a concurrent first claim against a selection change. If a legacy config has no marker, the Owner callable checks for existing claim documents before permitting a change. Re-selecting the current test is safe and idempotent; changing it after a claim is rejected to prevent already-claimed students from being stranded.

## Owner payment-reconciliation pagination stability

Payment request reservations set `createdAt` once when the reservation is created. The Owner reconciliation queue orders by this immutable field and uses the document snapshot as its continuation cursor. It must not order by mutable `updatedAt`: a provider response, support update or status transition can change that timestamp after page one and move an unresolved request ahead of the cursor, causing it to be skipped on a later page. The API still returns `updatedAt` for display, but it is not part of pagination order. The 500-document bounded scan advances its cursor to the last scanned document when the window is full, including windows with no visible unresolved rows. Any imported legacy payment-request records must have a valid immutable `createdAt` before they are included in this queue; do not perform a production backfill without a reviewed migration and approval.

## Razorpay signature verification boundary

The isolated Functions package now includes two server-side HMAC verification helpers in `functions/razorpay-signature.js`:

- Checkout response: verify HMAC-SHA256 over the exact `order_id|payment_id` string with the Razorpay API key secret.
- Webhook: verify HMAC-SHA256 over the exact raw HTTP request bytes with the separately configured webhook secret. Never reconstruct the signed body with `JSON.stringify(req.body)`.
- Both helpers reject malformed 64-character hexadecimal signatures and compare digest bytes with Node's constant-time `timingSafeEqual`.

Deterministic tests use emulator-only dummy secrets and cover valid signatures, altered payloads/identifiers, malformed signatures and missing inputs. The separate `functions/payment-validation.js` guard accepts only a `payment.captured` event whose captured payment ID, provider order ID, amount and currency exactly match a trusted server-created order record in `created` state. The UID and test ID returned by the guard come only from that server order; payment notes and other client-controlled metadata are ignored. The new `functions/payment-ledger.js` helper re-reads the trusted order inside a Firestore transaction, then atomically creates the unique payment record, provider event record and entitlement while moving the order to `paid`. Repeated deliveries with the same event ID are no-ops only after the transaction rechecks the paid order, captured-payment record, event identity fields and active entitlement against the verified payment. A missing payment/order record, missing entitlement, mismatched owner/test/amount/currency, or altered event identity is rejected as an inconsistent ledger instead of being silently accepted. A repeated payment under a different event ID is also a no-op only when the original paid order and entitlement all match. Reuse of an event or payment ID for different data, a pre-existing entitlement, or any inconsistent partial ledger is rejected. The CBT emulator suite verifies first grant, same-event retry, new-event replay, event-ID conflict, payment-ID reuse conflict, and that the granted entitlement unlocks `rmStartExam`. The helper is deliberately not exposed as a callable and must only be invoked after raw-body webhook signature verification. The server-side `rmCreatePaymentOrder` callable and `rmRazorpayWebhook` HTTP handler exist. The student client generates a secure request ID and passes it to the callable. The callable reserves a UID/test/request-scoped Firestore record before contacting Razorpay, fingerprints the authoritative UID/test/amount/currency, lets only the reservation creator call the provider, replays a completed order, and rejects an in-flight duplicate with a retryable response. An explicit provider HTTP rejection is marked failed; network/response ambiguity is marked unknown. If Firestore cannot commit the trusted order after provider success, the reservation records the observed provider order ID for operational reconciliation. This reservation reduces duplicate provider calls for concurrent requests using the same request ID, but a provider success followed by a Firestore failure can still leave an orphan provider order requiring manual reconciliation. Keep paid tests locked until the remaining recovery tests and staging reconciliation pass. Store real API/webhook secrets in Firebase Secret Manager; never commit them or trust a client-supplied payment-success flag.


## Webhook signed-payload invariant

`rmRazorpayWebhook` verifies the HMAC against the exact `req.rawBody` bytes before parsing. After verification, `razorpay-webhook-handler.js` parses JSON from those same bytes only; it never trusts `req.body` as an alternate event source. This ensures the event passed to the payment ledger is exactly the payload whose signature was checked. The handler tests cover a conflicting parsed-body object and malformed signed JSON.
## Payment-order idempotency and recovery gate

The reservation is committed before the Razorpay API call, so concurrent/retried callable requests that reuse the same UID/test/request ID converge on one reservation and only its creator contacts the provider. The reservation does not make the external API call and Firestore commit a distributed atomic transaction: a provider order can still be orphaned if the subsequent trusted-order transaction fails. Such requests are marked `unknown` with the observed provider order ID when possible and require explicit reconciliation; they must never be retried as a fresh provider order automatically.

Do not treat a client retry as a fresh purchase. Before enabling the student checkout UI, implement and test this contract:

1. The client creates one cryptographically random request ID for a checkout attempt and reuses that exact ID for network retries; a deliberate new checkout gets a new ID.
2. The server scopes the idempotency record to the authenticated Firebase UID and test ID. It must reject reuse of the same request ID with a different test, amount or currency.
3. A Firestore transaction reserves the request before contacting Razorpay. Concurrent requests with the same key must converge on the same reservation; only the reservation owner may initiate provider creation.
4. Persist the provider order ID and trusted order ledger atomically as far as Firestore permits. A retry after completion returns the same provider order details, never creates another provider order.
5. Treat an ambiguous provider timeout as an unknown outcome, not a safe failure: Razorpay may have created the order even if the caller did not receive its response. Do not automatically create another order until the first attempt is reconciled using a supported provider-side lookup or an explicit operational recovery path.
6. Define reservation states, bounded waiting, stale-reservation recovery, and cleanup for definite provider failures. Never expire a reservation in a way that can race an in-flight provider request and permit a second create.
7. Add/retain tests for request-key scope and fingerprint conflicts, replay/wait/reconciliation states, explicit provider rejection versus network ambiguity, same-key concurrent callable calls, Firestore write failure after provider success, and different keys for deliberate new attempts. Staging reconciliation remains mandatory.

The student client exposes `createPaymentRequestId()` and `createStudentPaymentOrder(app, testId, requestId)`; the UI must retain the ID for retry and generate a new ID only for a deliberate new checkout. The callable consumes that ID and uses a Firestore reservation. Unknown provider outcomes remain locked for manual reconciliation; no automatic lease expiry or duplicate provider call is allowed. Do not add a backend-only lock with an invented expiry or automatically retry an ambiguous provider request: that can trade duplicate orders for permanently stuck reservations or double orders after lease expiry. Keep paid checkout disabled until this gate and a staging end-to-end reconciliation test pass.

## Important implementation note
The callable functions are a foundation, not a completed TCS-scale platform. For 500 simultaneous candidates, load testing must determine Firestore document contention, read/write volume, answer payload sizes and autosave cadence. The current initial implementation stores answers on one attempt document and must be stress-tested. If measured contention or document growth is high, move answers into per-question documents or a dedicated answer-write service before launch.

## Budget guardrail
The user's initial monthly target is ₹500. This is a target, not a guaranteed maximum. Firebase Phone Auth SMS, Cloud Functions, Firestore overages, storage and egress may exceed it. Do not enable paid usage, deploy billable functions, send production OTPs, or run load tests without explicit user approval after a cost estimate. Use test phone numbers and Firebase Emulator first.

## Deployment and release prerequisites
1. Confirm the existing `railway-mitra` Firebase project, authorized domains, current live rules, indexes, Storage rules and enabled providers in Firebase Console; do not create a duplicate project.
2. Verify Phone Authentication, browser reCAPTCHA behavior and real-device OTP delivery on an approved staging origin.
3. Register the correct web App Check provider/site key and verify valid App Check tokens from both Student and Owner portals on staging.
4. Reconcile the isolated Firestore rules and Storage rules with the current live rules before deployment; never replace shared live rules with this feature-only ruleset without a reviewed merge.
5. Configure `OWNER_UID`, Razorpay Test Mode API credentials and webhook secret through approved server-side secret/configuration mechanisms. Never commit private credentials.
6. Deploy only the isolated `test-series` Functions codebase to the confirmed staging project after cost approval; verify function region, App Check enforcement and webhook endpoint configuration.
7. Run the complete Student OTP → catalogue → free claim / paid checkout → exam start → answer save/resume → submit → result/leaderboard flow in a real browser against staging.
8. Run Owner sign-in + phone MFA, test/question CRUD, import/export, media upload, payment inspection/reconciliation and access grant/revoke workflows against staging.
9. Verify Razorpay Test Mode order creation, checkout signature, captured-payment webhook, duplicate delivery, refund and reconciliation behavior end-to-end. Keep paid access disabled until this passes.
10. Review Firestore indexes, logs, alerting, backup/restore procedures, data retention and the ₹500/month target against actual Firebase/SMS usage before public release.
11. Main-app navigation integration and any shared-rule changes require a separate minimal-diff review to preserve unrelated Railway Mitra features.
12. Capacity/load benchmarking is deferred until the user explicitly asks to resume it; no concurrency target is certified by the current emulator suite.

## Current limitations and release blockers
- The branch contains a substantial Student CBT portal and protected Owner dashboard, but source-level integration and emulator tests do not certify a deployed or real-device production flow.
- Firebase project settings, authorized domains, App Check provider registration, live rules/index reconciliation, `OWNER_UID`, deployed Functions and Storage configuration must be verified in the intended project.
- Student browser reCAPTCHA/real-device OTP, Owner provider linking + phone MFA, Razorpay Test Mode checkout/webhook/refund reconciliation and complete staging end-to-end journeys remain unverified.
- The isolated feature rules must be reviewed and merged with current live rules; do not deploy them as a replacement for shared app rules.
- Cloud Backup and System Settings are intentionally disabled in the Owner UI until a secure, audited implementation exists.
- Free-attempt claims are one per Firebase UID; this is not fraud-proof against multiple phone numbers.
- Main-app entry-point integration is not established by the standalone Student/Owner portals and must be a separate minimal-diff change.
- Capacity/load benchmarking is intentionally deferred at the user's request. No 20/100/250/500-user capacity claim is made.
- Firestore rules deny direct client access to protected CBT data; server Functions use the Admin SDK and remain subject to callable authorization and App Check.

## One pending paid order per student and test

`testSeriesPaymentLocks/{sha256(uid,testId)}` is a deterministic server-only coordination record. `rmCreatePaymentOrder` reads it and the UID/test/request-scoped payment request in one Firestore transaction. It creates the lock with the request before calling Razorpay, so a different request ID from another browser tab/device cannot initiate a second provider order while the first request is `creating`, `created`, or `unknown`. A same-key retry may wait or replay only when the lock and request records agree. The saved provider order replay also verifies `paymentRequestId`, `razorpayOrderId`, UID, test, amount, currency and status.

Only a definite provider rejection removes the matching lock while marking its request `failed`. Ambiguous provider outcomes and post-provider Firestore failures retain/repair the lock as `unknown`. After the webhook signature and captured-payment/order validation succeed, the payment ledger atomically grants the entitlement, marks the order paid, and deletes the matching lock. A mismatched lock is a hard conflict and does not grant access.

No TTL or automatic expiry is used: expiry could race a slow provider call and permit duplicate orders. Stale `creating`/`unknown` locks remain blocked pending a reviewed Owner/support reconciliation and a separately designed release action. Do not manually delete a lock or tell a student to start a new checkout while provider outcome is unresolved. Legacy orders without a lock remain eligible for the existing signature-verified ledger path; the lock is enforced for new reservations and any matching lock present at capture time.


The entitlement document ID is generated only by `paidEntitlementDocumentId(uid, testId)`. Its UID-length prefix avoids ambiguity when either identity segment contains underscores. See the Cloud README for the required pre-deployment migration check for legacy `{uid_testId}` documents.
