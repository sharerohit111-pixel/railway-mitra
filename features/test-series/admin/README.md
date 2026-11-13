# Owner Admin Dashboard — isolated module

## Standalone Owner Portal

Open `portal.html` to load the dedicated Owner Control Centre. `owner-portal.js` initializes the existing Firebase app, loads the isolated dashboard fragment, connects Cloud Functions in `asia-south1`, and imports the Test Series App Check bootstrap before any Owner callable is invoked. The portal remains separate from the Railway Mitra home navigation; it is not yet linked into the student portal or main app. The backend must have the exact `OWNER_UID` configured, Phone MFA enrolled, App Check configured, and the Test Series Functions deployed before Owner access can succeed. The browser page alone does not grant privileges.

Mobile-first dashboard shell and Firebase Authentication MFA client helpers. The standalone portal route is available, but is not linked into the main app; do not link until Firebase and backend authorization are configured.

## Login methods
- Google popup
- Email + password
- SMS OTP using Firebase Authentication Phone multi-factor authentication (MFA)

Link both primary providers to the same verified Owner Firebase UID. Enroll Phone MFA on that account. Firebase sign-in will then require the enrolled second factor.

## Security requirements
Every future admin read/write must be authorized server-side: authenticated ID token, exact UID in server-configured OWNER_UID, Firebase second-factor claim (`firebase.sign_in_second_factor === "phone"`), and valid App Check. Other MFA factor types do not satisfy the Owner phone-OTP requirement. Never grant admin rights through Firestore documents writable by clients, localStorage, URL parameters, or frontend flags. Keep admin Firestore rules deny-by-default. Never send answer keys to student clients before submission.

## Integration
Load admin-dashboard.html into the Test Series route only after app Firebase Auth is initialized. Import admin-auth.js from a module script and wire the controls. Keep this folder isolated from existing app modules.

## Not live yet
Cards are navigation placeholders. Cloud CRUD, question import, payment verification, reports, backup/restore, owner UID provisioning, MFA enrollment UX, App Check, and restrictive Firestore rules remain to be implemented. No deployment or billing changes were made.


## Test authoring validation
The owner test form uses the pure helper `admin-test-validation.mjs` before calling the backend. It checks the same question count, safe unique IDs, text/option limits, answer indexes, duration, price and marking ranges enforced by `ownerTestPayload`. Scheduled tests must have valid start/end values with the end strictly after the start. Server-side validation remains authoritative.

Run the isolated helper tests with Node.js 22:

```bash
node --test features/test-series/admin/tests/*.test.mjs
```

## Restored Owner sessions

The standalone portal observes Firebase Auth state on every load. A persisted user is never treated as an authorized Owner merely because the browser restored a session or the account has a locally enrolled phone factor. The portal calls `rmGetOwnerAdminSession` again and reveals the dashboard only after the backend confirms the configured Owner UID, Firebase phone second-factor claim, and App Check. If server authorization fails, the portal signs the session out. Pending authorization results are ignored after sign-out or portal teardown.

The session observer is isolated in `owner-session.mjs` and covered by Node tests for restored sessions, missing phone MFA, server rejection, sign-out races, and teardown. This does not replace backend authorization and does not make the portal production-ready before the required Firebase configuration and deployment.


## Owner payment history

The Payments module calls the owner-only `rmOwnerListPayments` callable. The backend checks the configured `OWNER_UID` and verified phone MFA claim before reading the captured-payment ledger; App Check is required outside the Functions Emulator. Results are paginated newest-first (25 by default, maximum 50) using a document cursor. The response is an explicit allow-list containing payment ID, provider order ID, student Firebase UID, test ID, amount in paise, INR currency, captured/review-required status, and recorded timestamp. Phone numbers, email addresses, provider notes, receipt payloads and arbitrary ledger fields are never returned. The browser clears rendered payment data when the Owner session is lost or logged out.

The Payment History list shows only records in `testSeriesPayments`, which are written by the verified captured-payment webhook. A separate read-only Payment Reconciliation Queue calls `rmOwnerListPaymentReconciliation` and lists only `creating` or `unknown` payment-order requests. It exposes a strict allow-list (including a safe Razorpay receipt reference when present) and never exposes reservation tokens, request fingerprints, phone, email or raw provider payloads. The queue scans a bounded window of up to 500 recent request records per page and exposes a continuation cursor when the scan is full. It does not retry provider calls, mutate payment requests, grant/revoke entitlements, or mark an order paid. The Owner must verify the order/payment outcome in the provider dashboard and follow an audited support process before advising a student to retry checkout. Refunds, disputes and failed-checkout operations remain unsupported; absence from the captured-payment ledger is not proof that a payment failed.


## Owner student exam activity

The Students module calls `rmOwnerListStudentActivity`, an Owner-only, App-Check-protected callable. It reads submitted result summaries newest-first with cursor pagination (25 per page, maximum 50). The response is limited to student Firebase UID, test ID/title, score, correct/wrong/unattempted counts, total questions, timeout flag and submission time. It does not expose phone numbers, email addresses, answer selections, answer keys or raw attempt documents. The module clears rendered records when the Owner session is lost or logged out. Emulator coverage verifies that a normal student account is denied access to the Owner report.


## Owner result analytics

The Results & Ranking module calls the Owner-only `rmOwnerGetResultAnalytics` callable. It aggregates only the latest 500 submitted result summaries and reports the sampled attempt count, average score, average correct-answer percentage, timeout count and per-test aggregates. The response contains no student identifiers or personal contact data. When 500 records are present, the UI explicitly indicates that older records are outside this bounded snapshot; these values must not be described as lifetime totals. The report is cleared when the Owner session is lost.


## Owner Question Bank

The Question Bank module stores reusable question records separately in `testSeriesQuestionBank`. Owner-only callable APIs support saving and listing records with topic, chapter and folder metadata. Question text, options, explanation and correct option are stored server-side; student clients cannot list or write these records. The dashboard displays up to the 100 most recently updated entries. The dashboard supports adding, editing and deleting individual records. Bulk import/export and attaching selected bank entries to a test are follow-on work. Existing test creation/import remains unchanged.


### Bulk import and adding bank items to a draft

The Owner Question Bank supports XLSX, XLS, CSV and JSON bulk import (up to 100 records per request). Spreadsheet columns are `topic`, `chapter`, `folder`, `text` (or `question`), `optionA`–`optionF` or `options` as a JSON array, `correctIndex` (zero-based), and optional `explanation`. Blank or invalid correct indexes are rejected server-side. Each batch is validated before its Firestore batch write. The Question Bank list also offers **Add to Test**, which copies the selected question into the existing Test Management question editor; the Owner must still save the test through the normal draft/publish workflow. Direct browser Firestore access to `testSeriesQuestionBank` is denied.


### Question Bank search, filters and pagination

The Owner Question Bank list supports exact topic, chapter and folder filters, case-insensitive text search across question text and classification fields, and cursor-based pages of 25 records. The server scans a bounded window of up to 500 recently updated records per request and filters that window in memory, avoiding a proliferation of composite Firestore indexes. The UI shows a continuation control when more records remain in that scan window; very large libraries may require repeated scans and the report is intentionally bounded per request. Filter option lists are derived from the same recent 500-record window.


### Bulk selection for test assembly

The Question Bank UI supports selecting multiple questions from the currently loaded result pages and appending them to the Test Management question JSON editor in one action. Existing question IDs are skipped to prevent duplicate insertion. The Owner must still review and save the draft/published test through the existing Test Management workflow; selection does not publish or modify a test by itself.


The bulk-add controls can add every currently loaded question matching a selected topic, chapter, and/or folder to the Test Management JSON editor. The current loaded result pages are the selection scope; use Load More or narrow the Question Bank filters before adding if the target group is larger than the loaded pages. Duplicate IDs are skipped, and the test still requires the normal Owner review and Save Test action.


### Test Section Builder

The isolated Owner Question Bank module can define section labels (for example, General Awareness, Mathematics, and Technical Ability) and choose an active section before adding selected Question Bank items to the test editor. The selected section is stored as optional question metadata, validated on both client and server, and included in the public question set. The student CBT displays the section label with the current question. Questions without a section remain fully supported. This does not change answer-key privacy or scoring.

### Student activity search

The Owner Students module includes a client-side search across the currently loaded result pages. It matches the full student Firebase UID, test ID, and test title while displaying only a shortened UID. Use Load More to fetch older pages; the search automatically includes those newly loaded rows. This is an activity/result lookup, not a full student account directory: it does not expose phone numbers, email addresses, authentication records, or answer selections.

### Student-level performance summaries

Alongside the paginated attempt list, the Owner Students panel groups currently loaded result rows by student UID. It shows attempt count, distinct tests, average score, average correct percentage and most recent submission time. Selecting a summary filters the attempt list to that student. These are explicitly page-window summaries, not lifetime student records or a complete Firebase Authentication user directory. Pure aggregation and search behavior are covered by `node --test features/test-series/admin/tests/*.test.mjs`.


### Export loaded student results

The Owner Students panel exports only the currently loaded, search-filtered attempt rows as CSV. The export uses an explicit allow-list of result summary fields and excludes phone, email, authentication data, answer selections and answer keys. Spreadsheet formula prefixes are neutralized. Load More before exporting if older pages are required; this is not a lifetime or complete account export.


## Student results print / PDF report

The Students module provides **Print / Save Loaded Report as PDF** for the currently loaded rows after applying the active search. It opens a print-friendly, landscape report containing only the same allow-listed result summary fields as the CSV export. Use the browser print dialog's **Save as PDF** destination to create a PDF. This is a bounded snapshot of loaded rows, not a lifetime student history. HTML values are escaped and contact details, answer selections and answer keys are excluded. The report opens only after an Owner-authorized session is active.


## Test-wise performance exports

The Results & Ranking module can export its per-test aggregates as CSV or open a print-friendly report that the Owner can save as PDF. The report uses only test ID/title, attempts, average score, average correct percentage and timeout count. It inherits the server's bounded analytics window (latest 500 submitted results) and explicitly labels sampled data; it is not a lifetime report. The report escapes test titles and excludes student identifiers and contact data.


### Test-wise report search and sorting

The Owner Results & Ranking screen can filter the loaded per-test aggregates by test ID or title and sort by attempts, average score, average correct-answer percentage, or test name. CSV and print/PDF exports use the currently visible filtered and sorted test rows, while the report continues to label the bounded server-side sample. The filter is client-side over the returned analytics snapshot and does not expand the latest-500 server query.

### Live Razorpay order inspection (read-only)

For reconciliation requests that contain a provider order ID observed after a Firestore write failure, the Owner can request a live Razorpay lookup from the reconciliation queue. The Owner-only callable reads the request record, fetches the Razorpay order and its payment attempts using server-held API credentials, and compares the provider receipt, amount, currency, and server-owned UID/test notes against the reserved request. The response is a strict allow-list and excludes provider notes, contact details, email, and raw payloads. Each payment attempt must use a documented Razorpay status (created, authorized, captured, refunded, or failed), a positive INR amount, a valid matching order ID, and a boolean captured flag consistent with the status; unknown or contradictory provider rows fail closed. This operation is read-only: it does not retry order creation, mark a request resolved, release a student-test lock, grant access, or alter payment records. Requests without a known provider order ID remain support cases and cannot be inspected through this control. A captured provider payment must still be reconciled through the separately verified payment-ledger workflow; this lookup alone never grants access.
