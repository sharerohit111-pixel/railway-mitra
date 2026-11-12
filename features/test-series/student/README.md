# Student CBT Screen (isolated module)

`exam.html` is the markup fragment, `exam.js` initializes the screen and imports its own CSS. The host must first initialize Firebase Auth, App Check and Functions and authenticate the student by phone OTP.

Example host integration after injecting the HTML fragment into a dedicated container:

```js
import { initStudentCbtExam } from "./exam.js";
initStudentCbtExam({ app: firebaseApp, testId: selectedTestId, root: document });
```

The module provides server-timed countdown, question palette, Previous/Next, answer autosave, and server-side submission. If an autosave fails while the page remains open, the student's latest unsaved answers stay in an in-memory retry queue; the Retry Unsaved Answers control retries them, and submission waits for that queue to clear. This queue is not durable across a browser/tab crash or reload, so the UI must not claim an offline answer is saved. It must not be treated as production-ready until real-device testing, connectivity/retry testing, App Check verification, merged Firestore rules review, owner provisioning and backend deployment are completed.

## Student test catalogue

- `catalogue.html` is the markup fragment and `catalogue.js` initializes the published-test list.
- The host must inject the fragment after phone-OTP sign-in and initialize Firebase App Check/Functions.
- Call `initStudentTestCatalogue({ app, root, onStart })`; the host's `onStart({ test, session })` callback should switch to the CBT exam view. The catalogue claims the configured one-time free attempt and starts that exam on the server.
- Only the configured free-trial test can be started without a paid entitlement. Paid tests remain visibly unavailable until a verified payment-to-entitlement flow is implemented. Other zero-price tests are not automatically free.
- The callable returns published metadata only. It never returns questions or answer keys.
- The module is isolated and is not yet wired into the live Railway Mitra route. Production use still requires auth/App Check integration, Firestore rules review, owner provisioning, deployment approval and real-device testing.

## Student performance dashboard

- `dashboard.html` is the isolated markup fragment; `dashboard.js` initializes the student's own submitted-results view.
- Inject the fragment after phone-OTP sign-in, then call `initStudentDashboard({ app, root })`.
- The backend callable `rmGetStudentDashboard` scopes the query to the authenticated Firebase UID and returns only that student's submitted scores plus safe test titles. It does not return other students' identities, answer keys, or question content.
- The dashboard is a history/performance view, not a live leaderboard or rank list. Ranking requires a separately designed privacy-safe aggregation.

## Anonymous leaderboard

- `leaderboard.html` and `leaderboard.js` render a published test's top 20 anonymous scores and the signed-in student's own rank.
- Initialize with `initStudentLeaderboard({ app, testId, root })` after phone-OTP authentication.
- The callable never returns UID, phone, email or attempt ID. It currently reads at most 1,000 submitted result records per test; if the cap is reached, the UI explicitly marks counts/rank as potentially incomplete. A production-scale leaderboard needs a dedicated aggregation design before large cohorts.
- Tied scores share competition rank; earlier submission determines ordering within the tie.
