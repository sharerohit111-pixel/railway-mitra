# Student CBT Screen (isolated module)

`exam.html` is the markup fragment, `exam.js` initializes the screen and imports its own CSS. The host must first initialize Firebase Auth, App Check and Functions and authenticate the student by phone OTP.

Example host integration after injecting the HTML fragment into a dedicated container:

```js
import { initStudentCbtExam } from "./exam.js";
initStudentCbtExam({ app: firebaseApp, testId: selectedTestId, root: document });
```

The module provides server-timed countdown, question palette, Previous/Next, answer autosave, and server-side submission. It must not be treated as production-ready until real-device testing, connectivity/retry testing, App Check verification, merged Firestore rules review, owner provisioning and backend deployment are completed.