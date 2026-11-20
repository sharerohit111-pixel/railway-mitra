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


## Provider-link session binding

Google and Email/Password provider linking is now bound to the Firebase UID that started the operation. The adapters re-check `auth.currentUser` after the asynchronous Firebase link call; a sign-out or account switch causes the completion to fail closed. The dashboard also suppresses both stale success and stale error status updates so they cannot appear in a replacement Owner session.

Provider linking now shares the same in-memory operation gate as Google/Email sign-in and phone-MFA enrollment. The link buttons are disabled while any Owner authentication operation is pending, preventing competing provider-link and OTP flows from racing over one Auth session.

Focused regression command:

```bash
node --test features/test-series/admin/tests/owner-provider-linking.test.mjs
```

This is client-side session-race protection only. Backend Owner UID, approved primary-provider, verified phone-MFA and App Check checks remain authoritative. No Firebase configuration, OTP delivery, deployment or production authorization setting is changed.

## Asynchronous Owner dashboard initialization failure handling

The Owner session observer treats the onAuthorized callback as part of the authorization-to-workspace transition. If a dashboard initializer returns a Promise, the observer now waits for it and routes a rejection through the same fail-closed cleanup used for a rejected server authorization: report the error on a best-effort basis and sign out only the UID belonging to the still-current session.

If the Owner signs out, switches accounts, or the observer is disposed while dashboard initialization is pending, a later rejection from that retired callback is ignored. It cannot sign out the replacement account or overwrite its status. The existing generation fence remains authoritative for stale completions.

Focused regression command:

```bash
node --test features/test-series/admin/tests/owner-session.test.mjs
```

This is client-side lifecycle hardening only. It does not change the server-side Owner UID/provider/phone-MFA/App Check checks, Firebase configuration, OTP delivery, deployment, or privileged backend access.

## Async Owner session-transition callback handling

The Owner session observer now treats asynchronous workspace cleanup and MFA-setup callbacks as part of the current authorization transition. It invokes `onChecking` synchronously first so the existing dashboard can hide privileged content immediately, then waits for any returned Promise before inspecting MFA or calling the server authorization endpoint. If that cleanup rejects, the current UID is reported and signed out; a retired account's late cleanup result cannot authorize or sign out a replacement account. An asynchronous `onMfaRequired` failure also fails closed. Signed-out cleanup remains best-effort, but rejected Promises are consumed and reported instead of becoming unhandled page errors.

Focused regression command:

```bash
node --test features/test-series/admin/tests/owner-session.test.mjs
```

This protects the browser-side session lifecycle only. The backend's exact Owner UID, approved primary provider, verified phone-MFA claim and App Check checks remain authoritative. No Firebase configuration, OTP delivery, deployment or privileged backend access is changed.
