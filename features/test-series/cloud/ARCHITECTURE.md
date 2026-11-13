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
- testSeriesPaymentOrders/{razorpayOrderId}: trusted server-created order with `uid`, `testId`, amount in minor units, currency and status (`created` → `paid`).
- testSeriesPayments/{paymentId}: unique captured-payment ledger record bound to one order, student and test.
- testSeriesPaymentEvents/{eventId}: provider event audit record; duplicate deliveries are recorded as duplicates without granting another entitlement.
- testSeriesFreeAttempts/{uid}: one-time free attempt claim.

## Razorpay signature verification boundary

The isolated Functions package now includes two server-side HMAC verification helpers in `functions/razorpay-signature.js`:

- Checkout response: verify HMAC-SHA256 over the exact `order_id|payment_id` string with the Razorpay API key secret.
- Webhook: verify HMAC-SHA256 over the exact raw HTTP request bytes with the separately configured webhook secret. Never reconstruct the signed body with `JSON.stringify(req.body)`.
- Both helpers reject malformed 64-character hexadecimal signatures and compare digest bytes with Node's constant-time `timingSafeEqual`.

Deterministic tests use emulator-only dummy secrets and cover valid signatures, altered payloads/identifiers, malformed signatures and missing inputs. The separate `functions/payment-validation.js` guard accepts only a `payment.captured` event whose captured payment ID, provider order ID, amount and currency exactly match a trusted server-created order record in `created` state. The UID and test ID returned by the guard come only from that server order; payment notes and other client-controlled metadata are ignored. The new `functions/payment-ledger.js` helper re-reads the trusted order inside a Firestore transaction, then atomically creates the unique payment record, provider event record and entitlement while moving the order to `paid`. Repeated deliveries with the same event ID are no-ops only after the transaction rechecks the paid order, captured-payment record, event identity fields and active entitlement against the verified payment. A missing payment/order record, missing entitlement, mismatched owner/test/amount/currency, or altered event identity is rejected as an inconsistent ledger instead of being silently accepted. A repeated payment under a different event ID is also a no-op only when the original paid order and entitlement all match. Reuse of an event or payment ID for different data, a pre-existing entitlement, or any inconsistent partial ledger is rejected. The CBT emulator suite verifies first grant, same-event retry, new-event replay, event-ID conflict, payment-ID reuse conflict, and that the granted entitlement unlocks `rmStartExam`. The helper is deliberately not exposed as a callable and must only be invoked after raw-body webhook signature verification. The server-side `rmCreatePaymentOrder` callable and `rmRazorpayWebhook` HTTP handler now exist, but student checkout is not wired to them and provider-order creation is not yet idempotent or recoverable. The order callable currently creates the Razorpay order before writing its trusted Firestore record, so retries and post-provider Firestore failures can leave duplicate or orphan provider orders. Keep paid tests locked until the request-ID reservation/recovery contract above is implemented, tested, and reconciled end-to-end in staging. Store real API/webhook secrets in Firebase Secret Manager; never commit them or trust a client-supplied payment-success flag.

## Payment-order idempotency and recovery gate

The current `rmCreatePaymentOrder` callable creates a provider order before it commits the trusted Firestore order record. A provider order can therefore be orphaned if the Firestore transaction fails, and concurrent/retried callable requests can create more than one provider order for the same student and test. The webhook remains fail-closed because it grants access only from a trusted Firestore order, but this does not prevent duplicate provider-side orders or confusing checkout attempts.

Do not treat a client retry as a fresh purchase. Before enabling the student checkout UI, implement and test this contract:

1. The client creates one cryptographically random request ID for a checkout attempt and reuses that exact ID for network retries; a deliberate new checkout gets a new ID.
2. The server scopes the idempotency record to the authenticated Firebase UID and test ID. It must reject reuse of the same request ID with a different test, amount or currency.
3. A Firestore transaction reserves the request before contacting Razorpay. Concurrent requests with the same key must converge on the same reservation; only the reservation owner may initiate provider creation.
4. Persist the provider order ID and trusted order ledger atomically as far as Firestore permits. A retry after completion returns the same provider order details, never creates another provider order.
5. Treat an ambiguous provider timeout as an unknown outcome, not a safe failure: Razorpay may have created the order even if the caller did not receive its response. Do not automatically create another order until the first attempt is reconciled using a supported provider-side lookup or an explicit operational recovery path.
6. Define reservation states, bounded waiting, stale-reservation recovery, and cleanup for definite provider failures. Never expire a reservation in a way that can race an in-flight provider request and permit a second create.
7. Add emulator tests for same-key concurrent requests, completed-request replay, key reuse with altered payload, definite provider failure, ambiguous timeout, Firestore write failure after provider success, and different keys for deliberate new attempts.

The current repository does not yet include the student checkout client, so the client/server request-ID contract must be implemented together. Do not add a backend-only lock with an invented expiry or automatically retry an ambiguous provider request: that can trade duplicate orders for permanently stuck reservations or double orders after lease expiry. Keep paid checkout disabled until this gate and a staging end-to-end reconciliation test pass.

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
