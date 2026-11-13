# Student CBT Screen (isolated module)

`exam.html` is the markup fragment, `exam.js` initializes the screen and imports its own CSS. The host must first initialize Firebase Auth, App Check and Functions and authenticate the student by phone OTP.

Example host integration after injecting the HTML fragment into a dedicated container:

```js
import { initStudentCbtExam } from "./exam.js";
initStudentCbtExam({ app: firebaseApp, testId: selectedTestId, root: document });
```

The module provides server-timed countdown, question palette, Previous/Next, answer autosave, and server-side submission. If an autosave fails, the latest pending answer is also written to browser localStorage, scoped to app, test and attempt. The isolated `answer-draft-store.mjs` helper validates restored question IDs and exact string option indexes against the currently delivered paper; it rejects coercible values such as `null`, `false`, arrays and objects rather than accidentally treating them as option zero. Malformed or wholly invalid drafts are discarded, while valid pending answers are merged over server-saved answers and retried; successful saves remove the local draft. Storage access/quota failures are reported as unavailable and are never represented as server-confirmed saves. The helper has standalone Node regression tests and runs in Test Series CI. The Retry Unsaved Answers control is available while the page is open, and submission waits for pending saves. This is best-effort recovery on the same browser/origin only: clearing site data, using another device/browser, or browser storage restrictions can remove/prevent the draft. It is not a substitute for server confirmation; never tell students an answer is saved until the server confirms it. The attempt ID is also stored locally to reopen the same attempt: an already-submitted result is fetched again; an active attempt resumes with the server expiry time; when the server deadline is reached, the client gives an in-flight save up to five seconds to settle, then submits using only server-persisted answers so a stalled network request cannot block timeout finalization; it does not retry drafts after expiry because the backend correctly rejects late answer writes. If local answers remain pending, the result warns that those unsaved answers were not included. Unsaved local drafts cannot be included after expiry. Once a result is recovered, the local pending-answer draft is cleared on a best-effort basis; browser storage cleanup failure never blocks display of a server-confirmed result. The client first checks the authenticated server-side active-session record when no local attempt ID is available, allowing the same student's active or completed attempt to be discovered from another browser/device for that test. This does not expose another student's attempt and still requires the student to authenticate with the same account. It must not be treated as production-ready until real-device testing, connectivity/retry testing, App Check verification, merged Firestore rules review, owner provisioning and backend deployment are completed.

## Submission interaction lock

As soon as manual submission or the server-timeout finalizer begins, the CBT client disables answer options, question/section navigation, retry and submit controls and invalidates any pending navigation response. This prevents a late click or slower section-navigation response from changing the visible answer state while the server is taking its final answer snapshot. If submission is not confirmed, the client rebuilds the controls from the current paper/timing state and allows a retry. This UI lock is a reliability aid only; the server-side attempt status and deadline remain authoritative.

## Student test catalogue

- `catalogue.html` is the markup fragment and `catalogue.js` initializes the published-test list.
- The host must inject the fragment after phone-OTP sign-in and initialize Firebase App Check/Functions. Both the portal and every student callable verify the Firebase `sign_in_provider === "phone"` claim; a signed-in Google, email/password, or custom-token session cannot access student CBT APIs.
- Call `initStudentTestCatalogue({ app, root, onStart })`; the host's `onStart({ test, session })` callback should switch to the CBT exam view. The catalogue only claims the configured one-time free attempt; it does not start the timed exam. The student starts or resumes the server-timed attempt only after pressing **Start Exam** on the exam screen. Re-selecting the catalogue after an existing claim does not create a second free attempt.
- Only the configured free-trial test can be started without a paid entitlement. Paid tests are listed as payable until the verified server-side payment webhook creates the matching active entitlement. After Razorpay reports checkout submission, the catalogue offers **Check Payment Status**, which reloads access from the server; the browser checkout callback never grants access. Other zero-price tests are not automatically free.
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
