# Student CBT Screen (isolated module)

`exam.html` is the markup fragment, `exam.js` initializes the screen and imports its own CSS. The host must first initialize Firebase Auth, App Check and Functions and authenticate the student by phone OTP.

Example host integration after injecting the HTML fragment into a dedicated container:

```js
import { initStudentCbtExam } from "./exam.js";
initStudentCbtExam({ app: firebaseApp, testId: selectedTestId, root: document });
```

The module provides server-timed countdown, question palette, Previous/Next, answer autosave, and server-side submission. It must not be treated as production-ready until real-device testing, connectivity/retry testing, App Check verification, merged Firestore rules review, owner provisioning and backend deployment are completed.

## Student test catalogue

- `catalogue.html` is the markup fragment and `catalogue.js` initializes the published-test list.
- The host must inject the fragment after phone-OTP sign-in and initialize Firebase App Check/Functions.
- Call `initStudentTestCatalogue({ app, root, onStart })`; the host's `onStart({ test, session })` callback should switch to the CBT exam view. The catalogue claims the configured one-time free attempt and starts that exam on the server.
- Only the configured free-trial test can be started without a paid entitlement. Paid tests remain visibly unavailable until a verified payment-to-entitlement flow is implemented. Other zero-price tests are not automatically free.
- The callable returns published metadata only. It never returns questions or answer keys.
- The module is isolated and is not yet wired into the live Railway Mitra route. Production use still requires auth/App Check integration, Firestore rules review, owner provisioning, deployment approval and real-device testing.
