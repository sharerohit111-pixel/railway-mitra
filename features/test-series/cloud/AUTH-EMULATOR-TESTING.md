# Test Series Auth Emulator test notes

The CBT Auth/Firestore/Functions emulator suite includes a Student OTP-token flow that reads verification-code records from the local Firebase Auth Emulator. It must never contact production Firebase Auth or a carrier SMS gateway.

## Phone-number matching

Auth Emulator responses may represent the same phone number with different punctuation. The test normalizes both the requested number and the emulator record by removing non-digit characters, then compares the resulting digit strings. This is test-fixture matching only; it does not rewrite phone numbers sent to Firebase Auth or alter production sign-in validation.

The focused assertion is in \`tests/cbt-emulator.test.js\`:

\`\`\`sh
node --test --test-name-pattern="Auth Emulator phone matching" features/test-series/cloud/functions/tests/cbt-emulator.test.js
\`\`\`

The full isolated suite remains:

\`\`\`sh
npm --prefix features/test-series/cloud/functions test
\`\`\`

Run that command only under the isolated Test Series Auth, Firestore, Functions and Storage emulator configuration documented in \`README.md\`. Do not point these fixtures at a live Firebase project.

This test-only correction does not send OTPs, create real users, change Firebase configuration, deploy Functions, enable billing or alter App Check enforcement. Synthetic student load tests and capacity benchmarking remain deferred.
