# Railway Mitra Android App

This folder is the isolated Android packaging workstream for Railway Mitra.

## Safety boundaries

- The production PWA and public website remain the source of truth.
- Do not change existing calculators, authentication, Firebase rules, CBT/Test Series, or payment flows as part of Android packaging.
- Android-only changes stay in this folder and its dedicated branch.
- Never commit keystores, signing passwords, service-account credentials, Capgo API tokens, or private API secrets.
- Do not enable AdMob until the Android app is built, tested, store-published, and approved for ads.

## OTA update architecture

The Android shell uses Capacitor 8 and the matching `@capgo/capacitor-updater` v8 plugin. OTA delivery is limited to the web layer packaged in the Android WebView: HTML, CSS, JavaScript and static assets. It does not replace native Android code, permissions, plugins, or the APK itself.

The updater bridge is built from `src/native-updater.js` and injected by `scripts/prepare-web.mjs` into the staged Android-only copies of `index.html` and `app.html`. The production website files are not modified by this injection.

### Current safe state

- The plugin dependency and native bridge are wired into this isolated branch.
- `CapacitorUpdater.autoUpdate` is deliberately set to `off`.
- No update channel or Capgo app identifier has been configured.
- No live update is being distributed and no user APK is being changed.
- Automatic delivery must remain disabled until the owner creates/configures the Capgo app, supplies the non-secret app identifier, and completes device testing.

### Capgo account setup (owner action required)

The non-secret app identifier is preconfigured as `com.railwaymitra.app`, matching the Android package ID. The default channel is preconfigured as `production`; automatic delivery remains disabled.

1. Create an account at https://capgo.app/register.
2. In `android-wrapper/`, run `npm install`, then `npm run capgo:login`. Enter the API key only in the terminal prompt. Never paste it into chat, source files, commits, or screenshots.
3. Run `npm run capgo:app:add` and `npm run capgo:channel:add`. If the CLI reports the app or channel already exists, verify it belongs to the correct account and continue without deleting anything.
4. Keep `autoUpdate: off` until the test channel passes.
5. Change `autoUpdate` from `off` to `atBackground` only after the test channel passes.
4. Build and install a new signed APK containing the updater plugin. Existing APKs do not contain the native updater and cannot gain it from a web-only bundle.
5. Test fresh install and upgrade paths on physical Android devices: cold start, foreground/background, offline startup, interrupted download, failed bundle rollback, login, navigation, calculator flows, file downloads and CBT entry points.
6. Publish a small test bundle to a private/test channel first. Verify rollback to the last successful bundle before enabling production delivery.
7. Publish to the production channel only after owner approval and a successful staged rollout. For a web-only release, run `npm run build:web` followed by `npm run capgo:bundle:upload` from `android-wrapper/`.

### Release rules

- Web-only HTML/CSS/JS/static asset changes may be delivered as OTA bundles after the bootstrap APK is installed.
- Any change to Capacitor, native plugins, Android permissions, manifest, signing, or native code requires a newly built and distributed APK.
- Never publish a bundle that calls a native plugin/API absent from the installed native binary.
- Keep a known-good bundle available for rollback. Do not bypass bundle signing or integrity checks.
- Keep update checks non-blocking and apply updates at a safe background/restart boundary; do not interrupt an active CBT attempt or form submission.
- Capgo does not guarantee store approval. Keep OTA changes within the app's disclosed purpose and comply with current platform policies.

## Current repository audit

- The repository is a static HTML/CSS/JavaScript PWA deployed from `main`.
- The app entry point is `app.html`; the packaged web directory also includes `index.html`.
- PWA metadata is in `manifest.json`; the service worker is `service-worker.js`.
- Firebase Authentication is initialized in `assets/js/firebase.js`.
- Android packaging stages a local copy using an explicit allowlist. It does not turn the APK into a thin remote-URL-only wrapper.

## Build

From `android-wrapper/`:

```bash
npm install
npm run build:web
npx cap sync android
```

The native Android project must be generated with `npm run cap:add:android` if it does not yet exist. Do not commit signing credentials or local SDK paths.

## Status

OTA integration scaffold added on `feature/android-ota-updates`. It is intentionally inactive pending Capgo app configuration and end-to-end device tests. No production PWA files or CBT/Test Series files are changed by this branch.
