# Railway Mitra Android App

This folder is the isolated Android packaging workstream for Railway Mitra.

## Safety boundaries

- The production PWA and public website remain the source of truth.
- Do not change existing calculators, authentication, Firebase rules, CBT/Test Series, or payment flows as part of Android packaging.
- Android-only changes stay in this folder and its dedicated branch.
- Never commit keystores, signing passwords, service-account credentials, or private API secrets.
- Do not enable AdMob until the Android app is built, tested, store-published, and approved for ads.

## Current repository audit

- The repository is a static HTML/CSS/JavaScript PWA deployed from `main` using GitHub Pages.
- The app entry point is `app.html`.
- PWA metadata is in `manifest.json`; the service worker is `service-worker.js`.
- Firebase Authentication is initialized in `assets/js/firebase.js`; `assets/js/auth-guard.js` redirects signed-out users to the login page.
- No existing Capacitor configuration or Android Gradle project was found at the repository root.

## Proposed implementation

Use a dedicated Capacitor Android shell so a native Android project can be built and, after policy review, integrate the Google Mobile Ads SDK without injecting ad code into the PWA. The Android build must bundle the required web assets locally; it must not be a thin remote-URL-only wrapper.

Before generating the permanent Android application ID, confirm the final reverse-domain package name with the owner. The package ID is difficult to change after Play Store publication.

## Planned milestones

1. Confirm app ID, display name, icon, and minimum Android version.
2. Add isolated Capacitor project configuration and a reproducible asset-staging process.
3. Generate the Android project and debug build.
4. Test login, navigation, file downloads, external links, offline behavior, and CBT flows on real devices.
5. Prepare Play Store listing, privacy/data-safety disclosures, and signed Android App Bundle (AAB).
6. Only after publication and AdMob eligibility, integrate and test ads behind a controlled feature flag.

## Status

Planning branch created. No production PWA files or application behavior have been changed by this Android workstream yet.
