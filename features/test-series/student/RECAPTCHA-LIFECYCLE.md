# Student OTP reCAPTCHA lifecycle

The Student Portal now uses the shared `student-recaptcha.mjs` helper instead of keeping a module-global Firebase reCAPTCHA verifier.

- A verifier is cached only for the exact Firebase Auth instance and DOM container that created it.
- A failed SMS initiation clears the cached verifier so a deliberate retry constructs a fresh challenge.
- Logout clears the verifier synchronously before the asynchronous Firebase sign-out call.
- Every Firebase Auth state transition clears the previous verifier before the portal processes the new user state.
- Cleanup is best-effort. The helper removes its cache entry before calling Firebase `clear()`, so a detached-widget error cannot cause stale verifier reuse.

The Student Portal OTP flow guard also makes SMS initiation single-flight: a second send is rejected until the active Firebase challenge request settles, and a deliberate retry can begin after its lock is released. Logout or an Auth state transition invalidates the old generation, so a late completion cannot store a stale confirmation or release a newer request's lock. Student callable authorization continues to require the server-verified Firebase phone sign-in provider. This browser lifecycle change does not relax App Check, alter Firebase Auth providers, send an OTP, or enable production enforcement.

Regression coverage is in `tests/student-portal-recaptcha-integration.test.mjs`; the helper's instance/container and cleanup behavior remains covered by `tests/student-recaptcha.test.mjs`. Both run through the isolated Test Series Student test command.


## Serialized OTP verification

The generation guard also treats zero, null, non-integer and otherwise inactive tokens as stale. Both `finishSend` and `finishVerification` require the exact current positive generation as well as ownership of the corresponding in-flight lock; an idle or stale completion cannot report a successful release. Regression tests cover the initial idle state and an old send settling after a newer generation has acquired the lock.


The Student Portal treats phone-code confirmation as a single-flight operation. While Firebase is verifying a code, both the Verify and Send OTP controls remain locked, and a second SMS challenge cannot supersede the in-flight confirmation. This avoids racing a new confirmation request against a Firebase operation that may already be establishing the signed-in session. If verification fails, the same current confirmation can be retried after the request settles. Logout or any Auth state transition invalidates the verification generation; a late completion cannot unlock controls or alter a newer session. The behavior is covered by `tests/otp-flow-guard.test.mjs` and remains client-side UX/race protection only; server-side phone-provider and App Check checks remain authoritative.
