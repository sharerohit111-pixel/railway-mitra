# Local CBT Emulator Backup/Restore Drill

## Purpose

This is a local-only rehearsal for the Test Series Auth and Firestore emulators. Firebase Emulator Suite export/import covers supported emulator data (including Auth and Firestore); it does not snapshot the running Cloud Functions process, deployed code, secrets, Razorpay state, production/staging Firebase, or real student data. It is not a substitute for managed Firestore backups or a production restore drill.

## Existing repository configuration

- Emulator configuration: `firebase.test-series-emulator.json`
- Firestore emulator port: `8080`
- Auth emulator port: `9099`
- Functions emulator port: `5001`
- Isolated CBT Functions package: `features/test-series/cloud/functions`

The emulator configuration uses the CBT Firestore Rules file and both Functions codebases. Keep this drill isolated from production credentials and projects.

## Prerequisites

- Node.js 22
- Java 21
- Firebase CLI
- Dependencies installed for both `functions` and `features/test-series/cloud/functions`
- A clean local working copy of the repository

Do not put exports inside a tracked source directory. Use a local ignored directory such as `.local-emulator-backups/cbt-drill-YYYYMMDD-HHMMSS`. Confirm the directory is ignored before running the drill; never commit emulator exports.

## Create a synthetic local snapshot

1. Start the emulators with the isolated configuration:

```bash
npx firebase-tools emulators:start --config firebase.test-series-emulator.json --project demo-railway-mitra-cbt
```

2. In a separate terminal, run only synthetic emulator tests/fixtures against the local endpoints. Do not import production data or use real student/payment records.

3. While the emulators are still running, open a second terminal and export the current local state:

```bash
npx firebase-tools emulators:export .local-emulator-backups/cbt-drill-YYYYMMDD-HHMMSS --config firebase.test-series-emulator.json --project demo-railway-mitra-cbt
```

Alternatively, start the emulators with `--export-on-exit=.local-emulator-backups/cbt-drill-YYYYMMDD-HHMMSS` and stop them cleanly with Ctrl+C; the CLI then exports on shutdown. Do not run both methods against the same export directory in one drill.

4. Confirm the export command (or clean shutdown export) completed successfully and inspect the export directory, including `firebase-export-metadata.json`. Confirm the manifest lists the expected supported emulator services; the current config's relevant persisted data is Auth and Firestore. Record the local commit SHA, timestamp, test scenario and export outcome in a local drill note. Keep the export directory out of Git.

## Restore into a clean local emulator

1. Stop any running Firebase emulators.
2. Move the previous local emulator state aside; do not overwrite the only copy.
3. Start the emulator using the saved export:

```bash
npx firebase-tools emulators:start --config firebase.test-series-emulator.json --project demo-railway-mitra-cbt --import=.local-emulator-backups/cbt-drill-YYYYMMDD-HHMMSS
```

4. Run the CBT unit and Firestore Rules emulator tests using the same isolated project ID and test configuration.
5. Verify the expected synthetic tests, question records, attempts and results are present; verify answer keys remain inaccessible to student rules/client paths.
6. Stop the emulator and preserve the drill notes. Delete local synthetic exports only after the drill is accepted and no longer needed.

## Safety checks

- Use a clearly synthetic project ID beginning with `demo-`; do not pass a real Firebase project ID.
- Never run these commands with production credentials or a production project alias.
- Never import real users, phone numbers, payment records, provider secrets or production answer keys.
- Never interpret emulator export success as proof that production backups are enabled.
- Never restore into a live database as part of this drill.
- This process does not validate Razorpay external state, cloud IAM, production App Check, real OTP delivery, billing, or 500-user capacity.

## Acceptance record

Record:
- Source commit SHA and local timestamp.
- Emulator project ID and configuration file.
- Synthetic fixture/test scenario.
- Export command result and saved directory.
- Restore command result.
- CBT tests and Firestore Rules test outcomes.
- Any missing records or rule regressions.
- Operator and review outcome.

A successful local drill proves only that the configured supported emulator data (Auth/Firestore for this setup) can be exported/imported for the tested local scenario. Functions source and runtime are recreated from the checked-out code and are not part of the emulator data export. Production backup activation still requires confirmed Firebase project details, approved cost/retention, least-privilege IAM, a monitored backup schedule and a separately approved isolated cloud restore drill.
