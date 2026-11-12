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
