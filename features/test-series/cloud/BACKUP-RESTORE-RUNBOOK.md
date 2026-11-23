# CBT Backup and Restore Runbook (Design — Not Yet Activated)

## Status and safety boundary

This document defines the proposed backup/recovery process for the isolated Railway Mitra Test Series backend. It is documentation only. It does not create a Firebase export job, enable billing, change IAM, deploy rules/functions, or modify any production data.

Before implementation, confirm the actual Firebase project, Firestore database location, available backup/PITR features and pricing. Obtain explicit approval and a cost estimate before enabling any billable backup/export schedule.

## Recovery objectives to agree before launch

The project owner must approve:
- Recovery Point Objective (RPO): maximum acceptable data loss window.
- Recovery Time Objective (RTO): maximum acceptable service restoration time.
- Retention period and storage budget.
- Who can initiate, approve and verify a restore.

Do not claim an RPO/RTO until a restore drill has measured it.

## Data classification and backup scope

Back up the complete CBT Firestore database consistently, not only selected UI-visible records. The relevant collections currently include:

- Test catalogue and published test snapshots: `testSeriesTests`
- Private answer keys: `testSeriesAnswerKeys`
- Student attempts and saved answers: `testSeriesAttempts`
- Active-session pointers: `testSeriesActiveSessions`
- Submitted results: `testSeriesResults`
- Paid entitlements: `testSeriesEntitlements`
- Free-attempt claims/configuration: `testSeriesFreeAttempts`, `testSeriesConfig`
- Payment orders, captured-payment ledger, provider events and refunds: `testSeriesPaymentOrders`, `testSeriesPayments`, `testSeriesPaymentEvents`, and the refund ledger collections
- Payment request reservations, locks, reconciliation and audit records
- Question bank and any other CBT-owned collections present at implementation time

The list must be reconciled against the deployed schema before the first backup. Do not assume this list is exhaustive.

Also preserve version-controlled deployment artefacts separately: Functions source, Firestore Rules, indexes, environment-variable names (never secret values), release/commit identifiers and the approved deployment checklist. Store actual secrets only in the approved secret manager; never include them in exports, logs or this repository.

## Backup design

1. Prefer a supported managed Firestore backup/PITR facility when available for the confirmed database and region; evaluate its retention, restore granularity and cost.
2. If scheduled exports to Cloud Storage are selected, use a dedicated restricted bucket and a documented schedule. Confirm that the export mechanism captures every required collection and is compatible with the selected database mode.
3. Keep backup storage separate from application write permissions. The application runtime must not be able to delete or overwrite backups.
4. Restrict backup/restore IAM to named operational identities. Require MFA and audit all access.
5. Use provider-supported encryption at rest and TLS in transit. Document key ownership and key-recovery procedures.
6. Record an immutable backup manifest: project/database identifier, export timestamp, source commit/release, collection scope, operation result, object generation/checksum where supported, and operator.
7. Alert on missed/failed backups, insufficient storage, permission failures and retention-policy failures. A scheduled job is not considered healthy merely because it exists.
8. Apply an approved retention policy and verify that lifecycle deletion cannot remove the only recoverable copy.

## Restore procedure (never restore directly over production by default)

1. Declare an incident and freeze risky administrative changes. Preserve logs and current state before any recovery operation.
2. Identify the last known-good backup and verify its manifest, integrity and source project/database.
3. Restore into a separate isolated recovery project/database first. Never point the student or Owner clients at it.
4. Verify collection counts and representative documents; test referential consistency between tests, answer keys, attempts, results, entitlements and payment ledgers.
5. Run application compatibility checks using the matching Functions release and rules/index definitions.
6. Validate student access and scoring with synthetic test accounts. Confirm answer keys remain inaccessible to student clients.
7. Reconcile payment orders, captures, refunds and entitlements against the authoritative Razorpay records before restoring paid access. A database restore is not proof that a payment remains captured or unrefunded.
8. Check active attempts and timers. Define an explicit policy for attempts started after the backup timestamp; do not silently revive expired or already-submitted attempts.
9. Obtain owner approval for the recovery plan and cutover. Preserve the pre-restore production state and maintain a rollback path.
10. After cutover, monitor errors, payment reconciliation, student sessions and audit logs. Record the actual recovery duration and data-loss window.

## Critical invariants

- Never restore an old payment ledger and blindly grant paid access. Reconcile captured payment and cumulative refund state first.
- Never expose answer keys in student responses or browser-readable storage.
- Never delete current production data as part of a test restore.
- Never overwrite the only backup with a restore output.
- Do not manually remove unresolved payment locks as a recovery shortcut; use a separately reviewed reconciliation procedure.
- Keep Owner access restricted to the configured server-side UID, verified phone MFA and App Check.
- Treat Firestore Rules in this branch as a draft. Merge with the live rules only after retrieving and reviewing the complete current ruleset and obtaining explicit approval.

## Restore-drill acceptance checklist

A restore drill is complete only when the team records:
- Backup selected and verified, including timestamp and manifest.
- Isolated target project/database and matching application release.
- Collection coverage and integrity checks passed.
- Student-safe question delivery and server-side scoring tests passed.
- Payment/refund/entitlement reconciliation completed without granting access from stale data.
- Active-attempt recovery policy exercised.
- Measured restore duration and measured data-loss window.
- Owner sign-off, issues found and corrective actions.

## Implementation gates

- [ ] Confirm Firebase project, Firestore database, region and current billing plan.
- [ ] Approve RPO, RTO, retention and monthly backup budget.
- [ ] Select managed backup/PITR or scheduled export based on supported features and cost.
- [ ] Configure least-privilege backup bucket/IAM and audit logging.
- [ ] Implement monitored backup schedule and immutable manifests.
- [ ] Perform isolated restore drill and document measured results.
- [ ] Review live Firestore Rules and deployment configuration separately.
- [ ] Obtain explicit approval before any production activation or cutover.

Until these gates pass, backup/restore remains a production-readiness blocker.
