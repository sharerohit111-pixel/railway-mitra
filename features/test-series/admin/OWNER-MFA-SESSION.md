# Owner phone-MFA enrollment session binding

Owner phone-MFA enrollment is now orchestrated by the isolated `owner-mfa-session.mjs` helper and bound to the Firebase UID that starts the operation.

- Capture the authenticated Owner before requesting an MFA session.
- Re-check the same UID after MFA session acquisition, phone challenge creation and the OTP prompt.
- Enroll against the revalidated Owner object captured for this operation, never an unrelated replacement account in `auth.currentUser`.
- Re-check after Firebase enrollment so a stale completion is not reported as success in a different account's UI.
- Clear the Owner reCAPTCHA verifier in `finally`, including failures and account changes.

If the account signs out or changes during enrollment, the flow fails closed and the Owner must restart from the intended account. The helper injects Firebase operations so these account-switch boundaries are covered by deterministic unit tests.

Focused regression command:

```bash
node --test features/test-series/admin/tests/owner-mfa-session.test.mjs
```

This is client-side race protection only. Backend Owner authorization remains based on the exact configured Owner UID, approved primary provider, verified phone-MFA claim and App Check. This change does not configure Auth providers, send OTPs, enable App Check enforcement, change Firebase projects, or deploy anything.
