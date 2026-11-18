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

## Offline timeout submission recovery

If automatic submission at the server deadline fails while the browser is offline, the controller keeps the same attempt and does not restart the countdown. When the browser reports that connectivity has returned, it retries server-side finalization even when there are no local answer drafts left. If the reconnect event arrives while the first finalization request is still pending, the controller remembers that event and performs one follow-up attempt only if the first request fails while the browser is online. Expired local drafts are never retried after the deadline; the server scores only answers already persisted before expiry. This recovery is idempotent because the submit callable returns the existing result for an already-submitted attempt.

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
- Inject the fragment after phone-OTP sign-in, then call `initStudentDashboard({ app, root, onLeaderboard })`. The portal supplies `onLeaderboard(testId)` and routes the selected result to the test-specific anonymous leaderboard; the dashboard action is disabled if a result has no valid `testId`.
- The backend callable `rmGetStudentDashboard` scopes the query to the authenticated Firebase UID and returns only that student's submitted scores plus safe test titles. It does not return other students' identities, answer keys, or question content.
- The dashboard remains a bounded history/performance view (latest 100 submitted results); it does not embed or calculate rankings itself. For a selected result, the portal opens the separate privacy-safe leaderboard module for that result's `testId`. Ranking is loaded independently from the server callable and is not inferred from the dashboard's limited result sample.

## Anonymous leaderboard

- `leaderboard.html` and `leaderboard.js` render a published test's top 20 anonymous scores and the signed-in student's own rank.
- Initialize with `initStudentLeaderboard({ app, testId, root })` after phone-OTP authentication.
- The callable uses Firestore aggregate counts and bounded indexed queries for the Top 20 and the requesting student's best attempt. A second aggregate count determines how many submitted scores are strictly higher than that best score; the resulting rank is a competition rank.
- The compatibility response field `participantCount` counts submitted result documents (attempts), not distinct students. The UI therefore labels it as submitted attempts. A student with multiple attempts may appear more than once in the attempt-based Top 20; the student's personal rank is based on their best submitted attempt.
- The callable never returns UID, phone, email or attempt ID. Public rows contain only rank, score and an anonymous candidate label. If `leaderboardComplete` is not explicitly true, the UI identifies the result as a partial sample instead of claiming the count or rank is complete.
- The Top 20 query uses the `testSeriesResults(testId ASC, score DESC, submittedAt ASC)` index. The personal-best query uses `testSeriesResults(testId ASC, uid ASC, score DESC, submittedAt ASC)`; both are additive indexes in the root `firestore.indexes.json`.
- Tied scores share competition rank; earlier submission determines ordering within the tie. The isolated `leaderboard-presentation.mjs` helper and `leaderboard-presentation.test.mjs` cover singular/plural attempt labels, invalid counts, complete/partial copy and the UI's use of the shared presentation contract. The student Node test suite runs in Test Series Functions CI.


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

The student portal now invalidates the current view generation, destroys the active exam controller, clears the previous student's rendered view, and resets the local OTP confirmation before it awaits Firebase `signOut`. Both OTP controls remain disabled while sign-out is pending, preventing a new phone-auth flow from racing an unconfirmed logout. They are re-enabled only after Firebase confirms sign-out; if sign-out fails, the workspace remains locked and a Retry sign out control is shown. The pending UID lock is persisted in localStorage so a restored Firebase session cannot reopen that same student workspace after reload; a successful sign-out clears the lock. If localStorage is unavailable, the page explicitly instructs the user to keep the tab open and retry rather than reload. A different authenticated UID clears a stale lock. The auth-state listener still performs its own teardown as a second fail-closed boundary. Regression tests verify the ordering and the failure path. This is client-side session hygiene only; Firebase Auth and server-side UID/phone-claim checks remain authoritative.


## OTP request lifecycle guard

The phone sign-in portal assigns a monotonically increasing generation to each OTP flow and permits only one SMS-send request or one phone-code verification at a time. A second send is rejected while the first Firebase challenge is pending; after that request settles, a deliberate retry may begin. Logout or any Firebase Auth state transition invalidates the active generation and releases its lock, while stale completions cannot store an old confirmation or re-enable controls belonging to a newer session. Verification also checks that the confirmation belongs to the current generation. This is client-side race and duplicate-challenge protection only: Firebase Auth token claims and server-side phone-provider/UID checks remain authoritative. Automated Node regression tests cover the send lock, retry after settlement, stale send/verify completions, and logout/auth-transition ordering. No real OTP is sent by these tests.


## Auth Emulator account-switch regression

The isolated CBT Auth Emulator account-switch regression requests two synthetic phone verification codes through the local emulator REST API, completes both phone sign-ins with `accounts:signInWithPhoneNumber`, and verifies the returned ID tokens with the Firebase Admin SDK. It confirms distinct UIDs and actual phone-provider claims, then feeds those verified claims through a deterministic transition harness that uses the same `invalidateStudentPortalSession` helper as the portal. The harness is not a real client SDK `onAuthStateChanged` run; the separate portal source-order regression verifies that the production auth listener invokes teardown before awaiting token claims. Non-phone/custom-token rejection remains covered by the isolated student-auth tests.

The Node-based Auth Emulator account-switch test uses the emulator's local Identity Toolkit REST flow rather than `PhoneAuthProvider`: Firebase documents that the Web SDK `PhoneAuthProvider` does not work in Node.js. The test requests a verification session from the local `accounts:sendVerificationCode` endpoint, reads the generated six-digit code from the emulator-only `verificationCodes` endpoint (accepting the `code` field returned by the running emulator and the documented `sessionCode` field), then completes sign-in through the local `accounts:signInWithPhoneNumber` endpoint. It verifies each resulting ID token with the Firebase Admin SDK and asserts the actual `firebase.sign_in_provider === "phone"` claim used by the server student guard. It then feeds those verified claims through a deterministic transition harness that calls the same `invalidateStudentPortalSession` helper used by the portal, proving Student A's controller, UID, test ID and rendered content are cleared before Student B's workspace is opened. The separate `portal-session-transition.test.mjs` source-order regression verifies that the production Firebase auth-state listener invokes teardown before awaiting token claims. This is an Auth Emulator REST + shared-helper regression, not full browser portal automation or a real Firebase client SDK `onAuthStateChanged` run. Browser reCAPTCHA/App Check attestation, real-device SMS delivery, hosting integration, and deployed Firebase configuration remain separate pre-production checks.

## Authentication transition regression coverage

The Auth Emulator session-switch test covers Student A signing out before Student B's workspace opens, and also simulates a delayed Student A ID-token refresh that completes after Student B has authenticated. The stale result must be ignored so it cannot replace Student B's active workspace. This is a local-emulator-only regression test; it does not send real OTPs or contact production Firebase.

## Prototype-safe student answer state

The exam controller stores the current paper's answers in an isolated null-prototype map. This keeps valid question IDs such as `__proto__`, `constructor`, `toString` and `hasOwnProperty` as ordinary own data keys instead of inheriting JavaScript object behavior. Restored server answers are copied only from own enumerable string data properties; inherited fields and accessor-backed values are rejected. Answered-state rendering uses explicit own-property checks. The isolated `student-answer-state.mjs` helper has Node regression tests for special IDs, mutation, inherited-property exclusion and malformed/accessor-backed maps. This is a client-side data-structure safeguard; server-side question validation, attempt ownership and scoring remain authoritative.


## Student view error fencing

Every asynchronous portal navigation now captures the expected view-request generation and the authenticated student's UID/auth generation. If loading a catalogue, dashboard, leaderboard or exam fragment fails after a newer view request, logout or account switch, the stale error is ignored instead of overwriting the shared portal status for the current screen. The guard treats missing/invalid generations and session-check exceptions as inactive. This is client-side presentation-race protection only; Firebase Auth claims, App Check and server callable authorization remain authoritative. The isolated Node regression suite covers current errors, superseded requests, logout/account-switch invalidation and fail-closed callback errors.


## Server-anchored exam clock

The question-delivery callable includes a server-generated `serverNow` timestamp alongside the overall and section deadlines. The exam controller anchors its display clock to that timestamp and advances it with the browser's monotonic `performance.now()` clock, not the device wall clock. Changing the device date/time while an exam is open therefore cannot prematurely expire the overall exam or a timed section in the UI. A missing or invalid server clock anchor prevents the exam controller from opening. The server remains authoritative for every answer save, section entry and submission deadline; a delayed network response may make the display slightly conservative, but it cannot extend server-side answer acceptance.

## Razorpay checkout script loading

The Student checkout loads the provider's hosted script through an isolated loader scoped to the current Document. Concurrent checkout requests in the same document share one in-flight script load. A network failure, synchronous DOM insertion error, or load event without the expected `Razorpay` constructor removes the failed script element and clears the pending promise so a later user retry can load a fresh element. A successful load clears its event handlers and is reused while the provider constructor remains available.

This protects the browser from a stale rejected loader promise and duplicate in-flight script elements. It does not verify a payment or grant access: the checkout callback is only a submission acknowledgement, and the server-verified captured-payment webhook plus payment/order/entitlement ledger remains authoritative. The loader's isolated Node tests cover concurrent calls, failed-load cleanup, retry, missing provider initialization, already-loaded reuse and synchronous insertion failure.


## Same-session duplicate checkout guard

The Student checkout wrapper allows only one in-flight checkout/order flow for the same Firebase App instance, authenticated student UID and test ID in the current JavaScript realm. Concurrent callers share the same promise, so they cannot create multiple Razorpay Checkout instances for one student/test while the first flow is pending. Different students, tests or Firebase App instances remain independent. The identity entry is released after either success or failure so a later user retry is possible. This is client-side race protection only: the server-side payment request/idempotency lock, captured-payment webhook verification and entitlement ledger remain authoritative, including across tabs and devices. It does not grant access or treat a browser callback as proof of payment. The isolated checkout-flight.mjs tests cover same-identity concurrency, independent identities/apps, retry after failure, release after success and invalid inputs.

## Serialized answer-save queue

The exam controller uses an isolated answer-save queue so rapid changes to the same question cannot be acknowledged out of order. Identical in-flight saves for one question share a promise; a newer selection is queued after the earlier write and remains in the pending draft until that exact value receives server confirmation. A failed earlier write does not block a later queued selection, and simultaneous reconnect/Retry requests share one retry pass. Writes that have not started are skipped after the exam controller is destroyed, rather than being treated as saved. The controller waits for the queue before an explicit submission and uses the same queue state for timeout and unload recovery. These are client-side ordering and lifecycle safeguards only: Firestore transactions, active-attempt ownership, server deadlines and server-side scoring remain authoritative.
