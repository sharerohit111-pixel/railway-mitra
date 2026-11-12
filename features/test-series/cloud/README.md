# Railway Mitra CBT Cloud

See ARCHITECTURE.md for target architecture, data model, budget guardrails and deployment prerequisites.

## Callable functions
- rmClaimFreeAttempt: claims one free test attempt per authenticated UID.
- rmStartExam: creates or resumes a server-timed mock/scheduled attempt.
- rmSaveAnswer: saves a scalar answer only for the authenticated attempt owner.
- rmSubmitExam: scores using private server-side answer keys and records the result.
- rmGetOwnerAdminSession: checks server-configured OWNER_UID and Firebase second-factor claim.

## Firestore rules — review required
`firestore.rules` is a draft, NOT approved for deployment. It includes example employee paths and a default-deny rule that could block existing Railway Mitra collections if deployed as-is. Before any deployment, retrieve the current live Firestore Rules, merge the CBT deny-by-default paths without removing existing permissions, review the complete result, and obtain explicit approval. Do not overwrite production rules with this draft.

## Not production-ready
The existing Firebase project is identified from the repository configuration as `railway-mitra`; this confirms the project ID configured in code, not the live console state or billing status. No functions have been deployed and no live student UI is connected. Do not run paid deployment or real SMS until the user explicitly approves the cost.


## App Check verification (web/PWA)
1. Confirm the Firebase Console App Check app entry shows **Railway Mitra Web — Registered** with Fraud Defense.
2. Deploy this branch to a staging URL or merge it only after review; GitHub Pages on the default branch will not serve branch-only changes automatically.
3. Open `features/test-series/cloud/app-check-test.html` on one of the registered/authorized domains and tap **App Check जाँचें**.
4. A success message means the client obtained an App Check token. It does not mean callable functions are deployed or that enforcement is enabled.
5. Keep App Check enforcement OFF until the app has been tested on Android/PWA and every Firebase client entry point is confirmed to initialize App Check.

App Check is initialized only by `firebase-app-check-init.js` inside the isolated CBT module; the existing `assets/js/firebase.js` is intentionally unchanged to avoid disturbing other app features. The site key in `app-check.js` is a public web site key, not a private service-account secret. Never put service-account credentials or private keys in browser code.


## Isolated Functions codebase
The root `firebase.json` now declares two codebases:
- `default` → existing `functions/` (left unchanged)
- `test-series` → `features/test-series/cloud/functions/`

After staging configuration and explicit billing approval, deploy only the CBT backend with:

```bash
firebase deploy --only functions:test-series
```

Install dependencies for local validation from `features/test-series/cloud/functions/` with `npm install`. GitHub Actions also checks the isolated codebase configuration and JavaScript syntax. This does not deploy anything.

**Important:** The existing project may require the Blaze plan for Cloud Functions deployment. Do not upgrade or deploy until the projected cost and budget are approved. The ₹500 target cannot be guaranteed for 500 simultaneous exam users.
