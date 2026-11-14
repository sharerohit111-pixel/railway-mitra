# Student CBT Screen (isolated module)

`exam.html` is the markup fragment, `exam.js` initializes the screen and imports its own CSS. The host must first initialize Firebase Auth, App Check and Functions and authenticate the student by phone OTP.

Example host integration after injecting the HTML fragment into a dedicated container:

```js
import { initStudentCbtExam } from "./exam.js";
const studentUid = auth.currentUser?.uid;
if (!studentUid) throw new Error("A verified student session is required.");
initStudentCbtExam({ app: firebaseApp, testId: selectedTestId, studentUid, root: document });
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


## Student performance dashboard scope

The Student Performance dashboard displays the latest 100 submitted results, ordered newest-first by the server. Its result count and average score describe only the results loaded in that bounded view; they are not lifetime totals. The server query uses the `uid` + `submittedAt` composite index in `firestore.indexes.json`.


## Single-flight request guard

- `single-flight.mjs` deduplicates concurrent operations for the same object key and returns the same pending promise to every caller.
- The pending entry is cleared after success or failure, so a later refresh can retry; separate controls remain independent.
- The student test suite covers shared concurrent calls, retry after asynchronous or synchronous failure, independent keys, and invalid arguments, and shared synchronous throws (six test cases).

## Keyboard focus after answer selection

When a student selects an answer, the option list is re-rendered to update its pressed state. The CBT now restores keyboard focus to the same option index after that render, so keyboard users can continue from the answer they just selected instead of losing focus when the old button node is replaced. The isolated `exam-focus.mjs` helper safely ignores missing, disabled, or invalid targets. Regression tests cover the helper and verify that the answer-click render path supplies the selected option index. This is a client-side accessibility improvement; server-side answer saving and submission remain authoritative.

## Bounded local answer-draft recovery

Pending answer drafts are best-effort browser recovery data, not the authoritative answer record. The store accepts at most 500 pending answers (matching the CBT paper limit) and at most 128 KiB (131,072 bytes) of UTF-8 serialized data. The limit is measured in encoded bytes, not JavaScript string characters. Oversized or malformed stored payloads are discarded before restoration; an oversized write is refused without replacing an earlier recoverable draft. Storage failures remain non-fatal and are never reported as server-confirmed saves. Regression tests cover the exact 500-answer boundary, oversized entry arrays, oversized serialized data, preservation of the previous draft after a rejected write, cleanup of oversized stored payloads, and rejection of every entry for duplicated question IDs instead of applying an arbitrary last-write-wins answer.


## Account-scoped local CBT recovery

The exam host passes the UID from the currently verified Firebase phone-authenticated session into `initStudentCbtExam`. The client scopes the local attempt pointer by Firebase app ID, student UID and test ID; pending-answer and question-position keys additionally include the attempt ID. Key components are URI-encoded to prevent delimiter collisions. Initialization fails closed when the student UID or test ID is missing. This prevents two students sharing the same browser profile from reusing each other’s local attempt pointer or pending draft. It is a browser-storage isolation measure, not an authorization boundary: every callable must continue to enforce the authenticated UID and server-side attempt ownership. Older unscoped local keys are intentionally not read; when no account-scoped attempt pointer exists, the client discovers that student’s attempt through the authenticated server-side active-attempt callable.

## Fail-closed student auth transitions

Whenever Firebase Auth reports a session transition, the portal first increments its view-request generation, clears the previous student/test identity, hides the workspace, destroys and clears the previous exam controller, and synchronously removes all rendered content from the prior student's view before awaiting the incoming user's ID-token claims. This is important because the next workspace can be shown before its catalogue fetch finishes; clearing the old DOM prevents the previous student's exam from flashing during that gap. Only after the incoming session is confirmed to use phone sign-in does the portal reopen the student workspace. Unsupported providers, sign-out, stale token lookups, and token-verification failures therefore cannot leave the previous student's exam screen visible while authentication is being resolved. The isolated `session-transition.mjs` helper has Node regression tests for controller teardown, stale-view invalidation, UI lockout when cleanup throws, and the portal's teardown-before-token-verification ordering. This is client-side session isolation only; every callable must continue to enforce the authenticated UID, phone-provider claim, App Check policy, and server-side attempt ownership.


## Immediate logout lockout

The student portal now invalidates the current view generation, destroys the active exam controller, clears the previous student's rendered view, and resets the local OTP confirmation before it awaits Firebase `signOut`. Both OTP controls remain disabled while sign-out is pending, preventing a new phone-auth flow from racing an unconfirmed logout. They are re-enabled only after Firebase confirms sign-out; if sign-out fails, the workspace remains locked and the user is instructed to reload before signing in again. The auth-state listener still performs its own teardown as a second fail-closed boundary. Regression tests verify the ordering and the failure path. This is client-side session hygiene only; Firebase Auth and server-side UID/phone-claim checks remain authoritative.
