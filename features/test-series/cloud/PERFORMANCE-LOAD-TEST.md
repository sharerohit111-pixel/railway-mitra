# Test Series performance and load-test runbook

## Purpose

Prepare the isolated CBT backend for the design target of 1,000 registered students and 500 simultaneous examinees. The checked-in harness measures the current Firestore attempt-document answer-save pattern under a synthetic emulator workload. Each synthetic student now saves every question in the paper in each wave, with students running concurrently and each student's answers saved sequentially. It is a development diagnostic, not a production capacity certification.

## Safety boundary

- The harness refuses to run unless `FIRESTORE_EMULATOR_HOST` points to local port 8080.
- It creates fixtures under a unique `testSeriesLoadTestRuns/{runId}` namespace and deletes them in a `finally` cleanup.
- It must not be pointed at a staging or production Firestore instance.
- Do not run billable cloud load tests, deploy functions, enable paid usage, or send real OTPs without explicit approval and a written cost estimate.
- Emulator results do not model production network latency, quotas, regional contention, Cloud Functions cold starts, billing, or real App Check/Auth overhead.

## Current data-path being measured

Each student has a separate `testSeriesAttempts/{attemptId}` document. `rmSaveAnswer` currently runs a Firestore transaction that reads the student's attempt and the shared question-set document, validates the question and deadline, then updates one nested field in the attempt's `answers` map. The harness approximates this transaction pattern with synthetic student IDs and separate attempt documents. It does not call the deployed callable endpoint.

## Run locally

From `features/test-series/cloud/functions` after installing dependencies and starting the local Firestore Emulator:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
GCLOUD_PROJECT=demo-railway-mitra-load \
npm run load:emulator
```

Defaults: 500 synthetic students, 5 full-paper save waves per student (125,000 save transactions at 50 questions), 50 questions, and concurrency 500. The emulator must already be running. The script prints per-wave duration, total successful saves, failures, throughput and p50/p95/p99/max transaction latency.

Optional bounded settings:

- `LOAD_STUDENTS`: 1–500 (default 500)
- `LOAD_WAVES`: 1–20 (default 5)
- `LOAD_QUESTIONS`: 1–500 (default 50)
- `LOAD_CONCURRENCY`: 1–`LOAD_STUDENTS` (default equal to student count)

Start with a small run, e.g. `LOAD_STUDENTS=25 LOAD_WAVES=1 LOAD_CONCURRENCY=10`, then increase to the full emulator scenario. Each wave now performs `students × questions` answer-save transactions. Do not treat a successful emulator run as permission to launch a real-user load test.

## Acceptance and interpretation

Record the run configuration and result JSON for each run. Investigate any failed transaction, unexpected retries, rising p95/p99 latency, or cleanup error. Compare smaller and larger concurrency levels rather than relying on one run. Because this harness uses emulator-only direct Firestore transactions, a separate approved staging exercise is required to measure callable latency and real Firebase limits.

If attempt-document growth, contention, or p95/p99 latency is unacceptable, evaluate moving answer writes to per-question documents or a dedicated answer-write service. Preserve server-side ownership checks, question membership validation, deadline enforcement, and atomic result scoring in any redesign.

## Release gates not covered by this harness

- End-to-end authenticated callable load test in an approved staging project.
- App Check behavior on supported Android/PWA clients.
- Real-device offline/reconnect and autosave recovery.
- Firestore rules merged with current live rules and reviewed; the branch rules file is not approved for deployment.
- Razorpay test-mode order creation, webhook delivery, reconciliation, refund/support workflow and entitlement verification.
- Cost estimate and explicit approval before any billable deployment or load test.
## Run through GitHub Actions

A manual-only workflow is available at **Actions → Test Series Firestore load test (local emulator only) → Run workflow**. It defaults to 25 students, 2 full-paper waves and 10 workers when manually dispatched. The marker-file push trigger runs 500 students, 1 full-paper wave and 500 workers. Inputs are bounded (students 1–500, waves 1–20, concurrency 1–students). It starts only the GitHub-hosted local Firestore Emulator; it does not connect to a Firebase project, deploy services, send SMS, or create billable cloud traffic. Start with the defaults, inspect the `LOAD_TEST_RESULT` output, then increase the emulator workload deliberately. The workflow is manual-only and does not run on every push or pull request.
