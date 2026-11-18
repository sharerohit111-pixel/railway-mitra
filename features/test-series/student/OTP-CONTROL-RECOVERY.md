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
