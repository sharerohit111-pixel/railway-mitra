# Test Series Functions Emulator App Check boundary

The deployed Test Series callable surface must keep App Check enforcement enabled. The
shared policy in `app-check-policy.js` therefore defaults to
`enforceAppCheck: true` and does not honor a generic `APP_CHECK_ENFORCE=false`
override.

The only bypass is the isolated Firebase Functions Emulator identity:

- `FUNCTIONS_EMULATOR=true`
- `GCLOUD_PROJECT` matches the `demo-...` project pattern
- if Cloud Run-style runtime markers are present, `K_REVISION` must be exactly
  `1`, `K_CONFIGURATION` must be absent, and `K_SERVICE` must identify one
  of this codebase's `rm...` functions
- the function-name marker may be either `rmStartExam` or
  `asia-south1-rmStartExam`, depending on the Firebase CLI/runtime version

A normal deployed Cloud Run revision has a configuration marker and a
non-synthetic revision identifier, so it remains App Check-enforced. Unknown
service names, other regions, extra suffixes, or a configuration marker fail
closed.

This distinction matters because the emulator's callable verifier can report
an authenticated request with no App Check token. That is expected only when
the function is actually running in the isolated demo-project emulator. If the
policy mistakes the emulator's unprefixed function name for a deployed
service, callable tests fail before the handler's Student/Owner authorization
code runs.

Regression coverage lives in:

- `tests/app-check-bootstrap.test.js`
- `tests/student-auth.test.js`

These are local/emulator policy tests only. Do not use demo project IDs or
emulator bypass markers in deployed configuration. No live Firebase setting,
App Check enforcement setting, or deployment is changed by these tests.
