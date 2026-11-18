# Student OTP reCAPTCHA lifecycle

The Student Portal now uses the shared `student-recaptcha.mjs` helper instead of keeping a module-global Firebase reCAPTCHA verifier.

- A verifier is cached only for the exact Firebase Auth instance and DOM container that created it.
- A failed SMS initiation clears the cached verifier so a deliberate retry constructs a fresh challenge.
- Logout clears the verifier synchronously before the asynchronous Firebase sign-out call.
- Every Firebase Auth state transition clears the previous verifier before the portal processes the new user state.
- Cleanup is best-effort. The helper removes its cache entry before calling Firebase `clear()`, so a detached-widget error cannot cause stale verifier reuse.

The existing Student Portal OTP flow guard still prevents stale asynchronous SMS requests from updating a newer session. Student callable authorization continues to require the server-verified Firebase phone sign-in provider. This browser lifecycle change does not relax App Check, alter Firebase Auth providers, send an OTP, or enable production enforcement.

Regression coverage is in `tests/student-portal-recaptcha-integration.test.mjs`; the helper's instance/container and cleanup behavior remains covered by `tests/student-recaptcha.test.mjs`. Both run through the isolated Test Series Student test command.
