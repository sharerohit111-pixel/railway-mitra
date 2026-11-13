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

The screen shows only records in `testSeriesPayments`, which are written by the verified captured-payment webhook. It is not a refund, dispute, failed-checkout, or reconciliation console; those workflows require separate audited server actions and must not be inferred from the absence of a captured-payment record.


## Owner student exam activity

The Students module calls `rmOwnerListStudentActivity`, an Owner-only, App-Check-protected callable. It reads submitted result summaries newest-first with cursor pagination (25 per page, maximum 50). The response is limited to student Firebase UID, test ID/title, score, correct/wrong/unattempted counts, total questions, timeout flag and submission time. It does not expose phone numbers, email addresses, answer selections, answer keys or raw attempt documents. The module clears rendered records when the Owner session is lost or logged out. Emulator coverage verifies that a normal student account is denied access to the Owner report.


## Owner result analytics

The Results & Ranking module calls the Owner-only `rmOwnerGetResultAnalytics` callable. It aggregates only the latest 500 submitted result summaries and reports the sampled attempt count, average score, average correct-answer percentage, timeout count and per-test aggregates. The response contains no student identifiers or personal contact data. When 500 records are present, the UI explicitly indicates that older records are outside this bounded snapshot; these values must not be described as lifetime totals. The report is cleared when the Owner session is lost.


## Owner Question Bank

The Question Bank module stores reusable question records separately in `testSeriesQuestionBank`. Owner-only callable APIs support saving and listing records with topic, chapter and folder metadata. Question text, options, explanation and correct option are stored server-side; student clients cannot list or write these records. The dashboard displays up to the 100 most recently updated entries. The dashboard supports adding, editing and deleting individual records. Bulk import/export and attaching selected bank entries to a test are follow-on work. Existing test creation/import remains unchanged.


### Bulk import and adding bank items to a draft

The Owner Question Bank supports XLSX, XLS, CSV and JSON bulk import (up to 100 records per request). Spreadsheet columns are `topic`, `chapter`, `folder`, `text` (or `question`), `optionA`–`optionF` or `options` as a JSON array, `correctIndex` (zero-based), and optional `explanation`. Blank or invalid correct indexes are rejected server-side. Each batch is validated before its Firestore batch write. The Question Bank list also offers **Add to Test**, which copies the selected question into the existing Test Management question editor; the Owner must still save the test through the normal draft/publish workflow. Direct browser Firestore access to `testSeriesQuestionBank` is denied.
