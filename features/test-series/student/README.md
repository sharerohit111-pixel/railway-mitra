# Student CBT Screen (isolated module)

`exam.html` is the markup fragment, `exam.js` initializes the screen and imports its own CSS. The host must first initialize Firebase Auth, App Check and Functions and authenticate the student by phone OTP.

Example host integration after injecting the HTML fragment into a dedicated container:

```js
import { initStudentCbtExam } from "./exam.js";
initStudentCbtExam({ app: firebaseApp, testId: selectedTestId, root: document });
```

The module provides server-timed countdown, question palette, Previous/Next, answer autosave, and server-side submission. If an autosave fails, the latest pending answer is also written to browser localStorage, scoped to app, test and attempt. On a resumed attempt the module merges that local pending draft over the server-saved answers and retries it; successful saves remove the local draft. The Retry Unsaved Answers control is available while the page is open, and submission waits for pending saves. This is best-effort recovery on the same browser/origin only: clearing site data, using another device/browser, or browser storage restrictions can remove/prevent the draft. It is not a substitute for server confirmation; never tell students an answer is saved until the server confirms it. The attempt ID is also stored locally to reopen the same attempt: an already-submitted result is fetched again; an active attempt resumes with the server expiry time; when the server deadline is reached, the client waits for any in-flight save to settle and submits using only server-persisted answers; it does not retry drafts after expiry because the backend correctly rejects late answer writes. If local answers remain pending, the result warns that those unsaved answers were not included. Unsaved local drafts cannot be included after expiry. Once a result is recovered, the local pending-answer draft is cleared on a best-effort basis; browser storage cleanup failure never blocks display of a server-confirmed result. The client first checks the authenticated server-side active-session record when no local attempt ID is available, allowing the same student's active or completed attempt to be discovered from another browser/device for that test. This does not expose another student's attempt and still requires the student to authenticate with the same account. It must not be treated as production-ready until real-device testing, connectivity/retry testing, App Check verification, merged Firestore rules review, owner provisioning and backend deployment are completed.

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
