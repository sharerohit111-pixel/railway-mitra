# Railway Mitra — Departmental Exam System

## Scope
- Railway Departmental Exams is the active product area.
- First implementation phase: GDCE only.
- GDCE JE streams: Civil, Electrical, Mechanical.
- Separate GDCE stream: Train Manager.
- Each stream owns three independent libraries: Mock Tests, Previous Year Paper Tests, Practice Sets.
- LDCE is deliberately deferred until its requirements are supplied.
- Other Exams remains Under Progress and will later link to a separate application.

## Isolation
All new code lives under `features/exams/`. The home page receives only one entry card and one isolated stylesheet reference. Existing calculators, employee modules, authentication code and service-worker logic are not modified.

## Test configuration
Each test record must independently store: question count, duration, positive marks per question, negative marks per wrong answer, source paper/year, access mode, price, publication state and solution availability. First mock test per stream is intended to be free. All other tests are paid; the ₹300 subscription unlocks all tests in the app. Study material is separately priced per item by the administrator.

## Question workflow
1. Preserve the source PDF and its paper metadata.
2. Extract and solve every question.
3. Add a verified correct option and explanation to each question.
4. Flag uncertain questions for owner review; do not publish unverified answers.
5. Publish only after review approval.

## Data model (Firestore design)
- `examStreams/{streamId}`: stream metadata and active state.
- `examTests/{testId}`: exam type, stream, category, paper/year, test settings, access and publication state.
- `examTests/{testId}/questions/{questionId}`: question, options, answer, explanation, subject/topic, source and verification status.
- `examAttempts/{attemptId}`: candidate UID, test ID, timestamps, answers, navigation states, scoring breakdown and analytics.
- `studyMaterials/{materialId}`: title, stream, file reference, description and independent price.
- `userEntitlements/{uid}`: subscription entitlement and expiry, written only by trusted backend after payment verification.
- `adminAuditLogs/{logId}`: administrator changes and timestamps.

## Security gates before live data writes
The current Firestore project was previously observed in production mode with restrictive rules. Do not enable client-side writes until rules are deployed. Admin access must use Firebase Authentication plus a trusted owner role/custom claim. Correct answers should not be sent to the candidate before submission. Payment verification and entitlement changes must run in trusted server code; the AI assistant must have no payment/refund/gateway permissions.

## Candidate attempt records
Persist one attempt per candidate and test. Preserve configured test settings with the attempt snapshot so later edits to a test do not rewrite historical scoring. Score formula: (correct × positive marks) − (wrong × negative marks). Keep unattempted count, accuracy, time spent and question-wise review data.

## Current phase status
Navigation and catalogue structure only. No real paper or question has been published. Admin controls are intentionally not active until backend authorization and Firestore rules are implemented and tested.
