# Test Series performance and load-test runbook

## Current project hold — 2026-11-18

All synthetic load tests and capacity/load benchmarking, including the 20, 100, 250 and 500 student scenarios, are deferred until the project owner separately asks to resume them. Do not dispatch either manual workflow during this hold. The default input values are examples only, not authorization. This hold applies even though the workflows have a separate manual confirmation gate.

Do not run either synthetic harness locally or through GitHub Actions while this hold is active. Local emulator workloads are still synthetic load tests and are covered by the same deferral. No local harness command is provided while the hold is active.

Normal pull-request and branch CI may continue to run focused unit tests, single-student callable/Firestore emulator regressions and security-rules checks. Those checks must not invoke either load harness.

## Purpose

The isolated CBT backend has a design target of 1,000 registered students and 500 simultaneous examinees. The checked-in harnesses are development diagnostics for the current Firestore attempt-document answer-save pattern; they are not production capacity certification. No capacity or concurrency claim is made while the current hold remains active.

## Safety boundary

- The harnesses are emulator-only diagnostics and must never be pointed at staging or production Firebase.
- They create synthetic fixtures under dedicated test namespaces and are intended to clean them up in a `finally` path.
- Do not run billable cloud load tests, deploy functions, enable paid usage, or send real OTPs without separate explicit approval and a written cost estimate.
- Emulator results do not model production network latency, quotas, regional contention, Cloud Functions cold starts, billing, or real App Check/Auth overhead.
- The current deferral covers local emulator load runs as well as GitHub Actions dispatches.

## Current data path (design context only)

Each student has a separate `testSeriesAttempts/{attemptId}` document. `rmSaveAnswer` currently runs a Firestore transaction that reads the student's attempt and the shared question-set document, validates the question and deadline, then updates one nested field in the attempt's `answers` map. This describes the data path only; it is not an instruction to execute the synthetic harness.

## Deferred local harness

No staged or local execution is authorized while the hold is active. In particular, do not invoke the Firestore emulator harness, the authenticated callable harness, their Node entry points, or equivalent scripts. A local emulator target does not make a synthetic workload exempt from the user's deferral.

## Deferred GitHub Actions harnesses

The workflows **Test Series Firestore load test (local emulator only)** and **Test Series authenticated callable load test (local emulator only)** remain manual-only and retain a required `confirm_load_test` boolean defaulting to `false`. Their manual confirmation control is a technical safeguard, not standing authorization.

Do not dispatch either workflow during the current hold, even if its confirmation input is available. Ordinary pull-request/push CBT CI may run unit, single-student callable-emulator and Firestore Rules tests only; it must never invoke either load harness.

## Acceptance and interpretation (future review only)

If the owner separately asks to resume synthetic testing, first create a new written test plan that identifies the exact emulator-only target, approved scenarios, resource limits, cleanup checks, expected runtime and any cost implications. That future plan must be reviewed before any harness is run. Results would need to record configuration and cleanup status and investigate failed transactions, unexpected retries, rising p95/p99 latency or fixture-cleanup errors. A successful emulator result would remain a local diagnostic, not a production capacity claim.

No staged progression is authorized while this hold is active. The 20, 100, 250 and 500 student scenarios must not be run in sequence, individually or as a benchmark until the project owner separately asks to resume them.

## Release gates not covered by synthetic testing

- End-to-end authenticated callable behavior and App Check on supported Android/PWA clients in an approved non-production environment.
- Real-device offline/reconnect and autosave recovery.
- Firestore rules merged with current live rules and reviewed; the branch rules file is not approved for deployment.
- Razorpay test-mode order creation, webhook delivery, reconciliation, refund/support workflow and entitlement verification.
- Backup/restore, privacy/security, operational monitoring, retention and cost validation.
- Separate written approval before any billable deployment or future synthetic load test.
