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


## Serialized Owner authentication and cancellable OTP prompt

Google sign-in, Email + Password sign-in, and first-time Phone MFA enrollment share one in-memory authentication-operation gate. While any of these flows is waiting on Firebase or the Owner OTP prompt, the other authentication entry buttons remain disabled; a second provider attempt cannot replace the pending OTP resolver or compete for the same reCAPTCHA container.

The OTP panel includes an explicit **Cancel sign-in** action. Cancelling rejects the pending OTP prompt, hides and clears the panel, and lets the existing MFA helper run its `finally` cleanup so the reCAPTCHA verifier is discarded. An Auth-state transition also cancels any outstanding prompt before the dashboard continues session handling. The gate releases after either success, failure or cancellation so a deliberate retry can start.

Focused regression command:

```bash
node --test features/test-series/admin/tests/owner-auth-operation-gate.test.mjs
```

This only serializes browser authentication flows. Firebase MFA challenges, the server-side Owner UID/provider/second-factor checks and App Check remain authoritative; it does not send an OTP or change Firebase configuration.
