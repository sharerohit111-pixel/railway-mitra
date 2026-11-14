# Local CBT Emulator Backup/Restore Drill

## Purpose

This is a local-only rehearsal for synthetic Test Series Auth and Firestore emulator data. The automated smoke test verifies that a synthetic Auth user and an attempt-shaped Firestore document survive an Emulator Suite export/import round trip. It does not back up Firebase production, staging, Razorpay, real student data, deployed code, Functions runtime, or secrets. It is not a substitute for managed Firestore backups or a production restore drill.

## Isolated emulator configuration

Use `firebase.test-series-cbt-emulator.json` for this drill. It defines exactly one Functions codebase:

- Source: `features/test-series/cloud/functions`
- Codebase: `test-series`
- Firestore rules: `features/test-series/cloud/firestore.rules`
- Auth emulator: `127.0.0.1:9099`
- Firestore emulator: `127.0.0.1:8080`
- Functions emulator: `127.0.0.1:5001`

The config intentionally omits the repository's default/GDCE Functions source. The CBT workflow validates that the config contains exactly this one codebase before starting the emulators. The backup/restore smoke step starts only Auth and Firestore.

## Prerequisites

- Node.js 22
- Java 21
- Firebase CLI
- Dependencies installed only for the isolated CBT Functions package:

```bash
npm --prefix features/test-series/cloud/functions install --no-audit --no-fund
```

## Synthetic local export/import round trip

Run from the repository root. The exact demo project ID and loopback emulator endpoints are mandatory. Keep the export outside the repository checkout.

```bash
BACKUP_ROOT="$(mktemp -d)"
BACKUP_DIR="$BACKUP_ROOT/export"

npx firebase-tools emulators:exec \
  --config firebase.test-series-cbt-emulator.json \
  --project demo-railway-mitra-cbt \
  --only auth,firestore \
  --export-on-exit="$BACKUP_DIR" \
  "node features/test-series/cloud/functions/tests/local-emulator-backup-restore-smoke.js seed"

test -s "$BACKUP_DIR/firebase-export-metadata.json"

npx firebase-tools emulators:exec \
  --config firebase.test-series-cbt-emulator.json \
  --project demo-railway-mitra-cbt \
  --only auth,firestore \
  --import="$BACKUP_DIR" \
  "node features/test-series/cloud/functions/tests/local-emulator-backup-restore-smoke.js verify"

rm -rf "$BACKUP_ROOT"
```

The fixture refuses to run unless the project is exactly `demo-railway-mitra-cbt` and both SDK hosts are exactly `127.0.0.1:9099` and `127.0.0.1:8080`. It creates one synthetic Auth user and one document in the test-only `testSeriesBackupRestoreDrill` collection. The verify phase checks both records after import and deletes them from the restored emulator. No OTP is sent and no carrier gateway is contacted.

## Automated CI

The `Test Series CBT emulator tests` workflow runs the same seed/export/import/verify sequence in `RUNNER_TEMP`. Its main CBT test run starts Auth, Firestore and only the Test Series Functions codebase. The backup/restore phase starts Auth and Firestore only. The workflow does not install or start the default/GDCE Functions source, deploy anything, use Firebase project credentials, enable billing, or contact production services.

## What this drill proves—and what it does not

A successful round trip proves only that the tested synthetic Auth identity and Firestore fixture can be exported and restored by the configured local emulators. It does not validate:

- Production or staging backup schedules, retention, IAM, monitoring, or restore objectives.
- Cloud Functions source/runtime, environment configuration, secrets, or deployed versions.
- Razorpay orders, captures, refunds, or external payment reconciliation state.
- Production App Check enforcement, real OTP delivery, billing, or 500-user capacity.
- Completeness of all CBT collections or the safety of restoring a live database.

The separate CBT emulator tests remain responsible for callable behavior and Firestore Rules regression tests. Production backup activation still requires confirmed Firebase project details, approved cost/retention, least-privilege IAM, a monitored backup schedule, and a separately approved isolated cloud restore drill.
