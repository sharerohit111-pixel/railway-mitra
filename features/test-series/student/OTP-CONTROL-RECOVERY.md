# Student OTP control recovery

The Student Portal invalidates an in-flight SMS send or phone-code confirmation when Firebase Auth changes, the student signs out, or a previous sign-out is retried. The generation guard correctly prevents a stale request from updating the new session. A stale request can nevertheless leave its button text at "Sending OTP…" or "Verifying…" because its finally block must not unlock controls owned by a newer authentication generation.

The isolated otp-control-state helper keeps the button state consistent:

- Locking disables both OTP controls and preserves the current busy label.
- Unlocking enables both controls and restores only the known stale busy labels to their idle labels.
- Unknown or missing control state is rejected instead of silently unlocking the UI.
- The Student Portal uses the helper on auth-state transitions and sign-out recovery. A late completion still cannot overwrite a newer generation.

Focused regression command:

    node --test features/test-series/student/tests/otp-flow-guard.test.mjs

This is a browser UI-state recovery safeguard only. Firebase phone sign-in claims, callable authorization, App Check, server-side attempt ownership and deadlines remain authoritative. It does not send OTPs, change Firebase configuration, or enable enforcement.

## Pending sign-out retry is bound to the same Student UID

A retry button may remain visible briefly while Firebase Auth is delivering an account-change event. The retry handler now checks that the currently authenticated UID still matches the persisted pending-sign-out marker before calling Firebase `signOut`. If another account is current, the stale retry is hidden and must not sign out that replacement account.

After a sign-out operation settles, OTP controls are unlocked only when `auth.currentUser === null`. If an authenticated account exists, the auth-state observer retains control of the OTP lock until that identity's phone-provider claim has been checked. This prevents a late sign-out continuation from unlocking OTP controls during a replacement session's verification.

Focused regression command:

```sh
node --test features/test-series/student/tests/otp-flow-guard.test.mjs
```

## Persistent marker cleanup when storage removal is restricted

The logout recovery helper verifies that `removeItem` actually removed the pending UID marker. If removal throws or silently leaves the key behind, it attempts a verified empty-string tombstone instead. Empty strings cannot be created by the marker's UID validator and are read as no pending marker. If both removal and tombstone writing fail, cleanup reports failure and any still-persisted UID continues to block that same restored session; it does not silently treat an uncleared marker as removed.

Focused regression command:

```sh
node --test features/test-series/student/tests/logout-recovery.test.mjs
```
