# Railway Mitra CBT — Integration Review

Review scope: isolated Test Series modules on `feature/test-series-cloud-access`.
This is a source-level integration review, not a live Firebase or real-device certification.

## Confirmed module wiring

- Student standalone portal loads `student/portal.js` as an ES module and provides the login, catalogue and results view containers.
- Student portal links catalogue and dashboard views; catalogue calls the cloud student client for published tests and starts free, paid-checkout or already-unlocked flows.
- Student dashboard reads the signed-in student's recent submitted results through the cloud client.
- Leaderboard implementation exists as a separate module, but the inspected student portal navigation exposes only Available Tests and My Results. A user-facing leaderboard entry point is not confirmed by this review.
- Owner standalone portal loads `admin/owner-portal.js`, fetches `admin-dashboard.html`, and initializes `admin-dashboard.js` with Firebase Auth and Functions.
- Owner dashboard exposes Test Management, Question Bank, Students, Payments and Results/Ranking. Test Access Management is explicitly disabled. Cloud Backup and System Settings are explicitly disabled.
- Student and Owner portals are standalone pages under the feature folder; this review does not establish that they are linked from the main Railway Mitra application.

## Integration gaps / next work

1. **Student leaderboard entry point — implemented in the isolated portal:** each submitted result now exposes a `View Test Leaderboard` action. The portal passes that result's `testId` to the existing leaderboard module, checks the active student-session/view generation before navigation, and provides a return path to My Results. The dashboard remains a bounded latest-100 history; ranking is loaded separately from the server. Functions Validation and CBT Emulator workflows passed on the code commit `8c4e9d4153229801fa4c0c6a008475437207f288`; later documentation-only commits are not themselves runtime tests.
2. **Owner access management:** keep the disabled UI disabled until a complete server-authorized module exists for grants/revocations, audit history and safeguards. Do not infer access from client state.
3. **Backup and system settings:** keep disabled until export/restore, retention, auditability, restore verification and Owner authorization are implemented and tested. Never expose backup controls as functional placeholders.
4. **Main-app entry points:** integration into the main app is a separate controlled step. Do not alter existing navigation or authentication guard without explicit approval and regression review.
5. **End-to-end verification:** run student OTP, Owner provider + phone MFA, create/publish test, question import, free claim, exam save/resume/submit, result/leaderboard, payment staging and support reconciliation against a dedicated Firebase staging project only after project identity, rules merge and cost approval are confirmed.
6. **Capacity validation:** local emulator checks are not a production capacity claim. Run staged local emulator loads first; staging cloud load requires a written cost estimate and explicit approval.

## Safety and release boundaries

- Keep live payments, production OTP, production deployment and PR merge disabled pending explicit approval.
- Do not deploy the draft Firestore rules as-is. Merge them with the current live rules and review all existing collection permissions first.
- Keep the current development authentication behavior unchanged.
- No claim is made here that 500 concurrent examinees have been proven.

## Current CI evidence

The latest successful CBT Emulator Tests and Functions Validation runs available during this review were run on commit `bdc972c4e7e1288fd83eb7c27bfa16c75e29b57f`. The current PR head must receive its own successful CI runs before it is described as fully verified.
