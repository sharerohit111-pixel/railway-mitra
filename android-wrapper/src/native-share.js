import { Share } from '@capacitor/share';
import { Directory, Filesystem } from '@capacitor/filesystem';

const APK_URL = 'https://github.com/sharerohit111-pixel/railway-mitra/releases/download/android-beta/Railway-Mitra-Android.apk';

window.RailwayMitraNativeShare = {
  async shareApk() {
    // Download through Capacitor's native filesystem API. A WebView fetch can
    // be blocked by GitHub's cross-origin redirect/CORS policy.
    const saved = await Filesystem.downloadFile({
      url: APK_URL,
      path: 'Railway-Mitra-Android.apk',
      directory: Directory.Cache,
      recursive: true
    });

    if (!saved.uri) {
      throw new Error('APK download completed without a local file URI.');
    }

    const fileInfo = await Filesystem.stat({
      path: 'Railway-Mitra-Android.apk',
      directory: Directory.Cache
    });
    if (!fileInfo.size) {
      throw new Error('Downloaded APK file is empty.');
    }

    return Share.share({
      title: 'Railway Mitra Android App',
      text: 'Railway Mitra Android APK — download and install the attached app.',
      files: [saved.uri],
      dialogTitle: 'Share Railway Mitra APK'
    });
  }
};
