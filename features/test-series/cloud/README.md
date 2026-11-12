# Railway Mitra — Cloud Test Series (isolated foundation)

## Rules
- One published free test (testSeriesConfig/freeTest with enabled=true and testId).
- One free attempt per authenticated Firebase UID, enforced atomically on server.
- All other tests require verified paid entitlement; payment implementation is NOT included yet.
- Do not expose answer keys in student-readable Firestore documents.
- Do not allow client writes to testSeriesFreeAttempts or testSeriesAttempts.
- No existing Railway Mitra code is modified.

## Before use
1. Configure a Firebase project, Authentication, Firestore and App Check.
2. Deploy the callable function as an isolated functions codebase, after security review.
3. Set restrictive Firestore Security Rules; client must not edit entitlements, scores, or question keys.
4. Configure testSeriesConfig/freeTest and publish a zero-price test.
5. Wire the client to the existing login and test interface, then test repeat claims and concurrent requests.
6. Implement server-side submission, scoring, payment order creation and Razorpay signature/webhook verification before production.

**Not production-ready yet:** function deployment, Firestore rules, integration, test content, secure scoring, payment, and user testing remain.
