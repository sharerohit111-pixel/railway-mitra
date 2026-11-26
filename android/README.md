# Railway Mitra Android host

This is an initial native Android host for the existing Railway Mitra web app.

## Build
Requires JDK 17 and Gradle 8.9:
```sh
cd android
gradle assembleDebug
```
The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

## GPS service scope
- The web page exposes start/stop controls through the `RailwayMitraNative` JavaScript bridge.
- Starting the service while the activity is visible starts an Android location foreground service and a persistent notification.
- The service stores the latest phone GPS fix locally on-device.
- Stop explicitly from the page to end monitoring.

## Important limitations
This is not yet a 5 km train alert implementation. It does not fetch train reports in the background, project GPS onto the railway track, or calculate approach distance. The alert remains disabled until a verified route geometry and a tested proximity engine exist.

Android background-location permission is declared but the user-grant flow and Android Settings education flow still need implementation and device testing. Android may stop services under force-stop, OEM battery restrictions, or permission revocation. Do not promise operation after force-stop. This project has not yet passed a physical-device test.
