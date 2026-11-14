import { Share } from '@capacitor/share';
import { Directory, Filesystem } from '@capacitor/filesystem';

const APK_URL = 'https://github.com/sharerohit111-pixel/railway-mitra/releases/download/android-beta/Railway-Mitra-Android.apk';
const APK_PATH = 'Railway-Mitra-Android.apk';

window.RailwayMitraNativeShare = {
  async shareApk() {
    // Download the release APK directly to the Android app cache.
    const downloaded = await Filesystem.downloadFile({
      url: APK_URL,
      path: APK_PATH,
      directory: Directory.Cache,
      recursive: true
    });

    // downloadFile returns a path; getUri resolves the shareable file:// URI.
    const file = await Filesystem.getUri({
      path: APK_PATH,
      directory: Directory.Cache
    });

    if (!file.uri) {
      throw new Error('Could not resolve the downloaded APK file URI.');
    }

    const info = await Filesystem.stat({
      path: APK_PATH,
      directory: Directory.Cache
    });
    if (!info.size || info.size < 1000000) {
      throw new Error('Downloaded APK is missing or incomplete.');
    }

    return Share.share({
      title: 'Railway Mitra Android App',
      text: 'Railway Mitra Android APK — download and install the attached app.',
      files: [file.uri],
      dialogTitle: 'Share Railway Mitra APK'
    });
  }
};
