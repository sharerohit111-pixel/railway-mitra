import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';

// This bridge only acknowledges a healthy native web bundle. Automatic delivery
// remains disabled until the owner's Capgo app/channel is configured and tested.
if (Capacitor.isNativePlatform()) {
  CapacitorUpdater.notifyAppReady().catch((error) => {
    console.warn('[Railway Mitra] Updater readiness acknowledgement failed:', error);
  });
}

window.RailwayMitraUpdater = Object.freeze({
  isNative: () => Capacitor.isNativePlatform(),
  async getCurrentBundle() {
    if (!Capacitor.isNativePlatform()) return { status: 'web' };
    return CapacitorUpdater.current();
  },
  async resetToLastSuccessful() {
    if (!Capacitor.isNativePlatform()) return false;
    await CapacitorUpdater.reset({ toLastSuccessful: true });
    return true;
  }
});
