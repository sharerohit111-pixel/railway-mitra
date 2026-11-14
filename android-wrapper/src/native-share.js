import { Share } from '@capacitor/share';
import { Directory, Filesystem } from '@capacitor/filesystem';

const APK_URL = 'https://github.com/sharerohit111-pixel/railway-mitra/releases/download/android-beta/Railway-Mitra-Android.apk';

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

window.RailwayMitraNativeShare = {
  async shareApk() {
    const response = await fetch(APK_URL, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`APK download failed (HTTP ${response.status}).`);
    }

    const apkBlob = await response.arrayBuffer();
    if (!apkBlob.byteLength) {
      throw new Error('Downloaded APK file is empty.');
    }

    const saved = await Filesystem.writeFile({
      path: 'Railway-Mitra-Android.apk',
      directory: Directory.Cache,
      recursive: true,
      data: toBase64(apkBlob)
    });

    return Share.share({
      title: 'Railway Mitra Android App',
      text: 'Railway Mitra Android APK — download and install the attached app.',
      files: [saved.uri],
      dialogTitle: 'Share Railway Mitra APK'
    });
  }
};
