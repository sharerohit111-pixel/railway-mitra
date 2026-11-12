# Railway Mitra CBT Cloud

See ARCHITECTURE.md for target architecture, data model, budget guardrails and deployment prerequisites.

## Callable functions
- rmClaimFreeAttempt: claims one free test attempt per authenticated UID.
- rmStartExam: creates or resumes a server-timed mock/scheduled attempt.
- rmSaveAnswer: saves a scalar answer only for the authenticated attempt owner.
- rmSubmitExam: scores using private server-side answer keys and records the result.
- rmGetOwnerAdminSession: checks server-configured OWNER_UID and Firebase second-factor claim.

## Firestore
Deploy firestore.rules before connecting clients. All direct client reads/writes are denied; callable backend functions use Admin SDK.

## Not production-ready
No Firebase project has been confirmed, no functions have been deployed, and no live student UI is connected. Do not run paid deployment or real SMS until the user explicitly approves the cost.


## App Check verification (web/PWA)
1. Confirm the Firebase Console App Check app entry shows **Railway Mitra Web — Registered** with Fraud Defense.
2. Deploy this branch to a staging URL or merge it only after review; GitHub Pages on the default branch will not serve branch-only changes automatically.
3. Open `features/test-series/cloud/app-check-test.html` on one of the registered/authorized domains and tap **App Check जाँचें**.
4. A success message means the client obtained an App Check token. It does not mean callable functions are deployed or that enforcement is enabled.
5. Keep App Check enforcement OFF until the app has been tested on Android/PWA and every Firebase client entry point is confirmed to initialize App Check.

The site key in `app-check.js` is a public web site key, not a private service-account secret. Never put service-account credentials or private keys in browser code.
