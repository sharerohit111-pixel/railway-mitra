# Railway Mitra Android host

This is the native Android host for the existing Railway Mitra web app.

## Build

Requires JDK 17 and Gradle 8.9:

```sh
cd android
gradle testDebugUnitTest
gradle assembleDebug
```

The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

## GPS foreground service

- The web page starts/stops the native service through the `RailwayMitraNative` bridge.
- The service requires precise location, background location (Android 10+), and notification permission before startup.
- While active, it requests GPS updates at a 5-second / 10-metre interval and stores the latest fix locally on-device.
- Each fix is independently checked against the bundled Lalgarh–Phalodi candidate railway geometry. A successful result is stored only as a **candidate chainage**, together with the cross-track offset and candidate verification status.
- The persistent notification explicitly says the 5 KM alert is disabled.

## Public train-report polling scaffold

- A read-only Appwrite report-feed client exists for the Android foreground service.
- Polling is dormant unless the internal `alert_armed` preference is explicitly true. The current user interface does not set this preference.
- The feed contains only eligible public train movement fields; it does not send device GPS or reporter UIDs.
- Polling is limited to one request every 30 seconds by the client. The server's in-memory per-process IP throttle is best-effort and is not a distributed rate limit.
- Poll results are stored locally for future evaluation. The current service does **not** yet compare consecutive train reports with the user's candidate chainage, and it does **not** generate an audible, vibration, or notification alarm.

## Release and safety status

This is **not yet a production 5 KM train-alert implementation**.

The bundled route is source-derived candidate geometry, not an officially certified operational track. A map match is diagnostic only and must not be used as an alert trigger while the route status remains `NOT_PRODUCTION_VERIFIED`.

The connected Appwrite table `train_movement_reports` still needs the optional `trainNumber` schema migration, followed by a reviewed function deployment and live compatibility checks. The migration instructions are in `appwrite/migrations/2026-11-26-train-identity.md`.

Still required before enabling alerts:

1. Verify the exact operational railway asset and UP/DOWN chainage orientation using authoritative railway records and field/official confirmation.
2. Apply and verify the Appwrite train identity schema migration in an approved maintenance window.
3. Deploy and verify the reviewed Appwrite function source.
4. Implement and test native report-pair evaluation against the map-matched user position, with strict route-status and direction gates.
5. Implement alarm de-duplication, notification/audio/vibration behavior, and stale-feed/GPS fail-closed handling.
6. Test on physical Android devices, including Android 11+ permission flow, battery restrictions, process death, force-stop behavior, notification delivery, and permission revocation.
7. Produce and verify a signed production build.

Android may stop services under force-stop, OEM battery restrictions, or permission revocation. Do not promise operation after force-stop. A debug APK build is not a signed production release.
