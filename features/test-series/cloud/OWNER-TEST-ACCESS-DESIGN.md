# Owner Test Access Management — Security Design

Status: design only. The Owner dashboard entry remains disabled. No callable, UI action, Firestore schema, or student access behavior is activated by this document.

## Goal

Allow the verified Owner to grant or revoke one student's access to one specific test, with an immutable audit trail. This is not a global subscription and must not bypass the existing paid-payment entitlement checks.

## Authorization boundary

Every callable must:
1. Require Firebase Authentication.
2. Verify the exact configured `OWNER_UID`.
3. Verify the permitted primary provider (`google.com` or `password`).
4. Verify the phone-MFA second-factor claim.
5. Validate all identifiers and enums before any Firestore reads or writes.
6. Never accept a target UID, role, actor UID, audit timestamp, or grant status from client-authored metadata as authoritative.

The client must never write directly to access-control or audit collections. Firestore rules must deny client writes and reads unless a reviewed, narrowly scoped Owner read path is explicitly required.

## Proposed data model

### `testSeriesManualAccess/{uid_testId}`

One current manual access record per student/test pair:
- `uid`: authenticated target student UID
- `testId`: published test identifier
- `status`: `active` or `revoked`
- `source`: fixed server value `owner_manual`
- `createdAt`, `updatedAt`: server timestamps
- `createdBy`, `updatedBy`: server-derived Owner UID
- `reason`: required bounded support/admin reason; no sensitive personal details
- `expiresAt`: optional server-validated timestamp; null means no expiry only if product policy explicitly permits it

The document ID must be deterministically derived from validated UID and test ID using an unambiguous encoding or hash. A client-supplied document ID is never trusted.

### `testSeriesAccessAudit/{eventId}`

Append-only audit events:
- `targetUid`, `testId`
- `action`: `grant` or `revoke`
- `actorUid`: server-derived Owner UID
- `reason`: same bounded reason
- `previousStatus`, `newStatus`
- `createdAt`: server timestamp
- `requestId`: bounded idempotency key scoped to Owner + target + test + action

Audit event creation and current-access mutation must commit in one Firestore transaction. No callable may update or delete old audit records.

## Proposed callable contract

- `rmOwnerSetStudentTestAccess`: Owner-only. Input: `studentUid`, `testId`, `action`, `reason`, `requestId`, optional `expiresAt`. Revalidate that the student exists and the target test exists and is published. Reject attempts to grant access to an unpublished/deleted test. Replaying the same request ID with the same fingerprint returns the original outcome; reuse with different input fails.
- `rmOwnerListStudentTestAccess`: Owner-only, bounded pagination, optional exact student/test filters and status filter. Return an explicit allow-list; never return phone/email, private payment payloads, auth tokens or internal fingerprints.
- `rmOwnerListStudentAccessAudit`: Owner-only, bounded pagination, filter by student/test/action. Read-only; return only the allow-listed audit fields.

Do not create a callable that accepts arbitrary collection paths or arbitrary Firestore patches.

## Entitlement precedence — critical

Manual access is a separate source and must not overwrite, synthesize, or mutate:
- Razorpay payment orders, payment ledger, refund records or payment events
- paid entitlements created by verified capture webhooks
- free first-attempt claim records
- active exam attempts or submitted results

Student access resolution must explicitly distinguish:
1. verified paid entitlement (existing strict payment/order/refund consistency checks remain authoritative);
2. configured free first-attempt claim (existing one-time claim rules remain authoritative);
3. active Owner manual grant for the exact student + test, within its expiry;
4. otherwise denied.

A manual grant must never mark a payment as paid, unlock a refunded payment, reset a consumed free claim, or extend an in-progress attempt. Revoking manual access blocks future starts/resumes only according to a reviewed policy; it must not silently delete or rewrite an already-started attempt. The final product policy for active attempts at revoke time must be explicit and tested before enabling the feature.

## UI requirements (currently disabled)

Owner screen should provide:
- exact student UID lookup (avoid broad phone/email exposure)
- test selector limited to published tests
- grant/revoke action with mandatory reason and optional expiry
- current status and expiry
- audit history, actor and timestamp
- confirmation step before revoke
- clear distinction between paid, free-claim and Owner-manual access

Do not enable the existing disabled Test Access Management tile until the backend, rules, UI, audit and emulator tests are complete.

## Required tests before implementation can be enabled

- Non-owner, wrong primary provider, missing MFA and wrong Owner UID denied before Firestore access.
- Missing/unpublished test and unknown student rejected.
- Grant/revoke writes current record + audit event atomically.
- Transaction retry and same request ID are idempotent; conflicting request-ID reuse is rejected.
- Audit records cannot be edited/deleted through any callable or client rules.
- Expired grants do not authorize a start.
- Revoked grants do not authorize a new start.
- Paid entitlement remains subject to captured payment + paid order + refund consistency checks.
- Manual grant cannot unlock a fully refunded or inconsistent payment.
- Manual grant cannot bypass the one-time free claim or change the configured free test.
- Revoke behavior for an active exam is explicit and regression-tested.
- Pagination is bounded and stable; responses are allow-listed and contain no PII beyond the exact UID filter.
- Student cross-account/session transitions cannot leak access or audit data.

## Release gates

Keep this feature disabled until:
- the product policy for expiry and in-progress attempts is approved;
- callables and Firestore rules are implemented and reviewed;
- emulator tests pass;
- Owner UI and Student access resolution are integrated;
- staging end-to-end checks pass with a dedicated staging project;
- the user explicitly approves any billable staging or production action.

This document is not evidence that manual test access currently works.
